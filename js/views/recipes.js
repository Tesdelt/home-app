// Recepty (#/recepty, otevírá se z Více). Čtyři obrazovky podle adresy:
//   #/recepty                  seznam receptů
//   #/recepty/novy             nový recept
//   #/recepty/<id>             recept: výběr ingrediencí do nákupu a postup
//   #/recepty/<id>/upravit     úprava receptu
//   #/recepty/zasoby           co máme doma -> co se z toho dá uvařit
//   #/recepty/<id>/zasoby      recept otevřený ze zásob (předvybrané jen to, co chybí)

import * as store from '../store.js';
import { parseEntry } from '../categories.js';
import { escapeHtml, ICONS, toast, undoToast, rowGestures } from '../ui.js';
import { navigate } from '../router.js';

export const title = 'Recepty';
export const tab = 'vice';

const NEW = 'novy';
const PANTRY = 'zasoby';

const ingredientLine = (ing) => `${ing.name}${ing.qty ? ` ${ing.qty}` : ''}`;

// Text z pole (věc na řádek, nebo oddělené čárkou) -> seznam
const lines = (text) => String(text).split(/[\n,;]+/).map((line) => line.trim()).filter(Boolean);

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
      ${recipe.method ? `<p class="section-label">Postup</p><div class="note-view is-open recipe-method">${escapeHtml(recipe.method)}</div>` : ''}`;
  }

  root.addEventListener('click', async (e) => {
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

async function renderEdit(el, id) {
  const { root, back } = page(el, id ? `recepty/${id}` : 'recepty');
  const recipe = id ? await store.getRecipe(id) : { name: '', ingredients: [], method: '' };
  if (!recipe) {
    navigate('recepty');
    return undefined;
  }

  root.innerHTML = `
    <form class="edit-form" autocomplete="off">
      <div class="detail-head">${back}
        <textarea class="input detail-title" name="name" rows="1" aria-label="Název" placeholder="Nový recept"></textarea>
      </div>
      <label class="field"><span>Ingredience, každá na řádek</span>
        <textarea class="input" name="ingredients" rows="8" autocapitalize="sentences"></textarea></label>
      <label class="field"><span>Postup</span>
        <textarea class="input" name="method" rows="8" autocapitalize="sentences"></textarea></label>
      <div class="btn-row">
        ${id ? '<button type="button" class="btn btn-danger" data-action="delete">Smazat</button>' : ''}
        <button type="submit" class="btn btn-primary">${id ? 'Uložit' : 'Přidat'}</button>
      </div>
    </form>`;

  const form = root.querySelector('form');
  const grow = (area) => { area.style.height = 'auto'; area.style.height = `${area.scrollHeight + 2}px`; };
  form.elements.name.value = recipe.name;
  form.elements.ingredients.value = (recipe.ingredients ?? []).map(ingredientLine).join('\n');
  form.elements.method.value = recipe.method ?? '';
  [...form.querySelectorAll('textarea')].forEach((area) => {
    grow(area);
    area.addEventListener('input', () => grow(area));
  });
  form.elements.name.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    form.elements.ingredients.focus();
  });
  if (!id) form.elements.name.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.elements.name.value.replace(/\s+/g, ' ').trim();
    if (!name) {
      form.elements.name.focus();
      return;
    }
    // "mouka 500 g", "2 vejce" -> název a množství, stejně jako v nákupu
    const ingredients = form.elements.ingredients.value.split('\n').map((line) => line.trim()).filter(Boolean).map(parseEntry);
    const saved = await store.saveRecipe({ id, name, ingredients, method: form.elements.method.value });
    navigate(`recepty/${saved.id}`);
  });

  form.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
    const removed = await store.removeRecipes([id]);
    if (removed.length) undoToast(`${removed[0].name}: smazáno`, () => store.restoreRecipes(removed));
    navigate('recepty');
  });

  return undefined;
}

// ---------- Co máme doma -> co uvařit ----------

async function renderPantry(el) {
  const { root, back } = page(el, 'recepty');
  root.innerHTML = `
    <div class="detail-head">${back}<span class="detail-name">Co uvařit</span></div>
    <label class="field"><span>Co máme doma</span>
      <textarea class="input" name="pantry" rows="3" autocapitalize="none"></textarea></label>
    <div class="list-root"></div>`;

  const area = root.querySelector('textarea');
  const listRoot = root.querySelector('.list-root');
  const grow = () => { area.style.height = 'auto'; area.style.height = `${area.scrollHeight + 2}px`; };
  area.value = (await store.getPantry()).join(', ');
  grow();

  async function draw() {
    const have = lines(area.value);
    const total = (await store.listRecipes()).length;
    if (!total) {
      listRoot.innerHTML = `<div class="empty"><div class="empty-icon">${ICONS.recipe}</div><p class="empty-title">Zatím žádné recepty</p></div>`;
      return;
    }
    if (!have.length) {
      listRoot.innerHTML = '';
      return;
    }
    const matches = (await store.matchRecipes(have)).filter((m) => (m.recipe.ingredients ?? []).length);
    const row = ({ recipe, missing }) => {
      const count = recipe.ingredients.length;
      return `<li class="item"><a class="item-main" href="#/recepty/${escapeHtml(recipe.id)}/${PANTRY}">
        <span class="item-text"><span class="item-name">${escapeHtml(recipe.name)}</span>${missing.length ? `<span class="item-sub">chybí: ${escapeHtml(missing.map((m) => m.name).join(', '))}</span>` : ''}</span>
        <span class="item-amount${missing.length ? ' is-muted' : ''}">${count - missing.length}/${count}</span>
      </a></li>`;
    };
    const ready = matches.filter((m) => !m.missing.length);
    // Recepty, ze kterých doma není vůbec nic, nemá smysl nabízet
    const almost = matches.filter((m) => m.missing.length && m.missing.length < m.recipe.ingredients.length);
    listRoot.innerHTML = `
      ${ready.length ? `<p class="section-label">Máme všechno (${ready.length})</p><ul class="item-list group">${ready.map(row).join('')}</ul>` : ''}
      ${almost.length ? `<p class="section-label">Něco chybí (${almost.length})</p><ul class="item-list group">${almost.map(row).join('')}</ul>` : ''}
      ${!ready.length && !almost.length ? '<div class="empty"><p class="empty-title">Z toho nic neuvaříme</p></div>' : ''}`;
  }

  let timer = null;
  area.addEventListener('input', () => {
    grow();
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await store.setPantry(lines(area.value));
      draw();
    }, 250);
  });

  await draw();
  const unsubscribe = store.subscribe(draw);
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
