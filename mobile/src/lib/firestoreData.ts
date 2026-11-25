/**
 * Firestore returns server-written dates (serverTimestamp()) as Timestamp objects, but the app's
 * screens treat every date as an ISO string (createdAt.split('T')[0], new Date(x), x.slice(...)).
 * A single Timestamp reaching one of those calls throws and closes the app on Android, e.g. when
 * opening Notifications, because the server writes notifications with serverTimestamp().
 *
 * normalizeFirestoreData converts Timestamp-like values (real Timestamps and the plain
 * {seconds, nanoseconds} shape they take after being serialised) to ISO strings so every screen
 * always sees the shape it expects.
 */
const isPlainObject = (v: any): boolean => {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

export const normalizeFirestoreValue = (value: any, depth = 0): any => {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (depth > 12) return value;

  if (typeof value.toDate === 'function') {
    try {
      const d: Date = value.toDate();
      return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    } catch {
      return null;
    }
  }

  if (Array.isArray(value)) return value.map((v) => normalizeFirestoreValue(v, depth + 1));
  if (!isPlainObject(value)) return value; // DocumentReference, GeoPoint, Bytes, ...

  const keys = Object.keys(value);
  const secs = value.seconds ?? value._seconds;
  const nanos = value.nanoseconds ?? value._nanoseconds;
  if (keys.length === 2 && typeof secs === 'number' && typeof nanos === 'number') {
    const d = new Date(secs * 1000 + Math.floor(nanos / 1e6));
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }

  const out: Record<string, any> = {};
  for (const k of keys) out[k] = normalizeFirestoreValue(value[k], depth + 1);
  return out;
};

export const normalizeFirestoreData = <T = any>(data: T): T => normalizeFirestoreValue(data) as T;

/** Safe replacement for snapshot.data(): never returns Timestamp objects. */
export const docData = (snap: { data: () => any }): any => normalizeFirestoreValue(snap.data());
