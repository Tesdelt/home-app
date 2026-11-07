// Peníze: nahoře přepínač segmentů (každý člen = jeho osobní účet, Společné =
// společný účet), pod ním souhrn za vybraný segment a jeden seznam po skupinách:
// Zaplatit (splatné do 7 dní a po termínu), Pravidelné, Jednorázové, Na dobu,
// dole Zaplacené. Ťuknutí = zaplaceno (se Zpět), podržení = úprava, potažení = smazat.

import * as store from '../store.js';
import { escapeHtml, ICONS, undoToast, openSheet, openMenu, rowGestures, holdKeyboard, money, whoClass, wireSegmented, emptyState, toggleFold, dragSort, budgetColor, isDesktop } from '../ui.js';
import { today, dueLabel, shiftMonth } from '../dates.js';
import { renderCharts } from './moneycharts.js';

export const title = 'Peníze';

const PERIODS = [
  { id: 'month', name: 'Měsíčně', short: 'měsíčně' },
  { id: 'quarter', name: 'Čtvrtletně', short: 'čtvrtletně' },
  { id: 'year', name: 'Ročně', short: 'ročně' },
];
const periodShort = (id) => PERIODS.find((p) => p.id === id)?.short ?? '';

const KINDS = [
  { id: 'recurring', name: 'Pravidelná', group: 'Pravidelné' },
  { id: 'once', name: 'Jednorázová', group: 'Jednorázové' },
  { id: 'term', name: 'Na dobu', group: 'Na dobu' },
];
const kindOf = (payment) => payment.kind ?? 'recurring';

const SHARED = 'Společné';
const EMPTY = {
  [store.SPLIT]: 'Platby ze společného účtu, třeba nájem nebo internet.',
  member: 'Platby z osobního účtu, třeba telefon nebo zálohy OSVČ.',
};

const MONTHS = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
// "2026-09" -> "Září 2026"
const monthName = (month) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1] ?? month} ${y}`;
};

// Kategorie skutečnosti (příjmy, výdaje, přesuny): [[název, částka, [[obchodník, součet], ...]], ...]
// od největší podle absolutní hodnoty (přesun z úspor zpět je záporný).
// Hodnota kategorie je { total, items }, starší zápis jen číslo (bez items).
// Položky (items) můžou být záporné (např. podíl spolubydlící u nájmu): kladné
// od největší, záporné na konec. Total kategorie je součet položek z dat, appka
// ho nepřepočítává.
const byAbs = (a, b) => Math.abs(b[1]) - Math.abs(a[1]);
const plusFirst = (a, b) => (a[1] < 0) - (b[1] < 0) || byAbs(a, b);
function categoriesOf(map) {
  const sorted = (entries) => entries.map(([name, value]) => [name, Number(value) || 0]).sort(plusFirst);
  return Object.entries(map ?? {})
    .map(([name, value]) => {
      const total = typeof value === 'object' && value ? value.total : value;
      const items = typeof value === 'object' && value ? sorted(Object.entries(value.items ?? {})) : [];
      return [name, Number(total) || 0, items];
    })
    .sort(byAbs);
}

// "v březnu 2027" (6. pád měsíce pro odhad naplnění cíle)
const MONTHS_IN = ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'];
const monthIn = (month) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS_IN[m - 1]} ${y}`;
};
const num = (v) => Math.round(v).toLocaleString('cs-CZ');

// Pruh naplnění (.budget-bar): podíl 0-1 (i víc). U limitu barva podle naplnění
// (budgetColor), u cíle (extra ' is-goal') pevná barva z CSS.
function budgetBar(part, extra = '') {
  const pct = Math.max(0, Math.min(1, part)) * 100;
  const color = extra.includes('is-goal') ? '' : `; background: ${budgetColor(part)}`;
  return `<span class="budget-bar${part > 1 ? ' is-over' : ''}${extra}"><span style="width: ${pct.toFixed(1)}%${color}"></span></span>`;
}

// Měsíčně / ročně v souhrnu a vybraný měsíc skutečnosti vydrží, dokud je appka
// otevřená. Rozbalená kategorie se nepamatuje, po návratu je vše sbalené.
let yearly = false;
let pickedMonth = null;

export async function render(el, { params, extraEl, subEl }) {
  // #/penize/grafy/<segment> jsou grafy Skutečnosti
  // Na počítači je graf rovnou vedle Skutečnosti, podstránka grafů tam nemá smysl
  // Na počítači #/penize/grafy vykreslí Peníze a odroluje na graf vedle Skutečnosti
  const chartFocus = params?.[0] === 'grafy';
  if (chartFocus && !isDesktop()) return renderCharts(el, params[1] || store.SPLIT, { subEl });
  if (chartFocus && params[1]) await store.setLocal('moneySegment', params[1]);

  const desktop = isDesktop();
  const root = document.createElement('div');
  el.append(root);
  // Počítač: sloupce se posouvají každý zvlášť. Vlevo segmenty (na počítači
  // schované, volí se v panelu), souhrn, cíle a platby; uprostřed Skutečnost;
  // od 1280 px vpravo graf, pod 1280 px graf mezi kartou Skutečnosti a kategoriemi.
  root.innerHTML = desktop ? `
    <div class="money-desk">
      <div class="money-col money-left">
        <div class="toolbar money-segments"><div class="segmented" role="tablist"></div></div>
        <div class="summary-root"></div>
        <div class="goals-root"></div>
        <div class="list-root"></div>
      </div>
      <div class="money-col money-mid">
        <div class="actual-root"><div class="actual-head"></div><div class="chart-slot"></div><div class="actual-cats"></div></div>
      </div>
      <div class="money-col money-right"></div>
    </div>` : `
    <div class="toolbar"><div class="segmented" role="tablist"></div></div>
    <div class="summary-root"></div>
    <div class="goals-root"></div>
    <div class="actual-root"><div class="actual-head"></div><div class="actual-cats"></div></div>
    <div class="list-root"></div>`;
  const chartRoot = desktop ? document.createElement('div') : null;
  let endWide = null;
  if (desktop) {
    chartRoot.className = 'chart-root';
    const desk = root.querySelector('.money-desk');
    const wideQuery = window.matchMedia('(min-width: 1280px)');
    // Graf se jen přesune, nepřekresluje se (šířku si přizpůsobí sám při resize)
    const place = () => {
      desk.classList.toggle('is-wide', wideQuery.matches);
      (wideQuery.matches ? root.querySelector('.money-right') : root.querySelector('.chart-slot')).append(chartRoot);
    };
    place();
    wideQuery.addEventListener('change', place);
    endWide = () => wideQuery.removeEventListener('change', place);
  }
  let chartSegment = null;
  let endEmbedded = null;

  // Graf v pravém sloupci (jen počítač). Ťuknutí na měsíc přepne Skutečnost.
  async function mountChart() {
    const want = desktop && months.length >= 2 ? segment : null;
    if (want === chartSegment) return;
    chartSegment = want;
    if (typeof endEmbedded === 'function') endEmbedded();
    endEmbedded = null;
    chartRoot?.replaceChildren();
    if (!want) return;
    endEmbedded = await renderCharts(chartRoot, want, {
      embedded: true,
      onMonth: (month) => {
        if (!months.some((m) => m.month === month)) return;
        pickedMonth = month;
        openCat = null;
        draw();
      },
    });
    if (chartFocus) chartRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const segEl = root.querySelector('.segmented');
  const summaryRoot = root.querySelector('.summary-root');
  const listRoot = root.querySelector('.list-root');
  const actualRoot = root.querySelector('.actual-root');
  const actualHead = root.querySelector('.actual-head');
  const actualCats = root.querySelector('.actual-cats');
  const goalsRoot = root.querySelector('.goals-root');
  let budgets = new Map(); // kategorie výdajů -> měsíční limit (vybraný segment)
  let months = [];
  let openCat = null; // nejvýš jedna rozbalená kategorie skutečnosti
  let openPayCat = null; // a nejvýš jedna rozbalená kategorie plateb

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'add-btn';
  addBtn.setAttribute('aria-label', 'Přidat platbu');
  addBtn.innerHTML = ICONS.plus;
  // V panelu nové platby se rovnou píše název
  addBtn.addEventListener('click', () => {
    holdKeyboard();
    openEdit(null);
  });
  extraEl.append(addBtn);

  let renderToken = 0;
  let members = await store.listMembers();
  const me = await store.getMe();
  // Vybraný segment si pamatuje každý telefon zvlášť, výchozí je přihlášený člen
  let segment = await store.getMeta('moneySegment', null);
  const segments = () => [...members, store.SPLIT];
  const validSegment = (value) => (segments().includes(value) ? value : (members.includes(me) ? me : store.SPLIT));
  segment = validSegment(segment);

  // Jde platbu odškrtnout jako zaplacenou?
  const payable = (p) => !p.done && (kindOf(p) === 'once' || Boolean(p.nextDue));

  // withCategory: v item-sub je i šedý název kategorie (mimo sbalenou kategorii)
  function row(payment, withCategory = true) {
    const kind = kindOf(payment);
    const sub = [];
    if (payment.done) {
      sub.push(kind === 'term' ? 'doplaceno' : `zaplaceno${payment.paidBy ? ` ${escapeHtml(payment.paidBy)}` : ''}`);
    } else {
      if (payment.nextDue) sub.push(payment.nextDue < today() ? `<span class="is-late">${dueLabel(payment.nextDue)}</span>` : dueLabel(payment.nextDue));
      if (kind !== 'once' && payment.period !== 'month') sub.push(periodShort(payment.period));
      if (kind === 'term' && payment.total) sub.push(`zbývá ${payment.remaining ?? payment.total} z ${payment.total}`);
    }
    if (withCategory && payment.category) sub.push(escapeHtml(payment.category));
    const can = payable(payment);
    return `<li class="item ${whoClass(payment.payer || store.SPLIT, members)}${payment.done ? ' is-done' : ''}" data-id="${escapeHtml(payment.id)}">
      <div class="item-bg" aria-hidden="true">Smazat</div>
      <button type="button" class="item-main has-stripe is-compact">
        ${can || payment.done ? `<span class="check">${ICONS.check}</span>` : '<span class="check is-empty"></span>'}
        <span class="item-text"><span class="item-name">${escapeHtml(payment.name)}</span>${sub.length ? `<span class="item-sub">${sub.join(' · ')}</span>` : ''}</span>
        <span class="item-amount">${money(payment.amount)}</span>
      </button>
    </li>`;
  }

  const byDue = (a, b) => (a.nextDue ?? '9').localeCompare(b.nextDue ?? '9') || b.amount - a.amount;
  const group = (label, payments) => (payments.length ? `<li class="cat-head">${label}</li>${payments.map((p) => row(p)).join('')}` : '');

  // Skupina Pravidelné / Jednorázové / Na dobu: platby se stejnou kategorií jsou
  // v jednom rozbalovacím řádku (název, počet, součet; pravidelné přepočtené na
  // měsíc). Kategorie s jedinou platbou je obyčejný řádek platby.
  function kindGroup(kind, label, payments) {
    if (!payments.length) return '';
    const byCat = new Map();
    for (const p of payments) {
      const key = p.category ? p.category.trim().toLocaleLowerCase('cs') : null;
      if (key) byCat.set(key, [...(byCat.get(key) ?? []), p]);
    }
    const entries = payments
      .filter((p) => !p.category || byCat.get(p.category.trim().toLocaleLowerCase('cs')).length < 2)
      .map((p) => ({ sort: p, html: row(p) }));
    for (const [key, list] of byCat) {
      if (list.length < 2) continue;
      const sum = list.reduce((acc, p) => acc + (kind === 'recurring' ? store.monthly(p) : (p.amount || 0)), 0);
      const first = [...list].sort(byDue)[0];
      entries.push({
        sort: { nextDue: first.nextDue, amount: sum },
        html: `<li class="item fold has-items pay-cat ${whoClass(list[0].payer || store.SPLIT, members)}${key === openPayCat ? ' is-open' : ''}" data-fold="${escapeHtml(key)}">
          <button type="button" class="item-main fold-head has-stripe" aria-expanded="${key === openPayCat}">
            <span class="item-text"><span class="item-name">${escapeHtml(list[0].category)}</span><span class="item-sub">${plural(list.length)}</span></span>
            <span class="item-amount">${money(sum)}</span>
          </button>
          <div class="fold-body"><ul class="item-list fold-items">${list.map((p) => row(p, false)).join('')}</ul></div>
        </li>`,
      });
    }
    entries.sort((a, b) => byDue(a.sort, b.sort));
    return `<li class="cat-head">${label}</li>${entries.map((e) => e.html).join('')}`;
  }
  const plural = (n) => `${n} ${n >= 2 && n <= 4 ? 'platby' : 'plateb'}`;

  async function draw() {
    const token = ++renderToken;
    members = await store.listMembers();
    segment = validSegment(segment);
    const [payments, summary, due, monthRows, budgetRows, goals] = await Promise.all([
      store.listPayments(), store.paymentsSummary(segment), store.duePayments(7), store.listMoneyMonths(segment),
      store.listBudgets(segment), store.listGoals(segment),
    ]);
    if (token !== renderToken) return;
    months = monthRows;
    budgets = new Map(budgetRows.map((b) => [b.category, b.monthlyLimit]));
    drawGoals(goals);
    drawActual(summary);
    mountChart();
    const inSeg = (p) => store.inPaymentSegment(p, segment, members);

    // Na počítači se segment volí v levém panelu, v hlavičce je jako podtitul
    if (desktop) {
      subEl.textContent = segment === store.SPLIT ? SHARED : segment;
      subEl.hidden = false;
    }

    // Přepínač segmentů s počtem plateb k zaplacení
    segEl.innerHTML = segments().map((value) => {
      const count = due.filter((p) => store.inPaymentSegment(p, value, members)).length;
      return `<button type="button" role="tab" data-segment="${escapeHtml(value)}" aria-pressed="${value === segment}">${escapeHtml(value === store.SPLIT ? SHARED : value)}${count ? ` <span class="seg-count is-alert">${count}</span>` : ''}</button>`;
    }).join('');

    const mine = payments.filter(inSeg);
    if (!mine.length && months.length) {
      summaryRoot.innerHTML = '';
      listRoot.innerHTML = '';
      return;
    }
    if (!mine.length) {
      summaryRoot.innerHTML = '';
      listRoot.innerHTML = emptyState('wallet', 'Zatím žádné platby', segment === store.SPLIT ? EMPTY[store.SPLIT] : EMPTY.member);
      return;
    }

    // Souhrn za vybraný segment: běžný měsíc (ťuknutím rok) a zbývající jednorázové
    const scale = yearly ? 12 : 1;
    summaryRoot.innerHTML = `<button type="button" class="card summary" data-action="scale" aria-label="Přepnout měsíčně a ročně">
        <div class="sum-row">
          <div class="sum-cell is-total"><span class="sum-label">${yearly ? 'Pravidelně za rok' : 'Pravidelně za měsíc'}</span><span class="sum-value">${money(summary.total * scale)}</span></div>
          ${summary.onceTotal ? `<div class="sum-cell"><span class="sum-label">Jednorázově zbývá</span><span class="sum-value">${money(summary.onceTotal)}</span></div>` : ''}
        </div>
      </button>`;

    // Jeden seznam po skupinách. Platba ze Zaplatit se dál neopakuje.
    const dueIds = new Set(due.map((p) => p.id));
    const toPay = due.filter(inSeg);
    const open = mine.filter((p) => !p.done && !dueIds.has(p.id)).sort(byDue);
    const done = mine.filter((p) => p.done).sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0));
    const rows = group('Zaplatit', toPay) + KINDS.map((k) => kindGroup(k.id, k.group, open.filter((p) => kindOf(p) === k.id))).join('');

    let out = rows ? `<ul class="item-list group">${rows}</ul>` : '';
    if (done.length) {
      out += `<div class="done-head">
          <p class="section-label">Zaplacené (${done.length})</p>
          <button type="button" class="btn btn-ghost btn-small" data-action="clear">Vyčistit</button>
        </div><ul class="item-list group">${done.map((p) => row(p)).join('')}</ul>`;
    }
    listRoot.innerHTML = out;
  }

  // Skutečnost z výpisů za vybraný měsíc: plán proti tomu, co opravdu odešlo,
  // a kategorie od největší. Segment bez měsíců sekci nemá.
  function drawActual(summary) {
    if (!months.length) {
      actualHead.innerHTML = '';
      actualCats.innerHTML = '';
      return;
    }
    const row = months.find((m) => m.month === pickedMonth) ?? months[0];
    // Skupiny Příjmy / Výdaje / Přesuny; barva skupiny je jen u čísla v kartě
    // a v tečce před nadpisem, řádky zůstávají neutrální
    const groups = [
      ['in', 'Příjmy', categoriesOf(row.incomes)],
      ['out', 'Výdaje', categoriesOf(row.categories)],
      ['move', 'Přesuny', categoriesOf(row.moves)],
    ];
    const saved = Object.values(row.moves ?? {}).reduce((sum, v) => sum + (Number(typeof v === 'object' && v ? v.total : v) || 0), 0);
    // Limity: plán = pravidelné platby + součet limitů, nad limity = co je přes
    const limitSum = [...budgets.values()].reduce((a, b) => a + b, 0);
    const overLimits = categoriesOf(row.categories)
      .reduce((sum, [name, amount]) => sum + (budgets.has(name) ? Math.max(0, amount - budgets.get(name)) : 0), 0);
    // Řádek kategorie; klíč má předponu skupiny, název se může opakovat.
    // Výdaj s limitem má "3 294 / 4 000 Kč" a pod názvem pruh naplnění.
    const fold = (group) => ([name, amount, items]) => {
      const key = `${group}:${name}`;
      const limit = group === 'out' ? budgets.get(name) : null;
      const value = limit ? `${num(amount)} <span class="budget-of">/ ${money(limit)}</span>` : money(amount);
      return `<li class="item fold money-cat${items.length ? ' has-items' : ''}${key === openCat ? ' is-open' : ''}" data-fold="${escapeHtml(key)}">
          <button type="button" class="item-main fold-head" aria-expanded="${key === openCat}"><span class="item-text"><span class="item-name">${escapeHtml(name)}</span>${limit ? budgetBar(amount / limit) : ''}</span><span class="item-amount">${value}</span></button>
          <div class="fold-body"><ul class="money-shops">${items.map(([who, value]) => `<li class="money-shop"><span>${escapeHtml(who)}</span><span>${money(value)}</span></li>`).join('')}</ul></div>
        </li>`;
    };
    // Všechny skupiny jsou v jednom seznamu, takže rozbalená je nejvýš jedna
    // kategorie napříč všemi. Prázdná skupina se nezobrazí.
    const lists = groups
      .filter(([, , cats]) => cats.length)
      .map(([id, label, cats]) => `<li class="cat-head"><span class="flow-dot flow-${id}"></span>${label}</li>${cats.map(fold(id)).join('')}`)
      .join('');
    actualHead.innerHTML = `
      <div class="toolbar actual-bar">
        <p class="section-label">Skutečnost</p>
        <button type="button" class="opt" data-action="month"><span class="opt-text">${escapeHtml(monthName(row.month))}</span></button>
        ${months.length >= 2 && !desktop ? `<a class="opt opt-icon" href="#/penize/grafy/${encodeURIComponent(segment)}" aria-label="Grafy">${ICONS.chart}</a>` : ''}
      </div>
      <section class="card summary flow-card">
        <div class="sum-row">
          <div class="sum-cell"><span class="sum-label">Přišlo</span><span class="sum-value flow-in">${money(row.income)}</span></div>
          <div class="sum-cell"><span class="sum-label">Utraceno</span><span class="sum-value flow-out">${money(row.outgo)}</span>${overLimits > 0 ? `<span class="sum-sub">z toho nad limity ${money(overLimits)}</span>` : ''}</div>
          <div class="sum-cell"><span class="sum-label">Odloženo</span><span class="sum-value flow-move">${money(saved)}</span></div>
        </div>
        <span class="sum-note">Plán ${money(summary.total + limitSum)}</span>
      </section>`;
    actualCats.innerHTML = lists ? `<ul class="item-list group money-cats">${lists}</ul>` : '';
  }

  // ---------- Cíle spoření ----------
  // Plní se odshora z posledního známého zůstatku. Pod nimi odhad podle průměrné
  // měsíční změny zůstatku za posledních 6 měsíců s daty.
  function drawGoals(goals) {
    const { map, anchored } = store.moneyBalances(months);
    if (!goals.length && !anchored) {
      goalsRoot.innerHTML = '';
      return;
    }
    const asc = [...months].sort((a, b) => a.month.localeCompare(b.month));
    const last = asc[asc.length - 1]?.month;
    let left = anchored && last ? map.get(last) : 0;
    const filled = goals.map((g) => {
      const have = Math.max(0, Math.min(g.target, left));
      left -= g.target;
      return { ...g, have };
    });

    // Průměrná měsíční změna zůstatku za posledních 6 měsíců s daty
    const recent = asc.slice(-6).map((r) => r.month).filter((m) => map.has(shiftMonth(m, -1)));
    const avg = recent.length ? recent.reduce((sum, m) => sum + map.get(m) - map.get(shiftMonth(m, -1)), 0) / recent.length : null;
    let hint = '';
    if (avg != null && anchored) {
      if (avg > 0) {
        const next = filled.find((g) => g.have < g.target);
        if (next) hint = `při tomhle tempu: ${next.name} v ${monthIn(shiftMonth(last, Math.ceil((next.target - next.have) / avg)))}`;
      } else {
        hint = `zůstatek za posledních 6 měsíců ubývá v průměru o ${money(Math.abs(avg))} měsíčně`;
      }
    }
    goalsRoot.innerHTML = `
      <div class="toolbar actual-bar">
        <p class="section-label">Cíle</p>
        <button type="button" class="opt" data-action="goals"><span class="opt-text">Upravit</span></button>
      </div>
      ${filled.length ? `<ul class="item-list group goals">${filled.map((g) => `<li class="item goal">
          <div class="item-main"><span class="item-text"><span class="item-name">${escapeHtml(g.name)}</span>${budgetBar(g.target ? g.have / g.target : 0, ' is-goal')}</span>
          <span class="item-amount">${num(g.have)} <span class="budget-of">/ ${money(g.target)}</span></span></div>
        </li>`).join('')}</ul>` : ''}
      ${hint ? `<p class="goals-hint">${escapeHtml(hint)}</p>` : ''}`;
  }

  // Panel s cíli: název a částka se ukládají samy, pořadí přetažením za úchyt,
  // potažení doleva smaže (Zpět), dole nový cíl tlačítkem Přidat
  function openGoals() {
    openSheet('Cíle', (body) => {
      body.innerHTML = `<ul class="item-list group goal-list"></ul>
        <form class="add-form goal-add" autocomplete="off">
          <input class="input" name="name" placeholder="Rezerva" aria-label="Název" autocapitalize="sentences">
          <input class="input goal-target" name="target" inputmode="numeric" placeholder="100 000" aria-label="Částka">
          <button type="submit" class="btn btn-primary">Přidat</button>
        </form>`;
      const listEl = body.querySelector('.goal-list');
      const form = body.querySelector('.goal-add');
      const parse = (text) => Number(String(text).replace(/\s/g, '').replace(',', '.')) || 0;
      const paint = async () => {
        const goals = await store.listGoals(segment);
        listEl.hidden = !goals.length;
        listEl.innerHTML = goals.map((g) => `<li class="item goal-row" data-id="${escapeHtml(g.id)}">
            <div class="item-bg" aria-hidden="true">Smazat</div>
            <div class="item-slide">
              <div class="item-main">
                <input class="input" name="name" value="${escapeHtml(g.name)}" aria-label="Název" autocapitalize="sentences">
                <input class="input goal-target" name="target" value="${escapeHtml(num(g.target))}" inputmode="numeric" aria-label="Částka">
              </div>
              <span class="order-grip" aria-hidden="true">≡</span>
            </div>
          </li>`).join('');
      };
      listEl.addEventListener('change', (e) => {
        const li = e.target.closest('[data-id]');
        if (!li) return;
        if (e.target.name === 'name' && e.target.value.trim()) store.updateGoal(li.dataset.id, { name: e.target.value.trim() });
        if (e.target.name === 'target') store.updateGoal(li.dataset.id, { target: parse(e.target.value) });
      });
      rowGestures(listEl, {
        pressLabel: null,
        onTap: () => {},
        onPress: () => {},
        onSwipe: async (id) => {
          const removed = await store.removeGoals([id]);
          await paint();
          if (removed.length) undoToast(`${removed[0].name}: smazáno`, async () => { await store.restoreGoals(removed); paint(); });
        },
      });
      dragSort(listEl, {
        item: '.goal-row',
        handle: '.order-grip',
        attr: 'data-id',
        onDrop: async (ids) => {
          await store.reorderGoals(ids);
          paint();
        },
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = form.elements.name.value.trim();
        if (!name) {
          form.elements.name.focus();
          return;
        }
        await store.addGoal(segment, { name, target: parse(form.elements.target.value) });
        form.reset();
        form.elements.name.focus();
        paint();
      });
      paint();
    });
  }

  // ---------- Limit kategorie výdajů ----------
  // Podržení řádku výdaje otevře panel s měsíčním limitem, ukládá se sám
  function openBudget(category) {
    holdKeyboard();
    openSheet(category, (body) => {
      const current = budgets.get(category);
      body.innerHTML = `<label class="field"><span>Měsíční limit</span>
        <input class="input" name="limit" inputmode="numeric" value="${current ? escapeHtml(num(current)) : ''}"></label>`;
      const input = body.querySelector('input');
      let timer = null;
      const commit = () => store.setBudget(segment, category, input.value);
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(commit, 500);
      });
      input.addEventListener('change', () => {
        clearTimeout(timer);
        commit();
      });
      input.focus();
    });
  }

  // Hlavička rozbalovacího řádku nemá rowGestures, podržení se hlídá tady
  let press = null;
  let swallowClick = false;
  actualRoot.addEventListener('pointerdown', (e) => {
    const head = e.target.closest('.money-cat[data-fold^="out:"] > .fold-head');
    if (!head) return;
    const category = head.closest('.fold').dataset.fold.slice(4);
    press = { x: e.clientX, y: e.clientY, timer: setTimeout(() => { press = null; swallowClick = true; openBudget(category); }, 500) };
  });
  actualRoot.addEventListener('pointermove', (e) => {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) {
      clearTimeout(press.timer);
      press = null;
    }
  });
  const endPress = () => {
    if (press) clearTimeout(press.timer);
    press = null;
  };
  actualRoot.addEventListener('pointerup', endPress);
  actualRoot.addEventListener('pointercancel', endPress);
  actualRoot.addEventListener('contextmenu', (e) => { if (e.target.closest('.fold-head')) e.preventDefault(); });

  root.addEventListener('click', async (e) => {
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    if (e.target.closest('[data-action="goals"]')) {
      openGoals();
      return;
    }
    // Kategorie (Skutečnost i platby) se rozbalí na místě, viz toggleFold
    const head = e.target.closest('.fold-head');
    if (head) {
      const li = head.closest('.fold');
      if (actualRoot.contains(li)) openCat = toggleFold(li);
      else openPayCat = toggleFold(li);
      return;
    }
    const monthBtn = e.target.closest('[data-action="month"]');
    if (monthBtn) {
      const current = (months.find((m) => m.month === pickedMonth) ?? months[0])?.month;
      openMenu(monthBtn, (menu, close) => {
        menu.innerHTML = months
          .map((m) => `<button type="button" class="menu-item" data-month="${escapeHtml(m.month)}" aria-pressed="${m.month === current}">${escapeHtml(monthName(m.month))}</button>`)
          .join('');
        menu.addEventListener('click', (ev) => {
          const item = ev.target.closest('[data-month]');
          if (!item) return;
          close();
          pickedMonth = item.dataset.month;
          openCat = null;
          draw();
        });
      });
      return;
    }
    if (e.target.closest('[data-action="scale"]')) {
      yearly = !yearly;
      draw();
      return;
    }
    if (e.target.closest('[data-action="clear"]')) {
      const removed = await store.clearDonePayments(segment);
      if (removed.length) undoToast(`Smazáno zaplacených: ${removed.length}`, () => store.restorePayments(removed));
      return;
    }
    const segBtn = e.target.closest('[data-segment]');
    if (segBtn) {
      segment = segBtn.dataset.segment;
      await store.setLocal('moneySegment', segment);
      draw();
    }
  });

  // ---------- Akce ----------

  async function tap(li) {
    const id = li.dataset.id;
    const payment = (await store.listPayments()).find((p) => p.id === id);
    if (!payment) return;
    // Zaplacenou jednorázovou jde ťuknutím vrátit, ostatní bez splatnosti jen upravit
    if (payment.done) {
      if (kindOf(payment) === 'once') await store.updatePayment(id, { done: false, paidAt: null, paidBy: null });
      else openEdit(id);
      return;
    }
    if (!payable(payment)) {
      openEdit(id);
      return;
    }
    li.classList.add('is-done');
    await new Promise((r) => setTimeout(r, 180));
    const result = await store.payPayment(id);
    if (result) undoToast(`${payment.name}: zaplaceno`, () => store.updatePayment(id, result.before));
  }

  async function deletePayment(id) {
    const removed = await store.removePayments([id]);
    if (removed.length) undoToast(`${removed[0].name}: smazáno`, () => store.restorePayments(removed));
  }

  // id = null založí novou platbu (druh podle sekce, na které zrovna jsme)
  async function openEdit(id) {
    const [payments, categories] = await Promise.all([store.listPayments(), store.paymentCategories()]);
    const existing = id ? payments.find((p) => p.id === id) : null;
    if (id && !existing) return;
    // Nová platba dostane plátce podle vybraného segmentu
    const p = existing ?? { name: '', amount: '', kind: 'recurring', period: 'month', payer: segment, nextDue: null, total: null };
    const payers = [...members.map((m) => [m, m]), [store.SPLIT, SHARED]];
    const payerValue = members.includes(p.payer) ? p.payer : store.SPLIT;

    openSheet(existing ? existing.name : 'Nová platba', (body, close) => {
      body.innerHTML = `<form class="edit-form" autocomplete="off">
        <div class="field"><span>Druh</span>
          <div class="segmented" data-name="kind">
            ${KINDS.map((k) => `<button type="button" data-value="${k.id}" aria-pressed="${k.id === kindOf(p)}">${k.name}</button>`).join('')}
          </div></div>
        <label class="field"><span>Název</span>
          <input class="input" name="name" value="${escapeHtml(p.name)}" placeholder="Nájem" autocapitalize="sentences" required></label>
        <label class="field"><span>Kategorie</span>
          <input class="input" name="category" value="${escapeHtml(p.category ?? '')}" autocapitalize="sentences"></label>
        <div class="chips cat-picks"></div>
        <label class="field"><span>Částka v Kč</span>
          <input class="input" name="amount" inputmode="decimal" value="${escapeHtml(p.amount === '' ? '' : String(p.amount).replace('.', ','))}" placeholder="0"></label>
        <div class="field"><span>Kdo platí</span>
          <div class="segmented" data-name="payer">
            ${payers.map(([value, name]) => `<button type="button" class="${whoClass(value, members)}" data-value="${escapeHtml(value)}" aria-pressed="${value === payerValue}">${escapeHtml(name)}</button>`).join('')}
          </div></div>
        <div class="field" data-for="recurring term"><span>Jak často</span>
          <div class="segmented" data-name="period">
            ${PERIODS.map((x) => `<button type="button" data-value="${x.id}" aria-pressed="${x.id === (p.period ?? 'month')}">${x.name}</button>`).join('')}
          </div></div>
        <label class="field" data-for="term"><span>Kolik plateb celkem</span>
          <input class="input" name="total" inputmode="numeric" value="${escapeHtml(p.total ?? '')}" placeholder="12"></label>
        <label class="field" data-for="term" ${existing ? '' : 'hidden data-never'}><span>Kolik jich ještě zbývá</span>
          <input class="input" name="remaining" inputmode="numeric" value="${escapeHtml(p.remaining ?? '')}"></label>
        <label class="field"><span data-due-label>Splatnost</span>
          <input class="input" type="date" name="nextDue" value="${escapeHtml(p.nextDue ?? '')}"></label>
        ${existing
          ? '<button type="button" class="btn btn-ghost btn-danger btn-small detail-delete" data-action="delete">Smazat</button>'
          : '<button type="submit" class="btn btn-primary btn-block">Přidat</button>'}
      </form>`;

      const f = body.querySelector('form');
      const picked = wireSegmented(f);

      // Čipy s kategoriemi, které už v domácnosti jsou: ťuknutí pole vyplní,
      // ťuknutí na vybranou ho vymaže
      const catInput = f.elements.category;
      const catChips = f.querySelector('.cat-picks');
      const drawCatChips = () => {
        const typed = catInput.value.trim().toLocaleLowerCase('cs');
        catChips.innerHTML = categories
          .map((c) => `<button type="button" class="chip pick-chip" data-category="${escapeHtml(c.name)}" aria-pressed="${c.name.toLocaleLowerCase('cs') === typed}">${escapeHtml(c.name)}</button>`)
          .join('');
        catChips.hidden = !categories.length;
      };
      drawCatChips();
      catInput.addEventListener('input', drawCatChips);
      catChips.addEventListener('pointerdown', (e) => { if (e.target.closest('.chip')) e.preventDefault(); });
      catChips.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-category]');
        if (!chip) return;
        catInput.value = chip.getAttribute('aria-pressed') === 'true' ? '' : chip.dataset.category;
        drawCatChips();
        catInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
      // Pole, která se týkají jen některého druhu platby
      const syncKind = () => {
        const kind = picked('kind') || 'recurring';
        f.querySelectorAll('[data-for]').forEach((field) => {
          field.hidden = !field.dataset.for.split(' ').includes(kind) || field.hasAttribute('data-never');
        });
        f.querySelector('[data-due-label]').textContent = kind === 'once' ? 'Splatnost (nepovinné)' : 'Nejbližší splatnost (nepovinné)';
      };
      syncKind();
      f.querySelector('[data-name="kind"]').addEventListener('click', () => setTimeout(syncKind, 0));
      if (!existing) f.elements.name.focus();

      // Nová platba se přidá tlačítkem, existující se ukládá sama při každé změně
      const commit = async () => {
        const name = f.elements.name.value.trim();
        if (!name) return false;
        const kind = picked('kind') || 'recurring';
        const amount = Number(f.elements.amount.value.replace(/\s/g, '').replace(',', '.'));
        const count = (field) => {
          const n = parseInt(f.elements[field].value, 10);
          return n > 0 ? n : null;
        };
        const total = kind === 'term' ? count('total') : null;
        const data = {
          name,
          kind,
          amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0,
          period: kind === 'once' ? 'month' : (picked('period') || 'month'),
          payer: picked('payer') || store.SPLIT,
          nextDue: f.elements.nextDue.value || null,
          category: f.elements.category.value.trim() || null,
          total,
        };
        if (existing) {
          let remaining = null;
          let done = existing.done;
          if (kind === 'term') {
            const typed = count('remaining');
            // Doplacená zůstane doplacená, dokud jí někdo zbývající platby nevrátí
            if (existing.done && !typed) remaining = 0;
            else {
              remaining = Math.min(typed ?? total ?? 0, total ?? Infinity) || total;
              done = false;
            }
          }
          await store.updatePayment(id, { ...data, remaining, done });
        } else {
          await store.addPayment(data);
          // Platba se přidala jinam: přepnout na její segment, ať je vidět
          if (data.payer !== segment) {
            segment = data.payer;
            await store.setLocal('moneySegment', segment);
          }
        }
        return true;
      };
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (existing) f.querySelector(':focus')?.blur();
        else if (await commit()) close();
      });
      if (existing) {
        f.addEventListener('change', commit);
        f.querySelectorAll('.segmented').forEach((seg) => seg.addEventListener('click', () => setTimeout(commit, 0)));
      }
      f.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
        close();
        deletePayment(id);
      });
    });
  }

  const endGesture = rowGestures(listRoot, { onTap: tap, onPress: openEdit, onSwipe: deletePayment });

  await draw();
  const unsubscribe = store.subscribe(draw);
  return () => {
    unsubscribe();
    endGesture();
    if (typeof endEmbedded === 'function') endEmbedded();
    endWide?.();
  };
}
