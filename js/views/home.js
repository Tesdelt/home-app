// Domů: jedna obrazovka "co je dnes". Většinu dní by měla stačit jen tahle.

import * as store from '../store.js';
import { escapeHtml, ICONS, todayLabel, itemsCount, money } from '../ui.js';
import { today, addDays, dueLabel, nextDayOfMonth } from '../dates.js';
import { splitTasks } from './tasks.js';

export const title = 'Dnes';

export async function render(el, { subEl }) {
  subEl.textContent = todayLabel();
  subEl.hidden = false;

  // Vlastní kontejner: posluchače nesmí viset na sdíleném #view
  const root = document.createElement('div');
  el.append(root);

  async function draw() {
    const [items, tasks, payments, summary] = await Promise.all([
      store.listItems(), store.listTasks(), store.listPayments(), store.paymentsSummary(),
    ]);
    const open = items.filter((i) => !i.done);
    let out = '';

    // Úkoly na dnes jsou nahoře, ty jediné chtějí akci
    const { today: due, doneToday } = splitTasks(tasks);
    const names = due.slice(0, 4).map((t) => escapeHtml(t.title)).join(', ');
    const more = due.length > 4 ? ` a ${due.length - 4} další` : '';
    const tasksText = due.length
      ? `${names}${more}`
      : (doneToday.length ? `Na dnes hotovo (${doneToday.length}).` : 'Na dnes nic.');
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
      <p class="card-meta" style="margin: 0">${open.length ? `${preview}${rest}` : 'Seznam je prázdný. Ťukněte a přidejte, co chybí.'}</p>
    </a>`;

    // Platby splatné v příštích 7 dnech (jen měsíční se dnem splatnosti)
    const limit = addDays(today(), 7);
    const soon = payments
      .filter((p) => p.period === 'month' && p.dueDay)
      .map((p) => ({ p, day: nextDayOfMonth(p.dueDay) }))
      .filter((x) => x.day <= limit)
      .sort((a, b) => a.day.localeCompare(b.day));
    const soonText = soon.slice(0, 3).map((x) => `${escapeHtml(x.p.name)} ${dueLabel(x.day)}`).join(', ');
    out += `<a class="card" href="#/penize">
      <div class="card-head">
        <span class="card-icon">${ICONS.wallet}</span>
        <h2 class="card-title">Peníze</h2>
        <span class="card-meta">${payments.length ? `${money(summary.total)} měsíčně` : ''}</span>
      </div>
      <p class="card-meta" style="margin: 0">${payments.length ? (soonText ? `Blíží se: ${soonText}` : 'V příštích 7 dnech žádná platba.') : 'Pravidelné platby a kdo je platí.'}</p>
    </a>`;

    root.innerHTML = out;
  }

  await draw();
  return store.subscribe(draw);
}
