// Klient Supabase. Knihovna je uložená v js/vendor (kvůli offline) a načítá
// se v index.html jako běžný skript, který vytvoří globální `supabase`.

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const AUTH_STORAGE_KEY = 'home-app-auth';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Je na tomto telefonu uložené přihlášení? Funguje i offline, kdy getSession()
// s prošlým tokenem nic nevrátí, i když přihlášení pořád platí.
export function hasStoredSession() {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}
