// Supabase Edge Function: push notifikace. Umí dvě věci.
//
// 1. Ranní upozornění na platby. Jednou denně ji bez přihlášení zavolá
//    GitHub Actions (.github/workflows/denni-kontrola.yml). Najde nezaplacené
//    platby se splatností dnes nebo dřív a upozorní toho, kdo je má platit
//    (platbu napůl oba).
// 2. Upozornění na nový úkol. Volá ji appka přihlášeného člena s tělem
//    { task, title } a funkce pošle upozornění ostatním členům domácnosti.
//
// Bezpečnost:
//   * Bez přihlášení jde spustit jen ranní rozeslání, proto nic nevrací (jen
//     počet odeslaných) a o každé platbě pošle nejvýš jedno upozornění denně.
//   * Upozornění na úkol vyžaduje platné přihlášení člena domácnosti a jde
//     jen členům téže domácnosti.
//   * Do databáze chodí servisním klíčem, který Supabase funkci dodá sám.
//     V kódu žádný klíč není. Soukromý VAPID klíč je v Supabase Secrets.
//
// Nasazení: Supabase dashboard -> Edge Functions, název send-reminders,
// vypnuté "Verify JWT", Secrets VAPID_PUBLIC_KEY a VAPID_PRIVATE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const APP_URL = 'https://tesdelt.github.io/home-app/';

// Nastavení se čte až při zavolání, aby chybějící nebo špatně vložený klíč
// funkci neshodil hned při startu a šlo poznat, co chybí. Odpověď prozradí
// jen NÁZEV chybějícího nastavení, nikdy jeho hodnotu.
const NEEDED = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'];
const env = (name: string) => (Deno.env.get(name) ?? '').trim();

// Dnešní datum v Česku jako RRRR-MM-DD
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());

const money = (amount: number) => `${Math.round(amount).toLocaleString('cs-CZ')} Kč`;

// Appka běží na jiné adrese než funkce, prohlížeč proto potřebuje CORS
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

type Sub = { endpoint: string; p256dh: string; auth: string; user_id: string };

// Pošle jednu zprávu na všechny dané odběry, neplatné odběry uklidí
// deno-lint-ignore no-explicit-any
async function sendAll(db: any, subs: Sub[], payload: string) {
  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      sent += 1;
    } catch (err) {
      // Odběr už neplatí (appka smazaná, upozornění vypnutá): uklidit
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      else console.error('Odeslání selhalo', status);
    }
  }
  return sent;
}

// Upozornění na nový úkol od přihlášeného člena ostatním v domácnosti
// deno-lint-ignore no-explicit-any
async function notifyTask(db: any, req: Request, body: { task?: string; title?: string }) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await db.auth.getUser(token);
  const userId = auth?.user?.id;
  if (!userId) return reply({ error: 'neprihlasen' }, 401);

  const { data: mine, error: mineError } = await db
    .from('household_members').select('household_id, display_name').eq('user_id', userId).limit(1);
  if (mineError) throw mineError;
  if (!mine?.length) return reply({ error: 'neni_clen' }, 403);

  const { data: subs, error: subsError } = await db
    .from('push_subscriptions').select('endpoint, p256dh, auth, user_id')
    .eq('household_id', mine[0].household_id).neq('user_id', userId);
  if (subsError) throw subsError;

  const taskId = String(body.task ?? '').replace(/[^0-9a-f-]/gi, '');
  const payload = JSON.stringify({
    title: `Nový úkol od: ${mine[0].display_name}`,
    body: String(body.title ?? '').slice(0, 200),
    url: `#/ukoly/${taskId}`,
    tag: `ukol-${taskId}`,
  });
  return reply({ sent: await sendAll(db, subs ?? [], payload) });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const missing = NEEDED.filter((name) => !env(name));
  if (missing.length) return reply({ error: 'chybi_nastaveni', missing }, 500);
  try {
    webpush.setVapidDetails(APP_URL, env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  } catch (err) {
    // Zpráva knihovny říká jen, co je na klíči špatně (délka, znaky)
    return reply({ error: 'spatny_vapid_klic', detail: String((err as Error).message) }, 500);
  }
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

  // stage říká, u čeho funkce zrovna je, aby šla případná chyba dohledat
  let stage = 'ukol';
  try {
    const body = await req.json().catch(() => null);
    if (body?.task) return await notifyTask(db, req, body);

    stage = 'platby';
    const day = today();
    const { data: payments, error } = await db
      .from('payments')
      .select('id, household_id, name, amount, payer, next_due')
      .eq('deleted', false)
      .eq('done', false)
      .lte('next_due', day);
    if (error) throw error;
    if (!payments?.length) return reply({ sent: 0 });

    // Co už dnes upozornění dostalo, znovu nepůjde
    stage = 'zaznamy';
    const { data: logged, error: loggedError } = await db.from('payment_reminders').select('payment_id').eq('day', day);
    if (loggedError) throw loggedError;
    const already = new Set((logged ?? []).map((row) => row.payment_id));
    const fresh = payments.filter((p) => !already.has(p.id));
    if (!fresh.length) return reply({ sent: 0 });

    const households = [...new Set(fresh.map((p) => p.household_id))];
    stage = 'clenove';
    const { data: members, error: membersError } = await db
      .from('household_members').select('user_id, household_id, display_name').in('household_id', households);
    if (membersError) throw membersError;
    stage = 'odbery';
    const { data: subs, error: subsError } = await db
      .from('push_subscriptions').select('endpoint, p256dh, auth, user_id, household_id').in('household_id', households);
    if (subsError) throw subsError;
    stage = 'odeslani';

    // Komu která platba patří: plátci podle jména, platba napůl všem
    const perUser = new Map<string, typeof fresh>();
    for (const p of fresh) {
      const inHouse = (members ?? []).filter((m) => m.household_id === p.household_id);
      const who = p.payer && p.payer !== 'split' ? inHouse.filter((m) => m.display_name === p.payer) : inHouse;
      for (const m of who) perUser.set(m.user_id, [...(perUser.get(m.user_id) ?? []), p]);
    }

    let sent = 0;
    for (const [userId, list] of perUser) {
      const body = list
        .map((p) => `${p.name} ${money(Number(p.amount))}${p.next_due < day ? ' (po termínu)' : ''}`)
        .join(', ');
      const payload = JSON.stringify({
        title: list.length === 1 ? 'K zaplacení' : `K zaplacení: ${list.length}`,
        body,
        url: '#/penize',
        tag: 'platby',
      });
      sent += await sendAll(db, (subs ?? []).filter((s) => s.user_id === userId), payload);
    }

    stage = 'zapis';
    const { error: logError } = await db.from('payment_reminders').upsert(fresh.map((p) => ({ payment_id: p.id, day })));
    if (logError) throw logError;
    return reply({ sent });
  } catch (err) {
    console.error(stage, err);
    // Kód a text chyby databáze popisují jen strukturu (tabulka, oprávnění),
    // žádná data domácnosti v nich nejsou
    const e = err as { code?: string; message?: string };
    return reply({ error: 'chyba', stage, code: e?.code ?? null, detail: String(e?.message ?? err).slice(0, 200) }, 500);
  }
});
