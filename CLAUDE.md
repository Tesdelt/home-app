# Domácnost (home-app)

PWA pro domácnost dvou lidí, Toma a Domi. Nákupní seznam, úkoly, peníze a další drobnosti.
Používá se hlavně na iPhonu jako appka přidaná na plochu (Safari → Sdílet → Přidat na plochu).

## Technologie

- Čisté HTML, CSS a JavaScript (ES moduly), **žádný build krok, žádné npm závislosti**.
  Stejně jako sesterský projekt `Tesdelt/gym-appka`.
- Data v IndexedDB (`js/db.js`), offline přes service worker (`sw.js`).
- Hosting: GitHub Pages z větve `main`, kořen repozitáře. Soubor `.nojekyll` musí zůstat.

## Struktura

```
index.html            kostra: horní lišta, #view, toast, spodní lišta (5 záložek)
css/style.css         všechny styly, barvy v CSS proměnných (světlý + tmavý režim)
js/app.js             start, routy, přepínání pohledů, registrace service workeru
js/router.js          hash router (#/domu, #/nakup, #/ukoly, #/penize, #/vice)
js/db.js              IndexedDB: migrace a základní operace (používá jen store.js)
js/store.js           DATOVÁ VRSTVA: jediné API pro data + subscribe() na změny
js/categories.js      kategorie nákupu, odhad kategorie z názvu, parsování "mléko 2"
js/config.js          členové domácnosti, zobrazovaná verze
js/ui.js              escapeHtml, ikony, toast se Zpět, spodní panel, formátování
js/views/*.js         jednotlivé obrazovky
sw.js                 offline cache
```

### Pohled (js/views/*.js)

Každý pohled exportuje `title` a `async render(el, { params, extraEl, subEl })`.
`render` může vrátit funkci na úklid (typicky odhlášení z `store.subscribe`).
Posluchače událostí věšet na vlastní prvky uvnitř pohledu, ne přímo na `el`
(`#view` je sdílený mezi všemi pohledy).

## Pravidla

- **Pohledy nesahají na `db.js`, jen na `store.js`.** Až přibude synchronizace
  (Supabase), vymění se vnitřek `store.js` a pohledy zůstanou beze změny.
- **Migrace IndexedDB jen přidávat** na konec pole `MIGRATIONS` v `db.js`, nikdy neupravovat
  starší a nikdy nemazat data uživatele.
- **Každé nasazení:** zvednout `VERSION` v `sw.js` i `APP_VERSION` v `js/config.js` (stejné číslo)
  a každý nový soubor přidat do `ASSETS` v `sw.js`, jinak nebude fungovat offline.
- Celé UI česky. V textech jen krátká pomlčka `-`, nikdy dlouhá `—`.
- Mobile-first, dotykové plochy aspoň 44 px, písmo v polích aspoň 16 px (iOS jinak zoomuje).
- Barvy jen přes CSS proměnné z `:root`, ať funguje tmavý režim.
- Žádné knihovny z CDN bez dobrého důvodu, appka musí fungovat offline.

## UX zásady (dohodnuté)

- Zápis do 3 sekund. Jediný povinný údaj je název, zbytek volitelný.
- Musí bavit oba, ne jen autora. Žádné povinné nastavování.
- Mazání bez potvrzovacích dialogů, místo toho toast s tlačítkem Zpět.
- Málo notifikací, jen to, co vyžaduje akci.
- Žádná gamifikace ani body mezi partnery.
- Spodní lišta max. 5 položek. Co se otevírá jen občas, patří do „Více“.

## Stav a plán

Hotovo (0.1.0):
- Kostra, spodní lišta, Domů (přehled dne), Více (kdo jsem, záloha do JSON).
- Nákup: přidání s množstvím („mléko 2“, „2x rohlíky“), automatické kategorie podle obchodu
  (ruční změna se zapamatuje), často kupované a našeptávač, ťuknutí = koupeno,
  podržení = úprava, potažení doleva = smazat se Zpět, Vyčistit koupené.

Další kroky:
1. Synchronizace mezi telefony přes Supabase (realtime), nahradit vnitřek `store.js`.
   Offline: zápis lokálně + fronta změn, konflikty „poslední zápis vyhrává“.
2. Úkoly: jednorázové i opakované (pevný termín vs. od dokončení), přiřazení
   Tom / Domi / kdokoliv, pohledy Dnes / Tento týden / Někdy, sdílený stav
   „hotovo kým a kdy“ (např. prášek pro psa).
3. Peníze: společné výdaje (kdo platil, dělení 50/50 nebo jinak), zůstatek kdo komu kolik
   dluží + Vyrovnat, pravidelné platby. Později import CSV z banky.
4. Více: pes (léky, očkování), záruky a dokumenty, info o domácnosti.

## Testování

Lokálně stačí statický server z kořene repozitáře, např. `python3 -m http.server 8000`,
a otevřít http://localhost:8000. Service worker funguje jen přes http://localhost nebo https.
