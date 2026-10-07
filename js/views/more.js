// Více: věci, které se otevírají jen občas. Nastavení, záloha, info.

import * as store from '../store.js';
import * as auth from '../auth.js';
import * as push from '../push.js';
import { APP_VERSION } from '../config.js';
import { escapeHtml, ICONS, toast } from '../ui.js';

export const title = 'Více';

export async function render(el) {
  const root = document.createElement('div');
  el.append(root);

  async function draw() {
    const me = await store.getMe();
    const { email } = auth.getState();
    const pushState = await push.status();
    root.innerHTML = `
      <p class="section-label">Na tomto telefonu</p>
      <section class="card">
        <div class="card-head"><span class="card-icon">${ICONS.user}</span><h2 class="card-title">Kdo jsem</h2><span class="card-meta">${escapeHtml(me ?? '')}</span></div>
        <p class="card-meta" style="margin: 0 0 10px">${escapeHtml(email ?? '')}</p>
        <button type="button" class="btn" data-action="signout">Odhlásit</button>
      </section>

      <section class="card">
        <div class="card-head"><span class="card-icon">${ICONS.sync}</span><h2 class="card-title">Sdílení mezi telefony</h2></div>
        <p class="card-meta" style="margin: 0">${escapeHtml(syncLabel(store.syncStatus()))}</p>
      </section>

      <section class="card">
        <div class="card-head"><span class="card-icon">${ICONS.bell}</span><h2 class="card-title">Upozornění</h2><span class="card-meta">${pushState === 'on' ? 'zapnuto' : ''}</span></div>
        <p class="card-meta" style="margin: 0 0 10px">${escapeHtml(PUSH_TEXT[pushState])}</p>
        ${pushState === 'off' ? '<button type="button" class="btn btn-primary" data-action="push-on">Zapnout upozornění</button>' : ''}
        ${pushState === 'on' ? `<div class="btn-row">
          <button type="button" class="btn" data-action="push-test">Zkusit</button>
          <button type="button" class="btn" data-action="push-off">Vypnout</button>
        </div>` : ''}
      </section>

      <p class="section-label">Záloha</p>
      <section class="card">
        <p class="card-meta" style="margin: 0 0 10px">Uloží nákupní seznam a historii do souboru. Obnovení položky ze zálohy přidá do společného seznamu.</p>
        <div class="btn-row">
          <button type="button" class="btn" data-action="export">${ICONS.download} Stáhnout zálohu</button>
          <button type="button" class="btn" data-action="import">Obnovit ze zálohy</button>
        </div>
        <input type="file" accept="application/json,.json" hidden>
      </section>

      <p class="hint">Domácnost · verze ${APP_VERSION}</p>`;
  }

  root.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'signout') signOut(e.target.closest('button'));
    if (action === 'push-test') push.test();
    if (action === 'push-on' || action === 'push-off') {
      e.target.closest('button').disabled = true;
      try {
        if (action === 'push-on') await push.enable(auth.getState().householdId);
        else await push.disable();
      } catch (err) {
        toast(err?.message || 'Nepovedlo se');
      }
      draw();
    }
    if (action === 'export') exportBackup();
    if (action === 'import') root.querySelector('input[type="file"]').click();
  });

  root.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('Obnovit data ze zálohy? Položky ze zálohy se přidají do společného seznamu.')) return;
    try {
      await store.importAll(JSON.parse(await file.text()));
      toast('Data obnovena ze zálohy');
    } catch (err) {
      toast(err?.message || 'Zálohu se nepodařilo načíst');
    }
  });

  await draw();
  const offData = store.subscribe(draw);
  const offSync = store.subscribeSync(draw);
  return () => {
    offData();
    offSync();
  };
}

const PUSH_TEXT = {
  on: 'Ráno přijde upozornění, když je potřeba něco zaplatit. Týká se jen plateb, které platíte vy nebo napůl.',
  off: 'Appka umí ráno upozornit na platby k zaplacení. Zapíná se na každém telefonu zvlášť.',
  denied: 'Upozornění jsou pro appku zakázaná. Povolíte je v Nastavení telefonu - Oznámení - Domácnost.',
  install: 'Na iPhonu fungují upozornění jen v appce přidané na plochu (Safari - Sdílet - Přidat na plochu).',
  unsupported: 'Tento prohlížeč upozornění neumí.',
};

function syncLabel({ pending, online, error, lastSyncAt }) {
  if (pending) {
    const wait = `Čeká na odeslání: ${pending}.`;
    return online ? `${wait} Odešle se při nejbližší synchronizaci.` : `${wait} Odešle se, až bude připojení.`;
  }
  if (!online) return 'Bez připojení. Změny se uloží v telefonu a odešlou se později.';
  if (error) return 'Synchronizace se teď nedaří, appka to zkusí znovu.';
  if (!lastSyncAt) return 'Synchronizuji…';
  const time = new Date(lastSyncAt).toLocaleTimeString('cs-CZ', { hour: 'numeric', minute: '2-digit' });
  return `Seznam je společný pro oba telefony. Naposledy synchronizováno v ${time}.`;
}

async function signOut(button) {
  button.disabled = true;
  // Odhlášení smaže lokální kopii, neodeslané změny by se ztratily
  if (!(await auth.signOut())) {
    const lose = confirm('Některé změny se ještě neodeslaly a odhlášením se ztratí. Odhlásit i tak?');
    if (lose) await auth.signOut({ force: true });
    else button.disabled = false;
  }
}

async function exportBackup() {
  const data = await store.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `domacnost-zaloha-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
