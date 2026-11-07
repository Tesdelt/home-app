// Domů na počítači: přehled pěti sekcí místo dlaždic (mobil má dál dlaždice
// v home.js). Recepty, Administrativa a Byt tu nejsou, jsou v levém panelu.
// Stránka má výšku okna a nikdy se neposouvá: karty mají pevnou výšku podle
// mřížky a obsah se jim přizpůsobí. Seznam ukáže jen tolik řádků, kolik se
// vejde, poslední řádek je pak šedě „a dalších X“ (odkaz do modulu); přepočítá
// se při každé změně velikosti okna (ResizeObserver).
// Od 1280 px tři sloupce (Úkoly + Nákup | Peníze | Wishlist + Bucketlist),
// pod 1280 px dva (Úkoly + Nákup | Peníze), Wishlist a Bucketlist pak pod
// Úkoly a Nákupem jen když se vejdou. Data se překreslují živě.

import * as store from '../store.js';
import { escapeHtml, ICONS, money, whoClass, budgetColor, planMeter, undoToast, markNew, isNew, blink } from '../ui.js';
import { addEntry } from './shopping.js';
import { today, dueLabel, dueTimeLabel } from '../dates.js';
import { navigate } from '../router.js';
import { drawChart } from '../chart.js';
import { sortTasks } from './tasks.js';

const MONTHS = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
const monthName = (month) => {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const num = (v) => Math.round(v).toLocaleString('cs-CZ');
const totalOf = (value) => Number(typeof value === 'object' && value ? value.total : value) || 0;
const bar = (part, color) => `<span class="budget-bar"><span style="width: ${(Math.max(0, Math.min(1, part)) * 100).toFixed(1)}%; background: ${color}"></span></span>`;

const MAX_ROWS = 60;      // víc řádků se do karty nikdy nevejde
const WISH_MIN = 170;     // nejmenší výška karty Wishlistu / Bucketlistu pod 1280 px
const CHART_MIN = 110;    // graf zůstatku menší nemá smysl, ustoupí platbám
const LIMITS_MAX = 3;

// Orientační „do kdy“ u přání (jako ve wishlistu)
function horizon(untilYear) {
  if (!untilYear) return 'Někdy';
  const years = untilYear - new Date().getFullYear();
  if (years <= 0) return 'Letos';
  if (years === 1) return 'Do roka';
  return `Do ${years} let`;
}

// Rychlé přidání nahoře v kartě (Enter přidá, fokus zůstane v poli)
const QUICK = { ukoly: '+ Úkol', nakup: '+ Položka' };

const SECTIONS = [
  ['ukoly', 'tasks', 'Úkoly'],
  ['nakup', 'cart', 'Nákup'],
  ['penize', 'wallet', 'Peníze'],
  ['wishlist', 'gift', 'Wishlist'],
  ['bucketlist', 'star', 'Bucketlist'],
];

// Do boxu dá jen tolik řádků, kolik se vejde do výšky avail (od horního okraje
// boxu, včetně všeho, co v něm je nad seznamem). Když se nevejdou všechny,
// poslední řádek je „a dalších X“. Vrací počet ukázaných řádků.
function fillList(box, rows, route, avail, head = '') {
  if (!rows.length) {
    box.innerHTML = `${head}<p class="home-none">Nic</p>`;
    return 0;
  }
  box.innerHTML = `${head}<ul class="item-list home-list">${rows.slice(0, MAX_ROWS).join('')}</ul><a class="home-more" href="#/${route}">a dalších ${rows.length}</a>`;
  const ul = box.querySelector('.home-list');
  const more = box.querySelector('.home-more');
  let lis = [...ul.children];
  const top = box.getBoundingClientRect().top;
  const bottoms = () => lis.map((li) => li.getBoundingClientRect().bottom - top);
  let ends = bottoms();
  if (rows.length <= MAX_ROWS && ends[ends.length - 1] <= avail) {
    more.remove();
    return rows.length;
  }
  const moreH = more.offsetHeight;
  const fit = () => {
    let n = 0;
    while (n < lis.length && ends[n] + moreH <= avail) n++;
    return n;
  };
  let n = fit();
  // Právě přidaný řádek, který by se nevešel, zabere poslední viditelná místa
  // (první, nejdůležitější řádek zůstává)
  const hiddenNew = lis.slice(n).filter((li) => isNew(rowId(li), { ownOnly: true })).slice(-Math.max(1, n - 1));
  if (hiddenNew.length) {
    lis = [...lis.slice(0, n - hiddenNew.length), ...hiddenNew, ...lis.filter((li, i) => i >= n - hiddenNew.length && !hiddenNew.includes(li))];
    ul.replaceChildren(...lis);
    ends = bottoms();
    n = fit();
  }
  lis.slice(n).forEach((li) => li.remove());
  if (!n) ul.remove();
  more.textContent = `a dalších ${rows.length - n}`;
  return n;
}

const rowId = (li) => li.dataset.task ?? li.dataset.buy ?? li.dataset.pay ?? li.dataset.id;

export async function renderOverview(el) {
  const root = document.createElement('div');
  root.className = 'home-desk';
  root.innerHTML = '<div class="home-col"></div><div class="home-col"></div><div class="home-col"></div>';
  el.append(root);
  const cols = root.querySelectorAll('.home-col');
  const cards = {};
  for (const [route, icon, name] of SECTIONS) {
    const card = document.createElement('section');
    card.className = `card home-card mod-${route}`;
    const quick = QUICK[route];
    card.innerHTML = `<a class="home-card-head" href="#/${route}"><span class="card-icon">${ICONS[icon]}</span><h2 class="card-title">${name}</h2></a>
      ${quick ? `<form class="home-add" data-quick="${route}"><input class="input" name="text" placeholder="${quick}" aria-label="${quick}" autocomplete="off" enterkeyhint="done"></form>` : ''}
      <div class="home-card-body"></div>`;
    cards[route] = card;
  }
  const body = (route) => cards[route].querySelector('.home-card-body');

  // Rozvržení: od 1280 px tři sloupce, jinak dva; Wishlist a Bucketlist pod
  // Úkoly a Nákupem jen když se vejdou (výšky 3 : 3 : 2 : 2, menší aspoň WISH_MIN)
  const wide = window.matchMedia('(min-width: 1280px)');
  function place() {
    const layout = wide.matches
      ? [['ukoly', 'nakup'], ['penize'], ['wishlist', 'bucketlist']]
      : [['ukoly', 'nakup', 'wishlist', 'bucketlist'], ['penize'], []];
    layout.forEach((routes, i) => {
      const want = routes.map((r) => cards[r]);
      if (want.some((c, j) => cols[i].children[j] !== c) || cols[i].children.length !== want.length) cols[i].replaceChildren(...want);
    });
    root.classList.toggle('is-wide', wide.matches);
    let showWishes = true;
    if (!wide.matches) {
      const gap = parseFloat(getComputedStyle(cols[0]).rowGap) || 0;
      showWishes = ((cols[0].clientHeight - 3 * gap) * 2) / 10 >= WISH_MIN;
    }
    cards.wishlist.hidden = !showWishes;
    cards.bucketlist.hidden = !showWishes;
  }

  let data = null;
  let first = true;
  let endChart = null;
  let token = 0;

  async function load() {
    const mine = ++token;
    const [tasks, items, shop, members, me, wishes, buckets, news, unread] = await Promise.all([
      store.listTasks(), store.listItems(), store.currentShop(), store.listMembers(), store.getMe(),
      store.listWishes('wish'), store.listWishes('bucket'), store.moduleNews(), store.unreadComments(),
    ]);
    // Tečka novinek v hlavičce karty; novinky se při otevření Domů jemně
    // zvýrazní, ale novinkami zůstávají (tečku ruší jen otevření modulu)
    const dots = new Set(Object.keys(news));
    if (Object.keys(unread).length) dots.add('ukoly');
    for (const [route] of SECTIONS) cards[route].querySelector('.home-card-head').classList.toggle('has-dot', dots.has(route));
    if (first) {
      first = false;
      Object.values(news).flat().forEach((id) => markNew(id, { soft: true }));
    }
    const segment = members.includes(me) ? me : store.SPLIT;
    const [months, budgetRows, goals, due, summary, unsorted] = await Promise.all([
      store.listMoneyMonths(segment), store.listBudgets(segment), store.listGoals(segment), store.duePayments(7),
      store.paymentsSummary(segment), store.latestUnsorted(),
    ]);
    if (mine !== token) return;
    const day = today();

    // ---------- Úkoly: po termínu, dnes a nejbližší ----------
    const open = sortTasks(tasks, 'due').flatMap((g) => g.tasks);
    const taskRows = open.map((t) => {
      const parts = t.doneParts ?? [];
      const sub = t.due ? [t.due < day ? `<span class="is-late">${escapeHtml(dueTimeLabel(t.due, t.time))}</span>` : escapeHtml(dueTimeLabel(t.due, t.time))] : [];
      if (t.assignee === store.BOTH && parts.length) sub.push(`hotovo ${escapeHtml(parts.join(', '))}`);
      return `<li class="item ${whoClass(t.assignee, members)}${parts.includes(me) ? ' is-mine' : ''}" data-task="${escapeHtml(t.id)}">
        <button type="button" class="item-main has-stripe">
          <span class="check-tap"><span class="check">${ICONS.check}</span></span>
          <span class="item-text"><span class="item-name">${escapeHtml(t.title)}</span>${sub.length ? `<span class="item-sub">${sub.join(' · ')}</span>` : ''}</span>
        </button></li>`;
    });

    // ---------- Nákup: nekoupené podle pořadí obchodu ----------
    const order = (category) => {
      const i = shop.order.indexOf(category);
      return i < 0 ? shop.order.length : i;
    };
    const buy = items.filter((i) => !i.done).sort((a, b) => order(a.category) - order(b.category) || a.name.localeCompare(b.name, 'cs'));
    const buyRows = buy.map((i) => `<li class="item" data-buy="${escapeHtml(i.id)}">
        <button type="button" class="item-main"><span class="check">${ICONS.check}</span>
          <span class="item-text"><span class="item-name">${escapeHtml(i.name)}${i.qty && i.qty !== '1' ? ` <span class="item-qty">${escapeHtml(i.qty)}</span>` : ''}</span></span>
        </button></li>`);

    // ---------- Peníze přihlášeného ----------
    let top = '';
    const row = months[0];
    // Plán = pravidelné platby segmentu za měsíc + limity (jako ve Skutečnosti)
    const plan = summary.total + budgetRows.reduce((sum, b) => sum + (Number(b.monthlyLimit) || 0), 0);
    if (row) {
      const saved = Object.values(row.moves ?? {}).reduce((s, v) => s + totalOf(v), 0);
      top += `<a class="home-month" href="${unsorted.count ? unsorted.href : '#/penize'}">
        <span class="home-month-head"><span class="sum-label">${escapeHtml(monthName(row.month))}</span>${unsorted.count ? `<span class="home-unsorted">${unsorted.label}</span>` : ''}</span>
        <div class="sum-row">
          <div class="sum-cell"><span class="sum-label">Přišlo</span><span class="sum-value flow-in">${money(row.income)}</span></div>
          <div class="sum-cell"><span class="sum-label">Utraceno</span><span class="sum-value flow-out">${money(row.outgo)}</span></div>
          <div class="sum-cell"><span class="sum-label">Odloženo</span><span class="sum-value flow-move">${money(saved)}</span></div>
        </div>${planMeter(row.outgo, plan)}${row.notes?.length ? `<span class="month-note home-note">${escapeHtml(row.notes[0])}</span>` : ''}</a>`;
      // Nejvýš 3 kategorie přes 90 % limitu, od nejvíc naplněné
      const near = budgetRows
        .map((b) => ({ ...b, spent: totalOf(row.categories?.[b.category]) }))
        .filter((b) => b.spent > b.monthlyLimit * 0.9)
        .sort((a, b) => b.spent / b.monthlyLimit - a.spent / a.monthlyLimit)
        .slice(0, LIMITS_MAX);
      if (near.length) {
        top += `<p class="section-label">Limity</p><ul class="item-list home-list">${near.map((b) => `<li class="item"><a class="item-main" href="#/penize">
            <span class="item-text"><span class="item-name">${escapeHtml(b.category)}</span></span>
            <span class="item-amount">${num(b.spent)} <span class="budget-of">/ ${money(b.monthlyLimit)}</span></span>${bar(b.spent / b.monthlyLimit, budgetColor(b.spent / b.monthlyLimit))}</a></li>`).join('')}</ul>`;
      }
    }
    // Platby k zaplacení do 7 dní: klik zaplatí (se Zpět)
    const payRows = due.filter((p) => store.inPaymentSegment(p, segment, members)).map((p) => `<li class="item ${whoClass(p.payer || store.SPLIT, members)}" data-pay="${escapeHtml(p.id)}">
        <button type="button" class="item-main has-stripe is-compact"><span class="check">${ICONS.check}</span>
        <span class="item-text"><span class="item-name">${escapeHtml(p.name)}</span><span class="item-sub">${p.nextDue < day ? `<span class="is-late">${escapeHtml(dueLabel(p.nextDue))}</span>` : escapeHtml(dueLabel(p.nextDue))}</span></span>
        <span class="item-amount">${money(p.amount)}</span></button></li>`);
    // Cíle jako jeden řádek s pruhy vedle sebe, plněné odshora z posledního zůstatku
    const { map, anchored } = store.moneyBalances(months);
    const balances = [...map.entries()];
    let goalsHtml = '';
    if (goals.length) {
      let left = anchored && balances.length ? balances[balances.length - 1][1] : 0;
      goalsHtml = `<p class="section-label">Cíle</p><a class="home-goals" href="#/penize">${goals.map((g) => {
        const have = Math.max(0, Math.min(g.target, left));
        left -= g.target;
        const part = g.target ? have / g.target : 0;
        return `<span class="home-goal" title="${escapeHtml(`${num(have)} / ${money(g.target)}`)}"><span class="home-goal-name"><span class="home-goal-label">${escapeHtml(g.name)}</span><span class="budget-of">${Math.round(part * 100)} %</span></span>${bar(part, 'var(--flow-move)')}</span>`;
      }).join('')}</a>`;
    }
    // Malý graf zůstatku za 12 měsíců, vyplní zbytek karty, klik otevře Grafy
    const last12 = balances.slice(-12);
    const chart = anchored && last12.length >= 2 ? last12 : null;

    // ---------- Wishlist a Bucketlist: nejbližší podle „do kdy“ ----------
    const wishRows = (listName, route) => (listName
      .filter((w) => !w.done)
      .sort((a, b) => (a.untilYear ?? 9999) - (b.untilYear ?? 9999) || a.createdAt - b.createdAt)
      .map((w) => `<li class="item ${whoClass(w.assignee, members)}" data-id="${escapeHtml(w.id)}"><a class="item-main has-stripe" href="#/${route}/${escapeHtml(w.id)}">
          <span class="item-text"><span class="item-name">${escapeHtml(w.title)}</span><span class="item-sub">${escapeHtml(horizon(w.untilYear))}</span></span>
          ${w.privateTo ? `<span class="item-lock">${ICONS.lock}</span>` : ''}</a></li>`));

    data = {
      ukoly: taskRows, nakup: buyRows, wishlist: wishRows(wishes, 'wishlist'), bucketlist: wishRows(buckets, 'bucketlist'),
      money: { top, payRows, goalsHtml, chart, empty: !top && !payRows.length && !goalsHtml && !chart },
    };
    fit();
  }

  // Naplní karty podle jejich aktuální výšky
  function fit() {
    if (!data) return;
    place();
    for (const route of ['ukoly', 'nakup', 'wishlist', 'bucketlist']) {
      if (cards[route].hidden) continue;
      const b = body(route);
      fillList(b, data[route], route, b.clientHeight);
    }
    fitMoney();
  }

  function fitMoney() {
    const b = body('penize');
    const m = data.money;
    if (endChart) endChart();
    endChart = null;
    if (m.empty) {
      b.innerHTML = '<p class="home-none">Nic</p>';
      return;
    }
    b.innerHTML = `${m.top}<div class="home-pay"></div>${m.goalsHtml}${m.chart ? '<p class="section-label home-chart-label">Zůstatek</p><div class="home-chart" role="link" tabindex="0" aria-label="Grafy"></div>' : ''}`;
    const avail = b.clientHeight;
    const payBox = b.querySelector('.home-pay');
    const chartEl = b.querySelector('.home-chart');
    // Bez plateb zabere graf všechno, co zbude. Platby mají přednost, grafu
    // nechají aspoň CHART_MIN; když by se pak nevešla ani jedna, graf ustoupí.
    const topOf = (node) => node.getBoundingClientRect().top - b.getBoundingClientRect().top;
    const contentEnd = () => {
      const last = b.lastElementChild;
      return last ? last.getBoundingClientRect().bottom - b.getBoundingClientRect().top : 0;
    };
    if (m.payRows.length) {
      const head = '<p class="section-label">Zaplatit</p>';
      // Bez plateb: nad grafem (nebo celkem bez grafu) je obsazeno tolik
      const used = chartEl ? topOf(chartEl) : contentEnd();
      const shown = fillList(payBox, m.payRows, 'penize', avail - used - (chartEl ? CHART_MIN : 0), head);
      if (!shown && chartEl) {
        chartEl.previousElementSibling.remove();
        chartEl.remove();
        payBox.replaceChildren();
        fillList(payBox, m.payRows, 'penize', avail - contentEnd(), head);
      }
    } else {
      payBox.remove();
    }
    const live = b.querySelector('.home-chart');
    if (!live) return;
    const h = live.clientHeight;
    if (h < 60) {
      live.previousElementSibling.remove();
      live.remove();
      return;
    }
    endChart = drawChart(live, {
      months: m.chart.map(([month]) => month),
      series: [{ label: 'Zůstatek', color: 'var(--text)', values: m.chart.map(([, v]) => v) }],
      type: 'line', format: money, height: h, minHeight: 60,
      onSelect: () => navigate('penize/grafy'),
    });
  }

  // Přepočet při změně velikosti okna (jednou za snímek)
  let frame = 0;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  });
  observer.observe(root);
  wide.addEventListener('change', fit);

  // Úkol: kolečko splní, řádek otevře úkol vpravo v Úkolech.
  // Nákup: klik = koupeno se Zpět. Platba: klik = zaplaceno se Zpět.
  // Rychlé přidání: Enter přidá a fokus zůstane v poli pro další
  root.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-quick]');
    if (!form) return;
    e.preventDefault();
    const input = form.elements.text;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.focus();
    if (form.dataset.quick === 'ukoly') await store.addTask({ title: text });
    else await addEntry(text);
  });

  root.addEventListener('click', async (e) => {
    const task = e.target.closest('[data-task]');
    if (task) {
      if (e.target.closest('.check-tap')) {
        task.classList.add(task.classList.contains('who-both') ? 'is-mine' : 'is-done');
        await new Promise((r) => setTimeout(r, 180));
        await store.setTaskDone(task.dataset.task, true);
      } else {
        navigate(`ukoly/${task.dataset.task}`);
      }
      return;
    }
    const item = e.target.closest('[data-buy]');
    if (item) {
      const id = item.dataset.buy;
      const name = item.querySelector('.item-name')?.firstChild?.textContent ?? '';
      item.classList.add('is-done');
      await new Promise((r) => setTimeout(r, 180));
      await store.setDone(id, true);
      undoToast(`${name.trim()}: koupeno`, () => store.setDone(id, false));
      return;
    }
    const payRow = e.target.closest('[data-pay]');
    if (payRow) {
      const id = payRow.dataset.pay;
      const name = payRow.querySelector('.item-name')?.textContent ?? '';
      payRow.classList.add('is-done');
      await new Promise((r) => setTimeout(r, 180));
      const result = await store.payPayment(id);
      if (result) undoToast(`${name}: zaplaceno`, () => store.updatePayment(id, result.before));
      return;
    }
    if (e.target.closest('.home-chart') && !e.target.closest('.chart-hit')) navigate('penize/grafy');
  });

  await load();
  const unsubscribe = store.subscribe(load);
  const offArrive = store.onArrive((module) => blink(cards[module]));
  return () => {
    unsubscribe();
    offArrive();
    observer.disconnect();
    cancelAnimationFrame(frame);
    wide.removeEventListener('change', fit);
    if (endChart) endChart();
  };
}
