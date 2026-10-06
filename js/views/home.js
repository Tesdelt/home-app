// Domů: jedna obrazovka "co je dnes". Většinu dní by měla stačit jen tahle.

import * as store from '../store.js';
import { PEOPLE } from '../config.js';
import { escapeHtml, ICONS, todayLabel, itemsCount } from '../ui.js';

export const title = 'Dnes';

export async function render(el, { subEl }) {
  subEl.textContent = todayLabel();
  subEl.hidden = false;

  // Vlastní kontejner: posluchače nesmí viset na sdíleném #view
  const root = document.createElement('div');
  el.append(root);

  async function draw() {
    const [me, items] = await Promise.all([store.getMe(), store.listItems()]);
    const open = items.filter((i) => !i.done);
    let out = '';

    if (!me) {
      out += `<section class="card">
        <div class="card-head"><span class="card-icon">${ICONS.user}</span><h2 class="card-title">Kdo jste?</h2></div>
        <p class="card-meta" style="margin: 0 0 10px">Ať je u položek vidět, kdo je přidal. Stačí jednou na každém telefonu.</p>
        <div class="segmented">${PEOPLE.map((p) => `<button type="button" data-me="${escapeHtml(p)}" aria-pressed="false">${escapeHtml(p)}</button>`).join('')}</div>
      </section>`;
    }

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

    out += `<section class="card is-muted">
      <div class="card-head"><span class="card-icon">${ICONS.tasks}</span><h2 class="card-title">Úkoly</h2><span class="card-meta">brzy</span></div>
      <p class="card-meta" style="margin: 0">Dnešní úkoly a opakované povinnosti, třeba prášek pro psa.</p>
    </section>
    <section class="card is-muted">
      <div class="card-head"><span class="card-icon">${ICONS.wallet}</span><h2 class="card-title">Peníze</h2><span class="card-meta">brzy</span></div>
      <p class="card-meta" style="margin: 0">Kdo komu kolik dluží a nejbližší platby.</p>
    </section>`;

    root.innerHTML = out;
  }

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-me]');
    if (btn) store.setMe(btn.dataset.me);
  });

  await draw();
  return store.subscribe(draw);
}
