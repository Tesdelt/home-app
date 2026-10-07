// Supabase: adresa projektu a VEŘEJNÝ (publishable) klíč. Ten v kódu být smí,
// data chrání přihlášení a RLS v databázi (supabase/schema.sql).
// Tajný klíč (secret / service_role) sem ani jinam do repozitáře NIKDY nepatří.
export const SUPABASE_URL = 'https://ovzcdryhlgfaechrvsrx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_zbQdPcKbLyg4P-plyJwVsQ_Rv06RBQc';

// Veřejný klíč pro push notifikace (VAPID). Soukromý je jen v Supabase Secrets.
export const VAPID_PUBLIC_KEY = 'BALRENk_nLfFAeiNF0HCpnUpzu_-YTZqT2waE1R_mIwlnqNbegG_ELpAyEjiLWn8CGp7XCEX6duXk1wZ97Qep48';

// Zobrazovaná verze. Při každém nasazení zvednout spolu s VERSION v sw.js.
export const APP_VERSION = '0.10.0';
