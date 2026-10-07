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
import { today, addInterval } from './dates.js';

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

// Jména členů domácnosti (pro "kdo to má udělat", "kdo platí")
export async function listMembers() {
  const [members, me] = await Promise.all([getMeta('members', null), getMe()]);
  if (members?.length) return members;
  return me ? [me] : [];
}

// ---------- Stav synchronizace ----------
// { pending, lastSyncAt, error, online, active }

export const syncStatus = () => sync.getStatus();
export const subscribeSync = (fn) => sync.onStatus(fn);
export const syncNow = () => sync.syncNow();

// ---------- Nákupní seznam ----------
// Položka: { id, name, qty, category, done, doneAt, addedBy, createdAt, updatedAt }
// Smazaná položka zůstává v IndexedDB s deleted: true, dokud se smazání
// neodešle na server. Ven z této vrstvy se smazané položky nedostanou.

async function live(store) {
  return (await db.getAll(store)).filter((row) => !row.deleted);
}

// Uloží řádky lokálně a zařadí je do fronty k odeslání
async function save(store, rows) {
  if (!rows.length) return;
  await db.putAll(store, rows);
  await sync.markDirty(store, rows.map((row) => row.id));
}

async function markDeleted(store, rows) {
  const now = Date.now();
  await save(store, rows.map((row) => ({ ...row, deleted: true, updatedAt: now })));
}

// Vrátí smazané řádky (Zpět)
async function restore(store, rows) {
  const now = Date.now();
  await save(store, rows.map((row) => ({ ...row, deleted: false, updatedAt: now })));
  emit();
}

async function removeByIds(store, ids) {
  const removed = (await live(store)).filter((row) => ids.includes(row.id));
  await markDeleted(store, removed);
  emit();
  return removed;
}

async function patchRow(store, id, patch) {
  const row = await db.get(store, id);
  if (!row || row.deleted) return null;
  const next = { ...row, ...patch, updatedAt: Date.now() };
  await save(store, [next]);
  return next;
}

const liveItems = () => live('items');
const saveItems = (items) => save('items', items);

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

export const removeItems = (ids) => removeByIds('items', ids);

// Smaže koupené položky a vrátí je (kvůli tlačítku Zpět)
export async function clearDone() {
  const done = (await liveItems()).filter((i) => i.done);
  await markDeleted('items', done);
  emit();
  return done;
}

// Vrátí smazané položky (Zpět)
export const restoreItems = (items) => restore('items', items);

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

// ---------- Úkoly ----------
// Úkol: { id, title, assignee, due, repeat, done, doneAt, doneBy, prevDue,
//         createdBy, createdAt, updatedAt }
//   assignee  jméno člena, nebo null = kdokoliv
//   due       "RRRR-MM-DD", nebo null = někdy
//   repeat    null, nebo { every, unit: 'day'|'week'|'month'|'year', mode }
//             mode 'fixed' = další termín se počítá od termínu,
//                  'after' = ode dne, kdy se úkol opravdu splnil
// Opakovaný úkol se splněním neuzavře: posune se mu termín a v doneAt/doneBy
// zůstane, kdo a kdy ho splnil naposledy. prevDue je termín před tím, aby šlo
// odškrtnutí vrátit.

export async function listTasks() {
  const tasks = await live('tasks');
  return tasks.sort((a, b) => a.createdAt - b.createdAt);
}

export async function addTask({ title, due = null, assignee = null, repeat = null }) {
  const clean = String(title).trim();
  if (!clean) throw new Error('Prázdný název');
  const now = Date.now();
  const task = {
    id: db.newId(),
    title: clean,
    assignee,
    due,
    repeat,
    done: false,
    doneAt: null,
    doneBy: null,
    prevDue: null,
    createdBy: await getMe(),
    createdAt: now,
    updatedAt: now,
  };
  await save('tasks', [task]);
  emit();
  return task;
}

export async function updateTask(id, patch) {
  // Když se zruší opakování, zmizí i stopa po posledním splnění,
  // jinak by nehotový úkol vypadal jako dnes splněný
  const before = await db.get('tasks', id);
  if (before?.repeat && 'repeat' in patch && !patch.repeat && !before.done) {
    patch = { ...patch, doneAt: null, doneBy: null, prevDue: null };
  }
  const next = await patchRow('tasks', id, patch);
  emit();
  return next;
}

// Splní úkol, nebo splnění vrátí (done = false)
export async function setTaskDone(id, done) {
  const task = await db.get('tasks', id);
  if (!task || task.deleted) return null;
  const me = await getMe();
  let patch;
  if (!task.repeat) {
    patch = { done, doneAt: done ? Date.now() : null, doneBy: done ? me : null };
  } else if (done) {
    const { every, unit, mode } = task.repeat;
    const day = today();
    let next = addInterval(mode === 'after' ? day : (task.due ?? day), every, unit);
    // Zameškané pevné termíny se přeskočí, další musí být v budoucnu
    while (next <= day) next = addInterval(next, every, unit);
    patch = { due: next, prevDue: task.due ?? day, doneAt: Date.now(), doneBy: me };
  } else {
    patch = { due: task.prevDue ?? task.due, prevDue: null, doneAt: null, doneBy: null };
  }
  return updateTask(id, patch);
}

export const removeTasks = (ids) => removeByIds('tasks', ids);
export const restoreTasks = (tasks) => restore('tasks', tasks);

// Smaže hotové jednorázové úkoly a vrátí je (kvůli tlačítku Zpět)
export async function clearDoneTasks() {
  const done = (await live('tasks')).filter((t) => t.done);
  await markDeleted('tasks', done);
  emit();
  return done;
}

// ---------- Pravidelné platby ----------
// Platba: { id, name, amount, period, payer, dueDay, createdAt, updatedAt }
//   period  'month' | 'quarter' | 'year'
//   payer   jméno člena, nebo 'split' = napůl
//   dueDay  den v měsíci 1-31, nebo null

export const SPLIT = 'split';
export const PERIOD_MONTHS = { month: 1, quarter: 3, year: 12 };

export async function listPayments() {
  const payments = await live('payments');
  return payments.sort((a, b) => monthly(b) - monthly(a) || a.createdAt - b.createdAt);
}

// Částka přepočtená na jeden měsíc
export const monthly = (payment) => (payment.amount || 0) / (PERIOD_MONTHS[payment.period] ?? 1);

// Souhrn za měsíc: { total, perPerson: { Tom: 123, Domi: 456 } }.
// Platba napůl se rozdělí rovným dílem mezi všechny členy.
export async function paymentsSummary() {
  const [payments, members] = await Promise.all([live('payments'), listMembers()]);
  const perPerson = Object.fromEntries(members.map((m) => [m, 0]));
  let total = 0;
  for (const p of payments) {
    const amount = monthly(p);
    total += amount;
    if (p.payer === SPLIT || !p.payer) {
      members.forEach((m) => { perPerson[m] += amount / members.length; });
    } else {
      perPerson[p.payer] = (perPerson[p.payer] ?? 0) + amount;
    }
  }
  return { total, perPerson };
}

export async function addPayment({ name, amount = 0, period = 'month', payer = undefined, dueDay = null }) {
  const clean = String(name).trim();
  if (!clean) throw new Error('Prázdný název');
  const now = Date.now();
  const payment = {
    id: db.newId(),
    name: clean,
    amount,
    period,
    payer: payer === undefined ? await getMe() : payer,
    dueDay,
    createdAt: now,
    updatedAt: now,
  };
  await save('payments', [payment]);
  emit();
  return payment;
}

export async function updatePayment(id, patch) {
  const next = await patchRow('payments', id, patch);
  emit();
  return next;
}

export const removePayments = (ids) => removeByIds('payments', ids);
export const restorePayments = (payments) => restore('payments', payments);

// ---------- Záloha ----------

export async function exportAll() {
  const data = {};
  for (const store of db.STORES) data[store] = await db.getAll(store);
  // Přihlášení ani čekající smazání do zálohy nepatří
  data.meta = [];
  for (const store of ID_STORES) data[store] = data[store].filter((row) => !row.deleted);
  return { app: 'home-app', dbVersion: db.DB_VERSION, exportedAt: new Date().toISOString(), data };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Sklady s řádky podle id, které se synchronizují stejným způsobem
const ID_STORES = ['items', 'tasks', 'payments'];

export async function importAll(backup) {
  if (backup?.app !== 'home-app' || !backup.data) throw new Error('Tohle není záloha této aplikace.');
  // Záloha se do společného seznamu přidá, nic se jí nepřepíše ani nesmaže:
  // u položky se stejným id vyhrává novější verze.
  const history = Array.isArray(backup.data.history) ? backup.data.history : [];
  for (const store of ID_STORES) {
    const rows = Array.isArray(backup.data[store]) ? backup.data[store] : [];
    const keep = [];
    for (const row of rows) {
      if (!row?.id || !(row.name || row.title)) continue;
      // Server bere jen UUID, starší id z náhradního generátoru dostane nové
      if (!UUID.test(row.id)) {
        keep.push({ ...row, id: db.newId(), deleted: false });
        continue;
      }
      const local = await db.get(store, row.id);
      if (!local || (local.updatedAt ?? 0) < (row.updatedAt ?? 0)) keep.push({ ...row, deleted: false });
    }
    await save(store, keep);
  }
  for (const h of history) {
    if (!h?.key || (await db.get('history', h.key))) continue;
    await db.put('history', h);
    await sync.markDirty('history', h.key);
  }
  emit();
}
