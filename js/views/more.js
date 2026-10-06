// Více: věci, které se otevírají jen občas. Nastavení, záloha, info.

import * as store from '../store.js';
import { PEOPLE, APP_VERSION } from '../config.js';
import { escapeHtml, ICONS, toast } from '../ui.js';

export const title = 'Více';

export async function render(el) {
  const root = document.createElement('div');
  el.append(root);

  async function draw() {
    const me = await store.getMe();
    root.innerHTML = `
      <p class="section-label">Na tomto telefonu</p>
      <section class="card">
        <div class="card-head"><span class="card-icon">${ICONS.user}</span><h2 class="card-title">Kdo jsem</h2></div>
        <div class="segmented">
          ${PEOPLE.map((p) => `<button type="button" data-me="${escapeHtml(p)}" aria-pressed="${p === me}">${escapeHtml(p)}</button>`).join('')}
        </div>
      </section>

      <section class="card is-muted">
        <div class="card-head"><span class="card-icon">${ICONS.sync}</span><h2 class="card-title">Sdílení mezi telefony</h2><span class="card-meta">brzy</span></div>
        <p class="card-meta" style="margin: 0">Zatím má každý telefon vlastní data. Společný seznam pro oba přijde v další verzi.</p>
      </section>

      <p class="section-label">Záloha</p>
      <section class="card">
        <p class="card-meta" style="margin: 0 0 10px">Uloží všechna data appky do souboru. Hodí se před větší změnou nebo výměnou telefonu.</p>
        <div class="btn-row">
          <button type="button" class="btn" data-action="export">${ICONS.download} Stáhnout zálohu</button>
          <button type="button" class="btn" data-action="import">Obnovit ze zálohy</button>
        </div>
        <input type="file" accept="application/json,.json" hidden>
      </section>

      <p class="hint">Domácnost · verze ${APP_VERSION}</p>`;
  }

  root.addEventListener('click', async (e) => {
    const meBtn = e.target.closest('[data-me]');
    if (meBtn) {
      await store.setMe(meBtn.dataset.me);
      return;
    }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'export') exportBackup();
    if (action === 'import') root.querySelector('input[type="file"]').click();
  });

  root.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('Obnovit data ze zálohy? Současná data v appce se nahradí.')) return;
    try {
      await store.importAll(JSON.parse(await file.text()));
      toast('Data obnovena ze zálohy');
    } catch (err) {
      toast(err?.message || 'Zálohu se nepodařilo načíst');
    }
  });

  await draw();
  return store.subscribe(draw);
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
