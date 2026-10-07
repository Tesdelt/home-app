// Supabase: adresa projektu a VEŘEJNÝ (publishable) klíč. Ten v kódu být smí,
// data chrání přihlášení a RLS v databázi (supabase/schema.sql).
// Tajný klíč (secret / service_role) sem ani jinam do repozitáře NIKDY nepatří.
export const SUPABASE_URL = 'https://ovzcdryhlgfaechrvsrx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_zbQdPcKbLyg4P-plyJwVsQ_Rv06RBQc';

// Zobrazovaná verze. Při každém nasazení zvednout spolu s VERSION v sw.js.
export const APP_VERSION = '0.3.0';
