// Úkoly: jeden seznam všech úkolů bez ohledu na termín, řazení se volí
// tlačítkem v horní liště (termín, důležitost, pro koho, přidáno).
// Nový úkol tlačítkem + (otevře stránku úkolu, kde se všechno nastaví předem).
// Ťuknutí na kolečko = hotovo, ťuknutí na řádek = stránka úkolu (podrobnosti,
// kroky, komentáře, viz task.js), potažení doleva = smazat.
// V řádku je vidět pro koho úkol je (barva), termín a důležitost (1-3).
// Úkol pro oba musí odškrtnout každý za sebe. Soukromý úkol (zámek) vidí jen
// ten, kdo ho založil.

import * as store from '../store.js';
import { escapeHtml, ICONS, undoToast, rowGestures, openMenu, holdKeyboard, whoClass, whoBadge } from '../ui.js';
import { navigate } from '../router.js';
import { renderTask, NEW } from './task.js';
import { today, dayStr, addDays, dueLabel, dueTimeLabel, timeLabel, isSameDay } from '../dates.js';

export const title = 'Úkoly';

export const REPEATS = [
  { value: '', name: 'Neopakovat' },
  { value: '1:day', name: 'Každý den' },
  { value: '1:week', name: 'Každý týden' },
  { value: '2:week', name: 'Každé 2 týdny' },
  { value: '1:month', name: 'Každý měsíc' },
  { value: '3:month', name: 'Každé 3 měsíce' },
  { value: '1:year', name: 'Každý rok' },
];

const REPEAT_SHORT = { '1:day': 'denně', '1:week': 'týdně', '2:week': 'co 2 týdny', '1:month': 'měsíčně', '3:month': 'co 3 měsíce', '1:year': 'ročně' };
const UNIT_NAMES = { day: 'dní', week: 'týdnů', month: 'měsíců', year: 'let' };

export const repeatValue = (repeat) => (repeat ? `${repeat.every}:${repeat.unit}` : '');
export const repeatLabel = (repeat) => REPEAT_SHORT[repeatValue(repeat)] ?? `co ${repeat.every} ${UNIT_NAMES[repeat.unit] ?? ''}`.trim();

function newComments(n) {
  if (n === 1) return '1 nový komentář';
  if (n >= 2 && n <= 4) return `${n} nové komentáře`;
  return `${n} nových komentářů`;
}

// ---------- Řazení ----------

export const SORTS = [
  ['due', 'Termín'],
  ['priority', 'Důležitost'],
  ['who', 'Pro koho'],
  ['created', 'Přidáno'],
];

// Úkol s časem je v rámci dne před úkoly bez času, bez termínu až na konci
const clock = (t) => t.time ?? '99:99';
const byDue = (a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || clock(a).localeCompare(clock(b))
  || (b.priority ?? 2) - (a.priority ?? 2) || a.createdAt - b.createdAt;

// Nehotové úkoly seřazené podle kritéria a rozdělené do skupin s nadpisem.
// Vrací [{ label, tasks }], label může být prázdný. Používá i Domů.
export function sortTasks(tasks, sort = 'due', members = [], day = today()) {
  const open = tasks.filter((t) => !t.done);
  if (sort === 'priority') {
    return [{ label: '', tasks: [...open].sort((a, b) => (b.priority ?? 2) - (a.priority ?? 2) || byDue(a, b)) }];
  }
  if (sort === 'created') {
    return [{ label: '', tasks: [...open].sort((a, b) => b.createdAt - a.createdAt) }];
  }
  if (sort === 'who') {
    const who = [...members.map((m) => [m, m]), [store.BOTH, 'Oba'], [null, 'Kdokoliv']];
    return who
      .map(([value, label]) => ({ label, tasks: open.filter((t) => (t.assignee ?? null) === value).sort(byDue) }))
      .filter((group) => group.tasks.length);
  }
  const weekEnd = addDays(day, 7);
  const sorted = [...open].sort(byDue);
  return [
    { label: 'Po termínu', tasks: sorted.filter((t) => t.due && t.due < day) },
    { label: 'Dnes', tasks: sorted.filter((t) => t.due === day) },
    { label: 'Tento týden', tasks: sorted.filter((t) => t.due && t.due > day && t.due <= weekEnd) },
    { label: 'Později', tasks: sorted.filter((t) => t.due && t.due > weekEnd) },
    { label: 'Bez termínu', tasks: sorted.filter((t) => !t.due) },
  ].filter((group) => group.tasks.length);
}

export async function render(el, { params, subEl, extraEl }) {
  // #/ukoly/<id> je stránka jednoho úkolu
  if (params?.[0]) return renderTask(el, params[0], { subEl, extraEl });

  const listRoot = document.createElement('div');
  listRoot.className = 'list-root';
  el.append(listRoot);

  const sortBtn = document.createElement('button');
  sortBtn.type = 'button';
  sortBtn.className = 'btn btn-small shop-btn';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'add-btn';
  addBtn.setAttribute('aria-label', 'Přidat úkol');
  addBtn.innerHTML = ICONS.plus;
  // Na nové stránce se rovnou píše název, klávesnice musí vyjet už teď
  addBtn.addEventListener('click', () => {
    holdKeyboard();
    navigate(`ukoly/${NEW}`);
  });
  extraEl.append(sortBtn, addBtn);

  let me = await store.getMe();
  let members = await store.listMembers();
  let sort = await store.getMeta('taskSort', 'due');
  let comments = {};
  let unread = {};
  let renderToken = 0;

  // Řazení si pamatuje každý telefon zvlášť
  sortBtn.addEventListener('click', () => {
    openMenu(sortBtn, (menu, close) => {
      menu.innerHTML = SORTS
        .map(([value, name]) => `<button type="button" class="menu-item" data-value="${value}" aria-pressed="${value === sort}">${name}</button>`)
        .join('');
      menu.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-value]');
        if (!btn) return;
        close();
        sort = btn.dataset.value;
        el.scrollTop = 0;
        await store.setMeta('taskSort', sort);
      });
    });
  });

  // ---------- Vykreslení ----------

  // checked = řádek se ukazuje jako splněný
  function row(task, { checked = false } = {}) {
    const meta = [];
    const parts = task.doneParts ?? [];
    const mine = !checked && parts.includes(me);
    if (checked) {
      if (task.doneAt) meta.push(`${escapeHtml(task.doneBy ?? '')} ${isSameDay(task.doneAt) ? timeLabel(task.doneAt) : dueLabel(dayStr(new Date(task.doneAt)))}`.trim());
    } else {
      // Termín je vidět vždy, zpožděný červeně
      if (task.due) meta.push(task.due < today() ? `<span class="is-late">${dueTimeLabel(task.due, task.time)}</span>` : dueTimeLabel(task.due, task.time));
      if (task.repeat) meta.push(repeatLabel(task.repeat));
      if (task.assignee === store.BOTH && parts.length) {
        const waiting = members.filter((m) => !parts.includes(m));
        meta.push(`<span class="is-part">hotovo ${escapeHtml(parts.join(', '))}, zbývá ${escapeHtml(waiting.join(', '))}</span>`);
      } else if (task.repeat && task.doneAt) {
        // U opakovaného je vidět, kdo a kdy ho splnil minule
        const when = isSameDay(task.doneAt) ? `dnes ${timeLabel(task.doneAt)}` : dueLabel(dayStr(new Date(task.doneAt)));
        meta.push(`naposledy ${escapeHtml(task.doneBy ?? '')} ${when}`.replace(/\s+/g, ' ').trim());
      }
    }
    // Úkol s kroky ukazuje, kolik jich je hotových
    const steps = task.steps ?? [];
    if (steps.length && !checked) meta.push(`kroky ${steps.filter((step) => step.done).length}/${steps.length}`);
    // Nepřečtený komentář od druhého je zvýrazněný, po otevření úkolu zase zešedne
    if (unread[task.id]) meta.push(`<span class="is-unread">${newComments(unread[task.id])}</span>`);
    else if (comments[task.id]) meta.push(`komentáře: ${comments[task.id]}`);
    const note = task.note ? `<span class="item-sub item-note">${escapeHtml(task.note)}</span>` : '';
    const priority = task.priority ?? 2;
    return `<li class="item ${whoClass(task.assignee, members)}${checked ? ' is-done' : ''}${mine ? ' is-mine' : ''}${unread[task.id] ? ' has-unread' : ''}" data-id="${escapeHtml(task.id)}">
      <div class="item-bg" aria-hidden="true">Smazat</div>
      <button type="button" class="item-main has-stripe" aria-pressed="${checked}">
        <span class="check-tap"><span class="check">${ICONS.check}</span></span>
        <span class="item-text"><span class="item-name">${escapeHtml(task.title)}</span>${meta.length ? `<span class="item-sub">${meta.join(' · ')}</span>` : ''}${note}</span>
        ${task.privateTo ? `<span class="item-lock" title="Soukromý">${ICONS.lock}</span>` : ''}
        ${checked ? '' : `<span class="prio prio-${priority}" title="Důležitost ${priority} ze 3">${priority}</span>`}
        ${whoBadge(task.assignee, members)}
      </button>
    </li>`;
  }

  async function renderList() {
    const token = ++renderToken;
    const tasks = await store.listTasks();
    [me, members, comments, unread, sort] = await Promise.all([
      store.getMe(), store.listMembers(), store.commentCounts(), store.unreadComments(), store.getMeta('taskSort', 'due'),
    ]);
    if (token !== renderToken) return;

    sortBtn.textContent = SORTS.find(([value]) => value === sort)?.[1] ?? 'Termín';

    if (!tasks.length) {
      listRoot.innerHTML = `<div class="empty"><div class="empty-icon">${ICONS.tasks}</div><p class="empty-title">Žádné úkoly</p></div>`;
      return;
    }

    // Jeden souvislý seznam, skupiny jen jako malý nadpis uvnitř
    const groups = sortTasks(tasks, sort, members);
    const rows = groups
      .map((group) => `${group.label ? `<li class="cat-head">${escapeHtml(group.label)}</li>` : ''}${group.tasks.map((t) => row(t)).join('')}`)
      .join('');
    const done = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));

    let out = rows
      ? `<ul class="item-list group">${rows}</ul>`
      : `<div class="empty" style="padding: 28px 24px 12px"><div class="empty-icon">${ICONS.check}</div><p class="empty-title">Všechno hotovo</p></div>`;
    if (done.length) {
      out += `<div class="done-head">
          <p class="section-label">Hotové (${done.length})</p>
          <button type="button" class="btn btn-ghost btn-small" data-action="clear">Vyčistit</button>
        </div>
        <ul class="item-list group">${done.map((t) => row(t, { checked: true })).join('')}</ul>`;
    }
    listRoot.innerHTML = out;
  }

  // ---------- Akce ----------

  // Kolečko úkol splní, zbytek řádku ho otevře jako stránku
  function tap(li, target) {
    if (target?.closest?.('.check-tap')) toggle(li);
    else navigate(`ukoly/${li.dataset.id}`);
  }

  async function toggle(li) {
    // Odškrtnutý řádek nebo moje půlka úkolu pro oba: ťuknutí ji vrátí
    const nowDone = !(li.classList.contains('is-done') || li.classList.contains('is-mine'));
    li.classList.remove('is-done', 'is-mine');
    if (nowDone) li.classList.add(li.classList.contains('who-both') ? 'is-mine' : 'is-done');
    // krátká pauza, ať je vidět odškrtnutí, než úkol odjede
    await new Promise((r) => setTimeout(r, 180));
    await store.setTaskDone(li.dataset.id, nowDone);
  }

  async function deleteTask(id) {
    const removed = await store.removeTasks([id]);
    if (removed.length) undoToast(`${removed[0].title}: smazáno`, () => store.restoreTasks(removed));
  }

  async function clearDone() {
    const removed = await store.clearDoneTasks();
    if (removed.length) undoToast(`Smazáno hotových: ${removed.length}`, () => store.restoreTasks(removed));
  }

  // ---------- Gesta ----------

  const endGesture = rowGestures(listRoot, { onTap: tap, onPress: (id) => navigate(`ukoly/${id}`), onSwipe: deleteTask });

  listRoot.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="clear"]')) clearDone();
  });

  // ---------- Start ----------

  await renderList();

  const unsubscribe = store.subscribe(renderList);
  return () => {
    unsubscribe();
    endGesture();
    renderToken += 1;
  };
}
