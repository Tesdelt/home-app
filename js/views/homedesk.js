// Domů na počítači: přehled pěti sekcí místo dlaždic (mobil má dál dlaždice
// v home.js). Recepty, Administrativa a Byt tu nejsou, jsou v levém panelu.
// Každá sekce je karta: nahoře ikona v barvě modulu a název (klik otevře
// modul), uvnitř běžné řádky seznamu, nejvýš 5, pod nimi „a dalších X“.
// Od 1280 px tři sloupce (Úkoly + Nákup | Peníze | Wishlist + Bucketlist),
// pod 1280 px dva (Úkoly, Nákup, Wishlist, Bucketlist | Peníze).
// Data se překreslují živě (store.subscribe).

import * as store from '../store.js';
import { escapeHtml, ICONS, money, whoClass, budgetColor, undoToast } from '../ui.js';
import { today, dueLabel, dueTimeLabel } from '../dates.js';
import { navigate } from '../router.js';
import { drawChart } from '../chart.js';
import { sortTasks } from './tasks.js';

const MAX = 5;
const MONTHS = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
const monthName = (month) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const num = (v) => Math.round(v).toLocaleString('cs-CZ');
const totalOf = (value) => Number(typeof value === 'object' && value ? value.total : value) || 0;
const bar = (part, color) => `<span class="budget-bar"><span style="width: ${(Math.max(0, Math.min(1, part)) * 100).toFixed(1)}%; background: ${color}"></span></span>`;

// Orientační „do kdy“ u přání (jako ve wishlistu)
function horizon(untilYear) {
  if (!untilYear) return 'Někdy';
  const years = untilYear - new Date().getFullYear();
  if (years <= 0) return 'Letos';
  if (years === 1) return 'Do roka';
  return `Do ${years} let`;
}

const SECTIONS = [
  ['ukoly', 'tasks', 'Úkoly'],
  ['nakup', 'cart', 'Nákup'],
  ['penize', 'wallet', 'Peníze'],
  ['wishlist', 'gift', 'Wishlist'],
  ['bucketlist', 'star', 'Bucketlist'],
];

// Řádky karty: nejvýš 5, pod nimi „a dalších X“, prázdná sekce „Nic“
function list(rows, more = '') {
  if (!rows.length) return '<p class="home-none">Nic</p>';
  const extra = rows.length - MAX;
  return `<ul class="item-list home-list">${rows.slice(0, MAX).join('')}</ul>${extra > 0 ? `<p class="home-more">a dalších ${extra}</p>` : ''}${more}`;
}

export async function renderOverview(el) {
  const root = document.createElement('div');
  root.className = 'home-desk';
  root.innerHTML = '<div class="home-col"></div><div class="home-col"></div><div class="home-col"></div>';
  el.append(root);
  const cols = root.querySelectorAll('.home-col');
  const cards = {};
  for (const [route, icon, name] of SECTIONS) {
    const card = document.createElement('section');
    card.className = `card home-card mod-${route}`;
    card.innerHTML = `<a class="home-card-head" href="#/${route}"><span class="card-icon">${ICONS[icon]}</span><h2 class="card-title">${name}</h2></a><div class="home-card-body"></div>`;
    cards[route] = card;
  }
  const body = (route) => cards[route].querySelector('.home-card-body');

  // Rozvržení: od 1280 px tři sloupce, jinak dva (karty se jen přesunou)
  const wide = window.matchMedia('(min-width: 1280px)');
  const place = () => {
    const layout = wide.matches
      ? [['ukoly', 'nakup'], ['penize'], ['wishlist', 'bucketlist']]
      : [['ukoly', 'nakup', 'wishlist', 'bucketlist'], ['penize'], []];
    layout.forEach((routes, i) => cols[i].replaceChildren(...routes.map((r) => cards[r])));
    root.classList.toggle('is-wide', wide.matches);
  };
  place();
  wide.addEventListener('change', place);

  let endChart = null;
  let token = 0;

  async function draw() {
    const mine = ++token;
    const [tasks, items, shop, members, me, wishes, buckets] = await Promise.all([
      store.listTasks(), store.listItems(), store.currentShop(), store.listMembers(), store.getMe(),
      store.listWishes('wish'), store.listWishes('bucket'),
    ]);
    const segment = members.includes(me) ? me : store.SPLIT;
    const [months, budgetRows, goals, due] = await Promise.all([
      store.listMoneyMonths(segment), store.listBudgets(segment), store.listGoals(segment), store.duePayments(7),
    ]);
    if (mine !== token) return;
    const day = today();

    // ---------- Úkoly: po termínu, dnes a nejbližší ----------
    const open = sortTasks(tasks, 'due').flatMap((g) => g.tasks);
    body('ukoly').innerHTML = list(open.map((t) => {
      const parts = t.doneParts ?? [];
      const sub = t.due ? [t.due < day ? `<span class="is-late">${escapeHtml(dueTimeLabel(t.due, t.time))}</span>` : escapeHtml(dueTimeLabel(t.due, t.time))] : [];
      if (t.assignee === store.BOTH && parts.length) sub.push(`hotovo ${escapeHtml(parts.join(', '))}`);
      return `<li class="item ${whoClass(t.assignee, members)}${parts.includes(me) ? ' is-mine' : ''}" data-task="${escapeHtml(t.id)}">
        <button type="button" class="item-main has-stripe">
          <span class="check-tap"><span class="check">${ICONS.check}</span></span>
          <span class="item-text"><span class="item-name">${escapeHtml(t.title)}</span>${sub.length ? `<span class="item-sub">${sub.join(' · ')}</span>` : ''}</span>
        </button></li>`;
    }));

    // ---------- Nákup: nekoupené podle pořadí obchodu ----------
    const order = (category) => {
      const i = shop.order.indexOf(category);
      return i < 0 ? shop.order.length : i;
    };
    const buy = items.filter((i) => !i.done).sort((a, b) => order(a.category) - order(b.category) || a.name.localeCompare(b.name, 'cs'));
    body('nakup').innerHTML = list(buy.map((i) => `<li class="item" data-buy="${escapeHtml(i.id)}">
        <button type="button" class="item-main"><span class="check">${ICONS.check}</span>
          <span class="item-text"><span class="item-name">${escapeHtml(i.name)}${i.qty && i.qty !== '1' ? ` <span class="item-qty">${escapeHtml(i.qty)}</span>` : ''}</span></span>
        </button></li>`));

    // ---------- Peníze přihlášeného ----------
    let out = '';
    const row = months[0];
    if (row) {
      const saved = Object.values(row.moves ?? {}).reduce((s, v) => s + totalOf(v), 0);
      out += `<a class="home-month" href="#/penize">
        <span class="sum-label">${escapeHtml(monthName(row.month))}</span>
        <div class="sum-row">
          <div class="sum-cell"><span class="sum-label">Přišlo</span><span class="sum-value flow-in">${money(row.income)}</span></div>
          <div class="sum-cell"><span class="sum-label">Utraceno</span><span class="sum-value flow-out">${money(row.outgo)}</span></div>
          <div class="sum-cell"><span class="sum-label">Odloženo</span><span class="sum-value flow-move">${money(saved)}</span></div>
        </div></a>`;
      // Kategorie přes limit nebo nad 90 %
      const near = budgetRows
        .map((b) => ({ ...b, spent: totalOf(row.categories?.[b.category]) }))
        .filter((b) => b.spent > b.monthlyLimit * 0.9)
        .sort((a, b) => b.spent / b.monthlyLimit - a.spent / a.monthlyLimit);
      if (near.length) {
        out += `<p class="section-label">Limity</p>${list(near.map((b) => `<li class="item"><a class="item-main" href="#/penize">
            <span class="item-text"><span class="item-name">${escapeHtml(b.category)}</span>${bar(b.spent / b.monthlyLimit, budgetColor(b.spent / b.monthlyLimit))}</span>
            <span class="item-amount">${num(b.spent)} <span class="budget-of">/ ${money(b.monthlyLimit)}</span></span></a></li>`))}`;
      }
    }
    // Platby k zaplacení do 7 dní, kolečko zaplatí (se Zpět)
    const pay = due.filter((p) => store.inPaymentSegment(p, segment, members));
    if (pay.length) {
      out += `<p class="section-label">Zaplatit</p>${list(pay.map((p) => `<li class="item ${whoClass(p.payer || store.SPLIT, members)}" data-pay="${escapeHtml(p.id)}">
          <button type="button" class="item-main has-stripe is-compact"><span class="check">${ICONS.check}</span>
          <span class="item-text"><span class="item-name">${escapeHtml(p.name)}</span><span class="item-sub">${p.nextDue < day ? `<span class="is-late">${escapeHtml(dueLabel(p.nextDue))}</span>` : escapeHtml(dueLabel(p.nextDue))}</span></span>
          <span class="item-amount">${money(p.amount)}</span></button></li>`))}`;
    }
    // Cíle, plněné odshora z posledního zůstatku
    const { map, anchored } = store.moneyBalances(months);
    const balances = [...map.entries()];
    if (goals.length) {
      let left = anchored && balances.length ? balances[balances.length - 1][1] : 0;
      out += `<p class="section-label">Cíle</p>${list(goals.map((g) => {
        const have = Math.max(0, Math.min(g.target, left));
        left -= g.target;
        return `<li class="item goal"><a class="item-main" href="#/penize"><span class="item-text"><span class="item-name">${escapeHtml(g.name)}</span>${bar(g.target ? have / g.target : 0, 'var(--flow-move)')}</span>
          <span class="item-amount">${num(have)} <span class="budget-of">/ ${money(g.target)}</span></span></a></li>`;
      }))}`;
    }
    // Malý graf zůstatku za 12 měsíců (bez voleb), klik otevře Grafy
    const last12 = balances.slice(-12);
    if (anchored && last12.length >= 2) out += '<p class="section-label">Zůstatek</p><div class="home-chart" role="link" tabindex="0" aria-label="Grafy"></div>';
    body('penize').innerHTML = out || '<p class="home-none">Nic</p>';
    if (endChart) endChart();
    endChart = null;
    const chartEl = body('penize').querySelector('.home-chart');
    if (chartEl) {
      endChart = drawChart(chartEl, {
        months: last12.map(([m]) => m),
        series: [{ label: 'Zůstatek', color: 'var(--text)', values: last12.map(([, v]) => v) }],
        type: 'line', format: money, height: 160,
        onSelect: () => navigate('penize/grafy'),
      });
    }

    // ---------- Wishlist a Bucketlist: nejbližší podle „do kdy“ ----------
    const wishRows = (listName, route) => (listName
      .filter((w) => !w.done)
      .sort((a, b) => (a.untilYear ?? 9999) - (b.untilYear ?? 9999) || a.createdAt - b.createdAt)
      .map((w) => `<li class="item ${whoClass(w.assignee, members)}"><a class="item-main has-stripe" href="#/${route}/${escapeHtml(w.id)}">
          <span class="item-text"><span class="item-name">${escapeHtml(w.title)}</span><span class="item-sub">${escapeHtml(horizon(w.untilYear))}</span></span>
          ${w.privateTo ? `<span class="item-lock">${ICONS.lock}</span>` : ''}</a></li>`));
    body('wishlist').innerHTML = list(wishRows(wishes, 'wishlist'));
    body('bucketlist').innerHTML = list(wishRows(buckets, 'bucketlist'));
  }

  // Úkol: kolečko splní, řádek otevře úkol vpravo v Úkolech.
  // Nákup: klik = koupeno se Zpět. Platba: klik = zaplaceno se Zpět.
  root.addEventListener('click', async (e) => {
    const task = e.target.closest('[data-task]');
    if (task) {
      if (e.target.closest('.check-tap')) {
        task.classList.add(task.classList.contains('who-both') ? 'is-mine' : 'is-done');
        await new Promise((r) => setTimeout(r, 180));
        await store.setTaskDone(task.dataset.task, true);
      } else {
        navigate(`ukoly/${task.dataset.task}`);
      }
      return;
    }
    const item = e.target.closest('[data-buy]');
    if (item) {
      const id = item.dataset.buy;
      const name = item.querySelector('.item-name')?.firstChild?.textContent ?? '';
      item.classList.add('is-done');
      await new Promise((r) => setTimeout(r, 180));
      await store.setDone(id, true);
      undoToast(`${name.trim()}: koupeno`, () => store.setDone(id, false));
      return;
    }
    const payRow = e.target.closest('[data-pay]');
    if (payRow) {
      const id = payRow.dataset.pay;
      const name = payRow.querySelector('.item-name')?.textContent ?? '';
      payRow.classList.add('is-done');
      await new Promise((r) => setTimeout(r, 180));
      const result = await store.payPayment(id);
      if (result) undoToast(`${name}: zaplaceno`, () => store.updatePayment(id, result.before));
      return;
    }
    if (e.target.closest('.home-chart') && !e.target.closest('.chart-hit')) navigate('penize/grafy');
  });

  await draw();
  const unsubscribe = store.subscribe(draw);
  return () => {
    unsubscribe();
    wide.removeEventListener('change', place);
    if (endChart) endChart();
  };
}
