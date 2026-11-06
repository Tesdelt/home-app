// Grafy jako ručně kreslené SVG, bez knihoven. Sdílený modul pro pohledy:
// sloupce (víc řad vedle sebe, záporné pod nulovou osou) a křivka (lomená čára
// s jemně vybarvenou plochou pod ní). Dotyk nebo tažení prstem ukáže svislou
// čáru na nejbližším měsíci a nad grafem štítek s hodnotami všech řad. Štítek
// zůstane i po puštění prstu, ťuknutí mimo graf ho schová.
//
// Na data nesahá, dostane je hotová:
// drawChart(el, {
//   months: ['2026-01', ...],                      osa X
//   series: [{ label, color: 'var(--flow-out)', values: [čísla podle months] }],
//   type: 'bars' | 'line',
//   format: (číslo) => text do štítku,
//   height: výška v px (výchozí 220, menší se nepoužije),
// })
// Vrací funkci na úklid (odebere posluchače na dokumentu).

import { escapeHtml } from './ui.js';

const SVG = 'http://www.w3.org/2000/svg';
const MONTH_SHORT = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
const MONTH_LONG = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];

const MIN_HEIGHT = 220;
const PAD = { top: 12, right: 8, bottom: 36, left: 48 };

const monthParts = (month) => month.split('-').map(Number);
export const monthLabel = (month) => {
  const [y, m] = monthParts(month);
  return `${MONTH_LONG[m - 1]} ${y}`;
};

// Popisek osy Y zkráceně: "20 tis.", "1,5 mil."
function shortNumber(value) {
  const abs = Math.abs(value);
  const fmt = (n) => n.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });
  if (abs >= 1e6) return `${fmt(value / 1e6)} mil.`;
  if (abs >= 1000) return `${fmt(value / 1000)} tis.`;
  return fmt(value);
}

// Hezký krok os (1, 2, 2,5, 5 × 10^n), aby vyšly 3-4 vodicí čáry
function niceStep(range) {
  const raw = range / 3;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10;
  return nice * power;
}

function node(name, attrs = {}) {
  const el = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

export function drawChart(el, { months, series, type = 'bars', format = String, height = MIN_HEIGHT }) {
  const HEIGHT = Math.max(MIN_HEIGHT, Math.round(height));
  el.classList.add('chart');
  el.replaceChildren();
  const width = Math.max(240, el.clientWidth || 340);
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const n = months.length;

  // Rozsah osy Y vždy včetně nuly
  const all = series.flatMap((s) => s.values);
  let min = Math.min(0, ...all);
  let max = Math.max(0, ...all);
  if (min === max) max = 1;
  const step = niceStep(max - min);
  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  const y = (v) => PAD.top + ((max - v) / (max - min)) * plotH;
  const band = plotW / n;
  const cx = (i) => PAD.left + band * (i + 0.5);

  const svg = node('svg', { viewBox: `0 0 ${width} ${HEIGHT}`, width, height: HEIGHT, class: 'chart-svg', role: 'img' });

  // Vodicí čáry a popisky osy Y
  for (let v = min; v <= max + step / 2; v += step) {
    svg.append(node('line', { x1: PAD.left, x2: width - PAD.right, y1: y(v), y2: y(v), class: v === 0 ? 'chart-zero' : 'chart-grid' }));
    const label = node('text', { x: PAD.left - 6, y: y(v) + 4, class: 'chart-label', 'text-anchor': 'end' });
    label.textContent = shortNumber(v);
    svg.append(label);
  }

  // Osa X: zkratky měsíců, u ledna a u prvního měsíce i rok. Když se nevejdou,
  // popisek jen u každého druhého (třetího) měsíce.
  const every = band >= 26 ? 1 : band >= 13 ? 2 : 3;
  months.forEach((month, i) => {
    const [year, m] = monthParts(month);
    const withYear = i === 0 || m === 1;
    if (i % every && !withYear) return;
    const text = node('text', { x: cx(i), y: HEIGHT - PAD.bottom + 16, class: 'chart-label', 'text-anchor': 'middle' });
    text.textContent = MONTH_SHORT[m - 1];
    svg.append(text);
    if (withYear) {
      const yearText = node('text', { x: cx(i), y: HEIGHT - PAD.bottom + 30, class: 'chart-label', 'text-anchor': 'middle' });
      yearText.textContent = String(year);
      svg.append(yearText);
    }
  });

  if (type === 'line') {
    for (const s of series) {
      const points = s.values.map((v, i) => [cx(i), y(v)]);
      const line = points.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
      const area = `${line}L${points[n - 1][0].toFixed(1)},${y(0).toFixed(1)}L${points[0][0].toFixed(1)},${y(0).toFixed(1)}Z`;
      svg.append(node('path', { d: area, class: 'chart-area', style: `fill: ${s.color}` }));
      svg.append(node('path', { d: line, class: 'chart-line', style: `stroke: ${s.color}` }));
      points.forEach(([px, py]) => svg.append(node('circle', { cx: px, cy: py, r: 3, class: 'chart-dot', style: `stroke: ${s.color}` })));
    }
  } else {
    // Sloupce: řady vedle sebe uvnitř měsíce
    const groupW = band * 0.72;
    const barW = groupW / series.length;
    series.forEach((s, k) => {
      s.values.forEach((v, i) => {
        if (!v) return;
        const x = cx(i) - groupW / 2 + barW * k;
        const top = Math.min(y(v), y(0));
        const h = Math.max(1, Math.abs(y(v) - y(0)));
        svg.append(node('rect', { x: x + 0.5, y: top, width: Math.max(1, barW - 1), height: h, rx: Math.min(3, barW / 3), style: `fill: ${s.color}` }));
      });
    });
  }

  // Kurzor: svislá čára na vybraném měsíci a štítek nad grafem
  const cursor = node('line', { y1: PAD.top, y2: HEIGHT - PAD.bottom, class: 'chart-cursor', visibility: 'hidden' });
  svg.append(cursor);
  const hit = node('rect', { x: PAD.left, y: 0, width: plotW, height: HEIGHT, class: 'chart-hit' });
  svg.append(hit);

  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  el.append(svg, tip);

  function show(clientX) {
    const box = svg.getBoundingClientRect();
    const scale = width / box.width;
    const x = (clientX - box.left) * scale;
    const i = Math.max(0, Math.min(n - 1, Math.floor((x - PAD.left) / band)));
    cursor.setAttribute('x1', cx(i));
    cursor.setAttribute('x2', cx(i));
    cursor.setAttribute('visibility', 'visible');
    tip.innerHTML = `<strong>${escapeHtml(monthLabel(months[i]))}</strong>${series.map((s) => `<span class="chart-tip-row"><span class="chart-key" style="background: ${s.color}"></span>${escapeHtml(s.label)}<b>${escapeHtml(format(s.values[i]))}</b></span>`).join('')}`;
    tip.hidden = false;
    // Štítek nad kurzorem, ale nikdy přes okraj grafu
    const left = cx(i) / scale - tip.offsetWidth / 2;
    tip.style.left = `${Math.max(0, Math.min(box.width - tip.offsetWidth, left))}px`;
  }
  function hide() {
    tip.hidden = true;
    cursor.setAttribute('visibility', 'hidden');
  }

  let dragging = false;
  hit.addEventListener('pointerdown', (e) => {
    dragging = true;
    show(e.clientX);
  });
  hit.addEventListener('pointermove', (e) => {
    if (dragging || e.pointerType === 'mouse') show(e.clientX);
  });
  const stop = () => { dragging = false; };
  hit.addEventListener('pointerup', stop);
  hit.addEventListener('pointercancel', stop);
  const outside = (e) => { if (!el.contains(e.target)) hide(); };
  document.addEventListener('pointerdown', outside);

  return () => document.removeEventListener('pointerdown', outside);
}
