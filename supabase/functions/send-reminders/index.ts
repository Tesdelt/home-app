// Supabase Edge Function: push notifikace. Umí dvě věci.
//
// 1. Ranní přehled. Jednou denně ji bez přihlášení zavolá GitHub Actions
//    (.github/workflows/denni-kontrola.yml). Každý člen dostane nejvýš jedno
//    upozornění, které spojí jeho úkoly (nehotové s termínem dnes nebo po
//    termínu: pro něj, pro oba, pro kohokoliv; soukromé jen majiteli) a platby
//    splatné dnes nebo po termínu (plátce, společnou oba). Nadpis „Dnes: 2 úkoly
//    (1 po termínu), 1 platba“, text první 3 názvy. Když nic, nic se neposílá.
//    Odběr s vypnutým Ranním přehledem (push_subscriptions.morning) ho nedostane.
// 2. Upozornění na nový úkol nebo komentář. Volá ji appka přihlášeného člena
//    s tělem { task, title } (úkol) nebo { task, title, kind: 'comment', text }
//    a funkce pošle upozornění ostatním členům domácnosti.
//
// Bezpečnost:
//   * Bez přihlášení jde spustit jen ranní rozeslání, proto nic nevrací (jen
//     počet odeslaných) a každému členovi pošle nejvýš jeden přehled denně
//     (tabulka morning_reminders).
//   * Upozornění na úkol vyžaduje platné přihlášení člena domácnosti a jde
//     jen členům téže domácnosti.
//   * Do databáze chodí servisním klíčem, který Supabase funkci dodá sám.
//     V kódu žádný klíč není. Soukromý VAPID klíč je v Supabase Secrets.
//
// Nasazení: Claude přes Supabase MCP (deploy_edge_function), název send-reminders,
// vždy vypnuté "Verify JWT" (verify_jwt: false), Secrets VAPID_PUBLIC_KEY a VAPID_PRIVATE_KEY.

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

// Upozornění na nový úkol nebo komentář od přihlášeného člena ostatním v domácnosti
// deno-lint-ignore no-explicit-any
async function notifyTask(db: any, req: Request, body: { task?: string; title?: string; kind?: string; text?: string }) {
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
  const comment = body.kind === 'comment';
  const taskTitle = String(body.title ?? '').slice(0, 120);
  const payload = JSON.stringify({
    title: `${comment ? 'Komentář' : 'Nový úkol'} od: ${mine[0].display_name}`,
    body: comment ? `${taskTitle}: ${String(body.text ?? '').slice(0, 300)}` : taskTitle,
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

    stage = 'clenove';
    const day = today();
    const { data: members, error: membersError } = await db
      .from('household_members').select('user_id, household_id, display_name');
    if (membersError) throw membersError;
    if (!members?.length) return reply({ sent: 0 });

    // Kdo už dnes přehled dostal, znovu nedostane
    stage = 'zaznamy';
    const { data: logged, error: loggedError } = await db.from('morning_reminders').select('user_id').eq('day', day);
    if (loggedError) throw loggedError;
    const already = new Set((logged ?? []).map((row) => row.user_id));
    const waiting = members.filter((m) => !already.has(m.user_id));
    if (!waiting.length) return reply({ sent: 0 });
    const households = [...new Set(waiting.map((m) => m.household_id))];

    stage = 'ukoly';
    const { data: tasks, error: tasksError } = await db
      .from('tasks')
      .select('household_id, title, assignee, due, done_parts, private_to')
      .in('household_id', households)
      .eq('deleted', false)
      .eq('done', false)
      .not('due', 'is', null)
      .lte('due', day);
    if (tasksError) throw tasksError;

    stage = 'platby';
    const { data: payments, error } = await db
      .from('payments')
      .select('household_id, name, amount, payer, next_due')
      .in('household_id', households)
      .eq('deleted', false)
      .eq('done', false)
      .lte('next_due', day);
    if (error) throw error;

    stage = 'odbery';
    const { data: subs, error: subsError } = await db
      .from('push_subscriptions').select('endpoint, p256dh, auth, user_id, household_id, morning').in('household_id', households);
    if (subsError) throw subsError;

    stage = 'odeslani';
    const plural = (n: number, one: string, few: string, many: string) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
    let sent = 0;
    const done: { user_id: string; day: string }[] = [];
    for (const m of waiting) {
      // Úkoly pro něj, pro oba (kromě těch, kde svou část už odškrtl) a pro kohokoliv;
      // soukromý jen majiteli
      const myTasks = (tasks ?? []).filter((t) => t.household_id === m.household_id
        && (!t.private_to || t.private_to === m.user_id)
        && (!t.assignee || t.assignee === m.display_name || (t.assignee === 'both' && !(t.done_parts ?? []).includes(m.display_name))))
        .sort((a, b) => String(a.due).localeCompare(String(b.due)));
      // Platby: plátce podle jména, společná (split nebo prázdný plátce) oběma
      const myPayments = (payments ?? []).filter((p) => p.household_id === m.household_id
        && (!p.payer || p.payer === 'split' || p.payer === m.display_name))
        .sort((a, b) => String(a.next_due).localeCompare(String(b.next_due)));
      if (!myTasks.length && !myPayments.length) continue;
      done.push({ user_id: m.user_id, day });

      const late = myTasks.filter((t) => t.due < day).length;
      const parts: string[] = [];
      if (myTasks.length) parts.push(`${plural(myTasks.length, 'úkol', 'úkoly', 'úkolů')}${late ? ` (${late} po termínu)` : ''}`);
      if (myPayments.length) parts.push(plural(myPayments.length, 'platba', 'platby', 'plateb'));
      const names = [
        ...myTasks.map((t) => t.title),
        ...myPayments.map((p) => `${p.name} ${money(Number(p.amount))}`),
      ];
      const rest = names.length - 3;
      const payload = JSON.stringify({
        title: `Dnes: ${parts.join(', ')}`,
        body: `${names.slice(0, 3).join(', ')}${rest > 0 ? ` a další ${rest}` : ''}`,
        url: myPayments.length ? (myTasks.length ? '#/domu' : '#/penize') : '#/ukoly',
        tag: 'rano',
      });
      sent += await sendAll(db, (subs ?? []).filter((s) => s.user_id === m.user_id && s.morning !== false), payload);
    }

    stage = 'zapis';
    if (done.length) {
      const { error: logError } = await db.from('morning_reminders').upsert(done, { ignoreDuplicates: true });
      if (logError) throw logError;
    }
    return reply({ sent });
  } catch (err) {
    console.error(stage, err);
    // Kód a text chyby databáze popisují jen strukturu (tabulka, oprávnění),
    // žádná data domácnosti v nich nejsou
    const e = err as { code?: string; message?: string };
    return reply({ error: 'chyba', stage, code: e?.code ?? null, detail: String(e?.message ?? err).slice(0, 200) }, 500);
  }
});
