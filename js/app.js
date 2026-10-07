import { addRoute, startRouter } from './router.js';
import { openDB, requestPersistentStorage } from './db.js';
import { escapeHtml } from './ui.js';
import * as auth from './auth.js';
import * as store from './store.js';
import * as login from './views/login.js';
import * as home from './views/home.js';
import * as shopping from './views/shopping.js';
import * as tasks from './views/tasks.js';
import * as money from './views/money.js';
import * as more from './views/more.js';
import * as recipes from './views/recipes.js';

// Pořadí = pořadí v liště. První trasa je výchozí.
addRoute('domu', home);
addRoute('nakup', shopping);
addRoute('ukoly', tasks);
addRoute('penize', money);
addRoute('vice', more);
// Mimo spodní lištu, otevírá se z Více
addRoute('recepty', recipes);

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('screen-title');
const subEl = document.getElementById('screen-sub');
const extraEl = document.getElementById('topbar-extra');
const tabs = document.querySelectorAll('.tab');
const tabbar = document.querySelector('.tabbar');
const appEl = document.getElementById('app');

init();

async function init() {
  try {
    await openDB();
  } catch (err) {
    console.error('Databáze se nepodařila otevřít', err);
    viewEl.innerHTML = `<section class="card"><h2 class="card-title">Chyba úložiště</h2>
      <p class="muted">Databázi appky se nepodařilo otevřít. ${escapeHtml(err?.message ?? '')}</p></section>`;
    return;
  }
  requestPersistentStorage();
  registerServiceWorker();

  // Pohled může vrátit funkci na úklid (odhlášení odběru změn apod.)
  let cleanup = null;
  let rerender = null;
  let shown = null;

  // Dovnitř se dostane jen přihlášený člen domácnosti. Do té doby je vidět
  // jen přihlašovací obrazovka a pohledy s daty se vůbec nevykreslí.
  auth.onChange((state) => {
    if (state.status === shown && state.status !== 'denied') return;
    shown = state.status;
    const inside = state.status === 'ready';
    tabbar.hidden = !inside;
    if (inside) {
      if (rerender) rerender();
      else rerender = startRouter(route);
      return;
    }
    if (typeof cleanup === 'function') cleanup();
    cleanup = null;
    document.querySelectorAll('.sheet-backdrop, .menu-backdrop').forEach((sheet) => sheet.remove());
    appEl.classList.remove('no-topbar');
    titleEl.textContent = login.TITLES[state.status] ?? 'Domácnost';
    document.title = 'Domácnost';
    subEl.hidden = true;
    extraEl.replaceChildren();
    viewEl.replaceChildren();
    login.render(viewEl, state);
  });

  async function route(name, view, params) {
    if (auth.getState().status !== 'ready') return;
    if (typeof cleanup === 'function') cleanup();
    cleanup = null;

    titleEl.textContent = view.title;
    // Pohled si horní lištu může schovat (stránka úkolu), každý další začíná s ní
    appEl.classList.remove('no-topbar');
    subEl.hidden = true;
    subEl.textContent = '';
    extraEl.replaceChildren();
    viewEl.replaceChildren();
    viewEl.scrollTop = 0;
    document.title = `${view.title} · Domácnost`;

    tabs.forEach((tabEl) => {
      const active = tabEl.dataset.route === (view.tab ?? name);
      tabEl.classList.toggle('is-active', active);
      if (active) tabEl.setAttribute('aria-current', 'page');
      else tabEl.removeAttribute('aria-current');
    });

    try {
      cleanup = await view.render(viewEl, { params, extraEl, subEl });
    } catch (err) {
      console.error(err);
      viewEl.innerHTML = `<section class="card"><h2 class="card-title">Něco se pokazilo</h2>
        <p class="muted">${escapeHtml(err?.message ?? String(err))}</p></section>`;
    }
  }

  // Tečka u záložky Úkoly, dokud je někde nepřečtený komentář
  const tasksTab = document.querySelector('.tab[data-route="ukoly"]');
  const updateDots = async () => {
    if (auth.getState().status !== 'ready') return;
    tasksTab.classList.toggle('has-dot', Object.keys(await store.unreadComments()).length > 0);
  };
  store.subscribe(updateDots);
  auth.onChange(updateDots);

  tabbar.hidden = true;
  login.render(viewEl, auth.getState());
  await auth.start();
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // Když řízení převezme nová verze, nabídneme načtení. Jinak se projeví
  // sama při dalším spuštění appky.
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) document.getElementById('update-bar').hidden = false;
  });
  document.getElementById('update-reload').addEventListener('click', () => location.reload());

  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    // Appka na ploše iPhonu se často jen probouzí z pozadí, bez nového
    // načtení stránky, proto kontrolujeme novou verzi při každém návratu.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  } catch (err) {
    console.error('Registrace service workeru selhala', err);
  }
}
