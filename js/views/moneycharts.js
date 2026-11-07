// Peníze, Grafy (#/penize/grafy/<segment>): vývoj Skutečnosti po měsících.
// Nad grafem řádek voleb: Co (nejvýš 3 řady: Přišlo, Utraceno, Odloženo nebo
// kategorie či jedna její položka; Zůstatek je výlučná volba a vždy křivka),
// Období a Typ (sloupce / křivka). S jednou řadou je v grafu čárkovaný průměr,
// u Utraceno i plán (pravidelné platby segmentu za měsíc).
// Volby si pamatuje každý telefon zvlášť, pro každý segment zvlášť (meta
// moneyChart). Kreslí sdílený js/chart.js.

import * as store from '../store.js';
import { escapeHtml, ICONS, openMenu, money, emptyState } from '../ui.js';
import { drawChart } from '../chart.js';
import { shiftMonth, monthRange } from '../dates.js';

const balances = (rows) => store.moneyBalances(rows);

const SHARED = 'Společné';
const MAX_SERIES = 3;

// Řady: { g: 'flow' | 'in' | 'out' | 'move', c: klíč nebo kategorie, i: položka }
const FLOWS = [
  { g: 'flow', c: 'income', label: 'Přišlo', color: 'var(--flow-in)' },
  { g: 'flow', c: 'outgo', label: 'Utraceno', color: 'var(--flow-out)' },
  { g: 'flow', c: 'saved', label: 'Odloženo', color: 'var(--flow-move)' },
  { g: 'flow', c: 'balance', label: 'Zůstatek', color: 'var(--text)' },
];
const GROUPS = [['out', 'Výdaje', 'categories'], ['in', 'Příjmy', 'incomes'], ['move', 'Přesuny', 'moves']];
const PALETTE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'];
const PERIODS = [['3', '3 měsíce'], ['6', '6 měsíců'], ['12', '12 měsíců'], ['year', 'Letos'], ['all', 'Vše']];
const DEFAULTS = { series: [{ g: 'flow', c: 'outgo' }], period: '12', from: null, to: null, type: 'bars' };

const keyOf = (s) => JSON.stringify([s.g, s.c, s.i ?? null]);
const totalOf = (value) => Number(typeof value === 'object' && value ? value.total : value) || 0;

const shortMonth = (month) => {
  const [y, m] = month.split('-').map(Number);
  return `${['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'][m - 1]} ${y}`;
};

const movesOf = (row) => Object.values(row?.moves ?? {}).reduce((sum, v) => sum + totalOf(v), 0);
const isBalance = (s) => s.g === 'flow' && s.c === 'balance';
const monthShort = (month) => ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'][Number(month.split('-')[1]) - 1];
// Poslední den měsíce: "2026-10" -> "31. 10. 2026"
const lastDay = (month) => {
  const [y, m] = month.split('-').map(Number);
  return `${new Date(y, m, 0).getDate()}. ${m}. ${y}`;
};
const signed = (v) => `${v > 0 ? '+' : ''}${money(v)}`;

// Hodnota řady v jednom měsíci (měsíc bez řádku = 0)
function valueOf(row, s) {
  if (!row) return 0;
  if (s.g === 'flow') {
    if (s.c === 'income') return Number(row.income) || 0;
    if (s.c === 'outgo') return Number(row.outgo) || 0;
    return movesOf(row);
  }
  const map = row[GROUPS.find(([g]) => g === s.g)[2]] ?? {};
  const value = map[s.c];
  if (s.i == null) return totalOf(value);
  return Number(value?.items?.[s.i]) || 0;
}

// ---------- Období (sdílí ho graf i tabulka v Penězích) ----------
// rows = řádky money_months vzestupně podle měsíce, prefs = { period, from, to }.
// Měsíce v období; bez dat na začátku a na konci se vynechají, uprostřed zůstanou.
export function periodMonthsOf(rows, prefs) {
  if (!rows.length) return [];
  const first = rows[0].month;
  const last = rows[rows.length - 1].month;
  let from = first;
  let to = last;
  if (['3', '6', '12'].includes(prefs.period)) from = shiftMonth(last, -(Number(prefs.period) - 1));
  if (prefs.period === 'year') from = `${new Date().getFullYear()}-01`;
  if (prefs.period === 'custom') {
    from = prefs.from || first;
    to = prefs.to || last;
    if (from > to) [from, to] = [to, from];
  }
  const has = new Set(rows.map((r) => r.month));
  const months = monthRange(from, to);
  while (months.length && !has.has(months[0])) months.shift();
  while (months.length && !has.has(months[months.length - 1])) months.pop();
  return months;
}

export function periodLabelOf(rows, prefs) {
  if (prefs.period === 'custom') {
    const months = periodMonthsOf(rows, prefs);
    return months.length ? `${shortMonth(months[0])} - ${shortMonth(months[months.length - 1])}` : 'Vybrat';
  }
  return PERIODS.find(([id]) => id === prefs.period)?.[1] ?? '12 měsíců';
}

// Nabídka Období u tlačítka. onChange(patch) dostane { period, from, to }.
export function openPeriodMenu(btn, rows, getPrefs, onChange) {
  openMenu(btn, (menu, close) => {
    const months = rows.map((r) => r.month);
    const paint = () => {
      const prefs = getPrefs();
      const current = periodMonthsOf(rows, prefs);
      menu.innerHTML = PERIODS.map(([id, label]) => `<button type="button" class="menu-item" data-period="${id}" aria-pressed="${prefs.period === id}">${label}</button>`).join('')
        + `<p class="menu-head">Vybrat</p>
          <label class="menu-item menu-pick" aria-pressed="${prefs.period === 'custom'}">Od<span class="menu-pick-value">${escapeHtml(prefs.period === 'custom' && current.length ? shortMonth(current[0]) : '')}</span>
            <input type="month" name="from" value="${escapeHtml(prefs.from ?? months[0] ?? '')}" aria-label="Od"></label>
          <label class="menu-item menu-pick" aria-pressed="${prefs.period === 'custom'}">Do<span class="menu-pick-value">${escapeHtml(prefs.period === 'custom' && current.length ? shortMonth(current[current.length - 1]) : '')}</span>
            <input type="month" name="to" value="${escapeHtml(prefs.to ?? months[months.length - 1] ?? '')}" aria-label="Do"></label>`;
    };
    paint();
    menu.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-period]');
      if (!b) return;
      close();
      await onChange({ period: b.dataset.period });
    });
    // Výběr z kalendáře se uloží hned a nabídka zůstane otevřená
    menu.addEventListener('change', async (e) => {
      const input = e.target.closest('input[type="month"]');
      if (!input?.value) return;
      const prefs = getPrefs();
      await onChange({ period: 'custom', from: prefs.from ?? months[0], to: prefs.to ?? months[months.length - 1], [input.name]: input.value });
      paint();
    });
  });
}

// Uložené volby grafu pro segment (meta moneyChart); tabulka z nich bere období
export async function loadChartPrefs(segment) {
  const all = await store.getMeta('moneyChart', {});
  return { ...DEFAULTS, ...(all[segment] ?? {}) };
}
export async function saveChartPrefs(segment, patch) {
  const all = await store.getMeta('moneyChart', {});
  await store.setLocal('moneyChart', { ...all, [segment]: { ...DEFAULTS, ...(all[segment] ?? {}), ...patch } });
}

// embedded: graf vložený do Peněz na počítači (bez vlastní hlavičky, pevná výška),
// onMonth(month) se zavolá po ťuknutí na měsíc v grafu
export async function renderCharts(el, segment, { subEl, embedded = false, onMonth = null } = {}) {
  if (!embedded) {
    // Hlavička jako u ostatních podstránek: šipka zpět na Peníze, název Grafy,
    // segment jako šedý podtitul
    document.getElementById('screen-title').textContent = 'Grafy';
    document.getElementById('topbar-back').href = '#/penize';
    document.title = 'Grafy · Domácnost';
    subEl.textContent = segment === store.SPLIT ? SHARED : segment;
    subEl.hidden = false;
  }
  const root = document.createElement('div');
  if (embedded) root.className = 'chart-embedded';
  el.append(root);

  root.innerHTML = `
    <div class="toolbar chart-bar">
      <button type="button" class="opt" data-action="what"><span class="opt-text"></span></button>
      <button type="button" class="opt" data-action="period"><span class="opt-text"></span></button>
      <div class="segmented" data-name="type">
        <button type="button" data-type="bars">Sloupce</button>
        <button type="button" data-type="line">Křivka</button>
      </div>
    </div>
    <div class="chart-balance-root"></div>
    <div class="chart-root"></div>
    <div class="chart-legend"></div>`;

  const whatBtn = root.querySelector('[data-action="what"]');
  const periodBtn = root.querySelector('[data-action="period"]');
  const chartEl = root.querySelector('.chart-root');
  const legendEl = root.querySelector('.chart-legend');
  const balanceEl = root.querySelector('.chart-balance-root');
  const typeEl = root.querySelector('[data-name="type"]');

  let rows = [];
  let plan = 0;
  let prefs = { ...DEFAULTS };
  let endChart = null;

  async function loadPrefs() {
    const all = await store.getMeta('moneyChart', {});
    prefs = { ...DEFAULTS, ...(all[segment] ?? {}) };
    if (!prefs.series?.length) prefs.series = DEFAULTS.series;
    // Starší volby mohly mít Zůstatek spolu s jinými řadami: zůstane jen Zůstatek
    const balance = prefs.series.find(isBalance);
    if (balance && prefs.series.length > 1) prefs.series = [balance];
  }
  async function savePrefs() {
    const all = await store.getMeta('moneyChart', {});
    await store.setLocal('moneyChart', { ...all, [segment]: prefs });
  }

  // Všechny kategorie a položky, které se v datech segmentu vyskytují, se součtem
  // za vybrané období; řazené od největšího
  function catalog() {
    const inPeriod = new Set(periodMonths());
    return GROUPS.map(([g, label, field]) => {
      const cats = new Map();
      for (const row of rows) {
        const counted = inPeriod.has(row.month);
        for (const [cat, value] of Object.entries(row[field] ?? {})) {
          const entry = cats.get(cat) ?? { cat, sum: 0, items: new Map() };
          if (counted) entry.sum += totalOf(value);
          for (const [item, amount] of Object.entries((typeof value === 'object' && value?.items) || {})) {
            entry.items.set(item, (entry.items.get(item) ?? 0) + (counted ? Number(amount) || 0 : 0));
          }
          cats.set(cat, entry);
        }
      }
      const bySum = (a, b) => Math.abs(b.sum) - Math.abs(a.sum) || a.cat.localeCompare(b.cat, 'cs');
      return {
        g,
        label,
        cats: [...cats.values()].map((c) => ({ ...c, items: [...c.items].map(([item, sum]) => ({ cat: item, sum })).sort(bySum) })).sort(bySum),
      };
    }).filter((group) => group.cats.length);
  }

  // Popisek a barva řady: toky mají svou barvu, ostatní z palety podle pořadí
  function decorate(series) {
    let next = 0;
    const anchored = balances(rows).anchored;
    return series.map((s) => {
      const flow = FLOWS.find((f) => s.g === 'flow' && f.c === s.c);
      // Bez známého zůstatku z výpisu je to jen pohyb celkem od nuly
      if (flow?.c === 'balance' && !anchored) return { ...s, label: 'Pohyb celkem', color: flow.color };
      if (flow) return { ...s, label: flow.label, color: flow.color };
      return { ...s, label: s.i == null ? s.c : `${s.c} · ${s.i}`, color: PALETTE[next++ % PALETTE.length] };
    });
  }

  // Měsíce v období. Bez dat na začátku a na konci se vynechají, uprostřed zůstanou (0).
  const periodMonths = () => periodMonthsOf(rows, prefs);

  // "za 12 měsíců", "od začátku roku", "za celé období"
  function changeLabel() {
    if (prefs.period === 'year') return 'od začátku roku';
    if (prefs.period === 'all') return 'za celé období';
    return `za ${periodLabel()}`;
  }

  const periodLabel = () => periodLabelOf(rows, prefs);

  function draw() {
    const series = decorate(prefs.series);
    // Karta a křivka zůstatku jen když je vybraný výhradně Zůstatek
    const balanceOnly = series.length === 1 && isBalance(series[0]);
    whatBtn.querySelector('.opt-text').textContent = `${series[0].label}${series.length > 1 ? ` +${series.length - 1}` : ''}`;
    periodBtn.querySelector('.opt-text').textContent = periodLabel();
    // Zůstatek je vždy křivka, přepínač typu se schová
    typeEl.hidden = balanceOnly;
    root.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.type === prefs.type));
    if (endChart) endChart();
    endChart = null;

    const months = periodMonths();
    if (!months.length) {
      balanceEl.innerHTML = '';
      chartEl.innerHTML = emptyState('chart', 'Žádná data', 'V tomhle období nejsou žádné měsíce, třeba zkuste období Vše.');
      legendEl.innerHTML = '';
      return;
    }
    const byMonth = new Map(rows.map((r) => [r.month, r]));
    const balance = balances(rows).map;
    const valueAt = (m, s) => (isBalance(s) ? balance.get(m) ?? 0 : valueOf(byMonth.get(m), s));
    const data = series.map((s) => ({ ...s, values: months.map((m) => valueAt(m, s)) }));

    // Zůstatek: nahoře velké číslo posledního zůstatku a změna za období
    if (balanceOnly) {
      const values = data[0].values;
      const last = values[values.length - 1];
      const before = balance.get(shiftMonth(months[0], -1));
      const change = last - (before ?? values[0]);
      balanceEl.innerHTML = `<section class="card chart-balance">
          <span class="chart-balance-value">${escapeHtml(money(last))}</span>
          <span class="chart-balance-change">k ${escapeHtml(lastDay(months[months.length - 1]))} · ${escapeHtml(signed(change))} ${escapeHtml(changeLabel())}</span>
        </section>`;
    } else {
      balanceEl.innerHTML = '';
    }

    // Pod grafem souhrn každé řady: průměr, nejvíc a nejméně, vpravo dohromady
    // (u zůstatku stav na konci období)
    legendEl.innerHTML = data.map((s) => {
      const avg = s.values.reduce((a, b) => a + b, 0) / s.values.length;
      const hi = s.values.indexOf(Math.max(...s.values));
      const lo = s.values.indexOf(Math.min(...s.values));
      const total = isBalance(s) ? s.values[s.values.length - 1] : s.values.reduce((a, b) => a + b, 0);
      const facts = `průměr ${money(avg)}${isBalance(s) ? '' : ' / měsíc'} · nejvíc ${monthShort(months[hi])} ${money(s.values[hi])} · nejméně ${monthShort(months[lo])} ${money(s.values[lo])}`;
      return `<div class="chart-stat">
        <span class="chart-key" style="background: ${s.color}"></span>
        <span class="chart-stat-name">${escapeHtml(s.label)}<span class="chart-stat-range">${escapeHtml(facts)}</span></span>
        <span class="chart-stat-total"><span class="chart-stat-label">${isBalance(s) ? 'Na konci' : 'Dohromady'}</span>${escapeHtml(money(total))}</span>
      </div>`;
    }).join('');

    // Čárkované čáry: průměr u jediné řady, plán u Utraceno
    const lines = [];
    if (data.length === 1) {
      const avg = data[0].values.reduce((a, b) => a + b, 0) / data[0].values.length;
      lines.push({ value: avg, color: data[0].color, label: 'průměr' });
    }
    if (plan && data.some((s) => s.g === 'flow' && s.c === 'outgo')) lines.push({ value: plan, color: 'var(--text-2)', label: 'plán' });

    // Graf zabere výšku, která zbude mezi volbami a souhrnem nad spodní lištou
    const view = document.getElementById('view');
    const free = embedded ? 300 : view.getBoundingClientRect().bottom - chartEl.getBoundingClientRect().top - legendEl.offsetHeight - 40;
    endChart = drawChart(chartEl, {
      months, series: data, type: balanceOnly ? 'line' : prefs.type, format: money, height: free, lines,
      onSelect: onMonth ? (i) => onMonth(months[i]) : null,
    });
  }

  async function load() {
    rows = (await store.listMoneyMonths(segment)).slice().sort((a, b) => a.month.localeCompare(b.month));
    plan = (await store.paymentsSummary(segment)).total;
    draw();
  }

  // ---------- Co: nejvýš 3 řady ----------
  function openWhat() {
    const expanded = new Set();
    openMenu(whatBtn, (menu) => {
      menu.classList.add('chart-menu');
      const paint = () => {
        const chosen = new Set(prefs.series.map(keyOf));
        const full = chosen.size >= MAX_SERIES;
        // Vybraná řada má fajfku, při třech vybraných jsou ostatní tlumené.
        // Zůstatek je výlučný, jde vybrat vždy (ostatní řady zruší).
        const item = (s, label, sum = null, extra = '') => {
          const on = chosen.has(keyOf(s));
          const blocked = full && !on && !isBalance(s);
          return `<button type="button" class="menu-item chart-pick${extra}" data-series="${escapeHtml(keyOf(s))}" aria-pressed="${on}"${blocked ? ' disabled' : ''}>
            <span class="menu-check">${on ? ICONS.check : ''}</span><span class="menu-label">${escapeHtml(label)}</span>${sum == null ? '' : `<span class="menu-sum">${escapeHtml(money(sum))}</span>`}</button>`;
        };
        menu.innerHTML = `<p class="menu-head">Hlavní</p>${FLOWS.map((f) => item(f, f.label)).join('')}`
          + catalog().map(({ g, label, cats }) => `<p class="menu-head">${label}</p>${cats.map(({ cat, sum, items }) => {
            const open = expanded.has(`${g}:${cat}`);
            return `<div class="menu-row">${item({ g, c: cat }, cat, sum)}${items.length ? `<button type="button" class="icon-btn menu-expand${open ? ' is-open' : ''}" data-expand="${escapeHtml(`${g}:${cat}`)}" aria-label="Položky" aria-expanded="${open}"></button>` : ''}</div>
              ${open ? items.map((it) => item({ g, c: cat, i: it.cat }, it.cat, it.sum, ' menu-sub')).join('') : ''}`;
          }).join('')}`).join('');
      };
      paint();
      menu.addEventListener('click', async (e) => {
        const expand = e.target.closest('[data-expand]');
        if (expand) {
          const key = expand.dataset.expand;
          if (expanded.has(key)) expanded.delete(key);
          else expanded.add(key);
          paint();
          return;
        }
        const btn = e.target.closest('[data-series]');
        if (!btn || btn.disabled) return;
        const [g, c, i] = JSON.parse(btn.dataset.series);
        const key = btn.dataset.series;
        const has = prefs.series.some((s) => keyOf(s) === key);
        // Aspoň jedna řada zůstane vždy
        if (has && prefs.series.length === 1) return;
        const picked = i == null ? { g, c } : { g, c, i };
        // Zůstatek je výlučný: jeho výběr zruší ostatní řady a naopak
        if (has) prefs.series = prefs.series.filter((s) => keyOf(s) !== key);
        else if (isBalance(picked) || prefs.series.some(isBalance)) prefs.series = [picked];
        else prefs.series = [...prefs.series, picked];
        paint();
        draw();
        await savePrefs();
      });
    });
  }

  // ---------- Období ----------
  function openPeriod() {
    openPeriodMenu(periodBtn, rows, () => prefs, async (patch) => {
      prefs = { ...prefs, ...patch };
      draw();
      await savePrefs();
    });
  }

  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-action="what"]')) openWhat();
    if (e.target.closest('[data-action="period"]')) openPeriod();
    const typeBtn = e.target.closest('[data-type]');
    if (typeBtn) {
      prefs.type = typeBtn.dataset.type;
      draw();
      await savePrefs();
    }
  });

  await loadPrefs();
  await load();
  const unsubscribe = store.subscribe(load);
  // Otočení telefonu: graf se přizpůsobí nové šířce a výšce
  let resizeTimer = null;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(draw, 150);
  };
  window.addEventListener('resize', onResize);
  return () => {
    unsubscribe();
    window.removeEventListener('resize', onResize);
    clearTimeout(resizeTimer);
    if (endChart) endChart();
  };
}
