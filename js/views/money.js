// Peníze: zatím jen připravená obrazovka. Plán je v CLAUDE.md.

import { ICONS } from '../ui.js';

export const title = 'Peníze';

export async function render(el) {
  el.innerHTML = `<div class="empty">
    <div class="empty-icon">${ICONS.wallet}</div>
    <p class="empty-title">Peníze připravujeme</p>
    <p>Společné výdaje, kdo komu kolik dluží a přehled pravidelných plateb.</p>
  </div>`;
}
