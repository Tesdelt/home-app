// Datová vrstva: jediné místo, které ví, kde data leží.
//
// Appka čte i zapisuje do IndexedDB na tomto zařízení (funguje offline).
// Každý zápis se zároveň zařadí do fronty a js/sync.js ho odešle do Supabase,
// odkud ho dostane druhý telefon. Pohledy (js/views) o tom nic neví.
//
// Každá změna zavolá emit(), na který se pohledy přihlašují přes subscribe().

import * as db from './db.js';
import * as sync from './sync.js';
import { guessCategory, normalize } from './categories.js';

const listeners = new Set();
const channel = 'BroadcastChannel' in self ? new BroadcastChannel('home-app') : null;
channel?.addEventListener('message', () => notify());
// Změna od druhého telefonu
sync.onData(() => emit());

function notify() {
  listeners.forEach((fn) => {
    try { fn(); } catch (err) { console.error(err); }
  });
}

function emit() {
  notify();
  channel?.postMessage('changed');
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- Nastavení ----------

export async function getMeta(key, fallback = null) {
  const row = await db.get('meta', key);
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  await db.put('meta', { key, value });
  emit();
}

// Kdo appku na tomto telefonu používá, kvůli "kdo přidal". Jméno se bere
// z účtu (display_name v household_members), nastavuje ho js/auth.js.
export const getMe = () => getMeta('me', null);
export const setMe = (name) => setMeta('me', name);

// ---------- Stav synchronizace ----------
// { pending, lastSyncAt, error, online, active }

export const syncStatus = () => sync.getStatus();
export const subscribeSync = (fn) => sync.onStatus(fn);
export const syncNow = () => sync.syncNow();

// ---------- Nákupní seznam ----------
// Položka: { id, name, qty, category, done, doneAt, addedBy, createdAt, updatedAt }
// Smazaná položka zůstává v IndexedDB s deleted: true, dokud se smazání
// neodešle na server. Ven z této vrstvy se smazané položky nedostanou.

async function liveItems() {
  return (await db.getAll('items')).filter((i) => !i.deleted);
}

async function saveItems(items) {
  await db.putAll('items', items);
  await sync.markDirty('items', items.map((i) => i.id));
}

export async function listItems() {
  const items = await liveItems();
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

// Přidá položku. Když už stejná na seznamu je, nepřidá ji podruhé:
// koupenou vrátí zpět na seznam, nekoupenou jen případně doplní množství.
// Vrací { item, status: 'added' | 'restored' | 'exists' }.
export async function addItem({ name, qty = '' }) {
  const clean = String(name).trim();
  if (!clean) throw new Error('Prázdný název');
  const key = normalize(clean);
  const now = Date.now();

  const existing = (await liveItems()).find((i) => normalize(i.name) === key);
  if (existing) {
    const status = existing.done ? 'restored' : 'exists';
    const item = { ...existing, done: false, doneAt: null, qty: qty || existing.qty, updatedAt: now };
    await saveItems([item]);
    await touchHistory(item.name, item.category, true);
    emit();
    return { item, status };
  }

  const hist = await db.get('history', key);
  const item = {
    id: db.newId(),
    name: clean,
    qty,
    category: hist?.category ?? guessCategory(clean),
    done: false,
    doneAt: null,
    addedBy: await getMe(),
    createdAt: now,
    updatedAt: now,
  };
  await saveItems([item]);
  await touchHistory(item.name, item.category, true);
  emit();
  return { item, status: 'added' };
}

export async function updateItem(id, patch) {
  const item = await db.get('items', id);
  if (!item || item.deleted) return null;
  const next = { ...item, ...patch, updatedAt: Date.now() };
  if ('done' in patch) next.doneAt = patch.done ? Date.now() : null;
  await saveItems([next]);
  // Ruční změna kategorie se zapamatuje pro příště
  if ('category' in patch || 'name' in patch) await touchHistory(next.name, next.category, false);
  emit();
  return next;
}

export const setDone = (id, done) => updateItem(id, { done });

async function markDeleted(items) {
  const now = Date.now();
  if (items.length) await saveItems(items.map((i) => ({ ...i, deleted: true, updatedAt: now })));
}

export async function removeItems(ids) {
  const removed = (await liveItems()).filter((i) => ids.includes(i.id));
  await markDeleted(removed);
  emit();
  return removed;
}

// Smaže koupené položky a vrátí je (kvůli tlačítku Zpět)
export async function clearDone() {
  const done = (await liveItems()).filter((i) => i.done);
  await markDeleted(done);
  emit();
  return done;
}

// Vrátí smazané položky (Zpět)
export async function restoreItems(items) {
  const now = Date.now();
  await saveItems(items.map((i) => ({ ...i, deleted: false, updatedAt: now })));
  emit();
}

// ---------- Historie (našeptávač a často kupované) ----------
// Záznam: { key, name, category, count, lastAt }

async function touchHistory(name, category, countIt) {
  const key = normalize(name);
  const prev = await db.get('history', key);
  await db.put('history', {
    key,
    name,
    category,
    count: (prev?.count ?? 0) + (countIt ? 1 : 0),
    lastAt: Date.now(),
  });
  await sync.markDirty('history', key);
}

async function historyNotOnList() {
  const [history, items] = await Promise.all([db.getAll('history'), liveItems()]);
  const active = new Set(items.filter((i) => !i.done).map((i) => normalize(i.name)));
  return history.filter((h) => !active.has(h.key));
}

export async function suggestions(query, limit = 5) {
  const q = normalize(query);
  if (!q) return [];
  const list = await historyNotOnList();
  return list
    .filter((h) => h.key.split(' ').some((w) => w.startsWith(q)) || h.key.startsWith(q))
    .filter((h) => h.key !== q)
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .slice(0, limit);
}

export async function frequent(limit = 10) {
  const list = await historyNotOnList();
  return list
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .slice(0, limit);
}

// ---------- Záloha ----------

export async function exportAll() {
  const data = {};
  for (const store of db.STORES) data[store] = await db.getAll(store);
  // Přihlášení ani čekající smazání do zálohy nepatří
  data.meta = [];
  data.items = data.items.filter((i) => !i.deleted);
  return { app: 'home-app', dbVersion: db.DB_VERSION, exportedAt: new Date().toISOString(), data };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function importAll(backup) {
  if (backup?.app !== 'home-app' || !backup.data) throw new Error('Tohle není záloha této aplikace.');
  // Záloha se do společného seznamu přidá, nic se jí nepřepíše ani nesmaže:
  // u položky se stejným id vyhrává novější verze.
  const items = Array.isArray(backup.data.items) ? backup.data.items : [];
  const history = Array.isArray(backup.data.history) ? backup.data.history : [];
  const keep = [];
  for (const item of items) {
    if (!item?.id || !item.name) continue;
    // Server bere jen UUID, starší id z náhradního generátoru dostane nové
    if (!UUID.test(item.id)) {
      keep.push({ ...item, id: db.newId(), deleted: false });
      continue;
    }
    const local = await db.get('items', item.id);
    if (!local || (local.updatedAt ?? 0) < (item.updatedAt ?? 0)) keep.push({ ...item, deleted: false });
  }
  await saveItems(keep);
  for (const h of history) {
    if (!h?.key || (await db.get('history', h.key))) continue;
    await db.put('history', h);
    await sync.markDirty('history', h.key);
  }
  emit();
}
