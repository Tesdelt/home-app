import { addRoute, startRouter } from './router.js';
import { openDB, requestPersistentStorage } from './db.js';
import { escapeHtml } from './ui.js';
import * as home from './views/home.js';
import * as shopping from './views/shopping.js';
import * as tasks from './views/tasks.js';
import * as money from './views/money.js';
import * as more from './views/more.js';

// Pořadí = pořadí v liště. První trasa je výchozí.
addRoute('domu', home);
addRoute('nakup', shopping);
addRoute('ukoly', tasks);
addRoute('penize', money);
addRoute('vice', more);

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('screen-title');
const subEl = document.getElementById('screen-sub');
const extraEl = document.getElementById('topbar-extra');
const tabs = document.querySelectorAll('.tab');

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

  // Pohled může vrátit funkci na úklid (odhlášení odběru změn apod.)
  let cleanup = null;

  startRouter(async (name, view, params) => {
    if (typeof cleanup === 'function') cleanup();
    cleanup = null;

    titleEl.textContent = view.title;
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
  });

  registerServiceWorker();
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
