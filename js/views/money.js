// Peníze: pravidelné platby. Nahoře souhrn (každý zvlášť a dohromady),
// pod ním úsporný seznam. Ťuknutí = úprava, potažení doleva = smazat (se Zpět).

import * as store from '../store.js';
import { escapeHtml, ICONS, undoToast, openSheet, rowGestures, money } from '../ui.js';

export const title = 'Peníze';

const PERIODS = [
  { id: 'month', name: 'Měsíčně', short: 'měsíčně' },
  { id: 'quarter', name: 'Čtvrtletně', short: 'čtvrtletně' },
  { id: 'year', name: 'Ročně', short: 'ročně' },
];
const periodShort = (id) => PERIODS.find((p) => p.id === id)?.short ?? '';

// Volby vydrží, dokud je appka otevřená
let yearly = false;
let filter = '';

export async function render(el, { extraEl }) {
  const root = document.createElement('div');
  el.append(root);
  root.innerHTML = `
    <div class="summary-root"></div>
    <div class="segmented seg-bar filter-bar" hidden></div>
    <div class="list-root"></div>`;

  const summaryRoot = root.querySelector('.summary-root');
  const filterEl = root.querySelector('.filter-bar');
  const listRoot = root.querySelector('.list-root');

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'add-btn';
  addBtn.setAttribute('aria-label', 'Přidat platbu');
  addBtn.innerHTML = ICONS.plus;
  addBtn.addEventListener('click', () => openEdit(null));
  extraEl.append(addBtn);

  let renderToken = 0;
  const scale = () => (yearly ? 12 : 1);

  // Kolik z platby připadá na vybraného člověka (napůl = rovný díl)
  function share(payment, person, members) {
    if (!person) return store.monthly(payment);
    if (payment.payer === person) return store.monthly(payment);
    if (payment.payer === store.SPLIT || !payment.payer) return store.monthly(payment) / Math.max(1, members.length);
    return 0;
  }

  function row(payment, members) {
    const split = payment.payer === store.SPLIT || !payment.payer;
    const amount = share(payment, filter === store.SPLIT ? '' : filter, members) * scale();
    const sub = [];
    if (payment.period !== 'month') sub.push(`${money(payment.amount)} ${periodShort(payment.period)}`);
    if (payment.dueDay) sub.push(`vždy ${payment.dueDay}.`);
    if (split && filter && filter !== store.SPLIT) sub.push('polovina');
    return `<li class="item" data-id="${escapeHtml(payment.id)}">
      <div class="item-bg" aria-hidden="true">Smazat</div>
      <button type="button" class="item-main is-compact">
        <span class="item-who${split ? '' : ' is-me'}" title="${escapeHtml(split ? 'Napůl' : payment.payer)}">${split ? '½' : escapeHtml(payment.payer.charAt(0))}</span>
        <span class="item-text"><span class="item-name">${escapeHtml(payment.name)}</span>${sub.length ? `<span class="item-sub">${escapeHtml(sub.join(' · '))}</span>` : ''}</span>
        <span class="item-amount">${money(amount)}</span>
      </button>
    </li>`;
  }

  async function draw() {
    const token = ++renderToken;
    const [payments, members, summary] = await Promise.all([store.listPayments(), store.listMembers(), store.paymentsSummary()]);
    if (token !== renderToken) return;

    if (!payments.length) {
      summaryRoot.innerHTML = '';
      filterEl.hidden = true;
      listRoot.innerHTML = `<div class="empty">
        <div class="empty-icon">${ICONS.wallet}</div>
        <p class="empty-title">Zatím žádné platby</p>
        <p>Přidejte tlačítkem + nahoře, co platíte pravidelně: nájem, energie, pojištění, předplatné.</p>
      </div>`;
      return;
    }

    // Souhrn: každý zvlášť a dohromady, ťuknutím měsíčně / ročně
    const cells = Object.entries(summary.perPerson)
      .map(([name, amount]) => `<div class="sum-cell"><span class="sum-label">${escapeHtml(name)}</span><span class="sum-value">${money(amount * scale())}</span></div>`)
      .join('');
    summaryRoot.innerHTML = `<button type="button" class="card summary" data-action="scale" aria-label="Přepnout měsíčně a ročně">
        <div class="sum-row">${cells}
          <div class="sum-cell is-total"><span class="sum-label">Dohromady</span><span class="sum-value">${money(summary.total * scale())}</span></div>
        </div>
        <span class="sum-note">${yearly ? 'za rok' : 'za měsíc'} · ${payments.length === 1 ? '1 platba' : `plateb: ${payments.length}`} · ťuknutím ${yearly ? 'měsíčně' : 'ročně'}</span>
      </button>`;

    const filters = [['', 'Vše'], ...members.map((m) => [m, m]), [store.SPLIT, 'Napůl']];
    if (!filters.some(([id]) => id === filter)) filter = '';
    filterEl.hidden = false;
    filterEl.innerHTML = filters.map(([id, name]) => `<button type="button" data-filter="${escapeHtml(id)}" aria-pressed="${id === filter}">${escapeHtml(name)}</button>`).join('');

    const shown = payments.filter((p) => {
      const split = p.payer === store.SPLIT || !p.payer;
      if (!filter) return true;
      if (filter === store.SPLIT) return split;
      return split || p.payer === filter;
    });
    listRoot.innerHTML = shown.length
      ? `<ul class="item-list group">${shown.map((p) => row(p, members)).join('')}</ul>
         <p class="hint">Ťuknutím upravíte, potažením doleva smažete.</p>`
      : '<p class="hint">Tady nic není.</p>';
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="scale"]')) {
      yearly = !yearly;
      draw();
      return;
    }
    const f = e.target.closest('[data-filter]');
    if (f) {
      filter = f.dataset.filter;
      draw();
    }
  });

  async function deletePayment(id) {
    const removed = await store.removePayments([id]);
    if (removed.length) undoToast(`${removed[0].name}: smazáno`, () => store.restorePayments(removed));
  }

  // id = null založí novou platbu
  async function openEdit(id) {
    const [payments, members, me] = await Promise.all([store.listPayments(), store.listMembers(), store.getMe()]);
    const existing = id ? payments.find((p) => p.id === id) : null;
    if (id && !existing) return;
    const p = existing ?? { name: '', amount: '', period: 'month', payer: me ?? store.SPLIT, dueDay: null };
    const payers = [...members.map((m) => [m, m]), [store.SPLIT, 'Napůl']];

    openSheet(existing ? 'Upravit platbu' : 'Nová platba', (body, close) => {
      body.innerHTML = `<form class="edit-form" autocomplete="off">
        <label class="field"><span>Název</span>
          <input class="input" name="name" value="${escapeHtml(p.name)}" placeholder="Nájem" autocapitalize="sentences" required></label>
        <label class="field"><span>Částka v Kč</span>
          <input class="input" name="amount" inputmode="decimal" value="${escapeHtml(p.amount === '' ? '' : String(p.amount).replace('.', ','))}" placeholder="0"></label>
        <div class="field"><span>Jak často</span>
          <div class="segmented" data-name="period">
            ${PERIODS.map((x) => `<button type="button" data-value="${x.id}" aria-pressed="${x.id === p.period}">${x.name}</button>`).join('')}
          </div></div>
        <div class="field"><span>Kdo platí</span>
          <div class="segmented" data-name="payer">
            ${payers.map(([value, name]) => `<button type="button" data-value="${escapeHtml(value)}" aria-pressed="${value === (p.payer || store.SPLIT)}">${escapeHtml(name)}</button>`).join('')}
          </div></div>
        <label class="field"><span>Den splatnosti v měsíci (nepovinné)</span>
          <input class="input" name="dueDay" inputmode="numeric" value="${escapeHtml(p.dueDay ?? '')}" placeholder="15"></label>
        <div class="btn-row">
          ${existing ? '<button type="button" class="btn btn-danger" data-action="delete">Smazat</button>' : ''}
          <button type="submit" class="btn btn-primary">${existing ? 'Uložit' : 'Přidat'}</button>
        </div>
      </form>`;

      const f = body.querySelector('form');
      if (!existing) f.elements.name.focus();
      f.addEventListener('click', (e) => {
        const seg = e.target.closest('.segmented button');
        if (seg) seg.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === seg));
      });
      const picked = (name) => f.querySelector(`[data-name="${name}"] [aria-pressed="true"]`)?.dataset.value ?? '';

      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = f.elements.name.value.trim();
        if (!name) return;
        const amount = Number(f.elements.amount.value.replace(/\s/g, '').replace(',', '.'));
        const day = parseInt(f.elements.dueDay.value, 10);
        const data = {
          name,
          amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0,
          period: picked('period') || 'month',
          payer: picked('payer') || store.SPLIT,
          dueDay: day >= 1 && day <= 31 ? day : null,
        };
        if (existing) await store.updatePayment(id, data);
        else await store.addPayment(data);
        close();
      });
      f.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
        close();
        deletePayment(id);
      });
    });
  }

  const endGesture = rowGestures(listRoot, { onTap: (li) => openEdit(li.dataset.id), onPress: openEdit, onSwipe: deletePayment });

  await draw();
  const unsubscribe = store.subscribe(draw);
  return () => {
    unsubscribe();
    endGesture();
  };
}
