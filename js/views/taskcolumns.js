// Úkoly ve sloupcích (jen počítač, přepínač Seznam / Sloupce v Úkolech).
// Sloupce podle aktuálního řazení: Termín (Po termínu, Dnes, Tento týden,
// Později, Bez termínu), nebo Pro koho (členové, Oba, Kdokoliv); jiné řazení
// má sloupce podle termínu. Karta má stejný obsah jako řádek seznamu.
// Přetažení karty do jiného sloupce změní termín (Dnes = dnes, Tento týden =
// za 3 dny, Později = za 14 dní, Bez termínu = bez termínu) nebo pro koho.
// Karta jede plynule s myší, cílový sloupec se zvýrazní.

import * as store from '../store.js';
import { escapeHtml } from '../ui.js';
import { today, addDays } from '../dates.js';

const DUE_COLUMNS = [
  ['late', 'Po termínu'],
  ['today', 'Dnes', () => ({ due: today() }), 'dnes'],
  ['week', 'Tento týden', () => ({ due: addDays(today(), 3) }), 'za 3 dny'],
  ['later', 'Později', () => ({ due: addDays(today(), 14) }), 'za 14 dní'],
  ['none', 'Bez termínu', () => ({ due: null, time: null }), 'bez termínu'],
];

function dueColumn(task) {
  const day = today();
  if (!task.due) return 'none';
  if (task.due < day) return 'late';
  if (task.due === day) return 'today';
  return task.due <= addDays(day, 7) ? 'week' : 'later';
}

// root   kontejner sloupců; onOpen(id), onToggle(li), onMove(task, patch, popis)
export function kanban(root, { onOpen, onToggle, onMove }) {
  let tasks = [];
  let columns = [];
  let drag = null; // { li, task, x, y, ghost, target, active }
  let ignoreClick = 0;

  function draw(list, { sort, members, me, row }) {
    tasks = list;
    const byDue = (a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || (a.time ?? '99').localeCompare(b.time ?? '99');
    if (sort === 'who') {
      const ordered = [...members].sort((a, b) => (a === me ? -1 : b === me ? 1 : 0));
      columns = [
        ...ordered.map((m) => [`who:${m}`, m, () => ({ assignee: m }), `pro ${m}`]),
        ['who:both', 'Oba', () => ({ assignee: store.BOTH }), 'pro oba'],
        ['who:any', 'Kdokoliv', () => ({ assignee: null }), 'pro kohokoliv'],
      ];
    } else {
      columns = DUE_COLUMNS;
    }
    const keyOf = (t) => (sort === 'who' ? `who:${t.assignee === store.BOTH ? 'both' : t.assignee ?? 'any'}` : dueColumn(t));
    root.innerHTML = `<div class="kb">${columns.map(([key, label, patch]) => {
      const inCol = tasks.filter((t) => keyOf(t) === key).sort(byDue);
      return `<section class="kb-col${patch ? '' : ' is-locked'}" data-col="${escapeHtml(key)}">
        <p class="section-label kb-head">${escapeHtml(label)}<span class="kb-count">${inCol.length || ''}</span></p>
        <ul class="item-list kb-list">${inCol.map((t) => row(t).replace('<li class="item ', '<li class="item kb-card ')).join('')}</ul>
      </section>`;
    }).join('')}</div>`;
  }

  const colAt = (x, y) => document.elementFromPoint(x, y)?.closest('.kb-col');

  function handleDown(e) {
    const li = e.target.closest('.kb-card');
    if (!li || e.button !== 0 || e.target.closest('.check-tap')) return;
    drag = { li, task: tasks.find((t) => t.id === li.dataset.id), x: e.clientX, y: e.clientY, active: false, target: null };
  }

  function handleMove(e) {
    if (!drag) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      // Začátek tažení: přes kartu se položí kopie, která jede s myší
      const rect = drag.li.getBoundingClientRect();
      const ghost = drag.li.cloneNode(true);
      ghost.classList.add('kb-ghost');
      Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px` });
      document.body.append(ghost);
      drag.li.classList.add('is-lifted');
      Object.assign(drag, { active: true, ghost, dx: drag.x - rect.left, dy: drag.y - rect.top });
    }
    drag.ghost.style.transform = `translate(${e.clientX - drag.x}px, ${e.clientY - drag.y}px) rotate(1.5deg)`;
    const col = colAt(e.clientX, e.clientY);
    const target = col && !col.classList.contains('is-locked') && !col.contains(drag.li) ? col : null;
    if (target !== drag.target) {
      drag.target?.classList.remove('is-target');
      target?.classList.add('is-target');
      drag.target = target;
    }
  }

  async function handleUp() {
    if (!drag) return;
    const { active, target, ghost, li, task } = drag;
    drag = null;
    if (!active) return;
    ignoreClick = Date.now() + 300;
    target?.classList.remove('is-target');
    if (target && task) {
      // Kopie dojede plynule na místo v cílovém sloupci, pak se uloží změna
      const dest = target.querySelector('.kb-list').getBoundingClientRect();
      const from = ghost.getBoundingClientRect();
      ghost.style.transition = 'transform 170ms cubic-bezier(0.2, 0, 0, 1), opacity 170ms ease';
      ghost.style.transform = `translate(${dest.left - parseFloat(ghost.style.left)}px, ${dest.top - parseFloat(ghost.style.top)}px)`;
      ghost.style.opacity = '0.6';
      void from;
      await new Promise((r) => setTimeout(r, 170));
      ghost.remove();
      const [, , patch, label] = columns.find(([key]) => key === target.dataset.col);
      await onMove(task, patch(), label);
    } else {
      ghost.style.transition = 'transform 170ms cubic-bezier(0.2, 0, 0, 1)';
      ghost.style.transform = '';
      await new Promise((r) => setTimeout(r, 170));
      ghost.remove();
      li.classList.remove('is-lifted');
    }
  }

  root.addEventListener('pointerdown', handleDown);
  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleUp);
  root.addEventListener('click', (e) => {
    if (Date.now() < ignoreClick) return;
    const li = e.target.closest('.kb-card');
    if (!li) return;
    if (e.target.closest('.check-tap')) onToggle(li);
    else if (!e.target.closest('.item-more')) onOpen(li.dataset.id);
  });
  root.addEventListener('dragstart', (e) => e.preventDefault());

  return {
    draw,
    destroy() {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      drag?.ghost?.remove();
    },
  };
}
