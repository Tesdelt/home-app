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
  recipe: '<svg viewBox="0 0 24 24"><path d="M5 11h14v4a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5zM3 11h18M9 7c0-1.5 1-1.5 1-3M14 7c0-1.5 1-1.5 1-3"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="m14.5 5-7 7 7 7"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M5 12h13M12.5 6l6 6-6 6"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/></svg>',
  sync: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4"/></svg>',
};

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

// ---------- Gesta na řádcích seznamu ----------
// Řádek je <li class="item" data-id> s tlačítkem .item-main uvnitř.
// Ťuknutí = onTap(li, kam se ťuklo), podržení = onPress(id), potažení doleva = onSwipe(id).
// Vrací funkci na úklid, kterou má pohled zavolat při odchodu.

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 10;

export function rowGestures(listEl, { onTap, onPress, onSwipe }) {
  let gesture = null;
  let ignoreClicksUntil = 0;

  function endGesture() {
    if (!gesture) return;
    clearTimeout(gesture.timer);
    gesture.main.classList.remove('is-dragging');
    gesture = null;
  }

  listEl.addEventListener('pointerdown', (e) => {
    const main = e.target.closest('.item-main');
    if (!main || (e.pointerType === 'mouse' && e.button !== 0)) return;
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
    if (e.target.closest('.item-main')) e.preventDefault();
  });

  listEl.addEventListener('click', (e) => {
    const main = e.target.closest('.item-main');
    if (!main || Date.now() < ignoreClicksUntil) return;
    onTap(main.closest('.item'), e.target);
  });

  return endGesture;
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
