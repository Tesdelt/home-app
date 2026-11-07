// Peníze, Tabulka (#/penize/tabulka/<segment>, jen počítač): Skutečnost po
// měsících jako tabulka. Řádky jsou kategorie výdajů, pod nimi Příjmy a Přesuny,
// sloupce měsíce období (stejná volba Období jako u grafu, meta moneyChart),
// na konci Průměr a Limit. Buňka nad limitem je podbarvená barvou pruhu limitu.
// Záhlaví řádků i sloupců drží při posouvání. Klik na kategorii ji rozbalí na
// položky, klik do Limitu ho upraví přímo v tabulce, klik na měsíc otevře
// Skutečnost toho měsíce. Srovnat 2 měsíce: dva měsíce vedle sebe a rozdíl.

import * as store from '../store.js';
import { escapeHtml, openMenu, budgetColor, emptyState } from '../ui.js';
import { periodMonthsOf, periodLabelOf, openPeriodMenu, loadChartPrefs, saveChartPrefs } from './moneycharts.js';

const SHARED = 'Společné';
const GROUPS = [['out', 'Výdaje', 'categories'], ['in', 'Příjmy', 'incomes'], ['move', 'Přesuny', 'moves']];
const SHORT = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
const monthShort = (month) => {
  const [y, m] = month.split('-').map(Number);
  return `${SHORT[m - 1]} ${String(y).slice(2)}`;
};
const totalOf = (value) => Number(typeof value === 'object' && value ? value.total : value) || 0;
const num = (v) => (v ? Math.round(v).toLocaleString('cs-CZ') : '');
const signedNum = (v) => (v ? `${v > 0 ? '+' : ''}${Math.round(v).toLocaleString('cs-CZ')}` : '');

// Rozbalené kategorie a srovnání vydrží, dokud je appka otevřená
const openRows = new Set();
let compare = null; // null, nebo { a: 'RRRR-MM', b: 'RRRR-MM' }

// onMonth(month) otevře Skutečnost toho měsíce (Peníze si ho nastaví samy)
export async function renderTable(el, segment, { subEl, onMonth }) {
  document.getElementById('screen-title').textContent = 'Tabulka';
  document.title = 'Tabulka · Domácnost';
  subEl.textContent = segment === store.SPLIT ? SHARED : segment;
  subEl.hidden = false;

  const root = document.createElement('div');
  root.className = 'mt';
  root.innerHTML = `
    <div class="toolbar mt-bar">
      <button type="button" class="opt" data-action="period"><span class="opt-text"></span></button>
      <button type="button" class="opt" data-action="compare" aria-pressed="false"><span class="opt-text">Srovnat 2 měsíce</span></button>
      <span class="mt-pick" hidden>
        <button type="button" class="opt" data-action="a"><span class="opt-text"></span></button>
        <button type="button" class="opt" data-action="b"><span class="opt-text"></span></button>
      </span>
    </div>
    <div class="mt-wrap"></div>`;
  el.append(root);
  const wrap = root.querySelector('.mt-wrap');
  const periodBtn = root.querySelector('[data-action="period"]');
  const compareBtn = root.querySelector('[data-action="compare"]');
  const pickEl = root.querySelector('.mt-pick');

  let rows = [];
  let prefs = await loadChartPrefs(segment);
  let budgets = new Map();
  let editing = null; // kategorie, jejíž limit se právě upravuje

  async function load() {
    const [monthRows, budgetRows] = await Promise.all([store.listMoneyMonths(segment), store.listBudgets(segment)]);
    rows = [...monthRows].sort((a, b) => a.month.localeCompare(b.month));
    budgets = new Map(budgetRows.map((b) => [b.category, b.monthlyLimit]));
    draw();
  }

  function draw() {
    periodBtn.querySelector('.opt-text').textContent = periodLabelOf(rows, prefs);
    periodBtn.hidden = Boolean(compare);
    compareBtn.setAttribute('aria-pressed', Boolean(compare));
    compareBtn.classList.toggle('is-set', Boolean(compare));
    pickEl.hidden = !compare;
    if (!rows.length) {
      wrap.innerHTML = emptyState('wallet', 'Zatím bez čísel', 'Tabulka se naplní měsíci z výpisů, třeba za říjen.');
      return;
    }
    if (compare) {
      root.querySelector('[data-action="a"] .opt-text').textContent = monthShort(compare.a);
      root.querySelector('[data-action="b"] .opt-text').textContent = monthShort(compare.b);
    }
    const months = compare ? [compare.a, compare.b] : periodMonthsOf(rows, prefs);
    const byMonth = new Map(rows.map((r) => [r.month, r]));

    // Kategorie skupiny ve vybraných měsících, od největšího součtu
    const cats = (field) => {
      const sums = new Map();
      for (const m of months) {
        for (const [name, value] of Object.entries(byMonth.get(m)?.[field] ?? {})) sums.set(name, (sums.get(name) ?? 0) + totalOf(value));
      }
      return [...sums].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([name]) => name);
    };
    const valueAt = (field, cat, m, item = null) => {
      const value = byMonth.get(m)?.[field]?.[cat];
      if (item == null) return totalOf(value);
      return Number(value?.items?.[item]) || 0;
    };
    const itemsOf = (field, cat) => {
      const names = new Set();
      for (const m of months) Object.keys(byMonth.get(m)?.[field]?.[cat]?.items ?? {}).forEach((n) => names.add(n));
      return [...names];
    };

    // Jedna řádka: hodnoty po měsících, pak Průměr (nebo Rozdíl) a Limit
    const cells = (values, limit) => {
      const tds = values.map((v) => {
        const over = limit && v > limit;
        return `<td${over ? ` class="is-over" style="background: color-mix(in oklab, ${budgetColor(v / limit)} 28%, transparent)"` : ''}>${num(v)}</td>`;
      }).join('');
      const tail = compare
        ? `<td class="mt-sum">${signedNum(values[1] - values[0])}</td>`
        : `<td class="mt-sum">${num(values.reduce((a, b) => a + b, 0) / values.length)}</td>`;
      return tds + tail;
    };

    let body = '';
    for (const [g, label, field] of GROUPS) {
      const list = cats(field);
      if (!list.length) continue;
      body += `<tr class="mt-group"><th scope="rowgroup">${label}</th><td colspan="${months.length + 2}"></td></tr>`;
      for (const cat of list) {
        const key = `${g}:${cat}`;
        const items = itemsOf(field, cat);
        const open = openRows.has(key);
        const limit = g === 'out' ? budgets.get(cat) : null;
        const limitCell = g !== 'out' ? '<td class="mt-limit"></td>'
          : editing === cat
            ? `<td class="mt-limit"><input class="input mt-input" inputmode="numeric" value="${limit ? Math.round(limit) : ''}" aria-label="Měsíční limit ${escapeHtml(cat)}"></td>`
            : `<td class="mt-limit" data-limit="${escapeHtml(cat)}" title="Upravit limit">${limit ? num(limit) : '<span class="mt-add">+</span>'}</td>`;
        body += `<tr class="mt-row${items.length ? ' has-items' : ''}${open ? ' is-open' : ''}" data-row="${escapeHtml(key)}">
          <th scope="row"><span class="mt-name">${escapeHtml(cat)}</span></th>${cells(months.map((m) => valueAt(field, cat, m)), limit)}${limitCell}</tr>`;
        if (open) {
          for (const item of items) {
            body += `<tr class="mt-item"><th scope="row">${escapeHtml(item)}</th>${cells(months.map((m) => valueAt(field, cat, m, item)), null)}<td class="mt-limit"></td></tr>`;
          }
        }
      }
    }

    wrap.innerHTML = `<table class="mt-table">
      <thead><tr><th scope="col" class="mt-corner"></th>${months.map((m) => `<th scope="col"><button type="button" class="mt-month" data-month="${m}">${monthShort(m)}</button></th>`).join('')}
        <th scope="col" class="mt-sum">${compare ? 'Rozdíl' : 'Průměr'}</th><th scope="col" class="mt-limit">Limit</th></tr></thead>
      <tbody>${body}</tbody></table>`;

    const input = wrap.querySelector('.mt-input');
    if (input) {
      input.focus();
      input.select();
    }
  }

  async function saveLimit(input) {
    const cat = editing;
    editing = null;
    await store.setBudget(segment, cat, input.value);
  }

  function pickMonth(btn, which) {
    openMenu(btn, (menu, close) => {
      menu.innerHTML = [...rows].reverse()
        .map((r) => `<button type="button" class="menu-item" data-m="${r.month}" aria-pressed="${r.month === compare[which]}">${monthShort(r.month)}</button>`)
        .join('');
      menu.addEventListener('click', (e) => {
        const b = e.target.closest('[data-m]');
        if (!b) return;
        close();
        compare = { ...compare, [which]: b.dataset.m };
        draw();
      });
    });
  }

  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-action="period"]')) {
      openPeriodMenu(periodBtn, rows, () => prefs, async (patch) => {
        prefs = { ...prefs, ...patch };
        draw();
        await saveChartPrefs(segment, patch);
      });
      return;
    }
    if (e.target.closest('[data-action="compare"]')) {
      const last = rows[rows.length - 1]?.month;
      const prev = rows[rows.length - 2]?.month ?? last;
      compare = compare ? null : { a: prev, b: last };
      draw();
      return;
    }
    const pick = e.target.closest('[data-action="a"], [data-action="b"]');
    if (pick) {
      pickMonth(pick, pick.dataset.action);
      return;
    }
    const month = e.target.closest('[data-month]');
    if (month) {
      onMonth(month.dataset.month);
      return;
    }
    const limitCell = e.target.closest('[data-limit]');
    if (limitCell) {
      editing = limitCell.dataset.limit;
      draw();
      return;
    }
    const row = e.target.closest('.mt-row.has-items');
    if (row && !e.target.closest('.mt-limit')) {
      const key = row.dataset.row;
      if (openRows.has(key)) openRows.delete(key);
      else openRows.add(key);
      draw();
    }
  });
  // Limit se ukládá Enterem nebo opuštěním pole, Esc úpravu zruší
  wrap.addEventListener('keydown', (e) => {
    if (!e.target.classList.contains('mt-input')) return;
    if (e.key === 'Enter') e.target.blur();
    if (e.key === 'Escape') {
      e.stopPropagation();
      editing = null;
      draw();
    }
  });
  wrap.addEventListener('focusout', (e) => {
    if (e.target.classList.contains('mt-input') && editing) saveLimit(e.target);
  });

  await load();
  return store.subscribe(load);
}
