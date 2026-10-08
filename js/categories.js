// Kategorie nákupu v pořadí, v jakém se obvykle prochází obchod,
// a odhad kategorie podle názvu položky.
//
// Odhad je jen výchozí návrh: když uživatel položce kategorii změní,
// zapamatuje se v historii a příště se použije ta jeho (viz store.js).

import { findProduct } from './catalog.js';

export const CATEGORIES = [
  { id: 'ovoce', name: 'Ovoce' },
  { id: 'zelenina', name: 'Zelenina' },
  { id: 'maso', name: 'Maso a ryby' },
  { id: 'pecivo', name: 'Pečivo' },
  { id: 'uzeniny', name: 'Uzeniny' },
  { id: 'mlecne', name: 'Mléčné a vejce' },
  { id: 'trvanlive', name: 'Těstoviny a trvanlivé' },
  { id: 'sladke', name: 'Sladké' },
  { id: 'slane', name: 'Slané' },
  { id: 'napoje', name: 'Nápoje' },
  { id: 'mrazene', name: 'Mražené' },
  { id: 'drogerie', name: 'Drogerie' },
  { id: 'domacnost', name: 'Domácnost' },
  { id: 'pes', name: 'Pro psa' },
  { id: 'ostatni', name: 'Ostatní' },
];

export const DEFAULT_CATEGORY = 'ostatni';

// Kategorie jídla (bez drogerie, domácnosti a potřeb pro psa). Recepty
// nabízejí jen věci z nich.
export const FOOD = ['ovoce', 'zelenina', 'maso', 'pecivo', 'uzeniny', 'mlecne', 'trvanlive', 'sladke', 'slane', 'napoje', 'mrazene'];

// Obchody, které jsou v appce rovnou. Pořadí kategorií = jak se obchod
// prochází. Úpravy a další obchody se ukládají do skladu shops (store.js).
export const BUILTIN_SHOPS = [
  {
    key: 'albert',
    name: 'Albert Černovice',
    order: ['ovoce', 'zelenina', 'maso', 'pecivo', 'uzeniny', 'mlecne', 'trvanlive', 'sladke', 'slane', 'napoje',
      'mrazene', 'drogerie', 'domacnost', 'pes', 'ostatni'],
  },
  {
    key: 'lidl',
    name: 'Lidl Blackfield',
    order: ['pecivo', 'ovoce', 'zelenina', 'mlecne', 'maso', 'uzeniny', 'mrazene', 'trvanlive', 'sladke', 'slane',
      'napoje', 'drogerie', 'domacnost', 'pes', 'ostatni'],
  },
];

export function categoryName(id) {
  return CATEGORIES.find((c) => c.id === id)?.name ?? 'Ostatní';
}

// Začátky slov bez diakritiky. Vyhrává nejdelší shoda, takže
// "houbička" (domácnost) přebije "houby" (zelenina).
const KEYWORDS = {
  ovoce: ['jablk', 'jablic', 'banan', 'hrusk', 'pomeranc', 'citron', 'limet', 'mandarin', 'hrozn', 'jahod', 'boruvk',
    'malin', 'kiwi', 'avokad', 'mango', 'ananas', 'meloun', 'broskv', 'merunk', 'svestk', 'ovoce', 'nektarin', 'grep',
    'tresn', 'visn', 'rybiz', 'ostruzin', 'granatov', 'datl', 'fik'],
  zelenina: ['rajc', 'okurk', 'paprik', 'mrkev', 'mrkv', 'cibul', 'cesnek', 'brambor', 'salat', 'rukol', 'spenat', 'zeli',
    'kapust', 'brokolic', 'kvetak', 'cuket', 'lilek', 'dyne', 'dyni', 'hokkaid', 'petrzel', 'celer', 'redkvick',
    'zampion', 'houb', 'porek', 'bylink', 'bazalk', 'zazvor', 'kopr', 'pazitk', 'zelenin', 'cherry', 'kukuric',
    'rajcat', 'batat', 'chilli', 'repa', 'repu', 'kedlub', 'fenykl', 'hrasek'],
  pecivo: ['rohlik', 'chleb', 'bagel', 'baget', 'housk', 'kaiserk', 'toust', 'croissant', 'kolac', 'buchty', 'buchta',
    'vanock', 'pecivo', 'tortil', 'wrap', 'loupak', 'dalamank', 'knackebrot', 'veka', 'bulk'],
  mlecne: ['mlek', 'mlik', 'jogurt', 'syr', 'syrec', 'tvaroh', 'masl', 'smetan', 'zakys', 'kefir', 'podmasl', 'vejc', 'vajic',
    'vajec', 'mozzarel', 'parmaz', 'eidam', 'gouda', 'cottage', 'skyr', 'ricott', 'mascarpon', 'termix',
    'pomazank', 'lucin', 'creme', 'cheddar', 'feta', 'halloum', 'hermelin', 'niva', 'slehack'],
  maso: ['maso', 'kure', 'kurec', 'krut', 'veprov', 'hovez', 'mlet', 'ryb', 'losos', 'tunak', 'krevet', 'steak', 'rizk',
    'rizek', 'kachn', 'prsa', 'stehn', 'krkovic', 'panenk', 'zebra', 'zebirk', 'gulas', 'treska', 'pstruh'],
  uzeniny: ['slanin', 'sunk', 'salam', 'parky', 'parek', 'parku', 'klobas', 'spekac', 'uzen', 'pancett', 'prosciut',
    'chorizo', 'pastik', 'tlacenk', 'sekan', 'spek', 'burt', 'videnk'],
  trvanlive: ['testovin', 'spaget', 'penne', 'fusill', 'ryz', 'mouk', 'cukr', 'sul', 'pepr', 'olej', 'ocet', 'kecup',
    'horcic', 'majonez', 'tatark', 'konzerv', 'fazol', 'cock', 'cizrn', 'ovesn', 'vlock', 'musli', 'cornflak', 'med',
    'dzem', 'marmelad', 'kakao', 'kav', 'kafe', 'caj', 'koren', 'omack', 'protlak', 'kypri', 'drozd', 'kvasnic',
    'strouhank', 'polevk', 'bujon', 'kuskus', 'bulgur', 'quinoa', 'oliv', 'pesto', 'sojov', 'kokos', 'nudl', 'lasagn'],
  sladke: ['susenk', 'cokolad', 'bonbon', 'zele', 'nutel', 'oplatk', 'tatrank', 'piskot', 'pernik', 'puding', 'dort', 'lizatk', 'zvykack', 'medvidk', 'haribo'],
  slane: ['chips', 'brambur', 'krekr', 'tycink', 'arasid', 'burak', 'orech', 'orisk', 'popcorn', 'krupk', 'preclik',
    'nachos', 'mandl', 'pistaci', 'kesu'],
  mrazene: ['mrazen', 'pizz', 'hranolk', 'led', 'knedlik', 'zmrzlin', 'nanuk'],
  napoje: ['vod', 'mineralk', 'dzus', 'juice', 'limonad', 'kola', 'cola', 'pivo', 'piv', 'vin', 'sodovk', 'tonic',
    'mattoni', 'energet', 'prosecc', 'rum', 'vodk', 'gin', 'whisk', 'kombuch', 'ledov', 'sirup'],
  drogerie: ['sampon', 'mydl', 'zubn', 'kartacek', 'deodorant', 'sprchov', 'kondicion', 'holic', 'vlozk', 'tampon',
    'odlicov', 'krem', 'toaletn', 'toaletak', 'kapesnik', 'vatov', 'vatick', 'nit', 'pleny', 'parfem', 'opalov',
    'naplast', 'ustni', 'lak', 'hreben', 'gumick', 'ziletk'],
  domacnost: ['praci', 'prasek', 'avivaz', 'jar', 'saponat', 'myci', 'mycky', 'mycka', 'houbick', 'uterk', 'sacky',
    'sacek', 'pytl', 'alobal', 'foli', 'pecici', 'bateri', 'zarovk', 'svick', 'cistic', 'savo', 'wc', 'odpadk',
    'rukavic', 'ubrous', 'hadr', 'kapsl', 'lesten'],
  pes: ['granul', 'pamlsk', 'psi', 'pelisek', 'obojek', 'voditk', 'antiparazit'],
};

export function normalize(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const STEMS = Object.entries(KEYWORDS).flatMap(([cat, stems]) => stems.map((s) => [normalize(s), cat]));

export function guessCategory(name) {
  const product = findProduct(name);
  if (product) return product.category;
  const norm = normalize(name);
  if (/\bpro (psa|psy|pejska)\b/.test(norm)) return 'pes';
  const words = norm.split(/[^a-z0-9]+/).filter(Boolean);
  let best = null;
  for (const [stem, cat] of STEMS) {
    if (stem.length <= (best?.[0].length ?? 0)) continue;
    if (words.some((w) => w.startsWith(stem))) best = [stem, cat];
  }
  return best ? best[1] : DEFAULT_CATEGORY;
}

// "mléko 2", "2x mléko", "rohlíky 10 ks", "500 g sýr" -> { name, qty }
const UNIT = '(?:x|ks|kus[uy]?|g|kg|dkg|l|ml|bal(?:en[ií])?)';
const LEADING = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})?\\.?\\s+(.+)$`, 'i');
const TRAILING = new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})?\\.?$`, 'i');

// Posune množství o krok nahoru nebo dolů a zachová jednotku ("2 ks" -> "3 ks").
// Prázdné množství znamená 1. Gramy a mililitry se posouvají po stovkách.
export function stepQty(qty, direction) {
  const m = String(qty ?? '').trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  const unit = m ? m[2] : String(qty ?? '').trim();
  const step = /^(g|ml)$/i.test(unit) ? 100 : 1;
  const current = m ? Number(m[1].replace(',', '.')) : 1;
  const next = Math.max(step, Math.round((current + direction * step) * 100) / 100);
  if (next === 1 && !unit) return '';
  return `${String(next).replace('.', ',')}${unit ? ` ${unit}` : ''}`;
}

// Číslo z množství pro zobrazení v počítadle ("" -> 1)
export function qtyNumber(qty) {
  const m = String(qty ?? '').trim().match(/^(\d+(?:[.,]\d+)?)/);
  return m ? m[1] : '1';
}

export function parseEntry(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  let m = clean.match(LEADING);
  if (m) return { name: capitalize(m[3]), qty: formatQty(m[1], m[2]) };
  m = clean.match(TRAILING);
  if (m) return { name: capitalize(m[1]), qty: formatQty(m[2], m[3]) };
  return { name: capitalize(clean), qty: '' };
}

function formatQty(num, unit) {
  const u = (unit || '').toLowerCase();
  if (!u || u === 'x') return num;
  if (u.startsWith('kus')) return `${num} ks`;
  if (u.startsWith('bal')) return `${num} bal`;
  return `${num} ${u}`;
}

function capitalize(text) {
  const t = text.trim();
  return t.charAt(0).toLocaleUpperCase('cs') + t.slice(1);
}
