// Seznam a detail vedle sebe (jen počítač, od 1024 px). Úkoly, Recepty,
// Administrativa, Wishlist, Bucketlist a Byt: vlevo seznam, vpravo otevřená
// položka (stávající stránka položky, bez vlastní šipky zpět). Trasa zůstává
// stejná, #/ukoly/<id> na počítači vykreslí obojí a vybraný řádek zvýrazní.
// Bez vybrané položky je vpravo prázdno (žádný vysvětlující text). Detail se sám neotevírá
// (u úkolů by se tím komentáře označily jako přečtené).
//
// Na mobilu a tabletu se nic nemění: pohled se vykreslí jako dřív.
//
// renderPage(el, ctx) je dosavadní render pohledu (bez params = seznam,
// s params = stránka položky). Tohle není pohled, ale pomocník pohledů.

import { isDesktop } from './ui.js';

// Kde byl seznam odrolovaný, ať po otevření jiné položky neskočí nahoru
const scrolls = new Map();

// key   klíč pro zapamatování posunu seznamu (název trasy)
// fullWhenEmpty  bez otevřené položky je seznam přes celou šířku (Recepty)
export async function splitView(el, ctx, renderPage, { key, fullWhenEmpty = false }) {
  const selected = ctx.params?.[0] ?? null;
  if (!isDesktop() || (fullWhenEmpty && !selected)) return renderPage(el, ctx);

  const root = document.createElement('div');
  root.className = `split${selected ? ' has-detail' : ''}`;
  root.innerHTML = '<div class="split-list"></div><div class="split-detail"></div>';
  el.append(root);
  const listEl = root.querySelector('.split-list');
  const detailEl = root.querySelector('.split-detail');

  const [endList, endDetail] = await Promise.all([
    renderPage(listEl, { ...ctx, params: [] }),
    selected ? renderPage(detailEl, ctx) : undefined,
  ]);
  listEl.scrollTop = scrolls.get(key) ?? 0;

  // Vybraný řádek zvýrazněný i po každém překreslení seznamu
  const mark = () => listEl.querySelectorAll('[data-id]').forEach((n) => n.classList.toggle('is-selected', n.dataset.id === selected));
  mark();
  const observer = new MutationObserver(mark);
  observer.observe(listEl, { childList: true, subtree: true });

  return () => {
    scrolls.set(key, listEl.scrollTop);
    observer.disconnect();
    if (typeof endList === 'function') endList();
    if (typeof endDetail === 'function') endDetail();
  };
}
