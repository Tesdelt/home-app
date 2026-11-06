// Peníze: nahoře přepínač segmentů (každý člen = jeho osobní účet, Společné =
// společný účet), pod ním souhrn za vybraný segment a jeden seznam po skupinách:
// Zaplatit (splatné do 7 dní a po termínu), Pravidelné, Jednorázové, Na dobu,
// dole Zaplacené. Ťuknutí = zaplaceno (se Zpět), podržení = úprava, potažení = smazat.

import * as store from '../store.js';
import { escapeHtml, ICONS, undoToast, openSheet, openMenu, rowGestures, holdKeyboard, money, whoClass, wireSegmented, emptyState } from '../ui.js';
import { today, dueLabel } from '../dates.js';

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

// Kategorie, které jdou rozbalit na obchody. shops je buď rovný seznam
// { "Albert": 2823 } (patří k Potravinám), nebo rozdělený podle kategorie
// { "Potraviny": { ... }, "Drogerie a lékárna": { ... } }.
const SHOP_CATEGORIES = ['Potraviny', 'Drogerie a lékárna'];
function shopsOf(row, category) {
  const shops = row.shops ?? {};
  const nested = Object.values(shops).some((v) => v && typeof v === 'object');
  const list = nested ? shops[category] : (category === 'Potraviny' ? shops : null);
  return Object.entries(list ?? {}).map(([name, amount]) => [name, Number(amount) || 0]).sort((a, b) => b[1] - a[1]);
}

// Měsíčně / ročně v souhrnu, vybraný měsíc skutečnosti a rozbalené kategorie
// vydrží, dokud je appka otevřená
let yearly = false;
let pickedMonth = null;
const openCats = new Set();

export async function render(el, { extraEl }) {
  const root = document.createElement('div');
  el.append(root);
  root.innerHTML = `
    <div class="toolbar"><div class="segmented" role="tablist"></div></div>
    <div class="summary-root"></div>
    <div class="actual-root"></div>
    <div class="list-root"></div>`;

  const segEl = root.querySelector('.segmented');
  const summaryRoot = root.querySelector('.summary-root');
  const listRoot = root.querySelector('.list-root');
  const actualRoot = root.querySelector('.actual-root');
  let months = [];

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
      </button>
    </li>`;
  }

  const group = (label, payments) => (payments.length ? `<li class="cat-head">${label}</li>${payments.map(row).join('')}` : '');
  const byDue = (a, b) => (a.nextDue ?? '9').localeCompare(b.nextDue ?? '9') || b.amount - a.amount;

  async function draw() {
    const token = ++renderToken;
    members = await store.listMembers();
    segment = validSegment(segment);
    const [payments, summary, due, monthRows] = await Promise.all([
      store.listPayments(), store.paymentsSummary(segment), store.duePayments(7), store.listMoneyMonths(segment),
    ]);
    if (token !== renderToken) return;
    months = monthRows;
    drawActual(summary);
    const inSeg = (p) => store.inPaymentSegment(p, segment, members);

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
    const rows = group('Zaplatit', toPay) + KINDS.map((k) => group(k.group, open.filter((p) => kindOf(p) === k.id))).join('');

    let out = rows ? `<ul class="item-list group">${rows}</ul>` : '';
    if (done.length) {
      out += `<div class="done-head">
          <p class="section-label">Zaplacené (${done.length})</p>
          <button type="button" class="btn btn-ghost btn-small" data-action="clear">Vyčistit</button>
        </div><ul class="item-list group">${done.map(row).join('')}</ul>`;
    }
    listRoot.innerHTML = out;
  }

  // Skutečnost z výpisů za vybraný měsíc: plán proti tomu, co opravdu odešlo,
  // a kategorie od největší. Segment bez měsíců sekci nemá.
  function drawActual(summary) {
    if (!months.length) {
      actualRoot.innerHTML = '';
      return;
    }
    const row = months.find((m) => m.month === pickedMonth) ?? months[0];
    const cats = Object.entries(row.categories ?? {}).map(([name, amount]) => [name, Number(amount) || 0]).sort((a, b) => b[1] - a[1]);
    actualRoot.innerHTML = `
      <div class="toolbar actual-bar">
        <p class="section-label">Skutečnost</p>
        <button type="button" class="opt" data-action="month"><span class="opt-text">${escapeHtml(monthName(row.month))}</span></button>
      </div>
      <section class="card summary">
        <div class="sum-row">
          <div class="sum-cell"><span class="sum-label">Plán</span><span class="sum-value">${money(summary.total)}</span></div>
          <div class="sum-cell is-total"><span class="sum-label">Skutečně odešlo</span><span class="sum-value">${money(row.outgo)}</span></div>
        </div>
        <span class="sum-note">Přišlo ${money(row.income)}</span>
      </section>
      ${cats.length ? `<ul class="item-list group money-cats">${cats.map(([name, amount]) => {
        const shops = SHOP_CATEGORIES.includes(name) ? shopsOf(row, name) : [];
        const open = shops.length && openCats.has(name);
        const head = `<span class="item-text"><span class="item-name">${escapeHtml(name)}</span></span><span class="item-amount">${money(amount)}</span>`;
        return `<li class="item money-cat${open ? ' is-open' : ''}">
          ${shops.length
    ? `<button type="button" class="item-main" data-cat="${escapeHtml(name)}" aria-expanded="${Boolean(open)}">${head}</button>`
    : `<div class="item-main">${head}</div>`}
          ${open ? `<ul class="money-shops">${shops.map(([shop, value]) => `<li class="money-shop"><span>${escapeHtml(shop)}</span><span>${money(value)}</span></li>`).join('')}</ul>` : ''}
        </li>`;
      }).join('')}</ul>` : ''}`;
  }

  root.addEventListener('click', async (e) => {
    const cat = e.target.closest('[data-cat]');
    if (cat) {
      if (openCats.has(cat.dataset.cat)) openCats.delete(cat.dataset.cat);
      else openCats.add(cat.dataset.cat);
      draw();
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
    const payments = await store.listPayments();
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
  };
}
