// Push notifikace: zapnutí a vypnutí na tomto telefonu.
//
// Telefon si u Applu / Googlu vyžádá adresu pro doručování (odběr) a uloží ji
// do tabulky push_subscriptions. Ráno ji použije funkce
// supabase/functions/send-reminders a pošle upozornění na platby k zaplacení.
// Na iPhonu to funguje jen v appce přidané na plochu (iOS 16.4 a novější).

import { supabase } from './supabase.js';
import { VAPID_PUBLIC_KEY } from './config.js';

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

// 'on' | 'off' | 'denied' | 'install' (iPhone: nejdřív přidat na plochu) | 'unsupported'
export async function status() {
  if (!('PushManager' in window) || !('Notification' in window)) return isIos && !isStandalone ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  if (!reg) return 'unsupported';
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

// Musí se volat z ťuknutí uživatele, jinak se iPhone na povolení nezeptá
export async function enable(householdId) {
  if ((await Notification.requestPermission()) !== 'granted') return status();
  const reg = await registration();
  if (!reg) return 'unsupported';
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const { data } = await supabase.auth.getSession();
  const keys = sub.toJSON().keys ?? {};
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: sub.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    household_id: householdId,
    user_id: data?.session?.user?.id,
  }, { onConflict: 'endpoint' });
  if (error) {
    await sub.unsubscribe().catch(() => {});
    throw new Error('Zapnutí se nepovedlo. Zkontrolujte připojení a zkuste to znovu.');
  }
  return 'on';
}

// Vypne upozornění na tomto telefonu (volá se i při odhlášení)
export async function disable() {
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
