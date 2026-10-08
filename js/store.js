// Datová vrstva: jediné místo, které ví, kde data leží.
//
// Appka čte i zapisuje do IndexedDB na tomto zařízení (funguje offline).
// Každý zápis se zároveň zařadí do fronty a js/sync.js ho odešle do Supabase,
// odkud ho dostane druhý telefon. Pohledy (js/views) o tom nic neví.
//
// Každá změna zavolá emit(), na který se pohledy přihlašují přes subscribe().

import * as db from './db.js';
import * as sync from './sync.js';
import { guessCategory, normalize, CATEGORIES, BUILTIN_SHOPS } from './categories.js';
import { findProduct, searchProducts, productsIn } from './catalog.js';
import { today, addDays, addInterval, nextDayOfMonth } from './dates.js';

const listeners = new Set();
const channel = 'BroadcastChannel' in self ? new BroadcastChannel('home-app') : null;
channel?.addEventListener('message', () => notify());
// Změna od druhého telefonu
sync.onData(() => emit());

function notify() {
  listeners.forEach((fn) => {
    try { fn(); } catch (err) { console.error(err); }
  });
}

function emit() {
  notify();
  channel?.postMessage('changed');
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- Nastavení ----------

export async function getMeta(key, fallback = null) {
  const row = await db.get('meta', key);
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  await db.put('meta', { key, value });
  emit();
}

// Místní stav obrazovky (co je rozbalené apod.): uloží se bez upozornění
// pohledům, ať se kvůli tomu nic nepřekresluje. Čte se přes getMeta.
export const setLocal = (key, value) => db.put('meta', { key, value });

// Kdo appku na tomto telefonu používá, kvůli "kdo přidal". Jméno se bere
// z účtu (display_name v household_members), nastavuje ho js/auth.js.
export const getMe = () => getMeta('me', null);
export const setMe = (name) => setMeta('me', name);

// Jména členů domácnosti (pro "kdo to má udělat", "kdo platí")
export async function listMembers() {
  const [members, me] = await Promise.all([getMeta('members', null), getMe()]);
  if (members?.length) return members;
  return me ? [me] : [];
}

// ---------- Stav synchronizace ----------
// { pending, lastSyncAt, error, online, active }

export const syncStatus = () => sync.getStatus();
export const subscribeSync = (fn) => sync.onStatus(fn);
export const syncNow = () => sync.syncNow();

// ---------- Nákupní seznam ----------
// Položka: { id, name, qty, category, done, doneAt, addedBy, createdAt, updatedAt }
// Smazaná položka zůstává v IndexedDB s deleted: true, dokud se smazání
// neodešle na server. Ven z této vrstvy se smazané položky nedostanou.

async function live(store) {
  return (await db.getAll(store)).filter((row) => !row.deleted);
}

// Uloží řádky lokálně a zařadí je do fronty k odeslání
async function save(store, rows) {
  if (!rows.length) return;
  await db.putAll(store, rows);
  await sync.markDirty(store, rows.map((row) => row.id ?? row.key));
}

async function markDeleted(store, rows) {
  const now = Date.now();
  await save(store, rows.map((row) => ({ ...row, deleted: true, updatedAt: now })));
}

// Vrátí smazané řádky (Zpět)
async function restore(store, rows) {
  const now = Date.now();
  await save(store, rows.map((row) => ({ ...row, deleted: false, updatedAt: now })));
  emit();
}

async function removeByIds(store, ids) {
  const removed = (await live(store)).filter((row) => ids.includes(row.id));
  await markDeleted(store, removed);
  emit();
  return removed;
}

async function patchRow(store, id, patch) {
  const row = await db.get(store, id);
  if (!row || row.deleted) return null;
  const next = { ...row, ...patch, updatedAt: Date.now() };
  await save(store, [next]);
  return next;
}

const liveItems = () => live('items');
const saveItems = (items) => save('items', items);

export async function listItems() {
  const items = await liveItems();
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

// Přidá položku. Když už stejná na seznamu je, nepřidá ji podruhé:
// koupenou vrátí zpět na seznam, nekoupenou jen případně doplní množství.
// Vrací { item, status: 'added' | 'restored' | 'exists' }.
// Různé zápisy téže věci ("mlíko", "mléko") mají stejný klíč
const itemKey = (name) => normalize(findProduct(name)?.name ?? name);

export async function addItem({ name, qty = '' }) {
  const typed = String(name).trim();
  if (!typed) throw new Error('Prázdný název');
  // Známý produkt se zapíše pod názvem z katalogu a do jeho kategorie
  const product = findProduct(typed);
  const clean = product?.name ?? typed;
  const key = normalize(clean);
  const now = Date.now();

  const existing = (await liveItems()).find((i) => itemKey(i.name) === key);
  if (existing) {
    const status = existing.done ? 'restored' : 'exists';
    const item = { ...existing, done: false, doneAt: null, qty: qty || existing.qty, updatedAt: now };
    await saveItems([item]);
    await touchHistory(item.name, item.category, true);
    emit();
    return { item, status };
  }

  const hist = await db.get('history', key);
  const item = {
    id: db.newId(),
    name: clean,
    qty,
    category: hist?.category ?? product?.category ?? guessCategory(clean),
    done: false,
    doneAt: null,
    addedBy: await getMe(),
    createdAt: now,
    updatedAt: now,
  };
  await saveItems([item]);
  await touchHistory(item.name, item.category, true);
  emit();
  return { item, status: 'added' };
}

export async function updateItem(id, patch) {
  const item = await db.get('items', id);
  if (!item || item.deleted) return null;
  const next = { ...item, ...patch, updatedAt: Date.now() };
  if ('done' in patch) next.doneAt = patch.done ? Date.now() : null;
  await saveItems([next]);
  // Ruční změna kategorie se zapamatuje pro příště
  if ('category' in patch || 'name' in patch) await touchHistory(next.name, next.category, false);
  emit();
  return next;
}

export const setDone = (id, done) => updateItem(id, { done });

export const removeItems = (ids) => removeByIds('items', ids);

// Smaže koupené položky a vrátí je (kvůli tlačítku Zpět)
export async function clearDone() {
  const done = (await liveItems()).filter((i) => i.done);
  await markDeleted('items', done);
  emit();
  return done;
}

// Vrátí smazané položky (Zpět)
export const restoreItems = (items) => restore('items', items);

// ---------- Historie (našeptávač a často kupované) ----------
// Záznam: { key, name, category, count, lastAt }

async function touchHistory(name, category, countIt) {
  const key = normalize(name);
  const prev = await db.get('history', key);
  await db.put('history', {
    key,
    name,
    category,
    count: (prev?.count ?? 0) + (countIt ? 1 : 0),
    lastAt: Date.now(),
  });
  await sync.markDirty('history', key);
}

async function historyNotOnList() {
  const [history, items] = await Promise.all([db.getAll('history'), liveItems()]);
  const active = new Set(items.filter((i) => !i.done).map((i) => itemKey(i.name)));
  return history.filter((h) => !active.has(itemKey(h.name)));
}

export async function suggestions(query, limit = 5) {
  const q = normalize(query);
  if (!q) return [];
  const list = await historyNotOnList();
  const fromHistory = list
    .filter((h) => h.key.split(' ').some((w) => w.startsWith(q)) || h.key.startsWith(q))
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt);
  // Doplní se z katalogu, i podle jiného zápisu ("mlí" najde Mléko)
  const active = new Set((await liveItems()).filter((i) => !i.done).map((i) => itemKey(i.name)));
  const seen = new Set(fromHistory.map((h) => itemKey(h.name)));
  const fromCatalog = searchProducts(q, limit)
    .filter((p) => !seen.has(normalize(p.name)) && !active.has(normalize(p.name)))
    .map((p) => ({ key: normalize(p.name), name: p.name, category: p.category, count: 0 }));
  return [...fromHistory, ...fromCatalog].slice(0, limit);
}

// Produkty jedné kategorie: nahoře to, co kupujeme nejčastěji, pak zbytek
// katalogu a vlastní věci z historie. Vrací [{ name, count }].
export async function catalogProducts(category) {
  const history = await db.getAll('history');
  const entries = new Map();
  productsIn(category).forEach((p, index) => {
    entries.set(normalize(p.name), { name: p.name, count: 0, order: index });
  });
  for (const h of history) {
    const key = itemKey(h.name);
    const known = entries.get(key);
    if (known) known.count += h.count ?? 0;
    else if (h.category === category && !findProduct(h.name)) entries.set(key, { name: h.name, count: h.count ?? 0, order: 9999 });
  }
  return [...entries.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order || a.name.localeCompare(b.name, 'cs'))
    .map(({ name, count }) => ({ name, count }));
}

// Nekoupená položka nákupu se stejnou věcí (i v jiném zápisu), nebo null
export async function shoppingItem(name) {
  const key = itemKey(name);
  return (await liveItems()).find((i) => !i.done && itemKey(i.name) === key) ?? null;
}

// Návrhy produktů bez ohledu na nákupní seznam (recepty, zásoby): při psaní
// našeptávač z historie a katalogu, jinak nejčastěji kupované. Vrací názvy.
export async function productSuggestions(query, limit = 6) {
  const q = normalize(query);
  const history = (await db.getAll('history')).sort((a, b) => b.count - a.count || b.lastAt - a.lastAt);
  if (!q) return history.filter((h) => h.count > 0).slice(0, limit).map((h) => findProduct(h.name)?.name ?? h.name);
  const fromHistory = history
    .filter((h) => h.key.split(' ').some((w) => w.startsWith(q)) || h.key.startsWith(q))
    .map((h) => findProduct(h.name)?.name ?? h.name);
  return [...new Set([...fromHistory, ...searchProducts(q, limit).map((p) => p.name)])].slice(0, limit);
}

// ---------- Obchody ----------
// Obchod: { key, name, order: [id kategorií], updatedAt }. Pořadí určuje,
// jak se seřadí nákupní seznam. Vestavěné obchody jsou v categories.js,
// do skladu shops se ukládají jen jejich úpravy a vlastní obchody.
// Který obchod je vybraný, si pamatuje každý telefon zvlášť (meta "shop").

// Doplní do pořadí kategorie, které v něm chybí, a vyhodí neznámé
function fullOrder(order = []) {
  const known = CATEGORIES.map((c) => c.id);
  const kept = order.filter((id) => known.includes(id));
  return [...kept, ...known.filter((id) => !kept.includes(id))];
}

export async function listShops() {
  const saved = await db.getAll('shops');
  const byKey = new Map(saved.map((s) => [s.key, s]));
  const builtin = BUILTIN_SHOPS.map((b) => ({ ...b, ...(byKey.get(b.key) ?? {}), builtin: true }));
  const custom = saved.filter((s) => !BUILTIN_SHOPS.some((b) => b.key === s.key));
  return [...builtin, ...custom]
    .filter((s) => !s.deleted)
    .map((s) => ({ key: s.key, name: s.name, order: fullOrder(s.order), builtin: Boolean(s.builtin) }));
}

export async function currentShop() {
  const [shops, key] = await Promise.all([listShops(), getMeta('shop', null)]);
  return shops.find((s) => s.key === key) ?? shops[0];
}

export const selectShop = (key) => setMeta('shop', key);

// Uloží obchod (nový dostane key sám). Vrací key.
export async function saveShop({ key = null, name, order }) {
  const shop = { key: key ?? db.newId(), name: String(name).trim() || 'Obchod', order: fullOrder(order), deleted: false, updatedAt: Date.now() };
  await save('shops', [shop]);
  emit();
  return shop.key;
}

export async function removeShop(key) {
  const shop = await db.get('shops', key);
  if (!shop) return;
  await save('shops', [{ ...shop, deleted: true, updatedAt: Date.now() }]);
  emit();
}

// ---------- Recepty ----------
// Recept: { id, name, ingredients: [{ name, qty }], method, hints, createdAt, updatedAt }
//   Recept může obsahovat jiný recept (bešamel v lasagních). Vložený recept je
//   v ingredients jako { name, qty: '', recipeId }: pro starší verze appky je
//   to prostě ingredience se jménem receptu, nová si podle recipeId dohledá
//   aktuální název, ingredience i postup.
//   hints  vysvětlivky k postupu: [{ term, note }]. Kde se term v postupu
//          najde, je podtržený a po ťuknutí ukáže vysvětlení.

export async function listRecipes() {
  const recipes = await live('recipes');
  return recipes.sort((a, b) => a.name.localeCompare(b.name, 'cs'));
}

export async function getRecipe(id) {
  const recipe = await db.get('recipes', id);
  return recipe && !recipe.deleted ? recipe : null;
}

// Uloží recept (nový dostane id sám). Vrací ho.
export async function saveRecipe({ id = null, name, ingredients = [], method = null, hints = [], prepMin = null, cookMin = null }) {
  const clean = String(name).trim();
  if (!clean) throw new Error('Prázdný název');
  const now = Date.now();
  const before = id ? await db.get('recipes', id) : null;
  const recipe = {
    id: id ?? db.newId(),
    name: clean,
    ingredients: ingredients.filter((i) => i?.name).map((i) => (i.recipeId
      ? { name: i.name, qty: '', recipeId: i.recipeId }
      : { name: i.name, qty: i.qty ?? '' })),
    method: String(method ?? '').trim() || null,
    hints: hints.filter((h) => h?.term && h?.note).map((h) => ({ term: String(h.term).trim(), note: String(h.note).trim() })),
    prepMin: prepMin || null,
    cookMin: cookMin || null,
    photoAt: before?.photoAt ?? null,
    createdAt: before?.createdAt ?? now,
    updatedAt: now,
  };
  await save('recipes', [recipe]);
  emit();
  return recipe;
}

// Všechny vysvětlivky z receptů na jednom místě ("skills"). Stejný výraz
// z více receptů je jedna položka; když se u něj vysvětlení liší, je jich víc.
// Vrací [{ term, notes: [{ note, recipes: [{ id, name }] }] }] podle abecedy.
export async function listSkills() {
  const skills = new Map();
  for (const recipe of await listRecipes()) {
    for (const hint of recipe.hints ?? []) {
      if (!hint?.term || !hint?.note) continue;
      const key = normalize(hint.term);
      if (!skills.has(key)) skills.set(key, { term: hint.term, notes: [] });
      const skill = skills.get(key);
      let entry = skill.notes.find((n) => n.note === hint.note);
      if (!entry) {
        entry = { note: hint.note, recipes: [] };
        skill.notes.push(entry);
      }
      if (!entry.recipes.some((r) => r.id === recipe.id)) entry.recipes.push({ id: recipe.id, name: recipe.name });
    }
  }
  return [...skills.values()].sort((a, b) => a.term.localeCompare(b.term, 'cs'));
}

// ---------- Fotka receptu ----------
// Fotka je zmenšený obrázek jako data URL ve skladu photos (klíč = id receptu).
// Recept si pamatuje jen photoAt = kdy se fotka naposledy změnila.

// Nastaví (nebo při data = null odebere) fotku receptu
export async function setRecipePhoto(recipeId, data) {
  const now = Date.now();
  await db.put('photos', data ? { id: recipeId, data, updatedAt: now } : { id: recipeId, data: null, deleted: true, updatedAt: now });
  await sync.markDirty('photos', recipeId);
  await patchRow('recipes', recipeId, { photoAt: data ? now : null });
  emit();
}

// Fotky k receptům: { [id receptu]: data URL }. Co telefon ještě nemá (fotku
// přidal druhý), si na pozadí stáhne a pohledy se pak překreslí samy.
export async function recipePhotos() {
  const [recipes, photos] = await Promise.all([live('recipes'), db.getAll('photos')]);
  const local = new Map(photos.map((p) => [p.id, p]));
  const out = {};
  for (const recipe of recipes) {
    if (!recipe.photoAt) continue;
    const photo = local.get(recipe.id);
    if (photo?.data && !photo.deleted) out[recipe.id] = photo.data;
    if (!photo || (photo.updatedAt ?? 0) < recipe.photoAt) sync.fetchOne('photos', recipe.id);
  }
  return out;
}

// "30m+20m" (příprava + vaření), jen jeden údaj, nebo prázdný text
export function recipeTime(recipe) {
  return [recipe.prepMin, recipe.cookMin].filter(Boolean).map((min) => `${min}m`).join('+');
}

export const removeRecipes = (ids) => removeByIds('recipes', ids);
export const restoreRecipes = (recipes) => restore('recipes', recipes);

// Přidá vybrané ingredience do nákupu. Co už na seznamu je, se nezdvojí.
// Vrací počet nově přidaných nebo vrácených položek.
export async function addIngredientsToShopping(ingredients) {
  let added = 0;
  for (const ing of ingredients) {
    const { status } = await addItem({ name: ing.name, qty: ing.qty ?? '' });
    if (status !== 'exists') added += 1;
  }
  return added;
}

// Je to stejná věc? Podle katalogu ("mlíko" = "mléko") a podle začátku slova,
// aby sedělo i skloňování ("cibule" a "cibuli").
function sameThing(a, b) {
  const x = itemKey(a);
  const y = itemKey(b);
  if (x === y) return true;
  const stem = (word) => word.slice(0, Math.max(4, word.length - 2));
  return x.startsWith(stem(y)) || y.startsWith(stem(x));
}

export const hasIngredient = (have, name) => have.some((h) => sameThing(h, name));

// Co se dá uvařit z toho, co je doma. have = seznam názvů. Vrací recepty
// seřazené od těch, kterým chybí nejméně: [{ recipe, missing: [ingredience] }].
// Vrací [{ recipe, missing, total }], total = počet všech ingrediencí včetně
// těch z vložených receptů.
export async function matchRecipes(have) {
  const recipes = await live('recipes');
  const byId = new Map(recipes.map((r) => [r.id, r]));
  return recipes
    .map((recipe) => {
      const all = expandIngredients(recipe, byId);
      return { recipe, total: all.length, missing: all.filter((ing) => !hasIngredient(have, ing.name)) };
    })
    .sort((a, b) => a.missing.length - b.missing.length || a.recipe.name.localeCompare(b.recipe.name, 'cs'));
}

// ---------- Recept v receptu ----------

// Všechny ingredience receptu včetně těch z vložených receptů (i vnořených).
// Vrací [{ name, qty, from }], from = název vloženého receptu, nebo null.
// seen hlídá, aby se recepty obsahující se navzájem nezacyklily.
function expandIngredients(recipe, byId, seen = new Set()) {
  const path = new Set(seen).add(recipe.id);
  const out = [];
  for (const ing of recipe.ingredients ?? []) {
    const sub = ing.recipeId ? byId.get(ing.recipeId) : null;
    if (sub && !path.has(sub.id)) {
      out.push(...expandIngredients(sub, byId, path).map((x) => ({ ...x, from: sub.name })));
    } else if (!ing.recipeId) {
      out.push({ name: ing.name, qty: ing.qty ?? '', from: null });
    }
  }
  return out;
}

// Obsahuje recept (přímo nebo přes jiné) recept s daným id?
function includesRecipe(recipe, targetId, byId, seen = new Set()) {
  if (seen.has(recipe.id)) return false;
  seen.add(recipe.id);
  return (recipe.ingredients ?? []).some((ing) => ing.recipeId
    && (ing.recipeId === targetId || (byId.get(ing.recipeId) && includesRecipe(byId.get(ing.recipeId), targetId, byId, seen))));
}

// Recept připravený k zobrazení: { recipe, subs: [vložené recepty], ingredients }
export async function recipeView(id) {
  const recipes = await live('recipes');
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const recipe = byId.get(id);
  if (!recipe) return null;
  const subs = (recipe.ingredients ?? []).map((ing) => byId.get(ing.recipeId)).filter(Boolean);
  return { recipe, subs, ingredients: expandIngredients(recipe, byId) };
}

// Recepty, které jdou vložit do daného receptu (ne on sám, ne ty, co už v něm
// jsou, a ne ty, které ho samy obsahují). id = null: nový recept, jde cokoli.
export async function recipesToInclude(id, already = []) {
  const recipes = await listRecipes();
  const byId = new Map(recipes.map((r) => [r.id, r]));
  return recipes.filter((r) => r.id !== id && !already.includes(r.id) && !(id && includesRecipe(r, id, byId)));
}

// Vloží recept sourceId do receptu targetId. Vrací { target, source, before }
// (before = ingredience cíle před vložením, pro Zpět), nebo null, když to
// nejde (už tam je, nebo by se recepty obsahovaly navzájem).
export async function addSubRecipe(targetId, sourceId) {
  const allowed = await recipesToInclude(targetId, []);
  const [target, source] = await Promise.all([getRecipe(targetId), getRecipe(sourceId)]);
  if (!target || !source || !allowed.some((r) => r.id === sourceId)) return null;
  const before = target.ingredients ?? [];
  if (before.some((ing) => ing.recipeId === sourceId)) return null;
  await saveRecipe({ ...target, ingredients: [...before, { name: source.name, qty: '', recipeId: sourceId }] });
  return { target, source, before };
}

export const undoAddSubRecipe = ({ target, before }) => saveRecipe({ ...target, ingredients: before });

// Co máme doma: seznam názvů, pamatuje si ho každý telefon zvlášť
export const getPantry = () => getMeta('pantry', []);
export const setPantry = (list) => db.put('meta', { key: 'pantry', value: list });

// ---------- Wishlist a bucketlist ----------
// Položka: { id, list, title, note, assignee, untilYear, done, doneAt, createdAt, updatedAt }
//   list       'wish' (wishlist) nebo 'bucket' (bucketlist)
//   assignee   jméno člena, 'both' = oba, nebo null = kdokoliv
//   untilYear  orientační rok, do kdy by to člověk chtěl (ne termín), nebo null

export async function listWishes(list) {
  const rows = (await live('wishes')).filter((w) => w.list === list);
  return rows.sort((a, b) => (a.untilYear ?? 9999) - (b.untilYear ?? 9999) || a.createdAt - b.createdAt);
}

export async function getWish(id) {
  const wish = await db.get('wishes', id);
  return wish && !wish.deleted ? wish : null;
}

export async function addWish({ list, title, note = null, assignee = null, untilYear = null }) {
  const clean = String(title).trim();
  if (!clean) throw new Error('Prázdný název');
  const now = Date.now();
  const wish = { id: db.newId(), list, title: clean, note, assignee, untilYear, done: false, doneAt: null, createdAt: now, updatedAt: now };
  await save('wishes', [wish]);
  emit();
  return wish;
}

export async function updateWish(id, patch) {
  const next = await patchRow('wishes', id, patch);
  emit();
  return next;
}

export const setWishDone = (id, done) => updateWish(id, { done, doneAt: done ? Date.now() : null });
export const removeWishes = (ids) => removeByIds('wishes', ids);
export const restoreWishes = (wishes) => restore('wishes', wishes);

// ---------- Jednorázové úpravy dat po aktualizaci appky ----------

// 0.4.0: "Ovoce a zelenina" se rozdělilo, přibyly Uzeniny, Sladké a Slané.
// Položky a historie ze starých společných kategorií se zařadí znovu.
export async function upgradeData() {
  if ((await getMeta('dataVersion', 0)) >= 4) return;
  const split = { ovoce: ['zelenina'], maso: ['uzeniny'], trvanlive: ['sladke', 'slane'] };
  const move = (row) => {
    const guess = guessCategory(row.name);
    return split[row.category]?.includes(guess) ? guess : null;
  };
  const items = (await liveItems()).map((i) => [i, move(i)]).filter(([, cat]) => cat);
  const now = Date.now();
  await saveItems(items.map(([i, category]) => ({ ...i, category, updatedAt: now })));
  for (const h of await db.getAll('history')) {
    const category = move(h);
    if (!category) continue;
    await db.put('history', { ...h, category, lastAt: now });
    await sync.markDirty('history', h.key);
  }
  // Platby měly jen den v měsíci, teď mají datum nejbližší splatnosti
  const payments = (await live('payments')).filter((p) => p.dueDay && !p.nextDue);
  await save('payments', payments.map((p) => ({ ...p, nextDue: nextDayOfMonth(p.dueDay), updatedAt: now })));
  await db.put('meta', { key: 'dataVersion', value: 4 });
  if (items.length) emit();
}

export async function frequent(limit = 10) {
  const list = await historyNotOnList();
  return list
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .slice(0, limit);
}

// ---------- Úkoly ----------
// Úkol: { id, title, assignee, due, repeat, done, doneAt, doneBy, prevDue,
//         createdBy, createdAt, updatedAt }
//   assignee  jméno člena, null = kdokoliv, nebo 'both' = oba
//             ('both' je hotový, až ho odškrtnou všichni, doneParts = kdo už)
//   priority  1 = bylo by fajn, 2 = běžné, 3 = hoří
//   note      podrobnosti, nebo null
//   steps     podúkoly: [{ id, title, note, assignee, priority, due, time,
//             done, doneAt, doneBy }]. Většina úkolů žádné nemá. Odškrtávají
//             se zvlášť a hlavní úkol neovlivňují (ani termín, ani splnění).
//   due       "RRRR-MM-DD", nebo null = někdy
//   time      volitelný čas "HH:MM" k termínu, nebo null
//   privateTo id uživatele, který jediný úkol vidí (soukromý úkol, třeba
//             dárek), nebo null = vidí oba. Hlídá to i databáze (RLS).
//   repeat    null, nebo { every, unit: 'day'|'week'|'month'|'year', mode }
//             mode 'fixed' = další termín se počítá od termínu,
//                  'after' = ode dne, kdy se úkol opravdu splnil
// Opakovaný úkol se splněním neuzavře: posune se mu termín a v doneAt/doneBy
// zůstane, kdo a kdy ho splnil naposledy. prevDue je termín před tím, aby šlo
// odškrtnutí vrátit.

export async function listTasks() {
  const tasks = await live('tasks');
  return tasks.sort((a, b) => a.createdAt - b.createdAt);
}

export const BOTH = 'both';

// Nové id (pro kroky úkolu, který se teprve zakládá)
export const newId = () => db.newId();

// notify = true pošle ostatním členům push upozornění, že úkol přibyl
// Id přihlášeného uživatele (pro soukromé úkoly)
const myUserId = async () => (await getMeta('session', null))?.userId ?? null;

// isPrivate = true: úkol uvidím jen já. Upozornění druhému se pak neposílá.
export async function addTask({ title, due = null, time = null, assignee = null, repeat = null, priority = 2, note = null, notify = false, steps = [], isPrivate = false }) {
  const clean = String(title).trim();
  if (!clean) throw new Error('Prázdný název');
  const now = Date.now();
  const task = {
    id: db.newId(),
    title: clean,
    assignee,
    due,
    time: due ? time : null,
    repeat,
    priority,
    note,
    done: false,
    doneAt: null,
    doneBy: null,
    doneParts: [],
    steps,
    privateTo: isPrivate ? await myUserId() : null,
    prevDue: null,
    createdBy: await getMe(),
    createdAt: now,
    updatedAt: now,
  };
  if (notify && !task.privateTo) await sync.queueNotification('tasks', task.id, { task: task.id, title: task.title });
  await save('tasks', [task]);
  emit();
  return task;
}

export async function updateTask(id, patch) {
  // Když se zruší opakování, zmizí i stopa po posledním splnění,
  // jinak by nehotový úkol vypadal jako dnes splněný
  const before = await db.get('tasks', id);
  if (before?.repeat && 'repeat' in patch && !patch.repeat && !before.done) {
    patch = { ...patch, doneAt: null, doneBy: null, prevDue: null };
  }
  const next = await patchRow('tasks', id, patch);
  emit();
  return next;
}

// Splní úkol, nebo splnění vrátí (done = false)
export async function setTaskDone(id, done) {
  const task = await db.get('tasks', id);
  if (!task || task.deleted) return null;
  const me = await getMe();
  let who = me;
  let parts = [];
  if (task.assignee === BOTH) {
    // Úkol pro oba: každý odškrtává za sebe, hotovo je až od všech
    const members = await listMembers();
    // U opakovaného je "uzavřeno" jen pro vrácení posledního splnění,
    // nové odškrtávání začíná vždy od nuly
    const mine = (task.doneParts ?? []).includes(me);
    const closed = task.repeat ? (!done && !mine && Boolean(task.doneAt && task.prevDue)) : task.done;
    const had = closed ? members : (task.doneParts ?? []);
    parts = done ? [...new Set([...had, me])] : had.filter((name) => name !== me);
    const all = members.every((name) => parts.includes(name));
    if (!all && !closed) return updateTask(id, { doneParts: parts });
    if (all && closed) return task;
    done = all;
    who = members.join(' + ');
    // Po úplném splnění se u opakovaného začíná znovu od nuly
    if (done && task.repeat) parts = [];
  }
  // Opakovaný úkol začíná další kolo i s neodškrtnutými kroky
  const freshSteps = done && task.repeat && (task.steps ?? []).length
    ? { steps: task.steps.map((s) => ({ ...s, done: false, doneAt: null, doneBy: null })) }
    : {};
  let patch;
  if (!task.repeat) {
    patch = { done, doneAt: done ? Date.now() : null, doneBy: done ? who : null };
  } else if (done) {
    const { every, unit, mode } = task.repeat;
    const day = today();
    let next = addInterval(mode === 'after' ? day : (task.due ?? day), every, unit);
    // Zameškané pevné termíny se přeskočí, další musí být v budoucnu
    while (next <= day) next = addInterval(next, every, unit);
    patch = { due: next, prevDue: task.due ?? day, doneAt: Date.now(), doneBy: who };
  } else {
    patch = { due: task.prevDue ?? task.due, prevDue: null, doneAt: null, doneBy: null };
  }
  return updateTask(id, { ...patch, ...freshSteps, doneParts: parts });
}

// Udělá úkol soukromým (jen pro mě) nebo ho zase ukáže oběma.
// Komentáře jdou s úkolem.
export async function setTaskPrivate(id, isPrivate) {
  const privateTo = isPrivate ? await myUserId() : null;
  const comments = (await live('comments')).filter((c) => c.taskId === id);
  const now = Date.now();
  await save('comments', comments.map((c) => ({ ...c, privateTo, updatedAt: now })));
  return updateTask(id, { privateTo });
}

export async function getTask(id) {
  const task = await db.get('tasks', id);
  return task && !task.deleted ? task : null;
}

// ---------- Kroky úkolu ----------

// Kroky jsou podúkoly: každý má vlastní "kdo, kdy, důležitost, popis" a
// odškrtává se zvlášť. Na termín ani splnění hlavního úkolu nemají vliv,
// ten se odškrtává sám.
const saveSteps = (task, steps) => updateTask(task.id, { steps });

// Seřadí kroky podle termínu (a času), kroky bez termínu nechá za nimi
// v pořadí, v jakém byly. Volá se, když se kroku změní termín. Jinak pořadí
// určuje uživatel ručním posouváním.
export function sortStepsByDue(steps) {
  const key = (s) => `${s.due ?? '9999-99-99'} ${s.due ? s.time ?? '99:99' : ''}`;
  return steps
    .map((step, index) => ({ step, index }))
    .sort((a, b) => key(a.step).localeCompare(key(b.step)) || a.index - b.index)
    .map(({ step }) => step);
}

// Přeskládá kroky podle seznamu id (po ručním přetažení)
export function orderSteps(steps, ids) {
  const rank = new Map(ids.map((stepId, index) => [stepId, index]));
  return [...steps].sort((x, y) => (rank.get(x.id) ?? 999) - (rank.get(y.id) ?? 999));
}

// Nový krok: převezme od úkolu, pro koho je a kdy má být (jde to pak změnit)
export const newStep = (task, { id = null, title = '' } = {}) => ({
  id: id ?? db.newId(),
  title: String(title).trim(),
  note: null,
  assignee: task.assignee ?? null,
  priority: 2,
  due: task.due ?? null,
  time: task.due ? task.time ?? null : null,
  done: false,
  doneAt: null,
  doneBy: null,
});

// Krok může vzniknout i bez názvu, doplní se při úpravě
export async function addStep(taskId, { title = '', id = null } = {}) {
  const task = await getTask(taskId);
  if (!task) return null;
  return saveSteps(task, [...(task.steps ?? []), newStep(task, { id, title })]);
}

// Přesune úkol do jiného úkolu jako krok (i s jeho vlastními kroky). Kroky
// s termínem se zařadí podle data. Původní úkol zmizí. Vrací, co je potřeba k vrácení
// (Zpět): { source, target, steps } = původní úkol a kroky cíle před přesunem.
export async function moveTaskIntoTask(taskId, targetId) {
  const [source, target] = await Promise.all([getTask(taskId), getTask(targetId)]);
  if (!source || !target || taskId === targetId) return null;
  const asStep = {
    id: db.newId(),
    title: source.title,
    note: source.note ?? null,
    assignee: source.assignee ?? null,
    priority: source.priority ?? 2,
    due: source.due ?? null,
    time: source.time ?? null,
    done: Boolean(source.done),
    doneAt: source.done ? source.doneAt ?? null : null,
    doneBy: source.done ? source.doneBy ?? null : null,
  };
  const before = target.steps ?? [];
  await saveSteps(target, sortStepsByDue([...before, asStep, ...(source.steps ?? [])]));
  await markDeleted('tasks', [source]);
  emit();
  return { source, target: targetId, steps: before };
}

// Vrátí přesun úkolu do úkolu
export async function undoMoveTask({ source, target, steps }) {
  await restore('tasks', [source]);
  await updateTask(target, { steps });
}

export async function reorderSteps(taskId, ids) {
  const task = await getTask(taskId);
  if (!task) return null;
  return saveSteps(task, orderSteps(task.steps ?? [], ids));
}

export async function updateStep(taskId, stepId, patch) {
  const task = await getTask(taskId);
  if (!task) return null;
  const steps = (task.steps ?? []).map((s) => (s.id === stepId ? { ...s, ...patch } : s));
  // Změna termínu krok zařadí na správné místo podle data
  return saveSteps(task, 'due' in patch || 'time' in patch ? sortStepsByDue(steps) : steps);
}

export async function setStepDone(taskId, stepId, done) {
  const me = await getMe();
  return updateStep(taskId, stepId, { done, doneAt: done ? Date.now() : null, doneBy: done ? me : null });
}

export async function removeStep(taskId, stepId) {
  const task = await getTask(taskId);
  if (!task) return null;
  return saveSteps(task, (task.steps ?? []).filter((s) => s.id !== stepId));
}

// ---------- Komentáře k úkolům ----------
// Komentář: { id, taskId, author, body, createdAt, updatedAt }

export async function listComments(taskId) {
  const comments = (await live('comments')).filter((c) => c.taskId === taskId);
  return comments.sort((a, b) => a.createdAt - b.createdAt);
}

// Počet komentářů u každého úkolu: { [taskId]: počet }
export async function commentCounts() {
  const counts = {};
  for (const c of await live('comments')) counts[c.taskId] = (counts[c.taskId] ?? 0) + 1;
  return counts;
}

// Nepřečtené komentáře: ty od druhého, které přibyly od chvíle, kdy jsem měl
// úkol naposledy otevřený. Kdy to bylo, si pamatuje každý telefon zvlášť
// (meta "commentsSeen": { [taskId]: čas }). Vrací { [taskId]: počet }.
export async function unreadComments() {
  const [me, seen, comments] = await Promise.all([getMe(), getMeta('commentsSeen', {}), live('comments')]);
  const counts = {};
  for (const c of comments) {
    if (c.author === me || c.createdAt <= (seen[c.taskId] ?? 0)) continue;
    counts[c.taskId] = (counts[c.taskId] ?? 0) + 1;
  }
  return counts;
}

// Volá stránka úkolu, když jsou komentáře opravdu na očích
export async function markCommentsRead(taskId) {
  if (!(await unreadComments())[taskId]) return;
  const seen = await getMeta('commentsSeen', {});
  await setMeta('commentsSeen', { ...seen, [taskId]: Date.now() });
}

// notify = true pošle ostatním členům push upozornění s textem komentáře
export async function addComment(taskId, body, { notify = false } = {}) {
  const clean = String(body).trim();
  if (!clean) return null;
  const now = Date.now();
  const task = await getTask(taskId);
  const comment = { id: db.newId(), taskId, privateTo: task?.privateTo ?? null, author: await getMe(), body: clean, createdAt: now, updatedAt: now };
  if (notify && !comment.privateTo) {
    await sync.queueNotification('comments', comment.id, { task: taskId, title: task?.title ?? '', kind: 'comment', text: clean });
  }
  await save('comments', [comment]);
  emit();
  return comment;
}

export async function updateComment(id, body) {
  const clean = String(body).trim();
  if (!clean) return null;
  const next = await patchRow('comments', id, { body: clean });
  emit();
  return next;
}

export const removeComments = (ids) => removeByIds('comments', ids);
export const restoreComments = (comments) => restore('comments', comments);

export const removeTasks = (ids) => removeByIds('tasks', ids);
export const restoreTasks = (tasks) => restore('tasks', tasks);

// Smaže hotové jednorázové úkoly a vrátí je (kvůli tlačítku Zpět)
export async function clearDoneTasks() {
  const done = (await live('tasks')).filter((t) => t.done);
  await markDeleted('tasks', done);
  emit();
  return done;
}

// ---------- Platby ----------
// Platba: { id, name, amount, kind, period, payer, nextDue, total, remaining,
//           done, paidAt, paidBy, createdAt, updatedAt }
//   kind     'recurring' pravidelná, 'once' jednorázová, 'term' pravidelná po dobu X
//   period   'month' | 'quarter' | 'year' (u jednorázové se nepoužívá)
//   payer    jméno člena, nebo 'split' = napůl
//   nextDue  nejbližší splatnost "RRRR-MM-DD", nebo null = bez hlídání
//   total / remaining  počet plateb celkem a kolik zbývá (jen 'term')
//   done     jednorázová zaplacena, nebo 'term' doplacena

export const SPLIT = 'split';
export const PERIOD_MONTHS = { month: 1, quarter: 3, year: 12 };

export async function listPayments() {
  const payments = await live('payments');
  return payments.sort((a, b) => monthly(b) - monthly(a) || a.createdAt - b.createdAt);
}

// Částka přepočtená na jeden měsíc
export const monthly = (payment) => (payment.amount || 0) / (PERIOD_MONTHS[payment.period] ?? 1);

// Kolik z částky připadá na jednoho člena (napůl = rovný díl)
function addShare(perPerson, members, payer, amount) {
  if (payer === SPLIT || !payer) {
    members.forEach((m) => { perPerson[m] += amount / members.length; });
  } else {
    perPerson[payer] = (perPerson[payer] ?? 0) + amount;
  }
}

// Souhrn: co stojí běžný měsíc (pravidelné a běžící platby na dobu určitou)
// a kolik zbývá zaplatit jednorázově. { total, perPerson, onceTotal, oncePerPerson }
export async function paymentsSummary() {
  const [payments, members] = await Promise.all([live('payments'), listMembers()]);
  const zero = () => Object.fromEntries(members.map((m) => [m, 0]));
  const perPerson = zero();
  const oncePerPerson = zero();
  let total = 0;
  let onceTotal = 0;
  for (const p of payments) {
    if (p.done) continue;
    if (p.kind === 'once') {
      onceTotal += p.amount || 0;
      addShare(oncePerPerson, members, p.payer, p.amount || 0);
    } else {
      total += monthly(p);
      addShare(perPerson, members, p.payer, monthly(p));
    }
  }
  return { total, perPerson, onceTotal, oncePerPerson };
}

// Nezaplacené platby se splatností nejpozději za daný počet dní (i po termínu)
export async function duePayments(days = 7) {
  const limit = addDays(today(), days);
  return (await live('payments'))
    .filter((p) => !p.done && p.nextDue && p.nextDue <= limit)
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
}

export async function addPayment({ name, amount = 0, kind = 'recurring', period = 'month', payer = undefined, nextDue = null, total = null }) {
  const clean = String(name).trim();
  if (!clean) throw new Error('Prázdný název');
  const now = Date.now();
  const payment = {
    id: db.newId(),
    name: clean,
    amount,
    kind,
    period,
    payer: payer === undefined ? await getMe() : payer,
    nextDue,
    total: kind === 'term' ? total : null,
    remaining: kind === 'term' ? total : null,
    done: false,
    paidAt: null,
    paidBy: null,
    createdAt: now,
    updatedAt: now,
  };
  await save('payments', [payment]);
  emit();
  return payment;
}

export async function updatePayment(id, patch) {
  const next = await patchRow('payments', id, patch);
  emit();
  return next;
}

// Odškrtne "zaplaceno": jednorázová je hotová, pravidelné se posune splatnost,
// u platby na dobu určitou navíc ubude jedna zbývající. Vrací stav před
// zaplacením, kterým jde platbu vrátit (Zpět) přes updatePayment.
export async function payPayment(id) {
  const p = await db.get('payments', id);
  if (!p || p.deleted || p.done) return null;
  const before = { nextDue: p.nextDue, remaining: p.remaining, done: p.done, paidAt: p.paidAt, paidBy: p.paidBy };
  const patch = { paidAt: Date.now(), paidBy: await getMe() };
  if (p.kind === 'once') {
    patch.done = true;
  } else {
    if (p.nextDue) patch.nextDue = addInterval(p.nextDue, PERIOD_MONTHS[p.period] ?? 1, 'month');
    if (p.kind === 'term' && p.remaining != null) {
      patch.remaining = Math.max(0, p.remaining - 1);
      patch.done = patch.remaining === 0;
    }
  }
  await updatePayment(id, patch);
  return { payment: p, before };
}

export const removePayments = (ids) => removeByIds('payments', ids);
export const restorePayments = (payments) => restore('payments', payments);

// Smaže zaplacené a doplacené platby a vrátí je (kvůli tlačítku Zpět)
export async function clearDonePayments() {
  const done = (await live('payments')).filter((p) => p.done);
  await markDeleted('payments', done);
  emit();
  return done;
}

// ---------- Záloha ----------

export async function exportAll() {
  const data = {};
  for (const store of db.STORES) data[store] = await db.getAll(store);
  // Přihlášení ani čekající smazání do zálohy nepatří
  data.meta = [];
  for (const store of ID_STORES) data[store] = data[store].filter((row) => !row.deleted);
  return { app: 'home-app', dbVersion: db.DB_VERSION, exportedAt: new Date().toISOString(), data };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Sklady s řádky podle id, které se synchronizují stejným způsobem
const ID_STORES = ['items', 'tasks', 'payments', 'comments', 'recipes', 'wishes'];

export async function importAll(backup) {
  if (backup?.app !== 'home-app' || !backup.data) throw new Error('Tohle není záloha této aplikace.');
  // Záloha se do společného seznamu přidá, nic se jí nepřepíše ani nesmaže:
  // u položky se stejným id vyhrává novější verze.
  const history = Array.isArray(backup.data.history) ? backup.data.history : [];
  for (const store of ID_STORES) {
    const rows = Array.isArray(backup.data[store]) ? backup.data[store] : [];
    const keep = [];
    for (const row of rows) {
      if (!row?.id || !(row.name || row.title || row.body)) continue;
      // Server bere jen UUID, starší id z náhradního generátoru dostane nové
      if (!UUID.test(row.id)) {
        keep.push({ ...row, id: db.newId(), deleted: false });
        continue;
      }
      const local = await db.get(store, row.id);
      if (!local || (local.updatedAt ?? 0) < (row.updatedAt ?? 0)) keep.push({ ...row, deleted: false });
    }
    await save(store, keep);
  }
  for (const h of history) {
    if (!h?.key || (await db.get('history', h.key))) continue;
    await db.put('history', h);
    await sync.markDirty('history', h.key);
  }
  emit();
}
