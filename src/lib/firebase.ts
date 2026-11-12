import { initializeApp, getApps, getApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { getAnalytics, isSupported } from 'firebase/analytics';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.apiKey !== 'your-api-key-here'
);

// Purge any runaway / bloated firestore mutations stored in localStorage from prior sessions
// to prevent QuotaExceededError in WebStorageSharedClientState (Firestore assertion ID: b815).
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('firestore_mutations_') || k.startsWith('firestore_clients_') || k.startsWith('firestore_'))) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch (_) {}
    });
  } catch (_) {}

  // Safety patch for localStorage.setItem to prevent QuotaExceededError from crashing Firestore multi-tab client
  if (window.Storage && !(Storage.prototype as any).__quotaPatched) {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      try {
        return originalSetItem.apply(this, [key, value]);
      } catch (err: any) {
        if (
          err &&
          (err.name === 'QuotaExceededError' ||
            err.code === 22 ||
            err.code === 1014 ||
            /quota/i.test(err.message || ''))
        ) {
          try {
            const purgeKeys: string[] = [];
            for (let i = 0; i < this.length; i++) {
              const k = this.key(i);
              if (k && (k.startsWith('firestore_mutations_') || k.startsWith('firestore_clients_'))) {
                purgeKeys.push(k);
              }
            }
            purgeKeys.forEach((k) => this.removeItem(k));
            return originalSetItem.apply(this, [key, value]);
          } catch (_) {
            return;
          }
        }
        throw err;
      }
    };
    (Storage.prototype as any).__quotaPatched = true;
  }
}

// Initialize Firebase once
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  // IndexedDB-backed cache shared across tabs; falls back to memory where IndexedDB is unavailable (SSR, private mode)
  localCache:
    typeof window !== 'undefined' && 'indexedDB' in window
      ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      : memoryLocalCache(),
});
export const storage = getStorage(app);
export const functions = getFunctions(app);

export let analytics: any = null;
if (typeof window !== 'undefined' && isFirebaseConfigured) {
  isSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {});
}

/**
 * Creates a new Firebase Auth user account using a temporary secondary app instance.
 * This guarantees the active user's session (e.g., the owner) is never signed out.
 */
export const createSecondaryAuthUser = async (email: string, password: string): Promise<string> => {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase is not configured');
  }
  const secondaryAppName = `SecondaryApp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  try {
    const secondaryAuth = getAuth(secondaryApp);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;
    await signOut(secondaryAuth);
    await deleteApp(secondaryApp);
    return uid;
  } catch (err) {
    try {
      await deleteApp(secondaryApp);
    } catch (_) {}
    throw err;
  }
};


