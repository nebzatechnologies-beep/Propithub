import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { ScreenStatusBar } from '../components/ScreenStatusBar';
import { useMobileAppData } from '../context/MobileAppDataContext';
import { useMobileAuth } from '../context/MobileAuthContext';

import { useMobileTheme } from '../context/MobileThemeContext';

export const NotificationsCenterScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { colors, isDark } = useMobileTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { state, markNotificationRead, markAllNotificationsRead } = useMobileAppData();
  const { user } = useMobileAuth();
  const [filter, setFilter] = useState<'all' | 'bills' | 'repairs' | 'leases'>('all');
  const userId = user?.id || '';

  const myNotifications = useMemo(() => {
    if (!userId) return [];
    return (state.notifications || []).filter(
      (n) =>
        n.userId === userId ||
        n.recipientId === userId ||
        (n as any).ownerId === userId
    );
  }, [state.notifications, userId]);

  const filteredNotifications = myNotifications.filter((n) => {
    if (filter === 'all') return true;
    return n.category === filter;
  });

  const unreadCount = myNotifications.filter((n) => !n.isRead).length;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* StatusBar managed globally */}

      {/* Real Screen Status Bar */}
      <ScreenStatusBar />

      {/* Screen Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={onBack} style={[styles.backBtn, { backgroundColor: isDark ? colors.card : '#F1F5F9' }]} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={colors.navy} />
          </TouchableOpacity>
          <View style={styles.logoBadge}>
            <Feather name="bell" size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.navy }]}>Notifications</Text>
            <Text style={[styles.headerSub, { color: colors.inkSoft }]}>
              {unreadCount > 0 ? `${unreadCount} Unread alerts` : 'All caught up'}
            </Text>
          </View>
        </View>

        {unreadCount > 0 && (
          <TouchableOpacity
            style={[styles.markAllBtn, { backgroundColor: isDark ? colors.card : '#F1F5F9' }]}
            onPress={markAllNotificationsRead}
            activeOpacity={0.8}
          >
            <Text style={[styles.markAllBtnText, { color: colors.navy }]}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Category Filter Pills */}
        <View style={styles.filterRow}>
          {(['all', 'bills', 'repairs', 'leases'] as const).map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.filterPill, { backgroundColor: colors.surface, borderColor: colors.line }, filter === cat && styles.filterPillActive]}
              onPress={() => setFilter(cat)}
            >
              <Text style={[styles.filterPillText, { color: colors.inkSoft }, filter === cat && styles.filterPillTextActive]}>
                {cat.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {filteredNotifications.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Ionicons name="notifications-off-outline" size={44} color={colors.inkSoft} />
            <Text style={[styles.emptyTitle, { color: colors.navy }]}>No Notifications</Text>
            <Text style={[styles.emptySub, { color: colors.inkSoft }]}>You have no alerts in this category.</Text>
          </View>
        ) : (
          filteredNotifications.map((notif) => (
            <TouchableOpacity
              key={notif.id}
              style={[
                styles.notifCard,
                { backgroundColor: colors.surface, borderColor: colors.line },
                !notif.isRead && [styles.notifCardUnread, isDark && { backgroundColor: '#10B98115' }],
              ]}
              onPress={() => markNotificationRead(notif.id)}
              activeOpacity={0.85}
            >
              <View style={[styles.notifIconBox, { backgroundColor: isDark ? colors.card : '#F1F5F9' }]}>
                <Ionicons
                  name={
                    notif.category === 'bills'
                      ? 'card-outline'
                      : notif.category === 'repairs'
                        ? 'construct-outline'
                        : notif.category === 'leases'
                          ? 'document-text-outline'
                          : 'information-circle-outline'
                  }
                  size={20}
                  color={!notif.isRead ? '#10B981' : colors.inkSoft}
                />
              </View>

              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={styles.notifTop}>
                  <Text style={[styles.notifTitle, { color: colors.navy }, !notif.isRead && styles.notifTitleBold]}>
                    {notif.title}
                  </Text>
                  {!notif.isRead && <View style={styles.unreadDot} />}
                </View>
                <Text style={[styles.notifBody, { color: colors.inkSoft }]}>{notif.body}</Text>
                <Text style={[styles.notifTime, { color: colors.inkSoft }]}>{notif.createdAt.split('T')[0]}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    logoBadge: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: '#10B981',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.navy,
    },
    headerSub: {
      fontSize: 11,
      color: colors.inkSoft,
    },
    markAllBtn: {
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 6,
    },
    markAllBtnText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.navy,
    },
    scroll: {
      flex: 1,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    filterRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
    },
    filterPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    filterPillActive: {
      backgroundColor: '#10B981',
      borderColor: '#10B981',
    },
    filterPillText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.inkSoft,
    },
    filterPillTextActive: {
      color: '#FFFFFF',
    },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 40,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.line,
      marginTop: 20,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.navy,
      marginTop: 10,
    },
    emptySub: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 4,
    },
    notifCard: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.line,
      marginBottom: 10,
    },
    notifCardUnread: {
      borderLeftWidth: 4,
      borderLeftColor: '#10B981',
      backgroundColor: '#FAFCFF',
    },
    notifIconBox: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? colors.surfaceSunken : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    notifTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    notifTitle: {
      fontSize: 13,
      color: colors.navy,
    },
    notifTitleBold: {
      fontWeight: '700',
      color: colors.navy,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#10B981',
    },
    notifBody: {
      fontSize: 12,
      color: colors.inkSoft,
      marginTop: 2,
      lineHeight: 16,
    },
    notifTime: {
      fontSize: 10,
      color: colors.inkMuted,
      marginTop: 4,
    },
  });
