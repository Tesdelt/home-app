// Nákupní seznam: rychlé přidání nahoře, položky podle kategorií,
// ťuknutí = koupeno, podržení = úprava, potažení doleva = smazat (se Zpět).

import * as store from '../store.js';
import { CATEGORIES, parseEntry } from '../categories.js';
import { escapeHtml, ICONS, toast, undoToast, openSheet, itemsCount, rowGestures } from '../ui.js';

export const title = 'Nákup';

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

  const endGesture = rowGestures(listRoot, { onTap: toggle, onPress: openEdit, onSwipe: deleteItem });

  listRoot.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="clear"]')) clearDone();
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
