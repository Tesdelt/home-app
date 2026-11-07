// Ukázka (#/ukazka): všechny komponenty design systému ve všech stavech na
// jedné stránce. Není v menu, slouží ke kontrole vzhledu ve světlém i tmavém
// režimu. Nesahá na data, všechno je tu napevno. Popis je v CLAUDE.md.

import { ICONS, escapeHtml, toast, undoToast, openSheet, openMenu, emptyState, toggleFold, money, budgetColor, rowGestures, markNew, blink, planMeter } from '../ui.js';
import { drawChart } from '../chart.js';
import { openCooking } from './cooking.js';

export const title = 'Ukázka';
export const tab = 'vice';

// Pruh limitu s barvou podle naplnění (jako v Penězích)
const bar = (part) => `<span class="budget-bar${part > 1 ? ' is-over' : ''}"><span style="width: ${Math.min(1, part) * 100}%; background: ${budgetColor(part)}"></span></span>`;

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
  const swatches = ['bg', 'surface', 'surface-2', 'border', 'text', 'text-2', 'text-3', 'accent', 'accent-2', 'accent-soft', 'danger', 'who-1', 'who-2', 'who-both', 'flow-in', 'flow-out', 'flow-move', 'chart-1', 'chart-2', 'chart-3'];
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

    <p class="section-label">Ikony modulů v podkladu</p>
    <div class="demo-row">${[['ukoly', 'tasks'], ['nakup', 'cart'], ['penize', 'wallet'], ['recepty', 'recipe'], ['administrativa', 'folder'], ['wishlist', 'gift'], ['bucketlist', 'star'], ['info', 'home']]
      .map(([mod, icon]) => `<span class="demo-icon-box mod-${mod}" title="${mod}">${ICONS[icon]}</span>`).join('')}</div>

    <p class="section-label">Přechod, stín, karta měsíce</p>
    <div class="demo-row">
      <span class="demo-swatch" style="background: linear-gradient(135deg, var(--accent), var(--accent-2))" title="hlavní tlačítko"></span>
      <span class="demo-swatch" style="background: var(--surface); box-shadow: var(--shadow)" title="--shadow"></span>
      <span class="demo-swatch flow-card" title="karta posledního měsíce"></span>
    </div>

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
      <button type="button" class="btn btn-small" data-demo="cook">Režim vaření</button>
    </div>

    <p class="section-label">Přepínač zapnuto / vypnuto</p>
    <section class="card">
      <div class="switch-row"><span>Zvuk na tomto počítači</span><button type="button" class="switch" role="switch" aria-checked="true" aria-label="Zapnuto" data-demo="switch"></button></div>
      <div class="switch-row" style="margin: 0"><span>Vypnuto</span><button type="button" class="switch" role="switch" aria-checked="false" aria-label="Vypnuto" data-demo="switch"></button></div>
    </section>

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
    <ul class="item-list group demo-new" style="margin: var(--s3) 0" hidden></ul>
    <div class="demo-row">
      <button type="button" class="btn btn-small" data-demo="new">Přidat ukázkový řádek</button>
      <button type="button" class="btn btn-small" data-demo="new-soft">Přišlo od druhého</button>
      <a class="card tile mod-nakup demo-blink has-dot" href="#/ukazka" style="width: 160px; min-height: 0"><span class="card-icon">${ICONS.cart}</span><h2 class="card-title">Nákup</h2></a>
    </div>

    <p class="section-label">Skutečnost: karta a skupiny Příjmy / Výdaje / Přesuny</p>
    <section class="card summary flow-card">
      <div class="sum-row">
        <div class="sum-cell"><span class="sum-label">Přišlo</span><span class="sum-value flow-in">46 200 Kč</span></div>
        <div class="sum-cell"><span class="sum-label">Utraceno</span><span class="sum-value flow-out">31 251 Kč</span></div>
        <div class="sum-cell"><span class="sum-label">Odloženo</span><span class="sum-value flow-move">-4 704 Kč</span></div>
      </div>
      ${planMeter(31251, 40000)}
    </section>
    <section class="card summary flow-card">${planMeter(37000, 40000)}${planMeter(46800, 40000)}</section>
    <section class="card month-notes"><p class="month-note">Restaurace o 60 % nad průměrem</p><p class="month-note">Nové předplatné SkyShowtime 239 Kč</p></section>
    <ul class="item-list group money-cats" style="margin-bottom: var(--s3)">
      <li class="item fold money-cat has-items unsorted-fold" data-fold="u"><button type="button" class="item-main fold-head" aria-expanded="false"><span class="unsorted-icon">${ICONS.help}</span><span class="item-text"><span class="item-name">Nezařazené (2)</span></span></button>
        <div class="fold-body"><ul class="money-shops"><li class="money-shop is-unsorted"><button type="button" class="unsorted-item"><span>SkyShowtime</span><span>239 Kč</span></button></li><li class="money-shop is-unsorted"><button type="button" class="unsorted-item"><span>Petr Novák</span><span>500 Kč</span></button></li></ul></div></li>
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

    <p class="section-label">Pruh naplnění: limity (barva podle naplnění) a cíle</p>
    <ul class="item-list group money-cats" style="margin-bottom: var(--s3)">
      <li class="item money-cat"><div class="item-main"><span class="item-text"><span class="item-name">Trafika</span></span><span class="item-amount">150 <span class="budget-of">/ 3 000 Kč</span></span>${bar(0.0500)}</div></li>
      <li class="item money-cat"><div class="item-main"><span class="item-text"><span class="item-name">Potraviny</span></span><span class="item-amount">1 300 <span class="budget-of">/ 4 000 Kč</span></span>${bar(0.3250)}</div></li>
      <li class="item money-cat"><div class="item-main"><span class="item-text"><span class="item-name">Drogerie</span></span><span class="item-amount">520 <span class="budget-of">/ 1 000 Kč</span></span>${bar(0.5200)}</div></li>
      <li class="item money-cat"><div class="item-main"><span class="item-text"><span class="item-name">Restaurace a kavárny</span></span><span class="item-amount">2 400 <span class="budget-of">/ 3 000 Kč</span></span>${bar(0.8000)}</div></li>
      <li class="item money-cat"><div class="item-main"><span class="item-text"><span class="item-name">Doprava</span></span><span class="item-amount">1 900 <span class="budget-of">/ 2 000 Kč</span></span>${bar(0.9500)}</div></li>
      <li class="item money-cat"><div class="item-main"><span class="item-text"><span class="item-name">Oblečení</span></span><span class="item-amount">11 834 <span class="budget-of">/ 3 000 Kč</span></span>${bar(3.9447)}</div></li>
    </ul>
    <ul class="item-list group goals">
      <li class="item goal"><div class="item-main"><span class="item-text"><span class="item-name">Rezerva</span></span><span class="item-amount">60 000 <span class="budget-of">/ 60 000 Kč</span></span><span class="budget-bar is-goal"><span style="width: 100%"></span></span></div></li>
      <li class="item goal"><div class="item-main"><span class="item-text"><span class="item-name">Auto</span></span><span class="item-amount">52 000 <span class="budget-of">/ 114 000 Kč</span></span><span class="budget-bar is-goal"><span style="width: 46%"></span></span></div></li>
    </ul>
    <p class="goals-hint">při tomhle tempu: Auto v březnu 2027</p>

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

    <p class="section-label">Graf: sloupce s plánem, křivka s průměrem, zůstatek</p>
    <div class="demo-chart-bars"></div>
    <div class="demo-chart-line"></div>
    <section class="card chart-balance"><span class="chart-balance-value">126 480 Kč</span><span class="chart-balance-change">+18 200 Kč za 12 měsíců</span></section>
    <div class="chart-legend" style="margin-bottom: var(--s3)">
      <div class="chart-stat"><span class="chart-key" style="background: var(--chart-1)"></span>
        <span class="chart-stat-name">Oblečení<span class="chart-stat-range">průměr 1 949 Kč / měsíc · nejvíc zář 11 834 Kč · nejméně led 0 Kč</span></span>
        <span class="chart-stat-total"><span class="chart-stat-label">Dohromady</span>23 390 Kč</span></div>
    </div>

    <p class="section-label">Řádky s nabídkou: podržet / potáhnout, myší pravé tlačítko nebo tři tečky</p>
    <ul class="item-list group demo-gestures" style="margin-bottom: var(--s3)">
      <li class="item" data-id="a"><div class="item-bg" aria-hidden="true">Smazat</div><button type="button" class="item-main"><span class="item-text"><span class="item-name">Řádek s gesty</span><span class="item-sub">ťuknutí, podržení, potažení</span></span></button></li>
      <li class="item" data-id="b"><div class="item-bg" aria-hidden="true">Smazat</div><button type="button" class="item-main"><span class="item-text"><span class="item-name">Další řádek</span></span><span class="item-amount">1 200 Kč</span></button></li>
    </ul>

    <p class="section-label">Počítač: seznam a detail vedle sebe (vybraný řádek zvýrazněný)</p>
    <div class="split demo-split" style="height: auto; margin-bottom: var(--s3)">
      <div class="split-list"><ul class="item-list group">
        <li class="item who-2" data-id="x1"><button type="button" class="item-main has-stripe"><span class="item-text"><span class="item-name">Zalít kytky</span><span class="item-sub">dnes</span></span></button></li>
        <li class="item who-1 is-selected" data-id="x2"><button type="button" class="item-main has-stripe"><span class="item-text"><span class="item-name">Vynést odpad</span><span class="item-sub">zítra</span></span></button></li>
      </ul></div>
      <div class="split-detail"><div class="detail-head"><span class="detail-name">Vynést odpad</span></div></div>
    </div>

    <p class="section-label">Počítač: levý panel s rozbalenými podsekcemi</p>
    <div class="demo-side" style="margin-bottom: var(--s3)">
      <div class="side-group has-subs is-open"><div class="side-row"><a href="#/ukazka" class="side-item mod-penize is-active"><span class="side-icon">${ICONS.wallet}</span><span class="side-label">Peníze</span><span class="side-badge">2</span></a><button type="button" class="side-toggle" aria-expanded="true"></button></div>
        <div class="side-sub-wrap"><div class="side-sub"><a href="#/ukazka" class="side-subitem is-active">Tom</a><a href="#/ukazka" class="side-subitem">Domi</a><a href="#/ukazka" class="side-subitem">Společné</a><a href="#/ukazka" class="side-subitem">Grafy</a></div></div></div>
      <div class="side-group has-subs"><div class="side-row"><a href="#/ukazka" class="side-item mod-recepty"><span class="side-icon">${ICONS.recipe}</span><span class="side-label">Recepty</span><span class="side-badge"></span></a><button type="button" class="side-toggle" aria-expanded="false"></button></div>
        <div class="side-sub-wrap"><div class="side-sub"><a href="#/ukazka" class="side-subitem">Recepty</a></div></div></div>
    </div>

    <p class="section-label">Počítač: tabulka Peněz (buňka nad limitem podbarvená, Průměr a Limit)</p>
    <div class="mt-wrap demo-mt" style="margin-bottom: var(--s3)"><table class="mt-table">
      <thead><tr><th class="mt-corner"></th><th>srp 26</th><th>zář 26</th><th>říj 26</th><th class="mt-sum">Průměr</th><th class="mt-limit">Limit</th></tr></thead>
      <tbody>
        <tr class="mt-group"><th>Výdaje</th><td colspan="5"></td></tr>
        <tr class="mt-row has-items is-open"><th><span class="mt-name">Potraviny</span></th><td>3 312</td><td>3 294</td><td class="is-over" style="background: color-mix(in oklab, ${budgetColor(1.2)} 28%, transparent)">4 800</td><td class="mt-sum">3 802</td><td class="mt-limit">4 000</td></tr>
        <tr class="mt-item"><th>Albert</th><td>2 900</td><td>2 823</td><td>4 100</td><td class="mt-sum">3 274</td><td class="mt-limit"></td></tr>
        <tr class="mt-row"><th><span class="mt-name">Oblečení</span></th><td>3 274</td><td></td><td>11 834</td><td class="mt-sum">5 036</td><td class="mt-limit"><span class="mt-add">+</span></td></tr>
      </tbody></table></div>

    <p class="section-label">Počítač: úkoly ve sloupcích (cílový sloupec při přetahování zvýrazněný)</p>
    <div class="kb demo-kb" style="margin-bottom: var(--s3)">
      <section class="kb-col"><p class="section-label kb-head">Dnes<span class="kb-count">1</span></p><ul class="item-list kb-list">
        <li class="item kb-card who-1"><button type="button" class="item-main has-stripe"><span class="check-tap"><span class="check">${ICONS.check}</span></span><span class="item-text"><span class="item-name">Vynést odpad</span><span class="item-sub">dnes 18:00</span></span></button></li></ul></section>
      <section class="kb-col is-target"><p class="section-label kb-head">Tento týden<span class="kb-count"></span></p><ul class="item-list kb-list"></ul></section>
      <section class="kb-col"><p class="section-label kb-head">Bez termínu<span class="kb-count">1</span></p><ul class="item-list kb-list">
        <li class="item kb-card who-any"><button type="button" class="item-main has-stripe"><span class="check-tap"><span class="check">${ICONS.check}</span></span><span class="item-text"><span class="item-name">Koupit dárek</span></span></button></li></ul></section>
    </div>

    <p class="section-label">Počítač: karta sekce na Domů</p>
    <section class="card home-card mod-wishlist demo-home" style="max-width: 380px; margin-bottom: var(--s3)">
      <a class="home-card-head" href="#/ukazka"><span class="card-icon">${ICONS.gift}</span><h2 class="card-title">Wishlist</h2></a>
      <div class="home-card-body"><ul class="item-list home-list">
        <li class="item who-1"><a class="item-main has-stripe" href="#/ukazka"><span class="item-text"><span class="item-name">Sluchátka</span><span class="item-sub">Do roka</span></span></a></li>
        <li class="item who-2"><a class="item-main has-stripe" href="#/ukazka"><span class="item-text"><span class="item-name">Batoh</span><span class="item-sub">Někdy</span></span></a></li>
      </ul><a class="home-more" href="#/ukazka">a dalších 3</a></div>
    </section>

    <p class="section-label">Ikony</p>
    <div class="demo-row">${Object.keys(ICONS).map((name) => `<span class="card-icon" title="${name}">${ICONS[name]}</span>`).join('')}</div>

    <p class="section-label">Prázdný stav</p>
    <section class="card">${emptyState('gift', 'Zatím žádná přání', 'Patří sem věci, které by udělaly radost, třeba nová sluchátka.')}</section>`;

  const endGestures = rowGestures(root.querySelector('.demo-gestures'), {
    onTap: () => toast('Ťuknutí'),
    onPress: () => toast('Upravit'),
    onSwipe: () => undoToast('Smazáno', () => toast('Vráceno')),
    actions: () => [{ label: 'Další akce', run: () => toast('Další akce') }],
  });

  // Ukázkové grafy (napevno, bez dat)
  const months = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04'];
  const flows = [
    { label: 'Přišlo', color: 'var(--flow-in)', values: [52000, 61000, 65854, 11900, 61560, 63954] },
    { label: 'Utraceno', color: 'var(--flow-out)', values: [41000, 58000, 47285, 35836, 44890, 37013] },
    { label: 'Odloženo', color: 'var(--flow-move)', values: [5000, -12000, 4930, 3200, 23222, 5832] },
  ];
  const endBars = drawChart(root.querySelector('.demo-chart-bars'), { months, series: flows, type: 'bars', format: money, lines: [{ value: 42000, color: 'var(--text-2)', label: 'plán' }] });
  const endLine = drawChart(root.querySelector('.demo-chart-line'), {
    months,
    series: [{ label: 'Potraviny', color: 'var(--chart-1)', values: [3900, 5200, 4083, 2134, 4822, 4338] }],
    lines: [{ value: 4080, color: 'var(--chart-1)', label: 'průměr' }],
    type: 'line',
    format: money,
  });

  root.addEventListener('click', (e) => {
    if (e.target.closest('a[href="#/ukazka"]')) e.preventDefault();
    const sideToggle = e.target.closest('.demo-side .side-toggle');
    if (sideToggle) sideToggle.closest('.side-group').classList.toggle('is-open');
    const head = e.target.closest('.fold-head');
    if (head) {
      toggleFold(head.closest('.fold'));
      return;
    }
    const btn = e.target.closest('[data-demo]');
    if (!btn) return;
    if (btn.dataset.demo === 'toast') toast('Uloženo');
    if (btn.dataset.demo === 'switch') btn.setAttribute('aria-checked', String(btn.getAttribute('aria-checked') !== 'true'));
    if (btn.dataset.demo === 'new' || btn.dataset.demo === 'new-soft') {
      // Nový řádek se zvýrazní (markNew); „od druhého“ jemně a karta blikne
      const list = root.querySelector('.demo-new');
      const id = `demo-${Date.now()}`;
      const soft = btn.dataset.demo === 'new-soft';
      markNew(id, { soft });
      list.hidden = false;
      list.insertAdjacentHTML('beforeend', row({ who: soft ? 'who-1' : 'who-2', name: soft ? 'Od Domi' : 'Nový řádek', sub: 'právě teď' }).replace('<li class="item ', `<li data-id="${id}" class="item `));
      if (soft) blink(root.querySelector('.demo-blink'));
    }
    if (btn.dataset.demo === 'cook') {
      const recipe = { id: 'demo', name: 'Palačinky', method: 'Smíchej mouku, mléko a vejce\n|| Mezitím rozehřej pánev\nUsmaž tenké palačinky', hints: [] };
      openCooking({ recipe, subs: [], ingredients: [{ name: 'Mléko', qty: '500 ml' }, { name: 'Vejce', qty: '2 ks' }, { name: 'Hladká mouka', qty: '250 g' }] }, {
        parseMethod: (m) => m.split('\n').reduce((steps, line) => (line.startsWith('||') ? (steps.at(-1).parts.push(line.slice(2).trim()), steps) : [...steps, { parts: [line] }]), []),
        methodHtml: (text) => escapeHtml(text),
      });
    }
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
  return () => {
    endBars();
    endLine();
    endGestures();
  };
}
