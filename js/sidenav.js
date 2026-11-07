// Levý panel na počítači (od 1024 px). Moduly s ikonou v barvě modulu, dole
// Nastavení. Moduly s podsekcemi se rozbalí šipkou u názvu (klik na název modul
// otevře), pořadí modulů jde změnit přetažením (Nastavení zůstává dole) a panel
// jde zúžit na samotné ikony. Pořadí, rozbalené moduly a zúžení si pamatuje každý
// počítač zvlášť (meta sidebar). Mobilní spodní lišta se tím nemění.
//
// Podsekce nastavují stav modulu: segment Peněz (meta moneySegment), filtr Úkolů
// (meta taskFilter), záložku Receptů a část Administrativy (přes trasu).

import * as store from './store.js';
import { ICONS, escapeHtml, dragSort } from './ui.js';
import { listTabNow } from './views/recipes.js';
import { scopeNow } from './views/docs.js';

const MODULES = {
  domu: ['home', 'Domů'],
  nakup: ['cart', 'Nákup'],
  ukoly: ['tasks', 'Úkoly'],
  penize: ['wallet', 'Peníze'],
  recepty: ['recipe', 'Recepty'],
  administrativa: ['folder', 'Administrativa'],
  wishlist: ['gift', 'Wishlist'],
  bucketlist: ['star', 'Bucketlist'],
  info: ['house', 'Byt'],
};
export const SIDE_ROUTES = Object.keys(MODULES);

const panel = document.querySelector('.sidenav');
let prefs = { order: SIDE_ROUTES, open: [], narrow: false };
let subs = {};
let rerender = () => {};
let current = { name: null, params: [] };

async function savePrefs() {
  await store.setLocal('sidebar', prefs);
}

// Podsekce: [{ key, label, href, meta?: [klíč, hodnota] }]
async function loadSubs() {
  const [members, me] = await Promise.all([store.listMembers(), store.getMe()]);
  const other = members.find((m) => m !== me);
  subs = {
    penize: [
      ...members.map((m) => ({ key: `seg:${m}`, label: m, href: '#/penize', meta: ['moneySegment', m] })),
      { key: `seg:${store.SPLIT}`, label: 'Společné', href: '#/penize', meta: ['moneySegment', store.SPLIT] },
      { key: 'grafy', label: 'Grafy', href: '#/penize/grafy' },
      { key: 'tabulka', label: 'Tabulka', href: '#/penize/tabulka' },
    ],
    recepty: [
      { key: 'recipes', label: 'Recepty', href: '#/recepty/recepty' },
      { key: 'zasoby', label: 'Co uvařit', href: '#/recepty/zasoby' },
      { key: 'skills', label: 'Skills', href: '#/recepty/skills' },
    ],
    ukoly: [
      { key: 'all', label: 'Všechny', href: '#/ukoly', meta: ['taskFilter', 'all'] },
      { key: 'me', label: 'Pro mě', href: '#/ukoly', meta: ['taskFilter', 'me'] },
      ...(other ? [{ key: 'other', label: `Pro ${other}`, href: '#/ukoly', meta: ['taskFilter', 'other'] }] : []),
      { key: 'both', label: 'Pro oba', href: '#/ukoly', meta: ['taskFilter', 'both'] },
    ],
    administrativa: [
      { key: 'shared', label: 'Společné', href: '#/administrativa/spolecne' },
      { key: 'private', label: 'Osobní', href: '#/administrativa/osobni' },
    ],
  };
}

function item(route) {
  const [icon, label] = MODULES[route] ?? ['gear', 'Nastavení'];
  const list = subs[route] ?? [];
  const open = prefs.open.includes(route);
  return `<div class="side-group${list.length ? ' has-subs' : ''}${open ? ' is-open' : ''}" data-route="${route}">
      <div class="side-row">
        <a href="#/${route}" data-route="${route}" class="side-item mod-${route}" title="${escapeHtml(label)}" draggable="false">
          <span class="side-icon">${ICONS[icon]}</span><span class="side-label">${escapeHtml(label)}</span><span class="side-badge"></span>
        </a>
        ${list.length ? `<button type="button" class="side-toggle" aria-label="Rozbalit ${escapeHtml(label)}" aria-expanded="${open}"></button>` : ''}
      </div>
      ${list.length ? `<div class="side-sub-wrap"><div class="side-sub">${list.map((s) => `<a href="${s.href}" class="side-subitem" data-sub="${escapeHtml(s.key)}"${s.meta ? ` data-meta="${escapeHtml(s.meta[0])}" data-value="${escapeHtml(s.meta[1])}"` : ''} draggable="false">${escapeHtml(s.label)}</a>`).join('')}</div></div>` : ''}
    </div>`;
}

export async function drawSidenav() {
  const saved = await store.getMeta('sidebar', null);
  if (saved) {
    // Moduly, které v uloženém pořadí chybí (nově přidané), přijdou na konec
    const order = (saved.order ?? []).filter((r) => SIDE_ROUTES.includes(r));
    prefs = { ...prefs, ...saved, order: [...order, ...SIDE_ROUTES.filter((r) => !order.includes(r))] };
  }
  await loadSubs();
  if (!panel.querySelector('.side-list')) return;
  panel.classList.toggle('is-narrow', Boolean(prefs.narrow));
  document.getElementById('app').classList.toggle('side-narrow', Boolean(prefs.narrow));
  panel.querySelector('.side-list').innerHTML = prefs.order.map(item).join('');
  panel.querySelector('.side-bottom').innerHTML = `${item('vice')}
    <button type="button" class="side-collapse" aria-label="${prefs.narrow ? 'Rozšířit panel' : 'Zúžit panel'}" title="${prefs.narrow ? 'Rozšířit panel' : 'Zúžit panel'}"></button>`;
  updateBadges(badges);
  await markSidenav(current.name, current.params, current.tab);
}

// Zvýraznění aktivního modulu a podsekce
export async function markSidenav(name, params = [], tab = null) {
  current = { name, params, tab };
  if (!name) return;
  const side = SIDE_ROUTES.includes(name) ? name : (tab ?? name);
  panel.querySelectorAll('.side-item').forEach((el) => {
    const active = el.dataset.route === side;
    el.classList.toggle('is-active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  let sub = null;
  if (name === 'penize') {
    // Segment jako v Penězích: uložený, jinak přihlášený člen
    const [seg, me, members] = await Promise.all([store.getMeta('moneySegment', null), store.getMe(), store.listMembers()]);
    const valid = [...members, store.SPLIT].includes(seg) ? seg : (members.includes(me) ? me : store.SPLIT);
    sub = params[0] === 'grafy' || params[0] === 'tabulka' ? params[0] : `seg:${valid}`;
  }
  if (name === 'ukoly') sub = await store.getMeta('taskFilter', 'all');
  if (name === 'recepty') sub = params[0] === 'zasoby' ? 'zasoby' : listTabNow();
  if (name === 'administrativa') sub = scopeNow();
  panel.querySelectorAll('.side-subitem').forEach((el) => {
    const group = el.closest('.side-group');
    const active = group.dataset.route === name && el.dataset.sub === sub;
    el.classList.toggle('is-active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
    // Modul s aktivní podsekcí se sám rozbalí
    if (active && !group.classList.contains('is-open')) {
      group.classList.add('is-open');
      group.querySelector('.side-toggle')?.setAttribute('aria-expanded', 'true');
    }
  });
}

// Poslední stav teček a počtů, ať je překreslení panelu neztratí
let badges = { dot: false, due: 0 };
export function updateBadges({ dot, due }) {
  badges = { dot, due };
  panel.querySelector('.side-group[data-route="ukoly"] .side-item')?.classList.toggle('has-dot', dot);
  const badge = panel.querySelector('.side-group[data-route="penize"] .side-badge');
  if (badge) badge.textContent = due ? String(due) : '';
}

export function initSidenav({ onRerender }) {
  rerender = onRerender;
  panel.innerHTML = `<p class="side-title">Domácnost</p>
    <div class="side-list"></div>
    <div class="side-bottom"></div>`;
  const listEl = panel.querySelector('.side-list');

  panel.addEventListener('click', async (e) => {
    // Šipka jen rozbalí podsekce (plynule, víc modulů může být rozbalených)
    const toggle = e.target.closest('.side-toggle');
    if (toggle) {
      const group = toggle.closest('.side-group');
      const open = !group.classList.contains('is-open');
      group.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open);
      const route = group.dataset.route;
      prefs.open = open ? [...new Set([...prefs.open, route])] : prefs.open.filter((r) => r !== route);
      await savePrefs();
      return;
    }
    if (e.target.closest('.side-collapse')) {
      prefs.narrow = !prefs.narrow;
      await savePrefs();
      drawSidenav();
      return;
    }
    // Podsekce, která nastavuje stav modulu: uložit a modul otevřít / překreslit
    const sub = e.target.closest('.side-subitem[data-meta]');
    if (sub) {
      e.preventDefault();
      await store.setLocal(sub.dataset.meta, sub.dataset.value);
      const href = sub.getAttribute('href');
      if (location.hash === href) rerender();
      else location.hash = href;
    }
  });

  // Pořadí modulů: přetažení (myší hned pohybem, prstem po podržení)
  dragSort(listEl, {
    item: '.side-group',
    handle: '.side-item',
    attr: 'data-route',
    onDrop: async (ids) => {
      prefs.order = ids;
      await savePrefs();
    },
  });
}
