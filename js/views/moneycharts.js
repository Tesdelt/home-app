// Peníze, Grafy (#/penize/grafy/<segment>): vývoj Skutečnosti po měsících.
// Nad grafem řádek voleb: Co (nejvýš 3 řady: Přišlo, Utraceno, Odloženo nebo
// kategorie či jedna její položka), Období a Typ (sloupce / křivka).
// Volby si pamatuje každý telefon zvlášť, pro každý segment zvlášť (meta
// moneyChart). Kreslí sdílený js/chart.js.

import * as store from '../store.js';
import { escapeHtml, ICONS, openMenu, money, emptyState } from '../ui.js';
import { drawChart, monthLabel } from '../chart.js';

const SHARED = 'Společné';
const MAX_SERIES = 3;

// Řady: { g: 'flow' | 'in' | 'out' | 'move', c: klíč nebo kategorie, i: položka }
const FLOWS = [
  { g: 'flow', c: 'income', label: 'Přišlo', color: 'var(--flow-in)' },
  { g: 'flow', c: 'outgo', label: 'Utraceno', color: 'var(--flow-out)' },
  { g: 'flow', c: 'saved', label: 'Odloženo', color: 'var(--flow-move)' },
];
const GROUPS = [['out', 'Výdaje', 'categories'], ['in', 'Příjmy', 'incomes'], ['move', 'Přesuny', 'moves']];
const PALETTE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'];
const PERIODS = [['3', '3 měsíce'], ['6', '6 měsíců'], ['12', '12 měsíců'], ['year', 'Letos'], ['all', 'Vše']];
const DEFAULTS = { series: [{ g: 'flow', c: 'outgo' }], period: '12', from: null, to: null, type: 'bars' };

const keyOf = (s) => JSON.stringify([s.g, s.c, s.i ?? null]);
const totalOf = (value) => Number(typeof value === 'object' && value ? value.total : value) || 0;

// "2026-03" + n měsíců
function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthRange(from, to) {
  const out = [];
  for (let m = from; m <= to && out.length < 600; m = shiftMonth(m, 1)) out.push(m);
  return out;
}
const shortMonth = (month) => {
  const [y, m] = month.split('-').map(Number);
  return `${['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'][m - 1]} ${y}`;
};

// Hodnota řady v jednom měsíci (měsíc bez řádku = 0)
function valueOf(row, s) {
  if (!row) return 0;
  if (s.g === 'flow') {
    if (s.c === 'income') return Number(row.income) || 0;
    if (s.c === 'outgo') return Number(row.outgo) || 0;
    return Object.values(row.moves ?? {}).reduce((sum, v) => sum + totalOf(v), 0);
  }
  const map = row[GROUPS.find(([g]) => g === s.g)[2]] ?? {};
  const value = map[s.c];
  if (s.i == null) return totalOf(value);
  return Number(value?.items?.[s.i]) || 0;
}

export async function renderCharts(el, segment) {
  document.getElementById('app').classList.add('no-topbar');
  const root = document.createElement('div');
  root.className = 'detail';
  el.append(root);

  const name = segment === store.SPLIT ? SHARED : segment;
  root.innerHTML = `
    <div class="detail-head"><a class="back-btn" href="#/penize" aria-label="Zpět">${ICONS.back}</a>
      <span class="detail-name">Grafy · ${escapeHtml(name)}</span></div>
    <div class="toolbar chart-bar">
      <button type="button" class="opt" data-action="what"><span class="opt-text"></span></button>
      <button type="button" class="opt" data-action="period"><span class="opt-text"></span></button>
      <div class="segmented" data-name="type">
        <button type="button" data-type="bars">Sloupce</button>
        <button type="button" data-type="line">Křivka</button>
      </div>
    </div>
    <div class="chart-root"></div>
    <div class="chart-legend"></div>`;

  const whatBtn = root.querySelector('[data-action="what"]');
  const periodBtn = root.querySelector('[data-action="period"]');
  const chartEl = root.querySelector('.chart-root');
  const legendEl = root.querySelector('.chart-legend');

  let rows = [];
  let prefs = { ...DEFAULTS };
  let endChart = null;

  async function loadPrefs() {
    const all = await store.getMeta('moneyChart', {});
    prefs = { ...DEFAULTS, ...(all[segment] ?? {}) };
    if (!prefs.series?.length) prefs.series = DEFAULTS.series;
  }
  async function savePrefs() {
    const all = await store.getMeta('moneyChart', {});
    await store.setLocal('moneyChart', { ...all, [segment]: prefs });
  }

  // Všechny kategorie a položky, které se v datech segmentu vyskytují
  function catalog() {
    return GROUPS.map(([g, label, field]) => {
      const cats = new Map();
      for (const row of rows) {
        for (const [cat, value] of Object.entries(row[field] ?? {})) {
          const items = cats.get(cat) ?? new Set();
          Object.keys((typeof value === 'object' && value?.items) || {}).forEach((item) => items.add(item));
          cats.set(cat, items);
        }
      }
      return { g, label, cats: [...cats].map(([cat, items]) => ({ cat, items: [...items].sort((a, b) => a.localeCompare(b, 'cs')) })).sort((a, b) => a.cat.localeCompare(b.cat, 'cs')) };
    }).filter((group) => group.cats.length);
  }

  // Popisek a barva řady: toky mají svou barvu, ostatní z palety podle pořadí
  function decorate(series) {
    let next = 0;
    return series.map((s) => {
      const flow = FLOWS.find((f) => s.g === 'flow' && f.c === s.c);
      if (flow) return { ...s, label: flow.label, color: flow.color };
      return { ...s, label: s.i == null ? s.c : `${s.c} · ${s.i}`, color: PALETTE[next++ % PALETTE.length] };
    });
  }

  // Měsíce v období. Bez dat na začátku a na konci se vynechají, uprostřed zůstanou (0).
  function periodMonths() {
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

  function periodLabel() {
    if (prefs.period === 'custom') {
      const months = periodMonths();
      return months.length ? `${shortMonth(months[0])} - ${shortMonth(months[months.length - 1])}` : 'Vybrat';
    }
    return PERIODS.find(([id]) => id === prefs.period)?.[1] ?? '12 měsíců';
  }

  function draw() {
    const series = decorate(prefs.series);
    whatBtn.querySelector('.opt-text').textContent = `${series[0].label}${series.length > 1 ? ` +${series.length - 1}` : ''}`;
    periodBtn.querySelector('.opt-text').textContent = periodLabel();
    root.querySelectorAll('[data-type]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.type === prefs.type));
    if (endChart) endChart();
    endChart = null;

    const months = periodMonths();
    if (!months.length) {
      chartEl.innerHTML = emptyState('chart', 'Žádná data', 'V tomhle období nejsou žádné měsíce, třeba zkuste období Vše.');
      legendEl.innerHTML = '';
      return;
    }
    const byMonth = new Map(rows.map((r) => [r.month, r]));
    endChart = drawChart(chartEl, {
      months,
      series: series.map((s) => ({ label: s.label, color: s.color, values: months.map((m) => valueOf(byMonth.get(m), s)) })),
      type: prefs.type,
      format: money,
    });
    legendEl.innerHTML = series.map((s) => `<span class="chart-legend-item"><span class="chart-key" style="background: ${s.color}"></span>${escapeHtml(s.label)}</span>`).join('');
  }

  async function load() {
    rows = (await store.listMoneyMonths(segment)).slice().sort((a, b) => a.month.localeCompare(b.month));
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
        const item = (s, label, extra = '') => {
          const on = chosen.has(keyOf(s));
          return `<button type="button" class="menu-item${extra}" data-series="${escapeHtml(keyOf(s))}" aria-pressed="${on}"${full && !on ? ' disabled' : ''}>${escapeHtml(label)}</button>`;
        };
        menu.innerHTML = FLOWS.map((f) => item(f, f.label)).join('')
          + catalog().map(({ g, label, cats }) => `<p class="menu-head">${label}</p>${cats.map(({ cat, items }) => {
            const open = expanded.has(`${g}:${cat}`);
            return `<div class="menu-row">${item({ g, c: cat }, cat)}${items.length ? `<button type="button" class="icon-btn menu-expand${open ? ' is-open' : ''}" data-expand="${escapeHtml(`${g}:${cat}`)}" aria-label="Položky" aria-expanded="${open}"></button>` : ''}</div>
              ${open ? items.map((it) => item({ g, c: cat, i: it }, it, ' menu-sub')).join('') : ''}`;
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
        prefs.series = has ? prefs.series.filter((s) => keyOf(s) !== key) : [...prefs.series, i == null ? { g, c } : { g, c, i }];
        paint();
        draw();
        await savePrefs();
      });
    });
  }

  // ---------- Období ----------
  function openPeriod() {
    openMenu(periodBtn, (menu, close) => {
      const months = rows.map((r) => r.month);
      const paint = () => {
        const current = periodMonths();
        menu.innerHTML = PERIODS.map(([id, label]) => `<button type="button" class="menu-item" data-period="${id}" aria-pressed="${prefs.period === id}">${label}</button>`).join('')
          + `<p class="menu-head">Vybrat</p>
            <label class="menu-item menu-pick" aria-pressed="${prefs.period === 'custom'}">Od<span class="menu-pick-value">${escapeHtml(prefs.period === 'custom' && current.length ? shortMonth(current[0]) : '')}</span>
              <input type="month" name="from" value="${escapeHtml(prefs.from ?? months[0] ?? '')}" aria-label="Od"></label>
            <label class="menu-item menu-pick" aria-pressed="${prefs.period === 'custom'}">Do<span class="menu-pick-value">${escapeHtml(prefs.period === 'custom' && current.length ? shortMonth(current[current.length - 1]) : '')}</span>
              <input type="month" name="to" value="${escapeHtml(prefs.to ?? months[months.length - 1] ?? '')}" aria-label="Do"></label>`;
      };
      paint();
      menu.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-period]');
        if (!btn) return;
        prefs.period = btn.dataset.period;
        close();
        draw();
        await savePrefs();
      });
      // Výběr z kalendáře se uloží hned a nabídka zůstane otevřená
      menu.addEventListener('change', async (e) => {
        const input = e.target.closest('input[type="month"]');
        if (!input?.value) return;
        prefs = { ...prefs, period: 'custom', from: prefs.from ?? months[0], to: prefs.to ?? months[months.length - 1], [input.name]: input.value };
        paint();
        draw();
        await savePrefs();
      });
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
  return () => {
    unsubscribe();
    if (endChart) endChart();
  };
}
