/* Almacenamiento: IndexedDB (cientos de MB) con migración desde localStorage (≈5 MB).
   Si el navegador no tiene IndexedDB, se sigue usando localStorage. */

const KEY = 'plantas.v1';
const DB_NAME = 'plantas';
const STORE = 'kv';
const REC = 'state';

export const defaultState = () => ({
  plants: [],
  settings: { hour: 9, minute: 0 },
  nextNid: 1,
  place: null, // { name, lat, lon }
  climate: null, // resumen del pronóstico (ver summarizeClimate)
  keys: { plantnet: '', gemini: '', geminiModel: '' }, // se guarda solo en el celular, nunca en el repo
  lastBackup: null, // ISO del último respaldo guardado
  species: {}, // base offline: { [nombre científico]: { sci, names, care, wiki, wikiTried, addedAt } }
});

function normalize(d) {
  const base = defaultState();
  if (!d || typeof d !== 'object') return base;
  return {
    ...base,
    ...d,
    plants: Array.isArray(d.plants) ? d.plants : [],
    settings: { ...base.settings, ...(d.settings || {}) },
    keys: { ...base.keys, ...(d.keys || {}) },
    species: d.species && typeof d.species === 'object' ? d.species : {},
    nextNid: d.nextNid || 1,
  };
}

function readLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* ---------- IndexedDB ---------- */

const hasIDB = () => typeof indexedDB !== 'undefined' && indexedDB !== null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
}

const idbGet = (db) =>
  new Promise((resolve, reject) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(REC);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const idbSet = (db, value) =>
  new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, REC);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('abort'));
  });

let backend = 'local'; // 'idb' | 'local'
let db = null;
let pending = null;
let timer = null;
let onError = null;

export const storageBackend = () => backend;
export const setSaveErrorHandler = (fn) => {
  onError = fn;
};

/** Carga los datos. Si todavía están en localStorage, los pasa a IndexedDB y verifica antes de borrar el original. */
export async function loadAsync() {
  if (!hasIDB()) return normalize(readLocal());
  try {
    db = await openDb();
    const rec = await idbGet(db);
    backend = 'idb';
    if (rec) return normalize(rec);
    const old = readLocal();
    if (!old) return defaultState();
    await idbSet(db, old);
    const back = await idbGet(db);
    if (back && JSON.stringify(back) === JSON.stringify(old)) {
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* no pasa nada: el original queda como respaldo */
      }
    }
    return normalize(back || old);
  } catch {
    backend = 'local';
    return normalize(readLocal());
  }
}

/** Carga síncrona desde localStorage (solo para el modo sin IndexedDB y para tests). */
export const load = () => normalize(readLocal());

async function flush() {
  clearTimeout(timer);
  timer = null;
  if (!pending || !db) return;
  const snapshot = pending;
  pending = null;
  try {
    await idbSet(db, snapshot);
  } catch (e) {
    onError?.(e);
  }
}

export const flushNow = () => flush();

/** Programa el guardado (IndexedDB, en 120 ms) o guarda directo (localStorage). Devuelve false si falló al instante. */
export function save(state) {
  if (backend === 'idb' && db) {
    pending = state;
    if (!timer) timer = setTimeout(flush, 120);
    return true;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
