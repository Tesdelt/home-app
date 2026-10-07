// Peníze: nahoře souhrn (každý zvlášť a dohromady), pod ním čtyři sekce:
// co je teď potřeba zaplatit, pravidelné platby, jednorázové a platby na dobu
// určitou. Ťuknutí = zaplaceno (se Zpět), podržení = úprava, potažení = smazat.

import * as store from '../store.js';
import { escapeHtml, ICONS, undoToast, openSheet, rowGestures, money, whoClass, whoBadge, wireSegmented } from '../ui.js';
import { today, dueLabel } from '../dates.js';

export const title = 'Peníze';

const PERIODS = [
  { id: 'month', name: 'Měsíčně', short: 'měsíčně' },
  { id: 'quarter', name: 'Čtvrtletně', short: 'čtvrtletně' },
  { id: 'year', name: 'Ročně', short: 'ročně' },
];
const periodShort = (id) => PERIODS.find((p) => p.id === id)?.short ?? '';

const KINDS = [
  { id: 'recurring', name: 'Pravidelná', tab: 'Pravidelné' },
  { id: 'once', name: 'Jednorázová', tab: 'Jednou' },
  { id: 'term', name: 'Na dobu', tab: 'Na dobu' },
];
const kindOf = (payment) => payment.kind ?? 'recurring';

// Volby vydrží, dokud je appka otevřená. section = null: vybere se sama.
let yearly = false;
let section = null;

export async function render(el, { extraEl }) {
  const root = document.createElement('div');
  el.append(root);
  root.innerHTML = `
    <div class="summary-root"></div>
    <div class="segmented seg-bar filter-bar" hidden></div>
    <div class="list-root"></div>`;

  const summaryRoot = root.querySelector('.summary-root');
  const tabsEl = root.querySelector('.filter-bar');
  const listRoot = root.querySelector('.list-root');

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'add-btn';
  addBtn.setAttribute('aria-label', 'Přidat platbu');
  addBtn.innerHTML = ICONS.plus;
  addBtn.addEventListener('click', () => openEdit(null));
  extraEl.append(addBtn);

  let renderToken = 0;
  let members = [];

  // Jde platbu odškrtnout jako zaplacenou?
  const payable = (p) => !p.done && (kindOf(p) === 'once' || Boolean(p.nextDue));

  function row(payment) {
    const kind = kindOf(payment);
    const sub = [];
    if (payment.done) {
      sub.push(kind === 'term' ? 'doplaceno' : `zaplaceno${payment.paidBy ? ` ${escapeHtml(payment.paidBy)}` : ''}`);
    } else {
      if (payment.nextDue) sub.push(payment.nextDue < today() ? `<span class="is-late">${dueLabel(payment.nextDue)}</span>` : dueLabel(payment.nextDue));
      if (kind !== 'once' && payment.period !== 'month') sub.push(periodShort(payment.period));
      if (kind === 'term' && payment.total) sub.push(`zbývá ${payment.remaining ?? payment.total} z ${payment.total}`);
    }
    const can = payable(payment);
    return `<li class="item ${whoClass(payment.payer || store.SPLIT, members)}${payment.done ? ' is-done' : ''}" data-id="${escapeHtml(payment.id)}">
      <div class="item-bg" aria-hidden="true">Smazat</div>
      <button type="button" class="item-main has-stripe is-compact">
        ${can || payment.done ? `<span class="check">${ICONS.check}</span>` : '<span class="check is-empty"></span>'}
        <span class="item-text"><span class="item-name">${escapeHtml(payment.name)}</span>${sub.length ? `<span class="item-sub">${sub.join(' · ')}</span>` : ''}</span>
        <span class="item-amount">${money(payment.amount)}</span>
        ${whoBadge(payment.payer || store.SPLIT, members, 'Napůl')}
      </button>
    </li>`;
  }

  const list = (payments) => `<ul class="item-list group">${payments.map(row).join('')}</ul>`;

  async function draw() {
    const token = ++renderToken;
    const [payments, summary, due] = await Promise.all([store.listPayments(), store.paymentsSummary(), store.duePayments(7)]);
    members = await store.listMembers();
    if (token !== renderToken) return;

    if (!payments.length) {
      summaryRoot.innerHTML = '';
      tabsEl.hidden = true;
      listRoot.innerHTML = `<div class="empty">
        <div class="empty-icon">${ICONS.wallet}</div>
        <p class="empty-title">Zatím žádné platby</p>
      </div>`;
      return;
    }

    // Souhrn: co stojí běžný měsíc, každý zvlášť a dohromady
    const scale = yearly ? 12 : 1;
    const cells = Object.entries(summary.perPerson)
      .map(([name, amount]) => `<div class="sum-cell"><span class="sum-label"><span class="legend-dot ${whoClass(name, members)}"></span>${escapeHtml(name)}</span><span class="sum-value">${money(amount * scale)}</span></div>`)
      .join('');
    const once = summary.onceTotal ? ` · jednorázově zbývá ${money(summary.onceTotal)}` : '';
    summaryRoot.innerHTML = `<button type="button" class="card summary" data-action="scale" aria-label="Přepnout měsíčně a ročně">
        <div class="sum-row">${cells}
          <div class="sum-cell is-total"><span class="sum-label">Dohromady</span><span class="sum-value">${money(summary.total * scale)}</span></div>
        </div>
        <span class="sum-note">${yearly ? 'pravidelně za rok' : 'pravidelně za měsíc'}${once}</span>
      </button>`;

    // Sekce. "Zaplatit" je to, co je splatné do 7 dní nebo už po termínu.
    const byKind = (kind) => payments.filter((p) => kindOf(p) === kind);
    const openCount = (kind) => byKind(kind).filter((p) => !p.done).length;
    const tabs = [['due', 'Zaplatit', due.length], ...KINDS.map((k) => [k.id, k.tab, openCount(k.id)])];
    if (!section) section = due.length ? 'due' : 'recurring';
    tabsEl.hidden = false;
    tabsEl.innerHTML = tabs.map(([id, name, count]) => `<button type="button" data-section="${id}" aria-pressed="${id === section}">${name}${count ? ` <span class="seg-count${id === 'due' ? ' is-alert' : ''}">${count}</span>` : ''}</button>`).join('');

    let out = '';
    if (section === 'due') {
      out = due.length
        ? list(due)
        : `<div class="empty" style="padding: 28px 24px 12px"><div class="empty-icon">${ICONS.check}</div>
            <p class="empty-title">Nic k zaplacení</p></div>`;
    } else {
      const inKind = byKind(section);
      const open = inKind.filter((p) => !p.done).sort((a, b) => (a.nextDue ?? '9').localeCompare(b.nextDue ?? '9') || b.amount - a.amount);
      const done = inKind.filter((p) => p.done).sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0));
      if (open.length) out += list(open);
      else if (!done.length) out += '<p class="hint">Nic tu není.</p>';
      if (done.length) {
        out += `<div class="done-head">
            <p class="section-label">${section === 'term' ? 'Doplacené' : 'Zaplacené'} (${done.length})</p>
            <button type="button" class="btn btn-ghost btn-small" data-action="clear">Vyčistit</button>
          </div>${list(done)}`;
      }
    }
    listRoot.innerHTML = out;
  }

  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-action="scale"]')) {
      yearly = !yearly;
      draw();
      return;
    }
    if (e.target.closest('[data-action="clear"]')) {
      const removed = await store.clearDonePayments();
      if (removed.length) undoToast(`Smazáno zaplacených: ${removed.length}`, () => store.restorePayments(removed));
      return;
    }
    const tabBtn = e.target.closest('[data-section]');
    if (tabBtn) {
      section = tabBtn.dataset.section;
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
    const [payments, me] = await Promise.all([store.listPayments(), store.getMe()]);
    const existing = id ? payments.find((p) => p.id === id) : null;
    if (id && !existing) return;
    const startKind = KINDS.some((k) => k.id === section) ? section : 'recurring';
    const p = existing ?? { name: '', amount: '', kind: startKind, period: 'month', payer: me ?? store.SPLIT, nextDue: null, total: null };
    const payers = [...members.map((m) => [m, m]), [store.SPLIT, 'Napůl']];

    openSheet(existing ? 'Upravit platbu' : 'Nová platba', (body, close) => {
      body.innerHTML = `<form class="edit-form" autocomplete="off">
        <div class="field"><span>Druh</span>
          <div class="segmented" data-name="kind">
            ${KINDS.map((k) => `<button type="button" data-value="${k.id}" aria-pressed="${k.id === kindOf(p)}">${k.name}</button>`).join('')}
          </div></div>
        <label class="field"><span>Název</span>
          <input class="input" name="name" value="${escapeHtml(p.name)}" placeholder="Nájem" autocapitalize="sentences" required></label>
        <label class="field"><span>Částka v Kč</span>
          <input class="input" name="amount" inputmode="decimal" value="${escapeHtml(p.amount === '' ? '' : String(p.amount).replace('.', ','))}" placeholder="0"></label>
        <div class="field"><span>Kdo platí</span>
          <div class="segmented" data-name="payer">
            ${payers.map(([value, name]) => `<button type="button" class="${whoClass(value, members)}" data-value="${escapeHtml(value)}" aria-pressed="${value === (p.payer || store.SPLIT)}">${escapeHtml(name)}</button>`).join('')}
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
        <div class="btn-row">
          ${existing ? '<button type="button" class="btn btn-danger" data-action="delete">Smazat</button>' : ''}
          <button type="submit" class="btn btn-primary">${existing ? 'Uložit' : 'Přidat'}</button>
        </div>
      </form>`;

      const f = body.querySelector('form');
      const picked = wireSegmented(f);
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

      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = f.elements.name.value.trim();
        if (!name) return;
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
          section = kind;
        }
        close();
      });
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
  };
}
