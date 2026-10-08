// Recepty (#/recepty, otevírá se z Více). Čtyři obrazovky podle adresy:
//   #/recepty                  seznam receptů
//   #/recepty/novy             nový recept
//   #/recepty/<id>             recept: výběr ingrediencí do nákupu a postup
//   #/recepty/<id>/upravit     úprava receptu
//   #/recepty/zasoby           co máme doma -> co se z toho dá uvařit
//   #/recepty/<id>/zasoby      recept otevřený ze zásob (předvybrané jen to, co chybí)

import * as store from '../store.js';
import { parseEntry, normalize } from '../categories.js';
import { findProduct } from '../catalog.js';
import { productChips } from '../catalogui.js';
import { escapeHtml, ICONS, toast, undoToast, openMenu, openSheet, dragSort, holdKeyboard, squarePhoto } from '../ui.js';
import { navigate } from '../router.js';

export const title = 'Recepty';
export const tab = 'domu';

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

// Záložka seznamu vydrží, dokud je appka otevřená
let listTab = 'recipes';

async function renderList(el, extraEl) {
  const root = document.createElement('div');
  el.append(root);
  root.innerHTML = `
    <div class="segmented seg-bar tabs-only recipe-tabs" role="tablist">
      <button type="button" role="tab" data-tab="recipes">Recepty</button>
      <button type="button" role="tab" data-tab="skills">Skills</button>
    </div>
    <div class="list-root"></div>`;
  const tabsEl = root.querySelector('.recipe-tabs');
  const listRoot = root.querySelector('.list-root');

  const pantryBtn = document.createElement('a');
  pantryBtn.className = 'btn btn-small';
  pantryBtn.href = `#/recepty/${PANTRY}`;
  pantryBtn.textContent = 'Co uvařit';
  const addBtn = document.createElement('a');
  addBtn.className = 'add-btn';
  addBtn.href = `#/recepty/${NEW}`;
  addBtn.setAttribute('aria-label', 'Přidat recept');
  addBtn.innerHTML = ICONS.plus;
  // Na stránce nového receptu se rovnou píše název
  addBtn.addEventListener('click', () => holdKeyboard());
  extraEl.append(pantryBtn, addBtn);

  // Recept, který se právě vkládá do jiného (režim na stejné obrazovce jako
  // přesouvání úkolů: ovládání odjede, vkládaný recept se lehce třese, ťuknutí
  // na cílový recept ho tam vloží hned a bez ptaní)
  let linkId = null;

  function applyLinking() {
    const on = Boolean(linkId);
    listRoot.classList.toggle('is-moving-mode', on);
    [pantryBtn, addBtn, tabsEl].forEach((node) => node.classList.toggle('is-away', on));
    listRoot.querySelectorAll('.rcard').forEach((li) => li.classList.toggle('is-moving', li.dataset.id === linkId));
  }

  function setLinking(recipeId) {
    linkId = recipeId;
    applyLinking();
  }

  async function linkInto(targetId) {
    const sourceId = linkId;
    setLinking(null);
    if (targetId === sourceId) return;
    const added = await store.addSubRecipe(targetId, sourceId);
    if (added) undoToast(`${added.source.name}: přidáno do ${added.target.name}`, () => store.undoAddSubRecipe(added));
    else toast('Sem přidat nejde');
  }

  // Recepty jako mřížka čtverců: přes celý čtverec fotka, nahoře název,
  // dole čas (příprava+vaření)
  async function drawRecipes() {
    const [recipes, photos] = await Promise.all([store.listRecipes(), store.recipePhotos()]);
    if (linkId && !recipes.some((r) => r.id === linkId)) linkId = null;
    listRoot.innerHTML = recipes.length
      ? `<ul class="rgrid">${recipes.map((r) => {
        const time = store.recipeTime(r);
        return `<li class="rcard${photos[r.id] ? ' has-photo' : ''}" data-id="${escapeHtml(r.id)}">
          <button type="button" class="rcard-main">
            ${photos[r.id] ? `<img class="rcard-photo" src="${photos[r.id]}" alt="">` : `<span class="rcard-empty">${ICONS.recipe}</span>`}
            <span class="rcard-name">${escapeHtml(r.name)}</span>
            ${time ? `<span class="rcard-time">${escapeHtml(time)}</span>` : ''}
          </button>
          <button type="button" class="item-more rcard-more" data-more aria-label="Další možnosti">${ICONS.more}</button>
        </li>`;
      }).join('')}</ul>`
      : `<div class="empty"><div class="empty-icon">${ICONS.recipe}</div><p class="empty-title">Zatím žádné recepty</p></div>`;
    applyLinking();
  }

  // Skills: vysvětlivky ze všech receptů na jednom místě, u každé recepty,
  // ve kterých se používá
  async function drawSkills() {
    const skills = await store.listSkills();
    listRoot.innerHTML = skills.length
      ? `<ul class="skills">${skills.map((skill) => `<li class="skill">
          <p class="skill-term">${escapeHtml(skill.term)}</p>
          ${skill.notes.map((entry) => `<p class="skill-note">${escapeHtml(entry.note)}</p>
            <p class="skill-recipes">${entry.recipes.map((r) => `<a class="chip skill-recipe" href="#/recepty/${escapeHtml(r.id)}">${escapeHtml(r.name)}</a>`).join('')}</p>`).join('')}
        </li>`).join('')}</ul>`
      : `<div class="empty"><div class="empty-icon">${ICONS.recipe}</div><p class="empty-title">Zatím žádné skills</p></div>`;
  }

  function draw() {
    tabsEl.querySelectorAll('[data-tab]').forEach((btn) => btn.setAttribute('aria-pressed', btn.dataset.tab === listTab));
    return listTab === 'skills' ? drawSkills() : drawRecipes();
  }

  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    listTab = btn.dataset.tab;
    el.scrollTop = 0;
    draw();
  });

  async function remove(id) {
    const removed = await store.removeRecipes([id]);
    if (removed.length) undoToast(`${removed[0].name}: smazáno`, () => store.restoreRecipes(removed));
  }

  listRoot.addEventListener('click', (e) => {
    // Tři tečky: nabídka přímo u tlačítka
    const more = e.target.closest('[data-more]');
    if (more) {
      const recipeId = more.closest('.rcard').dataset.id;
      openMenu(more, (menu, close) => {
        menu.innerHTML = `<button type="button" class="menu-item" data-value="link">Přidat do receptu</button>
          <button type="button" class="menu-item is-danger" data-value="remove">Smazat</button>`;
        menu.addEventListener('click', (ev) => {
          const value = ev.target.closest('[data-value]')?.dataset.value;
          if (!value) return;
          close();
          if (value === 'link') setLinking(recipeId);
          if (value === 'remove') remove(recipeId);
        });
      });
      return;
    }
    const card = e.target.closest('.rcard');
    if (!card) return;
    if (linkId) linkInto(card.dataset.id);
    else navigate(`recepty/${card.dataset.id}`);
  });

  const endGesture = () => {};

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
  let view = await store.recipeView(id);
  let photo = (await store.recipePhotos())[id] ?? null;
  if (!view) {
    root.innerHTML = `<div class="detail-head">${back}<span class="detail-name">Recept už neexistuje</span></div>`;
    return undefined;
  }

  // Vybrané = půjdou do nákupu. Ze zásob jsou předvybrané jen ty, co chybí.
  // Seznam obsahuje i ingredience vložených receptů.
  const pantry = fromPantry ? await store.getPantry() : [];
  const picked = new Set(view.ingredients
    .map((ing, i) => (fromPantry && store.hasIngredient(pantry, ing.name) ? null : i))
    .filter((i) => i !== null));

  function draw() {
    const { recipe, subs, ingredients } = view;
    const pickRow = (ing, i) => `<li class="catalog-row pick-row${picked.has(i) ? ' is-on' : ''}">
        <button type="button" class="shop-pick" data-index="${i}" aria-pressed="${picked.has(i)}">
          <span class="check">${ICONS.check}</span>
          <span class="item-text"><span class="item-name">${escapeHtml(ing.name)}</span>${ing.qty ? `<span class="item-qty">${escapeHtml(ing.qty)}</span>` : ''}</span>
        </button>
      </li>`;
    // Vlastní ingredience, pod nimi po skupinách ty z vložených receptů
    const groups = [...new Set(ingredients.map((ing) => ing.from))];
    const rows = groups
      .map((from) => `${from ? `<li class="cat-head">${escapeHtml(from)}</li>` : ''}${ingredients.map((ing, i) => (ing.from === from ? pickRow(ing, i) : '')).join('')}`)
      .join('');
    root.innerHTML = `
      <div class="detail-head">${back}
        <span class="detail-name">${escapeHtml(recipe.name)}</span>
        <a class="btn btn-ghost btn-small" href="#/recepty/${escapeHtml(id)}/upravit">Upravit</a>
      </div>
      ${photo ? `<img class="recipe-photo" src="${photo}" alt="">` : ''}
      ${store.recipeTime(recipe) ? `<p class="recipe-time">${escapeHtml(store.recipeTime(recipe))}</p>` : ''}
      ${ingredients.length ? `
        <div class="done-head" style="margin-top: 6px">
          <p class="section-label">Ingredience</p>
          <button type="button" class="btn btn-ghost btn-small" data-action="all">${picked.size === ingredients.length ? 'Nic' : 'Vše'}</button>
        </div>
        <ul class="item-list group">${rows}</ul>
        <button type="button" class="btn btn-primary btn-block" data-action="shop" style="margin-top: 12px"${picked.size ? '' : ' disabled'}>${ICONS.cart} Do nákupu (${picked.size})</button>` : ''}
      ${subs.map((sub) => `<div class="done-head">
          <p class="section-label">${escapeHtml(sub.name)}</p>
          <a class="btn btn-ghost btn-small" href="#/recepty/${escapeHtml(sub.id)}">Otevřít</a>
        </div>
        ${sub.method ? stepsHtml(sub.method, sub.hints, sub.id) : ''}`).join('')}
      ${recipe.method ? `<p class="section-label">${subs.length ? escapeHtml(recipe.name) : 'Postup'}</p>${stepsHtml(recipe.method, recipe.hints, recipe.id)}` : ''}`;
  }

  root.addEventListener('click', async (e) => {
    // Podtržený výraz v postupu: ťuknutí ukáže vysvětlení, další ho schová
    const term = e.target.closest('[data-hint]');
    if (term) {
      const owner = [view.recipe, ...view.subs].find((r) => r.id === term.closest('[data-recipe]')?.dataset.recipe) ?? view.recipe;
      const hint = (owner.hints ?? [])[Number(term.dataset.hint)];
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
    const { ingredients } = view;
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
    const fresh = await store.recipeView(id);
    if (!fresh) {
      navigate('recepty');
      return;
    }
    // Počet ingrediencí se mohl změnit, výběr musí sedět na nový seznam
    if (fresh.ingredients.length !== view.ingredients.length) {
      picked.clear();
      fresh.ingredients.forEach((_, i) => picked.add(i));
    }
    view = fresh;
    photo = (await store.recipePhotos())[id] ?? null;
    draw();
  });
}

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

// Postup je uložený jako text, krok na řádek. Řádek začínající "|| " je
// další souběžná část předchozího kroku (dělá se mezitím): krok pak má části
// A, B, C… Starší recepty se souvislým textem se samy rozpadnou na kroky po řádcích.
const PARALLEL = '||';
const letter = (index) => String.fromCharCode(65 + index);

// Vrací [{ parts: [text části A, B, …] }]
function parseMethod(method) {
  const steps = [];
  for (const line of String(method ?? '').split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith(PARALLEL) && steps.length) steps.at(-1).parts.push(line.slice(PARALLEL.length).trim());
    else steps.push({ parts: [line] });
  }
  return steps;
}

const oneLine = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

function formatMethod(steps) {
  return steps
    .map((step) => step.parts.map(oneLine).filter(Boolean))
    .filter((parts) => parts.length)
    .map((parts) => parts.map((part, i) => (i ? `${PARALLEL} ${part}` : part)).join('\n'))
    .join('\n');
}

// Postup v receptu: očíslované kroky, souběžné části jako 1A, 1B, 1C…
function stepsHtml(method, hints, recipeId = '') {
  return `<ol class="rsteps" data-recipe="${escapeHtml(recipeId)}">${parseMethod(method).map((step, i) => (step.parts.length === 1
    ? `<li class="rstep-view"><span class="rstep-num">${i + 1}</span><div class="rstep-text">${methodHtml(step.parts[0], hints)}</div></li>`
    : `<li class="rstep-view is-split">${step.parts.map((part, p) => `<span class="rstep-num">${i + 1}${letter(p)}</span><div class="rstep-text">${methodHtml(part, hints)}</div>`).join('')}</li>`)).join('')}</ol>`;
}

async function renderEdit(el, id) {
  const { root, back } = page(el, id ? `recepty/${id}` : 'recepty');
  const recipe = id ? await store.getRecipe(id) : { name: '', ingredients: [], method: '', hints: [] };
  if (!recipe) {
    navigate('recepty');
    return undefined;
  }

  // Rozpracovaný stav je jen v paměti, uloží se tlačítkem
  // Řádek je buď ingredience, nebo vložený recept (recipeId)
  let rows = (recipe.ingredients ?? []).map((ing) => (ing.recipeId
    ? { key: store.newId(), name: ing.name, recipeId: ing.recipeId, n: '', unit: '' }
    : { key: store.newId(), name: ing.name, ...splitQty(ing.qty, ing.name) }));
  let hints = (recipe.hints ?? []).map((h) => ({ ...h }));

  root.innerHTML = `
    <form class="edit-form" autocomplete="off">
      <div class="detail-head">${back}
        <textarea class="input detail-title" name="name" rows="1" aria-label="Název" placeholder="Nový recept"></textarea>
      </div>

      <div class="recipe-meta">
        <label class="photo-box">
          <span class="photo-slot"></span>
          <input type="file" name="photo" accept="image/*" aria-label="Fotka receptu">
        </label>
        <div class="recipe-times">
          <label class="field"><span>Příprava (min)</span>
            <input class="input" name="prepMin" inputmode="numeric" placeholder="30"></label>
          <label class="field"><span>Vaření (min)</span>
            <input class="input" name="cookMin" inputmode="numeric" placeholder="20"></label>
          <button type="button" class="btn btn-ghost btn-danger btn-small" data-action="photo-remove" hidden>Odebrat fotku</button>
        </div>
      </div>

      <p class="section-label">Ingredience</p>
      <ul class="item-list group ing-list"></ul>
      <div class="add-form ing-add">
        <input class="input" name="entry" type="text" placeholder="Přidat ingredienci…" aria-label="Přidat ingredienci"
          enterkeyhint="done" autocapitalize="sentences" spellcheck="false">
        <button class="add-btn" type="button" data-action="ing-add" aria-label="Přidat">${ICONS.plus}</button>
      </div>
      <div class="chips ing-chips"></div>
      <button type="button" class="btn btn-ghost btn-small step-add" data-action="sub-add">${ICONS.plus} Recept</button>

      <p class="section-label">Postup</p>
      <ol class="rsteps rsteps-edit"></ol>
      <button type="button" class="btn btn-ghost btn-small step-add" data-action="rstep-add">${ICONS.plus} Krok</button>
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
  const hintChips = root.querySelector('.hint-chips');
  const stepsEl = root.querySelector('.rsteps-edit');
  // Kroky postupu: { key, parts }, parts = texty souběžných částí (A, B, C…),
  // běžný krok má jen jednu
  let steps = parseMethod(recipe.method).map((step) => ({ key: store.newId(), ...step }));
  const methodText = () => formatMethod(steps);
  const grow = (area) => { area.style.height = 'auto'; area.style.height = `${area.scrollHeight + 2}px`; };

  form.elements.name.value = recipe.name;
  form.elements.prepMin.value = recipe.prepMin ?? '';
  form.elements.cookMin.value = recipe.cookMin ?? '';

  // Fotka: undefined = beze změny, text = nová, null = odebrat. Ukládá se až
  // s receptem.
  let newPhoto;
  const savedPhoto = id ? (await store.recipePhotos())[id] ?? null : null;
  function drawPhoto() {
    const shown = newPhoto === undefined ? savedPhoto : newPhoto;
    root.querySelector('.photo-slot').innerHTML = shown ? `<img src="${shown}" alt="">` : ICONS.camera;
    root.querySelector('[data-action="photo-remove"]').hidden = !shown;
  }
  form.elements.photo.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      newPhoto = await squarePhoto(file);
      drawPhoto();
    } catch {
      toast('Fotku se nepodařilo načíst');
    }
  });
  drawPhoto();
  grow(form.elements.name);
  form.elements.name.addEventListener('input', () => grow(form.elements.name));
  form.elements.name.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    entry.focus();
  });
  if (!id) form.elements.name.focus();

  // ---------- Ingredience: každá na svém řádku s množstvím a jednotkou ----------

  function drawRows() {
    listEl.innerHTML = rows.map((row) => (row.recipeId
      ? `<li class="ing-row is-recipe" data-key="${row.key}">
        <span class="ing-name"><span class="ing-recipe-icon">${ICONS.recipe}</span>${escapeHtml(row.name)}</span>
        <button type="button" class="icon-btn" data-action="ing-remove" aria-label="Odebrat">×</button>
      </li>`
      : `<li class="ing-row" data-key="${row.key}">
        <span class="ing-name">${escapeHtml(row.name)}</span>
        <input class="input ing-qty" name="qty" inputmode="decimal" value="${escapeHtml(row.n)}" placeholder="1" aria-label="Množství">
        <button type="button" class="opt ing-unit" data-action="unit">${escapeHtml(row.unit)}</button>
        <button type="button" class="icon-btn" data-action="ing-remove" aria-label="Odebrat">×</button>
      </li>`)).join('');
  }

  // Věc se zapíše pod názvem z katalogu, "mouka 500 g" se rozdělí
  function addRow(text) {
    const parsed = parseEntry(text);
    if (!parsed.name) return;
    const name = findProduct(parsed.name)?.name ?? parsed.name;
    rows = [...rows, { key: store.newId(), name, ...splitQty(parsed.qty, name) }];
    drawRows();
  }

  // Bublinky pod polem a katalog kategorií: stejné jako v nákupu
  const refreshChips = productChips(root.querySelector('.ing-chips'), {
    input: entry,
    foodOnly: true,
    quick: (typed) => store.productSuggestions(typed ? parseEntry(typed).name : '', 6, { foodOnly: true }),
    onPick: (name) => {
      // Množství napsané za názvem se použije i s vybraným názvem
      const qty = entry.value.trim() ? parseEntry(entry.value).qty : '';
      entry.value = '';
      addRow(`${name}${qty ? ` ${qty}` : ''}`);
      refreshChips();
    },
    count: (name) => {
      const row = rows.find((r) => r.name === name && !r.recipeId);
      return row ? row.n || '1' : 0;
    },
    step: (name, direction) => {
      const row = rows.find((r) => r.name === name && !r.recipeId);
      if (!row) {
        if (direction > 0) addRow(name);
        return;
      }
      const next = (parseFloat(String(row.n || '1').replace(',', '.')) || 1) + direction;
      // Z jednoho kusu dolů = pryč z receptu
      if (next < 1) rows = rows.filter((r) => r !== row);
      else row.n = String(next).replace('.', ',');
      drawRows();
    },
  });

  const submitEntry = () => {
    const text = entry.value;
    entry.value = '';
    addRow(text);
    refreshChips();
    entry.focus();
  };
  entry.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    submitEntry();
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
      .map((h, i) => `<button type="button" class="chip hint-chip${methodText().toLowerCase().includes(h.term.toLowerCase()) ? '' : ' is-missing'}" data-hint="${i}">${escapeHtml(h.term)}</button>`)
      .join('');
  }
  // ---------- Kroky postupu ----------
  // Každý krok má své pole. Tlačítko +B přidá souběžnou část ("mezitím"),
  // krok se pak čísluje 1A a 1B. Jakmile je poslední část vyplněná, je pod ní
  // rovnou připravená další (C, D…). Prázdné části se neukládají.
  // Pořadí se mění podržením čísla a přetažením.

  // Je pod poslední částí připravené prázdné pole pro další?
  const hasSpare = (step) => step.parts.length >= 2 && Boolean(step.parts.at(-1).trim());

  function drawSteps() {
    stepsEl.innerHTML = steps.map((step, i) => {
      const split = step.parts.length > 1;
      const line = (part, p, spare = false) => `<div class="rstep-line${spare ? ' is-spare' : ''}">
          ${p ? `<span class="rstep-num is-b">${i + 1}${letter(p)}</span>` : ''}
          <textarea class="input rstep-input" data-part="${p}" rows="1" autocapitalize="sentences" aria-label="Krok ${i + 1}${split || spare ? letter(p) : ''}">${escapeHtml(part)}</textarea>
          ${!p && !split ? '<button type="button" class="icon-btn rstep-split" data-action="rstep-split" aria-label="Přidat souběžnou část">+B</button>' : ''}
          ${spare ? '<span class="icon-btn" aria-hidden="true"></span>' : `<button type="button" class="icon-btn" data-action="${p ? 'rstep-unsplit' : 'rstep-remove'}" data-part-index="${p}" aria-label="${p ? 'Odebrat část' : 'Odebrat krok'}">×</button>`}
        </div>`;
      return `<li class="rstep" data-key="${step.key}">
        <span class="rstep-num">${i + 1}${split ? 'A' : ''}</span>
        <div class="rstep-body">
          ${step.parts.map((part, p) => line(part, p)).join('')}
          ${hasSpare(step) ? line('', step.parts.length, true) : ''}
        </div>
      </li>`;
    }).join('');
    stepsEl.querySelectorAll('textarea').forEach(grow);
  }

  function focusStep(key, part = 0, atEnd = false) {
    const area = stepsEl.querySelector(`[data-key="${key}"] [data-part="${part}"]`);
    if (!area) return;
    area.focus();
    if (atEnd) area.setSelectionRange(area.value.length, area.value.length);
  }

  function addStep(afterKey = null) {
    const step = { key: store.newId(), parts: [''] };
    const at = afterKey ? steps.findIndex((s) => s.key === afterKey) + 1 : steps.length;
    steps = [...steps.slice(0, at), step, ...steps.slice(at)];
    drawSteps();
    focusStep(step.key);
  }

  stepsEl.addEventListener('input', (e) => {
    const step = steps.find((s) => s.key === e.target.closest('[data-key]')?.dataset.key);
    if (!step || e.target.dataset.part === undefined) return;
    const index = Number(e.target.dataset.part);
    const spareBefore = hasSpare(step);
    const wasSpare = index >= step.parts.length;
    step.parts[index] = e.target.value;
    grow(e.target);
    // Psaní do připraveného pole z něj udělá skutečnou část a připraví další;
    // když poslední část zase zmizí, zmizí i připravené pole
    if (wasSpare || spareBefore !== hasSpare(step)) {
      drawSteps();
      focusStep(step.key, index, true);
    }
    drawHints();
  });
  // Enter založí další krok hned za tímhle
  stepsEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.dataset.part === undefined) return;
    e.preventDefault();
    addStep(e.target.closest('[data-key]').dataset.key);
  });

  dragSort(stepsEl, {
    item: '.rstep',
    handle: '.rstep-num:not(.is-b)',
    attr: 'data-key',
    onDrop: (keys) => {
      steps = keys.map((key) => steps.find((s) => s.key === key)).filter(Boolean);
      drawSteps();
    },
  });

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
      // Označený text v kroku, do kterého se zrovna píše
      const area = document.activeElement?.dataset?.part !== undefined ? document.activeElement : null;
      const selected = area ? area.value.slice(area.selectionStart, area.selectionEnd).replace(/\s+/g, ' ').trim() : '';
      openHint(null, selected);
    }
    if (action === 'photo-remove') {
      newPhoto = null;
      drawPhoto();
      return;
    }
    if (action === 'sub-add') {
      // Vložit jiný recept (bešamel do lasagní): výběr přímo u tlačítka
      const options = await store.recipesToInclude(id, rows.map((r) => r.recipeId).filter(Boolean));
      openMenu(e.target.closest('button'), (menu, close) => {
        menu.innerHTML = options.length
          ? options.map((r) => `<button type="button" class="menu-item" data-value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</button>`).join('')
          : '<p class="hint-pop">Žádný další recept</p>';
        menu.addEventListener('click', (ev) => {
          const btn = ev.target.closest('[data-value]');
          if (!btn) return;
          close();
          const picked = options.find((r) => r.id === btn.dataset.value);
          rows = [...rows, { key: store.newId(), name: picked.name, recipeId: picked.id, n: '', unit: '' }];
          drawRows();
        });
      });
      return;
    }
    if (action === 'rstep-add') {
      holdKeyboard();
      addStep();
    }
    const stepEl = e.target.closest('.rstep');
    if (stepEl) {
      const step = steps.find((s) => s.key === stepEl.dataset.key);
      if (action === 'rstep-remove') steps = steps.filter((s) => s !== step);
      if (action === 'rstep-split') step.parts.push('');
      if (action === 'rstep-unsplit') step.parts.splice(Number(e.target.closest('[data-part-index]').dataset.partIndex), 1);
      if (action?.startsWith('rstep-')) {
        drawSteps();
        drawHints();
        if (action === 'rstep-split') focusStep(step.key, 1);
        return;
      }
    }
    const rowEl = e.target.closest('.ing-row');
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
    const ingredients = rows.map((row) => (row.recipeId ? { name: row.name, qty: '', recipeId: row.recipeId } : { name: row.name, qty: joinQty(row) }));
    const minutes = (field) => Math.max(0, parseInt(form.elements[field].value, 10) || 0) || null;
    const saved = await store.saveRecipe({ id, name, ingredients, method: methodText(), hints, prepMin: minutes('prepMin'), cookMin: minutes('cookMin') });
    if (newPhoto !== undefined) await store.setRecipePhoto(saved.id, newPhoto);
    navigate(`recepty/${saved.id}`);
  });

  drawRows();
  drawSteps();
  drawHints();
  refreshChips();
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
    <div class="chips pantry-chips"></div>
    <div class="pantry-items"></div>
    <div class="list-root"></div>`;

  const form = root.querySelector('form');
  const input = form.elements.entry;
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

    const matches = (await store.matchRecipes(have)).filter((m) => m.total);
    const ready = matches.filter((m) => !m.missing.length);
    // "Skoro" = chybí jedna nebo dvě věci a aspoň něco z receptu doma je
    const almost = matches.filter((m) => m.missing.length >= 1 && m.missing.length <= 2
      && m.missing.length < m.total);
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

  // Bublinky pod polem a katalog kategorií: stejné jako v nákupu
  const refreshChips = productChips(root.querySelector('.pantry-chips'), {
    input,
    foodOnly: true,
    quick: async (typed) => (await store.productSuggestions(typed, 8, { foodOnly: true })).filter((name) => !store.hasIngredient(have, name)).slice(0, 6),
    onPick: async (name) => {
      input.value = '';
      await add(name);
      refreshChips();
    },
    count: (name) => (store.hasIngredient(have, name) ? 1 : 0),
    step: async (name, direction) => {
      if (direction > 0) await add(name);
      else await setHave(have.filter((h) => !store.hasIngredient([h], name)));
    },
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = '';
    input.focus();
    await add(text);
    refreshChips();
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
  refreshChips();
  return store.subscribe(draw);
}
