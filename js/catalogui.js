// Řádek bublinek pod polem pro přidání věci a katalog kategorie.
// Společné pro Nákup, úpravu receptu i "Co uvařit", aby se všude chovaly
// a vypadaly stejně. Kdo chce něco změnit, mění to tady, ne v jednom pohledu.
//
// Řádek: na začátku rychlé návrhy (při psaní našeptávač, jinak nejčastější),
// za nimi kategorie v pořadí vybraného obchodu. Ťuknutí na kategorii otevře
// katalog: produkty té kategorie od nejčastěji kupovaných, u každého - a +.
//
// Tohle není pohled, ale pomocník pohledů: na data sahá jen přes store.js.

import * as store from './store.js';
import { categoryName, FOOD } from './categories.js';
import { escapeHtml, openSheet } from './ui.js';

// Řádky katalogu jedné kategorie (stejné v panelu i v trvalém katalogu na počítači)
async function catalogRows(category, count) {
  const products = await store.catalogProducts(category);
  const counts = await Promise.all(products.map((p) => count(p.name)));
  return `<ul class="item-list group catalog">${products.map((p, i) => `<li class="catalog-row${counts[i] ? ' is-on' : ''}" data-name="${escapeHtml(p.name)}">
      <span class="item-text"><span class="item-name">${escapeHtml(p.name)}</span></span>
      <span class="stepper">
        <button type="button" data-step="-1" aria-label="Ubrat"${counts[i] ? '' : ' disabled'}>−</button>
        <span class="stepper-value">${escapeHtml(counts[i] || '0')}</span>
        <button type="button" data-step="1" aria-label="Přidat">+</button>
      </span>
    </li>`).join('')}</ul>`;
}

// Trvale otevřený katalog (Nákup na počítači): nahoře kategorie, pod nimi
// produkty vybrané kategorie s - a +. Vrací refresh(), který ho překreslí.
let panelCategory = null;
export function catalogPanel(el, { foodOnly = false, count, step, onChange }) {
  el.innerHTML = '<div class="chips catalog-cats"></div><div class="catalog-body"></div>';
  const catsEl = el.querySelector('.catalog-cats');
  const bodyEl = el.querySelector('.catalog-body');
  let token = 0;

  async function refresh() {
    const mine = ++token;
    const shop = await store.currentShop();
    const cats = shop.order.filter((id) => !foodOnly || FOOD.includes(id));
    if (!cats.includes(panelCategory)) panelCategory = cats[0];
    const rows = await catalogRows(panelCategory, count);
    if (mine !== token) return;
    catsEl.innerHTML = cats
      .map((id) => `<button type="button" class="chip cat-chip" data-cat="${id}" aria-pressed="${id === panelCategory}">${escapeHtml(categoryName(id))}</button>`)
      .join('');
    bodyEl.innerHTML = rows;
  }

  el.addEventListener('click', async (e) => {
    const cat = e.target.closest('[data-cat]');
    if (cat) {
      panelCategory = cat.dataset.cat;
      refresh();
      return;
    }
    const btn = e.target.closest('[data-step]');
    if (!btn) return;
    await step(btn.closest('.catalog-row').dataset.name, Number(btn.dataset.step));
    await refresh();
    onChange?.();
  });

  refresh();
  return refresh;
}

// chipsEl   prvek .chips, do kterého se řádek kreslí
// input     pole, podle kterého se našeptává
// foodOnly  jen kategorie jídla (recepty)
// quick     async (napsaný text) => [názvy] rychlých návrhů
// onPick    (název) => přidání věci ťuknutím na návrh
// count     async (název) => kolik té věci už je (0 = není), pro katalog
// step      async (název, +1 | -1) => přidat / ubrat v katalogu
// Vrací refresh(), který řádek překreslí.
export function productChips(chipsEl, { input, foodOnly = false, quick, onPick, count, step }) {
  let token = 0;

  async function refresh() {
    const mine = ++token;
    const typed = input.value.trim();
    const [names, shop] = await Promise.all([quick(typed), store.currentShop()]);
    if (mine !== token) return;
    const picks = names
      .map((name) => `<button type="button" class="chip" data-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`)
      .join('');
    const cats = shop.order
      .filter((id) => id !== 'ostatni' && (!foodOnly || FOOD.includes(id)))
      .map((id) => `<button type="button" class="chip cat-chip" data-cat="${id}">${escapeHtml(categoryName(id))}</button>`)
      .join('');
    chipsEl.innerHTML = picks + cats;
    if (typed) chipsEl.scrollLeft = 0;
  }

  function openCatalog(category) {
    openSheet(categoryName(category), (body, close) => {
      const draw = async () => {
        body.innerHTML = `${await catalogRows(category, count)}
        <div class="sheet-done"><button type="button" class="btn btn-primary btn-block" data-action="done">Hotovo</button></div>`;
      };

      body.addEventListener('click', async (e) => {
        if (e.target.closest('[data-action="done"]')) {
          close();
          return;
        }
        const btn = e.target.closest('[data-step]');
        if (!btn) return;
        await step(btn.closest('.catalog-row').dataset.name, Number(btn.dataset.step));
        await draw();
        refresh();
      });

      draw();
    });
  }

  input.addEventListener('input', refresh);

  // Bublinka nesmí vzít fokus poli, jinak by se na iPhonu zavřela klávesnice
  chipsEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.chip')) e.preventDefault();
  });
  chipsEl.addEventListener('click', (e) => {
    const cat = e.target.closest('[data-cat]');
    if (cat) {
      openCatalog(cat.dataset.cat);
      return;
    }
    const chip = e.target.closest('[data-name]');
    if (chip) onPick(chip.dataset.name);
  });

  return refresh;
}
