import { clone, genId, getCollection, getPath, mergeDeep, notify, setPath, subscribe } from './store';

export const initializeFirestore = (_app: any, _opts?: any) => ({ __fake: true });
export const getFirestore = initializeFirestore;

interface ColRef { __kind: 'col'; path: string }
interface DocRef { __kind: 'doc'; col: string; id: string; path: string }

export const collection = (_db: any, path: string, ...rest: string[]): ColRef => ({
  __kind: 'col',
  path: [path, ...rest].join('/'),
});

export const doc = (base: any, ...segments: string[]): DocRef => {
  if (base?.__kind === 'col') {
    const id = segments[0] || genId();
    return { __kind: 'doc', col: base.path, id, path: `${base.path}/${id}` };
  }
  const parts = segments.join('/').split('/').filter(Boolean);
  const id = parts.pop() as string;
  const col = parts.join('/');
  return { __kind: 'doc', col, id, path: `${col}/${id}` };
};

const makeDocSnap = (col: string, id: string) => {
  const data = getCollection(col)[id];
  return {
    id,
    ref: { __kind: 'doc', col, id, path: `${col}/${id}` },
    exists: () => data !== undefined,
    data: () => (data === undefined ? undefined : clone(data)),
    get: (f: string) => getPath(data || {}, f),
  };
};

interface Constraint { field: string; op: string; value: any }
export const where = (field: string, op: string, value: any): Constraint => ({ field, op, value });
export const orderBy = (field: string, dir?: string) => ({ __order: field, dir });
export const limit = (n: number) => ({ __limit: n });
export const query = (col: ColRef, ...constraints: any[]) => ({ ...col, constraints });

const matches = (data: any, c: Constraint) => {
  const v = getPath(data, c.field);
  switch (c.op) {
    case '==': return v === c.value;
    case '!=': return v !== c.value;
    case 'in': return Array.isArray(c.value) && c.value.includes(v);
    case 'array-contains': return Array.isArray(v) && v.includes(c.value);
    case '>': return v > c.value;
    case '>=': return v >= c.value;
    case '<': return v < c.value;
    case '<=': return v <= c.value;
    default: return true;
  }
};

const makeQuerySnap = (q: any) => {
  const rows = Object.entries(getCollection(q.path))
    .filter(([, d]) => (q.constraints || []).every((c: any) => !c.field || matches(d, c)))
    .map(([id]) => makeDocSnap(q.path, id));
  return {
    docs: rows,
    size: rows.length,
    empty: rows.length === 0,
    forEach: (fn: (d: any) => void) => rows.forEach(fn),
    docChanges: () => [],
  };
};

export const getDoc = async (ref: DocRef) => makeDocSnap(ref.col, ref.id);
export const getDocs = async (q: any) => makeQuerySnap(q);

export const onSnapshot = (target: any, next: (s: any) => void, _err?: (e: any) => void) => {
  const name = target.__kind === 'doc' ? target.col : target.path;
  const emit = () => {
    next(target.__kind === 'doc' ? makeDocSnap(target.col, target.id) : makeQuerySnap(target));
  };
  const off = subscribe(name, emit);
  setTimeout(emit, 0);
  return off;
};

export const setDoc = async (ref: DocRef, data: any, opts?: { merge?: boolean }) => {
  const col = getCollection(ref.col);
  col[ref.id] = opts?.merge && col[ref.id] ? mergeDeep(col[ref.id], data) : mergeDeep({}, data);
  notify(ref.col);
};

export const updateDoc = async (ref: DocRef, data: any) => {
  const col = getCollection(ref.col);
  const cur = clone(col[ref.id] || {});
  Object.keys(data).forEach((k) => {
    if (data[k] === undefined) return;
    if (k.includes('.')) setPath(cur, k, data[k]);
    else cur[k] = clone(data[k]);
  });
  col[ref.id] = cur;
  notify(ref.col);
};

export const deleteDoc = async (ref: DocRef) => {
  delete getCollection(ref.col)[ref.id];
  notify(ref.col);
};

export const addDoc = async (c: ColRef, data: any) => {
  const ref = doc(c);
  await setDoc(ref, data);
  return ref;
};

export const serverTimestamp = () => new Date().toISOString();
export const arrayUnion = (...v: any[]) => v;
export const arrayRemove = (...v: any[]) => v;
export const increment = (n: number) => n;
export const writeBatch = () => {
  const ops: Array<() => Promise<void>> = [];
  return {
    set: (r: DocRef, d: any, o?: any) => ops.push(() => setDoc(r, d, o)),
    update: (r: DocRef, d: any) => ops.push(() => updateDoc(r, d)),
    delete: (r: DocRef) => ops.push(() => deleteDoc(r)),
    commit: async () => { for (const op of ops) await op(); },
  };
};
export const Timestamp = { now: () => ({ toDate: () => new Date() }), fromDate: (d: Date) => ({ toDate: () => d }) };
