// Stránka jednoho úkolu (#/ukoly/<id>). Odshora: název, řada malých tlačítek
// s nastavením (pro koho, důležitost, termín, opakování, kroky), podrobnosti
// (dlouhé se sbalí) a hlavně komentáře.
// Změny se ukládají samy. Kroky jsou schválně schované, většina úkolů je nemá.
//
// Stejná stránka slouží i k založení úkolu (#/ukoly/novy): všechno se nastaví
// předem a úkol vznikne až tlačítkem Přidat. Do té doby je jen v paměti (draft).

import * as store from '../store.js';
import { escapeHtml, ICONS, undoToast, openMenu, dragSort, holdKeyboard, whoClass } from '../ui.js';
import { navigate } from '../router.js';
import { today, dayStr, addDays, dueLabel, dueTimeLabel, timeLabel, isSameDay } from '../dates.js';
import { REPEATS, repeatValue, repeatLabel } from './tasks.js';

export const NEW = 'novy';

// "dnes 14:02", "včera 9:10", "po 5. 10. 14:02"
const when = (timestamp) => `${dueLabel(dayStr(new Date(timestamp)))} ${timeLabel(timestamp)}`;

export async function renderTask(el, id, { subEl }) {
  const root = document.createElement('div');
  root.className = 'detail';
  el.append(root);

  const draft = id === NEW;
  let task = draft
    ? { title: '', note: null, assignee: null, priority: 2, due: null, time: null, repeat: null, steps: [], doneParts: [], done: false, privateTo: null }
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
  // Seznam kroků je rozbalený vždy, když úkol nějaké má. Když ho člověk sám
  // zabalí (nebo nechá rozbalený konkrétní krok), telefon si to u úkolu pamatuje.
  const viewState = draft ? {} : (await store.getMeta('taskView', {}))[id] ?? {};
  let stepsOpen = viewState.steps ?? (task.steps ?? []).length > 0;
  let openStep = (task.steps ?? []).some((s) => s.id === viewState.step) ? viewState.step : null; // id kroku rozbaleného k úpravě
  const remember = async () => {
    if (draft) return;
    const all = await store.getMeta('taskView', {});
    all[id] = { steps: stepsOpen, step: openStep };
    await store.setLocal('taskView', all);
  };
  let renameStep = null; // id kroku, kterému se právě přepisuje název
  let moving = false; // úkol se právě přesouvá do jiného úkolu
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
      <button type="button" class="btn btn-ghost btn-small step-add" data-action="step-add">${ICONS.plus} Krok</button>
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

    <div class="detail-foot">
      <button type="button" class="btn btn-ghost btn-danger btn-small" data-action="delete">Smazat úkol</button>
      <button type="button" class="btn btn-ghost btn-small" data-action="move">Přesunout do úkolu</button>
    </div>`}`;

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
  // Změna termínu krok zařadí podle data, jinak pořadí určuje ruční posouvání.
  const draftSteps = (steps) => save({ steps });
  const stepsApi = draft ? {
    add: (stepId) => draftSteps([...task.steps, { id: stepId, title: '', note: null, assignee: null, priority: 2, due: null, time: null, done: false, doneAt: null, doneBy: null }]),
    update: (stepId, patch) => {
      const steps = task.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s));
      return draftSteps('due' in patch || 'time' in patch ? store.sortStepsByDue(steps) : steps);
    },
    setDone: (stepId, done) => draftSteps(task.steps.map((s) => (s.id === stepId ? { ...s, done } : s))),
    remove: (stepId) => draftSteps(task.steps.filter((s) => s.id !== stepId)),
    reorder: (ids) => draftSteps(store.orderSteps(task.steps, ids)),
  } : {
    add: (stepId) => store.addStep(id, { id: stepId }),
    update: (stepId, patch) => store.updateStep(id, stepId, patch),
    setDone: (stepId, done) => store.setStepDone(id, stepId, done),
    remove: (stepId) => store.removeStep(id, stepId),
    reorder: (ids) => store.reorderSteps(id, ids),
  };

  async function create() {
    const title = titleEl.value.replace(/\s+/g, ' ').trim();
    if (!title) {
      titleEl.focus();
      return;
    }
    const { note, assignee, priority, due, time, repeat, steps } = task;
    await store.addTask({
      title: title.charAt(0).toLocaleUpperCase('cs') + title.slice(1), note, assignee, priority, due, time, repeat, steps, notify,
      isPrivate: Boolean(task.privateTo),
    });
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
    // Zámek: soukromý úkol, který druhý neuvidí (dárky apod.)
    opts.push(`<button type="button" class="opt opt-icon opt-lock${task.privateTo ? ' is-set' : ''}" data-opt="private" aria-pressed="${Boolean(task.privateTo)}" aria-label="Soukromý úkol">${ICONS.lock}</button>`);
    // Zvonek: dát druhému vědět, že úkol přibyl. Výchozí vypnuto.
    // U soukromého úkolu nedává smysl.
    if (draft) opts.push(`<button type="button" class="opt opt-icon opt-bell${notify && !task.privateTo ? ' is-set' : ''}" data-opt="notify" aria-pressed="${notify && !task.privateTo}" aria-label="Upozornit druhého"${task.privateTo ? ' disabled' : ''}>${ICONS.bell}</button>`);
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
      const open = step.id === openStep;
      const meta = [];
      if (step.done && step.doneAt) meta.push(`${escapeHtml(step.doneBy ?? '')} ${when(step.doneAt)}`.trim());
      else if (step.due && !open) meta.push(late ? `<span class="is-late">${escapeHtml(dueTimeLabel(step.due, step.time))}</span>` : escapeHtml(dueTimeLabel(step.due, step.time)));
      // Řádek kroku: ťuknutí rozbalí a zase sbalí, podržení ho přetáhne jinam
      const headline = `<button type="button" class="step-row" data-action="step-toggle" aria-expanded="${open}">
          <span class="item-text"><span class="item-name${step.title ? '' : ' is-blank'}">${escapeHtml(step.title || 'Krok')}</span>${meta.length ? `<span class="item-sub">${meta.join(' · ')}</span>` : ''}</span>
          ${priority !== 2 && !step.done && !open ? `<span class="prio prio-${priority}">${priority}</span>` : ''}
          ${step.assignee && !open ? `<span class="legend-dot" title="${escapeHtml(whoName(step.assignee))}"></span>` : ''}
        </button>`;
      const check = `<button type="button" class="check-tap" data-action="step-done" aria-label="Krok hotov"><span class="check">${ICONS.check}</span></button>`;
      const cls = `step ${whoClass(step.assignee, members)}${step.done ? ' is-done' : ''}`;
      if (!open) return `<li class="${cls}" data-step="${escapeHtml(step.id)}">${check}${headline}</li>`;

      // Název se přepisuje jen po ťuknutí na tužku, jinak by ťuknutí na něj
      // krok nesbalilo
      const top = step.id === renameStep
        ? `<input class="input step-title" name="title" value="${escapeHtml(step.title)}" placeholder="Krok" aria-label="Název kroku" enterkeyhint="done">`
        : `<div class="step-headline">${headline}
            <button type="button" class="icon-btn" data-action="step-rename" aria-label="Přejmenovat">${ICONS.edit}</button>
          </div>`;
      return `<li class="${cls} is-open" data-step="${escapeHtml(step.id)}">${check}
        <div class="step-body">
          ${top}
          <div class="opts opts-small">
            <button type="button" class="opt opt-who ${whoClass(step.assignee, members)}" data-step-opt="who"><span class="legend-dot"></span><span class="opt-text">${escapeHtml(whoName(step.assignee))}</span></button>
            <button type="button" class="opt opt-prio" data-step-opt="priority" aria-label="Důležitost ${priority} ze 3"><span class="prio prio-${priority}">${priority}</span></button>
            <button type="button" class="opt opt-due${late ? ' is-late' : ''}" data-step-opt="due"><span class="opt-text">${step.due ? escapeHtml(dueTimeLabel(step.due, step.time)) : 'Bez termínu'}</span></button>
          </div>
          <textarea class="input step-note" name="note" rows="1" placeholder="Popis" aria-label="Popis kroku">${escapeHtml(step.note ?? '')}</textarea>
          <button type="button" class="btn btn-ghost btn-danger btn-small step-remove" data-action="step-remove">Odebrat</button>
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
    // Úkol mezitím smazal druhý telefon (nebo já): zpět na seznam.
    // Při přesunu do jiného úkolu se jde rovnou tam.
    if (!fresh) {
      if (!moving) navigate('ukoly');
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
    let { due = null } = current;
    const { time = null } = current;
    // Jiný den než z rychlých voleb se ukáže přímo v řádku Vybrat
    const custom = () => (due && !quick.some(([value]) => value === due) ? dueLabel(due) : '');
    openMenu(anchor, (menu, close) => {
      // Řádek Vybrat má přes sebe neviditelné pole s datem, takže ťuknutí
      // na něj otevře kalendář telefonu
      menu.innerHTML = `${items(quick, due ?? '')}
        <label class="menu-item menu-pick" aria-pressed="${Boolean(custom())}">
          <span>Vybrat</span><span class="menu-pick-value">${escapeHtml(custom())}</span>
          <input type="date" name="due" aria-label="Vybrat den" value="${escapeHtml(due ?? '')}">
        </label>`;
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
      // Den z kalendáře se uloží hned a nabídka zůstává otevřená: iPhone hlásí
      // změnu už při otevření kalendáře, takže zavření na první změnu by ho
      // zavřelo dřív, než jde den vybrat. Zavře se ťuknutím vedle.
      menu.querySelector('[name="due"]').addEventListener('change', (e) => {
        due = e.target.value || (needsDue ? today() : null);
        menu.querySelectorAll('[data-value]').forEach((item) => item.setAttribute('aria-pressed', item.dataset.value === (due ?? '')));
        menu.querySelector('.menu-pick').setAttribute('aria-pressed', Boolean(custom()));
        menu.querySelector('.menu-pick-value').textContent = custom();
        onChange({ due, time: due ? time : null });
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
    if (opt === 'private') {
      // U nového úkolu jen příznak, skutečné id uživatele doplní datová vrstva
      if (draft) save({ privateTo: task.privateTo ? null : 'me' });
      else store.setTaskPrivate(id, !task.privateTo);
    }
    if (opt === 'notify') {
      notify = !notify;
      drawHead();
    }
    if (opt === 'steps') {
      stepsOpen = !stepsOpen;
      remember();
      drawHead();
      drawSteps();
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
    if (action === 'move') {
      // Výběr úkolu, do kterého tenhle přejde jako krok
      const others = (await store.listTasks()).filter((t) => t.id !== id && !t.done);
      openMenu(e.target.closest('button'), (menu, close) => {
        menu.innerHTML = others.length
          ? others.map((t) => `<button type="button" class="menu-item ${whoClass(t.assignee, members)}" data-value="${escapeHtml(t.id)}">${escapeHtml(t.title)}</button>`).join('')
          : '<p class="hint-pop">Žádný další úkol</p>';
        menu.addEventListener('click', async (ev) => {
          const btn = ev.target.closest('[data-value]');
          if (!btn) return;
          close();
          moving = true;
          const moved = await store.moveTaskIntoTask(id, btn.dataset.value);
          if (!moved) {
            moving = false;
            return;
          }
          undoToast(`${moved.source.title}: přesunuto`, () => store.undoMoveTask(moved));
          navigate(`ukoly/${moved.target}`);
        });
      });
      return;
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
      if (action === 'step-toggle') {
        // Ťuknutí na krok ho rozbalí, další ťuknutí zase sbalí
        const reopen = openStep !== stepId;
        await closeStep();
        openStep = reopen ? stepId : null;
        remember();
        drawSteps();
      }
      if (action === 'step-rename') {
        renameStep = stepId;
        drawSteps();
        const field = stepsList.querySelector('.step-title');
        field?.focus();
        field?.select();
      }
    }
    if (action === 'step-add') {
      // Nový krok se rovnou rozbalí, název i podrobnosti jdou vyplnit hned
      document.activeElement?.blur();
      holdKeyboard();
      await closeStep();
      const stepId = store.newId();
      openStep = stepId;
      renameStep = stepId;
      remember();
      await stepsApi.add(stepId);
      drawSteps();
      stepsList.querySelector('.step.is-open .step-title')?.focus();
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

  // Zavírá rozbalený krok. Krok, který zůstal bez názvu i čehokoliv dalšího,
  // se zahodí (ťuknutí na + Krok omylem).
  async function closeStep() {
    const step = (task.steps ?? []).find((s) => s.id === openStep);
    const typed = stepsList.querySelector('.step.is-open .step-title')?.value.trim();
    openStep = null;
    renameStep = null;
    if (step && !step.title && !typed && !step.note && !step.due && !step.assignee) await stepsApi.remove(step.id);
  }

  // Název a popis kroku se ukládají po opuštění pole
  stepsList.addEventListener('change', (e) => {
    const stepId = e.target.closest('[data-step]')?.dataset.step;
    if (!stepId) return;
    if (e.target.name === 'title') stepsApi.update(stepId, { title: e.target.value.trim() });
    if (e.target.name === 'note') stepsApi.update(stepId, { note: e.target.value.trim() || null });
  });
  stepsList.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.name === 'title') {
      e.preventDefault();
      e.target.blur();
    }
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
  stepsList.addEventListener('focusout', (e) => {
    // Po opuštění názvu se krok vrátí do běžné podoby (název jako text)
    if (e.target.name === 'title') renameStep = null;
    setTimeout(drawSteps, 0);
  });

  // Pořadí kroků: podržet a přetáhnout
  const endSort = dragSort(stepsList, {
    item: '.step',
    handle: '.step-row',
    attr: 'data-step',
    onDrop: (ids) => {
      // Bez fokusu v seznamu, jinak by se po uložení nepřekreslil
      document.activeElement?.blur();
      stepsApi.reorder(ids);
    },
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
    return endSort;
  }
  const unsubscribe = store.subscribe(draw);
  const onVisible = () => { if (document.visibilityState === 'visible') draw(); };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    unsubscribe();
    endSort();
    document.removeEventListener('visibilitychange', onVisible);
  };
}
