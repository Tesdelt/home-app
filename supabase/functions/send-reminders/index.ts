// Supabase Edge Function: ranní upozornění na platby k zaplacení.
//
// Jednou denně ji zavolá GitHub Actions (.github/workflows/denni-kontrola.yml).
// Najde nezaplacené platby se splatností dnes nebo dřív a pošle push
// notifikaci tomu, kdo je má platit (platbu napůl oběma).
//
// Bezpečnost:
//   * Funkci smí zavolat kdokoliv, proto nic nevrací (jen počet odeslaných)
//     a o každé platbě pošle nejvýš jedno upozornění denně (payment_reminders).
//   * Do databáze chodí servisním klíčem, který Supabase funkci dodá sám.
//     V kódu žádný klíč není. Soukromý VAPID klíč je v Supabase Secrets.
//
// Nasazení: Supabase dashboard -> Edge Functions, název send-reminders,
// vypnuté "Verify JWT", Secrets VAPID_PUBLIC_KEY a VAPID_PRIVATE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const APP_URL = 'https://tesdelt.github.io/home-app/';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails(APP_URL, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

// Dnešní datum v Česku jako RRRR-MM-DD
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());

const money = (amount: number) => `${Math.round(amount).toLocaleString('cs-CZ')} Kč`;

Deno.serve(async () => {
  try {
    const day = today();
    const { data: payments, error } = await db
      .from('payments')
      .select('id, household_id, name, amount, payer, next_due')
      .eq('deleted', false)
      .eq('done', false)
      .lte('next_due', day);
    if (error) throw error;
    if (!payments?.length) return Response.json({ sent: 0 });

    // Co už dnes upozornění dostalo, znovu nepůjde
    const { data: logged } = await db.from('payment_reminders').select('payment_id').eq('day', day);
    const already = new Set((logged ?? []).map((row) => row.payment_id));
    const fresh = payments.filter((p) => !already.has(p.id));
    if (!fresh.length) return Response.json({ sent: 0 });

    const households = [...new Set(fresh.map((p) => p.household_id))];
    const [{ data: members }, { data: subs }] = await Promise.all([
      db.from('household_members').select('user_id, household_id, display_name').in('household_id', households),
      db.from('push_subscriptions').select('endpoint, p256dh, auth, user_id, household_id').in('household_id', households),
    ]);

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
      });
      for (const sub of (subs ?? []).filter((s) => s.user_id === userId)) {
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
    }

    await db.from('payment_reminders').upsert(fresh.map((p) => ({ payment_id: p.id, day })));
    return Response.json({ sent });
  } catch (err) {
    console.error(err);
    return Response.json({ error: 'failed' }, { status: 500 });
  }
});
