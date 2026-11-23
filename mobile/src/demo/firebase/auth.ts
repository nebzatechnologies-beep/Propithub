import { authApi } from './store';

const makeAuth = () => ({
  get currentUser() {
    return authApi.current();
  },
});
const singleton = makeAuth();

export const inMemoryPersistence = {};
export const getReactNativePersistence = () => ({});
export const initializeAuth = (app: any, _opts?: any) =>
  !app || app.name === '[DEFAULT]' ? singleton : makeAuth();
export const getAuth = (_app?: any) => singleton;

export const signInWithEmailAndPassword = async (_auth: any, email: string, password: string) => {
  const acc = authApi.find(email);
  if (!acc || acc.password !== password) {
    const err: any = new Error('Firebase: Error (auth/invalid-credential).');
    err.code = 'auth/invalid-credential';
    throw err;
  }
  authApi.setCurrent(acc.uid);
  return { user: authApi.current() };
};

export const createUserWithEmailAndPassword = async (a: any, email: string, password: string) => {
  const acc = authApi.create(email, password);
  // Secondary-app creation (used when owners add tenants) must not switch the active session.
  if (a !== singleton) return { user: { uid: acc.uid, email: acc.email } };
  authApi.setCurrent(acc.uid);
  return { user: authApi.current() };
};

export const signOut = async (a?: any) => {
  if (a && a !== singleton) return;
  authApi.setCurrent(null);
};

export const onAuthStateChanged = (_auth: any, cb: (u: any) => void) => {
  setTimeout(() => cb(authApi.current()), 0);
  return authApi.onChange(cb);
};

export const sendPasswordResetEmail = async () => {};
export const updatePassword = async (user: any, pw: string) => {
  const acc = authApi.accounts.find((x) => x.uid === user?.uid);
  if (acc) acc.password = pw;
};
export const reauthenticateWithCredential = async (user: any, cred: any) => {
  const acc = authApi.accounts.find((x) => x.uid === user?.uid);
  if (!acc || acc.password !== cred?.password) {
    const err: any = new Error('Firebase: Error (auth/wrong-password).');
    err.code = 'auth/wrong-password';
    throw err;
  }
};
export const EmailAuthProvider = {
  credential: (email: string, password: string) => ({ email, password }),
};
export type User = any;
