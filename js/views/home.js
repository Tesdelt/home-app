// Domů: jedna obrazovka "co je dnes". Většinu dní by měla stačit jen tahle.

import * as store from '../store.js';
import { escapeHtml, ICONS, todayLabel, itemsCount, money } from '../ui.js';
import { today, dueLabel } from '../dates.js';
import { sortTasks } from './tasks.js';

export const title = 'Dnes';

export async function render(el, { subEl }) {
  subEl.textContent = todayLabel();
  subEl.hidden = false;

  // Vlastní kontejner: posluchače nesmí viset na sdíleném #view
  const root = document.createElement('div');
  el.append(root);

  async function draw() {
    const [items, tasks, payments, summary, soon] = await Promise.all([
      store.listItems(), store.listTasks(), store.listPayments(), store.paymentsSummary(), store.duePayments(7),
    ]);
    const open = items.filter((i) => !i.done);
    let out = '';

    // Všechny nehotové úkoly podle termínu, nejbližší první
    const all = sortTasks(tasks, 'due').flatMap((group) => group.tasks);
    const due = all.filter((t) => t.due && t.due <= today());
    const names = all.slice(0, 4).map((t) => escapeHtml(t.title) + (t.time && t.due === today() ? ` ${escapeHtml(t.time)}` : '')).join(', ');
    const more = all.length > 4 ? ` a ${all.length - 4} další` : '';
    const tasksText = all.length ? `${names}${more}` : 'Žádné úkoly.';
    out += `<a class="card" href="#/ukoly">
      <div class="card-head">
        <span class="card-icon">${ICONS.tasks}</span>
        <h2 class="card-title">Úkoly</h2>
        <span class="card-meta">${due.length ? `na dnes ${due.length}` : ''}</span>
      </div>
      <p class="card-meta" style="margin: 0">${tasksText}</p>
    </a>`;

    const preview = open.slice(0, 4).map((i) => escapeHtml(i.name)).join(', ');
    const rest = open.length > 4 ? ` a ${open.length - 4} další` : '';
    out += `<a class="card" href="#/nakup">
      <div class="card-head">
        <span class="card-icon">${ICONS.cart}</span>
        <h2 class="card-title">Nákup</h2>
        <span class="card-meta">${open.length ? itemsCount(open.length) : ''}</span>
      </div>
      <p class="card-meta" style="margin: 0">${open.length ? `${preview}${rest}` : 'Seznam je prázdný.'}</p>
    </a>`;

    // Platby splatné do 7 dní nebo už po termínu
    const late = soon.some((p) => p.nextDue < today());
    const soonText = soon.slice(0, 3).map((p) => `${escapeHtml(p.name)} ${dueLabel(p.nextDue)}`).join(', ')
      + (soon.length > 3 ? ` a ${soon.length - 3} další` : '');
    out += `<a class="card" href="#/penize">
      <div class="card-head">
        <span class="card-icon">${ICONS.wallet}</span>
        <h2 class="card-title">Peníze</h2>
        <span class="card-meta">${soon.length ? `zaplatit ${soon.length}` : (payments.length ? `${money(summary.total)} měsíčně` : '')}</span>
      </div>
      <p class="card-meta${late ? ' is-late' : ''}" style="margin: 0">${payments.length ? (soon.length ? `Zaplatit: ${soonText}` : 'V příštích 7 dnech nic k zaplacení.') : 'Žádné platby.'}</p>
    </a>`;

    // Další moduly: dlaždice po dvou. Nové moduly se přidávají sem, ne do Více.
    const tiles = [
      ['recepty', 'recipe', 'Recepty'],
      ['administrativa', 'folder', 'Administrativa'],
      ['wishlist', 'gift', 'Wishlist'],
      ['bucketlist', 'star', 'Bucketlist'],
      ['info', 'house', 'Domácnost'],
    ];
    out += `<div class="tiles">${tiles.map(([route, icon, name]) => `<a class="card tile" href="#/${route}">
        <span class="card-icon">${ICONS[icon]}</span><span class="card-title">${name}</span>
      </a>`).join('')}</div>`;

    root.innerHTML = out;
  }

  await draw();
  return store.subscribe(draw);
}
