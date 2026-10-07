// Přihlášení a přístup k domácnosti.
//
// Účty se zakládají ručně v Supabase, appka umí jen přihlásit a odhlásit.
// Přihlášený, který není v tabulce household_members, nedostane nic.
//
// Aby appka fungovala offline, pamatuje si po úspěšném ověření v IndexedDB,
// kdo je přihlášený a do které domácnosti patří (meta "session"). Při dalším
// startu se pustí hned z lokální kopie a ověření proběhne na pozadí.
//
// Stavy: loading -> signedOut | unverified | denied | import | ready

import * as db from './db.js';
import * as sync from './sync.js';
import * as store from './store.js';
import * as push from './push.js';
import { supabase, hasStoredSession } from './supabase.js';
import { normalize } from './categories.js';

const state = { status: 'loading', email: null, displayName: null, householdId: null, localCount: 0 };
const listeners = new Set();

export const getState = () => ({ ...state });

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => {
    try { fn(getState()); } catch (err) { console.error(err); }
  });
}

const getCache = async () => (await db.get('meta', 'session'))?.value ?? null;
const saveCache = (value) => db.put('meta', { key: 'session', value });

// Zapomene přihlášeného a smaže lokální kopii sdílených dat. Položky, které
// na telefonu byly před sdílením a ještě se o nich nerozhodlo, nechá být.
async function forget() {
  const cache = await getCache();
  if (cache && !cache.importPending) await sync.wipeLocal();
  else sync.stop();
  await db.remove('meta', ['session', 'me', 'members']);
}

// Pustí uživatele dál podle zapamatovaného ověření
async function enter(cache) {
  const info = { email: cache.email, displayName: cache.displayName, householdId: cache.householdId };
  if (cache.importPending) {
    const localCount = (await db.getAll('items')).filter((i) => !i.deleted).length;
    set({ ...info, status: 'import', localCount });
    return;
  }
  await store.upgradeData();
  sync.start(cache.householdId);
  set({ ...info, status: 'ready' });
  // Zapnutá upozornění se drží sama, i když telefon odběr mezitím zahodil
  push.ensure(cache.householdId);
}

function onSignedOut() {
  sync.stop();
  if (state.status !== 'signedOut') set({ status: 'signedOut' });
}

export async function start() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.status === 'ready') push.ensure(state.householdId);
  });
  supabase.auth.onAuthStateChange((event) => {
    // Uvnitř posluchače se nesmí čekat na další volání Supabase
    if (event === 'SIGNED_OUT') setTimeout(onSignedOut, 0);
  });

  if (!hasStoredSession()) {
    set({ status: 'signedOut' });
    return;
  }
  const cache = await getCache();
  if (cache) {
    await enter(cache);
    verify();
    return;
  }
  await verify();
}

// Ověří na serveru, že přihlášený patří do domácnosti
export async function verify() {
  const waiting = !['ready', 'import'].includes(state.status);
  const { data } = await supabase.auth.getSession().catch(() => ({ data: null }));
  const user = data?.session?.user;
  if (!user) {
    // Bez připojení s prošlým tokenem session chybí, i když přihlášení platí
    if (!hasStoredSession()) onSignedOut();
    else if (waiting) set({ status: 'unverified' });
    return;
  }

  const { data: rows, error } = await supabase
    .from('household_members')
    .select('user_id, household_id, display_name');

  if (error && !error.code) {
    // Chyba sítě: kdo už je uvnitř, pokračuje z lokální kopie
    if (waiting) set({ status: 'unverified', email: user.email });
    return;
  }

  let cache = await getCache();
  // RLS vrátí jen členy mé domácnosti. Kdo v žádné není, nedostane nic.
  const member = error ? null : rows.find((row) => row.user_id === user.id);
  if (!member) {
    await forget();
    set({ status: 'denied', email: user.email, displayName: null, householdId: null });
    return;
  }

  if (cache && (cache.userId !== user.id || cache.householdId !== member.household_id)) {
    // Na telefonu zůstala data jiného účtu nebo domácnosti
    await forget();
    cache = null;
  }
  // Data, která tu byla před sdílením: zeptáme se, co s nimi
  const importPending = cache
    ? Boolean(cache.importPending)
    : (await db.getAll('items')).length + (await db.getAll('history')).length > 0;

  cache = {
    userId: user.id,
    email: user.email,
    displayName: member.display_name,
    householdId: member.household_id,
    importPending,
  };
  await saveCache(cache);
  const members = rows
    .filter((row) => row.household_id === member.household_id)
    .map((row) => row.display_name)
    .sort((a, b) => a.localeCompare(b, 'cs'));
  if ((await store.getMe()) !== member.display_name) await store.setMe(member.display_name);
  if (JSON.stringify(await store.getMeta('members')) !== JSON.stringify(members)) await store.setMeta('members', members);
  if (waiting) await enter(cache);
  else if (state.displayName !== cache.displayName) set({ displayName: cache.displayName, email: cache.email });
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(signInMessage(error));
  set({ status: 'loading' });
  await verify();
}

function signInMessage(error) {
  if (navigator.onLine === false || error.name === 'AuthRetryableFetchError') return 'Bez připojení se přihlásit nedá.';
  if (error.status === 429) return 'Příliš mnoho pokusů, zkuste to za chvíli.';
  if (error.status === 400 || error.code === 'invalid_credentials') return 'Nesprávný e-mail nebo heslo.';
  return 'Přihlášení se nepovedlo. Zkuste to znovu.';
}

// Odhlásí tento telefon a smaže z něj lokální kopii dat. Když ještě čekají
// neodeslané změny a není force, neudělá nic a vrátí false.
export async function signOut({ force = false } = {}) {
  if (state.status === 'ready') {
    await sync.syncNow();
    if (sync.getStatus().pending > 0 && !force) return false;
  }
  // Odhlášený telefon už nesmí dostávat upozornění
  await push.disable({ forget: false });
  await forget();
  // scope local: druhé zařízení téhož účtu zůstane přihlášené
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  set({ status: 'signedOut', email: null, displayName: null, householdId: null });
  return true;
}

// První přihlášení: nahrát položky z telefonu do společného seznamu, nebo ne
export async function resolveImport(upload) {
  const cache = await getCache();
  if (!cache) return;
  if (upload) {
    await sync.adoptLocal(cache.householdId, (a, b) => normalize(a) === normalize(b));
  } else {
    await db.clear('items');
    await db.clear('history');
  }
  cache.importPending = false;
  await saveCache(cache);
  await enter(cache);
}
