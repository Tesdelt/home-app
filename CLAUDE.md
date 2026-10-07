# Domácnost (home-app)

PWA pro domácnost dvou lidí, Toma a Domi. Nákupní seznam, úkoly, peníze a další drobnosti.
Data jsou společná pro oba telefony přes Supabase a vidí je jen tihle dva lidé.
Používá se hlavně na iPhonu jako appka přidaná na plochu (Safari → Sdílet → Přidat na plochu).

## Technologie

- Čisté HTML, CSS a JavaScript (ES moduly), **žádný build krok, žádné npm závislosti**.
  Stejně jako sesterský projekt `Tesdelt/gym-appka`.
- Data v IndexedDB (`js/db.js`) jako lokální kopie, offline přes service worker (`sw.js`).
- Sdílení mezi telefony: Supabase (Postgres + Auth + Realtime). Knihovna `supabase-js`
  je uložená v `js/vendor/supabase.js` (UMD, verze 2.117.3), z CDN se za běhu nic nenačítá.
- Hosting: GitHub Pages z větve `main`, kořen repozitáře. Soubor `.nojekyll` musí zůstat.

## Struktura

```
index.html            kostra: horní lišta, #view, toast, spodní lišta (5 záložek)
css/style.css         všechny styly, barvy v CSS proměnných (světlý + tmavý režim)
js/app.js             start, brána přihlášení, routy, přepínání pohledů, service worker
js/router.js          hash router (#/domu, #/nakup, #/ukoly, #/penize, #/vice)
js/db.js              IndexedDB: migrace a základní operace (jen pro datovou vrstvu)
js/store.js           DATOVÁ VRSTVA: jediné API pro data + subscribe() na změny
js/sync.js            synchronizace se Supabase: fronta změn (outbox), push, pull, Realtime
js/auth.js            přihlášení, ověření členství v domácnosti, odhlášení
js/supabase.js        klient Supabase (z js/vendor/supabase.js)
js/categories.js      kategorie nákupu, odhad kategorie z názvu, parsování "mléko 2"
js/config.js          adresa a veřejný klíč Supabase, zobrazovaná verze
js/ui.js              escapeHtml, ikony, toast se Zpět, spodní panel, formátování
js/views/*.js         jednotlivé obrazovky
js/views/login.js     přihlášení, „Nemáte přístup“, nabídka nahrát stará lokální data
sw.js                 offline cache
supabase/schema.sql   tabulky, RLS politiky, oprávnění rolí, Realtime
supabase/setup-household.sql   jednorázové založení domácnosti a členů
supabase/check-anon.sh         kontrola, že nepřihlášený nic nepřečte ani nezapíše
```

### Jak teče synchronizace

- Pohled zavolá `store.js` → zápis do IndexedDB → `sync.markDirty()` zapíše klíč do skladu
  `outbox` → `sync.js` řádek odešle (`upsert`), hned nebo až bude připojení.
- Od druhého telefonu chodí změny přes Realtime. Navíc se celý stav stáhne při startu,
  po obnovení spojení a při návratu do appky.
- Konflikty: vyhrává novější `updated_at`. Hlídá to klient i trigger `private.keep_newer`.
- Mazání je příznak `deleted` (kvůli offline frontě a tlačítku Zpět). Ven ze `store.js`
  se smazané položky nedostanou.
- Nový synchronizovaný sklad = tabulka v `schema.sql` + záznam v `SPECS` v `js/sync.js`
  + `sync.markDirty()` po každém zápisu ve `store.js`.

### Pohled (js/views/*.js)

Každý pohled exportuje `title` a `async render(el, { params, extraEl, subEl })`.
`render` může vrátit funkci na úklid (typicky odhlášení z `store.subscribe`).
Posluchače událostí věšet na vlastní prvky uvnitř pohledu, ne přímo na `el`
(`#view` je sdílený mezi všemi pohledy).

## Pravidla

- **Pohledy nesahají na `db.js` ani `sync.js`, jen na `store.js`** (a na `auth.js`
  kvůli odhlášení). O Supabase pohledy nic neví.
- **Migrace IndexedDB jen přidávat** na konec pole `MIGRATIONS` v `db.js`, nikdy neupravovat
  starší a nikdy nemazat data uživatele.
- **Každé nasazení:** zvednout `VERSION` v `sw.js` i `APP_VERSION` v `js/config.js` (stejné číslo)
  a každý nový soubor přidat do `ASSETS` v `sw.js`, jinak nebude fungovat offline.
- Celé UI česky. V textech jen krátká pomlčka `-`, nikdy dlouhá `—`.
- Mobile-first, dotykové plochy aspoň 44 px, písmo v polích aspoň 16 px (iOS jinak zoomuje).
- Barvy jen přes CSS proměnné z `:root`, ať funguje tmavý režim.
- Žádné knihovny z CDN bez dobrého důvodu, appka musí fungovat offline.

## Soukromí a bezpečnost

Priorita číslo jedna: data smí vidět jen dva členové domácnosti, nikdo jiný.

- **RLS zapnuté na KAŽDÉ tabulce**, i na každé nové. Politiky: číst a zapisovat smí jen
  přihlášený člen dané domácnosti (`household_id in (select private.my_household_ids())`).
- **Role `anon` nemá žádná práva.** U nové tabulky vždy `revoke all ... from public, anon,
  authenticated` a pak `grant` jen pro `authenticated` a jen to, co je potřeba.
- Každá datová tabulka má sloupec `household_id`.
- **Žádné tajné klíče v kódu.** V `js/config.js` smí být jen Project URL a publishable klíč.
  Secret / `service_role` klíč, hesla ani e-maily členů do repozitáře nikdy nepatří.
- **Registrace v appce není.** Účty se zakládají ručně v Supabase dashboardu, členství
  v `household_members` jen přes SQL Editor (z appky ho změnit nejde).
- Přihlášený, který není členem domácnosti, nevidí nic a dostane „Nemáte přístup“.
  Pohledy s daty se před ověřením vůbec nevykreslí (brána v `js/app.js`).
- Odhlášení smaže lokální kopii dat z telefonu.
- Po každé změně `supabase/schema.sql` doplnit novou tabulku do `supabase/check-anon.sh`
  a skript pustit: nepřihlášený dotaz musí u každé tabulky skončit chybou nebo prázdně.
- Změny schématu jen přidávat do `supabase/schema.sql` tak, aby šel pustit opakovaně
  a nemazal data.

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

Hotovo (0.2.0):
- Přihlášení e-mailem a heslem (Supabase Auth), přihlášení vydrží, Odhlásit ve Více.
  „Kdo jsem“ se bere z `display_name` účtu.
- Synchronizace nákupu a historie mezi telefony: lokální kopie v IndexedDB, fronta změn
  pro offline, Realtime, konflikty podle novějšího `updated_at`.
- Při prvním přihlášení nabídka nahrát položky, které na telefonu byly před sdílením.

Další kroky:
1. Úklid: mazat na serveru staré řádky s `deleted = true` (např. starší než 30 dní).
2. Úkoly: jednorázové i opakované (pevný termín vs. od dokončení), přiřazení
   Tom / Domi / kdokoliv, pohledy Dnes / Tento týden / Někdy, sdílený stav
   „hotovo kým a kdy“ (např. prášek pro psa).
3. Peníze: společné výdaje (kdo platil, dělení 50/50 nebo jinak), zůstatek kdo komu kolik
   dluží + Vyrovnat, pravidelné platby. Později import CSV z banky.
4. Více: pes (léky, očkování), záruky a dokumenty, info o domácnosti.

## Testování

Lokálně stačí statický server z kořene repozitáře, např. `python3 -m http.server 8000`,
a otevřít http://localhost:8000. Service worker funguje jen přes http://localhost nebo https.

Kontrola soukromí po změně schématu: `sh supabase/check-anon.sh`.
