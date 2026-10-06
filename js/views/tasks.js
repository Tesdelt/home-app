// Úkoly: zatím jen připravená obrazovka. Plán je v CLAUDE.md.

import { ICONS } from '../ui.js';

export const title = 'Úkoly';

export async function render(el) {
  el.innerHTML = `<div class="empty">
    <div class="empty-icon">${ICONS.tasks}</div>
    <p class="empty-title">Úkoly připravujeme</p>
    <p>Jednorázové i opakované úkoly, přiřazení „já / Domi / kdokoliv“ a sdílené odškrtnutí, třeba u prášku pro psa.</p>
  </div>`;
}
