// Stránka jednoho úkolu (#/ukoly/<id>). Odshora: název, řada malých tlačítek
// s nastavením (pro koho, důležitost, termín, opakování, kroky), podrobnosti
// (dlouhé se sbalí) a hlavně komentáře.
// Změny se ukládají samy. Kroky jsou schválně schované, většina úkolů je nemá.
//
// Stejná stránka slouží i k založení úkolu (#/ukoly/novy): všechno se nastaví
// předem a úkol vznikne až tlačítkem Přidat. Do té doby je jen v paměti (draft).

import * as store from '../store.js';
import { escapeHtml, ICONS, undoToast, openMenu, whoClass } from '../ui.js';
import { navigate } from '../router.js';
import { today, dayStr, addDays, dueLabel, dueTimeLabel, timeLabel, isSameDay } from '../dates.js';
import { REPEATS, repeatValue, repeatLabel, defaultDue } from './tasks.js';

export const NEW = 'novy';

// "dnes 14:02", "včera 9:10", "po 5. 10. 14:02"
const when = (timestamp) => `${dueLabel(dayStr(new Date(timestamp)))} ${timeLabel(timestamp)}`;

export async function renderTask(el, id, { subEl }) {
  const root = document.createElement('div');
  root.className = 'detail';
  el.append(root);

  const draft = id === NEW;
  let task = draft
    ? { title: '', note: null, assignee: null, priority: 2, due: defaultDue(), time: null, repeat: null, steps: [], doneParts: [], done: false }
    : await store.getTask(id);
  let notify = false; // nový úkol: poslat druhému upozornění
  if (!task) {
    root.innerHTML = `<a class="back-link" href="#/ukoly">${ICONS.back} Úkoly</a>
      <div class="empty"><p class="empty-title">Úkol už neexistuje</p></div>`;
    return undefined;
  }

  let me = await store.getMe();
  let members = await store.listMembers();
  let editing = null; // id komentáře, který se právě upravuje
  let stepsOpen = (task.steps ?? []).length > 0;
  let openStep = null; // id kroku rozbaleného k úpravě
  let noteOpen = false; // dlouhé podrobnosti rozbalené
  let noteEditing = false;

  // Stránka úkolu nemá horní lištu s názvem sekce, nahoře je rovnou název úkolu
  document.getElementById('app').classList.add('no-topbar');

  root.innerHTML = `
    <div class="detail-head">
      <a class="back-btn" href="#/ukoly" aria-label="Zpět na úkoly">${ICONS.back}</a>
      ${draft ? '' : `<button type="button" class="check-tap" data-action="done" aria-label="Hotovo"><span class="check">${ICONS.check}</span></button>`}
      <textarea class="input detail-title" name="title" rows="1" aria-label="Název" placeholder="Nový úkol" enterkeyhint="done"></textarea>
    </div>
    <div class="opts"></div>
    <p class="detail-state card-meta" hidden></p>

    <div class="steps-box" hidden>
      <ul class="steps-list"></ul>
      <form class="add-form step-form" autocomplete="off">
        <input class="input" name="title" placeholder="Přidat krok…" aria-label="Přidat krok" enterkeyhint="done">
        <button class="add-btn" type="submit" aria-label="Přidat krok">${ICONS.plus}</button>
      </form>
    </div>

    <div class="note-box"></div>

    ${draft ? '<button type="button" class="btn btn-primary btn-block detail-create" data-action="create">Přidat</button>' : `
    <p class="section-label">Komentáře</p>
    <ul class="comments"></ul>
    <form class="add-form comment-form" autocomplete="off">
      <input class="input" name="body" placeholder="Napsat komentář…" aria-label="Napsat komentář" enterkeyhint="send" autocapitalize="sentences">
      <button class="notify-btn" type="button" aria-pressed="false" aria-label="Upozornit druhého">${ICONS.bell}</button>
      <button class="add-btn" type="submit" aria-label="Odeslat">${ICONS.send}</button>
    </form>

    <button type="button" class="btn btn-ghost btn-danger btn-small detail-delete" data-action="delete">Smazat úkol</button>`}`;

  const titleEl = root.querySelector('.detail-title');
  const optsEl = root.querySelector('.opts');
  const stateEl = root.querySelector('.detail-state');
  const stepsBox = root.querySelector('.steps-box');
  const stepsList = root.querySelector('.steps-list');
  const noteBox = root.querySelector('.note-box');
  const commentsEl = root.querySelector('.comments');

  const grow = (area) => { area.style.height = 'auto'; area.style.height = `${area.scrollHeight + 2}px`; };
  // Rozpracovaný nový úkol se mění jen v paměti, existující se hned ukládá
  const save = async (patch) => {
    if (!draft) return store.updateTask(id, patch);
    task = { ...task, ...patch };
    drawHead();
    drawSteps();
    drawNote();
    return task;
  };

  // Kroky (podúkoly): u nového úkolu v paměti, u existujícího přes datovou
  // vrstvu. Na hlavní úkol nemají vliv, ten se odškrtává sám.
  const draftSteps = (steps) => save({ steps });
  const stepsApi = draft ? {
    add: (title) => draftSteps([...task.steps, { id: store.newId(), title, note: null, assignee: null, priority: 2, due: null, time: null, done: false, doneAt: null, doneBy: null }]),
    update: (stepId, patch) => draftSteps(task.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s))),
    setDone: (stepId, done) => draftSteps(task.steps.map((s) => (s.id === stepId ? { ...s, done } : s))),
    remove: (stepId) => draftSteps(task.steps.filter((s) => s.id !== stepId)),
  } : {
    add: (title) => store.addStep(id, { title }),
    update: (stepId, patch) => store.updateStep(id, stepId, patch),
    setDone: (stepId, done) => store.setStepDone(id, stepId, done),
    remove: (stepId) => store.removeStep(id, stepId),
  };

  async function create() {
    const title = titleEl.value.replace(/\s+/g, ' ').trim();
    if (!title) {
      titleEl.focus();
      return;
    }
    const { note, assignee, priority, due, time, repeat, steps } = task;
    await store.addTask({ title: title.charAt(0).toLocaleUpperCase('cs') + title.slice(1), note, assignee, priority, due, time, repeat, steps, notify });
    navigate('ukoly');
  }
  const whoName = (value) => (!value ? 'Kdokoliv' : value === store.BOTH ? 'Oba' : value);

  // ---------- Vykreslení ----------

  function drawHead() {
    const steps = task.steps ?? [];
    if (document.activeElement !== titleEl) titleEl.value = task.title;
    grow(titleEl);
    root.classList.toggle('is-done', Boolean(task.done));
    root.querySelector('.detail-head').className = `detail-head ${whoClass(task.assignee, members)}`;

    // Malá tlačítka s nastavením: vždy všechna, ve stejném pořadí a se stejnou
    // šířkou, aby se po výběru nic neposunulo.
    const priority = task.priority ?? 2;
    const late = task.due && task.due < today() && !task.done;
    const done = steps.filter((s) => s.done).length;
    const opts = [
      `<button type="button" class="opt opt-who ${whoClass(task.assignee, members)}" data-opt="who"><span class="legend-dot"></span><span class="opt-text">${escapeHtml(whoName(task.assignee))}</span></button>`,
      `<button type="button" class="opt opt-prio" data-opt="priority" aria-label="Důležitost ${priority} ze 3"><span class="prio prio-${priority}">${priority}</span></button>`,
      `<button type="button" class="opt opt-due${late ? ' is-late' : ''}" data-opt="due"><span class="opt-text">${task.due ? escapeHtml(dueTimeLabel(task.due, task.time)) : 'Bez termínu'}</span></button>`,
      `<button type="button" class="opt opt-icon${task.repeat ? ' is-set' : ''}" data-opt="repeat" aria-label="Opakování">${ICONS.repeat}</button>`,
      `<button type="button" class="opt opt-steps${stepsOpen ? ' is-set' : ''}" data-opt="steps"><span class="opt-text">${steps.length ? `Kroky ${done}/${steps.length}` : '+ Kroky'}</span></button>`,
    ];
    // Zvonek: dát druhému vědět, že úkol přibyl. Výchozí vypnuto.
    if (draft) opts.push(`<button type="button" class="opt opt-icon opt-bell${notify ? ' is-set' : ''}" data-opt="notify" aria-pressed="${notify}" aria-label="Upozornit druhého">${ICONS.bell}</button>`);
    optsEl.innerHTML = opts.join('');

    const parts = task.doneParts ?? [];
    const state = [];
    if (task.done) state.push(`Hotovo: ${task.doneBy ?? ''} ${task.doneAt ? when(task.doneAt) : ''}`.trim());
    else if (task.assignee === store.BOTH && parts.length) state.push(`Odškrtnuto: ${parts.join(', ')}. Zbývá: ${members.filter((m) => !parts.includes(m)).join(', ')}.`);
    else if (task.repeat && task.doneAt) state.push(`Naposledy ${task.doneBy ?? ''} ${when(task.doneAt)}`.trim());
    stateEl.hidden = !state.length;
    stateEl.textContent = state.join(' ');
    root.classList.toggle('is-mine', !task.done && parts.includes(me));

    subEl.hidden = true;
  }

  // Podrobnosti: text, který se ťuknutím změní v pole. Dlouhý se sbalí.
  function drawNote() {
    if (noteEditing) return;
    if (!task.note) {
      noteBox.innerHTML = '<button type="button" class="note-add" data-action="note-edit">+ Přidat podrobnosti</button>';
      return;
    }
    noteBox.innerHTML = `<div class="note-view" data-action="note-edit" role="button" tabindex="0">${escapeHtml(task.note)}</div>
      <button type="button" class="note-more" data-action="note-toggle" hidden></button>`;
    const view = noteBox.querySelector('.note-view');
    const more = noteBox.querySelector('.note-more');
    // Tlačítko jen když se text do sbalené podoby nevejde (měří se sbalený)
    const long = view.scrollHeight > view.clientHeight + 2;
    noteOpen = noteOpen && long;
    view.classList.toggle('is-open', noteOpen);
    more.hidden = !long;
    more.textContent = noteOpen ? 'Sbalit' : 'Zobrazit celé';
  }

  function editNote() {
    noteEditing = true;
    noteBox.innerHTML = '<textarea class="input note-input" rows="3" placeholder="Co přesně, kde, s kým…" aria-label="Podrobnosti"></textarea>';
    const area = noteBox.querySelector('textarea');
    area.value = task.note ?? '';
    grow(area);
    area.focus();
    area.addEventListener('input', () => grow(area));
    area.addEventListener('blur', async () => {
      noteEditing = false;
      const text = area.value.trim() || null;
      if (text !== (task.note ?? null)) {
        task = { ...task, note: text };
        await save({ note: text });
      }
      drawNote();
    });
  }

  // Krok je v seznamu jen jako řádek s tím nezbytným (název, pro koho, termín,
  // důležitost jiná než běžná). Ťuknutím se rozbalí a jde upravit stejně jako
  // hlavní úkol, jen v menším.
  function drawSteps() {
    const steps = task.steps ?? [];
    stepsBox.hidden = !stepsOpen;
    // Rozepsaný krok se nepřekresluje
    if (stepsList.contains(document.activeElement)) return;
    stepsList.innerHTML = steps.map((step) => {
      const priority = step.priority ?? 2;
      const late = step.due && step.due < today() && !step.done;
      const head = `<button type="button" class="check-tap" data-action="step-done" aria-label="Krok hotov"><span class="check">${ICONS.check}</span></button>`;
      if (step.id !== openStep) {
        const meta = [];
        if (step.done && step.doneAt) meta.push(`${escapeHtml(step.doneBy ?? '')} ${when(step.doneAt)}`.trim());
        else if (step.due) meta.push(late ? `<span class="is-late">${escapeHtml(dueTimeLabel(step.due, step.time))}</span>` : escapeHtml(dueTimeLabel(step.due, step.time)));
        return `<li class="step ${whoClass(step.assignee, members)}${step.done ? ' is-done' : ''}" data-step="${escapeHtml(step.id)}">${head}
          <button type="button" class="step-row" data-action="step-open">
            <span class="item-text"><span class="item-name">${escapeHtml(step.title)}</span>${meta.length ? `<span class="item-sub">${meta.join(' · ')}</span>` : ''}</span>
            ${priority !== 2 && !step.done ? `<span class="prio prio-${priority}">${priority}</span>` : ''}
            ${step.assignee ? `<span class="legend-dot" title="${escapeHtml(whoName(step.assignee))}"></span>` : ''}
          </button>
        </li>`;
      }
      return `<li class="step is-open ${whoClass(step.assignee, members)}${step.done ? ' is-done' : ''}" data-step="${escapeHtml(step.id)}">${head}
        <div class="step-body">
          <input class="input step-title" name="title" value="${escapeHtml(step.title)}" aria-label="Název kroku">
          <div class="opts opts-small">
            <button type="button" class="opt opt-who ${whoClass(step.assignee, members)}" data-step-opt="who"><span class="legend-dot"></span><span class="opt-text">${escapeHtml(whoName(step.assignee))}</span></button>
            <button type="button" class="opt opt-prio" data-step-opt="priority" aria-label="Důležitost ${priority} ze 3"><span class="prio prio-${priority}">${priority}</span></button>
            <button type="button" class="opt opt-due${late ? ' is-late' : ''}" data-step-opt="due"><span class="opt-text">${step.due ? escapeHtml(dueTimeLabel(step.due, step.time)) : 'Bez termínu'}</span></button>
          </div>
          <textarea class="input step-note" name="note" rows="1" placeholder="Popis" aria-label="Popis kroku">${escapeHtml(step.note ?? '')}</textarea>
          <div class="step-meta">
            <button type="button" class="btn btn-ghost btn-danger btn-small" data-action="step-remove">Odebrat</button>
            <button type="button" class="btn btn-ghost btn-small" data-action="step-close">Hotovo</button>
          </div>
        </div>
      </li>`;
    }).join('');
    const area = stepsList.querySelector('.step-note');
    if (area) grow(area);
  }

  async function drawComments() {
    const comments = await store.listComments(id);
    if (editing && commentsEl.contains(document.activeElement)) return;
    commentsEl.innerHTML = comments.length ? comments.map((c) => {
      const edited = c.updatedAt - c.createdAt > 1000;
      const head = `<div class="comment-head">
          <span class="comment-author ${whoClass(c.author, members)}">${escapeHtml(c.author ?? '')}</span>
          <span class="comment-time">${when(c.createdAt)}${edited ? ' · upraveno' : ''}</span>
          ${c.author === me && editing !== c.id ? '<button type="button" class="btn btn-ghost btn-small" data-action="comment-edit">Upravit</button>' : ''}
        </div>`;
      const body = editing === c.id
        ? `<textarea class="input comment-input" rows="2">${escapeHtml(c.body)}</textarea>
           <div class="btn-row">
             <button type="button" class="btn btn-danger btn-small" data-action="comment-delete">Smazat</button>
             <button type="button" class="btn btn-small" data-action="comment-cancel">Zrušit</button>
             <button type="button" class="btn btn-primary btn-small" data-action="comment-save">Uložit</button>
           </div>`
        : `<p class="comment-body">${escapeHtml(c.body)}</p>`;
      return `<li class="comment" data-comment="${escapeHtml(c.id)}">${head}${body}</li>`;
    }).join('') : '<li class="comment is-empty">Zatím bez komentářů.</li>';
    const area = commentsEl.querySelector('.comment-input');
    if (area) {
      grow(area);
      area.focus();
    }
  }

  async function draw() {
    if (draft) {
      drawHead();
      drawSteps();
      drawNote();
      return;
    }
    const fresh = await store.getTask(id);
    // Úkol mezitím smazal druhý telefon (nebo já): zpět na seznam
    if (!fresh) {
      navigate('ukoly');
      return;
    }
    task = fresh;
    [me, members] = await Promise.all([store.getMe(), store.listMembers()]);
    drawHead();
    drawSteps();
    drawNote();
    await drawComments();
    // Komentáře jsou přečtené, jen když je appka opravdu na obrazovce
    if (document.visibilityState === 'visible') await store.markCommentsRead(id);
  }

  // ---------- Název ----------

  titleEl.addEventListener('input', () => grow(titleEl));
  titleEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    // U nového úkolu Enter rovnou přidá, ať jde úkol zapsat i jen názvem
    if (draft) create();
    else titleEl.blur();
  });
  titleEl.addEventListener('change', () => {
    const text = titleEl.value.replace(/\s+/g, ' ').trim();
    if (draft) task = { ...task, title: text };
    else if (text) save({ title: text });
    else titleEl.value = task.title;
  });

  // ---------- Malá tlačítka s nastavením ----------

  // Seznam voleb v nabídce u tlačítka, ťuknutí vybere a zavře
  const items = (options, current) => options
    .map(([value, name, cls = '']) => `<button type="button" class="menu-item ${cls}" data-value="${escapeHtml(value)}" aria-pressed="${value === current}">${escapeHtml(name)}</button>`)
    .join('');

  // Nabídky jsou společné pro hlavní úkol i pro kroky: dostanou současnou
  // hodnotu a funkci, která výběr uloží.

  function openWho(anchor, current, onPick) {
    const options = [['', 'Kdokoliv', 'who-any'], ...members.map((m) => [m, m, whoClass(m, members)]), [store.BOTH, 'Oba', 'who-both']];
    openMenu(anchor, (menu, close) => {
      menu.innerHTML = items(options, current ?? '');
      menu.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-value]');
        if (!btn) return;
        close();
        onPick(btn.dataset.value || null);
      });
    });
  }

  function openPriority(anchor, current, onPick) {
    openMenu(anchor, (menu, close) => {
      menu.classList.add('menu-narrow');
      menu.innerHTML = [3, 2, 1]
        .map((n) => `<button type="button" class="menu-item" data-value="${n}" aria-pressed="${n === (current ?? 2)}"><span class="prio prio-${n}">${n}</span></button>`)
        .join('');
      menu.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-value]');
        if (!btn) return;
        close();
        onPick(Number(btn.dataset.value));
      });
    });
  }

  // current = { due, time }, needsDue = bez termínu nejde být (opakovaný úkol)
  function openDue(anchor, current, needsDue, onChange) {
    const quick = [[today(), 'Dnes'], [addDays(today(), 1), 'Zítra'], [addDays(today(), 7), 'Za týden'], ['', 'Bez termínu']];
    let { due = null, time = null } = current;
    openMenu(anchor, (menu, close) => {
      menu.innerHTML = `${items(quick, due ?? '')}
        <input class="input menu-date" type="date" name="due" aria-label="Jiný den" value="${escapeHtml(due ?? '')}">
        <input class="input menu-date" type="time" name="time" aria-label="Čas" value="${escapeHtml(time ?? '')}">`;
      // Bez termínu nemá čas smysl, zmizí s ním
      const set = (value) => {
        close();
        due = value || (needsDue ? today() : null);
        onChange({ due, time: due ? time : null });
      };
      menu.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-value]');
        if (btn) set(btn.dataset.value);
      });
      menu.querySelector('[name="due"]').addEventListener('change', (e) => set(e.target.value));
      // Čas se uloží hned a nabídka zůstane, ať jde ještě vybrat den.
      // Čas bez dne znamená dnes.
      menu.querySelector('[name="time"]').addEventListener('change', (e) => {
        time = e.target.value || null;
        due = due ?? (time ? today() : null);
        onChange({ due, time });
      });
    });
  }

  function openRepeat(anchor) {
    const current = repeatValue(task.repeat);
    const repeats = REPEATS.some((r) => r.value === current) ? REPEATS : [...REPEATS, { value: current, name: repeatLabel(task.repeat) }];
    openMenu(anchor, (menu, close) => {
      let mode = task.repeat?.mode === 'after' ? 'after' : 'fixed';
      menu.innerHTML = `${items(repeats.map((r) => [r.value, r.name]), current)}
        <div class="segmented menu-seg">
          <button type="button" data-mode="fixed" aria-pressed="${mode === 'fixed'}">Od termínu</button>
          <button type="button" data-mode="after" aria-pressed="${mode === 'after'}">Od splnění</button>
        </div>`;
      menu.addEventListener('click', (e) => {
        const seg = e.target.closest('[data-mode]');
        if (seg) {
          mode = seg.dataset.mode;
          seg.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === seg));
          if (task.repeat) save({ repeat: { ...task.repeat, mode } });
          return;
        }
        const btn = e.target.closest('[data-value]');
        if (!btn) return;
        const [every, unit] = btn.dataset.value.split(':');
        const repeat = unit ? { every: Number(every), unit, mode } : null;
        close();
        save({ repeat, due: task.due ?? (repeat ? today() : null) });
      });
    });
  }

  optsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-opt]');
    const opt = btn?.dataset.opt;
    if (opt === 'who') {
      // Rozdělané odškrtnutí "za oba" nedává smysl, když už úkol pro oba není
      openWho(btn, task.assignee, (assignee) => save(assignee === store.BOTH ? { assignee } : { assignee, doneParts: [] }));
    }
    if (opt === 'priority') openPriority(btn, task.priority, (priority) => save({ priority }));
    if (opt === 'due') openDue(btn, task, Boolean(task.repeat), save);
    if (opt === 'repeat') openRepeat(btn);
    if (opt === 'notify') {
      notify = !notify;
      drawHead();
    }
    if (opt === 'steps') {
      stepsOpen = !stepsOpen;
      drawHead();
      drawSteps();
      if (stepsOpen && !(task.steps ?? []).length) root.querySelector('.step-form input').focus();
    }
  });

  // ---------- Akce ----------

  root.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'create') {
      await create();
      return;
    }
    if (action === 'done') {
      // Stejně jako kolečko v seznamu: splní celý úkol, nebo splnění vrátí
      const undo = task.done || (task.doneParts ?? []).includes(me) || (task.repeat && isSameDay(task.doneAt));
      await store.setTaskDone(id, !undo);
    }
    if (action === 'delete') {
      const removed = await store.removeTasks([id]);
      if (removed.length) undoToast(`${removed[0].title}: smazáno`, () => store.restoreTasks(removed));
      navigate('ukoly');
    }
    if (action === 'note-edit') editNote();
    if (action === 'note-toggle') {
      noteOpen = !noteOpen;
      drawNote();
    }

    const stepEl = e.target.closest('[data-step]');
    if (stepEl) {
      const stepId = stepEl.dataset.step;
      // Bez fokusu v seznamu kroků, jinak by se po změně nepřekreslil
      document.activeElement?.blur();
      if (action === 'step-done') await stepsApi.setDone(stepId, !stepEl.classList.contains('is-done'));
      if (action === 'step-remove') await stepsApi.remove(stepId);
      if (action === 'step-open' || action === 'step-close') {
        openStep = action === 'step-open' ? stepId : null;
        drawSteps();
      }
    }

    const commentEl = e.target.closest('[data-comment]');
    if (commentEl) {
      const commentId = commentEl.dataset.comment;
      if (action === 'comment-edit') editing = commentId;
      if (action === 'comment-cancel') editing = null;
      if (action === 'comment-save') {
        const text = commentEl.querySelector('.comment-input').value;
        editing = null;
        if (text.trim()) await store.updateComment(commentId, text);
      }
      if (action === 'comment-delete') {
        editing = null;
        const removed = await store.removeComments([commentId]);
        if (removed.length) undoToast('Komentář smazán', () => store.restoreComments(removed));
      }
      document.activeElement?.blur();
      await drawComments();
    }
  });

  // Název a popis kroku se ukládají po opuštění pole
  stepsList.addEventListener('change', (e) => {
    const stepId = e.target.closest('[data-step]')?.dataset.step;
    if (!stepId) return;
    if (e.target.name === 'title') {
      const text = e.target.value.trim();
      if (text) stepsApi.update(stepId, { title: text });
    }
    if (e.target.name === 'note') stepsApi.update(stepId, { note: e.target.value.trim() || null });
  });
  stepsList.addEventListener('input', (e) => {
    if (e.target.name === 'note') grow(e.target);
  });

  // Malá tlačítka u rozbaleného kroku: stejné nabídky jako u hlavního úkolu
  stepsList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-step-opt]');
    if (!btn) return;
    const stepId = btn.closest('[data-step]').dataset.step;
    const step = (task.steps ?? []).find((s) => s.id === stepId);
    if (!step) return;
    const opt = btn.dataset.stepOpt;
    btn.blur();
    if (opt === 'who') openWho(btn, step.assignee, (assignee) => stepsApi.update(stepId, { assignee }));
    if (opt === 'priority') openPriority(btn, step.priority, (priority) => stepsApi.update(stepId, { priority }));
    if (opt === 'due') openDue(btn, step, false, (patch) => stepsApi.update(stepId, patch));
  });
  stepsList.addEventListener('focusout', () => setTimeout(drawSteps, 0));

  root.querySelector('.step-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.target.elements.title;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    // Nový krok zůstane sbalený, další jde psát hned
    document.activeElement?.blur();
    await stepsApi.add(text);
    input.focus();
  });

  root.querySelector('.comment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.target.elements.body;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    // Zvonek platí jen pro jeden komentář, pak se zase vypne
    const bell = e.target.querySelector('.notify-btn');
    const notifyOther = bell.getAttribute('aria-pressed') === 'true';
    bell.setAttribute('aria-pressed', 'false');
    await store.addComment(id, text, { notify: notifyOther });
  });

  // Zvonek nesmí vzít fokus poli, jinak by se na iPhonu zavřela klávesnice
  const commentBell = root.querySelector('.comment-form .notify-btn');
  commentBell?.addEventListener('pointerdown', (e) => e.preventDefault());
  commentBell?.addEventListener('click', () => {
    commentBell.setAttribute('aria-pressed', commentBell.getAttribute('aria-pressed') !== 'true');
  });

  // ---------- Start ----------

  await draw();
  if (draft) {
    titleEl.focus();
    return undefined;
  }
  const unsubscribe = store.subscribe(draw);
  const onVisible = () => { if (document.visibilityState === 'visible') draw(); };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisible);
  };
}
