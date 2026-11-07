// Domů: jednotná mřížka dlaždic, jedna na modul. Všechny jsou stejně velké, ve
// dvou sloupcích, a vejdou se na obrazovku bez posouvání. V dlaždici je jen
// barevná ikona, název a jedna základní informace (žádné výpisy položek).
// Nový modul = další řádek v poli tiles a barva --mod-* v css/style.css.

import * as store from '../store.js';
import { ICONS, todayLabel, itemsCount, money, isDesktop, escapeHtml } from '../ui.js';
import { today, dueTimeLabel } from '../dates.js';
import { sortTasks } from './tasks.js';

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
    const [items, tasks, payments, summary, soon, recipes, docs, wishes, buckets, notes, me] = await Promise.all([
      store.listItems(), store.listTasks(), store.listPayments(), store.paymentsSummary(), store.duePayments(7),
      store.listRecipes(), store.listDocs(), store.listWishes('wish'), store.listWishes('bucket'), store.listNotes(), store.getMe(),
    ]);
    const desktop = isDesktop();
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
    // Počítač: Úkoly, Nákup a Peníze mají až tři řádky informací (výjimka
    // z „jedné informace“, viz Design systém), ostatní dlaždice jednu
    const more = {};
    if (desktop) {
      const next = sortTasks(tasks, 'due').flatMap((g) => g.tasks).slice(0, 3);
      more.ukoly = next.map((t) => `${escapeHtml(t.title)}${t.due ? ` · ${escapeHtml(dueTimeLabel(t.due, t.time))}` : ''}`);
      const buyList = items.filter((i) => !i.done);
      if (buyList.length) more.nakup = [buyList.slice(0, 4).map((i) => escapeHtml(i.name)).join(', ') + (buyList.length > 4 ? '…' : '')];
      const money_ = [];
      if (soon.length) money_.push(soon.slice(0, 2).map((p) => escapeHtml(p.name)).join(', '));
      const rows = me ? await store.listMoneyMonths(me) : [];
      const { map, anchored } = store.moneyBalances(rows);
      if (anchored) money_.push(`zůstatek ${money([...map.values()].at(-1))}`);
      more.penize = money_;
    }
    root.innerHTML = `<div class="tiles">${tiles.map(([route, icon, name, info]) => `<a class="card tile mod-${route}" href="#/${route}">
        <span class="card-icon">${ICONS[icon]}</span>
        <h2 class="card-title">${name}</h2>
        <p class="card-line">${info || 'Prázdné'}</p>
        ${(more[route] ?? []).slice(0, 2).map((line) => `<p class="card-line card-more">${line}</p>`).join('')}
      </a>`).join('')}</div>`;
  }

  await draw();
  return store.subscribe(draw);
}
