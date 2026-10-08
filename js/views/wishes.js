// Wishlist a bucketlist (#/wishlist, #/bucketlist, otevírají se z Více).
// Dva seznamy se stejným rozhraním: položka má název, pro koho je, orientační
// "do kdy" (ne termín, jen do kolika let) a podrobnosti.
// Ovládání je stejné jako u úkolů: kolečko = splněno, ťuknutí na řádek =
// stránka položky, potažení doleva = smazat, + = nová položka na vlastní stránce.

import * as store from '../store.js';
import { escapeHtml, ICONS, undoToast, rowGestures, openMenu, holdKeyboard, whoClass } from '../ui.js';
import { navigate } from '../router.js';

const NEW = 'novy';

// Orientační horizont: kolik let od teď. Ukládá se cílový rok, aby "do 2 let"
// za rok samo ukazovalo "do roka".
const HORIZONS = [[1, 'Do roka'], [2, 'Do 2 let'], [3, 'Do 3 let'], [5, 'Do 5 let'], [10, 'Do 10 let'], [0, 'Někdy']];
const thisYear = () => new Date().getFullYear();

function horizonLabel(untilYear) {
  if (!untilYear) return 'Někdy';
  const years = untilYear - thisYear();
  if (years <= 0) return 'Letos';
  if (years === 1) return 'Do roka';
  return `Do ${years} let`;
}

const whoName = (value) => (!value ? 'Kdokoliv' : value === store.BOTH ? 'Oba' : value);

function makeView({ list, title, route, icon }) {
  async function render(el, { params, extraEl }) {
    if (params?.[0]) return renderItem(el, params[0]);

    const listRoot = document.createElement('div');
    listRoot.className = 'list-root';
    el.append(listRoot);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'add-btn';
    addBtn.setAttribute('aria-label', 'Přidat');
    addBtn.innerHTML = ICONS.plus;
    // Na nové stránce se rovnou píše název, klávesnice musí vyjet už teď
    addBtn.addEventListener('click', () => {
      holdKeyboard();
      navigate(`${route}/${NEW}`);
    });
    extraEl.append(addBtn);

    let members = [];
    let renderToken = 0;

    function row(wish) {
      const note = wish.note ? `<span class="item-sub item-note">${escapeHtml(wish.note)}</span>` : '';
      return `<li class="item ${whoClass(wish.assignee, members)}${wish.done ? ' is-done' : ''}" data-id="${escapeHtml(wish.id)}">
        <div class="item-bg" aria-hidden="true">Smazat</div>
        <button type="button" class="item-main has-stripe" aria-pressed="${wish.done}">
          <span class="check-tap"><span class="check">${ICONS.check}</span></span>
          <span class="item-text"><span class="item-name">${escapeHtml(wish.title)}</span>${note}</span>
          ${wish.privateTo ? `<span class="item-lock" title="Soukromé">${ICONS.lock}</span>` : ''}
        </button>
      </li>`;
    }

    async function draw() {
      const token = ++renderToken;
      const [wishes, people] = await Promise.all([store.listWishes(list), store.listMembers()]);
      if (token !== renderToken) return;
      members = people;

      if (!wishes.length) {
        listRoot.innerHTML = `<div class="empty"><div class="empty-icon">${ICONS[icon]}</div><p class="empty-title">Zatím nic</p></div>`;
        return;
      }
      // Jeden souvislý seznam, skupiny podle horizontu jako malý nadpis
      const open = wishes.filter((w) => !w.done);
      const done = wishes.filter((w) => w.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
      const labels = [...new Set(open.map((w) => horizonLabel(w.untilYear)))];
      const rows = labels
        .map((label) => `<li class="cat-head">${escapeHtml(label)}</li>${open.filter((w) => horizonLabel(w.untilYear) === label).map(row).join('')}`)
        .join('');
      listRoot.innerHTML = `${rows ? `<ul class="item-list group">${rows}</ul>` : ''}
        ${done.length ? `<p class="section-label">Splněno (${done.length})</p><ul class="item-list group">${done.map(row).join('')}</ul>` : ''}`;
    }

    async function toggle(li) {
      const nowDone = !li.classList.contains('is-done');
      li.classList.toggle('is-done', nowDone);
      await new Promise((r) => setTimeout(r, 180));
      await store.setWishDone(li.dataset.id, nowDone);
    }

    async function remove(id) {
      const removed = await store.removeWishes([id]);
      if (removed.length) undoToast(`${removed[0].title}: smazáno`, () => store.restoreWishes(removed));
    }

    const open = (id) => navigate(`${route}/${id}`);
    const endGesture = rowGestures(listRoot, {
      onTap: (li, target) => (target?.closest?.('.check-tap') ? toggle(li) : open(li.dataset.id)),
      onPress: open,
      onSwipe: remove,
    });

    await draw();
    const unsubscribe = store.subscribe(draw);
    return () => {
      unsubscribe();
      endGesture();
      renderToken += 1;
    };
  }

  // Stránka jedné položky. Stejná slouží i k založení nové (id = "novy"):
  // ta je do tlačítka Přidat jen v paměti.
  async function renderItem(el, id) {
    document.getElementById('app').classList.add('no-topbar');
    const root = document.createElement('div');
    root.className = 'detail';
    el.append(root);

    const draft = id === NEW;
    let wish = draft ? { title: '', note: null, assignee: null, untilYear: null, done: false, privateTo: null } : await store.getWish(id);
    const back = `<a class="back-btn" href="#/${route}" aria-label="Zpět">${ICONS.back}</a>`;
    if (!wish) {
      root.innerHTML = `<div class="detail-head">${back}<span class="detail-name">Položka už neexistuje</span></div>`;
      return undefined;
    }

    let members = await store.listMembers();
    let noteEditing = false;

    root.innerHTML = `
      <div class="detail-head">${back}
        ${draft ? '' : `<button type="button" class="check-tap" data-action="done" aria-label="Splněno"><span class="check">${ICONS.check}</span></button>`}
        <textarea class="input detail-title" name="title" rows="1" aria-label="Název" placeholder="${escapeHtml(title)}" enterkeyhint="done"></textarea>
      </div>
      <div class="opts"></div>
      <div class="note-box"></div>
      ${draft
    ? '<button type="button" class="btn btn-primary btn-block detail-create" data-action="create">Přidat</button>'
    : '<button type="button" class="btn btn-ghost btn-danger btn-small detail-delete" data-action="delete">Smazat</button>'}`;

    const titleEl = root.querySelector('.detail-title');
    const optsEl = root.querySelector('.opts');
    const noteBox = root.querySelector('.note-box');
    const grow = (area) => { area.style.height = 'auto'; area.style.height = `${area.scrollHeight + 2}px`; };

    // Rozpracovaná nová položka se mění jen v paměti, existující se hned ukládá
    const save = async (patch) => {
      if (!draft) return store.updateWish(id, patch);
      wish = { ...wish, ...patch };
      drawHead();
      drawNote();
      return wish;
    };

    async function create() {
      const text = titleEl.value.replace(/\s+/g, ' ').trim();
      if (!text) {
        titleEl.focus();
        return;
      }
      const { note, assignee, untilYear } = wish;
      await store.addWish({ list, title: text.charAt(0).toLocaleUpperCase('cs') + text.slice(1), note, assignee, untilYear, isPrivate: Boolean(wish.privateTo) });
      navigate(route);
    }

    function drawHead() {
      if (document.activeElement !== titleEl) titleEl.value = wish.title;
      grow(titleEl);
      root.classList.toggle('is-done', Boolean(wish.done));
      root.querySelector('.detail-head').className = `detail-head ${whoClass(wish.assignee, members)}`;
      // Malá tlačítka: vždy stejná, ve stejném pořadí a šířce
      optsEl.innerHTML = `
        <button type="button" class="opt opt-who ${whoClass(wish.assignee, members)}" data-opt="who"><span class="legend-dot"></span><span class="opt-text">${escapeHtml(whoName(wish.assignee))}</span></button>
        <button type="button" class="opt opt-due" data-opt="horizon"><span class="opt-text">${escapeHtml(horizonLabel(wish.untilYear))}</span></button>
        <button type="button" class="opt opt-icon opt-lock${wish.privateTo ? ' is-set' : ''}" data-opt="private" aria-pressed="${Boolean(wish.privateTo)}" aria-label="Soukromé">${ICONS.lock}</button>`;
    }

    // Podrobnosti: text, který se ťuknutím změní v pole
    function drawNote() {
      if (noteEditing) return;
      noteBox.innerHTML = wish.note
        ? `<div class="note-view is-open" data-action="note-edit" role="button" tabindex="0">${escapeHtml(wish.note)}</div>`
        : '<button type="button" class="note-add" data-action="note-edit">+ Přidat podrobnosti</button>';
    }

    function editNote() {
      noteEditing = true;
      noteBox.innerHTML = '<textarea class="input note-input" rows="3" aria-label="Podrobnosti"></textarea>';
      const area = noteBox.querySelector('textarea');
      area.value = wish.note ?? '';
      grow(area);
      area.focus();
      area.addEventListener('input', () => grow(area));
      area.addEventListener('blur', async () => {
        noteEditing = false;
        const text = area.value.trim() || null;
        if (text !== (wish.note ?? null)) {
          wish = { ...wish, note: text };
          await save({ note: text });
        }
        drawNote();
      });
    }

    async function draw() {
      if (!draft) {
        const fresh = await store.getWish(id);
        if (!fresh) {
          navigate(route);
          return;
        }
        wish = fresh;
        members = await store.listMembers();
      }
      drawHead();
      drawNote();
    }

    titleEl.addEventListener('input', () => grow(titleEl));
    titleEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      // U nové položky Enter rovnou přidá
      if (draft) create();
      else titleEl.blur();
    });
    titleEl.addEventListener('change', () => {
      const text = titleEl.value.replace(/\s+/g, ' ').trim();
      if (draft) wish = { ...wish, title: text };
      else if (text) save({ title: text });
      else titleEl.value = wish.title;
    });

    // Volby se rozbalí přímo u tlačítka
    const menuItems = (options, current) => options
      .map(([value, name, cls = '']) => `<button type="button" class="menu-item ${cls}" data-value="${escapeHtml(value)}" aria-pressed="${String(value) === String(current)}">${escapeHtml(name)}</button>`)
      .join('');

    optsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-opt]');
      if (!btn) return;
      // Zámek: položku uvidím jen já (dárky)
      if (btn.dataset.opt === 'private') {
        if (draft) save({ privateTo: wish.privateTo ? null : 'me' });
        else store.setWishPrivate(id, !wish.privateTo);
      }
      if (btn.dataset.opt === 'who') {
        const options = [['', 'Kdokoliv', 'who-any'], ...members.map((m) => [m, m, whoClass(m, members)]), [store.BOTH, 'Oba', 'who-both']];
        openMenu(btn, (menu, close) => {
          menu.innerHTML = menuItems(options, wish.assignee ?? '');
          menu.addEventListener('click', (ev) => {
            const item = ev.target.closest('[data-value]');
            if (!item) return;
            close();
            save({ assignee: item.dataset.value || null });
          });
        });
      }
      if (btn.dataset.opt === 'horizon') {
        const current = wish.untilYear ? Math.max(wish.untilYear - thisYear(), 0) : 0;
        openMenu(btn, (menu, close) => {
          menu.innerHTML = menuItems(HORIZONS, current);
          menu.addEventListener('click', (ev) => {
            const item = ev.target.closest('[data-value]');
            if (!item) return;
            close();
            const years = Number(item.dataset.value);
            save({ untilYear: years ? thisYear() + years : null });
          });
        });
      }
    });

    root.addEventListener('click', async (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'create') await create();
      if (action === 'done') await store.setWishDone(id, !wish.done);
      if (action === 'note-edit') editNote();
      if (action === 'delete') {
        const removed = await store.removeWishes([id]);
        if (removed.length) undoToast(`${removed[0].title}: smazáno`, () => store.restoreWishes(removed));
        navigate(route);
      }
    });

    await draw();
    if (draft) {
      titleEl.focus();
      return undefined;
    }
    return store.subscribe(draw);
  }

  return { title, tab: 'domu', render };
}

export const wishlist = makeView({ list: 'wish', title: 'Wishlist', route: 'wishlist', icon: 'gift' });
export const bucketlist = makeView({ list: 'bucket', title: 'Bucketlist', route: 'bucketlist', icon: 'star' });
