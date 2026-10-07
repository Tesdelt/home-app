// Práce s daty. Termíny se ukládají jako text "RRRR-MM-DD" (den bez času),
// takže se dají porovnávat jako řetězce a nezáleží na časovém pásmu.

const pad = (n) => String(n).padStart(2, '0');

export function dayStr(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const today = () => dayStr();

function parts(day) {
  const [y, m, d] = day.split('-').map(Number);
  return { y, m, d };
}

const toDate = (day) => {
  const { y, m, d } = parts(day);
  return new Date(y, m - 1, d);
};

export function addDays(day, n) {
  const date = toDate(day);
  date.setDate(date.getDate() + n);
  return dayStr(date);
}

// Přičte měsíce a den drží v rozsahu měsíce (31. 1. + 1 měsíc = 28. 2.)
export function addMonths(day, n) {
  const { y, m, d } = parts(day);
  const first = new Date(y, m - 1 + n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return dayStr(new Date(first.getFullYear(), first.getMonth(), Math.min(d, last)));
}

export function addInterval(day, every, unit) {
  if (unit === 'day') return addDays(day, every);
  if (unit === 'week') return addDays(day, every * 7);
  if (unit === 'year') return addMonths(day, every * 12);
  return addMonths(day, every);
}

export function daysBetween(from, to) {
  return Math.round((toDate(to) - toDate(from)) / 86400000);
}

export const isSameDay = (timestamp, day = today()) => Boolean(timestamp) && dayStr(new Date(timestamp)) === day;

// "dnes", "zítra", "včera", "před 3 dny", "čt 15. 10."
export function dueLabel(day) {
  const diff = daysBetween(today(), day);
  if (diff === 0) return 'dnes';
  if (diff === 1) return 'zítra';
  if (diff === -1) return 'včera';
  if (diff < 0) return `před ${-diff} dny`;
  return shortDate(day);
}

// Termín i s časem, když ho úkol má: "dnes 20:00"
export const dueTimeLabel = (day, time) => `${dueLabel(day)}${time ? ` ${time}` : ''}`;

export function shortDate(day) {
  const date = toDate(day);
  const text = date.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' });
  return date.getFullYear() === new Date().getFullYear() ? text : `${text} ${date.getFullYear()}`;
}

export function dayHeading(day) {
  const diff = daysBetween(today(), day);
  if (diff === 1) return 'Zítra';
  const text = toDate(day).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function timeLabel(timestamp) {
  return new Date(timestamp).toLocaleTimeString('cs-CZ', { hour: 'numeric', minute: '2-digit' });
}

// Nejbližší den v měsíci (1-31) ode dneška včetně, krátké měsíce končí dřív
export function nextDayOfMonth(dayOfMonth, from = today()) {
  const { y, m, d } = parts(from);
  const clamp = (year, month) => Math.min(dayOfMonth, new Date(year, month, 0).getDate());
  if (clamp(y, m) >= d) return dayStr(new Date(y, m - 1, clamp(y, m)));
  const next = new Date(y, m, 1);
  return dayStr(new Date(next.getFullYear(), next.getMonth(), clamp(next.getFullYear(), next.getMonth() + 1)));
}
