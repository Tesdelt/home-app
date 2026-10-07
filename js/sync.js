// Synchronizace lokální IndexedDB se Supabase.
//
// IndexedDB je pravda pro appku (funguje i offline), Supabase je sdílená kopie.
//   * Každá lokální změna se přes markDirty() zapíše do fronty (sklad outbox)
//     a odešle se hned, nebo až bude připojení.
//   * Konflikty: vyhrává novější updated_at. Hlídá to i databáze (trigger
//     keep_newer v supabase/schema.sql), takže starší zápis nic nepřepíše.
//   * Smazaná položka zůstává jako řádek s deleted = true, dokud se neodešle.
//   * Změny od druhého chodí živě přes Realtime, pro jistotu se navíc celý
//     stav stáhne při startu, po připojení a při návratu do appky.
//
// Používá jen js/store.js a js/auth.js. Pohledy sem nesahají.

import * as db from './db.js';
import { supabase } from './supabase.js';

const iso = (ms) => (ms ? new Date(ms).toISOString() : null);
const ms = (text) => (text ? Date.parse(text) : null);

// Popis synchronizovaných skladů: jak se řádek převádí tam a zpět
// a podle čeho se pozná novější verze (stamp).
const SPECS = {
  items: {
    table: 'shopping_items',
    conflict: 'id',
    keyOf: (row) => row.id,
    stamp: (local) => local.updatedAt ?? 0,
    toRemote: (i, householdId) => ({
      id: i.id,
      household_id: householdId,
      name: i.name,
      qty: i.qty ?? '',
      category: i.category ?? null,
      done: Boolean(i.done),
      done_at: iso(i.doneAt),
      added_by: i.addedBy ?? null,
      created_at: iso(i.createdAt ?? i.updatedAt ?? Date.now()),
      updated_at: iso(i.updatedAt ?? Date.now()),
      deleted: Boolean(i.deleted),
    }),
    fromRemote: (r) => ({
      id: r.id,
      name: r.name,
      qty: r.qty ?? '',
      category: r.category,
      done: r.done,
      doneAt: ms(r.done_at),
      addedBy: r.added_by,
      createdAt: ms(r.created_at),
      updatedAt: ms(r.updated_at),
    }),
    // Smazané se nestahují, co na serveru chybí, to se lokálně odstraní
    pullFilter: (query) => query.eq('deleted', false),
    removeMissing: true,
  },
  history: {
    table: 'shopping_history',
    conflict: 'household_id,key',
    keyOf: (row) => row.key,
    stamp: (local) => local.lastAt ?? 0,
    toRemote: (h, householdId) => ({
      household_id: householdId,
      key: h.key,
      name: h.name,
      category: h.category ?? null,
      count: h.count ?? 0,
      last_at: iso(h.lastAt ?? Date.now()),
      updated_at: iso(h.lastAt ?? Date.now()),
    }),
    fromRemote: (r) => ({
      key: r.key,
      name: r.name,
      category: r.category,
      count: r.count,
      lastAt: ms(r.updated_at),
    }),
    pullFilter: (query) => query,
    removeMissing: false,
  },
};

const PAGE = 1000;
const outboxKey = (store, key) => `${store}:${key}`;

let householdId = null;
let channel = null;
let running = null;
let runAgain = false;
let flushTimer = null;
let pulling = false;
const touchedDuringPull = new Set();

const status = { pending: 0, lastSyncAt: null, error: null };
const dataListeners = new Set();
const statusListeners = new Set();

const fire = (set) => set.forEach((fn) => {
  try { fn(); } catch (err) { console.error(err); }
});

// Lokální data se změnila kvůli druhému telefonu
export function onData(fn) {
  dataListeners.add(fn);
  return () => dataListeners.delete(fn);
}

// Změnil se stav synchronizace (počet čekajících změn, chyba)
export function onStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

export function getStatus() {
  return { ...status, online: navigator.onLine !== false, active: Boolean(householdId) };
}

async function refreshPending() {
  const pending = (await db.getAll('outbox')).length;
  if (pending !== status.pending) {
    status.pending = pending;
    fire(statusListeners);
  }
  return pending;
}

function setError(error) {
  const text = error ? (error.message || String(error)) : null;
  if (text === status.error) return;
  status.error = text;
  fire(statusListeners);
}

// ---------- Start a stop ----------

export function start(id) {
  if (householdId === id) return;
  stop();
  householdId = id;

  channel = supabase.channel(`household-${id}`);
  for (const [store, spec] of Object.entries(SPECS)) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: spec.table, filter: `household_id=eq.${id}` },
      (payload) => { if (payload.eventType !== 'DELETE') applyRemote(store, payload.new); },
    );
  }
  // SUBSCRIBED přijde i po každém obnovení spojení: dotáhneme, co mezitím uteklo
  channel.subscribe((state) => { if (state === 'SUBSCRIBED') syncNow(); });

  window.addEventListener('online', syncNow);
  document.addEventListener('visibilitychange', onVisible);
  refreshPending();
  syncNow();
}

export function stop() {
  if (channel) supabase.removeChannel(channel);
  channel = null;
  householdId = null;
  clearTimeout(flushTimer);
  window.removeEventListener('online', syncNow);
  document.removeEventListener('visibilitychange', onVisible);
}

function onVisible() {
  if (document.visibilityState === 'visible') syncNow();
}

// ---------- Fronta lokálních změn ----------

export async function markDirty(store, keys) {
  const list = [].concat(keys);
  if (!list.length) return;
  await db.putAll('outbox', list.map((key) => ({ k: outboxKey(store, key), store, key })));
  refreshPending();
  // Krátká prodleva spojí víc změn po sobě do jednoho požadavku
  clearTimeout(flushTimer);
  flushTimer = setTimeout(syncNow, 250);
}

// Odešle frontu a stáhne aktuální stav. Běží vždy jen jednou, další volání
// během běhu si vyžádá ještě jedno kolo. Vrací true, když je vše odesláno.
export function syncNow() {
  if (!householdId) return Promise.resolve(false);
  if (running) {
    runAgain = true;
    return running;
  }
  running = (async () => {
    let ok = false;
    do {
      runAgain = false;
      const id = householdId;
      try {
        // Když se odeslání nepovede, stav od druhého se stáhne i tak
        const pushError = await push(id).then(() => null, (err) => err);
        await pull(id);
        if (pushError) throw pushError;
        status.lastSyncAt = Date.now();
        setError(null);
        ok = true;
      } catch (err) {
        ok = false;
        if (navigator.onLine !== false) console.warn('Synchronizace selhala', err);
        setError(err);
      }
    } while (runAgain && householdId);
    running = null;
    const pending = await refreshPending();
    fire(statusListeners);
    return ok && pending === 0;
  })();
  return running;
}

async function push(id) {
  const queue = await db.getAll('outbox');
  for (const [store, spec] of Object.entries(SPECS)) {
    const entries = queue.filter((q) => q.store === store);
    if (!entries.length) continue;

    const sent = [];
    for (const entry of entries) {
      const local = await db.get(store, entry.key);
      if (local) sent.push({ entry, local });
      else await db.remove('outbox', entry.k);
    }
    if (!sent.length) continue;

    const { error } = await supabase
      .from(spec.table)
      .upsert(sent.map(({ local }) => spec.toRemote(local, id)), { onConflict: spec.conflict });
    if (error) throw error;
    if (householdId !== id) return;

    // Z fronty zmizí jen to, co se mezitím lokálně znovu nezměnilo
    for (const { entry, local } of sent) {
      const current = await db.get(store, entry.key);
      if (current && spec.stamp(current) !== spec.stamp(local)) continue;
      await db.remove('outbox', entry.k);
      if (current?.deleted) await db.remove(store, entry.key);
    }
  }
  await refreshPending();
}

async function fetchAll(spec, id) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await spec
      .pullFilter(supabase.from(spec.table).select('*').eq('household_id', id))
      .order(spec.conflict.split(',').pop())
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

async function pull(id, { keepMissing = false } = {}) {
  pulling = true;
  touchedDuringPull.clear();
  let changed = false;
  try {
    for (const [store, spec] of Object.entries(SPECS)) {
      const remote = await fetchAll(spec, id);
      if (householdId !== id) return;

      const dirty = new Set((await db.getAll('outbox')).filter((q) => q.store === store).map((q) => q.key));
      const locals = new Map((await db.getAll(store)).map((row) => [spec.keyOf(row), row]));
      const seen = new Set();
      const toPut = [];

      for (const row of remote) {
        const key = spec.keyOf(row);
        seen.add(key);
        if (touchedDuringPull.has(outboxKey(store, key))) continue;
        const next = spec.fromRemote(row);
        const local = locals.get(key);
        if (local && dirty.has(key) && spec.stamp(local) >= spec.stamp(next)) continue;
        if (local && !local.deleted && sameRow(local, next)) continue;
        toPut.push(next);
      }

      const toRemove = spec.removeMissing && !keepMissing
        ? [...locals.keys()].filter((key) => !seen.has(key) && !dirty.has(key) && !touchedDuringPull.has(outboxKey(store, key)))
        : [];

      if (toPut.length) await db.putAll(store, toPut);
      if (toRemove.length) await db.remove(store, toRemove);
      if (toPut.length || toRemove.length) changed = true;
    }
  } finally {
    pulling = false;
    if (changed) fire(dataListeners);
  }
}

function sameRow(a, b) {
  return Object.keys(b).every((k) => (a[k] ?? null) === (b[k] ?? null));
}

// Jedna živá změna z Realtime
async function applyRemote(store, row) {
  const spec = SPECS[store];
  if (!row || row.household_id !== householdId) return;
  const key = spec.keyOf(row);
  const next = spec.fromRemote(row);
  const local = await db.get(store, key);
  const dirty = await db.get('outbox', outboxKey(store, key));
  if (local && dirty && spec.stamp(local) >= spec.stamp(next)) return;
  if (local && !dirty && spec.stamp(local) > spec.stamp(next)) return;

  if (pulling) touchedDuringPull.add(outboxKey(store, key));
  if (row.deleted) {
    if (!local) return;
    await db.remove(store, key);
  } else {
    if (local && !local.deleted && sameRow(local, next)) return;
    await db.put(store, next);
  }
  fire(dataListeners);
}

// ---------- První přihlášení: data, která na telefonu byla před sdílením ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Nahraje lokální položky a historii do sdíleného seznamu. Co už ve sdíleném
// seznamu je (stejný název), se podruhé nepřidá. Vyžaduje připojení.
export async function adoptLocal(id, sameName) {
  const mine = (await db.getAll('items')).filter((i) => !i.deleted);
  const myHistory = await db.getAll('history');

  // Nejdřív stáhnout sdílený stav, lokální položky při tom nechat být
  const before = householdId;
  householdId = id;
  try {
    await pull(id, { keepMissing: true });
  } finally {
    householdId = before;
  }

  const mineIds = new Set(mine.map((i) => i.id));
  const shared = (await db.getAll('items')).filter((i) => !mineIds.has(i.id));
  const upload = [];
  for (const item of mine) {
    const current = await db.get('items', item.id);
    // Ve sdíleném seznamu už nekoupená položka se stejným názvem je
    const duplicate = shared.some((s) => !s.done && sameName(s.name, item.name));
    if (duplicate) {
      await db.remove('items', item.id);
      continue;
    }
    if (UUID.test(item.id)) {
      upload.push(current ?? item);
    } else {
      await db.remove('items', item.id);
      const fixed = { ...item, id: db.newId() };
      await db.put('items', fixed);
      upload.push(fixed);
    }
  }

  await db.putAll('outbox', [
    ...upload.map((i) => ({ k: outboxKey('items', i.id), store: 'items', key: i.id })),
    ...myHistory.map((h) => ({ k: outboxKey('history', h.key), store: 'history', key: h.key })),
  ]);
  return upload.length;
}

// Smaže lokální kopii dat (odhlášení, jiný účet)
export async function wipeLocal() {
  stop();
  await Promise.all(['items', 'history', 'outbox'].map((store) => db.clear(store)));
  status.pending = 0;
  status.lastSyncAt = null;
  status.error = null;
  fire(dataListeners);
  fire(statusListeners);
}
