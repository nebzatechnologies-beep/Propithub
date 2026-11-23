// In-memory Firebase stand-in used ONLY by the demo/simulator build (EXPO_PUBLIC_DEMO_BACKEND=1).
// Data persists in the browser's localStorage so refreshes keep the demo state.

type Doc = Record<string, any>;
type Listener = () => void;

const KEY = 'propithub-demo-db-v1';
const collections: Record<string, Record<string, Doc>> = {};
const listeners: Record<string, Set<Listener>> = {};

const hasLS = () => {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
};

const persist = () => {
  if (!hasLS()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(collections));
  } catch {}
};

const load = () => {
  if (!hasLS()) return;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(collections, JSON.parse(raw));
  } catch {}
};
load();

export const genId = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);

export const getCollection = (name: string) => (collections[name] ||= {});

export const notify = (name: string) => {
  persist();
  (listeners[name] || new Set()).forEach((l) => {
    try {
      l();
    } catch {}
  });
};

export const subscribe = (name: string, l: Listener) => {
  (listeners[name] ||= new Set()).add(l);
  return () => listeners[name]?.delete(l);
};

export const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

const isPlainObject = (v: any) => v && typeof v === 'object' && !Array.isArray(v);

export const mergeDeep = (target: Doc, patch: Doc): Doc => {
  const out: Doc = { ...target };
  Object.keys(patch).forEach((k) => {
    if (patch[k] === undefined) return;
    out[k] = isPlainObject(patch[k]) && isPlainObject(out[k]) ? mergeDeep(out[k], patch[k]) : clone(patch[k]);
  });
  return out;
};

export const setPath = (obj: Doc, path: string, value: any) => {
  const parts = path.split('.');
  let cur = obj;
  parts.slice(0, -1).forEach((p) => {
    if (!isPlainObject(cur[p])) cur[p] = {};
    cur = cur[p];
  });
  cur[parts[parts.length - 1]] = clone(value);
};

export const getPath = (obj: Doc, path: string) =>
  path.split('.').reduce((acc: any, p) => (acc == null ? undefined : acc[p]), obj);

// ── Auth registry ─────────────────────────────────────────────────────────
const AUTH_KEY = 'propithub-demo-auth-v1';
export interface DemoAccount {
  uid: string;
  email: string;
  password: string;
}
const accounts: DemoAccount[] = [];
let currentUid: string | null = null;
try {
  if (hasLS()) {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      accounts.push(...(parsed.accounts || []));
      currentUid = parsed.currentUid || null;
    }
  }
} catch {}

const saveAuth = () => {
  if (!hasLS()) return;
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify({ accounts, currentUid }));
  } catch {}
};

const authListeners = new Set<(u: any) => void>();
const toUser = (a: DemoAccount | undefined) =>
  a ? { uid: a.uid, email: a.email, displayName: null, emailVerified: true } : null;

export const authApi = {
  accounts,
  current: () => toUser(accounts.find((a) => a.uid === currentUid)),
  setCurrent(uid: string | null) {
    currentUid = uid;
    saveAuth();
    const u = authApi.current();
    authListeners.forEach((l) => l(u));
  },
  create(email: string, password: string) {
    if (accounts.some((a) => a.email.toLowerCase() === email.toLowerCase())) {
      const err: any = new Error('Firebase: Error (auth/email-already-in-use).');
      err.code = 'auth/email-already-in-use';
      throw err;
    }
    const acc = { uid: 'u_' + genId(), email, password };
    accounts.push(acc);
    saveAuth();
    return acc;
  },
  find: (email: string) => accounts.find((a) => a.email.toLowerCase() === email.toLowerCase()),
  onChange(l: (u: any) => void) {
    authListeners.add(l);
    return () => authListeners.delete(l);
  },
};

export const resetDemo = () => {
  Object.keys(collections).forEach((k) => delete collections[k]);
  accounts.length = 0;
  currentUid = null;
  if (hasLS()) {
    localStorage.removeItem(KEY);
    localStorage.removeItem(AUTH_KEY);
  }
};

// ── Seed: one owner login so the simulator opens straight into a usable account ─
export const DEMO_OWNER = { email: 'owner@demo.propithub', password: 'demo1234' };
if (accounts.length === 0) {
  const acc = authApi.create(DEMO_OWNER.email, DEMO_OWNER.password);
  getCollection('users')[acc.uid] = {
    email: acc.email,
    displayName: 'Demo Owner',
    role: 'owner',
    plan: 'starter',
    phone: '+91 98765 43210',
    hasCompletedTour: true,
    createdAt: new Date().toISOString(),
  };
  persist();
}
