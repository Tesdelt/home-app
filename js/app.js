import { addRoute, startRouter } from './router.js';
import { openDB, requestPersistentStorage } from './db.js';
import { escapeHtml, ICONS, isDesktop, onDesktopChange, blink } from './ui.js';
import * as auth from './auth.js';
import * as store from './store.js';
import * as login from './views/login.js';
import * as home from './views/home.js';
import * as shopping from './views/shopping.js';
import * as tasks from './views/tasks.js';
import * as money from './views/money.js';
import * as more from './views/more.js';
import * as recipes from './views/recipes.js';
import { wishlist, bucketlist } from './views/wishes.js';
import * as docs from './views/docs.js';
import * as notes from './views/notes.js';
import { initSidenav, drawSidenav, markSidenav, updateBadges } from './sidenav.js';
import * as demo from './views/demo.js';

// Pořadí = pořadí v liště. První trasa je výchozí.
addRoute('domu', home);
addRoute('nakup', shopping);
addRoute('ukoly', tasks);
addRoute('penize', money);
addRoute('vice', more);
// Mimo spodní lištu, otevírají se z dlaždic na Domů
addRoute('recepty', recipes);
addRoute('wishlist', wishlist);
addRoute('bucketlist', bucketlist);
addRoute('administrativa', docs);
addRoute('info', notes);
// Skrytá stránka se všemi komponentami (design systém), v menu není
addRoute('ukazka', demo);

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('screen-title');
let currentModule = null;

async function updateDots() {
  if (auth.getState().status !== 'ready') return;
  const [unread, due, news] = await Promise.all([store.unreadComments(), store.duePayments(7), store.moduleNews()]);
  const dots = new Set(Object.keys(news));
  if (Object.keys(unread).length) dots.add('ukoly');
  document.querySelectorAll('.tab[data-route]').forEach((tab) => tab.classList.toggle('has-dot', dots.has(tab.dataset.route)));
  updateBadges({ dots, due: due.length });
}
const subEl = document.getElementById('screen-sub');
const backEl = document.getElementById('topbar-back');
const extraEl = document.getElementById('topbar-extra');
const tabs = document.querySelectorAll('.tab');
const tabbar = document.querySelector('.tabbar');
const appEl = document.getElementById('app');
const sidenav = document.querySelector('.sidenav');


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
    sidenav.hidden = !inside;
    if (inside) {
      drawSidenav();
      if (rerender) rerender();
      else rerender = startRouter(route);
      return;
    }
    if (typeof cleanup === 'function') cleanup();
    cleanup = null;
    document.querySelectorAll('.sheet-backdrop, .menu-backdrop').forEach((sheet) => sheet.remove());
    appEl.classList.remove('no-topbar');
    backEl.hidden = true;
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
    // Každý modul má vlevo šipku zpět na Domů (i ty, které jsou zároveň ve spodní
    // liště, na Domů mají dlaždici jako ostatní). Bez šipky je jen Domů a Nastavení.
    // Na počítači je navigace v levém panelu, šipka zůstává jen na podstránkách.
    // Seznam a detail vedle sebe (view.split) šipku na počítači nepotřebují vůbec.
    backEl.hidden = isDesktop() ? !params?.length || Boolean(view.split) || name === 'penize' : name === 'domu' || name === 'vice';
    backEl.href = `#/${view.tab && view.tab !== name ? view.tab : 'domu'}`;
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

    // Novinky v modulu od poslední návštěvy se jemně zvýrazní a tečka zmizí
    currentModule = name;
    if (store.NEWS_MODULES.includes(name)) {
      await store.openModule(name);
      updateDots();
    }

    try {
      cleanup = await view.render(viewEl, { params, extraEl, subEl });
      // Levý panel zvýrazní přímo modul (Recepty, Byt…) a jeho podsekci
      markSidenav(name, params ?? [], view.tab ?? null);
    } catch (err) {
      console.error(err);
      viewEl.innerHTML = `<section class="card"><h2 class="card-title">Něco se pokazilo</h2>
        <p class="muted">${escapeHtml(err?.message ?? String(err))}</p></section>`;
    }
  }

  // Tečka u záložky Úkoly, dokud je někde nepřečtený komentář
  // V levém panelu navíc počet plateb k zaplacení u Peněz
  // Tečka novinek u modulu (ve spodní liště a v levém panelu); u Úkolů je to
  // táž tečka jako nepřečtené komentáře. Když novinka přijde přes Realtime,
  // položka v liště a v panelu jednou krátce zablikají.
  store.subscribe(updateDots);
  auth.onChange(updateDots);
  store.onArrive(async (module) => {
    if (module === currentModule) {
      await store.openModule(module, { highlight: false });
      return;
    }
    await updateDots();
    blink(document.querySelector(`.tab[data-route="${module}"]`));
    blink(document.querySelector(`.side-item[data-route="${module}"]`));
  });

  // Přechod přes hranici počítače (zúžení / rozšíření okna): pohled se překreslí
  onDesktopChange(() => { if (rerender && auth.getState().status === 'ready') rerender(); });

  // Esc zavře otevřený detail (nabídku a dialog zavírají samy). Pole se nejdřív
  // opustí, ať se rozepsaná změna uloží.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || auth.getState().status !== 'ready') return;
    if (document.querySelector('.menu-backdrop, .sheet-backdrop, .is-moving-mode, .doc-full, .cook')) return;
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    if (parts.length < 2 || !parts[1]) return;
    document.activeElement?.blur?.();
    setTimeout(() => { location.hash = `#/${parts[0]}`; }, 0);
  });

  initSidenav({ onRerender: () => rerender?.() });

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
