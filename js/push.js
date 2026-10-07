// Push notifikace: zapnutí a vypnutí na tomto telefonu.
//
// Telefon si u Applu / Googlu vyžádá adresu pro doručování (odběr) a uloží ji
// do tabulky push_subscriptions. Ráno ji použije funkce
// supabase/functions/send-reminders a pošle upozornění na platby k zaplacení.
// Na iPhonu to funguje jen v appce přidané na plochu (iOS 16.4 a novější).

import { supabase } from './supabase.js';
import { VAPID_PUBLIC_KEY } from './config.js';
import * as store from './store.js';

const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function keyBytes(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

// Chce uživatel na tomto telefonu upozornění? Jednou zapnutá mají zůstat
// zapnutá, dokud je sám nevypne (meta "pushWanted"). Telefon totiž odběr občas
// zahodí sám (hlavně iPhone) a appka by jinak chtěla zapnutí potvrzovat znovu.
// Kdo upozornění povolil ještě před zavedením téhle volby, bere se, že je chce.
async function wanted() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  return (await store.getMeta('pushWanted', null)) ?? true;
}

// 'on' | 'off' | 'denied' | 'install' (iPhone: nejdřív přidat na plochu) | 'unsupported'
export async function status() {
  if (!('PushManager' in window) || !('Notification' in window)) return isIos && !isStandalone ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  if (!reg) return 'unsupported';
  return (await wanted()) ? 'on' : 'off';
}

// Zajistí platný odběr a jeho zápis na serveru. Jde volat kdykoli, když už
// je upozornění v telefonu povolené (iPhone se pak znovu neptá).
async function subscribe(householdId) {
  const reg = await registration();
  if (!reg) return false;
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const { data } = await supabase.auth.getSession();
  const userId = data?.session?.user?.id;
  if (!userId) return false;
  const keys = sub.toJSON().keys ?? {};
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: sub.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    household_id: householdId,
    user_id: userId,
  }, { onConflict: 'endpoint' });
  return !error;
}

// Musí se volat z ťuknutí uživatele, jinak se iPhone na povolení nezeptá
export async function enable(householdId) {
  if ((await Notification.requestPermission()) !== 'granted') return status();
  await store.setLocal('pushWanted', true);
  if (!(await subscribe(householdId))) throw new Error('Zapnutí se teď nepovedlo dokončit. Zkusí se to samo znovu po připojení.');
  return 'on';
}

// Tichá oprava: když mají být upozornění zapnutá, obnoví odběr, který telefon
// mezitím zahodil, a znovu ho zapíše na server. Volá se po přihlášení a při
// každém návratu do appky. Nic se neptá a nic neukazuje.
export async function ensure(householdId) {
  try {
    if (!householdId || !('PushManager' in window) || !(await wanted())) return;
    await subscribe(householdId);
  } catch (err) {
    console.warn('Obnova upozornění se nepovedla', err);
  }
}

// Zruší odběr na tomto telefonu. forget = true (tlačítko Vypnout) si navíc
// zapamatuje, že uživatel upozornění nechce. Při odhlášení se jen ruší odběr:
// po dalším přihlášení se upozornění zapnou sama.
export async function disable({ forget = true } = {}) {
  if (forget) await store.setLocal('pushWanted', false);
  const reg = await registration().catch(() => null);
  const sub = await reg?.pushManager?.getSubscription().catch(() => null);
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint).then(() => {}, () => {});
  await sub.unsubscribe().catch(() => {});
}

// Ukáže zkušební upozornění přímo z telefonu (ověří povolení a vzhled)
export async function test() {
  const reg = await registration();
  await reg?.showNotification('Domácnost', { body: 'Takhle bude vypadat upozornění na platbu.', icon: 'icons/icon-192.png', data: { url: '#/penize' } });
}
