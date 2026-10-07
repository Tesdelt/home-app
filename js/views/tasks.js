// Úkoly: rychlé přidání nahoře, pohledy Dnes / Týden / Někdy,
// ťuknutí = hotovo, podržení = úprava, potažení doleva = smazat (se Zpět).
// U splněného je vidět, kdo a kdy ho odškrtl (třeba prášek pro psa).

import * as store from '../store.js';
import { escapeHtml, ICONS, undoToast, openSheet, rowGestures } from '../ui.js';
import { today, dayStr, addDays, dueLabel, dayHeading, timeLabel, isSameDay } from '../dates.js';

export const title = 'Úkoly';

const TABS = [
  { id: 'today', name: 'Dnes' },
  { id: 'week', name: 'Týden' },
  { id: 'someday', name: 'Někdy' },
];

const REPEATS = [
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

const repeatValue = (repeat) => (repeat ? `${repeat.every}:${repeat.unit}` : '');
const repeatLabel = (repeat) => REPEAT_SHORT[repeatValue(repeat)] ?? `co ${repeat.every} ${UNIT_NAMES[repeat.unit] ?? ''}`.trim();

// Zvolená záložka vydrží, dokud je appka otevřená
let tab = 'today';

// Rozdělí úkoly do záložek. Používá i Domů.
export function splitTasks(tasks, day = today()) {
  const weekEnd = addDays(day, 7);
  const byDue = (a, b) => (a.due ?? '').localeCompare(b.due ?? '') || a.createdAt - b.createdAt;
  const open = tasks.filter((t) => !t.done);
  return {
    today: open.filter((t) => t.due && t.due <= day).sort(byDue),
    doneToday: tasks.filter((t) => isSameDay(t.doneAt, day)).sort((a, b) => b.doneAt - a.doneAt),
    week: open.filter((t) => t.due && t.due > day && t.due <= weekEnd).sort(byDue),
    later: open.filter((t) => t.due && t.due > weekEnd).sort(byDue),
    noDue: open.filter((t) => !t.due),
    done: tasks.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)),
  };
}

export async function render(el, { subEl }) {
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
    listRoot.parentElement.scrollTop = 0;
    renderList();
  });

  // ---------- Vykreslení ----------

  // checked = řádek se ukazuje jako splněný (i opakovaný úkol splněný dnes)
  function row(task, { checked = false, showDue = true } = {}) {
    const meta = [];
    if (checked) {
      if (task.doneAt) meta.push(`${escapeHtml(task.doneBy ?? '')} ${isSameDay(task.doneAt) ? timeLabel(task.doneAt) : dueLabel(dayStr(new Date(task.doneAt)))}`.trim());
      if (task.repeat && task.due) meta.push(`další ${dueLabel(task.due)}`);
    } else {
      if (task.due && showDue) {
        const late = task.due < today();
        meta.push(late ? `<span class="is-late">${dueLabel(task.due)}</span>` : dueLabel(task.due));
      }
      if (task.repeat) meta.push(repeatLabel(task.repeat));
      // U opakovaného je vidět, kdo ho splnil minule
      if (task.repeat && task.doneAt) meta.push(`naposledy ${escapeHtml(task.doneBy ?? '')}`.trim());
    }
    const who = task.assignee
      ? `<span class="item-who${task.assignee === me ? ' is-me' : ''}" title="${escapeHtml(task.assignee)}">${escapeHtml(task.assignee.charAt(0))}</span>`
      : '';
    return `<li class="item${checked ? ' is-done' : ''}" data-id="${escapeHtml(task.id)}">
      <div class="item-bg" aria-hidden="true">Smazat</div>
      <button type="button" class="item-main" aria-pressed="${checked}">
        <span class="check">${ICONS.check}</span>
        <span class="item-text"><span class="item-name">${escapeHtml(task.title)}</span>${meta.length ? `<span class="item-sub">${meta.join(' · ')}</span>` : ''}</span>
        ${who}
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

  async function renderList() {
    const token = ++renderToken;
    const tasks = await store.listTasks();
    me = await store.getMe();
    if (token !== renderToken) return;

    const s = splitTasks(tasks);
    const counts = { today: s.today.length, week: s.week.length, someday: s.noDue.length + s.later.length };

    tabsEl.innerHTML = TABS.map((t) => `<button type="button" role="tab" data-tab="${t.id}" aria-pressed="${t.id === tab}">${t.name}${counts[t.id] ? ` <span class="seg-count">${counts[t.id]}</span>` : ''}</button>`).join('');
    subEl.hidden = !s.today.length;
    subEl.textContent = s.today.length ? `Na dnes: ${s.today.length}` : '';

    let out = '';
    if (tab === 'today') {
      // Termín se ukazuje, jen když některý úkol čeká už z dřívějška
      out += group('', s.today, { showDue: s.today.some((t) => t.due < today()) });
      if (!s.today.length) {
        out += s.doneToday.length
          ? `<div class="empty" style="padding: 28px 24px 12px"><div class="empty-icon">${ICONS.check}</div><p class="empty-title">Na dnes hotovo</p></div>`
          : empty('Na dnes nic', 'Napište nahoře, co je potřeba udělat.');
      }
      out += group(`Hotovo dnes (${s.doneToday.length})`, s.doneToday, { checked: true });
    } else if (tab === 'week') {
      const days = [...new Set(s.week.map((t) => t.due))];
      out += days.map((day) => group(dayHeading(day), s.week.filter((t) => t.due === day), { showDue: false })).join('');
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

    if (tasks.length) out += '<p class="hint">Ťuknutím odškrtnete, podržením upravíte, potažením doleva smažete.</p>';
    listRoot.innerHTML = out;
  }

  // ---------- Akce ----------

  async function toggle(li) {
    const nowDone = !li.classList.contains('is-done');
    li.classList.toggle('is-done', nowDone);
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

  async function openEdit(id) {
    const [tasks, members] = await Promise.all([store.listTasks(), store.listMembers()]);
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    openSheet('Upravit úkol', (body, close) => {
      const current = repeatValue(task.repeat);
      const repeats = REPEATS.some((r) => r.value === current) ? REPEATS : [...REPEATS, { value: current, name: repeatLabel(task.repeat) }];
      body.innerHTML = `<form class="edit-form" autocomplete="off">
        <label class="field"><span>Název</span>
          <input class="input" name="title" value="${escapeHtml(task.title)}" required></label>
        <div class="field"><span>Kdo</span>
          <div class="segmented" data-name="assignee">
            ${['', ...members].map((m) => `<button type="button" data-value="${escapeHtml(m)}" aria-pressed="${(task.assignee ?? '') === m}">${escapeHtml(m || 'Kdokoliv')}</button>`).join('')}
          </div></div>
        <label class="field"><span>Termín</span>
          <input class="input" type="date" name="due" value="${escapeHtml(task.due ?? '')}"></label>
        <div class="quick-row">
          <button type="button" class="chip-btn" data-due="${today()}">Dnes</button>
          <button type="button" class="chip-btn" data-due="${addDays(today(), 1)}">Zítra</button>
          <button type="button" class="chip-btn" data-due="${addDays(today(), 7)}">Za týden</button>
          <button type="button" class="chip-btn" data-due="">Bez termínu</button>
        </div>
        <label class="field"><span>Opakování</span>
          <select class="input" name="repeat">
            ${repeats.map((r) => `<option value="${r.value}"${r.value === current ? ' selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
          </select></label>
        <div class="field" data-repeat-only><span>Další termín počítat</span>
          <div class="segmented" data-name="mode">
            <button type="button" data-value="fixed" aria-pressed="${task.repeat?.mode !== 'after'}">Od termínu</button>
            <button type="button" data-value="after" aria-pressed="${task.repeat?.mode === 'after'}">Od splnění</button>
          </div>
          <p class="field-hint">Od termínu: pořád stejný den (popelnice). Od splnění: znovu až za danou dobu po odškrtnutí (výměna filtru).</p></div>
        <div class="btn-row">
          <button type="button" class="btn btn-danger" data-action="delete">Smazat</button>
          <button type="submit" class="btn btn-primary">Uložit</button>
        </div>
      </form>`;

      const f = body.querySelector('form');
      const repeatOnly = f.querySelector('[data-repeat-only]');
      const syncRepeat = () => { repeatOnly.hidden = !f.elements.repeat.value; };
      syncRepeat();
      f.elements.repeat.addEventListener('change', syncRepeat);

      f.addEventListener('click', (e) => {
        const seg = e.target.closest('.segmented button');
        if (seg) seg.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === seg));
        const quick = e.target.closest('[data-due]');
        if (quick) f.elements.due.value = quick.dataset.due;
      });
      const picked = (name) => f.querySelector(`[data-name="${name}"] [aria-pressed="true"]`)?.dataset.value ?? '';

      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const titleText = f.elements.title.value.trim();
        if (!titleText) return;
        const [every, unit] = f.elements.repeat.value.split(':');
        const repeat = unit ? { every: Number(every), unit, mode: picked('mode') || 'fixed' } : null;
        // Opakovaný úkol potřebuje termín, od kterého se počítá
        const due = f.elements.due.value || (repeat ? today() : null);
        await store.updateTask(id, { title: titleText, assignee: picked('assignee') || null, due, repeat });
        close();
      });
      f.querySelector('[data-action="delete"]').addEventListener('click', () => {
        close();
        deleteTask(id);
      });
    });
  }

  // ---------- Gesta ----------

  const endGesture = rowGestures(listRoot, { onTap: toggle, onPress: openEdit, onSwipe: deleteTask });

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
