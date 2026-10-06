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
