// Úkoly: rychlé přidání nahoře, pohledy Dnes / Týden / Někdy.
// Ťuknutí na kolečko = hotovo, ťuknutí na řádek = stránka úkolu (podrobnosti,
// kroky, komentáře, viz task.js), potažení doleva = smazat.
// V řádku je vidět pro koho úkol je (barva), termín a důležitost (1-3).
// Úkol pro oba musí odškrtnout každý za sebe.

import * as store from '../store.js';
import { escapeHtml, ICONS, undoToast, rowGestures, whoClass, whoBadge } from '../ui.js';
import { navigate } from '../router.js';
import { renderTask } from './task.js';
import { today, dayStr, addDays, dueLabel, dayHeading, timeLabel, isSameDay } from '../dates.js';

export const title = 'Úkoly';

const TABS = [
  { id: 'today', name: 'Dnes' },
  { id: 'week', name: 'Týden' },
  { id: 'someday', name: 'Někdy' },
];

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

// Zvolená záložka vydrží, dokud je appka otevřená
let tab = 'today';

// Rozdělí úkoly do záložek. Používá i Domů. Důležitější jsou výš.
export function splitTasks(tasks, day = today()) {
  const weekEnd = addDays(day, 7);
  const byDue = (a, b) => (a.due ?? '').localeCompare(b.due ?? '') || (b.priority ?? 2) - (a.priority ?? 2) || a.createdAt - b.createdAt;
  const byPriority = (a, b) => (b.priority ?? 2) - (a.priority ?? 2) || byDue(a, b);
  const open = tasks.filter((t) => !t.done);
  return {
    today: open.filter((t) => t.due && t.due <= day).sort(byPriority),
    doneToday: tasks.filter((t) => isSameDay(t.doneAt, day)).sort((a, b) => b.doneAt - a.doneAt),
    week: open.filter((t) => t.due && t.due > day && t.due <= weekEnd).sort(byDue),
    later: open.filter((t) => t.due && t.due > weekEnd).sort(byDue),
    noDue: open.filter((t) => !t.due).sort(byPriority),
    done: tasks.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)),
  };
}

export async function render(el, { params, subEl, extraEl }) {
  // #/ukoly/<id> je stránka jednoho úkolu
  if (params?.[0]) return renderTask(el, params[0], { subEl, extraEl });

  el.innerHTML = `
    <div class="add-bar">
      <form class="add-form" autocomplete="off">
        <input class="input" name="entry" type="text" placeholder="Přidat úkol…" aria-label="Přidat úkol"
          enterkeyhint="done" autocapitalize="sentences" autocorrect="on">
        <button class="add-btn" type="submit" aria-label="Přidat">${ICONS.plus}</button>
      </form>
      <div class="segmented seg-bar" role="tablist"></div>
    </div>
    <div class="list-root"></div>`;

  const form = el.querySelector('.add-form');
  const input = form.elements.entry;
  const tabsEl = el.querySelector('.seg-bar');
  const listRoot = el.querySelector('.list-root');

  let me = await store.getMe();
  let members = await store.listMembers();
  let comments = {};
  let renderToken = 0;

  // ---------- Přidávání ----------
  // Nový úkol dostane termín podle záložky, na které zrovna jsme.

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.focus();
    const due = { today: today(), week: addDays(today(), 7), someday: null }[tab];
    await store.addTask({ title: text.charAt(0).toLocaleUpperCase('cs') + text.slice(1), due });
  });

  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    tab = btn.dataset.tab;
    el.scrollTop = 0;
    renderList();
  });

  // ---------- Vykreslení ----------

  // checked = řádek se ukazuje jako splněný (i opakovaný úkol splněný dnes)
  function row(task, { checked = false } = {}) {
    const meta = [];
    const parts = task.doneParts ?? [];
    const mine = !checked && parts.includes(me);
    if (checked) {
      if (task.doneAt) meta.push(`${escapeHtml(task.doneBy ?? '')} ${isSameDay(task.doneAt) ? timeLabel(task.doneAt) : dueLabel(dayStr(new Date(task.doneAt)))}`.trim());
      if (task.repeat && task.due) meta.push(`další ${dueLabel(task.due)}`);
    } else {
      // Termín je vidět vždy, zpožděný červeně
      if (task.due) meta.push(task.due < today() ? `<span class="is-late">${dueLabel(task.due)}</span>` : dueLabel(task.due));
      if (task.repeat) meta.push(repeatLabel(task.repeat));
      if (task.assignee === store.BOTH && parts.length) {
        const waiting = members.filter((m) => !parts.includes(m));
        meta.push(`<span class="is-part">hotovo ${escapeHtml(parts.join(', '))}, zbývá ${escapeHtml(waiting.join(', '))}</span>`);
      } else if (task.repeat && task.doneAt) {
        // U opakovaného je vidět, kdo ho splnil minule
        meta.push(`naposledy ${escapeHtml(task.doneBy ?? '')}`.trim());
      }
    }
    // Úkol s kroky ukazuje, u kterého zrovna je
    const steps = task.steps ?? [];
    const current = steps.find((step) => !step.done);
    if (steps.length && current && !checked) meta.push(`krok ${steps.indexOf(current) + 1}/${steps.length}: ${escapeHtml(current.title)}`);
    if (comments[task.id]) meta.push(`komentáře: ${comments[task.id]}`);
    const note = task.note ? `<span class="item-sub item-note">${escapeHtml(task.note)}</span>` : '';
    const priority = task.priority ?? 2;
    return `<li class="item ${whoClass(task.assignee, members)}${checked ? ' is-done' : ''}${mine ? ' is-mine' : ''}" data-id="${escapeHtml(task.id)}">
      <div class="item-bg" aria-hidden="true">Smazat</div>
      <button type="button" class="item-main has-stripe" aria-pressed="${checked}">
        <span class="check-tap"><span class="check">${ICONS.check}</span></span>
        <span class="item-text"><span class="item-name">${escapeHtml(task.title)}</span>${meta.length ? `<span class="item-sub">${meta.join(' · ')}</span>` : ''}${note}</span>
        ${checked ? '' : `<span class="prio prio-${priority}" title="Důležitost ${priority} ze 3">${priority}</span>`}
        ${whoBadge(task.assignee, members)}
      </button>
    </li>`;
  }

  const group = (label, tasks, opts) => (tasks.length
    ? `${label ? `<p class="section-label">${escapeHtml(label)}</p>` : ''}<ul class="item-list group">${tasks.map((t) => row(t, opts)).join('')}</ul>`
    : '');

  const empty = (titleText, text) => `<div class="empty">
      <div class="empty-icon">${ICONS.tasks}</div>
      <p class="empty-title">${titleText}</p>
      <p>${text}</p>
    </div>`;

  // Vysvětlivka barev, ať je jasné, čí úkol je
  function legend() {
    const who = [...members.map((m) => [m, m]), [store.BOTH, 'Oba']];
    return `<p class="legend">${who.map(([value, name]) => `<span class="legend-dot ${whoClass(value, members)}"></span>${escapeHtml(name)}`).join('')}
      <span class="legend-gap"></span><span class="prio prio-1">1</span><span class="prio prio-2">2</span><span class="prio prio-3">3</span>důležitost</p>`;
  }

  async function renderList() {
    const token = ++renderToken;
    const tasks = await store.listTasks();
    [me, members, comments] = await Promise.all([store.getMe(), store.listMembers(), store.commentCounts()]);
    if (token !== renderToken) return;

    const s = splitTasks(tasks);
    const counts = { today: s.today.length, week: s.week.length, someday: s.noDue.length + s.later.length };

    tabsEl.innerHTML = TABS.map((t) => `<button type="button" role="tab" data-tab="${t.id}" aria-pressed="${t.id === tab}">${t.name}${counts[t.id] ? ` <span class="seg-count">${counts[t.id]}</span>` : ''}</button>`).join('');
    subEl.hidden = !s.today.length;
    subEl.textContent = s.today.length ? `Na dnes: ${s.today.length}` : '';

    let out = '';
    if (tab === 'today') {
      out += group('', s.today);
      if (!s.today.length) {
        out += s.doneToday.length
          ? `<div class="empty" style="padding: 28px 24px 12px"><div class="empty-icon">${ICONS.check}</div><p class="empty-title">Na dnes hotovo</p></div>`
          : empty('Na dnes nic', 'Napište nahoře, co je potřeba udělat.');
      }
      out += group(`Hotovo dnes (${s.doneToday.length})`, s.doneToday, { checked: true });
    } else if (tab === 'week') {
      const days = [...new Set(s.week.map((t) => t.due))];
      out += days.map((day) => group(dayHeading(day), s.week.filter((t) => t.due === day))).join('');
      if (!s.week.length) out += empty('Tento týden nic', 'Úkoly s termínem v příštích 7 dnech se objeví tady.');
    } else {
      out += group(s.later.length ? 'Bez termínu' : '', s.noDue);
      out += group('Později', s.later);
      if (!s.noDue.length && !s.later.length) out += empty('Nic odloženého', 'Úkoly bez termínu, na které dojde někdy.');
      if (s.done.length) {
        out += `<div class="done-head">
            <p class="section-label">Hotové (${s.done.length})</p>
            <button type="button" class="btn btn-ghost btn-small" data-action="clear">Vyčistit</button>
          </div>
          <ul class="item-list group">${s.done.map((t) => row(t, { checked: true })).join('')}</ul>`;
      }
    }

    if (tasks.length) out += `${legend()}<p class="hint">Kolečkem odškrtnete, ťuknutím na úkol ho otevřete, potažením doleva smažete.</p>`;
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
  if (matchMedia('(hover: hover)').matches) input.focus();

  const unsubscribe = store.subscribe(renderList);
  return () => {
    unsubscribe();
    endGesture();
  };
}
