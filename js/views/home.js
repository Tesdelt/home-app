// Domů: jednotná mřížka dlaždic, jedna na modul. Všechny jsou stejně velké, ve
// dvou sloupcích, a vejdou se na obrazovku bez posouvání. V dlaždici je jen
// barevná ikona, název a jedna základní informace (žádné výpisy položek).
// Nový modul = další řádek v poli tiles a barva --mod-* v css/style.css.

import * as store from '../store.js';
import { ICONS, todayLabel, itemsCount, money } from '../ui.js';
import { today } from '../dates.js';

export const title = 'Dnes';

// "1 recept", "3 recepty", "5 receptů"
const plural = (n, one, few, many) => `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
const late = (text) => `<span class="is-late">${text}</span>`;

export async function render(el, { subEl }) {
  subEl.textContent = todayLabel();
  subEl.hidden = false;

  // Vlastní kontejner: posluchače nesmí viset na sdíleném #view
  const root = document.createElement('div');
  root.className = 'home';
  el.append(root);

  async function draw() {
    const [items, tasks, payments, summary, soon, recipes, docs, wishes, buckets, notes] = await Promise.all([
      store.listItems(), store.listTasks(), store.listPayments(), store.paymentsSummary(), store.duePayments(7),
      store.listRecipes(), store.listDocs(), store.listWishes('wish'), store.listWishes('bucket'), store.listNotes(),
    ]);
    const day = today();
    const count = (list) => list.filter((row) => !row.done).length;

    const open = tasks.filter((t) => !t.done);
    const tasksLate = open.filter((t) => t.due && t.due < day).length;
    const tasksToday = open.filter((t) => t.due === day).length;
    const paysLate = soon.filter((p) => p.nextDue < day).length;
    const ending = docs.filter((d) => d.validUntil && d.validUntil >= day && (new Date(d.validUntil) - new Date(day)) / 86400000 < 30).length;
    const expired = docs.filter((d) => d.validUntil && d.validUntil < day).length;
    const buy = count(items);
    const wishCount = count(wishes);
    const bucketCount = count(buckets);

    // [trasa, ikona, název, informace]; prázdná informace = "Prázdné"
    const tiles = [
      ['ukoly', 'tasks', 'Úkoly', tasksLate ? late(`${tasksLate} po termínu`)
        : tasksToday ? `${tasksToday} na dnes`
          : open.length ? plural(open.length, 'úkol', 'úkoly', 'úkolů') : ''],
      ['nakup', 'cart', 'Nákup', buy ? itemsCount(buy) : ''],
      ['penize', 'wallet', 'Peníze', paysLate ? late(`${paysLate} po termínu`)
        : soon.length ? `${soon.length} k zaplacení`
          : payments.length ? `${money(summary.total)} měsíčně` : ''],
      ['recepty', 'recipe', 'Recepty', recipes.length ? plural(recipes.length, 'recept', 'recepty', 'receptů') : ''],
      ['administrativa', 'folder', 'Administrativa', expired ? late(`${expired} po termínu`)
        : ending ? `${ending} končí do 30 dní`
          : docs.length ? plural(docs.length, 'dokument', 'dokumenty', 'dokumentů') : ''],
      ['wishlist', 'gift', 'Wishlist', wishCount ? `${wishCount} přání` : ''],
      ['bucketlist', 'star', 'Bucketlist', bucketCount ? plural(bucketCount, 'nápad', 'nápady', 'nápadů') : ''],
      ['info', 'house', 'Byt', notes.length ? plural(notes.length, 'poznámka', 'poznámky', 'poznámek') : ''],
    ];
    root.innerHTML = `<div class="tiles">${tiles.map(([route, icon, name, info]) => `<a class="card tile mod-${route}" href="#/${route}">
        <span class="card-icon">${ICONS[icon]}</span>
        <h2 class="card-title">${name}</h2>
        <p class="card-line">${info || 'Prázdné'}</p>
      </a>`).join('')}</div>`;
  }

  await draw();
  return store.subscribe(draw);
}
