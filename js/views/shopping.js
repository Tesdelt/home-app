// Nákupní seznam: rychlé přidání nahoře, položky podle kategorií,
// ťuknutí = koupeno, podržení = úprava, potažení doleva = smazat (se Zpět).

import * as store from '../store.js';
import { CATEGORIES, parseEntry } from '../categories.js';
import { escapeHtml, ICONS, toast, undoToast, openSheet, itemsCount } from '../ui.js';

export const title = 'Nákup';

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 10;

export async function render(el, { subEl }) {
  el.innerHTML = `
    <div class="add-bar">
      <form class="add-form" autocomplete="off">
        <input class="input" name="entry" type="text" placeholder="Přidat položku…" aria-label="Přidat položku"
          enterkeyhint="done" autocapitalize="sentences" autocorrect="on" spellcheck="false">
        <button class="add-btn" type="submit" aria-label="Přidat">${ICONS.plus}</button>
      </form>
      <div class="chips" hidden></div>
    </div>
    <div class="list-root"></div>`;

  const form = el.querySelector('.add-form');
  const input = form.elements.entry;
  const chipsEl = el.querySelector('.chips');
  const listRoot = el.querySelector('.list-root');

  let me = await store.getMe();
  let renderToken = 0;

  // ---------- Přidávání ----------

  async function add(name, qty) {
    const { item, status } = await store.addItem({ name, qty });
    if (status === 'exists') toast(`${item.name} už na seznamu je`);
    else if (status === 'restored') toast(`${item.name} je zpátky na seznamu`);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { name, qty } = parseEntry(input.value);
    if (!name) return;
    input.value = '';
    input.focus();
    await add(name, qty);
  });

  input.addEventListener('input', () => refreshChips());

  // Čip nesmí vzít fokus poli, jinak by se na iPhonu zavřela klávesnice
  chipsEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.chip')) e.preventDefault();
  });
  chipsEl.addEventListener('click', async (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const typed = input.value.trim() ? parseEntry(input.value) : { qty: '' };
    input.value = '';
    await add(chip.dataset.name, typed.qty);
  });

  async function refreshChips() {
    const typed = input.value.trim();
    const entries = typed ? await store.suggestions(parseEntry(typed).name) : await store.frequent(12);
    chipsEl.hidden = entries.length === 0;
    chipsEl.innerHTML = entries
      .map((h) => `<button type="button" class="chip" data-name="${escapeHtml(h.name)}">${escapeHtml(h.name)}</button>`)
      .join('');
  }

  // ---------- Vykreslení seznamu ----------

  function row(item) {
    const who = item.addedBy && item.addedBy !== me
      ? `<span class="item-who" title="Přidal(a) ${escapeHtml(item.addedBy)}">${escapeHtml(item.addedBy.charAt(0))}</span>`
      : '';
    return `<li class="item${item.done ? ' is-done' : ''}" data-id="${escapeHtml(item.id)}">
      <div class="item-bg" aria-hidden="true">Smazat</div>
      <button type="button" class="item-main" aria-pressed="${item.done}">
        <span class="check">${ICONS.check}</span>
        <span class="item-text"><span class="item-name">${escapeHtml(item.name)}</span>${item.qty ? `<span class="item-qty">${escapeHtml(item.qty)}</span>` : ''}</span>
        ${who}
      </button>
    </li>`;
  }

  async function renderList() {
    const token = ++renderToken;
    const items = await store.listItems();
    me = await store.getMe();
    if (token !== renderToken) return;

    const open = items.filter((i) => !i.done);
    const done = items.filter((i) => i.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));

    subEl.hidden = open.length === 0;
    subEl.textContent = open.length ? itemsCount(open.length) : '';

    if (!items.length) {
      listRoot.innerHTML = `<div class="empty">
        <div class="empty-icon">${ICONS.cart}</div>
        <p class="empty-title">Seznam je prázdný</p>
        <p>Napište, co chybí. Množství jde přidat rovnou, třeba „mléko 2“.</p>
      </div>`;
      return;
    }

    let out = '';
    for (const cat of CATEGORIES) {
      const inCat = open.filter((i) => i.category === cat.id);
      if (!inCat.length) continue;
      out += `<p class="section-label">${escapeHtml(cat.name)}</p><ul class="item-list group">${inCat.map(row).join('')}</ul>`;
    }
    // Položky s neznámou kategorií (např. ze starší zálohy)
    const unknown = open.filter((i) => !CATEGORIES.some((c) => c.id === i.category));
    if (unknown.length) out += `<p class="section-label">Ostatní</p><ul class="item-list group">${unknown.map(row).join('')}</ul>`;

    if (!open.length) {
      out += `<div class="empty" style="padding-bottom: 16px">
        <div class="empty-icon">${ICONS.check}</div>
        <p class="empty-title">Všechno koupeno</p>
      </div>`;
    }

    if (done.length) {
      out += `<div class="done-head">
          <p class="section-label">Koupeno (${done.length})</p>
          <button type="button" class="btn btn-ghost btn-small" data-action="clear">Vyčistit</button>
        </div>
        <ul class="item-list group">${done.map(row).join('')}</ul>`;
    }

    out += '<p class="hint">Ťuknutím odškrtnete, podržením upravíte, potažením doleva smažete.</p>';
    listRoot.innerHTML = out;
  }

  // ---------- Akce s položkami ----------

  async function toggle(li) {
    const id = li.dataset.id;
    const nowDone = !li.classList.contains('is-done');
    li.classList.toggle('is-done', nowDone);
    // krátká pauza, ať je vidět odškrtnutí, než položka odjede
    await new Promise((r) => setTimeout(r, 180));
    await store.setDone(id, nowDone);
  }

  async function deleteItem(id) {
    const removed = await store.removeItems([id]);
    if (removed.length) undoToast(`${removed[0].name}: smazáno`, () => store.restoreItems(removed));
  }

  async function clearDone() {
    const removed = await store.clearDone();
    if (removed.length) undoToast(`Smazáno z koupených: ${itemsCount(removed.length)}`, () => store.restoreItems(removed));
  }

  async function openEdit(id) {
    const item = (await store.listItems()).find((i) => i.id === id);
    if (!item) return;
    openSheet('Upravit položku', (body, close) => {
      body.innerHTML = `<form class="edit-form" autocomplete="off">
        <label class="field"><span>Název</span>
          <input class="input" name="name" value="${escapeHtml(item.name)}" required></label>
        <label class="field"><span>Množství</span>
          <input class="input" name="qty" value="${escapeHtml(item.qty)}" placeholder="2 ks"></label>
        <label class="field"><span>Kategorie</span>
          <select class="input" name="category">
            ${CATEGORIES.map((c) => `<option value="${c.id}"${c.id === item.category ? ' selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
          </select></label>
        <div class="btn-row">
          <button type="button" class="btn btn-danger" data-action="delete">Smazat</button>
          <button type="submit" class="btn btn-primary">Uložit</button>
        </div>
      </form>`;
      const f = body.querySelector('form');
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = f.elements.name.value.trim();
        if (!name) return;
        await store.updateItem(id, { name, qty: f.elements.qty.value.trim(), category: f.elements.category.value });
        close();
      });
      f.querySelector('[data-action="delete"]').addEventListener('click', () => {
        close();
        deleteItem(id);
      });
    });
  }

  // ---------- Gesta: ťuknutí, podržení, potažení ----------

  let gesture = null;
  let ignoreClicksUntil = 0;

  function endGesture() {
    if (!gesture) return;
    clearTimeout(gesture.timer);
    gesture.main.classList.remove('is-dragging');
    gesture = null;
  }

  listRoot.addEventListener('pointerdown', (e) => {
    const main = e.target.closest('.item-main');
    if (!main || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const li = main.closest('.item');
    gesture = {
      main,
      li,
      id: li.dataset.id,
      x: e.clientX,
      y: e.clientY,
      dx: 0,
      mode: null,
      timer: setTimeout(() => {
        if (gesture && !gesture.mode) {
          gesture.mode = 'press';
          ignoreClicksUntil = Date.now() + 800;
          navigator.vibrate?.(10);
          openEdit(gesture.id);
        }
      }, LONG_PRESS_MS),
    };
  });

  listRoot.addEventListener('pointermove', (e) => {
    if (!gesture || gesture.mode === 'press') return;
    const mx = e.clientX - gesture.x;
    const my = e.clientY - gesture.y;
    if (!gesture.mode) {
      if (Math.abs(mx) > MOVE_TOLERANCE && Math.abs(mx) > Math.abs(my)) {
        gesture.mode = 'swipe';
        clearTimeout(gesture.timer);
        gesture.main.classList.add('is-dragging');
        try { gesture.main.setPointerCapture(e.pointerId); } catch { /* nevadí */ }
      } else if (Math.abs(my) > MOVE_TOLERANCE) {
        endGesture();
        return;
      } else {
        return;
      }
    }
    gesture.dx = Math.min(0, mx);
    gesture.main.style.transform = `translateX(${gesture.dx}px)`;
  });

  const finish = (cancelled) => () => {
    if (!gesture) return;
    const g = gesture;
    if (g.mode === 'swipe') {
      ignoreClicksUntil = Date.now() + 400;
      const threshold = Math.min(110, g.main.offsetWidth * 0.35);
      g.main.classList.remove('is-dragging');
      if (!cancelled && g.dx < -threshold) {
        g.main.style.transform = 'translateX(-100%)';
        setTimeout(() => deleteItem(g.id), 180);
      } else {
        g.main.style.transform = '';
      }
    }
    endGesture();
  };
  listRoot.addEventListener('pointerup', finish(false));
  listRoot.addEventListener('pointercancel', finish(true));

  listRoot.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.item-main')) e.preventDefault();
  });

  listRoot.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="clear"]')) {
      clearDone();
      return;
    }
    const main = e.target.closest('.item-main');
    if (!main || Date.now() < ignoreClicksUntil) return;
    toggle(main.closest('.item'));
  });

  // ---------- Start ----------

  await Promise.all([renderList(), refreshChips()]);
  if (matchMedia('(hover: hover)').matches) input.focus();

  const unsubscribe = store.subscribe(() => {
    renderList();
    refreshChips();
  });
  return () => {
    unsubscribe();
    endGesture();
  };
}
