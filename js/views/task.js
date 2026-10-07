// Stránka jednoho úkolu (#/ukoly/<id>): název, podrobnosti, pro koho,
// důležitost, termín, opakování, kroky a komentáře.
// Změny se ukládají samy, hned jak pole opustíte nebo na volbu ťuknete.
// Kroky jsou schválně schované, většina úkolů má jen jeden.

import * as store from '../store.js';
import { escapeHtml, ICONS, undoToast, whoClass, wireSegmented } from '../ui.js';
import { navigate } from '../router.js';
import { today, dayStr, addDays, dueLabel, timeLabel, isSameDay } from '../dates.js';
import { REPEATS, repeatValue, repeatLabel } from './tasks.js';

// "dnes 14:02", "včera 9:10", "po 5. 10. 14:02"
const when = (timestamp) => `${dueLabel(dayStr(new Date(timestamp)))} ${timeLabel(timestamp)}`;

export async function renderTask(el, id, { subEl }) {
  const root = document.createElement('div');
  root.className = 'detail';
  el.append(root);

  let task = await store.getTask(id);
  if (!task) {
    root.innerHTML = `<a class="back-link" href="#/ukoly">${ICONS.back} Úkoly</a>
      <div class="empty"><p class="empty-title">Úkol už neexistuje</p><p>Někdo ho nejspíš smazal.</p></div>`;
    return undefined;
  }

  let me = await store.getMe();
  let members = await store.listMembers();
  let editing = null; // id komentáře, který se právě upravuje
  let stepsOpen = (task.steps ?? []).length > 0;

  const who = [['', 'Kdokoliv'], ...members.map((m) => [m, m]), [store.BOTH, 'Oba']];
  const current = repeatValue(task.repeat);
  const repeats = REPEATS.some((r) => r.value === current) ? REPEATS : [...REPEATS, { value: current, name: repeatLabel(task.repeat) }];

  root.innerHTML = `
    <a class="back-link" href="#/ukoly">${ICONS.back} Úkoly</a>
    <form class="detail-form" autocomplete="off">
      <div class="detail-head">
        <button type="button" class="check-tap" data-action="done" aria-label="Hotovo"><span class="check">${ICONS.check}</span></button>
        <textarea class="input detail-title" name="title" rows="1" aria-label="Název" required></textarea>
      </div>
      <p class="detail-state card-meta" hidden></p>
      <label class="field"><span>Podrobnosti</span>
        <textarea class="input" name="note" rows="3" placeholder="Co přesně, kde, s kým…"></textarea></label>
      <div class="field"><span>Pro koho</span>
        <div class="segmented" data-name="assignee">
          ${who.map(([value, name]) => `<button type="button" class="${value ? whoClass(value, members) : ''}" data-value="${escapeHtml(value)}">${escapeHtml(name)}</button>`).join('')}
        </div></div>
      <div class="field"><span>Důležitost</span>
        <div class="segmented" data-name="priority">
          ${[1, 2, 3].map((n) => `<button type="button" data-value="${n}"><span class="prio prio-${n}">${n}</span></button>`).join('')}
        </div></div>
      <div data-due-block>
        <label class="field"><span>Termín</span>
          <input class="input" type="date" name="due"></label>
        <div class="quick-row">
          <button type="button" class="chip-btn" data-due="${today()}">Dnes</button>
          <button type="button" class="chip-btn" data-due="${addDays(today(), 1)}">Zítra</button>
          <button type="button" class="chip-btn" data-due="${addDays(today(), 7)}">Za týden</button>
          <button type="button" class="chip-btn" data-due="">Bez termínu</button>
        </div>
      </div>
      <div data-repeat-block>
        <label class="field"><span>Opakování</span>
          <select class="input" name="repeat">
            ${repeats.map((r) => `<option value="${r.value}">${escapeHtml(r.name)}</option>`).join('')}
          </select></label>
        <div class="field" data-repeat-only><span>Další termín počítat</span>
          <div class="segmented" data-name="mode">
            <button type="button" data-value="fixed">Od termínu</button>
            <button type="button" data-value="after">Od splnění</button>
          </div></div>
      </div>
    </form>

    <details class="steps-box">
      <summary>Rozdělit na kroky <span class="steps-count"></span></summary>
      <p class="field-hint" style="margin: 0 0 8px">Kroky jdou po sobě a každý může mít svůj termín. V seznamu je vidět vždy ten, který je zrovna na řadě.</p>
      <ul class="steps-list"></ul>
      <form class="add-form step-form" autocomplete="off">
        <input class="input" name="title" placeholder="Přidat krok…" aria-label="Přidat krok" enterkeyhint="done">
        <button class="add-btn" type="submit" aria-label="Přidat krok">${ICONS.plus}</button>
      </form>
    </details>

    <p class="section-label">Komentáře</p>
    <ul class="comments"></ul>
    <form class="add-form comment-form" autocomplete="off">
      <input class="input" name="body" placeholder="Napsat komentář…" aria-label="Napsat komentář" enterkeyhint="send" autocapitalize="sentences">
      <button class="add-btn" type="submit" aria-label="Odeslat">${ICONS.send}</button>
    </form>

    <button type="button" class="btn btn-danger btn-block detail-delete" data-action="delete">Smazat úkol</button>`;

  const form = root.querySelector('.detail-form');
  const picked = wireSegmented(form);
  const stateEl = root.querySelector('.detail-state');
  const stepsBox = root.querySelector('.steps-box');
  const stepsList = root.querySelector('.steps-list');
  const commentsEl = root.querySelector('.comments');
  stepsBox.open = stepsOpen;

  const setPressed = (name, value) => form.querySelectorAll(`[data-name="${name}"] button`)
    .forEach((b) => b.setAttribute('aria-pressed', b.dataset.value === String(value ?? '')));
  // Pole, do kterého se zrovna píše, se nepřepisuje
  const setValue = (field, value) => { if (document.activeElement !== field) field.value = value ?? ''; };
  const grow = (area) => { area.style.height = 'auto'; area.style.height = `${area.scrollHeight + 2}px`; };

  // ---------- Vykreslení ----------

  function drawFields() {
    const steps = task.steps ?? [];
    setValue(form.elements.title, task.title);
    setValue(form.elements.note, task.note);
    setValue(form.elements.due, task.due);
    setValue(form.elements.repeat, repeatValue(task.repeat));
    setPressed('assignee', task.assignee ?? '');
    setPressed('priority', task.priority ?? 2);
    setPressed('mode', task.repeat?.mode === 'after' ? 'after' : 'fixed');
    grow(form.elements.title);
    form.querySelector('[data-repeat-only]').hidden = !task.repeat;
    // Úkol s kroky má termín z kroků a neopakuje se, opakovaný zase nemá kroky
    form.querySelector('[data-due-block]').hidden = steps.length > 0;
    form.querySelector('[data-repeat-block]').hidden = steps.length > 0;
    stepsBox.hidden = Boolean(task.repeat);

    root.classList.toggle('is-done', Boolean(task.done));
    root.querySelector('.detail-head').className = `detail-head ${whoClass(task.assignee, members)}`;
    const parts = task.doneParts ?? [];
    const state = [];
    if (task.done) state.push(`Hotovo: ${task.doneBy ?? ''} ${task.doneAt ? when(task.doneAt) : ''}`.trim());
    else if (task.assignee === store.BOTH && parts.length) state.push(`Odškrtnuto: ${parts.join(', ')}. Zbývá: ${members.filter((m) => !parts.includes(m)).join(', ')}.`);
    else if (task.repeat && task.doneAt) state.push(`Naposledy ${task.doneBy ?? ''} ${when(task.doneAt)}, další ${task.due ? dueLabel(task.due) : ''}`.trim());
    stateEl.hidden = !state.length;
    stateEl.textContent = state.join(' ');
    root.classList.toggle('is-mine', !task.done && parts.includes(me));

    subEl.hidden = !task.due || task.done;
    subEl.textContent = task.due ? `Termín ${dueLabel(task.due)}` : '';
  }

  function drawSteps() {
    const steps = task.steps ?? [];
    root.querySelector('.steps-count').textContent = steps.length ? `(${steps.filter((s) => s.done).length}/${steps.length})` : '';
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
    const fresh = await store.getTask(id);
    // Úkol mezitím smazal druhý telefon (nebo já): zpět na seznam
    if (!fresh) {
      navigate('ukoly');
      return;
    }
    task = fresh;
    [me, members] = await Promise.all([store.getMe(), store.listMembers()]);
    drawFields();
    drawSteps();
    await drawComments();
  }

  // ---------- Ukládání polí ----------

  const save = (patch) => store.updateTask(id, patch);

  form.addEventListener('submit', (e) => e.preventDefault());
  form.elements.title.addEventListener('input', () => grow(form.elements.title));
  form.elements.title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }
  });

  form.addEventListener('change', (e) => {
    const { name, value } = e.target;
    if (name === 'title') {
      const text = value.replace(/\s+/g, ' ').trim();
      if (text) save({ title: text });
      else e.target.value = task.title;
    }
    if (name === 'note') save({ note: value.trim() || null });
    if (name === 'due') save({ due: value || (task.repeat ? today() : null) });
    if (name === 'repeat') {
      const [every, unit] = value.split(':');
      const repeat = unit ? { every: Number(every), unit, mode: picked('mode') || 'fixed' } : null;
      // Opakovaný úkol potřebuje termín, od kterého se počítá
      save({ repeat, due: task.due ?? (repeat ? today() : null) });
    }
  });

  form.addEventListener('click', (e) => {
    const quick = e.target.closest('[data-due]');
    if (quick) {
      save({ due: quick.dataset.due || (task.repeat ? today() : null) });
      return;
    }
    const seg = e.target.closest('.segmented button');
    if (!seg) return;
    const name = seg.parentElement.dataset.name;
    if (name === 'assignee') {
      const assignee = seg.dataset.value || null;
      // Rozdělané odškrtnutí "za oba" nedává smysl, když už úkol pro oba není
      save(assignee === store.BOTH ? { assignee } : { assignee, doneParts: [] });
    }
    if (name === 'priority') save({ priority: Number(seg.dataset.value) || 2 });
    if (name === 'mode' && task.repeat) save({ repeat: { ...task.repeat, mode: seg.dataset.value } });
  });

  // ---------- Akce ----------

  root.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

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

    const stepEl = e.target.closest('[data-step]');
    if (stepEl) {
      const stepId = stepEl.dataset.step;
      // Bez fokusu v seznamu kroků, jinak by se po změně nepřekreslil
      document.activeElement?.blur();
      if (action === 'step-done') await store.setStepDone(id, stepId, !stepEl.classList.contains('is-done'));
      if (action === 'step-remove') await store.removeStep(id, stepId);
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

  stepsBox.addEventListener('toggle', () => { stepsOpen = stepsBox.open; });

  // Název a termín kroku se ukládají po opuštění pole
  stepsList.addEventListener('change', (e) => {
    const stepId = e.target.closest('[data-step]')?.dataset.step;
    if (!stepId) return;
    if (e.target.name === 'title') {
      const text = e.target.value.trim();
      if (text) store.updateStep(id, stepId, { title: text });
    }
    if (e.target.name === 'due') store.updateStep(id, stepId, { due: e.target.value || null });
  });
  stepsList.addEventListener('focusout', () => setTimeout(drawSteps, 0));

  root.querySelector('.step-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.target.elements.title;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await store.addStep(id, { title: text });
  });

  root.querySelector('.comment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.target.elements.body;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await store.addComment(id, text);
  });

  // ---------- Start ----------

  await draw();
  return store.subscribe(draw);
}
