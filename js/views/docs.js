// Administrativa (#/administrativa, otevírá se z Domů): záruky a účtenky,
// smlouvy, doklady. Rozdělené na společné a osobní (osobní vidí jen majitel,
// hlídá to databáze) a uvnitř podle kategorií.
// Dokument má název, kategorii, platnost / záruku do, poznámku a naskenované
// stránky (fotky). Ovládání jako jinde: + založí, ťuknutí otevře, potažení
// doleva smaže.

import * as store from '../store.js';
import { escapeHtml, ICONS, toast, undoToast, rowGestures, openMenu, holdKeyboard, scalePhoto } from '../ui.js';
import { navigate } from '../router.js';
import { today, daysBetween } from '../dates.js';

// "12. 3. 2028" (bez dne v týdnu, u platnosti dokladu je k ničemu)
const shortDate = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return `${d}. ${m}. ${y}`;
};

export const title = 'Administrativa';
export const tab = 'domu';

// Která část je otevřená, vydrží, dokud je appka otevřená
let scope = 'shared';

const categoryName = (id) => store.DOC_CATEGORIES.find(([value]) => value === id)?.[1] ?? 'Ostatní';

// "do 12. 3. 2027", po platnosti nebo do 30 dní zvýrazněné
function validHtml(day) {
  if (!day) return '';
  const left = daysBetween(today(), day);
  const text = left < 0 ? `prošlo ${shortDate(day)}` : `do ${shortDate(day)}`;
  return left < 30 ? `<span class="is-late">${escapeHtml(text)}</span>` : escapeHtml(text);
}

export async function render(el, { params, extraEl }) {
  if (params?.[0]) return renderDoc(el, params[0]);

  const root = document.createElement('div');
  el.append(root);
  root.innerHTML = `
    <div class="segmented seg-bar tabs-only recipe-tabs" role="tablist">
      <button type="button" role="tab" data-scope="shared">Společné</button>
      <button type="button" role="tab" data-scope="private">Osobní</button>
    </div>
    <div class="list-root"></div>`;
  const tabsEl = root.querySelector('.segmented');
  const listRoot = root.querySelector('.list-root');

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'add-btn';
  addBtn.setAttribute('aria-label', 'Přidat dokument');
  addBtn.innerHTML = ICONS.plus;
  // Nový dokument vznikne hned a rovnou se píše jeho název
  addBtn.addEventListener('click', async () => {
    holdKeyboard();
    const doc = await store.addDoc({ isPrivate: scope === 'private' });
    navigate(`administrativa/${doc.id}`);
  });
  extraEl.append(addBtn);

  async function draw() {
    tabsEl.querySelectorAll('[data-scope]').forEach((btn) => btn.setAttribute('aria-pressed', btn.dataset.scope === scope));
    const docs = (await store.listDocs()).filter((d) => Boolean(d.privateTo) === (scope === 'private'));
    const rows = store.DOC_CATEGORIES.map(([id, name]) => {
      const inCat = docs.filter((d) => (d.category ?? 'ostatni') === id);
      if (!inCat.length) return '';
      return `<li class="cat-head">${escapeHtml(name)}</li>${inCat.map((d) => {
        const meta = [validHtml(d.validUntil), (d.files ?? []).length ? `stran: ${d.files.length}` : ''].filter(Boolean);
        return `<li class="item" data-id="${escapeHtml(d.id)}">
          <div class="item-bg" aria-hidden="true">Smazat</div>
          <button type="button" class="item-main">
            <span class="item-text"><span class="item-name${d.title ? '' : ' is-blank'}">${escapeHtml(d.title || 'Bez názvu')}</span>${meta.length ? `<span class="item-sub">${meta.join(' · ')}</span>` : ''}</span>
          </button>
        </li>`;
      }).join('')}`;
    }).join('');
    listRoot.innerHTML = rows
      ? `<ul class="item-list group">${rows}</ul>`
      : `<div class="empty"><div class="empty-icon">${ICONS.folder}</div><p class="empty-title">Zatím nic</p></div>`;
  }

  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-scope]');
    if (!btn) return;
    scope = btn.dataset.scope;
    draw();
  });

  async function remove(id) {
    const removed = await store.removeDocs([id]);
    if (removed.length) undoToast(`${removed[0].title || 'Dokument'}: smazáno`, () => store.restoreDocs(removed));
  }
  const open = (id) => navigate(`administrativa/${id}`);
  const endGesture = rowGestures(listRoot, { onTap: (li) => open(li.dataset.id), onPress: open, onSwipe: remove });

  await draw();
  const unsubscribe = store.subscribe(draw);
  return () => {
    unsubscribe();
    endGesture();
  };
}

// ---------- Stránka dokumentu ----------

async function renderDoc(el, id) {
  document.getElementById('app').classList.add('no-topbar');
  const root = document.createElement('div');
  root.className = 'detail';
  el.append(root);

  let doc = await store.getDoc(id);
  const back = `<a class="back-btn" href="#/administrativa" aria-label="Zpět">${ICONS.back}</a>`;
  if (!doc) {
    root.innerHTML = `<div class="detail-head">${back}<span class="detail-name">Dokument už neexistuje</span></div>`;
    return undefined;
  }

  root.innerHTML = `
    <div class="detail-head">${back}
      <textarea class="input detail-title" name="title" rows="1" aria-label="Název" placeholder="Nový dokument" enterkeyhint="done"></textarea>
    </div>
    <div class="opts"></div>
    <textarea class="input doc-note" name="note" rows="2" placeholder="Poznámka" aria-label="Poznámka"></textarea>
    <div class="doc-files"></div>
    <button type="button" class="btn btn-ghost btn-danger btn-small detail-delete" data-action="delete">Smazat</button>`;

  const titleEl = root.querySelector('.detail-title');
  const noteEl = root.querySelector('.doc-note');
  const optsEl = root.querySelector('.opts');
  const filesEl = root.querySelector('.doc-files');
  const grow = (area) => { area.style.height = 'auto'; area.style.height = `${area.scrollHeight + 2}px`; };

  async function draw() {
    const fresh = await store.getDoc(id);
    if (!fresh) {
      navigate('administrativa');
      return;
    }
    doc = fresh;
    if (document.activeElement !== titleEl) titleEl.value = doc.title ?? '';
    if (document.activeElement !== noteEl) noteEl.value = doc.note ?? '';
    grow(titleEl);
    grow(noteEl);
    // Malá tlačítka: kategorie, platnost (přes řádek leží pole s datem), zámek
    optsEl.innerHTML = `
      <button type="button" class="opt opt-cat" data-opt="category"><span class="opt-text">${escapeHtml(categoryName(doc.category))}</span></button>
      <label class="opt opt-due opt-date${doc.validUntil && daysBetween(today(), doc.validUntil) < 30 ? ' is-late' : ''}">
        <span class="opt-text">${doc.validUntil ? `do ${escapeHtml(shortDate(doc.validUntil))}` : 'Bez data'}</span>
        <input type="date" name="validUntil" aria-label="Platí do" value="${escapeHtml(doc.validUntil ?? '')}">
      </label>
      <button type="button" class="opt opt-icon opt-lock${doc.privateTo ? ' is-set' : ''}" data-opt="private" aria-pressed="${Boolean(doc.privateTo)}" aria-label="Osobní dokument">${ICONS.lock}</button>`;

    const files = await store.docFiles(doc);
    filesEl.innerHTML = `${files.map((f) => `<div class="doc-file" data-file="${escapeHtml(f.id)}">
        ${f.data ? `<img src="${f.data}" alt="">` : '<span class="doc-file-wait"></span>'}
        <button type="button" class="icon-btn" data-action="file-remove" aria-label="Odebrat stránku">×</button>
      </div>`).join('')}
      <label class="doc-file doc-file-add">
        <span class="photo-slot">${ICONS.camera}</span>
        <input type="file" accept="image/*" multiple aria-label="Přidat stránku">
      </label>`;
  }

  const save = (patch) => store.updateDoc(id, patch);
  titleEl.addEventListener('input', () => grow(titleEl));
  noteEl.addEventListener('input', () => grow(noteEl));
  titleEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    titleEl.blur();
  });
  titleEl.addEventListener('change', () => save({ title: titleEl.value.replace(/\s+/g, ' ').trim() }));
  noteEl.addEventListener('change', () => save({ note: noteEl.value.trim() || null }));

  optsEl.addEventListener('change', (e) => {
    if (e.target.name === 'validUntil') save({ validUntil: e.target.value || null });
  });
  optsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-opt]');
    if (!btn) return;
    if (btn.dataset.opt === 'private') store.setDocPrivate(id, !doc.privateTo);
    if (btn.dataset.opt === 'category') {
      openMenu(btn, (menu, close) => {
        menu.innerHTML = store.DOC_CATEGORIES
          .map(([value, name]) => `<button type="button" class="menu-item" data-value="${value}" aria-pressed="${value === doc.category}">${escapeHtml(name)}</button>`)
          .join('');
        menu.addEventListener('click', (ev) => {
          const item = ev.target.closest('[data-value]');
          if (!item) return;
          close();
          save({ category: item.dataset.value });
        });
      });
    }
  });

  filesEl.addEventListener('change', async (e) => {
    const picked = [...(e.target.files ?? [])];
    e.target.value = '';
    for (const file of picked) {
      try {
        await store.addDocFile(id, await scalePhoto(file));
      } catch {
        toast('Fotku se nepodařilo načíst');
      }
    }
  });

  root.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'file-remove') {
      await store.removeDocFile(id, e.target.closest('[data-file]').dataset.file);
      return;
    }
    if (action === 'delete') {
      const removed = await store.removeDocs([id]);
      if (removed.length) undoToast(`${removed[0].title || 'Dokument'}: smazáno`, () => store.restoreDocs(removed));
      navigate('administrativa');
      return;
    }
    // Ťuknutí na stránku ji ukáže přes celou obrazovku, další ji zavře
    const img = e.target.closest('.doc-file img');
    if (img) {
      const full = document.createElement('div');
      full.className = 'doc-full';
      full.innerHTML = `<img src="${img.src}" alt="">`;
      full.addEventListener('click', () => full.remove());
      document.body.append(full);
    }
  });

  await draw();
  if (!doc.title) titleEl.focus();
  const unsubscribe = store.subscribe(draw);
  return () => {
    unsubscribe();
    document.querySelector('.doc-full')?.remove();
    // Dokument založený omylem (bez názvu, poznámky i stránek) se zahodí.
    // Rozhoduje, co je v polích: uložení posledního psaní může ještě dobíhat.
    if (!titleEl.value.trim() && !noteEl.value.trim() && !(doc.files ?? []).length) store.removeDocs([id]);
  };
}
