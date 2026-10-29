import { initializeApp, getApps, getApp, deleteApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
// @ts-ignore - Exported by firebase/auth in the React Native runtime bundle
import { getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

export const firebaseConfig = {
  apiKey: 'AIzaSyCzvHKm7gU3SgzsmYg0u6dbq1g3H36LtvM',
  authDomain: 'propithub.firebaseapp.com',
  projectId: 'propithub',
  storageBucket: 'propithub.firebasestorage.app',
  messagingSenderId: '1070308411122',
  appId: '1:1070308411122:web:d0fba4065aeaebae68b26b',
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.apiKey !== 'your-api-key-here'
);

// Initialize Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Auth with native AsyncStorage persistence
export const auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (_e) {
    return getAuth(app);
  }
})();
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
});
export const storage = getStorage(app);
export const functions = getFunctions(app);

/**
 * Creates a new Firebase Auth user account using a temporary secondary app instance.
 * This guarantees the active user's session (e.g., the owner) is never signed out.
 */
export const createSecondaryAuthUser = async (email: string, password: string): Promise<string> => {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase is not configured');
  }
  const secondaryAppName = `SecondaryMobileApp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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

