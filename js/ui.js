// Sdílené prvky rozhraní: escapování, ikony, toast se Zpět, spodní panel.

export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function html(strings, ...values) {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? values[i] : ''), '');
}

export const ICONS = {
  cart: '<svg viewBox="0 0 24 24"><path d="M3 4h2.2l2.3 11h10.2l2-8H6.4"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/></svg>',
  tasks: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
  wallet: '<svg viewBox="0 0 24 24"><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H18v3"/><path d="M4 7.5V18a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5.5A1.5 1.5 0 0 1 4 7.5z"/><path d="M16.5 14.5h.01"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 20h14"/></svg>',
  repeat: '<svg viewBox="0 0 24 24"><path d="M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4"/></svg>',
  gift: '<svg viewBox="0 0 24 24"><path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1.5-3-5-3.5-5-1s3.500 1 5 1zm0 0c1.500-3 5-3.500 5-1s-3.500 1-5 1z"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 4 2.400 5 5.400.800-3.900 3.800.900 5.400L12 16.500 7.200 19l.900-5.400L4.200 9.800l5.400-.800z"/></svg>',
  recipe: '<svg viewBox="0 0 24 24"><path d="M5 11h14v4a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5zM3 11h18M9 7c0-1.5 1-1.5 1-3M14 7c0-1.5 1-1.5 1-3"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5.5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="18.5" r="1.4"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  house: '<svg viewBox="0 0 24 24"><path d="M4 10.500 12 4l8 6.500V20H4zM9.500 20v-5h5v5"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l1.500-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.500"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="m14.5 5-7 7 7 7"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M5 12h13M12.5 6l6 6-6 6"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/></svg>',
  help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.6"/><path d="M12 16.8h.01"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><g transform="translate(1.8 1.8) scale(.85)"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></g></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5.500l3.500 2"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.500h6V7M6.500 7l1 12.500h9l1-12.500M10 11v5M14 11v5"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M4 4v16h16"/><path d="m7 15 4-4.5 3 3L19.500 8"/></svg>',
  sync: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4"/></svg>',
};

// ---------- Prázdný stav ----------
// Všude stejně: ikona, nadpis a jedna věta, co sem patří, s příkladem.
export function emptyState(icon, heading, text) {
  return `<div class="empty"><div class="empty-icon">${ICONS[icon] ?? ''}</div>
    <p class="empty-title">${escapeHtml(heading)}</p><p>${escapeHtml(text)}</p></div>`;
}

// ---------- Toast (krátká zpráva dole, volitelně s tlačítkem Zpět) ----------

let toastTimer = null;

export function toast(message, { actionLabel = null, onAction = null, duration = 5000 } = {}) {
  const root = document.getElementById('toast-root');
  clearTimeout(toastTimer);
  root.replaceChildren();

  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);

  if (actionLabel && onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => {
      clearTimeout(toastTimer);
      el.remove();
      onAction();
    });
    el.append(btn);
  }

  root.append(el);
  toastTimer = setTimeout(() => el.remove(), duration);
}

export function undoToast(message, onUndo) {
  toast(message, { actionLabel: 'Zpět', onAction: onUndo });
}

// ---------- Spodní panel ----------
// build(sheetEl, close) naplní panel obsahem. Vrací funkci close.

export function openSheet(title, build) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
    <div class="sheet-grip"></div>
    <h2 class="sheet-title">${escapeHtml(title)}</h2>
    <div class="sheet-body"></div>
  </div>`;

  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  build(backdrop.querySelector('.sheet-body'), close);
  return close;
}

// ---------- Počítač ----------
// Jedno sdílené rozhodnutí, jestli je appka v rozvržení pro počítač (šířka od
// 1024 px). CSS má stejnou hranici v media queries. Při změně šířky přes hranici
// app.js aktuální pohled překreslí (onDesktopChange).
const desktopQuery = window.matchMedia('(min-width: 1024px)');
export const isDesktop = () => desktopQuery.matches;
export function onDesktopChange(fn) {
  const handler = () => fn(desktopQuery.matches);
  desktopQuery.addEventListener('change', handler);
  return () => desktopQuery.removeEventListener('change', handler);
}
// Myš (nebo trackpad): hover, pravé tlačítko a tři tečky při najetí na řádek
const mouseQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
export const hasMouse = () => mouseQuery.matches;

// Nabídka u místa kliknutí (pravé tlačítko): openMenu chce prvek, stačí mu obdélník
const pointAnchor = (x, y) => ({ getBoundingClientRect: () => ({ left: x, right: x, top: y, bottom: y }) });

// ---------- Gesta na řádcích seznamu ----------
// Řádek je <li class="item" data-id> s tlačítkem .item-main uvnitř.
// Ťuknutí = onTap(li, kam se ťuklo), podržení = onPress(id), potažení doleva = onSwipe(id).
// S myší navíc: pravé tlačítko na řádku a tři tečky při najetí otevřou nabídku se
// stejnými akcemi (pressLabel = popisek akce podržení, null = žádná; actions(li) =
// další akce [{ label, run }]; Smazat = potažení).
// Vrací funkci na úklid, kterou má pohled zavolat při odchodu.

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 10;

export function rowGestures(listEl, { onTap, onPress, onSwipe, pressLabel = 'Upravit', actions = null }) {
  let gesture = null;
  let ignoreClicksUntil = 0;

  function rowMenu(anchor, li) {
    const id = li?.dataset.id;
    if (!id) return;
    const list = [
      ...(pressLabel ? [{ label: pressLabel, run: () => onPress(id) }] : []),
      ...(actions?.(li) ?? []),
      { label: 'Smazat', danger: true, run: () => onSwipe(id) },
    ];
    openMenu(anchor, (menu, close) => {
      menu.innerHTML = list
        .map((a, i) => `<button type="button" class="menu-item${a.danger ? ' is-danger' : ''}" data-i="${i}">${escapeHtml(a.label)}</button>`)
        .join('');
      menu.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-i]');
        if (!btn) return;
        close();
        list[Number(btn.dataset.i)].run();
      });
    });
  }

  // Tři tečky se do řádku přidají, až na něj najede myš (řádky se často překreslují)
  listEl.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse' || !hasMouse()) return;
    const li = e.target.closest('.item');
    if (!li || !listEl.contains(li) || !li.dataset.id || li.querySelector('.item-more, .row-more')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'row-more';
    btn.setAttribute('aria-label', 'Další možnosti');
    btn.innerHTML = ICONS.more;
    li.append(btn);
  });

  function endGesture() {
    if (!gesture) return;
    clearTimeout(gesture.timer);
    gesture.main.classList.remove('is-dragging');
    gesture = null;
  }

  listEl.addEventListener('pointerdown', (e) => {
    const main = e.target.closest('.item-main');
    // Hlavička rozbalovacího řádku (.fold-head) není položka, gesta se jí netýkají
    if (!main || main.classList.contains('fold-head') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const li = main.closest('.item');
    gesture = {
      // Posouvá se celý řádek (.item-slide), když ho položka má, jinak jen tlačítko
      main: main.closest('.item-slide') ?? main,
      li,
      id: li.dataset.id,
      x: e.clientX,
      y: e.clientY,
      dx: 0,
      mode: null,
      timer: setTimeout(() => {
        if (gesture && !gesture.mode) {
          gesture.mode = 'press';
          ignoreClicksUntil = Date.now() + 800;
          navigator.vibrate?.(10);
          onPress(gesture.id);
        }
      }, LONG_PRESS_MS),
    };
  });

  listEl.addEventListener('pointermove', (e) => {
    if (!gesture || gesture.mode === 'press') return;
    const mx = e.clientX - gesture.x;
    const my = e.clientY - gesture.y;
    if (!gesture.mode) {
      if (Math.abs(mx) > MOVE_TOLERANCE && Math.abs(mx) > Math.abs(my)) {
        gesture.mode = 'swipe';
        clearTimeout(gesture.timer);
        gesture.main.classList.add('is-dragging');
        try { gesture.main.setPointerCapture(e.pointerId); } catch { /* nevadí */ }
      } else if (Math.abs(my) > MOVE_TOLERANCE) {
        endGesture();
        return;
      } else {
        return;
      }
    }
    gesture.dx = Math.min(0, mx);
    gesture.main.style.transform = `translateX(${gesture.dx}px)`;
  });

  const finish = (cancelled) => () => {
    if (!gesture) return;
    const g = gesture;
    if (g.mode === 'swipe') {
      ignoreClicksUntil = Date.now() + 400;
      const threshold = Math.min(110, g.main.offsetWidth * 0.35);
      g.main.classList.remove('is-dragging');
      if (!cancelled && g.dx < -threshold) {
        g.main.style.transform = 'translateX(-100%)';
        setTimeout(() => onSwipe(g.id), 180);
      } else {
        g.main.style.transform = '';
      }
    }
    endGesture();
  };
  listEl.addEventListener('pointerup', finish(false));
  listEl.addEventListener('pointercancel', finish(true));

  listEl.addEventListener('contextmenu', (e) => {
    const main = e.target.closest('.item-main');
    if (!main) return;
    e.preventDefault();
    // Pravé tlačítko myši: nabídka s akcemi řádku přímo u kurzoru
    if (hasMouse() && !main.classList.contains('fold-head')) {
      endGesture();
      rowMenu(pointAnchor(e.clientX, e.clientY), main.closest('.item'));
    }
  });

  listEl.addEventListener('click', (e) => {
    const more = e.target.closest('.row-more');
    if (more) {
      rowMenu(more, more.closest('.item'));
      return;
    }
    const main = e.target.closest('.item-main');
    if (!main || main.classList.contains('fold-head') || Date.now() < ignoreClicksUntil) return;
    onTap(main.closest('.item'), e.target);
  });

  return endGesture;
}

// ---------- Pruh naplnění limitu ----------
// Barva podle toho, kolik z limitu je pryč: šedá, v první třetině přechází do
// zelené, od poloviny do žluté, ke konci do oranžové a těsně před limitem
// a nad ním červená. Mezi body se barvy plynule míchají (color-mix), takže
// přechod nemá ostré skoky. Body jsou tokeny --bar-0 až --bar-4 (světlý i tmavý).
const BAR_STOPS = [[0, 0], [0.33, 1], [0.5, 2], [0.8, 3], [0.95, 4]];

export function budgetColor(part) {
  const p = Math.max(0, part);
  if (p >= BAR_STOPS[BAR_STOPS.length - 1][0]) return 'var(--bar-4)';
  const i = BAR_STOPS.findIndex(([at]) => at > p);
  const [from, a] = BAR_STOPS[i - 1];
  const [to, b] = BAR_STOPS[i];
  const t = Math.round(((p - from) / (to - from)) * 100);
  return `color-mix(in oklab, var(--bar-${b}) ${t}%, var(--bar-${a}))`;
}

// Plán v kartě měsíce (Peníze, Domů): „Utraceno z plánu X / Y Kč“ a pruh
// se stejnou barevnou škálou jako limity (budgetColor). Bez plánu nic.
export function planMeter(spent, plan) {
  if (!(plan > 0)) return '';
  const part = Math.max(0, spent) / plan;
  const width = (Math.min(1, part) * 100).toFixed(1);
  return `<span class="plan-meter">
      <span class="plan-meter-row"><span>Utraceno z plánu</span><span class="plan-meter-value">${Math.round(spent).toLocaleString('cs-CZ')} <span class="budget-of">/ ${money(plan)}</span></span></span>
      <span class="budget-bar"><span style="width: ${width}%; background: ${budgetColor(part)}"></span></span>
    </span>`;
}

// ---------- Rozbalovací řádky ----------
// Řádek li.fold má hlavičku .fold-head a tělo .fold-body, které se rozbalí plynule
// (CSS). V jednom seznamu je rozbalený nejvýš jeden: ťuknutí na jiný předchozí
// zavře, další ťuknutí na stejný ho zavře. Mění jen třídy, nic se nepřekresluje.
// Vrací data-fold rozbaleného řádku, nebo null. Používají ho kategorie ve
// Skutečnosti i kategorie plateb v Penězích.
export function toggleFold(li) {
  const open = !li.classList.contains('is-open');
  li.parentElement.querySelectorAll(':scope > .fold').forEach((row) => {
    const on = open && row === li;
    row.classList.toggle('is-open', on);
    row.querySelector(':scope > .fold-head')?.setAttribute('aria-expanded', on);
  });
  return open ? li.dataset.fold : null;
}

// ---------- Čí to je: barva a značka ----------
// Každý člen má svou barvu (podle pořadí v domácnosti, na obou telefonech
// stejně), společné věci třetí. value: jméno člena, 'both' / 'split', nebo null.

export function whoClass(value, members) {
  if (!value) return 'who-any';
  if (value === 'both' || value === 'split') return 'who-both';
  const index = members.indexOf(value);
  return index === 0 ? 'who-1' : index === 1 ? 'who-2' : 'who-any';
}

export function whoBadge(value, members, sharedLabel = 'Oba') {
  if (!value) return '';
  const shared = value === 'both' || value === 'split';
  const text = shared ? members.map((m) => m.charAt(0)).join('') : value.charAt(0);
  return `<span class="item-who ${whoClass(value, members)}" title="${escapeHtml(shared ? sharedLabel : value)}">${escapeHtml(text)}</span>`;
}

// Přepínač s jednou volbou: tlačítka s data-value, vybrané má aria-pressed.
// wireSegmented zapojí klikání v celém formuláři, picked vrátí vybranou hodnotu.
export function wireSegmented(formEl) {
  formEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented button');
    if (btn) btn.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === btn));
  });
  return (name) => formEl.querySelector(`[data-name="${name}"] [aria-pressed="true"]`)?.dataset.value ?? '';
}

// ---------- Peníze ----------

export function money(amount) {
  return `${Math.round(amount).toLocaleString('cs-CZ')} Kč`;
}

// ---------- Fotka: zmenšení před uložením ----------
// Z vybrané fotky udělá čtverec (výřez ze středu) o dané hraně a vrátí ho jako
// JPEG data URL. Fotky z telefonu mají několik MB, takhle má jedna kolem 80 kB.

export async function squarePhoto(file, size = 720, quality = 0.72) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Obrázek nejde načíst'));
      img.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d').drawImage(
      img,
      (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
      0, 0, size, size,
    );
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Zmenší fotku dokumentu tak, aby delší strana měla nejvýš max px. Bez ořezu
// a ve vyšší kvalitě, ať je sken čitelný.
export async function scalePhoto(file, max = 1600, quality = 0.8) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Obrázek nejde načíst'));
      img.src = url;
    });
    const ratio = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * ratio);
    canvas.height = Math.round(img.naturalHeight * ratio);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- Klávesnice hned po ťuknutí ----------
// iPhone vysune klávesnici jen tehdy, když pole dostane fokus přímo při
// ťuknutí. Když se pole objeví až o chvíli později (nová stránka, panel po
// načtení dat), klávesnice by nevyjela a muselo by se do pole ťuknout zvlášť.
// Proto se hned při ťuknutí zaměří neviditelné pole, klávesnice vyjede a
// skutečné pole si fokus převezme, až bude na obrazovce.
// Volat na začátku obsluhy ťuknutí, před jakýmkoli čekáním.

export function holdKeyboard() {
  const ghost = document.createElement('input');
  ghost.className = 'kb-ghost';
  ghost.tabIndex = -1;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('autocapitalize', 'sentences');
  document.body.append(ghost);
  ghost.focus({ preventScroll: true });
  // Zmizí, jakmile fokus převezme skutečné pole (nebo po chvíli samo)
  const onFocus = (e) => { if (e.target !== ghost) drop(); };
  function drop() {
    document.removeEventListener('focusin', onFocus);
    ghost.remove();
  }
  document.addEventListener('focusin', onFocus);
  ghost.addEventListener('blur', drop);
  setTimeout(drop, 4000);
}

// ---------- Ruční řazení: podržet a přetáhnout ----------
// Položky seznamu se řadí podržením a přetažením, nikdy šipkami nahoru/dolů.
// Pohyb je plynulý: držená položka jede s prstem a ostatní jí s krátkou
// animací uhýbají, nic neskáče po blocích.
// handle = selektor části položky, za kterou se dá chytit. Po puštění zavolá
// onDrop(ids) s novým pořadím (ids z data atributu attr). Vrací úklid.

const DRAG_HOLD_MS = 350;
const DRAG_EASE = 'transform 170ms cubic-bezier(0.2, 0, 0, 1)';

export function dragSort(listEl, { item, handle, attr, onDrop }) {
  let drag = null; // { el, timer, active, x, y, grab, shift, before }
  let ignoreClickUntil = 0;

  const items = () => [...listEl.querySelectorAll(item)];

  function cancel() {
    if (!drag) return;
    clearTimeout(drag.timer);
    drag = null;
  }

  // Držená položka: posun o shift px vůči svému místu v seznamu
  function place(shift) {
    drag.shift = shift;
    drag.el.style.transform = `translateY(${shift}px) scale(1.02)`;
  }

  const onDown = (e) => {
    const grip = e.target.closest(handle);
    const el = grip?.closest(item);
    if (!el || !listEl.contains(el) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    cancel();
    drag = { el, active: false, mouse: e.pointerType === 'mouse', x: e.clientX, y: e.clientY, shift: 0, before: items().map((n) => n.getAttribute(attr)).join() };
    drag.timer = setTimeout(activate, DRAG_HOLD_MS);
  };

  function activate() {
    if (!drag || drag.active) return;
    clearTimeout(drag.timer);
    drag.active = true;
    drag.grab = drag.y - drag.el.getBoundingClientRect().top;
    drag.el.style.transition = 'box-shadow 170ms ease, background 170ms ease';
    drag.el.classList.add('is-held');
    listEl.classList.add('is-sorting');
    place(0);
    navigator.vibrate?.(10);
  }

  const onMove = (e) => {
    if (!drag) return;
    if (!drag.active) {
      // Myš: řazení začne hned pohybem, bez čekání na podržení (stránka se myší
      // takhle neposouvá). Prst: pohyb před podržením je posouvání stránky.
      if (drag.mouse && Math.abs(e.clientY - drag.y) > 4) {
        activate();
      } else {
        if (Math.abs(e.clientX - drag.x) > 8 || Math.abs(e.clientY - drag.y) > 8) cancel();
        else drag.y = e.clientY;
        return;
      }
    }
    const { el } = drag;
    const rect = el.getBoundingClientRect();
    const home = rect.top - drag.shift; // kde položka v seznamu opravdu leží
    const wanted = e.clientY - drag.grab; // kde ji chce mít prst
    place(wanted - home);

    // Střed držené položky rozhoduje, mezi které sousedy patří
    const center = wanted + rect.height / 2;
    const others = items().filter((n) => n !== el);
    const next = others.find((n) => {
      const r = n.getBoundingClientRect();
      return center < r.top + r.height / 2;
    }) ?? null;
    if (el.nextElementSibling === next || (next === null && el === others.at(-1)?.nextElementSibling)) return;

    // Sousedé se na nové místo plynule dosunou (odkud byli -> kam patří)
    const tops = new Map(others.map((n) => [n, n.getBoundingClientRect().top]));
    listEl.insertBefore(el, next);
    for (const n of others) {
      const delta = tops.get(n) - n.getBoundingClientRect().top;
      if (!delta) continue;
      n.style.transition = 'none';
      n.style.transform = `translateY(${delta}px)`;
      n.getBoundingClientRect(); // vynutit překreslení, ať animace začne odtud
      n.style.transition = DRAG_EASE;
      n.style.transform = '';
    }
    // Držená položka změnila místo v seznamu, pod prstem ale zůstává
    place(wanted - (el.getBoundingClientRect().top - drag.shift));
  };

  const onUp = () => {
    if (!drag) return;
    const { el, active, before } = drag;
    cancel();
    if (!active) return;
    ignoreClickUntil = Date.now() + 400;
    // Položka plynule dosedne na své místo
    el.style.transition = `${DRAG_EASE}, box-shadow 170ms ease, background 170ms ease`;
    el.style.transform = '';
    el.classList.remove('is-held');
    listEl.classList.remove('is-sorting');
    const ids = items().map((n) => n.getAttribute(attr));
    setTimeout(() => {
      items().forEach((n) => { n.style.transition = ''; n.style.transform = ''; });
      if (ids.join() !== before) onDrop(ids);
    }, 180);
  };

  // Během tažení se stránka nesmí posouvat ani nabízet výběr textu
  const onTouchMove = (e) => { if (drag?.active) e.preventDefault(); };
  const onClick = (e) => {
    if (Date.now() < ignoreClickUntil) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const onContext = (e) => { if (e.target.closest(handle)) e.preventDefault(); };

  listEl.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  listEl.addEventListener('touchmove', onTouchMove, { passive: false });
  listEl.addEventListener('click', onClick, true);
  listEl.addEventListener('contextmenu', onContext);

  return () => {
    cancel();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
}

// ---------- Rozbalovací nabídka u tlačítka ----------
// Otevře se hned pod tlačítkem (když se nevejde, tak nad ním) a zavře se
// ťuknutím mimo. build(menuEl, close) ji naplní obsahem.

export function openMenu(anchor, build) {
  const backdrop = document.createElement('div');
  backdrop.className = 'menu-backdrop';
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  backdrop.append(menu);

  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  build(menu, close);

  const gap = 6;
  const edge = 12;
  const rect = anchor.getBoundingClientRect();
  const left = Math.max(edge, Math.min(rect.left, innerWidth - menu.offsetWidth - edge));
  const below = rect.bottom + gap;
  const fits = below + menu.offsetHeight <= innerHeight - edge;
  const top = fits ? below : Math.max(edge, rect.top - gap - menu.offsetHeight);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  return close;
}

// ---------- Datum ----------

export function todayLabel(date = new Date()) {
  const text = date.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function itemsCount(n) {
  if (n === 1) return '1 položka';
  if (n >= 2 && n <= 4) return `${n} položky`;
  return `${n} položek`;
}

// ---------- Zvýraznění nových věcí ----------
// markNew(id) si zapamatuje, kdy věc přibyla (jen v paměti, nesynchronizuje se).
// Řádek s tím id (data-id, data-task, data-step, data-key…) dostane třídu
// .is-new: podklad --accent-soft drží --new-hold a pak plynule zmizí
// (--new-fade), celkem NEW_MS. Při překreslení během animace se nezačíná znovu
// (animation-delay záporně podle stáří). Soft = jemnější varianta (přišlo od
// druhého, novinky od poslední návštěvy modulu), bez posunu k řádku.
// Vlastní přidání: když je nový řádek mimo viditelnou část svého seznamu,
// plynule se k němu sjede (posouvá se jen sloupec, nikdy stránka).
export const NEW_MS = 1500;
const fresh = new Map(); // id -> { at, soft, revealed }
const NEW_ATTRS = ['id', 'task', 'buy', 'pay', 'step', 'comment', 'key', 'file'];
const NEW_SELECTOR = NEW_ATTRS.map((a) => `[data-${a}]`).join(',');
let newObserver = null;

export function markNew(id, { soft = false } = {}) {
  if (id == null) return;
  fresh.set(String(id), { at: Date.now(), soft, revealed: soft });
  watchNew();
}

// ownOnly: jen vlastní přidání (ne jemné zvýraznění novinek od druhého)
export function isNew(id, { ownOnly = false } = {}) {
  const entry = fresh.get(String(id));
  if (!entry) return false;
  if (Date.now() - entry.at >= NEW_MS) {
    fresh.delete(String(id));
    return false;
  }
  return !(ownOnly && entry.soft);
}

const idOfRow = (el) => {
  for (const a of NEW_ATTRS) if (el.dataset[a] != null) return el.dataset[a];
  return null;
};

function watchNew() {
  if (!newObserver) {
    newObserver = new MutationObserver(scanNew);
    newObserver.observe(document.body, { childList: true, subtree: true });
  }
  requestAnimationFrame(scanNew);
}

function scanNew() {
  for (const id of [...fresh.keys()]) isNew(id);
  if (!fresh.size) {
    newObserver?.disconnect();
    newObserver = null;
    return;
  }
  const now = Date.now();
  for (const el of document.querySelectorAll(NEW_SELECTOR)) {
    const id = idOfRow(el);
    const entry = fresh.get(id);
    if (!entry || el.classList.contains('is-new')) continue;
    // Jen vnější prvek řádku, ne tlačítka uvnitř se stejným id
    const outer = el.parentElement?.closest(NEW_SELECTOR);
    if (outer && idOfRow(outer) === id) continue;
    if (el.closest('.kb-ghost, .menu, .sheet')) continue;
    el.style.setProperty('--new-age', `${-(now - entry.at)}ms`);
    el.classList.add('is-new');
    if (entry.soft) el.classList.add('is-soft');
    el.addEventListener('animationend', (e) => {
      if (e.target !== el) return;
      el.classList.remove('is-new', 'is-soft');
      el.style.removeProperty('--new-age');
    }, { once: false });
    if (!entry.revealed && el.offsetParent) {
      entry.revealed = true;
      revealRow(el);
    }
  }
}

// Posune nejbližší posouvatelný sloupec tak, aby byl řádek vidět
function revealRow(el) {
  let box = el.parentElement;
  while (box && box !== document.body) {
    const oy = getComputedStyle(box).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && box.scrollHeight > box.clientHeight) break;
    box = box.parentElement;
  }
  if (!box || box === document.body) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  if (r.top < b.top) box.scrollBy({ top: r.top - b.top - 8, behavior });
  else if (r.bottom > b.bottom) box.scrollBy({ top: r.bottom - b.bottom + 8, behavior });
}

// Krátké bliknutí prvku (položka panelu, záložka, karta na Domů), když
// přes Realtime přijde novinka. Stejné tokeny jako zvýraznění řádků.
export function blink(el) {
  if (!el) return;
  el.classList.remove('is-blink');
  void el.offsetWidth;
  el.classList.add('is-blink');
  el.addEventListener('animationend', () => el.classList.remove('is-blink'), { once: true });
}

// ---------- Zvuk upozornění na počítači ----------
// macOS u webových push upozornění zvuk nepřehraje, appka si proto zahraje
// krátký tón sama (dva tóny nahoru, asi 300 ms, Web Audio API, bez souboru).
// Prohlížeč pustí zvuk až po první interakci se stránkou: unlockAudio() se
// volá při prvním kliknutí nebo klávese (app.js).
let audioCtx = null;

export function unlockAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

export function playChime() {
  const ctx = unlockAudio();
  if (!ctx) return;
  const t = ctx.currentTime + 0.01;
  for (const [freq, at] of [[659.25, 0], [880, 0.13]]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t + at);
    gain.gain.linearRampToValueAtTime(0.16, t + at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.17);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + at);
    osc.stop(t + at + 0.2);
  }
}
