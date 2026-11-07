// Recepty > Jídelníček (#/recepty/jidelnicek): týden Po-Ne, každý den Oběd
// (sbalený, dokud v něm nic není) a Večeře. Nahoře šipky na předchozí / další
// týden, Tento týden, Navrhnout (doplní prázdné večeře) a Do nákupu.
// Mobil: dny pod sebou. Ťuknutí na prázdný řádek nabídne recept (hledání, od
// nejdéle nevařených) nebo vlastní zápis; vyplněný řádek: ťuknutí otevře recept,
// podržení nabídne Změnit / Vařit / Smazat, podržení a tažení přesune na jiný den,
// potažení doleva smaže se Zpět.
// Počítač: 7 sloupců vedle sebe, vpravo úzký panel s recepty, které jdou myší
// přetáhnout na den a slot (jídla mezi dny taky).
// Na data sahá jen přes store.js, recept do režimu vaření otevře recipes.js.

import * as store from '../store.js';
import { escapeHtml, ICONS, toast, undoToast, openMenu, openSheet, holdKeyboard, isDesktop, hasMouse } from '../ui.js';
import { today, addDays } from '../dates.js';
import { navigate } from '../router.js';
import { addParsed } from './shopping.js';
import { cookRecipe } from './recipes.js';

const DAY_NAMES = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
const SLOT_NAMES = { obed: 'Oběd', vecere: 'Večeře' };
const HOLD_MS = 450;

// Pondělí týdne, ve kterém je den
function mondayOf(day) {
  const d = new Date(`${day}T12:00:00`);
  return addDays(day, -((d.getDay() + 6) % 7));
}
const shortDate = (day) => {
  const d = new Date(`${day}T12:00:00`);
  return `${d.getDate()}. ${d.getMonth() + 1}.`;
};
const daysAgo = (day) => Math.round((new Date(`${today()}T12:00:00`) - new Date(`${day}T12:00:00`)) / 86400000);
// „před 12 dny“, „dnes“, „ještě ne“ (jak dávno byl recept v jídelníčku)
export function restLabel(day) {
  if (!day) return 'ještě ne';
  const n = daysAgo(day);
  if (n <= 0) return 'dnes';
  if (n === 1) return 'včera';
  return `před ${n} dny`;
}

// Zobrazený týden vydrží, dokud je appka otevřená
let weekStart = null;

export async function renderMeals(el) {
  document.getElementById('screen-title').textContent = 'Jídelníček';
  document.title = 'Jídelníček · Domácnost';
  if (!weekStart) weekStart = mondayOf(today());
  const desktop = isDesktop();

  const root = document.createElement('div');
  root.className = 'meals';
  root.innerHTML = `
    <div class="toolbar recipe-toolbar">
      <div class="segmented" role="tablist">
        <button type="button" role="tab" data-go="recepty/recepty" aria-pressed="false">Recepty</button>
        <button type="button" role="tab" aria-pressed="true">Jídelníček</button>
        <button type="button" role="tab" data-go="recepty/skills" aria-pressed="false">Skills</button>
      </div>
    </div>
    <div class="toolbar meal-bar">
      <span class="meal-week-nav">
        <button type="button" class="opt opt-icon" data-action="prev" aria-label="Předchozí týden">${ICONS.back}</button>
        <span class="meal-week-label"></span>
        <button type="button" class="opt opt-icon meal-next" data-action="next" aria-label="Další týden">${ICONS.back}</button>
      </span>
      <button type="button" class="opt" data-action="this-week">Tento týden</button>
      <span class="meal-actions">
        <button type="button" class="opt" data-action="suggest">Navrhnout</button>
        <button type="button" class="opt" data-action="shop">${ICONS.cart}<span class="opt-text">Do nákupu</span></button>
      </span>
    </div>
    <div class="meal-layout">
      <div class="meal-days"></div>
      ${desktop ? `<aside class="meal-panel"><input class="input meal-search" type="search" placeholder="Hledat recept" aria-label="Hledat recept" autocomplete="off"><ul class="meal-picks"></ul></aside>` : ''}
    </div>`;
  el.append(root);
  const daysEl = root.querySelector('.meal-days');
  const labelEl = root.querySelector('.meal-week-label');
  const picksEl = root.querySelector('.meal-picks');
  const searchEl = root.querySelector('.meal-search');

  let meals = [];
  let recipes = new Map();
  let last = new Map();
  const weekEnd = () => addDays(weekStart, 6);

  function slotHtml(day, slot) {
    const meal = meals.find((m) => m.day === day && m.slot === slot);
    if (!meal) {
      // Prázdný oběd je jen sbalený řádek „+ Oběd“
      return `<li class="meal-slot is-empty${slot === 'obed' ? ' is-folded' : ''}" data-day="${day}" data-slot="${slot}">
          <button type="button" class="meal-add">${slot === 'obed' ? '+ ' : ''}${SLOT_NAMES[slot]}</button></li>`;
    }
    const recipe = meal.recipeId ? recipes.get(meal.recipeId) : null;
    const name = recipe ? recipe.name : (meal.text || (meal.recipeId ? 'Smazaný recept' : ''));
    return `<li class="item meal-slot is-filled${recipe ? '' : ' is-text'}" data-day="${day}" data-slot="${slot}" data-id="${escapeHtml(meal.id)}">
        <div class="item-main meal-main" role="button" tabindex="0">
          <span class="meal-slot-label">${SLOT_NAMES[slot]}</span>
          <span class="item-name">${escapeHtml(name)}</span>
        </div>
        ${hasMouse() ? `<button type="button" class="meal-more" aria-label="Další možnosti">${ICONS.more}</button>` : ''}
      </li>`;
  }

  async function draw() {
    const [list, all, rest] = await Promise.all([store.listMeals(weekStart, weekEnd()), store.listRecipes(), store.lastPlanned()]);
    meals = list;
    recipes = new Map(all.map((r) => [r.id, r]));
    last = rest;
    const day0 = today();
    labelEl.textContent = `${shortDate(weekStart)} - ${shortDate(weekEnd())}`;
    root.querySelector('[data-action="this-week"]').setAttribute('aria-pressed', String(weekStart === mondayOf(day0)));
    daysEl.innerHTML = DAY_NAMES.map((name, i) => {
      const day = addDays(weekStart, i);
      return `<section class="meal-day${day === day0 ? ' is-today' : ''}${day < day0 ? ' is-past' : ''}" data-day="${day}">
          <p class="meal-day-head"><span class="meal-day-name">${day === day0 ? 'Dnes' : name}</span><span class="meal-day-date">${day === day0 ? `${name} ` : ''}${shortDate(day)}</span></p>
          <ul class="item-list group meal-list">${slotHtml(day, 'obed')}${slotHtml(day, 'vecere')}</ul>
        </section>`;
    }).join('');
    drawPicks();
  }

  // Panel s recepty (počítač): od nejdéle nevařených, hledání podle názvu
  function drawPicks() {
    if (!picksEl) return;
    const q = searchEl.value.trim().toLowerCase();
    const list = [...recipes.values()]
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => (last.get(a.id) ?? '').localeCompare(last.get(b.id) ?? '') || a.name.localeCompare(b.name, 'cs'));
    picksEl.innerHTML = list.length
      ? list.map((r) => `<li class="meal-pick" data-recipe="${escapeHtml(r.id)}" title="Přetáhnout na den"><span class="meal-pick-name">${escapeHtml(r.name)}</span><span class="meal-pick-rest">${escapeHtml(restLabel(last.get(r.id)))}</span></li>`).join('')
      : '<li class="meal-pick-none">Nic</li>';
  }

  // Výběr receptu do slotu: hledání, recepty od nejdéle nevařených, Napsat vlastní
  async function openPicker(anchor, day, slot) {
    holdKeyboard();
    const sorted = await store.recipesByRest();
    openMenu(anchor, (menu, close) => {
      const list = (q) => sorted
        .filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()))
        .map((r) => `<button type="button" class="menu-item meal-menu-recipe" data-recipe="${escapeHtml(r.id)}"><span class="menu-label">${escapeHtml(r.name)}</span><span class="meal-pick-rest">${escapeHtml(restLabel(last.get(r.id)))}</span></button>`)
        .join('');
      menu.classList.add('meal-menu');
      menu.innerHTML = `<form class="menu-new"><input class="input" name="q" type="search" placeholder="Hledat recept" aria-label="Hledat recept" autocomplete="off" enterkeyhint="done"></form>
        <div class="meal-menu-list">${list('')}</div>
        <button type="button" class="menu-item menu-quiet" data-action="own">Napsat vlastní</button>`;
      const input = menu.querySelector('input');
      const listEl = menu.querySelector('.meal-menu-list');
      let own = false;
      input.addEventListener('input', () => { if (!own) listEl.innerHTML = list(input.value.trim()); });
      menu.querySelector('form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const value = input.value.trim();
        if (own) {
          if (!value) return;
          close();
          await place(day, slot, { text: value });
          return;
        }
        const first = listEl.querySelector('[data-recipe]');
        if (!first) return;
        close();
        await place(day, slot, { recipeId: first.dataset.recipe });
      });
      menu.addEventListener('click', async (ev) => {
        const pick = ev.target.closest('[data-recipe]');
        if (pick) {
          close();
          await place(day, slot, { recipeId: pick.dataset.recipe });
          return;
        }
        if (ev.target.closest('[data-action="own"]')) {
          // Vlastní zápis („venku“, „zbytky“): to samé pole, Enter uloží
          own = true;
          input.value = '';
          input.placeholder = 'Třeba venku nebo zbytky';
          input.setAttribute('aria-label', 'Vlastní zápis');
          listEl.innerHTML = '';
          ev.target.closest('[data-action="own"]').remove();
          input.focus();
        }
      });
      requestAnimationFrame(() => input.focus());
    });
  }

  async function place(day, slot, what) {
    const { meal, replaced } = await store.setMeal({ day, slot, ...what });
    if (replaced.length) undoToast('Jídlo nahrazeno', () => store.undoMeals({ added: [meal], removed: replaced }));
  }

  async function removeMeal(id) {
    const removed = await store.removeMeals([id]);
    if (removed.length) undoToast('Jídlo smazáno', () => store.undoMeals({ removed }));
  }

  function openActions(anchor, id) {
    const meal = meals.find((m) => m.id === id);
    if (!meal) return;
    const acts = [
      { label: 'Změnit', run: () => openPicker(anchor, meal.day, meal.slot) },
      ...(meal.recipeId && recipes.has(meal.recipeId) ? [{ label: 'Vařit', run: () => cookRecipe(meal.recipeId) }] : []),
      { label: 'Smazat', danger: true, run: () => removeMeal(id) },
    ];
    openMenu(anchor, (menu, close) => {
      menu.innerHTML = acts.map((a, i) => `<button type="button" class="menu-item${a.danger ? ' is-danger' : ''}" data-i="${i}">${escapeHtml(a.label)}</button>`).join('');
      menu.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-i]');
        if (!btn) return;
        close();
        acts[Number(btn.dataset.i)].run();
      });
    });
  }

  // ---------- Gesta: podržet a táhnout, potáhnout doleva, myší táhnout ----------
  let g = null;
  let ignoreClickUntil = 0;
  const slotAt = (x, y) => document.elementFromPoint(x, y)?.closest('.meal-slot');

  function startDrag(e) {
    g.mode = 'drag';
    clearTimeout(g.timer);
    const rect = g.el.getBoundingClientRect();
    const ghost = g.el.cloneNode(true);
    ghost.classList.add('meal-ghost');
    ghost.classList.remove('is-held');
    Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px` });
    document.body.append(ghost);
    g.ghost = ghost;
    g.offX = e.clientX - rect.left;
    g.offY = e.clientY - rect.top;
    g.el.classList.add('is-lifted');
    root.classList.add('is-dragging');
  }

  function clearTarget() {
    root.querySelectorAll('.meal-slot.is-target').forEach((n) => n.classList.remove('is-target'));
  }

  function endGesture() {
    if (!g) return;
    clearTimeout(g.timer);
    g.el.classList.remove('is-held', 'is-lifted');
    g.main?.classList.remove('is-dragging');
    if (g.main) g.main.style.transform = '';
    g.ghost?.remove();
    clearTarget();
    root.classList.remove('is-dragging');
    g = null;
  }

  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const pick = e.target.closest('.meal-pick');
    const filled = e.target.closest('.meal-slot.is-filled');
    if (!pick && !(filled && e.target.closest('.meal-main'))) return;
    const el = pick ?? filled;
    g = {
      el, kind: pick ? 'pick' : 'meal', id: pick ? pick.dataset.recipe : filled.dataset.id,
      main: filled?.querySelector('.meal-main'), x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse', mode: null, dx: 0,
    };
    if (g.touch) {
      g.timer = setTimeout(() => {
        if (!g || g.mode) return;
        g.mode = 'held';
        g.el.classList.add('is-held');
        navigator.vibrate?.(10);
      }, HOLD_MS);
    }
  });

  window.addEventListener('pointermove', onMove);
  function onMove(e) {
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const dist = Math.hypot(dx, dy);
    if (!g.mode) {
      if (!g.touch && dist > 5) startDrag(e);
      else if (g.touch && g.kind === 'meal' && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        g.mode = 'swipe';
        clearTimeout(g.timer);
        g.main.classList.add('is-dragging');
      } else if (g.touch && dist > 10) {
        endGesture(); // posouvání stránky
        return;
      }
    } else if (g.mode === 'held' && dist > 8) {
      startDrag(e);
    }
    if (g?.mode === 'swipe') {
      g.dx = Math.min(0, dx);
      g.main.style.transform = `translateX(${g.dx}px)`;
    }
    if (g?.mode === 'drag') {
      g.ghost.style.left = `${e.clientX - g.offX}px`;
      g.ghost.style.top = `${e.clientY - g.offY}px`;
      const target = slotAt(e.clientX, e.clientY);
      clearTarget();
      if (target && target !== g.el) target.classList.add('is-target');
    }
  }

  // Na dotyku drženou položku netahá stránka
  const blockScroll = (e) => { if (g && (g.mode === 'held' || g.mode === 'drag' || g.mode === 'swipe')) e.preventDefault(); };
  document.addEventListener('touchmove', blockScroll, { passive: false });

  window.addEventListener('pointerup', onUp);
  async function onUp(e) {
    if (!g) return;
    const state = g;
    if (state.mode === 'drag') {
      ignoreClickUntil = Date.now() + 400;
      const target = slotAt(e.clientX, e.clientY);
      endGesture();
      if (!target) return;
      const { day, slot } = target.dataset;
      if (state.kind === 'pick') await place(day, slot, { recipeId: state.id });
      else await store.moveMeal(state.id, day, slot);
      return;
    }
    if (state.mode === 'held') {
      // Podržení bez tažení: nabídka akcí jako jinde
      ignoreClickUntil = Date.now() + 600;
      endGesture();
      openActions(state.el, state.id);
      return;
    }
    if (state.mode === 'swipe') {
      ignoreClickUntil = Date.now() + 400;
      const threshold = Math.min(110, state.main.offsetWidth * 0.35);
      if (state.dx < -threshold) {
        state.main.style.transform = 'translateX(-100%)';
        g = null;
        setTimeout(() => removeMeal(state.id), 180);
        return;
      }
    }
    endGesture();
  }
  window.addEventListener('pointercancel', endGesture);

  root.addEventListener('contextmenu', (e) => {
    const filled = e.target.closest('.meal-slot.is-filled');
    if (!filled) return;
    e.preventDefault();
    if (hasMouse()) openActions(filled, filled.dataset.id);
  });

  root.addEventListener('click', async (e) => {
    if (Date.now() < ignoreClickUntil) return;
    const go = e.target.closest('[data-go]');
    if (go) {
      navigate(go.dataset.go);
      return;
    }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'prev' || action === 'next' || action === 'this-week') {
      weekStart = action === 'this-week' ? mondayOf(today()) : addDays(weekStart, action === 'prev' ? -7 : 7);
      draw();
      return;
    }
    if (action === 'suggest') {
      const added = await store.suggestDinners(weekStart, weekEnd());
      if (added.length) undoToast(added.length === 1 ? 'Navržena 1 večeře' : `Navrženo večeří: ${added.length}`, () => store.undoMeals({ added }));
      else toast(recipes.size ? 'Večeře do konce týdne už jsou' : 'Zatím žádné recepty');
      return;
    }
    if (action === 'shop') {
      openShopping();
      return;
    }
    const more = e.target.closest('.meal-more');
    if (more) {
      openActions(more, more.closest('.meal-slot').dataset.id);
      return;
    }
    const add = e.target.closest('.meal-add');
    if (add) {
      const slotEl = add.closest('.meal-slot');
      openPicker(add, slotEl.dataset.day, slotEl.dataset.slot);
      return;
    }
    const main = e.target.closest('.meal-main');
    if (main) {
      const slotEl = main.closest('.meal-slot');
      const meal = meals.find((m) => m.id === slotEl.dataset.id);
      if (meal?.recipeId && recipes.has(meal.recipeId)) navigate(`recepty/${meal.recipeId}`);
      else if (meal) openPicker(main, meal.day, meal.slot);
    }
  });
  root.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('meal-main')) {
      e.preventDefault();
      e.target.click();
    }
  });
  searchEl?.addEventListener('input', drawPicks);

  // Do nákupu: ingredience receptů od dneška do konce týdne, bez toho, co je
  // doma (Co uvařit) a co už je na seznamu; vše zaškrtnuté, Přidat přidá vybrané
  async function openShopping() {
    const list = await store.mealShopping(weekStart, weekEnd());
    if (!list.length) {
      toast('Do konce týdne není co nakoupit');
      return;
    }
    const picked = new Set(list.map((_, i) => i));
    openSheet('Do nákupu', (body, close) => {
      const drawSheet = () => {
        body.innerHTML = `<ul class="item-list group meal-shop">${list.map((ing, i) => `<li class="catalog-row pick-row${picked.has(i) ? ' is-on' : ''}">
            <button type="button" class="shop-pick" data-index="${i}" aria-pressed="${picked.has(i)}">
              <span class="check">${ICONS.check}</span>
              <span class="item-text"><span class="item-name">${escapeHtml(ing.name)}</span>${ing.qty ? `<span class="item-qty">${escapeHtml(ing.qty)}</span>` : ''}</span>
            </button></li>`).join('')}</ul>
          <button type="button" class="btn btn-primary btn-block" data-action="add-shop"${picked.size ? '' : ' disabled'}>Přidat${picked.size ? ` (${picked.size})` : ''}</button>`;
      };
      drawSheet();
      body.addEventListener('click', async (ev) => {
        const row = ev.target.closest('[data-index]');
        if (row) {
          const i = Number(row.dataset.index);
          if (picked.has(i)) picked.delete(i);
          else picked.add(i);
          drawSheet();
          return;
        }
        if (!ev.target.closest('[data-action="add-shop"]')) return;
        close();
        const chosen = list.filter((_, i) => picked.has(i));
        for (const ing of chosen) await addParsed(ing.name, ing.qty);
        toast(chosen.length === 1 ? '1 položka v nákupu' : `Položek v nákupu: ${chosen.length}`);
      });
    });
  }

  await draw();
  // Mobil: týden začíná pondělím, k dnešku se rovnou sjede
  if (!desktop) daysEl.querySelector('.meal-day.is-today')?.scrollIntoView({ block: 'start' });
  const unsubscribe = store.subscribe(draw);
  return () => {
    unsubscribe();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', endGesture);
    document.removeEventListener('touchmove', blockScroll);
    endGesture();
  };
}
