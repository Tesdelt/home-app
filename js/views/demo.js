// Ukázka (#/ukazka): všechny komponenty design systému ve všech stavech na
// jedné stránce. Není v menu, slouží ke kontrole vzhledu ve světlém i tmavém
// režimu. Nesahá na data, všechno je tu napevno. Popis je v CLAUDE.md.

import { ICONS, toast, undoToast, openSheet, openMenu, emptyState, toggleFold } from '../ui.js';

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
  const swatches = ['bg', 'surface', 'surface-2', 'border', 'text', 'text-2', 'text-3', 'accent', 'accent-soft', 'danger', 'who-1', 'who-2', 'who-both', 'flow-in', 'flow-out', 'flow-move'];
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
      <button type="button" aria-pressed="false">Společné</button>
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

    <p class="section-label">Dlaždice modulů</p>
    <div class="tiles" style="margin-bottom: var(--s3)">
      <a class="card tile mod-ukoly" href="#/ukazka"><span class="card-icon">${ICONS.tasks}</span><h2 class="card-title">Úkoly</h2><p class="card-line"><span class="is-late">1 po termínu</span></p></a>
      <a class="card tile mod-nakup" href="#/ukazka"><span class="card-icon">${ICONS.cart}</span><h2 class="card-title">Nákup</h2><p class="card-line">6 položek</p></a>
      <a class="card tile mod-penize" href="#/ukazka"><span class="card-icon">${ICONS.wallet}</span><h2 class="card-title">Peníze</h2><p class="card-line">1 k zaplacení</p></a>
      <a class="card tile mod-recepty" href="#/ukazka"><span class="card-icon">${ICONS.recipe}</span><h2 class="card-title">Recepty</h2><p class="card-line">12 receptů</p></a>
      <a class="card tile mod-administrativa" href="#/ukazka"><span class="card-icon">${ICONS.folder}</span><h2 class="card-title">Administrativa</h2><p class="card-line">1 končí do 30 dní</p></a>
      <a class="card tile mod-wishlist" href="#/ukazka"><span class="card-icon">${ICONS.gift}</span><h2 class="card-title">Wishlist</h2><p class="card-line">3 přání</p></a>
      <a class="card tile mod-bucketlist" href="#/ukazka"><span class="card-icon">${ICONS.star}</span><h2 class="card-title">Bucketlist</h2><p class="card-line">Prázdné</p></a>
      <a class="card tile mod-info" href="#/ukazka"><span class="card-icon">${ICONS.house}</span><h2 class="card-title">Byt</h2><p class="card-line">2 poznámky</p></a>
    </div>

    <p class="section-label">Řádky seznamu</p>
    <ul class="item-list group">
      <li class="cat-head">Po termínu</li>
      ${row({ who: 'who-2', name: 'Úkol pro Toma', sub: '<span class="is-late">včera</span> · týdně', prio: 3 })}
      <li class="cat-head">Dnes</li>
      ${row({ who: 'who-1', name: 'Úkol pro Domi', sub: 'dnes 18:00 · kroky 1/3', prio: 2 })}
      ${row({ who: 'who-both', name: 'Úkol pro oba', sub: 'dnes · hotovo Tom, zbývá Domi', prio: 1 })}
      ${row({ name: 'Úkol pro kohokoliv', sub: 'zítra', lock: true, prio: 2 })}
      ${row({ who: 'who-both', name: 'Společná platba', sub: 'čt 15. 10.', amount: '12 000 Kč' })}
      ${row({ who: 'who-2', name: 'Hotový úkol', sub: 'Tom 9:12', done: true })}
    </ul>

    <p class="section-label">Skutečnost: karta a skupiny Příjmy / Výdaje / Přesuny</p>
    <section class="card summary flow-card">
      <div class="sum-row">
        <div class="sum-cell"><span class="sum-label">Přišlo</span><span class="sum-value flow-in">46 200 Kč</span></div>
        <div class="sum-cell"><span class="sum-label">Utraceno</span><span class="sum-value flow-out">31 251 Kč</span></div>
        <div class="sum-cell"><span class="sum-label">Odloženo</span><span class="sum-value flow-move">-4 704 Kč</span></div>
      </div>
      <span class="sum-note">Plán 10 650 Kč</span>
    </section>
    <ul class="item-list group money-cats" style="margin-bottom: var(--s3)">
      <li class="cat-head"><span class="flow-dot flow-in"></span>Příjmy</li>
      <li class="item fold money-cat has-items" data-fold="w"><button type="button" class="item-main fold-head" aria-expanded="false"><span class="item-text"><span class="item-name">Práce</span></span><span class="item-amount">45 000 Kč</span></button>
        <div class="fold-body"><ul class="money-shops"><li class="money-shop"><span>Zaměstnavatel</span><span>45 000 Kč</span></li></ul></div></li>
      <li class="item fold money-cat" data-fold="x"><button type="button" class="item-main fold-head" aria-expanded="false"><span class="item-text"><span class="item-name">Ostatní příjmy</span></span><span class="item-amount">1 200 Kč</span></button>
        <div class="fold-body"><ul class="money-shops"></ul></div></li>
      <li class="cat-head"><span class="flow-dot flow-out"></span>Výdaje</li>
      <li class="item fold money-cat has-items" data-fold="r"><button type="button" class="item-main fold-head" aria-expanded="false"><span class="item-text"><span class="item-name">Restaurace a kavárny</span></span><span class="item-amount">6 707 Kč</span></button>
        <div class="fold-body"><ul class="money-shops"><li class="money-shop"><span>Piazza</span><span>2 799 Kč</span></li></ul></div></li>
      <li class="item fold money-cat has-items is-open" data-fold="p"><button type="button" class="item-main fold-head" aria-expanded="true"><span class="item-text"><span class="item-name">Potraviny</span></span><span class="item-amount">3 294 Kč</span></button>
        <div class="fold-body"><ul class="money-shops"><li class="money-shop"><span>Albert</span><span>2 823 Kč</span></li><li class="money-shop"><span>Prima pekárna</span><span>305 Kč</span></li><li class="money-shop"><span>Lidl</span><span>36 Kč</span></li><li class="money-shop"><span>Vratka zálohy</span><span>-20 Kč</span></li></ul></div></li>
      <li class="item fold money-cat" data-fold="o"><button type="button" class="item-main fold-head" aria-expanded="false"><span class="item-text"><span class="item-name">Ostatní</span></span><span class="item-amount">120 Kč</span></button>
        <div class="fold-body"><ul class="money-shops"></ul></div></li>
      <li class="cat-head"><span class="flow-dot flow-move"></span>Přesuny</li>
      <li class="item fold money-cat" data-fold="m1"><button type="button" class="item-main fold-head" aria-expanded="false"><span class="item-text"><span class="item-name">Ze spořáku</span></span><span class="item-amount">-18 025 Kč</span></button>
        <div class="fold-body"><ul class="money-shops"></ul></div></li>
      <li class="item fold money-cat" data-fold="m2"><button type="button" class="item-main fold-head" aria-expanded="false"><span class="item-text"><span class="item-name">Na spořák</span></span><span class="item-amount">13 321 Kč</span></button>
        <div class="fold-body"><ul class="money-shops"></ul></div></li>
    </ul>

    <p class="section-label">Peníze: kategorie plateb, sbalená a rozbalená</p>
    <ul class="item-list group" style="margin-bottom: var(--s3)">
      <li class="cat-head">Pravidelné</li>
      <li class="item fold has-items pay-cat who-both" data-fold="b"><button type="button" class="item-main fold-head has-stripe" aria-expanded="false"><span class="item-text"><span class="item-name">Bydlení</span><span class="item-sub">2 platby</span></span><span class="item-amount">19 200 Kč</span></button>
        <div class="fold-body"><ul class="item-list fold-items">
          ${row({ who: 'who-both', name: 'Nájem', sub: 'čt 1. 12.', amount: '18 000 Kč' })}
          ${row({ who: 'who-both', name: 'Energie', sub: 'po 15. 12.', amount: '1 200 Kč' })}
        </ul></div></li>
      <li class="item fold has-items pay-cat who-2 is-open" data-fold="o"><button type="button" class="item-main fold-head has-stripe" aria-expanded="true"><span class="item-text"><span class="item-name">OSVČ</span><span class="item-sub">3 platby</span></span><span class="item-amount">9 950 Kč</span></button>
        <div class="fold-body"><ul class="item-list fold-items">
          ${row({ who: 'who-2', name: 'ČSSZ', sub: 'so 20. 12.', amount: '5 005 Kč' })}
          ${row({ who: 'who-2', name: 'VZP', sub: 'so 8. 12.', amount: '3 143 Kč' })}
          ${row({ who: 'who-2', name: 'Záloha na daň', sub: 'čtvrtletně', amount: '1 802 Kč' })}
        </ul></div></li>
      ${row({ who: 'who-2', name: 'Telefon', sub: 'út 9. 12. · Komunikace', amount: '400 Kč' })}
    </ul>

    <p class="section-label">Ikony</p>
    <div class="demo-row">${Object.keys(ICONS).map((name) => `<span class="card-icon" title="${name}">${ICONS[name]}</span>`).join('')}</div>

    <p class="section-label">Prázdný stav</p>
    <section class="card">${emptyState('gift', 'Zatím žádná přání', 'Patří sem věci, které by udělaly radost, třeba nová sluchátka.')}</section>`;

  root.addEventListener('click', (e) => {
    if (e.target.closest('a[href="#/ukazka"]')) e.preventDefault();
    const head = e.target.closest('.fold-head');
    if (head) {
      toggleFold(head.closest('.fold'));
      return;
    }
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
