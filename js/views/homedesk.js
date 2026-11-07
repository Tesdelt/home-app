// Domů na počítači: přehled ve dvou sloupcích místo dlaždic (moduly jsou
// v levém panelu). Vlevo „Dnes“: úkoly na dnes a po termínu s kolečkem na
// splnění, pod nimi nákup s odškrtnutím. Vpravo Peníze přihlášeného (vybraného)
// segmentu: karta posledního měsíce, kategorie přes limit, platby k zaplacení
// do 7 dní, cíle a malý graf zůstatku za 12 měsíců. Mobil má dál dlaždice (home.js).

import * as store from '../store.js';
import { escapeHtml, ICONS, money, whoClass, budgetColor, emptyState } from '../ui.js';
import { today, dueLabel, dueTimeLabel } from '../dates.js';
import { navigate } from '../router.js';
import { drawChart } from '../chart.js';
import { sortTasks } from './tasks.js';

const MONTHS = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
const monthName = (month) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const num = (v) => Math.round(v).toLocaleString('cs-CZ');
const totalOf = (value) => Number(typeof value === 'object' && value ? value.total : value) || 0;
const bar = (part, color) => `<span class="budget-bar"><span style="width: ${(Math.max(0, Math.min(1, part)) * 100).toFixed(1)}%; background: ${color}"></span></span>`;

export async function renderOverview(el) {
  const root = document.createElement('div');
  root.className = 'home-desk';
  root.innerHTML = '<div class="home-col home-today"></div><div class="home-col home-money"></div>';
  el.append(root);
  const todayEl = root.querySelector('.home-today');
  const moneyEl = root.querySelector('.home-money');
  let endChart = null;
  let token = 0;

  async function draw() {
    const mine = ++token;
    const [tasks, items, members, me, segMeta] = await Promise.all([
      store.listTasks(), store.listItems(), store.listMembers(), store.getMe(), store.getMeta('moneySegment', null),
    ]);
    const segment = [...members, store.SPLIT].includes(segMeta) ? segMeta : (members.includes(me) ? me : store.SPLIT);
    const [months, budgetRows, goals, due, summary] = await Promise.all([
      store.listMoneyMonths(segment), store.listBudgets(segment), store.listGoals(segment), store.duePayments(7), store.paymentsSummary(segment),
    ]);
    if (mine !== token) return;
    const day = today();

    // ---------- Dnes ----------
    const open = sortTasks(tasks, 'due').flatMap((g) => g.tasks).filter((t) => t.due && t.due <= day);
    const taskRow = (t) => {
      const parts = t.doneParts ?? [];
      const sub = [t.due < day ? `<span class="is-late">${escapeHtml(dueTimeLabel(t.due, t.time))}</span>` : escapeHtml(dueTimeLabel(t.due, t.time))];
      if (t.assignee === store.BOTH && parts.length) sub.push(`hotovo ${escapeHtml(parts.join(', '))}`);
      return `<li class="item ${whoClass(t.assignee, members)}${parts.includes(me) ? ' is-mine' : ''}" data-task="${escapeHtml(t.id)}">
        <button type="button" class="item-main has-stripe">
          <span class="check-tap"><span class="check">${ICONS.check}</span></span>
          <span class="item-text"><span class="item-name">${escapeHtml(t.title)}</span><span class="item-sub">${sub.join(' · ')}</span></span>
        </button></li>`;
    };
    const buy = items.filter((i) => !i.done);
    todayEl.innerHTML = `
      <p class="section-label">Úkoly</p>
      ${open.length ? `<ul class="item-list group">${open.map(taskRow).join('')}</ul>`
        : emptyState('check', 'Na dnes nic', 'Úkoly na dnes a po termínu se ukážou tady, třeba vynést odpad.')}
      <p class="section-label">Nákup</p>
      ${buy.length ? `<ul class="item-list group is-dense">${buy.map((i) => `<li class="item" data-buy="${escapeHtml(i.id)}">
          <button type="button" class="item-main"><span class="check">${ICONS.check}</span>
            <span class="item-text"><span class="item-name">${escapeHtml(i.name)}${i.qty && i.qty !== '1' ? ` <span class="item-qty">${escapeHtml(i.qty)}</span>` : ''}</span></span>
          </button></li>`).join('')}</ul>`
        : emptyState('cart', 'Nákup je prázdný', 'Co je potřeba koupit, se ukáže tady, třeba mléko.')}`;

    // ---------- Peníze ----------
    let out = `<p class="section-label">Peníze · ${escapeHtml(segment === store.SPLIT ? 'Společné' : segment)}</p>`;
    const row = months[0];
    if (row) {
      const saved = Object.values(row.moves ?? {}).reduce((s, v) => s + totalOf(v), 0);
      out += `<a class="card summary flow-card home-link" href="#/penize">
        <span class="sum-label">${escapeHtml(monthName(row.month))}</span>
        <div class="sum-row">
          <div class="sum-cell"><span class="sum-label">Přišlo</span><span class="sum-value flow-in">${money(row.income)}</span></div>
          <div class="sum-cell"><span class="sum-label">Utraceno</span><span class="sum-value flow-out">${money(row.outgo)}</span></div>
          <div class="sum-cell"><span class="sum-label">Odloženo</span><span class="sum-value flow-move">${money(saved)}</span></div>
        </div>
        <span class="sum-note">Plán ${money(summary.total + budgetRows.reduce((s, b) => s + b.monthlyLimit, 0))}</span>
      </a>`;
      // Kategorie přes limit
      const over = budgetRows
        .map((b) => ({ ...b, spent: totalOf(row.categories?.[b.category]) }))
        .filter((b) => b.spent > b.monthlyLimit)
        .sort((a, b) => b.spent / b.monthlyLimit - a.spent / a.monthlyLimit);
      if (over.length) {
        out += `<p class="section-label">Přes limit</p><ul class="item-list group">${over.map((b) => `<li class="item"><div class="item-main">
            <span class="item-text"><span class="item-name">${escapeHtml(b.category)}</span>${bar(b.spent / b.monthlyLimit, budgetColor(b.spent / b.monthlyLimit))}</span>
            <span class="item-amount">${num(b.spent)} <span class="budget-of">/ ${money(b.monthlyLimit)}</span></span></div></li>`).join('')}</ul>`;
      }
    }
    // Platby k zaplacení do 7 dní (vybraný segment)
    const pay = due.filter((p) => store.inPaymentSegment(p, segment, members));
    if (pay.length) {
      out += `<p class="section-label">Zaplatit</p><ul class="item-list group">${pay.map((p) => `<li class="item ${whoClass(p.payer || store.SPLIT, members)}"><a class="item-main has-stripe" href="#/penize">
          <span class="item-text"><span class="item-name">${escapeHtml(p.name)}</span><span class="item-sub">${p.nextDue < day ? `<span class="is-late">${escapeHtml(dueLabel(p.nextDue))}</span>` : escapeHtml(dueLabel(p.nextDue))}</span></span>
          <span class="item-amount">${money(p.amount)}</span></a></li>`).join('')}</ul>`;
    }
    // Cíle, plněné odshora z posledního zůstatku
    const { map, anchored } = store.moneyBalances(months);
    const balances = [...map.entries()];
    if (goals.length) {
      let left = anchored && balances.length ? balances[balances.length - 1][1] : 0;
      out += `<p class="section-label">Cíle</p><ul class="item-list group goals">${goals.map((g) => {
        const have = Math.max(0, Math.min(g.target, left));
        left -= g.target;
        return `<li class="item goal"><div class="item-main"><span class="item-text"><span class="item-name">${escapeHtml(g.name)}</span>${bar(g.target ? have / g.target : 0, 'var(--flow-move)')}</span>
          <span class="item-amount">${num(have)} <span class="budget-of">/ ${money(g.target)}</span></span></div></li>`;
      }).join('')}</ul>`;
    }
    // Malý graf zůstatku za posledních 12 měsíců (bez voleb)
    const last12 = balances.slice(-12);
    if (anchored && last12.length >= 2) out += '<p class="section-label">Zůstatek za 12 měsíců</p><div class="home-chart"></div>';
    if (!row && !pay.length && !goals.length) out += emptyState('wallet', 'Zatím bez čísel', 'Až budou ve Skutečnosti měsíce z výpisů, ukáže se tady poslední měsíc a cíle.');
    moneyEl.innerHTML = out;
    if (endChart) endChart();
    endChart = null;
    const chartEl = moneyEl.querySelector('.home-chart');
    if (chartEl) {
      endChart = drawChart(chartEl, {
        months: last12.map(([m]) => m),
        series: [{ label: 'Zůstatek', color: 'var(--text)', values: last12.map(([, v]) => v) }],
        type: 'line', format: money, height: 180,
      });
    }
  }

  // Kolečko splní úkol, řádek ho otevře; řádek nákupu odškrtne položku
  todayEl.addEventListener('click', async (e) => {
    const task = e.target.closest('[data-task]');
    if (task) {
      if (e.target.closest('.check-tap')) {
        task.classList.add('is-done');
        await new Promise((r) => setTimeout(r, 180));
        await store.setTaskDone(task.dataset.task, true);
      } else {
        navigate(`ukoly/${task.dataset.task}`);
      }
      return;
    }
    const item = e.target.closest('[data-buy]');
    if (item) {
      item.classList.add('is-done');
      await new Promise((r) => setTimeout(r, 180));
      await store.setDone(item.dataset.buy, true);
    }
  });

  await draw();
  const unsubscribe = store.subscribe(draw);
  return () => {
    unsubscribe();
    if (endChart) endChart();
  };
}
