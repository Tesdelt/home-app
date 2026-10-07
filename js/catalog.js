// Katalog běžných produktů podle kategorií.
//
// Zápis: 'Název|jiný zápis|další zápis'. První je název, pod kterým se věc
// objeví na seznamu, ostatní jsou varianty, jak ji lidé píšou ("mlíko").
// Díky nim nevzniknou na seznamu dvě položky pro totéž a věc padne do správné
// kategorie. Co v katalogu není, zařadí odhad podle názvu (js/categories.js).

const RAW = {
  ovoce: ['Jablka|jablko|jabka|jabko', 'Banány|banán|banany', 'Citrony|citron|citrón|citróny', 'Pomeranče|pomeranč',
    'Mandarinky|mandarinka', 'Hrušky|hruška', 'Hroznové víno|hrozny|víno hroznové', 'Jahody|jahoda', 'Borůvky|borůvka',
    'Maliny|malina', 'Kiwi', 'Avokádo|avokado', 'Mango', 'Ananas', 'Meloun', 'Limetky|limetka', 'Broskve|broskev',
    'Nektarinky|nektarinka', 'Švestky|švestka', 'Meruňky|meruňka', 'Grep|grapefruit|grepy'],
  zelenina: ['Rajčata|rajče|rajčátka|rajčata cherry|cherry rajčata', 'Okurka|okurky|okurek', 'Paprika|papriky',
    'Cibule|cibula|cibulka', 'Česnek|česnek', 'Brambory|brambora|zemáky|erteple', 'Mrkev|mrkve', 'Salát|ledový salát',
    'Rukola', 'Špenát|špenát listový', 'Zelí', 'Brokolice', 'Květák', 'Cuketa|cukety', 'Lilek', 'Žampiony|žampióny|houby',
    'Pórek', 'Petržel', 'Celer', 'Ředkvičky|ředkvička', 'Jarní cibulka', 'Kukuřice', 'Dýně|hokkaido', 'Batáty|batát',
    'Zázvor', 'Bazalka', 'Pažitka', 'Chilli papričky|chilli'],
  maso: ['Kuřecí prsa|kuřecí|kuře prsa', 'Kuřecí stehna', 'Celé kuře|kuře', 'Mleté maso|mleté|mletý maso',
    'Vepřová krkovice|krkovice|krkovička', 'Vepřová kýta|vepřové', 'Vepřová panenka|panenka', 'Hovězí|hovězí maso',
    'Hovězí steak|steak', 'Krůtí prsa|krůtí', 'Losos', 'Tuňák|tuňák v konzervě', 'Rybí prsty', 'Krevety', 'Kachna'],
  uzeniny: ['Šunka|sunka', 'Salám|salam', 'Párky|párek|parky', 'Klobása|klobásy', 'Slanina|špek', 'Špekáčky|buřty|špekáček',
    'Vídeňské párky|vídeňky', 'Paštika', 'Tlačenka', 'Prosciutto|parmská šunka', 'Chorizo', 'Sekaná'],
  pecivo: ['Rohlíky|rohlík|rohlik|rohliky', 'Chleba|chléb|chleb', 'Bagety|bageta', 'Housky|houska', 'Toustový chleba|toustový chléb|tousty',
    'Kaiserky|kaiserka', 'Croissanty|croissant', 'Koláče|koláč', 'Vánočka', 'Tortilly|tortilla|tortily', 'Dalamánky|dalamánek',
    'Loupáky|loupák', 'Buchty', 'Knäckebrot|knackebrot'],
  mlecne: ['Mléko|mlíko|mleko|mliko', 'Máslo|maslo', 'Vejce|vajíčka|vajíčko|vejca', 'Jogurt bílý|jogurt|bílý jogurt',
    'Jogurty ovocné|ovocný jogurt', 'Sýr eidam|sýr|eidam|syr', 'Mozzarella|mozarela', 'Parmazán', 'Tvaroh', 'Smetana na vaření|smetana',
    'Smetana ke šlehání|šlehačka', 'Zakysaná smetana|zakysanka', 'Kefír|kefir', 'Cottage', 'Skyr', 'Lučina|pomazánkové',
    'Hermelín', 'Niva', 'Feta|balkánský sýr', 'Cheddar', 'Tavený sýr', 'Rostlinné mléko|ovesné mléko|mandlové mléko'],
  trvanlive: ['Těstoviny|testoviny', 'Špagety|spagety', 'Rýže|ryze', 'Mouka hladká|mouka', 'Mouka polohrubá', 'Cukr', 'Sůl',
    'Pepř', 'Olej slunečnicový|olej', 'Olivový olej', 'Ocet', 'Kečup', 'Hořčice', 'Majonéza|tatarka', 'Rajčatový protlak|protlak',
    'Loupaná rajčata|rajčata v konzervě', 'Fazole', 'Čočka', 'Cizrna', 'Ovesné vločky|vločky', 'Müsli|musli', 'Med', 'Džem|marmeláda',
    'Káva|kafe', 'Čaj', 'Kakao', 'Strouhanka', 'Kypřicí prášek', 'Droždí|kvasnice', 'Bujón|bujon', 'Kuskus', 'Sójová omáčka',
    'Pesto', 'Olivy', 'Kukuřice v konzervě', 'Instantní polévka|polévka'],
  sladke: ['Čokoláda|cokolada', 'Sušenky|susenky', 'Bonbóny|bonbony', 'Nutella|nutela', 'Tyčinky müsli|müsli tyčinky',
    'Oplatky|tatranky', 'Piškoty', 'Perník', 'Puding', 'Želé medvídci|medvídci|haribo'],
  slane: ['Chipsy|brambůrky|chips', 'Tyčinky slané|tyčinky', 'Krekry', 'Arašídy|buráky', 'Oříšky|ořechy', 'Popcorn',
    'Křupky', 'Preclíky', 'Nachos'],
  napoje: ['Voda neperlivá|voda', 'Minerálka|perlivá voda|mattonka', 'Džus|juice', 'Limonáda|limča', 'Kola|coca cola|cola',
    'Pivo|piva', 'Víno bílé|víno|bílé víno', 'Víno červené|červené víno', 'Prosecco', 'Sirup', 'Tonic', 'Energetický nápoj|energeťák',
    'Ledový čaj', 'Nealko pivo'],
  mrazene: ['Mražená zelenina', 'Mražená pizza|pizza', 'Hranolky', 'Mražené ovoce', 'Zmrzlina', 'Nanuky|nanuk', 'Led', 'Mražený špenát',
    'Mražené knedlíky|knedlíky'],
  drogerie: ['Toaletní papír|toaleťák', 'Šampon|šampón', 'Sprchový gel|sprcháč', 'Mýdlo|tekuté mýdlo', 'Zubní pasta|pasta na zuby',
    'Zubní kartáček|kartáček', 'Deodorant|deo', 'Papírové kapesníky|kapesníky|kapesníčky', 'Vatové tyčinky', 'Vložky', 'Tampony',
    'Holicí strojek|žiletky', 'Krém na ruce|krém', 'Opalovací krém', 'Náplasti'],
  domacnost: ['Prací gel|prací prášek|prášek na praní', 'Aviváž', 'Jar|prostředek na nádobí', 'Tablety do myčky|kapsle do myčky',
    'Houbičky na nádobí|houbičky', 'Pytle na odpadky|pytle', 'Papírové utěrky|utěrky', 'Alobal', 'Potravinová fólie|fólie',
    'Pečicí papír', 'Sáčky na svačinu|sáčky', 'Čistič WC|wc čistič', 'Savo', 'Baterie', 'Žárovka', 'Svíčky', 'Ubrousky'],
  pes: ['Granule|granule pro psa', 'Pamlsky|pamlsky pro psa', 'Konzerva pro psa|psí konzerva', 'Sáčky na psí hovínka|pytlíky pro psa',
    'Žvýkací tyčinky'],
};

const norm = (text) => String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// { name, category, keys: [normalizované názvy] } v pořadí katalogu
export const PRODUCTS = Object.entries(RAW).flatMap(([category, list]) => list.map((entry) => {
  const [name, ...aliases] = entry.split('|');
  return { name, category, keys: [...new Set([name, ...aliases].map(norm))] };
}));

const BY_KEY = new Map();
for (const product of PRODUCTS) for (const key of product.keys) if (!BY_KEY.has(key)) BY_KEY.set(key, product);

// Produkt podle přesného názvu nebo některé z variant zápisu
export function findProduct(name) {
  return BY_KEY.get(norm(name)) ?? null;
}

// Produkty, u kterých některé slovo názvu nebo varianty začíná hledaným textem
export function searchProducts(query, limit = 8) {
  const q = norm(query);
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const product of PRODUCTS) {
    if (product.keys.some((key) => key.startsWith(q))) starts.push(product);
    else if (product.keys.some((key) => key.split(' ').some((word) => word.startsWith(q)))) contains.push(product);
  }
  return [...starts, ...contains].slice(0, limit);
}

export const productsIn = (category) => PRODUCTS.filter((p) => p.category === category);
