// Domů: jedna obrazovka "co je dnes". Většinu dní by měla stačit jen tahle.
// Velké karty (Úkoly, Nákup, Peníze) i dlaždice modulů jsou stejná komponenta
// .card: ikona, název, vpravo počet a pod tím jeden stavový řádek.

import * as store from '../store.js';
import { escapeHtml, ICONS, todayLabel, itemsCount, money } from '../ui.js';
import { today, dueLabel, dueTimeLabel, daysBetween } from '../dates.js';
import { sortTasks } from './tasks.js';

export const title = 'Dnes';

// "1 recept", "3 recepty", "5 receptů"
const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;

const card = ({ route, icon, name, count = '', line, late = false, tile = false }) => `<a class="card${tile ? ' tile' : ''}" href="#/${route}">
    <div class="card-head">
      <span class="card-icon">${ICONS[icon]}</span>
      <h2 class="card-title">${name}</h2>
      ${count ? `<span class="card-meta">${count}</span>` : ''}
    </div>
    <p class="card-line${late ? ' has-late' : ''}">${line}</p>
  </a>`;

export async function render(el, { subEl }) {
  subEl.textContent = todayLabel();
  subEl.hidden = false;

  // Vlastní kontejner: posluchače nesmí viset na sdíleném #view
  const root = document.createElement('div');
  el.append(root);

  async function draw() {
    const [items, tasks, payments, summary, soon, recipes, docs, wishes, buckets, notes] = await Promise.all([
      store.listItems(), store.listTasks(), store.listPayments(), store.paymentsSummary(), store.duePayments(7),
      store.listRecipes(), store.listDocs(), store.listWishes('wish'), store.listWishes('bucket'), store.listNotes(),
    ]);
    const day = today();
    let out = '';

    // Úkoly: počet i výpis jdou ze stejného seznamu (po termínu a na dnes),
    // po termínu nahoře a červeně s ikonou
    const open = sortTasks(tasks, 'due').flatMap((group) => group.tasks);
    const late = open.filter((t) => t.due && t.due < day);
    const now = open.filter((t) => t.due === day);
    const due = [...late, ...now];
    const taskLine = due.slice(0, 4).map((t) => (t.due < day
      ? `<span class="is-late">${escapeHtml(t.title)} ${escapeHtml(dueLabel(t.due))}</span>`
      : escapeHtml(t.title) + (t.time ? ` ${escapeHtml(t.time)}` : ''))).join(', ')
      + (due.length > 4 ? ` a ${due.length - 4} další` : '');
    const next = open.find((t) => t.due && t.due > day);
    out += card({
      route: 'ukoly', icon: 'tasks', name: 'Úkoly',
      count: due.length ? `na dnes ${due.length}` : '',
      line: due.length ? taskLine
        : next ? `Dnes nic. Další: ${escapeHtml(next.title)} ${escapeHtml(dueTimeLabel(next.due, next.time))}`
          : open.length ? `Dnes nic, bez termínu ${open.length}` : 'Zatím prázdné',
    });

    const buy = items.filter((i) => !i.done);
    out += card({
      route: 'nakup', icon: 'cart', name: 'Nákup',
      count: buy.length ? itemsCount(buy.length) : '',
      line: buy.length
        ? buy.slice(0, 4).map((i) => escapeHtml(i.name)).join(', ') + (buy.length > 4 ? ` a ${buy.length - 4} další` : '')
        : 'Zatím prázdné',
    });

    // Platby splatné do 7 dní nebo už po termínu, po termínu první
    const pays = [...soon].sort((a, b) => a.nextDue.localeCompare(b.nextDue));
    const payLine = pays.slice(0, 3).map((p) => (p.nextDue < day
      ? `<span class="is-late">${escapeHtml(p.name)} ${escapeHtml(dueLabel(p.nextDue))}</span>`
      : `${escapeHtml(p.name)} ${escapeHtml(dueLabel(p.nextDue))}`)).join(', ')
      + (pays.length > 3 ? ` a ${pays.length - 3} další` : '');
    out += card({
      route: 'penize', icon: 'wallet', name: 'Peníze',
      count: pays.length ? `zaplatit ${pays.length}` : '',
      line: pays.length ? payLine : payments.length ? `${money(summary.total)} měsíčně` : 'Zatím prázdné',
    });

    // Další moduly: dlaždice po dvou, každá s jedním stavovým řádkem.
    // Nové moduly se přidávají sem, ne do Nastavení.
    const ending = docs.filter((d) => d.validUntil && daysBetween(day, d.validUntil) < 30);
    const openWishes = wishes.filter((w) => !w.done);
    const openBuckets = buckets.filter((w) => !w.done);
    const tiles = [
      { route: 'recepty', icon: 'recipe', name: 'Recepty', line: recipes.length ? plural(recipes.length, 'recept', 'recepty', 'receptů') : '' },
      {
        route: 'administrativa', icon: 'folder', name: 'Administrativa',
        line: ending.length ? `<span class="is-late">${ending.length} končí do 30 dní</span>`
          : docs.length ? plural(docs.length, 'dokument', 'dokumenty', 'dokumentů') : '',
      },
      { route: 'wishlist', icon: 'gift', name: 'Wishlist', line: openWishes.length ? plural(openWishes.length, 'přání', 'přání', 'přání') : '' },
      { route: 'bucketlist', icon: 'star', name: 'Bucketlist', line: openBuckets.length ? plural(openBuckets.length, 'nápad', 'nápady', 'nápadů') : '' },
      { route: 'info', icon: 'house', name: 'Byt', line: escapeHtml(notes.map((n) => n.title).filter(Boolean).join(', ')) },
    ];
    out += `<div class="tiles">${tiles.map((t) => card({ ...t, line: t.line || 'Zatím prázdné', tile: true })).join('')}</div>`;

    root.innerHTML = out;
  }

  await draw();
  return store.subscribe(draw);
}
