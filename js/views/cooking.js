// Režim vaření (i na mobilu): celá obrazovka, vlevo ingredience s odškrtáváním,
// vpravo jeden krok postupu velkým písmem. Další / Zpět tlačítky, klávesami
// ← → a mezerníkem, na mobilu potažením. Souběžné části (1A, 1B) jsou vedle
// sebe, vysvětlivky fungují jako v receptu. Obrazovka nezhasíná (Screen Wake
// Lock API, když ho prohlížeč má). Esc nebo křížek zavře.
// Tisk receptu (printRecipe): tisková verze jen s názvem, fotkou, ingrediencemi
// a postupem (CSS @media print).

import { escapeHtml, ICONS, openMenu } from '../ui.js';

// view = store.recipeView(id): { recipe, subs, ingredients }
// helpers = { parseMethod, methodHtml } z recipes.js
function flatSteps(view, { parseMethod }) {
  const steps = [];
  for (const r of [...view.subs, view.recipe]) {
    if (!r.method) continue;
    parseMethod(r.method).forEach((step, i) => steps.push({ ...step, n: i + 1, owner: r, from: r === view.recipe ? (view.subs.length ? r.name : '') : r.name }));
  }
  return steps;
}

export function openCooking(view, helpers) {
  const steps = flatSteps(view, helpers);
  const { ingredients } = view;
  const checked = new Set();
  let index = 0;
  let wakeLock = null;

  const el = document.createElement('div');
  el.className = 'cook';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', `Vaření: ${view.recipe.name}`);
  document.body.append(el);

  const letter = (i) => String.fromCharCode(65 + i);

  function draw() {
    const step = steps[index];
    const ingRows = ingredients.map((ing, i) => `<li><button type="button" class="cook-ing${checked.has(i) ? ' is-done' : ''}" data-ing="${i}" aria-pressed="${checked.has(i)}">
        <span class="check">${ICONS.check}</span><span class="cook-ing-name">${escapeHtml(ing.name)}</span>${ing.qty ? `<span class="cook-ing-qty">${escapeHtml(ing.qty)}</span>` : ''}</button></li>`).join('');
    const collapsed = el.classList.contains('ings-collapsed');
    el.innerHTML = `
      <header class="cook-head">
        <span class="cook-title">${escapeHtml(view.recipe.name)}</span>
        <span class="cook-count">${steps.length ? `Krok ${index + 1} / ${steps.length}` : ''}</span>
        <button type="button" class="icon-btn cook-close" data-cook="close" aria-label="Zavřít">×</button>
      </header>
      <div class="cook-body">
        ${ingredients.length ? `<aside class="cook-ings">
          <button type="button" class="cook-ings-toggle" data-cook="ings" aria-expanded="${!collapsed}">Ingredience <span>${checked.size} / ${ingredients.length}</span></button>
          <ul class="cook-ing-list">${ingRows}</ul>
        </aside>` : ''}
        <main class="cook-step" data-recipe="${escapeHtml(step?.owner.id ?? '')}">
          ${step ? `${step.from ? `<p class="cook-from">${escapeHtml(step.from)}</p>` : ''}
            <div class="cook-parts${step.parts.length > 1 ? ' is-split' : ''}">${step.parts.map((part, p) => `<div class="cook-part">
              <span class="rstep-num">${step.n}${step.parts.length > 1 ? letter(p) : ''}</span>
              <p class="cook-text">${helpers.methodHtml(part, step.owner.hints)}</p></div>`).join('')}</div>`
            : '<p class="cook-text">Recept nemá postup.</p>'}
        </main>
      </div>
      <footer class="cook-nav">
        <button type="button" class="btn" data-cook="prev"${index === 0 ? ' disabled' : ''}>${ICONS.back} Zpět</button>
        <button type="button" class="btn btn-primary" data-cook="next">${index >= steps.length - 1 ? 'Hotovo' : 'Další'} <span class="cook-next">${ICONS.send}</span></button>
      </footer>`;
  }

  const go = (delta) => {
    const next = index + delta;
    if (next < 0) return;
    if (next >= steps.length) {
      close();
      return;
    }
    index = next;
    draw();
  };

  // Obrazovka nezhasíná, dokud se vaří (po návratu do appky se zámek obnoví)
  async function lock() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen');
    } catch { /* bez zámku se vaří taky */ }
  }
  const onVisible = () => { if (document.visibilityState === 'visible') lock(); };

  const onKey = (e) => {
    if (document.querySelector('.menu-backdrop')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    } else if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      go(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    }
  };

  function close() {
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onVisible);
    wakeLock?.release?.().catch(() => {});
    el.remove();
  }

  el.addEventListener('click', (e) => {
    const term = e.target.closest('[data-hint]');
    if (term) {
      const step = steps[index];
      const hint = (step?.owner.hints ?? [])[Number(term.dataset.hint)];
      if (hint) openMenu(term, (menu) => { menu.innerHTML = `<p class="hint-pop">${escapeHtml(hint.note)}</p>`; });
      return;
    }
    const ing = e.target.closest('[data-ing]');
    if (ing) {
      const i = Number(ing.dataset.ing);
      if (checked.has(i)) checked.delete(i);
      else checked.add(i);
      draw();
      return;
    }
    const action = e.target.closest('[data-cook]')?.dataset.cook;
    if (action === 'close') close();
    if (action === 'prev') go(-1);
    if (action === 'next') go(1);
    if (action === 'ings') {
      el.classList.toggle('ings-collapsed');
      draw();
    }
  });

  // Mobil: potažení kroku doleva / doprava
  let swipe = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.cook-step') && e.pointerType !== 'mouse') swipe = { x: e.clientX, y: e.clientY };
  });
  el.addEventListener('pointerup', (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
  });
  el.addEventListener('pointercancel', () => { swipe = null; });

  document.addEventListener('keydown', onKey, true);
  document.addEventListener('visibilitychange', onVisible);
  // Na mobilu ingredience zpočátku sbalené, ať je krok hned vidět
  if (window.matchMedia('(max-width: 599px)').matches && ingredients.length > 4) el.classList.add('ings-collapsed');
  draw();
  lock();
  return close;
}

// Tisková verze receptu: jen název, fotka, ingredience a postup
export function printRecipe(view, photo, helpers) {
  document.querySelector('.print-sheet')?.remove();
  const sheet = document.createElement('article');
  sheet.className = 'print-sheet';
  const steps = flatSteps(view, helpers);
  sheet.innerHTML = `<h1>${escapeHtml(view.recipe.name)}</h1>
    ${photo ? `<img src="${photo}" alt="">` : ''}
    ${view.ingredients.length ? `<h2>Ingredience</h2><ul>${view.ingredients.map((ing) => `<li>${escapeHtml(ing.name)}${ing.qty ? ` - ${escapeHtml(ing.qty)}` : ''}</li>`).join('')}</ul>` : ''}
    ${steps.length ? `<h2>Postup</h2><ol>${steps.map((step) => `<li>${step.from ? `<em>${escapeHtml(step.from)}:</em> ` : ''}${step.parts.map((part, p) => `${step.parts.length > 1 ? `<strong>${String.fromCharCode(65 + p)}</strong> ` : ''}${escapeHtml(part)}`).join(' ')}</li>`).join('')}</ol>` : ''}`;
  document.body.append(sheet);
  document.body.classList.add('is-printing');
  const done = () => {
    document.body.classList.remove('is-printing');
    sheet.remove();
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 50);
}
