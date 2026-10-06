// Kategorie nákupu v pořadí, v jakém se obvykle prochází obchod,
// a odhad kategorie podle názvu položky.
//
// Odhad je jen výchozí návrh: když uživatel položce kategorii změní,
// zapamatuje se v historii a příště se použije ta jeho (viz store.js).

export const CATEGORIES = [
  { id: 'ovoce', name: 'Ovoce a zelenina' },
  { id: 'pecivo', name: 'Pečivo' },
  { id: 'mlecne', name: 'Mléčné a vejce' },
  { id: 'maso', name: 'Maso a ryby' },
  { id: 'trvanlive', name: 'Trvanlivé' },
  { id: 'mrazene', name: 'Mražené' },
  { id: 'napoje', name: 'Nápoje' },
  { id: 'drogerie', name: 'Drogerie' },
  { id: 'domacnost', name: 'Domácnost' },
  { id: 'pes', name: 'Pro psa' },
  { id: 'ostatni', name: 'Ostatní' },
];

export const DEFAULT_CATEGORY = 'ostatni';

export function categoryName(id) {
  return CATEGORIES.find((c) => c.id === id)?.name ?? 'Ostatní';
}

// Začátky slov bez diakritiky. Vyhrává nejdelší shoda, takže
// "houbička" (domácnost) přebije "houby" (zelenina).
const KEYWORDS = {
  ovoce: ['jablk', 'jablic', 'banan', 'hrusk', 'pomeranc', 'citron', 'limet', 'mandarin', 'hrozn', 'jahod', 'boruvk',
    'malin', 'kiwi', 'avokad', 'mango', 'ananas', 'meloun', 'broskv', 'merunk', 'svestk', 'rajc', 'okurk', 'paprik',
    'mrkev', 'mrkv', 'cibul', 'cesnek', 'brambor', 'salat', 'rukol', 'spenat', 'zeli', 'kapust', 'brokolic',
    'kvetak', 'cuket', 'lilek', 'dyne', 'dyni', 'hokkaid', 'petrzel', 'celer', 'redkvick', 'zampion', 'houb',
    'porek', 'bylink', 'bazalk', 'zazvor', 'kopr', 'pazitk', 'ovoce', 'zelenin', 'cherry', 'kukuric', 'rajcat'],
  pecivo: ['rohlik', 'chleb', 'bagel', 'baget', 'housk', 'kaiserk', 'toust', 'croissant', 'kolac', 'buchty', 'buchta',
    'vanock', 'pecivo', 'tortil', 'wrap', 'loupak', 'dalamank', 'knackebrot', 'veka', 'bulk'],
  mlecne: ['mlek', 'jogurt', 'syr', 'syrec', 'tvaroh', 'masl', 'smetan', 'zakys', 'kefir', 'podmasl', 'vejc', 'vajic',
    'vajec', 'mozzarel', 'parmaz', 'eidam', 'gouda', 'cottage', 'skyr', 'ricott', 'mascarpon', 'termix',
    'pomazank', 'lucin', 'creme', 'cheddar', 'feta', 'halloum', 'hermelin', 'niva'],
  maso: ['maso', 'kure', 'kurec', 'krut', 'veprov', 'hovez', 'mlet', 'slanin', 'sunk', 'salam', 'parky', 'parek',
    'parku', 'klobas', 'spekac', 'uzen', 'ryb', 'losos', 'tunak', 'krevet', 'steak', 'rizk', 'rizek', 'kachn',
    'prsa', 'stehn', 'pancett', 'prosciut', 'chorizo'],
  trvanlive: ['testovin', 'spaget', 'penne', 'fusill', 'ryz', 'mouk', 'cukr', 'sul', 'pepr', 'olej', 'ocet', 'kecup',
    'horcic', 'majonez', 'konzerv', 'fazol', 'cock', 'cizrn', 'ovesn', 'vlock', 'musli', 'cornflak', 'med', 'dzem',
    'nutel', 'kakao', 'kav', 'caj', 'susenk', 'cokolad', 'chips', 'brambur', 'orech', 'rozink', 'koren', 'omack',
    'protlak', 'kypri', 'drozd', 'strouhank', 'polevk', 'bujon', 'arasid', 'kuskus', 'bulgur', 'quinoa', 'oliv',
    'pesto', 'sojov', 'sirup', 'kokos', 'krekr', 'tycink', 'bonbon', 'zele'],
  mrazene: ['mrazen', 'zmrzlin', 'pizz', 'nanuk', 'hranolk', 'led'],
  napoje: ['vod', 'mineralk', 'dzus', 'limonad', 'kola', 'pivo', 'piv', 'vin', 'sodovk', 'tonic', 'mattoni',
    'energet', 'prosecc', 'rum', 'vodk', 'gin', 'whisk', 'kombuch', 'ledov'],
  drogerie: ['sampon', 'mydl', 'zubn', 'kartacek', 'deodorant', 'sprchov', 'kondicion', 'holic', 'vlozk', 'tampon',
    'odlicov', 'krem', 'toaletn', 'kapesnik', 'vatov', 'vatick', 'nit', 'pleny', 'parfem', 'opalov', 'naplast',
    'ustni', 'lak', 'hreben', 'gumick'],
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
