// Recepty (#/recepty, otevírá se z Více). Čtyři obrazovky podle adresy:
//   #/recepty                  seznam receptů
//   #/recepty/novy             nový recept
//   #/recepty/<id>             recept: výběr ingrediencí do nákupu a postup
//   #/recepty/<id>/upravit     úprava receptu
//   #/recepty/zasoby           co máme doma -> co se z toho dá uvařit
//   #/recepty/<id>/zasoby      recept otevřený ze zásob (předvybrané jen to, co chybí)

import * as store from '../store.js';
import { parseEntry, normalize } from '../categories.js';
import { findProduct, searchProducts } from '../catalog.js';
import { escapeHtml, ICONS, toast, undoToast, rowGestures, openMenu, openSheet, dragSort } from '../ui.js';
import { navigate } from '../router.js';

export const title = 'Recepty';
export const tab = 'vice';

const NEW = 'novy';
const PANTRY = 'zasoby';

function plural(n, one, few, many) {
  if (n === 1) return `1 ${one}`;
  if (n >= 2 && n <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

export async function render(el, { params, extraEl }) {
  const [first, second] = params ?? [];
  if (first === PANTRY) return renderPantry(el);
  if (first === NEW) return renderEdit(el, null);
  if (first && second === 'upravit') return renderEdit(el, first);
  if (first) return renderRecipe(el, first, second === PANTRY);
  return renderList(el, extraEl);
}

// Stránky jednoho receptu nemají horní lištu, nahoře je šipka zpět a název
function page(el, backTo) {
  document.getElementById('app').classList.add('no-topbar');
  const root = document.createElement('div');
  root.className = 'detail';
  el.append(root);
  const back = `<a class="back-btn" href="#/${backTo}" aria-label="Zpět">${ICONS.back}</a>`;
  return { root, back };
}

// ---------- Seznam receptů ----------

async function renderList(el, extraEl) {
  const root = document.createElement('div');
  el.append(root);

  const pantryBtn = document.createElement('a');
  pantryBtn.className = 'btn btn-small';
  pantryBtn.href = `#/recepty/${PANTRY}`;
  pantryBtn.textContent = 'Co uvařit';
  const addBtn = document.createElement('a');
  addBtn.className = 'add-btn';
  addBtn.href = `#/recepty/${NEW}`;
  addBtn.setAttribute('aria-label', 'Přidat recept');
  addBtn.innerHTML = ICONS.plus;
  extraEl.append(pantryBtn, addBtn);

  async function draw() {
    const recipes = await store.listRecipes();
    root.innerHTML = recipes.length
      ? `<ul class="item-list group">${recipes.map((r) => `<li class="item" data-id="${escapeHtml(r.id)}">
          <div class="item-bg" aria-hidden="true">Smazat</div>
          <button type="button" class="item-main">
            <span class="item-text"><span class="item-name">${escapeHtml(r.name)}</span><span class="item-sub">${plural((r.ingredients ?? []).length, 'ingredience', 'ingredience', 'ingrediencí')}</span></span>
          </button>
        </li>`).join('')}</ul>`
      : `<div class="empty"><div class="empty-icon">${ICONS.recipe}</div><p class="empty-title">Zatím žádné recepty</p></div>`;
  }

  async function remove(id) {
    const removed = await store.removeRecipes([id]);
    if (removed.length) undoToast(`${removed[0].name}: smazáno`, () => store.restoreRecipes(removed));
  }

  const open = (id) => navigate(`recepty/${id}`);
  const endGesture = rowGestures(root, { onTap: (li) => open(li.dataset.id), onPress: open, onSwipe: remove });

  await draw();
  const unsubscribe = store.subscribe(draw);
  return () => {
    unsubscribe();
    endGesture();
  };
}

// ---------- Recept: ingredience do nákupu a postup ----------

async function renderRecipe(el, id, fromPantry) {
  const { root, back } = page(el, fromPantry ? `recepty/${PANTRY}` : 'recepty');
  let recipe = await store.getRecipe(id);
  if (!recipe) {
    root.innerHTML = `<div class="detail-head">${back}<span class="detail-name">Recept už neexistuje</span></div>`;
    return undefined;
  }

  // Vybrané = půjdou do nákupu. Ze zásob jsou předvybrané jen ty, co chybí.
  const pantry = fromPantry ? await store.getPantry() : [];
  const picked = new Set((recipe.ingredients ?? [])
    .map((ing, i) => (fromPantry && store.hasIngredient(pantry, ing.name) ? null : i))
    .filter((i) => i !== null));

  function draw() {
    const ingredients = recipe.ingredients ?? [];
    root.innerHTML = `
      <div class="detail-head">${back}
        <span class="detail-name">${escapeHtml(recipe.name)}</span>
        <a class="btn btn-ghost btn-small" href="#/recepty/${escapeHtml(id)}/upravit">Upravit</a>
      </div>
      ${ingredients.length ? `
        <div class="done-head" style="margin-top: 6px">
          <p class="section-label">Ingredience</p>
          <button type="button" class="btn btn-ghost btn-small" data-action="all">${picked.size === ingredients.length ? 'Nic' : 'Vše'}</button>
        </div>
        <ul class="item-list group">${ingredients.map((ing, i) => `<li class="catalog-row pick-row${picked.has(i) ? ' is-on' : ''}">
          <button type="button" class="shop-pick" data-index="${i}" aria-pressed="${picked.has(i)}">
            <span class="check">${ICONS.check}</span>
            <span class="item-text"><span class="item-name">${escapeHtml(ing.name)}</span>${ing.qty ? `<span class="item-qty">${escapeHtml(ing.qty)}</span>` : ''}</span>
          </button>
        </li>`).join('')}</ul>
        <button type="button" class="btn btn-primary btn-block" data-action="shop" style="margin-top: 12px"${picked.size ? '' : ' disabled'}>${ICONS.cart} Do nákupu (${picked.size})</button>` : ''}
      ${recipe.method ? `<p class="section-label">Postup</p><div class="note-view is-open recipe-method">${methodHtml(recipe.method, recipe.hints)}</div>` : ''}`;
  }

  root.addEventListener('click', async (e) => {
    // Podtržený výraz v postupu: ťuknutí ukáže vysvětlení, další ho schová
    const term = e.target.closest('[data-hint]');
    if (term) {
      const hint = (recipe.hints ?? [])[Number(term.dataset.hint)];
      if (hint) openMenu(term, (menu) => { menu.innerHTML = `<p class="hint-pop">${escapeHtml(hint.note)}</p>`; });
      return;
    }
    const row = e.target.closest('[data-index]');
    if (row) {
      const i = Number(row.dataset.index);
      if (picked.has(i)) picked.delete(i);
      else picked.add(i);
      draw();
      return;
    }
    const action = e.target.closest('[data-action]')?.dataset.action;
    const ingredients = recipe.ingredients ?? [];
    if (action === 'all') {
      const all = picked.size === ingredients.length;
      picked.clear();
      if (!all) ingredients.forEach((_, i) => picked.add(i));
      draw();
    }
    if (action === 'shop') {
      const chosen = ingredients.filter((_, i) => picked.has(i));
      const added = await store.addIngredientsToShopping(chosen);
      toast(added === chosen.length ? `Přidáno do nákupu: ${added}` : `Přidáno do nákupu: ${added}, zbytek už na seznamu byl`, {
        actionLabel: 'Nákup',
        onAction: () => navigate('nakup'),
      });
    }
  });

  draw();
  return store.subscribe(async () => {
    const fresh = await store.getRecipe(id);
    if (!fresh) {
      navigate('recepty');
      return;
    }
    // Počet ingrediencí se mohl změnit, výběr musí sedět na nový seznam
    if ((fresh.ingredients ?? []).length !== (recipe.ingredients ?? []).length) {
      picked.clear();
      (fresh.ingredients ?? []).forEach((_, i) => picked.add(i));
    }
    recipe = fresh;
    draw();
  });
}

// ---------- Nový recept a úprava ----------

// Jednotky množství. "ks" se do množství nepíše ("2"), ostatní ano ("500 g").
const UNITS = ['ks', 'g', 'kg', 'ml', 'l', 'lžíce', 'lžička', 'hrnek', 'špetka'];

// Jednotka, která se nabídne jako první: tekutiny v ml, sypké a maso v g
const LIQUID = ['mlek', 'mlik', 'smetan', 'olej', 'vod', 'vin', 'piv', 'ocet', 'sirup', 'dzus', 'vyvar', 'kefir', 'podmasl', 'slehack'];
const WEIGHT = ['mouk', 'cukr', 'ryz', 'maso', 'mlet', 'kurec', 'veprov', 'hovez', 'krut', 'syr', 'masl', 'testovin', 'spaget', 'cock',
  'fazol', 'cizrn', 'strouhank', 'tvaroh', 'vlock', 'kakao', 'sunk', 'slanin', 'salam', 'parmaz', 'eidam', 'mozzarel', 'orech', 'cokolad'];

function defaultUnit(name) {
  const words = normalize(name).split(' ');
  const has = (stems) => words.some((w) => stems.some((stem) => w.startsWith(stem)));
  if (has(['sul', 'pepr', 'koreni', 'skoric', 'kmin', 'majorank', 'oregan'])) return 'špetka';
  if (has(LIQUID)) return 'ml';
  if (has(WEIGHT)) return 'g';
  return 'ks';
}

// "500 g" -> { n: '500', unit: 'g' }, "2" -> { n: '2', unit: 'ks' }
function splitQty(qty, name) {
  const m = String(qty ?? '').trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return { n: '', unit: defaultUnit(name) };
  return { n: m[1], unit: m[2].trim() || 'ks' };
}

const joinQty = ({ n, unit }) => (!n ? '' : unit === 'ks' ? n : `${n} ${unit}`);

// Postup s podtrženými výrazy, ke kterým existuje vysvětlení
function methodHtml(method, hints = []) {
  const known = (hints ?? []).map((h, index) => ({ ...h, index })).filter((h) => h.term);
  if (!known.length) return escapeHtml(method);
  // Delší výrazy mají přednost, ať se "zesklovatět cibuli" nerozpadne na "cibuli"
  const sorted = [...known].sort((x, y) => y.term.length - x.term.length);
  const pattern = new RegExp(`(${sorted.map((h) => h.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return method.split(pattern).map((part) => {
    const hint = sorted.find((h) => h.term.toLowerCase() === part.toLowerCase());
    return hint ? `<button type="button" class="hint-term" data-hint="${hint.index}">${escapeHtml(part)}</button>` : escapeHtml(part);
  }).join('');
}

async function renderEdit(el, id) {
  const { root, back } = page(el, id ? `recepty/${id}` : 'recepty');
  const recipe = id ? await store.getRecipe(id) : { name: '', ingredients: [], method: '', hints: [] };
  if (!recipe) {
    navigate('recepty');
    return undefined;
  }

  // Rozpracovaný stav je jen v paměti, uloží se tlačítkem
  let rows = (recipe.ingredients ?? []).map((ing) => ({ key: store.newId(), name: ing.name, ...splitQty(ing.qty, ing.name) }));
  let hints = (recipe.hints ?? []).map((h) => ({ ...h }));

  root.innerHTML = `
    <form class="edit-form" autocomplete="off">
      <div class="detail-head">${back}
        <textarea class="input detail-title" name="name" rows="1" aria-label="Název" placeholder="Nový recept"></textarea>
      </div>

      <p class="section-label">Ingredience</p>
      <ul class="item-list group ing-list"></ul>
      <div class="add-form ing-add">
        <input class="input" name="entry" type="text" placeholder="Přidat ingredienci…" aria-label="Přidat ingredienci"
          enterkeyhint="done" autocapitalize="sentences" spellcheck="false">
        <button class="add-btn" type="button" data-action="ing-add" aria-label="Přidat">${ICONS.plus}</button>
      </div>
      <div class="chips suggest" hidden></div>

      <p class="section-label">Postup</p>
      <textarea class="input" name="method" rows="6" autocapitalize="sentences" aria-label="Postup"></textarea>
      <div class="hint-bar">
        <button type="button" class="btn btn-small" data-action="hint-add">${ICONS.plus} Vysvětlení</button>
        <span class="hint-chips"></span>
      </div>

      <div class="btn-row" style="margin-top: 18px">
        ${id ? '<button type="button" class="btn btn-danger" data-action="delete">Smazat</button>' : ''}
        <button type="submit" class="btn btn-primary">${id ? 'Uložit' : 'Přidat'}</button>
      </div>
    </form>`;

  const form = root.querySelector('form');
  const listEl = root.querySelector('.ing-list');
  const entry = form.elements.entry;
  const suggestEl = root.querySelector('.suggest');
  const hintChips = root.querySelector('.hint-chips');
  const methodEl = form.elements.method;
  const grow = (area) => { area.style.height = 'auto'; area.style.height = `${area.scrollHeight + 2}px`; };

  form.elements.name.value = recipe.name;
  methodEl.value = recipe.method ?? '';
  [form.elements.name, methodEl].forEach((area) => {
    grow(area);
    area.addEventListener('input', () => grow(area));
  });
  form.elements.name.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    entry.focus();
  });
  if (!id) form.elements.name.focus();

  // ---------- Ingredience: každá na svém řádku s množstvím a jednotkou ----------

  function drawRows() {
    listEl.innerHTML = rows.map((row) => `<li class="ing-row" data-key="${row.key}">
        <span class="ing-name">${escapeHtml(row.name)}</span>
        <input class="input ing-qty" name="qty" inputmode="decimal" value="${escapeHtml(row.n)}" placeholder="1" aria-label="Množství">
        <button type="button" class="opt ing-unit" data-action="unit">${escapeHtml(row.unit)}</button>
        <button type="button" class="icon-btn" data-action="ing-remove" aria-label="Odebrat">×</button>
      </li>`).join('');
  }

  // Věc se zapíše pod názvem z katalogu, "mouka 500 g" se rozdělí
  function addRow(text) {
    const parsed = parseEntry(text);
    if (!parsed.name) return;
    const name = findProduct(parsed.name)?.name ?? parsed.name;
    rows = [...rows, { key: store.newId(), name, ...splitQty(parsed.qty, name) }];
    drawRows();
  }

  function suggest() {
    const typed = entry.value.trim();
    const found = typed ? searchProducts(parseEntry(typed).name, 6) : [];
    suggestEl.hidden = !found.length;
    suggestEl.innerHTML = found
      .map((p) => `<button type="button" class="chip" data-name="${escapeHtml(p.name)}">${escapeHtml(p.name)}</button>`)
      .join('');
  }

  const submitEntry = () => {
    const text = entry.value;
    entry.value = '';
    suggest();
    addRow(text);
    entry.focus();
  };
  entry.addEventListener('input', suggest);
  entry.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    submitEntry();
  });
  suggestEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.chip')) e.preventDefault();
  });
  suggestEl.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-name]');
    if (!chip) return;
    // Množství napsané za názvem se použije i s vybraným našeptaným názvem
    const qty = parseEntry(entry.value).qty;
    entry.value = '';
    suggest();
    addRow(`${chip.dataset.name}${qty ? ` ${qty}` : ''}`);
    entry.focus();
  });

  listEl.addEventListener('input', (e) => {
    const row = rows.find((r) => r.key === e.target.closest('[data-key]')?.dataset.key);
    if (row && e.target.name === 'qty') row.n = e.target.value.trim().replace(/[^\d.,]/g, '');
  });

  // Enter v množství nesmí odeslat celý recept
  listEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.target.blur();
  });

  const endSort = dragSort(listEl, {
    item: '.ing-row',
    handle: '.ing-name',
    attr: 'data-key',
    onDrop: (keys) => {
      rows = keys.map((key) => rows.find((r) => r.key === key)).filter(Boolean);
    },
  });

  // ---------- Vysvětlení k postupu ----------
  // V postupu se označí slovo nebo kus textu a ťukne se na "+ Vysvětlení".
  // Výraz je pak v receptu podtržený a po ťuknutí ukáže vysvětlení.

  function drawHints() {
    hintChips.innerHTML = hints
      .map((h, i) => `<button type="button" class="chip hint-chip${methodEl.value.toLowerCase().includes(h.term.toLowerCase()) ? '' : ' is-missing'}" data-hint="${i}">${escapeHtml(h.term)}</button>`)
      .join('');
  }
  methodEl.addEventListener('input', drawHints);

  function openHint(index, term = '') {
    const existing = index === null ? null : hints[index];
    openSheet('Vysvětlení', (body, close) => {
      body.innerHTML = `<form class="edit-form" autocomplete="off">
        <label class="field"><span>Výraz v postupu</span>
          <input class="input" name="term" value="${escapeHtml(existing?.term ?? term)}" required></label>
        <label class="field"><span>Vysvětlení</span>
          <textarea class="input" name="note" rows="3" required>${escapeHtml(existing?.note ?? '')}</textarea></label>
        <div class="btn-row">
          ${existing ? '<button type="button" class="btn btn-danger" data-action="remove">Smazat</button>' : ''}
          <button type="submit" class="btn btn-primary">Uložit</button>
        </div>
      </form>`;
      const f = body.querySelector('form');
      (f.elements.term.value ? f.elements.note : f.elements.term).focus();
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const hint = { term: f.elements.term.value.trim(), note: f.elements.note.value.trim() };
        if (!hint.term || !hint.note) return;
        if (existing) hints[index] = hint;
        else hints = [...hints, hint];
        close();
        drawHints();
      });
      f.querySelector('[data-action="remove"]')?.addEventListener('click', () => {
        hints = hints.filter((_, i) => i !== index);
        close();
        drawHints();
      });
    });
  }

  // Tlačítko nesmí vzít fokus postupu, jinak by se ztratilo označení textu
  root.querySelector('[data-action="hint-add"]').addEventListener('pointerdown', (e) => e.preventDefault());

  // ---------- Akce ----------

  root.addEventListener('click', async (e) => {
    const chip = e.target.closest('.hint-chip');
    if (chip) {
      openHint(Number(chip.dataset.hint));
      return;
    }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'ing-add') submitEntry();
    if (action === 'hint-add') {
      const selected = methodEl.value.slice(methodEl.selectionStart, methodEl.selectionEnd).replace(/\s+/g, ' ').trim();
      openHint(null, selected);
    }
    const rowEl = e.target.closest('[data-key]');
    if (rowEl && action === 'ing-remove') {
      rows = rows.filter((r) => r.key !== rowEl.dataset.key);
      drawRows();
    }
    if (rowEl && action === 'unit') {
      const row = rows.find((r) => r.key === rowEl.dataset.key);
      const options = UNITS.includes(row.unit) ? UNITS : [row.unit, ...UNITS];
      openMenu(e.target.closest('button'), (menu, close) => {
        menu.classList.add('menu-narrow');
        menu.innerHTML = options
          .map((unit) => `<button type="button" class="menu-item" data-value="${escapeHtml(unit)}" aria-pressed="${unit === row.unit}">${escapeHtml(unit)}</button>`)
          .join('');
        menu.addEventListener('click', (ev) => {
          const btn = ev.target.closest('[data-value]');
          if (!btn) return;
          close();
          row.unit = btn.dataset.value;
          drawRows();
        });
      });
    }
    if (action === 'delete') {
      const removed = await store.removeRecipes([id]);
      if (removed.length) undoToast(`${removed[0].name}: smazáno`, () => store.restoreRecipes(removed));
      navigate('recepty');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.elements.name.value.replace(/\s+/g, ' ').trim();
    if (!name) {
      form.elements.name.focus();
      return;
    }
    // Rozepsaná ingredience v poli se nesmí ztratit
    if (entry.value.trim()) addRow(entry.value);
    const ingredients = rows.map((row) => ({ name: row.name, qty: joinQty(row) }));
    const saved = await store.saveRecipe({ id, name, ingredients, method: methodEl.value, hints });
    navigate(`recepty/${saved.id}`);
  });

  drawRows();
  drawHints();
  return endSort;
}

// ---------- Co máme doma -> co uvařit ----------

async function renderPantry(el) {
  const { root, back } = page(el, 'recepty');
  root.innerHTML = `
    <div class="detail-head">${back}
      <span class="detail-name">Co uvařit</span>
      <span class="pantry-count" aria-label="Dostupných receptů"></span>
    </div>
    <form class="add-form" autocomplete="off">
      <input class="input" name="entry" type="text" placeholder="Co máme doma…" aria-label="Co máme doma"
        enterkeyhint="done" autocapitalize="sentences" autocorrect="on" spellcheck="false">
      <button class="add-btn" type="submit" aria-label="Přidat">${ICONS.plus}</button>
    </form>
    <div class="chips suggest" hidden></div>
    <div class="pantry-items"></div>
    <div class="list-root"></div>`;

  const form = root.querySelector('form');
  const input = form.elements.entry;
  const suggestEl = root.querySelector('.suggest');
  const itemsEl = root.querySelector('.pantry-items');
  const countEl = root.querySelector('.pantry-count');
  const listRoot = root.querySelector('.list-root');

  let have = await store.getPantry();
  let almostOpen = false;

  const row = ({ recipe, missing }) => `<li class="item"><a class="item-main" href="#/recepty/${escapeHtml(recipe.id)}/${PANTRY}">
      <span class="item-text"><span class="item-name">${escapeHtml(recipe.name)}</span>${missing.length ? `<span class="item-sub">chybí: ${escapeHtml(missing.map((m) => m.name).join(', '))}</span>` : ''}</span>
    </a></li>`;

  async function draw() {
    itemsEl.innerHTML = have
      .map((name, i) => `<button type="button" class="chip pantry-chip" data-remove="${i}" aria-label="Odebrat ${escapeHtml(name)}">${escapeHtml(name)}<span aria-hidden="true">×</span></button>`)
      .join('');

    const matches = (await store.matchRecipes(have)).filter((m) => (m.recipe.ingredients ?? []).length);
    const ready = matches.filter((m) => !m.missing.length);
    // "Skoro" = chybí jedna nebo dvě věci a aspoň něco z receptu doma je
    const almost = matches.filter((m) => m.missing.length >= 1 && m.missing.length <= 2
      && m.missing.length < m.recipe.ingredients.length);
    countEl.textContent = ready.length;
    countEl.classList.toggle('is-zero', !ready.length);

    listRoot.innerHTML = `
      ${ready.length ? `<ul class="item-list group">${ready.map(row).join('')}</ul>` : ''}
      ${almost.length ? `<button type="button" class="btn btn-block almost-btn" data-action="almost" aria-expanded="${almostOpen}">Skoro (${almost.length})</button>
        ${almostOpen ? `<ul class="item-list group">${almost.map(row).join('')}</ul>` : ''}` : ''}`;
  }

  async function setHave(next) {
    have = next;
    await store.setPantry(have);
    await draw();
  }

  // Věc se zapíše pod názvem z katalogu ("mlíko" -> Mléko) a jen jednou
  async function add(text) {
    const typed = parseEntry(text).name;
    if (!typed) return;
    const name = findProduct(typed)?.name ?? typed;
    if (!store.hasIngredient(have, name)) await setHave([...have, name]);
  }

  function suggest() {
    const typed = input.value.trim();
    const found = typed ? searchProducts(typed, 6).filter((p) => !store.hasIngredient(have, p.name)) : [];
    suggestEl.hidden = !found.length;
    suggestEl.innerHTML = found
      .map((p) => `<button type="button" class="chip" data-name="${escapeHtml(p.name)}">${escapeHtml(p.name)}</button>`)
      .join('');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = '';
    input.focus();
    suggest();
    await add(text);
  });
  input.addEventListener('input', suggest);

  // Čip nesmí vzít fokus poli, jinak by se na iPhonu zavřela klávesnice
  suggestEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.chip')) e.preventDefault();
  });
  suggestEl.addEventListener('click', async (e) => {
    const chip = e.target.closest('[data-name]');
    if (!chip) return;
    input.value = '';
    suggest();
    await add(chip.dataset.name);
  });

  itemsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-remove]');
    if (chip) setHave(have.filter((_, i) => i !== Number(chip.dataset.remove)));
  });

  listRoot.addEventListener('click', (e) => {
    if (!e.target.closest('[data-action="almost"]')) return;
    almostOpen = !almostOpen;
    draw();
  });

  await draw();
  return store.subscribe(draw);
}
