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
import { today, dayStr, addDays, dueLabel, timeLabel, isSameDay } from '../dates.js';
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
    ? { title: '', note: null, assignee: null, priority: 2, due: defaultDue(), repeat: null, steps: [], doneParts: [], done: false }
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
  let noteOpen = false; // dlouhé podrobnosti rozbalené
  let noteEditing = false;

  root.innerHTML = `
    <a class="back-link" href="#/ukoly">${ICONS.back} Úkoly</a>
    <div class="detail-head">
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

  // Kroky: u nového úkolu v paměti, u existujícího přes datovou vrstvu.
  // Termín úkolu se řídí prvním nesplněným krokem.
  const draftSteps = (steps) => save({ steps, ...(steps.length ? { due: steps.find((s) => !s.done)?.due ?? null } : {}) });
  const stepsApi = draft ? {
    add: (title) => draftSteps([...task.steps, { id: store.newId(), title, due: task.steps.length ? null : task.due ?? null, done: false, doneAt: null, doneBy: null }]),
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
    const { note, assignee, priority, due, repeat, steps } = task;
    await store.addTask({ title: title.charAt(0).toLocaleUpperCase('cs') + title.slice(1), note, assignee, priority, due, repeat, steps, notify });
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

    // Malá tlačítka s nastavením. Úkol s kroky má termín z kroků a neopakuje
    // se, opakovaný zase nemá kroky.
    const priority = task.priority ?? 2;
    const late = task.due && task.due < today() && !task.done;
    const opts = [
      `<button type="button" class="opt ${whoClass(task.assignee, members)}" data-opt="who"><span class="legend-dot"></span>${escapeHtml(whoName(task.assignee))}</button>`,
      `<button type="button" class="opt" data-opt="priority" aria-label="Důležitost ${priority} ze 3"><span class="prio prio-${priority}">${priority}</span></button>`,
    ];
    if (!steps.length) {
      opts.push(`<button type="button" class="opt${late ? ' is-late' : ''}" data-opt="due">${task.due ? escapeHtml(dueLabel(task.due)) : 'Bez termínu'}</button>`);
      opts.push(`<button type="button" class="opt${task.repeat ? ' is-set' : ''}" data-opt="repeat">${ICONS.repeat}${task.repeat ? escapeHtml(repeatLabel(task.repeat)) : ''}</button>`);
    } else if (task.due) {
      opts.push(`<span class="opt is-static${late ? ' is-late' : ''}">${escapeHtml(dueLabel(task.due))}</span>`);
    }
    if (!task.repeat) {
      const done = steps.filter((s) => s.done).length;
      opts.push(`<button type="button" class="opt${stepsOpen ? ' is-set' : ''}" data-opt="steps">${steps.length ? `Kroky ${done}/${steps.length}` : '+ Kroky'}</button>`);
    }
    // Zvonek: dát druhému vědět, že úkol přibyl. Výchozí vypnuto.
    if (draft) opts.push(`<button type="button" class="opt opt-bell${notify ? ' is-set' : ''}" data-opt="notify" aria-pressed="${notify}" aria-label="Upozornit druhého">${ICONS.bell}</button>`);
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

  function drawSteps() {
    const steps = task.steps ?? [];
    stepsBox.hidden = !stepsOpen || Boolean(task.repeat);
    // Rozepsaný krok se nepřekresluje
    if (stepsList.contains(document.activeElement)) return;
    const currentStep = steps.find((s) => !s.done);
    stepsList.innerHTML = steps.map((step, i) => `<li class="step${step.done ? ' is-done' : ''}${step === currentStep ? ' is-current' : ''}" data-step="${escapeHtml(step.id)}">
        <button type="button" class="check-tap" data-action="step-done" aria-label="Krok hotov"><span class="check">${ICONS.check}</span></button>
        <div class="step-body">
          <input class="input step-title" name="title" value="${escapeHtml(step.title)}" aria-label="Krok ${i + 1}">
          <div class="step-meta">
            ${step.done
    ? `<span class="card-meta small">${escapeHtml(step.doneBy ?? '')} ${step.doneAt ? when(step.doneAt) : ''}</span>`
    : `<label class="card-meta small">do <input class="input step-due" type="date" name="due" value="${escapeHtml(step.due ?? '')}"></label>`}
            <button type="button" class="btn btn-ghost btn-small" data-action="step-remove">Odebrat</button>
          </div>
        </div>
      </li>`).join('');
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

  function openWho(anchor) {
    const options = [['', 'Kdokoliv', 'who-any'], ...members.map((m) => [m, m, whoClass(m, members)]), [store.BOTH, 'Oba', 'who-both']];
    openMenu(anchor, (menu, close) => {
      menu.innerHTML = items(options, task.assignee ?? '');
      menu.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-value]');
        if (!btn) return;
        close();
        const assignee = btn.dataset.value || null;
        // Rozdělané odškrtnutí "za oba" nedává smysl, když už úkol pro oba není
        save(assignee === store.BOTH ? { assignee } : { assignee, doneParts: [] });
      });
    });
  }

  function openPriority(anchor) {
    openMenu(anchor, (menu, close) => {
      menu.classList.add('menu-narrow');
      menu.innerHTML = [3, 2, 1]
        .map((n) => `<button type="button" class="menu-item" data-value="${n}" aria-pressed="${n === (task.priority ?? 2)}"><span class="prio prio-${n}">${n}</span></button>`)
        .join('');
      menu.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-value]');
        if (!btn) return;
        close();
        save({ priority: Number(btn.dataset.value) });
      });
    });
  }

  function openDue(anchor) {
    const quick = [[today(), 'Dnes'], [addDays(today(), 1), 'Zítra'], [addDays(today(), 7), 'Za týden'], ['', 'Bez termínu']];
    openMenu(anchor, (menu, close) => {
      menu.innerHTML = `${items(quick, task.due ?? '')}
        <input class="input menu-date" type="date" aria-label="Jiný den" value="${escapeHtml(task.due ?? '')}">`;
      // Opakovaný úkol potřebuje termín, od kterého se počítá
      const set = (value) => {
        close();
        save({ due: value || (task.repeat ? today() : null) });
      };
      menu.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-value]');
        if (btn) set(btn.dataset.value);
      });
      menu.querySelector('input').addEventListener('change', (e) => set(e.target.value));
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
    if (opt === 'who') openWho(btn);
    if (opt === 'priority') openPriority(btn);
    if (opt === 'due') openDue(btn);
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

  // Název a termín kroku se ukládají po opuštění pole
  stepsList.addEventListener('change', (e) => {
    const stepId = e.target.closest('[data-step]')?.dataset.step;
    if (!stepId) return;
    if (e.target.name === 'title') {
      const text = e.target.value.trim();
      if (text) stepsApi.update(stepId, { title: text });
    }
    if (e.target.name === 'due') stepsApi.update(stepId, { due: e.target.value || null });
  });
  stepsList.addEventListener('focusout', () => setTimeout(drawSteps, 0));

  root.querySelector('.step-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.target.elements.title;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await stepsApi.add(text);
  });

  root.querySelector('.comment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.target.elements.body;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await store.addComment(id, text);
  });

  // ---------- Start ----------

  await draw();
  if (draft) {
    titleEl.focus();
    return undefined;
  }
  return store.subscribe(draw);
}
