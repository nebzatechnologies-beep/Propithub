import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

// Safely resolve expo-notifications to prevent crash in Expo Go where native module is omitted
let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
} catch (loadErr) {
  console.log('[Notifications] expo-notifications native module not present in current environment');
}

// Configure how notifications are displayed when received in the foreground
try {
  if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }
} catch (handlerErr) {
  console.log('[Notifications] Foreground handler setup bypassed:', handlerErr);
}

export interface PushTokenResult {
  token: string | null;
  apnsToken?: string | null;
  platform: string;
  error?: string;
}

/**
 * Registers device for push notifications (APNs on iOS, FCM on Android),
 * creates high-priority notification channels on Android,
 * and saves the push token to the user document in Firestore.
 */
export async function registerForPushNotificationsAsync(userId?: string): Promise<string | null> {
  if (Platform.OS === 'web' || !Notifications) {
    return null;
  }

  // Set up Android notification channels
  if (Platform.OS === 'android') {
    try {
      if (Notifications.setNotificationChannelAsync) {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'General Notifications',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#4f46e5',
          enableLights: true,
          enableVibrate: true,
        });

        await Notifications.setNotificationChannelAsync('leases_payments', {
          name: 'Leases & Payments',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'default',
          vibrationPattern: [0, 300, 200, 300],
          lightColor: '#10b981',
          enableLights: true,
          enableVibrate: true,
        });

        await Notifications.setNotificationChannelAsync('maintenance_urgents', {
          name: 'Urgent Maintenance',
          importance: Notifications.AndroidImportance.MAX,
          sound: 'default',
          vibrationPattern: [0, 500, 200, 500],
          lightColor: '#ef4444',
          enableLights: true,
          enableVibrate: true,
        });
      }
    } catch (chanErr) {
      console.warn('[PushNotifications] Channel setup note:', chanErr);
    }
  }

  try {
    if (!Device?.isDevice) {
      console.log('[PushNotifications] Physical device required for push notifications.');
      return null;
    }
  } catch (_e) {
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[PushNotifications] Push notification permission not granted.');
      return null;
    }

    // Fetch the Expo push token
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId: '42573962-ad60-49c1-825a-994d52e57d4c',
    });
    const token = tokenResponse?.data || null;

    // Also get native APNs/FCM device token if available
    let devicePushToken: string | null = null;
    try {
      const rawDeviceToken = await Notifications.getDevicePushTokenAsync();
      devicePushToken = typeof rawDeviceToken?.data === 'string' ? rawDeviceToken.data : JSON.stringify(rawDeviceToken?.data);
    } catch (_e) {
      // Non-fatal, Expo push token is sufficient for multiplatform dispatch
    }

    // If a logged-in userId was provided, persist to Firestore
    if (userId && token) {
      try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
          pushToken: token,
          devicePushToken: devicePushToken || null,
          pushTokenPlatform: Platform.OS,
          pushTokenUpdatedAt: new Date().toISOString(),
        }).catch(async (err: any) => {
          if (err?.code === 'not-found') {
            await setDoc(
              userRef,
              {
                pushToken: token,
                devicePushToken: devicePushToken || null,
                pushTokenPlatform: Platform.OS,
                pushTokenUpdatedAt: new Date().toISOString(),
              },
              { merge: true }
            );
          }
        });
        console.log('[PushNotifications] Synced push token to Firestore for user:', userId);
      } catch (err) {
        console.warn('[PushNotifications] Failed to persist push token to Firestore:', err);
      }
    }

    return token;
  } catch (error) {
    console.warn('[PushNotifications] Registration note:', error);
    return null;
  }
}

/**
 * Dispatches an immediate local notification (useful for instant native in-app alerts).
 */
export async function sendLocalNotification(title: string, body: string, data: Record<string, any> = {}) {
  if (Platform.OS === 'web' || !Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: null,
    });
  } catch (err) {
    console.warn('[PushNotifications] Failed to schedule local notification:', err);
  }
}

/**
 * Schedules a local OS background push notification for a specific date and time (e.g. 9:00 AM).
 */
export async function scheduleDeviceReminderAsync(
  id: string,
  title: string,
  body: string,
  scheduledDate: Date,
  data: Record<string, any> = {}
): Promise<string | null> {
  if (Platform.OS === 'web' || !Notifications) return null;

  try {
    if (scheduledDate.getTime() <= Date.now()) {
      return null;
    }

    try {
      if (Notifications.cancelScheduledNotificationAsync) {
        await Notifications.cancelScheduledNotificationAsync(id);
      }
    } catch (_cErr) {}

    const scheduledId = await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title,
        body,
        data,
        sound: true,
        badge: 1,
      },
      trigger: {
        date: scheduledDate,
      } as any,
    });

    return scheduledId;
  } catch (err) {
    console.warn('[PushNotifications] Failed to schedule device reminder:', err);
    return null;
  }
}

/**
 * Automatically synchronizes device-level background local push notifications
 * for upcoming rent dues, scheduled walkthrough inspections, and expiring leases.
 */
export async function syncDeviceRemindersAsync(
  reminders: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    dueDate?: string;
    unitNumber?: string;
    amount?: number;
    currency?: string;
  }>
) {
  if (Platform.OS === 'web' || !Notifications) return;

  try {
    for (const rem of reminders) {
      if (!rem.dueDate) continue;

      const dueDateTime = new Date(rem.dueDate).getTime();
      if (isNaN(dueDateTime)) continue;

      // 1. Rent due: schedule 2 days before at 9:00 AM
      if (rem.category === 'rent') {
        const notifyDate = new Date(dueDateTime);
        notifyDate.setDate(notifyDate.getDate() - 2);
        notifyDate.setHours(9, 0, 0, 0);

        if (notifyDate.getTime() > Date.now()) {
          await scheduleDeviceReminderAsync(
            `reminder_${rem.id}`,
            `📅 Rent Reminder: Unit ${rem.unitNumber || 'Residence'}`,
            `Your rent of ${rem.currency || ''}${rem.amount?.toLocaleString() || ''} is due on ${rem.dueDate}. Tap to pay online.`,
            notifyDate,
            { screen: 'tenant_payments', reminderId: rem.id }
          );
        }
      }

      // 2. Move-out walkthrough: schedule 24h before at 9:00 AM
      if (rem.category === 'occupancy') {
        const notifyDate = new Date(dueDateTime);
        notifyDate.setDate(notifyDate.getDate() - 1);
        notifyDate.setHours(9, 0, 0, 0);

        if (notifyDate.getTime() > Date.now()) {
          await scheduleDeviceReminderAsync(
            `reminder_${rem.id}`,
            `📋 Walkthrough Inspection Tomorrow: Unit ${rem.unitNumber || ''}`,
            rem.description,
            notifyDate,
            { screen: 'tenant_lease', reminderId: rem.id }
          );
        }
      }

      // 3. Lease expiry: schedule 15 days before at 10:00 AM
      if (rem.category === 'lease') {
        const notifyDate = new Date(dueDateTime);
        notifyDate.setDate(notifyDate.getDate() - 15);
        notifyDate.setHours(10, 0, 0, 0);

        if (notifyDate.getTime() > Date.now()) {
          await scheduleDeviceReminderAsync(
            `reminder_${rem.id}`,
            `📝 Lease Expiry Notice: Unit ${rem.unitNumber || ''}`,
            `Your lease concludes on ${rem.dueDate}. Tap to review renewal or extension options.`,
            notifyDate,
            { screen: 'tenant_lease', reminderId: rem.id }
          );
        }
      }
    }
  } catch (syncErr) {
    console.warn('[PushNotifications] syncDeviceRemindersAsync note:', syncErr);
  }
}

