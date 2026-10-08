// IndexedDB: otevření databáze, migrace schématu a jednoduché operace.
//
// Každá změna schématu = nová položka v MIGRATIONS. Verze databáze je délka
// tohoto pole, migrace se spouštějí postupně od verze, kterou má uživatel.
// Data uživatele se nikdy nemažou, jen se doplňují nové sklady a indexy.
//
// Tenhle soubor používá jen datová vrstva (js/store.js, js/sync.js, js/auth.js).
// Pohledy (js/views) sem nesahají.

const DB_NAME = 'home';

const MIGRATIONS = [
  // v1: nákupní seznam, historie nakupovaných věcí, nastavení
  (db) => {
    db.createObjectStore('meta', { keyPath: 'key' });
    db.createObjectStore('items', { keyPath: 'id' });
    db.createObjectStore('history', { keyPath: 'key' });
  },
  // v2: fronta změn čekajících na odeslání do Supabase (js/sync.js)
  (db) => {
    db.createObjectStore('outbox', { keyPath: 'k' });
  },
  // v3: úkoly a pravidelné platby
  (db) => {
    db.createObjectStore('tasks', { keyPath: 'id' });
    db.createObjectStore('payments', { keyPath: 'id' });
  },
  // v4: obchody (pořadí kategorií nákupu)
  (db) => {
    db.createObjectStore('shops', { keyPath: 'key' });
  },
  // v5: komentáře k úkolům
  (db) => {
    db.createObjectStore('comments', { keyPath: 'id' });
  },
  // v6: recepty
  (db) => {
    db.createObjectStore('recipes', { keyPath: 'id' });
  },
  // v7: wishlist a bucketlist
  (db) => {
    db.createObjectStore('wishes', { keyPath: 'id' });
  },
  // v8: fotky receptů (mimo zálohu, jsou velké)
  (db) => {
    db.createObjectStore('photos', { keyPath: 'id' });
  },
];

export const DB_VERSION = MIGRATIONS.length;
// Sklady, které jdou do zálohy. Fronta outbox mezi ně nepatří.
export const STORES = ['meta', 'items', 'history', 'tasks', 'payments', 'shops', 'comments', 'recipes', 'wishes'];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, MIGRATIONS.length);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      for (let v = event.oldVersion; v < MIGRATIONS.length; v++) {
        MIGRATIONS[v](db, req.transaction);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Databáze je blokovaná jiným oknem appky.'));
  });
  return dbPromise;
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transakce zrušena'));
  });
}

export async function get(store, key) {
  const db = await openDB();
  return promisify(db.transaction(store).objectStore(store).get(key));
}

export async function getAll(store) {
  const db = await openDB();
  return promisify(db.transaction(store).objectStore(store).getAll());
}

export async function put(store, value) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await done(tx);
  return value;
}

export async function putAll(store, values) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  values.forEach((v) => os.put(v));
  await done(tx);
}

export async function remove(store, keys) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  [].concat(keys).forEach((k) => os.delete(k));
  await done(tx);
}

export async function clear(store) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  await done(tx);
}

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Server chce UUID, takže ho poskládáme i bez randomUUID
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Trvalé úložiště: iOS jinak může data smazat při nedostatku místa.
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
