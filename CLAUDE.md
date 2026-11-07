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
js/router.js          hash router (#/domu, #/nakup, #/ukoly, #/penize, #/vice, #/recepty)
js/db.js              IndexedDB: migrace a základní operace (jen pro datovou vrstvu)
js/store.js           DATOVÁ VRSTVA: jediné API pro data + subscribe() na změny
js/sync.js            synchronizace se Supabase: fronta změn (outbox), push, pull, Realtime
js/auth.js            přihlášení, ověření členství v domácnosti, odhlášení
js/supabase.js        klient Supabase (z js/vendor/supabase.js)
js/push.js            push notifikace: zapnutí a vypnutí na tomto telefonu
js/categories.js      kategorie nákupu, vestavěné obchody, odhad kategorie, parsování "mléko 2"
js/catalog.js         katalog produktů podle kategorií a varianty zápisu ("mlíko" = Mléko)
js/catalogui.js       řádek bublinek pod polem + katalog kategorie, společné pro nákup a recepty
js/dates.js           termíny jako text RRRR-MM-DD, posun o interval, popisky „dnes“, „zítra“
js/config.js          adresa a veřejný klíč Supabase, zobrazovaná verze
js/ui.js              escapeHtml, ikony, toast se Zpět, spodní panel, gesta na řádcích, formátování
js/views/*.js         jednotlivé obrazovky
js/views/task.js      stránka jednoho úkolu (#/ukoly/<id>): pole, kroky, komentáře
js/views/wishes.js    wishlist a bucketlist (#/wishlist, #/bucketlist), jedno rozhraní
js/views/docs.js      administrativa (#/administrativa): dokumenty podle kategorií, společné / osobní
js/views/notes.js     Byt (#/info): poznámky o bytě
js/views/demo.js      skrytá ukázka všech komponent (#/ukazka), viz Design systém
js/views/moneycharts.js  Peníze, grafy Skutečnosti (#/penize/grafy/<segment>)
js/chart.js           ručně kreslené SVG grafy (sloupce, křivka, štítek po dotyku), bez knihoven
js/views/recipes.js   recepty (#/recepty, z Domů): seznam, recept, úprava, „co uvařit“
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
- Barvy jen přes CSS proměnné z `:root`, ať funguje tmavý režim. Hlavní barva je teplá
  (terakota), tyrkysová se nepoužívá. Barvy „čí to je“: Domi růžová, Tom modrá, společné světlejší zelená. V řádcích
  je ukazuje jen širší pruh vlevo, kolečko s iniciálou tam není. Důležitost: šedá, okrová,
  malinová.
- Žádné knihovny z CDN bez dobrého důvodu, appka musí fungovat offline.

## Soukromí a bezpečnost

Priorita číslo jedna: data smí vidět jen dva členové domácnosti, nikdo jiný.

- **RLS zapnuté na KAŽDÉ tabulce**, i na každé nové. Politiky: číst a zapisovat smí jen
  přihlášený člen dané domácnosti (`household_id in (select private.my_household_ids())`).
- **Role `anon` nemá žádná práva.** U nové tabulky vždy `revoke all ... from public, anon,
  authenticated` a pak `grant` jen pro `authenticated` a jen to, co je potřeba.
- Každá datová tabulka má sloupec `household_id`.
- Co má vidět jen jeden člen (soukromé úkoly), musí hlídat RLS (`private_to = auth.uid()`),
  nikdy jen filtr v appce: data by se jinak dostala do druhého telefonu.
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
- Odhlášení zruší na telefonu odběr notifikací (po dalším přihlášení se zapnou sama).
- Jednou zapnutá upozornění zůstávají zapnutá, dokud je uživatel sám nevypne (meta
  `pushWanted`). Telefon odběr občas zahodí sám, proto ho `push.ensure()` po přihlášení
  a při každém návratu do appky potichu obnoví a znovu zapíše na server. Obecně: co si
  uživatel jednou nastavil, appka drží sama a neptá se na to znovu.
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
- Když ťuknutí otevře něco, kde se má hned psát (nový úkol, krok, recept, platba), musí
  rovnou vyjet klávesnice: na začátku obsluhy ťuknutí zavolat `holdKeyboard()` z `ui.js`
  a po vykreslení dát poli fokus. Na iPhonu jinak klávesnice nevyjede.
- Ruční řazení je vždy podržet a přetáhnout (`dragSort` v `ui.js`), nikdy šipky
  nahoru/dolů. Pohyb musí být plynulý s lehkou animací (položka jede s prstem, ostatní
  uhýbají), nic nesmí skákat po blocích. Totéž platí pro další pohyby v rozhraní. Rozbalené věci se zavírají dalším ťuknutím na ně, ne tlačítkem Hotovo.
- Volby u malého tlačítka se otevírají jako nabídka přímo u něj (`openMenu` v `ui.js`),
  spodní panel (`openSheet`) je jen pro větší formuláře.
- Spodní lišta (jen mobil) max. 5 položek. Další moduly (recepty, administrativa, wishlist, bucketlist,
  info o domácnosti a každý nový) mají dlaždici na Domů. „Nastavení“ (trasa `#/vice`) je jen nastavení aplikace
  (účet, synchronizace, upozornění, záloha), moduly do něj nepatří.

### Počítač a tablet

- **Mobil (do 599 px) se nemění.** Tablet 600-1023 px: mobilní rozvržení v jednom sloupci
  uprostřed (max. asi 640 px). Počítač od 1024 px: vlastní rozvržení (níž).
- Hranice 1024 px je v CSS (media queries) a v JS jediný sdílený `isDesktop()` /
  `onDesktopChange()` z `ui.js`; při přechodu přes hranici `app.js` pohled překreslí.
  Trasy (hash) jsou stejné, na počítači se jen jinak vykreslí.
- Navigace na počítači je levý panel (`.sidenav`, plní `app.js`): Domů, Nákup, Úkoly,
  Peníze, Recepty, Administrativa, Wishlist, Bucketlist, Byt, dole Nastavení. Spodní lišta
  se schová, u modulů není šipka zpět (zůstává jen na podstránkách).
- Myš: jemný podklad při najetí (`@media (hover: hover) and (pointer: fine)`). Na řádku
  s `rowGestures` otevře pravé tlačítko i tři tečky při najetí (`.row-more`) nabídku se
  stejnými akcemi jako podržení a potažení (`pressLabel`, `actions`, Smazat). `dragSort`
  myší začne hned pohybem, bez podržení.
- Úkoly, Recepty, Administrativa, Wishlist, Bucketlist a Byt jsou na počítači seznam (vlevo,
  380 px) a detail (vpravo) vedle sebe (`splitView` v `js/split.js`, pohled má `split = true`).
  `#/ukoly/<id>` vykreslí obojí, vybraný řádek je zvýrazněný (`.is-selected`), bez vybrané
  položky je vpravo prázdný stav modulu. Detail se sám neotevírá (u úkolů by se komentáře
  označily jako přečtené). Nová položka (+) se otevře vpravo jako koncept, smazání otevřené
  položky detail zavře. Režimy na místě (přesun úkolu, recept do receptu) fungují i tak.
  Recepty bez otevřeného receptu mají mřížku přes celou šířku, s otevřeným 2 sloupce vlevo.
- Domů na počítači (`js/views/homedesk.js`): přehled ve dvou sloupcích místo dlaždic
  (moduly jsou v levém panelu). Vlevo úkoly na dnes a po termínu (kolečko splní, řádek
  otevře) a nákup s odškrtnutím. Vpravo Peníze segmentu (meta `moneySegment`, jinak
  přihlášený): karta posledního měsíce, kategorie přes limit, platby k zaplacení do 7 dní,
  cíle a malý graf zůstatku za 12 měsíců bez voleb. Mobil má dál dlaždice.
- Nákup na počítači: vlevo pole a seznam, vpravo trvale otevřený katalog kategorií
  (`catalogPanel` v `catalogui.js`, stejné řádky jako katalog v panelu), přidání kliknutím.
- Podsekce levého panelu nastavují stav modulu: segment Peněz (meta `moneySegment`), filtr
  Úkolů (meta `taskFilter`: all / me / other / both, jen na počítači, i tlačítko v `.toolbar`
  Úkolů), záložku Receptů (`#/recepty/recepty`, `#/recepty/skills`, `#/recepty/zasoby`)
  a část Administrativy (`#/administrativa/spolecne`, `/osobni`). „Grafy“ u Peněz vede na
  `#/penize/grafy`, které na počítači vykreslí Peníze a odroluje na graf.
- Peníze na počítači: sloupce se posouvají každý zvlášť, stránka jako celek ne. Vlevo
  souhrn, Cíle a platby (přepínač segmentů je schovaný, segment se volí v levém panelu a je
  v hlavičce jako podtitul); uprostřed Skutečnost; od 1280 px vpravo graf, pod 1280 px graf
  mezi kartou Skutečnosti a kategoriemi (graf se jen přesune). Graf (`renderCharts(..., { embedded: true, onMonth })` z `moneycharts.js`, stejné
  volby a meta `moneyChart`). Ťuknutí na měsíc v grafu přepne Skutečnost (`onSelect`
  v `drawChart`). `#/penize/grafy/<segment>` na počítači vykreslí Peníze a odroluje na graf.
- Nastavení na počítači: karty ve 2 sloupcích.
- Úkoly ve sloupcích (`js/views/taskcolumns.js`, jen počítač): v `.toolbar` Úkolů přepínač
  Seznam / Sloupce (meta `taskLayout`). Sloupce podle řazení: Termín (Po termínu, Dnes, Tento
  týden, Později, Bez termínu) nebo Pro koho (členové, Oba, Kdokoliv); ostatní řazení mají
  sloupce podle termínu. Karta = stejný obsah jako řádek. Přetažení karty myší do jiného
  sloupce změní termín (Dnes = dnes, Tento týden = za 3 dny, Později = za 14 dní, Bez termínu
  = bez termínu; do Po termínu nejde) nebo pro koho, toast se Zpět. Klik otevře detail vpravo
  a sloupce se zúží (posouvají se vodorovně). Klávesa N kdekoliv v Úkolech (mimo psaní do
  pole) = nový úkol.
- Peníze > Tabulka (`#/penize/tabulka/<segment>`, `js/views/moneytable.js`, jen počítač, na
  mobilu přesměruje na `#/penize`): řádky kategorie výdajů, pod nimi Příjmy a Přesuny,
  sloupce měsíce období (Období sdílí s grafem: `periodMonthsOf`, `openPeriodMenu`,
  `loadChartPrefs` / `saveChartPrefs` z `moneycharts.js`), na konci Průměr a Limit.
  Buňka nad limitem podbarvená `budgetColor` (28 % přes podklad). Záhlaví řádků i sloupců
  sticky. Klik na kategorii rozbalí položky, klik do Limitu ho upraví v buňce (Enter /
  opuštění uloží přes `setBudget`, Esc zruší), klik na měsíc otevře Skutečnost toho měsíce.
  „Srovnat 2 měsíce“: dva vybrané měsíce vedle sebe a sloupec Rozdíl.
- Klávesnice: Esc zavře nabídku, dialog i otevřený detail (předtím opustí pole, ať se
  změna uloží), fokus je vidět (outline `--text-2`).

## Design systém

Appka má působit jako jeden celek. **Nové obrazovky se skládají jen z komponent níž.
Nový styl se píše, až když komponenta opravdu chybí, a pak se přidá sem i na `#/ukazka`.**
Všechny komponenty ve všech stavech jsou na skryté stránce `#/ukazka` (`js/views/demo.js`),
po změně vzhledu ji projít ve světlém i tmavém režimu na šířce 375 px.

### Tokeny (`:root` v `css/style.css`, světlý i tmavý režim)

- Písmo, jen 4 velikosti: `--fs-title` 28 (nadpis stránky), `--fs-section` 19 (nadpis sekce,
  název na stránce položky), `--fs-text` 16 (text, pole, tlačítka), `--fs-small` 13 (drobný text).
- Rozestupy, jen jedna škála: `--s1` 4, `--s2` 8, `--s3` 12, `--s4` 16, `--s5` 24. Jiné hodnoty
  v `padding`, `margin` a `gap` nepoužívat (výjimka jsou vlasové 1-3 px a `calc` se safe-area).
- Zaoblení: `--radius` 14 (karty, panely, nabídka), `--radius-sm` 10 (tlačítka, čipy, pole).
- Barvy s pevným významem:
  - `--accent` (oranžová) jen pro hlavní akci (tlačítko +, Přidat) a aktivní stav
    (aktivní záložka, zapnutý zámek / zvonek / opakování). Nic dalšího.
  - barvy osob jen pro osoby: `--who-2` Tom modrá, `--who-1` Domi růžová, `--who-both` oba
    zelená, kdokoliv neutrální (`whoClass()` z `ui.js`).
  - `--danger` (červená) jen pro „po termínu“ a mazání, **vždy s ikonou** (třída `.is-late`
    přidá hodiny, `.btn-danger` a `.menu-item.is-danger` koš), ať se neplete s růžovou Domi.
  - každý modul má vlastní barvu ikony na Domů (`--mod-*`, třída `.mod-<trasa>`): Úkoly
    jantarová, Nákup terakota, Peníze tmavě zlatá, Recepty světle oranžová, Administrativa
    hnědá, Wishlist fialová, Bucketlist žlutá, Byt šedofialová. Nikdy modrá, růžová, zelená
    ani červená. Nový modul dostane další teplý odstín, který ještě není použitý.
  - Peníze, skutečnost: kategorie jsou běžné řádky seznamu bez pruhu osoby, bez barev
    a ikon, `items` šedé podřádky `.money-shop` (ukázka na `#/ukazka`).
  - Peníze: přepínač segmentů jsou jména členů a „Společné“ (bez barev osob). Barevný pruh
    plateb v seznamu se nemění: člen jeho barvou, Společné zelenou.
  - Peníze, Skutečnost: `--flow-in` (Příjmy, olivová), `--flow-out` (Výdaje, vínová),
    `--flow-move` (Přesuny, šedá = `--text-2`). Jen u čísla v kartě a jako tečka `.flow-dot`
    před nadpisem skupiny; řádky a částky v seznamu zůstávají neutrální.
  - grafy: řady Přišlo / Utraceno / Odloženo mají barvy toků, ostatní řady paletu
    `--chart-1` (švestková), `--chart-2` (hnědá), `--chart-3` (břidlicová), v tomto pořadí.
  - ostatní stavový text je šedý (`--text-2`): opakování, „hotovo Tom, zbývá Domi“, počty.
  - důležitost úkolu (číslo v řádku): 1 šedá, 2 žlutá (`--warn`), 3 červená. Je to jediná
    výjimka, kde je červená bez ikony.

### Komponenty

- **Hlavička stránky**: název, na podstránce vlevo šipka zpět, vpravo nejvýš jedno hlavní
  tlačítko `.add-btn` (+). Šipku zpět na Domů mají všechny moduly včetně Úkolů, Nákupu a Peněz (bez ní je jen Domů
  a Nastavení), kreslí ji `app.js` sám,
  stránka položky má vlastní `.detail-head` se šipkou. Vedlejší ovládání (řazení, výběr
  obchodu, přepínač záložek, „Co uvařit“) patří do řádku `.toolbar` nad obsahem, ne do hlavičky.
- **Karta** `.card` (Nastavení, souhrn plateb) a **dlaždice modulu** `.card.tile` na Domů.
  Domů je jednotná mřížka `.tiles`: všechny moduly jako stejně velké dlaždice ve 2 sloupcích,
  žádné velké karty, vše se vejde na iPhone bez posouvání. V dlaždici je jen barevná ikona,
  název a jedna základní informace `.card-line` („3 na dnes“, „6 položek“, „1 k zaplacení“),
  žádné výpisy položek. Po termínu je „1 po termínu“ červeně s ikonou, prázdný modul „Prázdné“.
- **Řádek seznamu** `.item` > `.item-main` v `ul.item-list.group`: všude stejná výška a odsazení,
  vlevo pruh v barvě osoby (`.has-stripe` + `whoClass`), `.item-name`, šedý `.item-sub`,
  nadpis skupiny `li.cat-head`. Gesta přes `rowGestures`.
- **Segmentový přepínač** `.segmented`: vybraný stav je všude stejný (světlý podklad, tučně),
  bez barev osob.
- **Čip** `.chip` a malé tlačítko volby `.opt`, **nabídka** `openMenu` (u tlačítka) a
  **spodní panel** `openSheet`: vždy plné, neprůhledné pozadí.
- **Prázdný stav** `emptyState(ikona, nadpis, věta)`: ikona, nadpis a jedna věta, co sem
  patří, s příkladem. Jediné místo, kde je v appce vysvětlující text.
- **Rozbalovací řádek** `li.fold` > `.fold-head` + `.fold-body` a `toggleFold(li)` z `ui.js`:
  plynulé rozbalení, v jednom seznamu nejvýš jeden rozbalený, další ťuknutí zavře, šipka
  jen s `.has-items`. Rozbalení se nikde nepamatuje. `rowGestures` hlavičky ignoruje.
  Používá Skutečnost i kategorie plateb; každé další rozbalování v seznamu přes něj.
- **Graf** `drawChart(el, { months, series, type, format })` z `js/chart.js`: SVG bez
  knihoven, sloupce (víc řad vedle sebe, záporné pod nulou) nebo křivka s jemnou plochou.
  Dotyk / tažení ukáže svislou čáru a štítek s hodnotami, zůstane po puštění, ťuknutí mimo
  ho schová. Osa X zkratky měsíců (u ledna a na začátku i rok), osa Y 3-4 čáry („20 tis.“).
- **Pruh naplnění** `.budget-bar` (> `span` se šířkou v %) pod názvem v řádku seznamu.
  U limitu barva podle naplnění z `budgetColor(podíl)` v `ui.js`: šedá (`--bar-0`), do třetiny
  přechází do zelené (`--bar-1`), od poloviny žlutá (`--bar-2`), ke konci oranžová (`--bar-3`),
  od 95 % a nad limitem červená (`--bar-4`). Mezi body se barvy plynule míchají
  (`color-mix`). Výslovné přání Toma, jediná výjimka z pravidel pro zelenou a červenou.
  Cíl `.is-goal` má pevně `--flow-move`. Částka vedle ve tvaru „X / Y Kč“ stejně velká a tučná jako ostatní
  částky (`.item-amount`), část „/ Y Kč“ ve spanu `.budget-of` šedě (`--text-2`) a obyčejně.
  Překročený limit částku nezvýrazňuje, stačí okrový pruh.
- **Toast** `toast` / `undoToast` (se Zpět).
- **Ikony** jen ze sady `ICONS` v `ui.js`: čárové, viewBox 24, tloušťka 1.8, bez výplně.

### Počítač

- **Levý panel** `.sidenav` (240 px, `js/sidenav.js`): název Domácnost, moduly s ikonou
  v barvě modulu (`--mod-*`), aktivní položka `--accent-soft` + `--accent` jako aktivní
  záložka, tečka nepřečtených u Úkolů, počet k zaplacení u Peněz (`.side-badge`).
  Moduly s podsekcemi (`.side-group.has-subs`) se rozbalí šipkou `.side-toggle` (klik na
  název otevře modul), plynule jako `toggleFold`, víc modulů může být rozbalených.
  Podsekce `.side-subitem` bez ikon, s menším odsazením, aktivní zvýrazněná stejně jako
  aktivní modul; modul s aktivní podsekcí se při načtení sám rozbalí:
  Peníze (členové, Společné, Grafy), Recepty (Recepty, Co uvařit, Skills), Úkoly (Všechny,
  Pro mě, Pro druhého, Pro oba), Administrativa (Společné, Osobní).
  Pořadí modulů jde změnit přetažením (`dragSort`), Nastavení zůstává dole. Tlačítko
  `.side-collapse` dole zúží panel na ikony (64 px, název v `title` při najetí myší).
  Pořadí, rozbalené moduly a zúžení si pamatuje každý počítač (meta `sidebar`).
- Obsah vpravo, max. 1200 px, centrovaný. **Dialog** místo spodního panelu: `openSheet`
  se na počítači vykreslí uprostřed (max. 520 px, `--radius`, ztmavené pozadí). `openMenu`
  zůstává nabídka u tlačítka (u pravého tlačítka myši u kurzoru).
- **Tři tečky** `.row-more` v řádku při najetí myší (jen s myší, na mobilu nikdy).
- Na počítači jsou schované přepínače, které dublují levý panel: Recepty / Skills a Co uvařit
  v Receptech (`.recipe-toolbar`), segmenty v Penězích (`.money-segments`).
- **Sloupce** `.kb` > `.kb-col` (podklad `--surface-2`, cíl přetažení `.is-target`
  `--accent-soft` s orámováním) > `.kb-list` s kartami `.kb-card` (řádek seznamu jako karta);
  tažená karta jede jako kopie `.kb-ghost` a plynule dosedne.
- **Tabulka** `.mt-wrap` > `table.mt-table`: čísla bez „Kč“, tabulková číslice, sticky záhlaví
  (`thead th`) a první sloupec (`tbody th`), skupina `tr.mt-group`, rozbalitelný řádek
  `tr.mt-row.has-items`, položky `tr.mt-item`, souhrnný sloupec `.mt-sum`, limit `.mt-limit`.
- **Seznam a detail** `.split` > `.split-list` (380 px) + `.split-detail`, každá část se
  posouvá zvlášť. Stránka položky v detailu je beze změny, jen bez šipky zpět a s horní lištou
  modulu. Vybraný řádek `.item.is-selected` (podklad `--surface-2`), recept `.rcard.is-selected`.

### Ukládání

Nová položka se zakládá tlačítkem **Přidat** (do té doby je jen v paměti, odchodem zmizí),
existující položka se **ukládá sama** při změně, tlačítko Uložit nikde není. Platí pro
úkoly, dokumenty, recepty, wishlist, platby i poznámky.

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
- Peníze: pravidelné platby (měsíčně / čtvrtletně / ročně), kdo platí (člen nebo Společné),
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
  pošle plátci (u společné platby oběma) upozornění na platby splatné dnes nebo po termínu.
  Na iPhonu funguje jen u appky přidané na plochu.

Hotovo (0.6.0):
- Úkol se otevírá jako samostatná stránka (`#/ukoly/<id>`, `js/views/task.js`), změny se
  ukládají samy. Nemá horní lištu s názvem sekce (`#app.no-topbar`), nahoře je rovnou šipka
  zpět a název úkolu. Stránka má schválně málo nad komentáři: název, řadu malých tlačítek
  (pro koho, důležitost, termín, opakování, kroky; volby v nabídce přímo u tlačítka)
  a podrobnosti sbalené na tři řádky. Hlavní obsah jsou komentáře. V seznamu splní úkol jen ťuknutí na kolečko, ťuknutí na řádek ho otevře.
- Komentáře k úkolům (tabulka `task_comments`, sklad `comments`): řazené podle přidání,
  s autorem, vlastní jdou upravit i smazat. Nepřečtené komentáře od druhého jsou v seznamu
  zvýrazněné (a tečkou u záložky Úkoly), dokud úkol neotevřu. Kdy jsem úkol viděl, si
  pamatuje každý telefon zvlášť (meta `commentsSeen`), nesynchronizuje se.
- Kroky úkolu (`steps` v úkolu) jsou podúkoly: každý má vlastní název, popis, pro koho,
  důležitost a termín s časem a odškrtává se zvlášť. Hlavní úkol neovlivňují: jeho termín
  i opakování jdou měnit vždy a splnit ho musí člověk sám. V seznamu kroků je vidět jen
  to nezbytné, ťuknutím se krok rozbalí k úpravě (stejné nabídky jako hlavní úkol, menší).
  U opakovaného úkolu se kroky s každým kolem vrátí na neodškrtnuté. Nový krok převezme
  od úkolu „pro koho“ a termín (`newStep` ve `store.js`). Nový krok se tlačítkem
  „+ Krok“ rovnou rozbalí (název i ostatní jde vyplnit hned, prázdný se při zavření zahodí).
  Pořadí: změna termínu krok zařadí podle data, jinak se krok podrží a přetáhne.
  Rozbalený krok se sbalí dalším ťuknutím na něj, název se přepisuje přes tužku bokem.
  Úkol jde přesunout do jiného úkolu jako krok (`moveTaskIntoTask`): vezme s sebou název,
  popis, pro koho, důležitost, termín i své kroky, komentáře ne. Spouští se v seznamu úkolů
  přes tři tečky v řádku. Seznam se přepne do režimu přesouvání na téže obrazovce (zmizí
  horní tlačítka, kolečka a tečky, přesouvaný úkol se lehce třese), ťuknutí na cílový úkol
  přesune hned bez potvrzení (toast se Zpět), ťuknutí na přesouvaný úkol režim zruší.
- Změny stavu obrazovky nejsou skokové: co mizí, odjede během zhruba 200 ms ke kraji
  obrazovky a stejně se vrací (viz režim přesouvání v `tasks.js` + CSS). Animace decentní.
- Akce, která potřebuje vybrat cíl, se dělá přímo na stávající obrazovce (režim), ne novým
  seznamem, panelem ani stránkou, a neptá se „opravdu?“ (stačí toast se Zpět).
  Seznam kroků je ve výchozím stavu rozbalený; když ho člověk zabalí nebo nechá rozbalený
  konkrétní krok, telefon si to u úkolu pamatuje (meta `taskView`, přes `store.setLocal`).
- Nabídka termínu: Dnes, Zítra, Za týden, Bez termínu a řádek Vybrat (přes něj leží
  neviditelné pole s datem, ťuknutí otevře kalendář telefonu). Výběr z kalendáře se uloží hned
  a nabídka zůstává otevřená (iPhone hlásí změnu už při otevření kalendáře). Prázdná pole
  bez popisku do nabídek nepatří. Čas úkolu (`time`) má vlastní řádek Čas (stejný princip
  jako Vybrat) s křížkem na zrušení; čas bez dne znamená dnes.

Hotovo (0.15.0):
- Moduly se otevírají z dlaždic na Domů, Více je jen nastavení.
- Administrativa (tabulky `documents`, `doc_files`): dokument má název, kategorii (záruky
  a účtenky, smlouvy, doklady, ostatní), „platí do“, poznámku a naskenované stránky. Seznam
  je rozdělený na Společné a Osobní; osobní má `private_to` a druhému se neposílá (RLS),
  platí to i pro jeho stránky. Stránky se zmenšují na 1600 px (`scalePhoto`) a stahují se
  líně jako fotky receptů. Jsou to citlivá data (skeny dokladů): nikdy je nedávat do logů,
  do zálohy JSON ani do notifikací.
- Info o domácnosti (tabulka `notes`): seznam poznámek s názvem a textem.
- Wishlist a bucketlist mají zámek jako úkoly (soukromá položka, `private_to` v `wishes`).
- Recepty nabízejí jen jídlo (`foodOnly` v `productSuggestions`, `FOOD` v `categories.js`).

Hotovo (0.12.0):
- Wishlist a bucketlist (z Více, tabulka `wishes`, sloupec `list`): položka má název, pro
  koho, orientační „do kdy“ (do roka / 2 / 3 / 5 / 10 let / někdy; ukládá se cílový rok
  `untilYear`, není to termín) a podrobnosti. Ovládání stejné jako u úkolů.
- Bublinky kategorií s katalogem jsou stejné v nákupu, v úpravě receptu i v „Co uvařit“
  (`productChips` v `js/catalogui.js`): řádek návrhů a kategorií, ťuknutí na kategorii otevře
  produkty od nejčastěji kupovaných s - a +. V receptech jen kategorie jídla.
- Stejná věc má mít všude stejné rozhraní: sdílet jeden kód, ne ho kopírovat do pohledů.

Hotovo (0.10.0):
- Úkoly jsou jeden seznam všech nehotových úkolů bez ohledu na termín (žádné záložky
  Dnes / Týden / Někdy). Řazení se volí tlačítkem v horní liště: termín (skupiny Po termínu,
  Dnes, Tento týden, Později, Bez termínu), důležitost, pro koho, přidáno (`sortTasks`
  v `tasks.js`, volba v meta `taskSort`). Domů ukazuje nejbližší úkoly ze všech. Nový úkol
  nemá předvyplněný termín.
- Soukromý úkol (zámek mezi tlačítky na stránce úkolu): `privateTo` = id uživatele, sloupec
  `private_to` v `tasks` i `task_comments`. Druhému se vůbec neposílá, hlídá to RLS politika.
  Upozornění (zvonek) se u soukromého úkolu neposílají.

Hotovo (0.9.1), úpravy po testování:
- Nákup: hustý seznam (jeden souvislý blok, kategorie jako malý šedý nadpis, cíl aspoň
  10 položek na obrazovku iPhonu), bez tlačítek -/+ v řádku (množství je vidět jen když
  je víc než 1 a mění se v úpravě položky), pod polem jediný vodorovný řádek: nejdřív často
  kupované (při psaní našeptávač), za nimi kategorie. Druhý řádek tam nesmí nikdy přibýt,
  aby seznam neposkakoval. Katalog kategorie má tlačítko Hotovo.
- Stránka úkolu: tlačítka s nastavením jsou vždy všechna, v pevném pořadí a šířkách
  (třídy `opt-who`, `opt-prio`, `opt-due`, `opt-icon`, `opt-steps`).
  Opakování je jen ikona, žádné textové popisky k ikonám nepřidávat.
- Úkol může mít volitelný čas (`time` „HH:MM“, sloupec `due_time`), je vidět v seznamu
  i na Domů a řadí úkoly v rámci dne. Nastavuje se řádkem Čas v nabídce termínu.
- V Úkolech není podtitulek „Na dnes: X“, počet je v záložce.

Hotovo (0.9.0):
- Recepty (`#/recepty`, otevírají se z Více, tabulka `recipes`): název, ingredience a postup.
  Ingredience se v úpravě přidávají po jedné (pole s našeptávačem), každá má řádek s
  množstvím a jednotkou (ks, g, ml…; výchozí podle druhu věci) a řadí se přetažením.
  Postup je po krocích (1, 2, 3…), krok může mít souběžné části („mezitím“), pak se čísluje
  1A, 1B, 1C… Ve výchozím stavu žádné nemá (tlačítko +B); jakmile je poslední část
  vyplněná, je pod ní rovnou připravené prázdné pole pro další. Ukládá se dál jako text ve
  sloupci `method`, krok na řádek, každá další souběžná část jako řádek začínající `|| ` (viz `parseMethod` / `formatMethod` v `recipes.js`), takže to
  nevyžadovalo změnu databáze a starší recepty se rozpadly na kroky po řádcích.
  Recept má jednu ilustrační fotku a časy v minutách (příprava + vaření, zobrazené jako
  „30m+20m“). Seznam receptů je mřížka čtverců: fotka přes celý čtverec, nahoře název, dole
  čas, bez počtu ingrediencí; mazání a „Přidat do receptu“ jsou pod třemi tečkami.
  Fotka se před uložením zmenší na čtverec 720 px (`squarePhoto` v `ui.js`) a je v tabulce
  `recipe_photos` / skladu `photos`. Nestahuje se při každé synchronizaci, jen když se podle
  `photoAt` u receptu změnila (`lazy` v `SPECS`, `sync.fetchOne`). Není v záloze do JSON.
  Recept může obsahovat jiný recept (bešamel v lasagních). Vložený recept je v `ingredients`
  jako `{ name, qty: '', recipeId }`, takže to nevyžadovalo změnu databáze. Přidává se v
  úpravě receptu („+ Recept“) nebo ze seznamu přes tři tečky („Přidat do receptu“, režim na
  místě jako u přesunu úkolů). Recept pak ukazuje ingredience i postup vložených receptů,
  do nákupu a do „Co uvařit“ se počítají všechny. Recepty se nesmí obsahovat navzájem
  (`recipesToInclude`, `includesRecipe` ve `store.js`).
  V seznamu receptů je záložka Skills: všechny vysvětlivky na jednom místě, u každé
  recepty, kde se používá (`listSkills` ve `store.js`, upravují se dál v receptu).
  K postupu jdou přidat vysvětlivky (`hints`: výraz + vysvětlení): v úpravě se označí text
  a ťukne na „+ Vysvětlení“; v receptu je výraz podtržený a po ťuknutí ukáže vysvětlení.
- Recept -> nákup: u receptu se odškrtnou ingredience, které už doma jsou, zbytek jde
  jedním tlačítkem do nákupního seznamu (bez zdvojení, ve správné kategorii).
- Co uvařit (`#/recepty/zasoby`): zásoby se přidávají po jedné (pole + našeptávač z katalogu,
  odebírají se ťuknutím na štítek), nahoře je živý počet receptů, na které je všechno, pod
  nimi jejich seznam a pod jedním tlačítkem „Skoro“ recepty, kterým chybí 1 až 2 věci. Shoda je podle katalogu a začátku slova (`sameThing` ve `store.js`).
  Seznam zásob si pamatuje každý telefon zvlášť (meta `pantry`).

Hotovo (0.8.0):
- Nový úkol se zakládá tlačítkem + v horní liště: otevře stránku úkolu v režimu konceptu
  (`#/ukoly/novy`), kde se předem nastaví všechno včetně kroků a zvonku, a úkol vznikne až
  tlačítkem Přidat (nebo Enterem v názvu). Rychlé pole v seznamu už není.

Hotovo (0.7.0):
- Zvonek u přidání úkolu a u psaní komentáře (výchozí vypnuto, platí pro jedno odeslání):
  po odeslání řádku na server dostanou ostatní členové push „Nový úkol od: …“ nebo
  „Komentář od: …“. Fronta v meta `notifyQueue` (`sync.js`), posílá funkce `send-reminders`
  s tělem `{ task, title }` nebo `{ task, title, kind: 'comment', text }` a přihlášením člena.

Hotovo (0.16.0), úklid vzhledu a UX bez nových funkcí:
- Design systém (viz sekce výš): tokeny pro písmo, rozestupy a zaoblení, barvy s pevným
  významem, sjednocené komponenty, stránka `#/ukazka`.
- Záložka „Více“ se jmenuje „Nastavení“ (ozubené kolo), modul „Domácnost“ je „Byt“.
- Domů (0.16.1): jednotná mřížka osmi stejných dlaždic ve 2 sloupcích bez posouvání,
  v každé barevná ikona, název a jedna informace.
- Prázdné stavy ve všech modulech mají jednu větu s příkladem.
- Dokumenty a poznámky se zakládají až tlačítkem Přidat, recepty a platby se po založení
  ukládají samy.
- Oprava: opakovaný úkol s pevným termínem už nezůstane viset. Když začne další období
  a minulé kolo není splněné, `rollOver` ve `store.js` ho uzavře jako zmeškané a posune
  termín. Kdo nesplnil, se zapíše jako komentář bez autora (id i čas se počítají z úkolu
  a termínu, oba telefony tedy vyrobí stejný řádek, schéma se neměnilo). Na stránce úkolu
  je vidět jako šedý řádek, do počtu komentářů ani nepřečtených se nepočítá. Posouvá se
  jen s čerstvě staženými daty. Opakování „od splnění“ se nemění.

Hotovo (0.17.0):
- Peníze rozdělené na segmenty Tom / Domi / Společné (`.segmented` pod hlavičkou, jména podle
  `listMembers()`). Člen = platby z jeho osobního účtu (`payer` = jméno), Společné = placeno
  ze společného účtu (`payer` = `'split'` nebo prázdný; hodnota v datech zůstala, změnil se
  jen popisek z „Napůl“). Vybraný segment si pamatuje každý telefon (meta `moneySegment`),
  výchozí je přihlášený člen, u segmentu je počet plateb k zaplacení.
- Souhrn jen za vybraný segment: pravidelně za měsíc (ťuknutím za rok) a jednorázově zbývá
  (`paymentsSummary(segment)`, bez segmentu za všechno pro dlaždici na Domů). Společné
  platby se už nedělí napůl mezi členy.
- Žádné záložky Zaplatit / Pravidelné / Jednou / Na dobu: jeden seznam se skupinami
  Zaplatit (splatné do 7 dní a po termínu), Pravidelné, Jednorázové, Na dobu, dole
  Zaplacené s Vyčistit (jen v segmentu). Nová platba dostane plátce podle segmentu.
- Upozornění na společné platby chodí dál oběma.

Hotovo (0.18.0):
- Peníze, skutečnost z výpisů z účtu (tabulka `money_months`, sklad `moneymonths`,
  `listMoneyMonths(account)` ve `store.js`, od nejnovějšího měsíce). Řádek = jeden účet za
  jeden měsíc: `account` (jméno člena nebo `'split'` = Společné, jako `payer` u plateb),
  `month` „RRRR-MM“, `income` (celkem přišlo), `outgo` (celkem odešlo, kladné číslo),
  `categories` ve tvaru `{ "Potraviny": { "total": 3294.1, "items": { "Albert": 2823,
  "Lidl": 36.3 } }, ... }`. `items` jsou součty za obchodníka nebo protiúčet, ne jednotlivé
  platby (0.18.1; starší sloupec `shops`, pokud v databázi vznikl, se nepoužívá a nemaže).
  Od 0.21.0 platí význam sloupců: `income` = jen příjmy, `outgo` = jen výdaje (bez přesunů),
  `categories` = rozpad výdajů, `incomes` = rozpad příjmů, `moves` = přesuny mezi vlastními
  účty a do spoření. Všechny tři rozpady mají stejný tvar (`{ "Práce": { "total": 45000,
  "items": { ... } } }`), přesun z úspor zpět má záporný `total`. Prázdné `{}` = bez skupiny.
  Položky `items` můžou být záporné (`"Bydlení": { "total": 10400, "items": { "Nájem": 19600,
  "Podíl spolubydlící": -9200 } }`): zobrazí se s mínusem, neutrálně, kladné od největší
  a záporné na konec. `total` je vždy součet položek a zapisuje ho Claude, appka ho
  nepřepočítává.
  `balance` je zůstatek všech účtů segmentu dohromady ke konci měsíce (u Toma Plus účet
  + spořák), nebo null. Zapisuje ho Claude z výpisů spolu se součty (stačí i jen u některých
  měsíců). Měsíce bez něj appka dopočítá: income - outgo - součet moves BEZ kategorií
  „Na spořák“ a „Ze spořáku“ (přesuny uvnitř zůstatku, `INTERNAL_MOVES` v `moneycharts.js`).
  Unikátní je (household_id, account, month).
- **Kdo do ní píše:** appka řádky jen čte a zobrazuje. Zapisuje je zvenku Claude přes SQL
  z výpisů z banky, které mu Tom dá (`insert ... on conflict (household_id, account, month)
  do update set ..., updated_at = now()`; bez novějšího `updated_at` trigger `keep_newer`
  změnu zahodí). **Jednotlivé transakce se nikam neukládají, jen měsíční součty.**
- V každém segmentu Peněz je pod souhrnem sekce „Skutečnost“ (jen když segment má aspoň
  jeden měsíc): volba měsíce (`.opt` + `openMenu`, výchozí nejnovější), karta Plán
  (pravidelné platby segmentu za měsíc) / Skutečně odešlo, šedě Přišlo, pod ní kategorie od
  největší, vše sbalené. Ťuknutí kategorii plynule rozbalí na šedé podřádky `items` od
  největší; rozbalená je vždy nejvýš jedna (jiná ji zavře, další ťuknutí taky). Šipka jen
  u kategorie s `items`. Rozbalení se nikde nepamatuje.
- Jde do zálohy JSON. Domů se nemění.

Hotovo (0.19.0):
- Platba má volitelnou kategorii (`category`, sloupec `payments.category`), např. OSVČ pro
  ČSSZ, VZP a daně. V panelu platby je pod Názvem pole Kategorie a pod ním řádek čipů
  s kategoriemi z celé domácnosti od nejpoužívanější (`paymentCategories()`); ťuknutí pole
  vyplní, ťuknutí na vybranou ho vymaže, nová vznikne napsáním. Porovnává se bez ohledu na
  velikost písmen a mezery a uloží se v podobě, která už existuje (`cleanCategory` ve `store.js`).
- Ve skupinách Pravidelné, Jednorázové a Na dobu jsou platby se stejnou kategorií v jednom
  rozbalovacím řádku: název, šedě počet plateb, vpravo součet (pravidelné přepočtené na
  měsíc). Pod ním po rozbalení běžné řádky plateb s gesty. Kategorie s jedinou platbou je
  obyčejný řádek. Zaplatit a Zaplacené zůstávají po platbách, kategorie je šedě v `item-sub`.
- Rozbalovací řádky jsou společná komponenta (viz Design systém), sdílí je Skutečnost
  i kategorie plateb.

Hotovo (0.20.0):
- Skutečnost: pod kartou skupiny „Příjmy“ (z `incomes`) a „Výdaje“ (z `categories`) jako
  `li.cat-head` v jednom seznamu, stejné rozbalovací řádky (`toggleFold`), rozbalená nejvýš
  jedna kategorie napříč oběma. Částky příjmů bez znaménka a bez barvy. Prázdné `incomes`
  = skupina Příjmy se nezobrazí a výdaje zůstanou bez nadpisu jako dřív.

Hotovo (0.21.0):
- Skutečnost: karta Přišlo / Utraceno / Odloženo (součet `moves`, záporně když se bralo
  z úspor), pod ní šedě Plán. Pod kartou skupiny Příjmy, Výdaje, Přesuny (nadpis s tečkou
  v barvě skupiny), řazené podle absolutní hodnoty, prázdná skupina se nezobrazí,
  rozbalená nejvýš jedna kategorie napříč všemi.

Hotovo (0.22.0):
- Peníze, Grafy (`#/penize/grafy/<segment>`, `js/views/moneycharts.js`): otevírají se ikonou
  grafu vedle volby měsíce ve Skutečnosti, jen když má segment aspoň 2 měsíce dat. Volby nad
  grafem: Co (nejvýš 3 řady: Přišlo, Utraceno, Odloženo, kategorie výdajů / příjmů / přesunů
  nebo jedna jejich položka), Období (3 / 6 / 12 měsíců, Letos, Vše, Vybrat od-do), Typ
  (Sloupce / Křivka). Telefon si je pamatuje pro každý segment (meta `moneyChart`). Výchozí
  Utraceno za 12 měsíců ve sloupcích. Měsíc bez dat je 0, chybějící měsíce na začátku a konci
  období se vynechají.

Hotovo (0.23.0):
- Grafy: řada „Zůstatek“ (vývoj zůstatku účtu). Měsíční pohyb = income - outgo - součet
  moves. Měsíce se známým `balance` z výpisu ho mají přesně, ostatní se dopočítají z pohybů
  od nejbližšího známého (`balances()` v `moneycharts.js`). Bez jediného známého zůstatku
  se řada jmenuje „Pohyb celkem“ a jde od nuly. Barva `--text` (neutrální).

Hotovo (0.23.1):
- Grafy: graf zabere výšku, která zbude mezi volbami a souhrnem nad spodní lištou (stránka
  se neposouvá, při otočení telefonu se překreslí). Pod grafem je u každé řady rozmezí za
  období („0 - 11 834 Kč“) a vpravo Dohromady (součet), u Zůstatku Na konci.

Hotovo (0.24.0):
- Grafy: Zůstatek je výlučná volba (zruší ostatní řady a naopak), vždy křivka s plochou
  (přepínač typu se schová) a nad grafem karta s posledním zůstatkem a změnou za období.
- Nabídka Co: sekce Hlavní, Výdaje, Příjmy, Přesuny; kategorie a položky řazené podle
  součtu za vybrané období (vpravo šedě), vybrané s fajfkou, při třech ostatní tlumené.
- S jednou řadou čárkovaný průměr („průměr“), u Utraceno čárkovaný plán („plán“,
  pravidelné platby segmentu za měsíc); `lines` v `drawChart`.
- Pod grafem u řady šedě „průměr X / měsíc · nejvíc … · nejméně …“, vpravo Dohromady.
- Hlavička jako u ostatních podstránek: šipka zpět na Peníze, název Grafy, segment jako
  podtitul (bez karty).

Hotovo (0.24.1):
- Grafy: starší uložené volby se Zůstatkem a dalšími řadami se při načtení srovnají na
  samotný Zůstatek; karta se ukazuje jen u samotného Zůstatku a pod číslem má „k <poslední
  den posledního měsíce> · změna za období“. U Zůstatku pod grafem „průměr X Kč“ bez „/ měsíc“.

Hotovo (0.25.0):
- Limity kategorií výdajů (tabulka `money_budgets`, sklad `budgets`; account jako u
  money_months, category = název kategorie výdajů ze Skutečnosti, monthly_limit).
  `listBudgets(account)`, `setBudget(account, category, limit)` (prázdné = smazat). Podržení
  řádku výdaje ve Skutečnosti otevře panel „Měsíční limit“, ukládá se sám. Řádek s limitem
  má „3 294 / 4 000 Kč“ a pod názvem `.budget-bar` (do 90 % šedý, nad 90 % `--warn`, nad
  limitem `--warn` a částka tučně; nikdy červeně).
- Plán v kartě Skutečnosti = pravidelné platby segmentu za měsíc + součet limitů segmentu.
  Pod Utraceno šedě „z toho nad limity X Kč“, když je nějaký limit překročený.
- Cíle spoření (tabulka `money_goals`, sklad `goals`; name, target, sort).
  `listGoals`, `addGoal`, `updateGoal`, `removeGoals` / `restoreGoals`, `reorderGoals`.
  Sekce Cíle v segmentu nad Skutečností (jen když má segment cíl nebo zůstatek): plní se
  odshora z posledního zůstatku (`moneyBalances` ve `store.js`, sdílí ho i grafy), řádek
  s pruhem `--flow-move` a „52 000 / 114 000 Kč“. Pod nimi odhad z průměrné měsíční změny
  zůstatku za posledních 6 měsíců s daty („při tomhle tempu: Auto v březnu 2027“, nebo
  „zůstatek … ubývá v průměru o X Kč měsíčně“). Upravit = panel s cíli (pole se ukládají
  sama, pořadí přetažením za úchyt, potažení smaže se Zpět, dole Přidat).
- Data na začátek (limity, cíle) zapisuje Claude přes SQL, dál je edituje appka.

Hotovo (0.25.1):
- Částka u kategorie s limitem a u cíle je stejně velká a tučná jako ostatní částky, část
  „/ 4 000 Kč“ šedě a obyčejně (`.budget-of`). Překročení ukazuje jen okrový pruh.

Hotovo (0.25.2):
- Pruh limitu mění barvu plynule podle naplnění: šedá, zelená, žlutá, oranžová, červená.

Hotovo (0.26.0), počítač, část 1 - kostra:
- Tablet v jednom sloupci uprostřed, počítač s levým panelem místo spodní lišty, obsah max.
  1200 px, dialog místo spodního panelu, hover, nabídka na pravé tlačítko a tři tečky na
  řádcích, řazení myší, Esc zavře detail, viditelný fokus. Manifest `orientation: any`.

Hotovo (0.27.0), počítač, část 2: seznam a detail vedle sebe (`js/split.js`).

Hotovo (0.28.0), počítač, část 3: Domů ve 3-4 sloupcích s více řádky, Nákup s trvalým
katalogem, Peníze se Skutečností a grafem vedle plateb, Nastavení ve 2 sloupcích.

Hotovo (0.28.1):
- Levý panel: podsekce rozbalované šipkou, filtr Úkolů podle toho, pro koho jsou, pořadí
  modulů přetažením, zúžení na ikony; vše se pamatuje na každém počítači (meta `sidebar`).
- Oprava: Recepty si nenačítaly `emptyState`, prázdná záložka Skills (a prázdný seznam
  receptů) spadla s chybou. Chyba tu byla od 0.16.0.

Hotovo (0.28.2):
- Počítač: Peníze ve sloupcích, které se posouvají zvlášť (od 1280 px tři), schované
  dublující přepínače, aktivní podsekce panelu zvýrazněná a rozbalená, Domů jako přehled.

Hotovo (0.29.0): Peníze > Tabulka na počítači (viz Počítač a tablet).

Hotovo (0.30.0): Úkoly ve sloupcích na počítači a klávesa N pro nový úkol.

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
