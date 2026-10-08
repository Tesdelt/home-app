// Info o domácnosti (#/info, otevírá se z Domů): seznam poznámek typu wifi,
// odečty měřáků, kontakt na správce. Poznámka má název a text.
// + založí novou, ťuknutí otevře, potažení doleva smaže. Ukládá se samo.

import * as store from '../store.js';
import { escapeHtml, ICONS, undoToast, rowGestures, holdKeyboard } from '../ui.js';
import { navigate } from '../router.js';

export const title = 'Domácnost';
export const tab = 'domu';

export async function render(el, { params, extraEl }) {
  if (params?.[0]) return renderNote(el, params[0]);

  const listRoot = document.createElement('div');
  listRoot.className = 'list-root';
  el.append(listRoot);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'add-btn';
  addBtn.setAttribute('aria-label', 'Přidat poznámku');
  addBtn.innerHTML = ICONS.plus;
  // Nová poznámka vznikne hned a rovnou se píše její název
  addBtn.addEventListener('click', async () => {
    holdKeyboard();
    const note = await store.addNote();
    navigate(`info/${note.id}`);
  });
  extraEl.append(addBtn);

  async function draw() {
    const notes = await store.listNotes();
    listRoot.innerHTML = notes.length
      ? `<ul class="item-list group">${notes.map((n) => `<li class="item" data-id="${escapeHtml(n.id)}">
          <div class="item-bg" aria-hidden="true">Smazat</div>
          <button type="button" class="item-main">
            <span class="item-text"><span class="item-name${n.title ? '' : ' is-blank'}">${escapeHtml(n.title || 'Bez názvu')}</span>${n.body ? `<span class="item-sub note-preview">${escapeHtml(n.body)}</span>` : ''}</span>
          </button>
        </li>`).join('')}</ul>`
      : `<div class="empty"><div class="empty-icon">${ICONS.house}</div><p class="empty-title">Zatím nic</p></div>`;
  }

  async function remove(id) {
    const removed = await store.removeNotes([id]);
    if (removed.length) undoToast(`${removed[0].title || 'Poznámka'}: smazáno`, () => store.restoreNotes(removed));
  }
  const open = (id) => navigate(`info/${id}`);
  const endGesture = rowGestures(listRoot, { onTap: (li) => open(li.dataset.id), onPress: open, onSwipe: remove });

  await draw();
  const unsubscribe = store.subscribe(draw);
  return () => {
    unsubscribe();
    endGesture();
  };
}

async function renderNote(el, id) {
  document.getElementById('app').classList.add('no-topbar');
  const root = document.createElement('div');
  root.className = 'detail';
  el.append(root);

  let note = await store.getNote(id);
  const back = `<a class="back-btn" href="#/info" aria-label="Zpět">${ICONS.back}</a>`;
  if (!note) {
    root.innerHTML = `<div class="detail-head">${back}<span class="detail-name">Poznámka už neexistuje</span></div>`;
    return undefined;
  }

  root.innerHTML = `
    <div class="detail-head">${back}
      <textarea class="input detail-title" name="title" rows="1" aria-label="Název" placeholder="Nová poznámka" enterkeyhint="done"></textarea>
    </div>
    <textarea class="input note-body" name="body" rows="8" aria-label="Text" autocapitalize="sentences"></textarea>
    <button type="button" class="btn btn-ghost btn-danger btn-small detail-delete" data-action="delete">Smazat</button>`;

  const titleEl = root.querySelector('.detail-title');
  const bodyEl = root.querySelector('.note-body');
  const grow = (area) => { area.style.height = 'auto'; area.style.height = `${area.scrollHeight + 2}px`; };

  async function draw() {
    const fresh = await store.getNote(id);
    if (!fresh) {
      navigate('info');
      return;
    }
    note = fresh;
    // Pole, do kterého se zrovna píše, se nepřepisuje
    if (document.activeElement !== titleEl) titleEl.value = note.title ?? '';
    if (document.activeElement !== bodyEl) bodyEl.value = note.body ?? '';
    grow(titleEl);
    grow(bodyEl);
  }

  titleEl.addEventListener('input', () => grow(titleEl));
  bodyEl.addEventListener('input', () => grow(bodyEl));
  titleEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    bodyEl.focus();
  });
  titleEl.addEventListener('change', () => store.updateNote(id, { title: titleEl.value.replace(/\s+/g, ' ').trim() }));
  bodyEl.addEventListener('change', () => store.updateNote(id, { body: bodyEl.value.trim() || null }));

  root.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    const removed = await store.removeNotes([id]);
    if (removed.length) undoToast(`${removed[0].title || 'Poznámka'}: smazáno`, () => store.restoreNotes(removed));
    navigate('info');
  });

  await draw();
  if (!note.title) titleEl.focus();
  const unsubscribe = store.subscribe(draw);
  return () => {
    unsubscribe();
    // Poznámka založená omylem (prázdná) se zahodí. Rozhoduje, co je v polích:
    // uložení posledního psaní může ještě dobíhat.
    if (!titleEl.value.trim() && !bodyEl.value.trim()) store.removeNotes([id]);
  };
}
