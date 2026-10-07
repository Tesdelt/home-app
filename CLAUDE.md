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
js/push.js            push notifikace: zapnutí a vypnutí na tomto telefonu
js/categories.js      kategorie nákupu, vestavěné obchody, odhad kategorie, parsování "mléko 2"
js/catalog.js         katalog produktů podle kategorií a varianty zápisu ("mlíko" = Mléko)
js/dates.js           termíny jako text RRRR-MM-DD, posun o interval, popisky „dnes“, „zítra“
js/config.js          adresa a veřejný klíč Supabase, zobrazovaná verze
js/ui.js              escapeHtml, ikony, toast se Zpět, spodní panel, gesta na řádcích, formátování
js/views/*.js         jednotlivé obrazovky
js/views/task.js      stránka jednoho úkolu (#/ukoly/<id>): pole, kroky, komentáře
js/views/login.js     přihlášení, „Nemáte přístup“, nabídka nahrát stará lokální data
sw.js                 offline cache
supabase/schema.sql   tabulky, RLS politiky, oprávnění rolí, Realtime
supabase/setup-household.sql   jednorázové založení domácnosti a členů
supabase/check-anon.sh         kontrola, že nepřihlášený nic nepřečte ani nezapíše
supabase/functions/send-reminders/index.ts   Edge Function: ranní upozornění na platby
supabase/.secrets/    soukromé klíče pro Supabase Secrets, v .gitignore, NIKDY necommitovat
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
- `.github/workflows/denni-kontrola.yml` pouští `check-anon.sh` každý den. Drží tím
  bezplatný projekt Supabase vzhůru (jinak se po týdnu bez dotazů uspí) a při chybě
  pošle GitHub e-mail. Žádná tajemství v něm nejsou a být nesmí.
- **Push notifikace:** veřejný VAPID klíč je v `js/config.js`, soukromý jen v Supabase
  Secrets (lokálně v `supabase/.secrets/`, které je v `.gitignore`). Funkce `send-reminders`
  je volatelná bez přihlášení, proto nesmí vracet nic kromě počtu odeslaných zpráv a o každé
  platbě posílá nejvýš jedno upozornění denně (tabulka `payment_reminders`). Nasazuje se
  ručně v Supabase dashboardu (vypnuté „Verify JWT“), po změně `index.ts` ji tam znovu vložit.
  Text notifikace obsahuje názvy a částky plateb a jde přes servery Applu / Googlu.
- Odhlášení zruší na telefonu odběr notifikací.
- Změny schématu jen přidávat do `supabase/schema.sql` tak, aby šel pustit opakovaně
  a nemazal data.

## UX zásady (dohodnuté)

- Zápis do 3 sekund. Jediný povinný údaj je název, zbytek volitelný.
- Musí bavit oba, ne jen autora. Žádné povinné nastavování.
- Mazání bez potvrzovacích dialogů, místo toho toast s tlačítkem Zpět.
- Málo notifikací, jen to, co vyžaduje akci.
- Žádná gamifikace ani body mezi partnery.
- Žádné vysvětlující texty v appce: žádné nápovědy pod poli, popisy ovládání („ťuknutím
  odškrtnete“), vysvětlivky barev ani druhé řádky v prázdných stavech. Zůstávají jen stavové
  údaje, popisky polí, chyby a varování před ztrátou dat.
- Volby u malého tlačítka se otevírají jako nabídka přímo u něj (`openMenu` v `ui.js`),
  spodní panel (`openSheet`) je jen pro větší formuláře.
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

Hotovo (0.3.0):
- Úkoly: rychlé přidání, záložky Dnes / Týden (příštích 7 dní) / Někdy, přiřazení
  kdokoliv / Tom / Domi, opakování (od termínu vs. od splnění). Opakovaný úkol se splněním
  neuzavře, posune se mu termín a zůstane u něj, kdo a kdy ho splnil naposledy. Nový úkol
  dostane termín podle záložky (Dnes = dnes, Týden = za 7 dní, Někdy = bez termínu).
- Peníze: pravidelné platby (měsíčně / čtvrtletně / ročně), kdo platí (člen nebo napůl),
  nahoře souhrn za každého a dohromady (ťuknutím měsíčně / ročně), filtr podle plátce.
  Přidání tlačítkem + v horní liště.
- Domů: karty Úkoly (co je na dnes) a Peníze (měsíční součet, platby splatné do 7 dní).
- Gesta na řádcích (ťuknutí, podržení, potažení) jsou sdílená v `ui.js` (`rowGestures`).

Hotovo (0.4.0):
- Úkoly: barva podle toho, čí úkol je (první člen, druhý člen, oba; pruh vlevo a značka
  vpravo, třídy `who-1` / `who-2` / `who-both`, pomocníci `whoClass` a `whoBadge` v `ui.js`),
  důležitost 1-3 jako číslo v řádku, termín vždy vidět, podrobnosti (poznámka) po podržení.
  Úkol pro oba (`assignee = 'both'`) musí odškrtnout každý za sebe (`doneParts`).
- Nákup: katalog produktů s variantami zápisu (jedna věc = jedna položka ve správné
  kategorii), našeptávač z historie i katalogu, kategorie na rozkliknutí s katalogem
  (nejčastěji kupované nahoře), množství tlačítky - a + v řádku i v katalogu.
  Kategorie rozdělené na Ovoce, Zelenina, Uzeniny, Sladké, Slané atd.
- Obchody: seznam se řadí podle pořadí oddělení ve vybraném obchodě. Vestavěné jsou
  Albert Černovice a Lidl Blackfield (`BUILTIN_SHOPS`), pořadí jde upravit a přidat další.
  Úpravy se sdílí (tabulka `shops`), vybraný obchod si pamatuje každý telefon zvlášť.
- Peníze: tři druhy plateb (pravidelná, jednorázová, na dobu určitou s počtem plateb),
  sekce Zaplatit (splatné do 7 dní a po termínu) / Pravidelné / Jednou / Na dobu,
  odškrtnutí „zaplaceno“ se Zpět (pravidelné se posune splatnost, u plateb na dobu ubude
  zbývající). Barvy plátců stejné jako u úkolů.

Hotovo (0.5.0):
- Push notifikace na platby: zapínají se ve Více na každém telefonu zvlášť (`js/push.js`,
  tabulka `push_subscriptions`). Ráno v 8:01 GitHub Actions zavolá funkci `send-reminders`, ta
  pošle plátci (u platby napůl oběma) upozornění na platby splatné dnes nebo po termínu.
  Na iPhonu funguje jen u appky přidané na plochu.

Hotovo (0.6.0):
- Úkol se otevírá jako samostatná stránka (`#/ukoly/<id>`, `js/views/task.js`), změny se
  ukládají samy. Stránka má schválně málo nad komentáři: název, řadu malých tlačítek
  (pro koho, důležitost, termín, opakování, kroky; volby v nabídce přímo u tlačítka)
  a podrobnosti sbalené na tři řádky. Hlavní obsah jsou komentáře. V seznamu splní úkol jen ťuknutí na kolečko, ťuknutí na řádek ho otevře.
- Komentáře k úkolům (tabulka `task_comments`, sklad `comments`): řazené podle přidání,
  s autorem, vlastní jdou upravit i smazat. Nepřečtené komentáře od druhého jsou v seznamu
  zvýrazněné (a tečkou u záložky Úkoly), dokud úkol neotevřu. Kdy jsem úkol viděl, si
  pamatuje každý telefon zvlášť (meta `commentsSeen`), nesynchronizuje se.
- Kroky úkolu (`steps` v úkolu): jdou po sobě, každý má vlastní termín, termín úkolu se řídí
  krokem, který je na řadě, po posledním je úkol hotový. Schválně schované pod
  „Rozdělit na kroky“, většina úkolů je nemá. Úkol s kroky se neopakuje a naopak.

Hotovo (0.8.0):
- Nový úkol se zakládá tlačítkem + v horní liště: otevře stránku úkolu v režimu konceptu
  (`#/ukoly/novy`), kde se předem nastaví všechno včetně kroků a zvonku, a úkol vznikne až
  tlačítkem Přidat (nebo Enterem v názvu). Rychlé pole v seznamu už není.

Hotovo (0.7.0):
- Zvonek u přidání úkolu (výchozí vypnuto, platí pro jeden úkol): po odeslání úkolu na
  server dostanou ostatní členové push „Nový úkol od: …“. Fronta v meta `notifyQueue`
  (`sync.js`), posílá funkce `send-reminders` s tělem `{ task, title }` a přihlášením člena.

Další kroky:
1. Notifikace i na úkoly (jen to, co vyžaduje akci).
2. Úklid: mazat na serveru staré řádky s `deleted = true` (např. starší než 30 dní).
3. Peníze, další část: společné jednorázové výdaje (kdo platil, dělení 50/50 nebo jinak),
   zůstatek kdo komu kolik dluží + Vyrovnat. Později import CSV z banky.
4. Více: pes (léky, očkování), záruky a dokumenty, info o domácnosti.

## Testování

Lokálně stačí statický server z kořene repozitáře, např. `python3 -m http.server 8000`,
a otevřít http://localhost:8000. Service worker funguje jen přes http://localhost nebo https.

Kontrola soukromí po změně schématu: `sh supabase/check-anon.sh`.
