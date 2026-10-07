// Domů: jedna obrazovka "co je dnes". Většinu dní by měla stačit jen tahle.

import * as store from '../store.js';
import { escapeHtml, ICONS, todayLabel, itemsCount, money } from '../ui.js';
import { today, dueLabel } from '../dates.js';
import { splitTasks } from './tasks.js';

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
      <p class="card-meta${late ? ' is-late' : ''}" style="margin: 0">${payments.length ? (soon.length ? `Zaplatit: ${soonText}` : 'V příštích 7 dnech nic k zaplacení.') : 'Pravidelné platby, jednorázové i splátky.'}</p>
    </a>`;

    root.innerHTML = out;
  }

  await draw();
  return store.subscribe(draw);
}
