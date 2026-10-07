// Nákupní seznam: rychlé přidání nahoře, pod ním jeden vodorovný řádek
// (často kupované nebo našeptávač a za nimi kategorie s katalogem), seznam
// seřazený tak, jak se prochází vybraný obchod.
// Ťuknutí = koupeno, podržení = úprava (i množství), potažení doleva = smazat.
// Seznam je schválně hustý: jeden souvislý blok, kategorie jen jako malý nadpis.

import * as store from '../store.js';
import { CATEGORIES, categoryName, parseEntry, stepQty, qtyNumber } from '../categories.js';
import { escapeHtml, ICONS, toast, undoToast, openSheet, itemsCount, rowGestures, dragSort } from '../ui.js';
import { productChips } from '../catalogui.js';

export const title = 'Nákup';

export async function render(el, { subEl, extraEl }) {
  el.innerHTML = `
    <div class="add-bar">
      <form class="add-form" autocomplete="off">
        <input class="input" name="entry" type="text" placeholder="Přidat položku…" aria-label="Přidat položku"
          enterkeyhint="done" autocapitalize="sentences" autocorrect="on" spellcheck="false">
        <button class="add-btn" type="submit" aria-label="Přidat">${ICONS.plus}</button>
      </form>
      <div class="chips"></div>
    </div>
    <div class="list-root"></div>`;

  const form = el.querySelector('.add-form');
  const input = form.elements.entry;
  const chipsEl = el.querySelector('.chips');
  const listRoot = el.querySelector('.list-root');

  // Výběr obchodu v horní liště
  const shopBtn = document.createElement('button');
  shopBtn.type = 'button';
  shopBtn.className = 'btn btn-small shop-btn';
  shopBtn.addEventListener('click', () => openShops());
  extraEl.append(shopBtn);

  let me = await store.getMe();
  let shop = await store.currentShop();
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

  // ---------- Bublinky pod polem a katalog kategorií ----------
  // Společné s recepty (js/catalogui.js), ať se všude chovají stejně.

  const refreshChips = productChips(chipsEl, {
    input,
    // Při psaní našeptává z historie i z katalogu, jinak nabízí často kupované
    quick: async (typed) => (typed ? await store.suggestions(parseEntry(typed).name, 8) : await store.frequent(6)).map((h) => h.name),
    onPick: async (name) => {
      const typed = input.value.trim() ? parseEntry(input.value) : { qty: '' };
      input.value = '';
      await add(name, typed.qty);
    },
    count: async (name) => {
      const item = await store.shoppingItem(name);
      return item ? qtyNumber(item.qty) : 0;
    },
    step: async (name, direction) => {
      const item = await store.shoppingItem(name);
      if (!item) {
        if (direction > 0) await store.addItem({ name });
      } else if (direction < 0 && stepQty(item.qty, -1) === item.qty) {
        // Z jednoho kusu dolů = pryč ze seznamu
        await store.removeItems([item.id]);
      } else {
        await store.updateItem(item.id, { qty: stepQty(item.qty, direction) });
      }
    },
  });

  // ---------- Obchody ----------

  async function openShops() {
    const shops = await store.listShops();
    openSheet('Obchod', (body, close) => {
      body.innerHTML = `
        <ul class="item-list group">${shops.map((s) => `<li class="catalog-row${s.key === shop.key ? ' is-on' : ''}">
          <button type="button" class="shop-pick" data-pick="${escapeHtml(s.key)}">
            <span class="check">${ICONS.check}</span><span class="item-name">${escapeHtml(s.name)}</span>
          </button>
          <button type="button" class="btn btn-ghost btn-small" data-edit="${escapeHtml(s.key)}">Pořadí</button>
        </li>`).join('')}</ul>
        <button type="button" class="btn btn-block" data-new style="margin-top: 12px">${ICONS.plus} Přidat obchod</button>`;

      body.addEventListener('click', async (e) => {
        const pick = e.target.closest('[data-pick]');
        if (pick) {
          await store.selectShop(pick.dataset.pick);
          close();
          return;
        }
        const edit = e.target.closest('[data-edit]');
        if (edit) {
          close();
          openShopEdit(shops.find((s) => s.key === edit.dataset.edit));
          return;
        }
        if (e.target.closest('[data-new]')) {
          close();
          openShopEdit({ key: null, name: '', order: shop.order, builtin: false });
        }
      });
    });
  }

  // Úprava obchodu: název a pořadí kategorií (podržet a přetáhnout)
  function openShopEdit(target) {
    let order = [...target.order];
    openSheet(target.key ? 'Pořadí v obchodě' : 'Nový obchod', (body, close) => {
      body.innerHTML = `<form class="edit-form" autocomplete="off">
        <label class="field"><span>Název obchodu</span>
          <input class="input" name="name" value="${escapeHtml(target.name)}" placeholder="Lidl Blackfield" required></label>
        <ul class="item-list group order-list"></ul>
        <div class="btn-row" style="margin-top: 14px">
          ${target.key && !target.builtin ? '<button type="button" class="btn btn-danger" data-action="delete">Smazat</button>' : ''}
          <button type="submit" class="btn btn-primary">Uložit</button>
        </div>
      </form>`;

      const f = body.querySelector('form');
      const listEl = f.querySelector('.order-list');
      const drawOrder = () => {
        listEl.innerHTML = order.map((id, i) => `<li class="catalog-row order-row" data-cat="${id}">
          <span class="order-num">${i + 1}</span>
          <span class="item-text"><span class="item-name">${escapeHtml(categoryName(id))}</span></span>
          <span class="order-grip" aria-hidden="true">≡</span>
        </li>`).join('');
      };
      drawOrder();
      if (!target.key) f.elements.name.focus();

      // Pořadí oddělení: podržet a přetáhnout
      dragSort(listEl, {
        item: '.order-row',
        handle: '.order-row',
        attr: 'data-cat',
        onDrop: (ids) => {
          order = ids;
          drawOrder();
        },
      });

      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = f.elements.name.value.trim();
        if (!name) return;
        const key = await store.saveShop({ key: target.key, name, order });
        await store.selectShop(key);
        close();
      });
      f.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
        await store.removeShop(target.key);
        close();
      });
    });
  }

  // ---------- Vykreslení seznamu ----------

  function row(item) {
    const who = item.addedBy && item.addedBy !== me
      ? `<span class="item-who" title="Přidal(a) ${escapeHtml(item.addedBy)}">${escapeHtml(item.addedBy.charAt(0))}</span>`
      : '';
    // Množství je vidět, jen když je víc než jeden kus. Mění se v úpravě (podržení).
    const qty = item.qty && item.qty !== '1' ? `<span class="item-qty">${escapeHtml(item.qty)}</span>` : '';
    return `<li class="item${item.done ? ' is-done' : ''}" data-id="${escapeHtml(item.id)}">
      <div class="item-bg" aria-hidden="true">Smazat</div>
      <button type="button" class="item-main" aria-pressed="${item.done}">
        <span class="check">${ICONS.check}</span>
        <span class="item-text"><span class="item-name">${escapeHtml(item.name)}</span>${qty}</span>
        ${who}
      </button>
    </li>`;
  }

  async function renderList() {
    const token = ++renderToken;
    const items = await store.listItems();
    [me, shop] = await Promise.all([store.getMe(), store.currentShop()]);
    if (token !== renderToken) return;

    shopBtn.textContent = shop.name;

    const open = items.filter((i) => !i.done);
    const done = items.filter((i) => i.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));

    subEl.hidden = open.length === 0;
    subEl.textContent = open.length ? itemsCount(open.length) : '';

    if (!items.length) {
      listRoot.innerHTML = `<div class="empty">
        <div class="empty-icon">${ICONS.cart}</div>
        <p class="empty-title">Seznam je prázdný</p>
      </div>`;
      return;
    }

    // Jeden souvislý seznam v pořadí, jak se prochází vybraný obchod.
    // Kategorie je jen malý nadpis uvnitř, ať se na obrazovku vejde co nejvíc.
    let out = '';
    let rows = '';
    for (const id of shop.order) {
      const inCat = open.filter((i) => (CATEGORIES.some((c) => c.id === i.category) ? i.category : 'ostatni') === id);
      if (!inCat.length) continue;
      rows += `<li class="cat-head">${escapeHtml(categoryName(id))}</li>${inCat.map(row).join('')}`;
    }
    if (rows) out += `<ul class="item-list group is-dense">${rows}</ul>`;

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
        <ul class="item-list group is-dense">${done.map(row).join('')}</ul>`;
    }

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
    // Rozběhnuté vykreslení už nesmí přepsat podtitulek jiné obrazovky
    renderToken += 1;
  };
}
