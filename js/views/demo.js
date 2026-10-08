// Ukázka (#/ukazka): všechny komponenty design systému ve všech stavech na
// jedné stránce. Není v menu, slouží ke kontrole vzhledu ve světlém i tmavém
// režimu. Nesahá na data, všechno je tu napevno. Popis je v CLAUDE.md.

import { ICONS, toast, undoToast, openSheet, openMenu, emptyState } from '../ui.js';

export const title = 'Ukázka';
export const tab = 'vice';

const row = ({ who = 'who-any', name, sub = '', done = false, prio = 0, lock = false, amount = '' }) => `<li class="item ${who}${done ? ' is-done' : ''}">
    <div class="item-slide">
      <button type="button" class="item-main has-stripe" aria-pressed="${done}">
        <span class="check-tap"><span class="check">${ICONS.check}</span></span>
        <span class="item-text"><span class="item-name">${name}</span>${sub ? `<span class="item-sub">${sub}</span>` : ''}</span>
        ${lock ? `<span class="item-lock">${ICONS.lock}</span>` : ''}
        ${prio ? `<span class="prio prio-${prio}">${prio}</span>` : ''}
        ${amount ? `<span class="item-amount">${amount}</span>` : ''}
      </button>
    </div>
  </li>`;

export async function render(el, { extraEl }) {
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'add-btn';
  addBtn.setAttribute('aria-label', 'Přidat');
  addBtn.innerHTML = ICONS.plus;
  addBtn.addEventListener('click', () => toast('Hlavní tlačítko stránky'));
  extraEl.append(addBtn);

  const root = document.createElement('div');
  el.append(root);
  const swatches = ['bg', 'surface', 'surface-2', 'border', 'text', 'text-2', 'text-3', 'accent', 'accent-soft', 'danger', 'who-1', 'who-2', 'who-both'];
  root.innerHTML = `
    <p class="section-label">Písmo</p>
    <section class="card">
      <p style="margin: 0; font-size: var(--fs-title); font-weight: 700">Nadpis stránky</p>
      <p style="margin: 0; font-size: var(--fs-section); font-weight: 600">Nadpis sekce</p>
      <p style="margin: 0; font-size: var(--fs-text)">Běžný text</p>
      <p style="margin: 0; font-size: var(--fs-small); color: var(--text-2)">Drobný text</p>
    </section>

    <p class="section-label">Barvy</p>
    <div class="demo-row">${swatches.map((name) => `<span class="demo-swatch" style="background: var(--${name})" title="${name}"></span>`).join('')}</div>

    <p class="section-label">Rozestupy 4 / 8 / 12 / 16 / 24</p>
    <div class="demo-row">${[1, 2, 3, 4, 5].map((n) => `<span class="demo-swatch" style="width: var(--s${n}); background: var(--text-3)"></span>`).join('')}</div>

    <p class="section-label">Tlačítka</p>
    <div class="demo-row">
      <button type="button" class="btn btn-primary">Přidat</button>
      <button type="button" class="btn">Běžné</button>
      <button type="button" class="btn btn-ghost">Vedlejší</button>
      <button type="button" class="btn btn-ghost btn-danger">Smazat</button>
      <button type="button" class="btn" disabled>Vypnuté</button>
    </div>
    <div class="demo-row">
      <button type="button" class="btn btn-small">Malé</button>
      <button type="button" class="btn btn-small shop-btn" data-demo="menu">Nabídka</button>
      <button type="button" class="btn btn-small" data-demo="sheet">Spodní panel</button>
      <button type="button" class="btn btn-small" data-demo="toast">Toast</button>
      <button type="button" class="btn btn-small" data-demo="undo">Toast se Zpět</button>
    </div>

    <p class="section-label">Přepínač</p>
    <div class="segmented" style="margin-bottom: var(--s3)">
      <button type="button" aria-pressed="true">Tom</button>
      <button type="button" aria-pressed="false">Domi</button>
      <button type="button" aria-pressed="false">Napůl</button>
    </div>

    <p class="section-label">Čipy a malá tlačítka</p>
    <div class="chips" style="margin-bottom: var(--s2)">
      <button type="button" class="chip">Mléko</button>
      <button type="button" class="chip cat-chip">Pečivo</button>
      <button type="button" class="chip cat-chip">Zelenina</button>
    </div>
    <div class="opts">
      <button type="button" class="opt opt-who who-2"><span class="legend-dot who-2"></span><span class="opt-text">Tom</span></button>
      <button type="button" class="opt opt-who who-1"><span class="legend-dot who-1"></span><span class="opt-text">Domi</span></button>
      <button type="button" class="opt opt-who who-both"><span class="legend-dot who-both"></span><span class="opt-text">Oba</span></button>
      <button type="button" class="opt opt-due"><span class="opt-text">zítra</span></button>
      <button type="button" class="opt opt-due is-late"><span class="opt-text">včera</span></button>
      <button type="button" class="opt opt-icon is-set" aria-pressed="true">${ICONS.lock}</button>
      <button type="button" class="opt opt-icon">${ICONS.bell}</button>
    </div>

    <p class="section-label">Pole</p>
    <label class="field"><span>Název</span><input class="input" placeholder="Nájem"></label>

    <p class="section-label">Karta a dlaždice</p>
    <a class="card" href="#/ukazka">
      <div class="card-head"><span class="card-icon">${ICONS.tasks}</span><h2 class="card-title">Úkoly</h2><span class="card-meta">na dnes 2</span></div>
      <p class="card-line"><span class="is-late">Zalít kytky včera</span>, Vynést odpad 18:00</p>
    </a>
    <div class="tiles" style="margin-bottom: var(--s3)">
      <a class="card tile" href="#/ukazka"><div class="card-head"><span class="card-icon">${ICONS.recipe}</span><h2 class="card-title">Recepty</h2></div><p class="card-line">12 receptů</p></a>
      <a class="card tile" href="#/ukazka"><div class="card-head"><span class="card-icon">${ICONS.folder}</span><h2 class="card-title">Administrativa</h2></div><p class="card-line"><span class="is-late">1 končí do 30 dní</span></p></a>
      <a class="card tile" href="#/ukazka"><div class="card-head"><span class="card-icon">${ICONS.star}</span><h2 class="card-title">Bucketlist</h2></div><p class="card-line">Zatím prázdné</p></a>
    </div>

    <p class="section-label">Řádky seznamu</p>
    <ul class="item-list group">
      <li class="cat-head">Po termínu</li>
      ${row({ who: 'who-2', name: 'Úkol pro Toma', sub: '<span class="is-late">včera</span> · týdně', prio: 3 })}
      <li class="cat-head">Dnes</li>
      ${row({ who: 'who-1', name: 'Úkol pro Domi', sub: 'dnes 18:00 · kroky 1/3', prio: 2 })}
      ${row({ who: 'who-both', name: 'Úkol pro oba', sub: 'dnes · hotovo Tom, zbývá Domi', prio: 1 })}
      ${row({ name: 'Úkol pro kohokoliv', sub: 'zítra', lock: true, prio: 2 })}
      ${row({ who: 'who-both', name: 'Platba napůl', sub: 'čt 15. 10.', amount: '12 000 Kč' })}
      ${row({ who: 'who-2', name: 'Hotový úkol', sub: 'Tom 9:12', done: true })}
    </ul>

    <p class="section-label">Ikony</p>
    <div class="demo-row">${Object.keys(ICONS).map((name) => `<span class="card-icon" title="${name}">${ICONS[name]}</span>`).join('')}</div>

    <p class="section-label">Prázdný stav</p>
    <section class="card">${emptyState('gift', 'Zatím žádná přání', 'Patří sem věci, které by udělaly radost, třeba nová sluchátka.')}</section>`;

  root.addEventListener('click', (e) => {
    if (e.target.closest('a[href="#/ukazka"]')) e.preventDefault();
    const btn = e.target.closest('[data-demo]');
    if (!btn) return;
    if (btn.dataset.demo === 'toast') toast('Uloženo');
    if (btn.dataset.demo === 'undo') undoToast('Mléko: smazáno', () => toast('Vráceno'));
    if (btn.dataset.demo === 'menu') {
      openMenu(btn, (menu, close) => {
        menu.innerHTML = `<button type="button" class="menu-item" aria-pressed="true">Termín</button>
          <button type="button" class="menu-item">Důležitost</button>
          <button type="button" class="menu-item is-danger">Smazat</button>`;
        menu.addEventListener('click', close);
      });
    }
    if (btn.dataset.demo === 'sheet') {
      openSheet('Spodní panel', (body, close) => {
        body.innerHTML = `<label class="field"><span>Název</span><input class="input" placeholder="Nájem"></label>
          <button type="button" class="btn btn-primary btn-block">Přidat</button>`;
        body.querySelector('button').addEventListener('click', close);
      });
    }
  });
}
