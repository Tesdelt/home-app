// Datová vrstva: jediné místo, které ví, kde data leží.
//
// Teď jsou data v IndexedDB jen na tomto zařízení. Až přibude synchronizace
// mezi telefony (Supabase), vymění se vnitřek těchto funkcí, ale jejich
// rozhraní zůstane stejné, takže pohledy (js/views) se měnit nemusí.
//
// Každá změna zavolá emit(), na který se pohledy přihlašují přes subscribe().

import * as db from './db.js';
import { guessCategory, normalize } from './categories.js';

const listeners = new Set();
const channel = 'BroadcastChannel' in self ? new BroadcastChannel('home-app') : null;
channel?.addEventListener('message', () => notify());

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

// Kdo appku na tomto telefonu používá ("Tom" / "Domi"), kvůli "kdo přidal"
export const getMe = () => getMeta('me', null);
export const setMe = (name) => setMeta('me', name);

// ---------- Nákupní seznam ----------
// Položka: { id, name, qty, category, done, doneAt, addedBy, createdAt, updatedAt }

export async function listItems() {
  const items = await db.getAll('items');
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

  const existing = (await db.getAll('items')).find((i) => normalize(i.name) === key);
  if (existing) {
    const status = existing.done ? 'restored' : 'exists';
    const item = { ...existing, done: false, doneAt: null, qty: qty || existing.qty, updatedAt: now };
    await db.put('items', item);
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
  await db.put('items', item);
  await touchHistory(item.name, item.category, true);
  emit();
  return { item, status: 'added' };
}

export async function updateItem(id, patch) {
  const item = await db.get('items', id);
  if (!item) return null;
  const next = { ...item, ...patch, updatedAt: Date.now() };
  if ('done' in patch) next.doneAt = patch.done ? Date.now() : null;
  await db.put('items', next);
  // Ruční změna kategorie se zapamatuje pro příště
  if ('category' in patch || 'name' in patch) await touchHistory(next.name, next.category, false);
  emit();
  return next;
}

export const setDone = (id, done) => updateItem(id, { done });

export async function removeItems(ids) {
  const all = await db.getAll('items');
  const removed = all.filter((i) => ids.includes(i.id));
  await db.remove('items', ids);
  emit();
  return removed;
}

// Smaže koupené položky a vrátí je (kvůli tlačítku Zpět)
export async function clearDone() {
  const done = (await db.getAll('items')).filter((i) => i.done);
  if (done.length) await db.remove('items', done.map((i) => i.id));
  emit();
  return done;
}

// Vrátí smazané položky (Zpět)
export async function restoreItems(items) {
  await db.putAll('items', items);
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
}

async function historyNotOnList() {
  const [history, items] = await Promise.all([db.getAll('history'), db.getAll('items')]);
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
  return { app: 'home-app', dbVersion: db.DB_VERSION, exportedAt: new Date().toISOString(), data };
}

export async function importAll(backup) {
  if (backup?.app !== 'home-app' || !backup.data) throw new Error('Tohle není záloha této aplikace.');
  for (const store of db.STORES) {
    if (!Array.isArray(backup.data[store])) continue;
    await db.clear(store);
    await db.putAll(store, backup.data[store]);
  }
  emit();
}
