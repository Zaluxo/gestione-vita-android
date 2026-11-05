"use strict";
/* ===================== helpers ===================== */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseD = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const dowOf = d => ((d.getDay() + 6) % 7) + 1; // 1 = lunedì
const daysBetween = (a, b) => Math.round((parseD(ymd(a)) - parseD(ymd(b))) / 864e5);
const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const eur = n => (n == null || isNaN(n)) ? "—" : Number(n).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const newId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const icon = (n, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const DOW = ["", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const DOW_S = ["", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const fmtDate = d => `${d.getDate()} ${MESI[d.getMonth()]}`;
const fmtDateY = d => `${d.getDate()} ${MESI[d.getMonth()]} ${d.getFullYear()}`;
const fmtTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const relDays = n => n === 0 ? "oggi" : n === 1 ? "domani" : n === -1 ? "ieri" : n < 0 ? `${-n} giorni fa` : `tra ${n} giorni`;
const REPARTI = ["Frutta e verdura", "Carne e pesce", "Latticini e uova", "Pane e cereali", "Dispensa", "Surgelati", "Bevande", "Casa e pulizia", "Altro"];
const CATS = [
  { id: "carburante", name: "Carburante" },
  { id: "spesa", name: "Spesa alimentare" },
  { id: "personali", name: "Uscite e cibo fuori" },
  { id: "casa", name: "Casa (extra)" },
  { id: "veicoli", name: "Auto e moto (extra)" },
  { id: "salute", name: "Salute" },
  { id: "altro", name: "Altro" },
];
const catName = id => CATS.find(c => c.id === id)?.name || "Altro";
const PREFIXES = ["CASA", "SPESA", "LAVORO", "PROGETTO", "SCADENZA", "STUDIO", "PERSONALE"];

/* ===================== store ===================== */
const DEFAULTS = {
  profile: { name: "" },
  meals: { plan: {}, recipes: [], estimate: null, note: "" },
  shopping: { items: [] },
  pantry: { items: [] },
  house: { tasks: [], laundry: [], products: [] },
  money: { budget: { income: 0, lines: [] }, deadlines: [], subs: [], goals: [] },
  priorities: { date: "", items: [] },
  notes: { items: [] },
  reminders: { items: [] },
  vehicles: { list: [], history: [] },
  history: { items: [] },
};
const store = { docs: {}, loaded: false };

function getDoc(id) {
  if (store.docs[id]) return store.docs[id];
  if (id.startsWith("exp-")) return { items: [] };
  return DEFAULTS[id];
}
function mut(id, fn) {
  const d = structuredClone(getDoc(id));
  fn(d);
  store.docs[id] = d;
  schedule();
  Storage.set(id, d);
}
function setSync() {
  const el = $("#sync"); if (!el) return;
  el.innerHTML = `<span class="dot ok"></span><span>Salvato sul telefono</span>`;
}

/* ===================== ui state ===================== */
const ui = {
  tab: "oggi", pasti: "piano", casa: "faccende", soldi: "mese", altro: "",
  month: monthKey(today()), noteQ: "", open: {}, lastRep: "Altro",
};
try { const s = JSON.parse(localStorage.getItem("gv:ui") || "{}"); Object.assign(ui, s, { open: s.open || {}, pasti: ["piano", "spesa", "dispensa"].includes(s.pasti) ? s.pasti : "piano", month: monthKey(today()), altro: ["note", "impostazioni", "storia"].includes(s.altro) ? s.altro : "", tab: TABS.some(t => t.id === s.tab) ? s.tab : "oggi" }); } catch { }
function saveUi() { try { localStorage.setItem("gv:ui", JSON.stringify({ tab: ui.tab, pasti: ["piano", "spesa", "dispensa"].includes(ui.pasti) ? ui.pasti : "piano", altro: ui.altro, open: ui.open, lastRep: ui.lastRep })); } catch { } }

let rq = 0;
function schedule() { if (rq) return; rq = requestAnimationFrame(() => { rq = 0; render(); }); }

/* ===================== domain logic ===================== */
// Scadenze: prossima occorrenza e stato
function deadlineOccurrence(dl, ref = today()) {
  if (dl.kind === "monthly") {
    const mk = monthKey(ref);
    const dim = (y, m) => new Date(y, m + 1, 0).getDate();
    const thisOcc = new Date(ref.getFullYear(), ref.getMonth(), Math.min(dl.day, dim(ref.getFullYear(), ref.getMonth())));
    if (dl.until && mk > dl.until) return null;
    if (dl.paid?.[mk]) {
      const nx = new Date(ref.getFullYear(), ref.getMonth() + 1, Math.min(dl.day, dim(ref.getFullYear(), ref.getMonth() + 1)));
      if (dl.until && monthKey(nx) > dl.until) return { date: thisOcc, key: mk, paid: true, last: true };
      return { date: nx, key: monthKey(nx), paid: false, prevPaid: true, paidKey: mk, paidDate: thisOcc };
    }
    return { date: thisOcc, key: mk, paid: false };
  }
  if (!dl.date) return null;
  return { date: parseD(dl.date), key: dl.date, paid: false };
}
function statusOf(occ) {
  if (!occ) return { cls: "", label: "—" };
  if (occ.paid) return { cls: "ok", label: "Pagato ✓" };
  const n = daysBetween(occ.date, today());
  if (n < 0) return { cls: "bad", label: n === -1 ? "Scaduto ieri" : `Scaduto da ${-n} gg` };
  if (n === 0) return { cls: "bad", label: "Oggi" };
  if (n <= 7) return { cls: "warn", label: n === 1 ? "Domani" : `Tra ${n} gg` };
  return { cls: "", label: n <= 60 ? `Tra ${n} gg` : fmtDate(occ.date) };
}
function upcomingDeadlines(withinDays) {
  const m = getDoc("money"); const t = today(); const out = [];
  for (const dl of m.deadlines || []) {
    const occ = deadlineOccurrence(dl, t); if (!occ || occ.paid) continue;
    const n = daysBetween(occ.date, t);
    if (n <= withinDays) out.push({ dl, occ, n, auto: false });
  }
  for (const s of m.subs || []) {
    let d = new Date(t.getFullYear(), t.getMonth(), s.day);
    if (d < t) d = new Date(t.getFullYear(), t.getMonth() + 1, s.day);
    const n = daysBetween(d, t);
    if (n <= withinDays) out.push({ sub: s, occ: { date: d }, n, auto: true });
  }
  return out.sort((a, b) => a.n - b.n);
}

// Faccende
function taskState(t, ref = today()) {
  const tk = ymd(ref);
  if (t.freq === "daily") {
    const done = t.lastDone === tk;
    return { due: true, today: true, done, overdue: false, next: ref };
  }
  if (t.freq === "weekly") {
    const back = (dowOf(ref) - t.dow + 7) % 7;
    const occ = addDays(ref, -back);
    const done = t.lastDone && t.lastDone >= ymd(occ);
    const isToday = back === 0;
    const overdue = !done && back > 0 && back <= 2 && !!t.lastDone;
    const next = done || back > 3 ? addDays(occ, 7) : occ;
    return { due: isToday || overdue, today: isToday, done, overdue, next: done && isToday ? addDays(occ, 7) : next, occ };
  }
  if (t.freq === "once") {
    const next = t.next ? parseD(t.next) : ref;
    const n = daysBetween(next, ref);
    const done = !!t.lastDone;
    return { due: (n <= 0 && !done) || t.lastDone === tk, today: n === 0, done, overdue: n < 0 && !done, next, n, hide: done && t.lastDone < tk };
  }
  // interval
  const next = t.next ? parseD(t.next) : ref;
  const n = daysBetween(next, ref);
  const doneToday = t.lastDone === tk;
  return { due: n <= 0 || doneToday, today: n === 0, done: doneToday, overdue: n < 0 && !doneToday, next, n };
}
function completeTask(t) {
  const prev = structuredClone(t);
  const tk = ymd(today());
  mut("house", h => {
    const x = h.tasks.find(y => y.id === t.id); if (!x) return;
    if (x.freq === "once") { x.lastDone = x.lastDone ? null : tk; return; }
    if (x.freq === "interval") {
      const st = taskState(x);
      if (st.done) { x.lastDone = x.prevLast || null; x.next = x.prevNext || x.next; delete x.prevLast; delete x.prevNext; return; }
      x.prevLast = x.lastDone || null; x.prevNext = x.next || null;
      x.lastDone = tk; x.next = ymd(addDays(today(), x.every || 30));
    } else {
      const st = taskState(x);
      if (st.done) { x.lastDone = x.prevLast || null; delete x.prevLast; }
      else { x.prevLast = x.lastDone || null; x.lastDone = tk; }
    }
  });
  return prev;
}
function laundryState(l, ref = today()) {
  const back = (dowOf(ref) - l.dow + 7) % 7;
  const occ = addDays(ref, -back);
  const every = l.everyWeeks || 1;
  let active = true;
  if (every > 1 && l.anchor) { const w = Math.round(daysBetween(occ, parseD(l.anchor)) / 7); active = ((w % every) + every) % every === 0; }
  const done = l.lastDone && l.lastDone >= ymd(occ);
  return { today: back === 0 && active, done, active, occ };
}

// Budget
function linesForMonth(mk) {
  const b = getDoc("money").budget || { lines: [] };
  return (b.lines || []).filter(l => (!l.from || mk >= l.from) && (!l.to || mk <= l.to));
}
function monthSummary(mk) {
  const b = getDoc("money").budget || {};
  const lines = linesForMonth(mk);
  const exp = getDoc("exp-" + mk).items || [];
  const sum = g => lines.filter(l => l.group === g).reduce((s, l) => s + (+l.amount || 0), 0);
  const fixed = sum("fisse"), varBudget = sum("variabili"), savings = sum("accantonamenti");
  const spent = exp.reduce((s, e) => s + (+e.amount || 0), 0);
  const byCat = {};
  for (const e of exp) byCat[e.cat] = (byCat[e.cat] || 0) + (+e.amount || 0);
  const income = +b.income || 0;
  return { income, fixed, varBudget, savings, spent, byCat, lines, exp, left: income - fixed - savings - spent, planned: income - fixed - savings - varBudget };
}

/* ===================== toast & sheet ===================== */
let toastTimer = 0;
function toast(msg, undo) {
  const root = $("#toast-root");
  clearTimeout(toastTimer);
  root.innerHTML = `<div class="toast" role="status"><span>${esc(msg)}</span>${undo ? `<button id="toast-undo">Annulla</button>` : `<button id="toast-x" aria-label="Chiudi">OK</button>`}</div>`;
  const b = $("#toast-undo"); if (b) b.onclick = () => { root.innerHTML = ""; undo(); };
  const x = $("#toast-x"); if (x) x.onclick = () => { root.innerHTML = ""; };
  toastTimer = setTimeout(() => { root.innerHTML = ""; }, undo ? 6500 : 4000);
}
let sheetAbort = null;
function openSheet(title, html, onMount) {
  closeSheet();
  const root = $("#sheet-root");
  root.innerHTML = `<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-h"><h3>${esc(title)}</h3><button class="iconbtn" id="sheet-close" aria-label="Chiudi">${icon("x")}</button></div>
    <div id="sheet-body">${html}</div></div></div>`;
  $("#scrim").addEventListener("click", e => { if (e.target.id === "scrim") closeSheet(); });
  $("#sheet-close").onclick = closeSheet;
  document.addEventListener("keydown", escClose);
  onMount && onMount($("#sheet-body"));
  const f = $("#sheet-body input, #sheet-body textarea"); if (f && matchMedia("(min-width:700px)").matches) f.focus();
}
function escClose(e) { if (e.key === "Escape") closeSheet(); }
function closeSheet() {
  if (sheetAbort) { try { sheetAbort.abort(); } catch { } sheetAbort = null; }
  $("#sheet-root").innerHTML = ""; document.removeEventListener("keydown", escClose);
}

/* ===================== render shell ===================== */
const TABS = [
  { id: "oggi", name: "Oggi", e: "☀️", title: "Oggi" },
  { id: "pasti", name: "Pasti", e: "🍽️", title: "Pasti" },
  { id: "casa", name: "Casa", e: "🏠", title: "Casa" },
  { id: "soldi", name: "Soldi", e: "💶", title: "Soldi" },
  { id: "veicoli", name: "Auto", e: "🚗", title: "Auto e moto" },
  { id: "altro", name: "Altro", e: "🧩", title: "Altro" },
];
function renderNav() {
  $("#nav").innerHTML = TABS.map(t => `<button data-tab="${t.id}" ${ui.tab === t.id ? 'aria-current="page"' : ""}><span class="e">${t.e}</span><span>${t.name}</span></button>`).join("");
  document.body.dataset.sec = ui.tab === "altro" && ui.altro && SUBPAGES[ui.altro] ? ui.altro : ui.tab;
  const cur = $("#nav [aria-current]"); if (cur && cur.scrollIntoView && !renderNav.done) { cur.scrollIntoView({ block: "nearest", inline: "center" }); renderNav.done = true; }
}
function renderHeader() {
  const d = new Date();
  const name = getDoc("profile").name || "";
  $("#hdr-date").textContent = `${DOW[dowOf(d)]} ${fmtDate(d)}`;
  const h = d.getHours();
  const g = h >= 5 && h < 13 ? ["Buongiorno", "☀️"] : h >= 13 && h < 18 ? ["Buon pomeriggio", "🌤️"] : ["Buonasera", "🌙"];
  const tab = TABS.find(t => t.id === ui.tab) || TABS[0];
  const sp = ui.tab === "altro" && SUBPAGES[ui.altro];
  $("#hdr-greet").textContent = ui.tab === "oggi" ? `${g[0]}${name ? " " + name : ""} ${g[1]}` : sp ? `${sp.e} ${sp.t}` : `${tab.e} ${tab.title}`;
}
function render() {
  renderHeader(); renderNav(); setSync();
  const main = $("#main");
  const y = window.scrollY;
  let html = "";
  if (!store.loaded) html = `<div class="card"><span class="thinking"><span class="spinner"></span>Caricamento dei dati…</span></div>`;
  else if (ui.tab === "oggi") html = viewOggi();
  else if (ui.tab === "pasti") html = viewPasti();
  else if (ui.tab === "casa") html = viewCasa();
  else if (ui.tab === "soldi") html = viewSoldi();
  else if (ui.tab === "veicoli") html = viewVeicoli();
  else html = viewAltro();
  main.innerHTML = `<div class="view">${html}</div>`;
  window.scrollTo(0, y);
}

/* ===================== building blocks ===================== */
const normTxt = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const EMO = {
  chore: [[/piatt|lavell|piano cucina/, "🧽"], [/lenzuol|letto/, "🛏️"], [/bagno|wc|doccia/, "🚿"], [/spazzatura|differenziat|rifiuti/, "🗑️"], [/aspira|scopa|pavimenti/, "🧹"], [/frigo/, "🧊"], [/spesa/, "🛒"], [/batch|cottura|forno|cappa/, "🍳"], [/vetri|finestr/, "🪟"], [/armadio|stagione/, "👕"], [/terrazzo|stendino/, "🪴"], [/spolver|asciugaman/, "🪶"], [/lavatrice/, "🧺"], [/riordino/, "✨"], [/meccanic|gomme|auto|moto|tagliando/, "🔧"], [/chiama|telefon/, "📞"]],
  food: [[/libera|fuori|pizza/, "🍕"], [/pollo/, "🍗"], [/tacchino/, "🦃"], [/tonno|merluzz|pesce|salmone|orata/, "🐟"], [/uov|frittat/, "🥚"], [/carne|manzo|bistecc|hamburger/, "🥩"], [/legum|ceci|fagiol|lentic/, "🫘"], [/fiocchi|formagg|mozzarell|ricotta/, "🧀"], [/yogurt|latte/, "🥛"], [/riso/, "🍚"], [/pasta/, "🍝"], [/pane|toast/, "🍞"], [/insalat|lattuga|rucola/, "🥗"], [/patat/, "🥔"], [/zucchin/, "🥒"], [/pomodor/, "🍅"], [/verdur|peperon|carot|broccol|spinac/, "🥕"], [/frutta|mela|banan|arance/, "🍎"], [/olio/, "🫒"]],
  deadline: [[/affitto/, "🏠"], [/bollett/, "💡"], [/punto/, "🚗"], [/yamaha|moto/, "🏍️"], [/paga|stipend/, "💰"]],
  goal: [[/emergen/, "🛟"], [/scadenz|auto|moto/, "🚗"], [/casa/, "🏡"]],
  product: [[/lavatrice|ammorbid|bucato/, "🧺"], [/piatti/, "🍽️"], [/spugn/, "🧽"], [/sgrassat|detergent|pavimen|candeggin|igienizz/, "🧴"], [/anticalcare/, "💧"], [/igienica/, "🧻"], [/cucina/, "🧻"], [/sacch|spazzatura/, "🗑️"], [/sapone|mani/, "🧼"], [/bagnoschiuma|shampoo|doccia/, "🚿"]],
};
const emo = (kind, text, def = "•") => { const t = normTxt(text); for (const [re, e] of EMO[kind]) if (re.test(t)) return e; return def; };
const REP_EMO = { "Frutta e verdura": "🥦", "Carne e pesce": "🥩", "Latticini e uova": "🥛", "Pane e cereali": "🍞", "Dispensa": "🥫", "Surgelati": "🧊", "Bevande": "🧃", "Casa e pulizia": "🧼", "Altro": "📦" };
const CAT_EMO = { carburante: "⛽", spesa: "🛒", personali: "🍕", casa: "🏠", veicoli: "🚗", salute: "💊", altro: "📦" };
const SLOT_EMO = { colazione: "☕", pranzo: "🍝", cena: "🌙" };
const E = (x, cls = "") => `<span class="e ${cls}" aria-hidden="true">${x}</span>`;

function card(title, emoji, body, right = "") {
  return `<section class="card"><div class="card-h"><h2>${emoji ? `<span class="badge">${E(emoji)}</span>` : ""}${title}</h2>${right}</div>${body}</section>`;
}
function fold(key, label, body) {
  return `<details data-key="${key}" ${ui.open[key] ? "open" : ""}><summary>${label}</summary>${body}</details>`;
}
function seg(key, opts) {
  return `<div class="seg" role="group">${opts.map(([id, n]) => `<button data-seg="${key}" data-val="${id}" aria-pressed="${ui[key] === id}">${n}</button>`).join("")}</div>`;
}
function emptyBox(emoji, t) { return `<div class="empty">${E(emoji)}<span>${t}</span></div>`; }
function emptyLine(t) { return `<div class="sub" style="padding:6px 0">${t}</div>`; }
function backBtn() { return `<button class="btn ghost" data-act="altro" data-id="" style="align-self:flex-start">${icon("chev-l", "sm")}Altro</button>`; }
function mealsForDay(d) { const m = getDoc("meals"); return (m.plan || {})[dowOf(d)] || {}; }
function weeklyFoodBudget() {
  const l = linesForMonth(monthKey(today())).find(x => x.cat === "spesa");
  return l ? (+l.amount * 12 / 52) : null;
}
function checkRow(act, id, done, title, emoji, meta = "", cls = "") {
  return `<div class="item ${done ? "done" : ""}"><span class="em e">${emoji}</span><div class="body"><div class="t">${esc(title)}</div></div>
    ${meta ? `<span class="${cls ? "pill " + cls : "sub num"}">${meta}</span>` : ""}
    <button class="chk lg" role="checkbox" aria-checked="${!!done}" aria-label="Fatto: ${esc(title)}" data-act="${act}" data-id="${esc(id)}">${icon("check")}</button></div>`;
}
function dlStatus(dl) {
  const occ = deadlineOccurrence(dl);
  if (!occ) return { occ: null, cls: "warn", label: "data?" };
  const st = statusOf(occ); return { occ, cls: st.cls, label: st.label };
}
function dlRow(dl) {
  const s = dlStatus(dl);
  const amt = dl.amount != null ? eur(dl.amount) : "";
  return `<div class="item tap" data-act="dl-open" data-id="${esc(dl.id)}"><span class="em e">${emo("deadline", dl.title, "📌")}</span><div class="body"><div class="t">${esc(dl.title)}</div><div class="s">${s.occ ? fmtDate(s.occ.date) : "data da definire"}${amt ? " · " + amt : ""}</div></div><span class="pill ${s.cls}">${s.label}</span></div>`;
}
function sortedDeadlines() {
  return (getDoc("money").deadlines || []).map(dl => ({ dl, s: dlStatus(dl) }))
    .filter(x => x.s.occ || (x.dl.kind !== "monthly" && !x.dl.date))
    .sort((a, b) => (a.s.occ ? a.s.occ.date : 8.64e15) - (b.s.occ ? b.s.occ.date : 8.64e15));
}
function ring(pct, color, center, sub) {
  const r = 50, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  return `<svg class="ring" viewBox="0 0 120 120" role="img" aria-label="${Math.round(p * 100)}%"><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="12"/>
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)"/>
    <text x="60" y="${sub ? 58 : 66}" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="700" font-size="${String(center).length > 4 ? 20 : 26}" fill="var(--fg)">${center}</text>
    ${sub ? `<text x="60" y="78" text-anchor="middle" font-size="11" font-weight="700" fill="var(--muted)">${sub}</text>` : ""}</svg>`;
}

/* ===================== ingredienti ===================== */
const BASICS = ["olio", "sale", "pepe", "aceto", "acqua", "spezie", "erbe", "origano", "rosmarino", "aglio", "limone", "zucchero", "farina"];
const STOP = new Set(["di", "del", "dei", "della", "delle", "con", "al", "alla", "allo", "per", "in", "g", "kg", "ml", "gr", "lt", "cucchiai", "cucchiaio", "scatoletta", "scatolette", "confezione", "pezzi", "fette", "fresco", "fresca", "freschi", "fresche", "o", "e", "simile", "misto", "miste", "misti", "naturale", "qb", "un", "una", "uno", "facoltativa", "facoltativo"]);
const stemW = w => (w.length > 4 ? w.replace(/[aeio]$/, "") : w);
const keyWords = s => normTxt(s).split(" ").filter(w => w.length > 2 && !STOP.has(w)).map(stemW);
function isBasic(ing) { const k = keyWords(ing); return k.length > 0 && k.every(w => BASICS.some(b => stemW(b) === w)); }
function matchIn(ing, names) { const k = keyWords(ing); if (!k.length) return true; return names.some(n => { const nk = keyWords(n); return k.some(w => nk.includes(w)); }); }
function mealIngredients(m) {
  if (Array.isArray(m?.ing) && m.ing.length) return m.ing;
  if (m?.r) { const r = (getDoc("meals").recipes || []).find(x => x.id === m.r); if (r) return (r.ingredients || []).map(i => i.replace(/\s*\d.*$/, "").trim()).filter(Boolean); }
  return [];
}
function ingredientStatus(m) {
  const pantry = (getDoc("pantry").items || []).map(i => i.name);
  const list = (getDoc("shopping").items || []).filter(i => !i.checked).map(i => i.name);
  return mealIngredients(m).filter(i => !isBasic(i)).map(i => ({ name: i, have: matchIn(i, pantry), inList: matchIn(i, list) }));
}
function ingChips(m) {
  const ings = ingredientStatus(m); if (!ings.length) return "";
  return `<div class="ings">${ings.map(i => i.have ? `<span class="ing ok">${E(emo("food", i.name, "✓"))}${esc(i.name)}</span>`
    : i.inList ? `<span class="ing warn" title="Manca, già in lista">🛒 ${esc(i.name)}</span>`
    : `<button class="ing bad" data-act="ing-add" data-id="${esc(i.name)}" aria-label="Manca ${esc(i.name)}: aggiungi alla spesa">＋ ${esc(i.name)}</button>`).join("")}</div>`;
}
function mealBlock(dw, slot, m) {
  return `<div class="meal"><span class="em e">${SLOT_EMO[slot]}</span><div class="txt"><div class="slot">${slot}</div>
    <div class="tap" data-act="meal-edit" data-dow="${dw}" data-slot="${slot}">${m?.t ? esc(m.t) : '<span class="muted">tocca per scegliere</span>'}</div>${m?.t ? ingChips(m) : ""}</div></div>`;
}

const REP_KW = [["Carne e pesce", /pollo|tacchino|merluzz|pesce|salmone|orata|carne|manzo|bistecc|hamburger|prosciutt/], ["Latticini e uova", /uov|yogurt|latte|fiocchi|formagg|mozzarell|ricotta|burro/], ["Pane e cereali", /riso|pasta|pane|farro|avena|cereali|cracker/], ["Surgelati", /surgelat/], ["Dispensa", /tonno|olio|sale|pepe|spezie|legum|ceci|fagiol|lentic|aceto|passata|scatol/], ["Frutta e verdura", /patat|insalat|lattuga|zucchin|verdur|pomodor|frutta|mela|banan|carot|peperon|limone|cipoll|spinac|broccol/]];
function guessRep(name) { const t = normTxt(name); for (const [rep, re] of REP_KW) if (re.test(t)) return rep; return "Altro"; }
function completeFromMenu() {
  const m = getDoc("meals"); const pantry = (getDoc("pantry").items || []).map(i => i.name);
  const list = (getDoc("shopping").items || []).filter(i => !i.checked).map(i => i.name); const need = [];
  for (let d = 1; d <= 7; d++) { const p = (m.plan || {})[d] || {};
    for (const s of ["colazione", "pranzo", "cena"]) for (const ing of mealIngredients(p[s])) {
      if (isBasic(ing) || matchIn(ing, pantry) || matchIn(ing, list) || matchIn(ing, need)) continue; need.push(ing); } }
  if (!need.length) { toast("✅ Hai già tutto, in lista o in casa"); return; }
  const prev = structuredClone(getDoc("shopping"));
  addShopping(need.map(n => ({ name: n.charAt(0).toUpperCase() + n.slice(1), reparto: guessRep(n), src: "menu" })));
  toast(`🛒 ${need.length} ${need.length === 1 ? "prodotto aggiunto" : "prodotti aggiunti"}`, () => mut("shopping", x => { x.items = prev.items; }));
}

/* ===================== OGGI ===================== */
function todoFor(d) {
  const h = getDoc("house"); const isToday = ymd(d) === ymd(today()); const out = [];
  for (const x of h.tasks || []) {
    const st = taskState(x, d); if (st.hide) continue;
    let hit = false;
    if (x.freq === "daily") hit = isToday;
    else if (x.freq === "weekly") hit = x.dow === dowOf(d) || (isToday && st.overdue);
    else hit = x.next === ymd(d) || (isToday && st.overdue) || (isToday && x.lastDone === ymd(d));
    if (!hit) continue;
    let title = x.title;
    if (x.kind === "spesa") { const n = (getDoc("shopping").items || []).filter(i => !i.checked).length; if (n) title += ` · ${n} ${n === 1 ? "prodotto" : "prodotti"}`; }
    out.push({ act: "task-toggle", id: x.id, title, emoji: emo("chore", x.title, "✅"), done: isToday && st.done, late: isToday && st.overdue, min: x.minutes });
  }
  for (const l of h.laundry || []) { const st = laundryState(l, d); if (st.today) out.push({ act: "laundry-toggle", id: l.id, title: `Lavatrice · ${l.type}`, emoji: "🧺", done: isToday && st.done, min: null, meta: l.temp }); }
  for (const dl of getDoc("money").deadlines || []) {
    const occ = deadlineOccurrence(dl, today()); if (!occ || occ.paid) continue;
    const n = daysBetween(occ.date, d);
    if (n === 0 || (isToday && n < 0)) out.push({ deadline: true, id: dl.id, title: dl.title + (dl.amount != null ? " · " + eur(dl.amount) : ""), emoji: emo("deadline", dl.title, "📌"), late: n < 0 });
  }
  return out.sort((a, b) => (a.done - b.done) || ((b.late ? 1 : 0) - (a.late ? 1 : 0)));
}
function viewOggi() {
  return `<div class="grid2"><div class="col">${cardImpegni()}${cardDaFare()}</div><div class="col">${cardPasti()}</div></div>`;
}
function cardImpegni() {
  const t = today(), tm = addDays(t, 1);
  const rem = (getDoc("reminders").items || []);
  const list = d => { const l = rem.filter(e => e.date === ymd(d)).slice().sort((a, b) => a.s.localeCompare(b.s)); return l.length ? l.map(e => `<div class="ev"><div class="when num">${e.s}</div><div class="what">${esc(e.title)}</div></div>`).join("") : `<div class="sub" style="padding:4px 0 6px">🌤️ Libero</div>`; };
  const body = `<div class="notice info">${icon("info", "sm")}<div>Calendario in arrivo nella v2: gli eventi del "+" restano qui come promemoria.</div></div>
    <div class="label daylabel" style="margin-top:8px">Oggi</div>${list(t)}<div class="label daylabel" style="margin-top:10px">Domani</div>${list(tm)}`;
  return card("Impegni", "📅", body);
}
function cardPasti() {
  const t = today(); const dw = dowOf(t); const p = mealsForDay(t);
  const slots = dw >= 6 ? ["colazione", "pranzo", "cena"] : ["colazione", "cena"];
  return card("Si mangia", "🍽️", `${slots.map(s => mealBlock(dw, s, p[s])).join("")}${dw <= 5 ? `<div class="sub" style="margin-top:4px">🏭 Pranzo in mensa</div>` : ""}`);
}
function cardDaFare() {
  const t = today(), tm = addDays(t, 1);
  const rowToday = x => x.deadline
    ? `<div class="item tap" data-act="dl-open" data-id="${esc(x.id)}"><span class="em e">${x.emoji}</span><div class="body"><div class="t">${esc(x.title)}</div></div><span class="pill ${x.late ? "bad" : "warn"}">${x.late ? "scaduto" : "oggi"}</span></div>`
    : checkRow(x.act, x.id, x.done, x.title, x.emoji, x.late ? "in ritardo" : x.meta ? esc(x.meta) : x.min ? x.min + "′" : "", x.late ? "bad" : "");
  const rowTom = x => `<div class="item"><span class="em e">${x.emoji}</span><div class="body"><div class="t">${esc(x.title)}</div></div>${x.min ? `<span class="sub num">${x.min}′</span>` : ""}</div>`;
  const a = todoFor(t);
  const dailyIds = new Set((getDoc("house").tasks || []).filter(y => y.freq === "daily").map(y => y.id));
  const b = todoFor(tm).filter(x => !dailyIds.has(x.id));
  const done = a.filter(x => x.done).length, tot = a.filter(x => !x.deadline).length;
  const right = tot ? `<span class="pill ${done === tot ? "ok" : "acc"} num">${done}/${tot}</span>` : "";
  return card("Da fare", "✅", `${tot && done === tot ? `<div class="party">🎉 Tutto fatto per oggi!</div>` : ""}
    <div class="label daylabel">Oggi</div>${a.length ? `<div class="list">${a.map(rowToday).join("")}</div>` : `<div class="sub" style="padding:4px 0">😌 Niente</div>`}
    <div class="label daylabel" style="margin-top:12px">Domani</div>${b.length ? `<div class="list">${b.map(rowTom).join("")}</div>` : `<div class="sub" style="padding:4px 0">😌 Niente</div>`}`, right);
}

/* ===================== PASTI ===================== */
function viewPasti() {
  const b = ui.pasti === "spesa" ? pastiSpesa() : ui.pasti === "dispensa" ? pastiDispensa() : pastiPiano();
  const n = (getDoc("shopping").items || []).filter(i => !i.checked).length;
  return `${seg("pasti", [["piano", "🗓️ Menu"], ["spesa", `🛒 Spesa${n ? " · " + n : ""}`], ["dispensa", "🥫 In casa"]])}${b}`;
}
function pastiPiano() {
  const m = getDoc("meals"); const td = dowOf(today());
  const sel = ui.pday || td; const est = m.estimate;
  const strip = `<div class="daystrip">${[1, 2, 3, 4, 5, 6, 7].map(d => `<button data-act="pday" data-id="${d}" aria-pressed="${d === sel}" class="${d === td ? "today" : ""}"><small>${DOW_S[d]}</small>${E(emo("food", ((m.plan || {})[d]?.cena?.t) || "", "🍽️"))}</button>`).join("")}</div>`;
  const p = (m.plan || {})[sel] || {};
  const slots = sel >= 6 ? ["colazione", "pranzo", "cena"] : ["colazione", "cena"];
  const recipes = slots.map(s => p[s]?.r).filter(Boolean).map(id => (m.recipes || []).find(r => r.id === id)).filter(Boolean);
  const dayCard = card(`${DOW[sel]}${sel === td ? " · oggi" : ""}`, "📆", `${slots.map(s => mealBlock(sel, s, p[s])).join("")}
    ${recipes.length ? `<div class="row" style="margin-top:8px">${recipes.map(r => `<button class="btn soft" data-act="rec-open" data-id="${r.id}">📖 ${esc(r.name)}</button>`).join("")}</div>` : ""}`);
  const tools = `${est?.obiettivo_kcal ? `<button class="btn ghost" data-act="est-info" style="padding:0">🔥 ${Math.round(est.obiettivo_kcal)} kcal · 💪 ${Math.round(est.proteine_g || 0)} g proteine al giorno</button>` : ""}`;
  return `${strip}${dayCard}${tools}`;
}
function pastiSpesa() {
  const items = getDoc("shopping").items || [];
  const all = items.reduce((a, i) => a + (+i.cost || 0), 0);
  const wb = weeklyFoodBudget();
  const groups = REPARTI.map(r => [r, items.filter(i => (i.reparto || "Altro") === r)]).filter(([, l]) => l.length);
  const nChecked = items.filter(i => i.checked).length;
  const head = items.length ? `<div class="catrow" style="padding-top:0"><div class="t" style="font-weight:700">🛒 ${nChecked} di ${items.length} presi</div><div class="num sub">${all && wb ? `≈ ${eur(all)} / ${eur(wb)}` : ""}</div><div class="bar"><span class="ok" style="width:${items.length ? nChecked / items.length * 100 : 0}%"></span></div></div>` : "";
  const list = items.length ? groups.map(([r, l]) => `<div class="label daylabel" style="margin-top:10px">${E(REP_EMO[r] || "📦")} ${esc(r)}</div><div class="list">${l.map(i => `<div class="item ${i.checked ? "done" : ""}">
      <button class="chk lg" role="checkbox" aria-checked="${!!i.checked}" aria-label="Preso: ${esc(i.name)}" data-act="shop-toggle" data-id="${i.id}">${icon("check")}</button>
      <div class="body"><div class="t">${esc(i.name)}</div>${i.qty || i.cost ? `<div class="s">${esc(i.qty || "")}${i.qty && i.cost ? " · " : ""}${i.cost ? "≈ " + eur(i.cost) : ""}</div>` : ""}</div>
      <button class="iconbtn" aria-label="Elimina ${esc(i.name)}" data-act="shop-del" data-id="${i.id}">${icon("x", "sm")}</button></div>`).join("")}</div>`).join("") : emptyBox("🧺", "Lista vuota");
  const add = `<form class="form" data-form="shop-add" style="gap:8px"><input class="in" id="shop-name" placeholder="Cosa devi comprare?" aria-label="Prodotto" maxlength="80"><div class="addrow" style="margin-top:0"><select class="in" id="shop-rep" aria-label="Reparto" style="flex:0 0 46%;padding:0 8px;font-size:15px">${REPARTI.map(r => `<option value="${r}" ${r === ui.lastRep ? "selected" : ""}>${REP_EMO[r]} ${r}</option>`).join("")}</select><button class="btn primary" style="flex:1">＋ Aggiungi</button></div></form>`;
  const actions = `<div class="row" style="margin-top:12px"><button class="btn soft" data-act="shop-menu" style="flex:1">🔄 Completa dal menu</button>${nChecked ? `<button class="btn" data-act="shop-clear" style="flex:1">🧹 Togli presi</button>` : ""}</div>`;
  return card("Lista della spesa", "🛒", `${head}${add}${list}${actions}`);
}
function pastiDispensa() {
  const items = (getDoc("pantry").items || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const repOf = i => REPARTI.includes(i.reparto) ? i.reparto : guessRep(i.name);
  const groups = REPARTI.map(r => [r, items.filter(i => repOf(i) === r)]).filter(([, l]) => l.length);
  const add = `<form class="form" data-form="pantry-add" style="gap:8px"><input class="in" id="pantry-in" placeholder="Cosa hai in casa?" aria-label="Prodotto in dispensa" maxlength="80"><div class="addrow" style="margin-top:0"><select class="in" id="pantry-rep" aria-label="Reparto" style="flex:0 0 46%;padding:0 8px;font-size:15px">${REPARTI.map(r => `<option value="${r}" ${r === ui.lastRep ? "selected" : ""}>${REP_EMO[r]} ${r}</option>`).join("")}</select><button class="btn primary" style="flex:1">＋ Aggiungi</button></div></form>`;
  const list = groups.map(([r, l]) => `<div class="label daylabel" style="margin-top:14px">${E(REP_EMO[r] || "📦")} ${esc(r)} <span class="pill" style="margin-left:auto">${l.length}</span></div>
    <div class="grid-chips" style="margin-top:6px">${l.map(i => `<button class="gchip" data-act="pantry-del" data-id="${i.id}" aria-label="${esc(i.name)}: finito">${E(emo("food", i.name, REP_EMO[r] || "🥫"))}${esc(i.name)}${i.qty ? ` <span class="sub">${esc(i.qty)}</span>` : ""} <span class="muted">✕</span></button>`).join("")}</div>`).join("");
  return card("In casa", "🥫", `${add}${items.length ? `${list}<div class="sub" style="margin-top:12px">Tocca un prodotto quando finisce.</div>` : emptyBox("🥫", "Si riempie quando spunti la spesa")}`);
}

/* ===================== CASA ===================== */
function viewCasa() {
  const h = getDoc("house"); const t = today();
  const all = (h.tasks || []).map(x => ({ x, st: taskState(x, t) })).filter(o => !o.st.hide);
  const a = todoFor(t).filter(x => !x.deadline);
  const done = a.filter(x => x.done).length;
  const mins = a.filter(x => !x.done).reduce((s, x) => s + (+x.min || 0), 0);
  const top = `<section class="card"><div class="hero">${ring(a.length ? done / a.length : 1, "var(--sec)", `${done}/${a.length}`, "oggi")}
      <div><div class="sec-title">${a.length && done === a.length ? "🎉 Casa a posto!" : a.length ? "Oggi in casa" : "😌 Niente oggi"}</div><div class="sub">${mins ? `⏱️ circa ${mins} minuti` : "Goditi la serata"}</div></div></div>
      ${a.length ? `<div class="list" style="margin-top:10px">${a.map(x => checkRow(x.act, x.id, x.done, x.title, x.emoji, x.late ? "in ritardo" : x.meta ? esc(x.meta) : x.min ? x.min + "′" : "", x.late ? "bad" : "")).join("")}</div>` : ""}</section>`;
  // settimana
  const days = [];
  for (let i = 1; i <= 6; i++) {
    const d = addDays(t, i);
    const l = todoFor(d).filter(x => !x.deadline && !(h.tasks || []).some(y => y.id === x.id && y.freq === "daily"));
    if (l.length) days.push(`<div class="label daylabel" style="margin-top:8px">${DOW[dowOf(d)]}</div>${l.map(x => `<div class="item" style="min-height:44px"><span class="em e">${x.emoji}</span><div class="body"><div class="t" style="font-weight:500">${esc(x.title)}</div></div>${x.min ? `<span class="sub num">${x.min}′</span>` : ""}</div>`).join("")}`);
  }
  const week = card("Prossimi giorni", "🗓️", days.length ? `<div class="list">${days.join("")}</div>` : emptyBox("🌴", "Settimana libera"));
  // prodotti
  const ps = (h.products || []).slice().sort((x, y) => (x.status === "low" ? 0 : 1) - (y.status === "low" ? 0 : 1));
  const low = ps.filter(p => p.status === "low" && !p.inList);
  const prods = card("Prodotti", "🧴", `<div class="grid-chips">${ps.map(p => `<button class="gchip ${p.inList ? "inl" : p.status === "low" ? "low" : ""}" data-act="prod-status" data-id="${p.id}" aria-label="${esc(p.name)}: ${p.inList ? "in lista" : p.status === "low" ? "sta finendo" : "ok"}">${E(emo("product", p.name, "🧴"))}${esc(p.name)}${p.inList ? " 🛒" : ""}</button>`).join("")}</div>
    <div class="sub" style="margin-top:10px">Tocca quando un prodotto sta finendo.</div>
    ${low.length ? `<button class="btn primary block" data-act="prod-cart-all" style="margin-top:10px">🛒 Metti in lista (${low.length})</button>` : ""}
    <form class="addrow" data-form="prod-add"><input class="in" id="prod-in" placeholder="Nuovo prodotto" aria-label="Nuovo prodotto" maxlength="60"><button class="btn" aria-label="Aggiungi">${icon("plus", "sm")}</button></form>`);
  // gestione
  const groups = [["daily", "Ogni giorno"], ["weekly", "Ogni settimana"], ["interval", "Periodiche"], ["once", "Una volta"]];
  const allRows = groups.map(([f, n]) => { const l = all.filter(o => o.x.freq === f); if (!l.length) return "";
    return `<div class="label daylabel" style="margin-top:10px">${n}</div><div class="list">${l.map(({ x, st }) => `<div class="item tap" data-act="task-edit" data-id="${x.id}"><span class="em e">${emo("chore", x.title, "✅")}</span><div class="body"><div class="t" style="font-weight:500">${esc(x.title)}</div></div><span class="sub">${x.freq === "weekly" ? DOW_S[x.dow] : x.freq === "daily" ? "" : fmtDate(st.next)}</span></div>`).join("")}</div>`; }).join("");
  const laundryRows = (h.laundry || []).slice().sort((a, b) => a.dow - b.dow).map(l => `<div class="item"><span class="em e">🧺</span><div class="body"><div class="t">${DOW_S[l.dow]} · ${esc(l.type)}</div><div class="s">${esc(l.program)} · ${esc(l.temp)}${l.everyWeeks > 1 ? " · ogni " + l.everyWeeks + " sett." : ""}</div></div></div>`).join("");
  const manage = `<section class="card">${fold("tasks", "⚙️ Tutte le faccende", `${allRows}<button class="btn soft block" data-act="task-new" style="margin-top:10px">＋ Nuova faccenda</button>`)}
    ${fold("laundry", "🧺 Piano lavatrici", `<div class="list">${laundryRows}</div><div class="sub" style="margin-top:6px">🌧️ Se piove, stendi in casa.</div>`)}</section>`;
  return `${top}<div class="grid2"><div class="col">${week}</div><div class="col">${prods}${manage}</div></div>`;
}

/* ===================== SOLDI ===================== */
function viewSoldi() {
  const mk = ui.month; const [y, m] = mk.split("-").map(Number);
  const S = monthSummary(mk);
  const vars = S.lines.filter(l => l.group === "variabili");
  const usedPct = S.varBudget ? S.spent / S.varBudget : 0;
  const ringColor = usedPct > 1 ? "var(--bad)" : usedPct > .85 ? "var(--warn)" : "var(--sec)";
  const hero = `<section class="card">
      <div class="monthnav"><button class="iconbtn" aria-label="Mese precedente" data-act="month" data-d="-1">${icon("chev-l")}</button><span class="label" style="color:var(--sec)">${MESI[m - 1]} ${y}</span><button class="iconbtn" aria-label="Mese successivo" data-act="month" data-d="1">${icon("chev-r")}</button></div>
      <div class="hero" style="margin-top:4px">${ring(usedPct, ringColor, Math.round(usedPct * 100) + "%", "speso")}
        <div><div class="sub">💶 Ti restano</div><div class="big num" style="color:var(--${S.left < 0 ? "bad" : "ok"})">${eur(S.left)}</div><div class="sub">obiettivo fine mese ${eur(S.planned)}</div></div></div>
      <button class="btn primary block" data-act="exp-new" style="margin-top:14px">＋ Registra spesa</button></section>`;
  const budgetCats = new Set(vars.map(l => l.cat));
  const tiles = vars.map(l => { const sp = S.byCat[l.cat] || 0; const pct = l.amount ? Math.min(100, sp / l.amount * 100) : 0; const cls = sp > l.amount ? "bad" : sp > l.amount * .85 ? "warn" : "";
    return `<div class="cat">${E(CAT_EMO[l.cat] || "📦")}<div class="n">${esc(catName(l.cat))}</div><div class="v num">${eur(sp)} <span class="sub">/ ${eur(l.amount)}</span></div><div class="bar"><span class="${cls}" style="width:${pct}%"></span></div></div>`; });
  for (const [c, v] of Object.entries(S.byCat)) if (!budgetCats.has(c)) tiles.push(`<div class="cat">${E(CAT_EMO[c] || "📦")}<div class="n">${esc(catName(c))}</div><div class="v num">${eur(v)}</div><span class="pill warn" style="align-self:flex-start">extra</span></div>`);
  const exp = S.exp.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const expRows = exp.map(e => `<div class="item"><span class="em e">${CAT_EMO[e.cat] || "📦"}</span><div class="body"><div class="t">${esc(e.note || catName(e.cat))}</div><div class="s">${fmtDate(parseD(e.date))}</div></div><span class="num" style="font-weight:700">${eur(e.amount)}</span><button class="iconbtn" aria-label="Elimina" data-act="exp-del" data-id="${e.id}">${icon("x", "sm")}</button></div>`).join("");
  const spese = card("Budget del mese", "📊", `<div class="cats">${tiles.join("")}</div>${exp.length ? `<div style="margin-top:8px">${fold("mov", `🧾 Movimenti (${exp.length})`, `<div class="list">${expRows}</div>`)}</div>` : ""}`);
  const dls = sortedDeadlines();
  const subs = (getDoc("money").subs || []).slice().sort((a, b) => a.day - b.day); const subTot = subs.reduce((s, x) => s + (+x.amount || 0), 0);
  const scad = card("Scadenze", "⏰", `<div class="list">${dls.slice(0, 4).map(x => dlRow(x.dl)).join("")}</div>
    ${dls.length > 4 ? fold("dl", `📋 Altre ${dls.length - 4}`, `<div class="list">${dls.slice(4).map(x => dlRow(x.dl)).join("")}</div>`) : ""}
    ${fold("subs", `🔁 Abbonamenti · ${eur(subTot)}/mese`, `<div class="list">${subs.map(s => `<div class="item"><span class="em e">💳</span><div class="body"><div class="t">${esc(s.name)}</div><div class="s">il ${s.day}</div></div><span class="num">${eur(s.amount)}</span></div>`).join("")}</div><div class="sub" style="margin-top:6px">${eur(subTot * 12)} all'anno</div>`)}`);
  const goals = (getDoc("money").goals || []).map(g => { const pct = g.target ? Math.min(100, g.current / g.target * 100) : 0;
    return `<div class="item tap" data-act="goal-edit" data-id="${g.id}" style="flex-wrap:wrap"><span class="em e">${emo("goal", g.name, "🎯")}</span><div class="body"><div class="t">${esc(g.name)}</div><div class="s num">${eur(g.current)}${g.target ? " di " + eur(g.target) : ""}</div></div><span class="pill ${pct >= 100 ? "ok" : "acc"} num">${g.target ? Math.round(pct) + "%" : "—"}</span><div class="bar" style="flex-basis:100%"><span class="${pct >= 100 ? "ok" : ""}" style="width:${pct}%"></span></div></div>`; }).join("");
  return `${hero}<div class="grid2"><div class="col">${spese}${card("Obiettivi", "🎯", goals ? `<div class="list">${goals}</div>` : emptyBox("🎯", "Nessun obiettivo"))}</div><div class="col">${scad}</div></div>`;
}

/* ===================== ALTRO ===================== */
function altroNote() {
  const n = getDoc("notes"); const q = ui.noteQ.trim().toLowerCase();
  const items = (n.items || []).filter(x => !q || x.text.toLowerCase().includes(q)).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  return `${backBtn()}${card("Note", "📝", `<form class="form" data-form="note-add"><textarea class="in" id="note-in" placeholder="Scrivi una nota…" aria-label="Nuova nota" maxlength="2000" style="min-height:70px"></textarea><button class="btn primary">💾 Salva</button></form>
    ${(n.items || []).length > 5 ? `<input class="in" id="note-q" placeholder="🔍 Cerca" value="${esc(ui.noteQ)}" aria-label="Cerca nelle note" style="margin-top:10px">` : ""}
    ${items.length ? `<div class="list" style="margin-top:6px">${items.map(x => `<div class="item"><span class="em e">💡</span><div class="body"><div class="t" style="white-space:pre-wrap;font-weight:500">${esc(x.text)}</div><div class="s">${x.at ? fmtDate(new Date(x.at)) : ""}</div></div><button class="iconbtn" aria-label="Elimina nota" data-act="note-del" data-id="${x.id}">${icon("x", "sm")}</button></div>`).join("")}</div>` : emptyBox("📝", q ? "Nessun risultato" : "Nessuna nota")}`)}`;
}
/* ===================== events (delegation) ===================== */
document.addEventListener("click", e => {
  const nav = e.target.closest("[data-tab]");
  if (nav && nav.closest("#nav")) { ui.tab = nav.dataset.tab; if (ui.tab !== "altro") ui.altro = ""; saveUi(); render(); window.scrollTo(0, 0); return; }
  const sg = e.target.closest("[data-seg]");
  if (sg) { ui[sg.dataset.seg] = sg.dataset.val; saveUi(); render(); return; }
  const a = e.target.closest("[data-act]"); if (!a) return;
  const act = a.dataset.act, id = a.dataset.id;
  ACTIONS[act] && ACTIONS[act](a, id, e);
});
document.addEventListener("submit", e => {
  const f = e.target.closest("[data-form]"); if (!f) return;
  e.preventDefault(); FORMS[f.dataset.form] && FORMS[f.dataset.form](f);
});
document.addEventListener("input", e => {
  if (e.target.id === "note-q") { ui.noteQ = e.target.value; const pos = e.target.selectionStart; render(); const el = $("#note-q"); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }
});
$("#fab").onclick = () => openQuickAdd();
document.addEventListener("toggle", e => { const k = e.target?.dataset?.key; if (k) { ui.open[k] = e.target.open; saveUi(); } }, true);

const ACTIONS = {
  goto(a) { ui.tab = a.dataset.tab; if (a.dataset.sub) ui[ui.tab] = a.dataset.sub; saveUi(); render(); window.scrollTo(0, 0); },
  altro(a, id) { ui.altro = id || ""; saveUi(); render(); window.scrollTo(0, 0); },
  // priorità
  "prio-toggle"(a) { const i = +a.dataset.i; mut("priorities", p => { p.items[i].done = !p.items[i].done; }); },
  "prio-del"(a) { const i = +a.dataset.i; const prev = structuredClone(getDoc("priorities")); mut("priorities", p => { p.items.splice(i, 1); }); toast("Priorità eliminata", () => mut("priorities", p => { Object.assign(p, prev); })); },
  "prio-carry"() { const p = getDoc("priorities"); const left = (p.items || []).filter(i => !i.done).slice(0, 3).map(i => ({ text: i.text, done: false })); mut("priorities", d => { d.date = ymd(today()); d.items = left; }); },
  // pasti
  "meal-edit"(a) { editMeal(+a.dataset.dow, a.dataset.slot); },
  "day-open"(a) { openDay(+a.dataset.dow); },
  "pday"(a, id) { ui.pday = +id; render(); },
  "ing-add"(a, id) { addShopping([{ name: id, reparto: "Altro", src: "pasti" }]); toast(`"${id}" aggiunto alla spesa`); },
  "est-info"() { const e = getDoc("meals").estimate || {}; openSheet("Stime del piano", `<div class="form"><div class="kv"><div><div class="k">Fabbisogno</div><div class="v num">${e.fabbisogno_kcal ? Math.round(e.fabbisogno_kcal) + " kcal" : "—"}</div></div><div><div class="k">Obiettivo</div><div class="v num">${e.obiettivo_kcal ? Math.round(e.obiettivo_kcal) + " kcal" : "—"}</div></div><div><div class="k">Proteine</div><div class="v num">${e.proteine_g ? Math.round(e.proteine_g) + " g" : "—"}</div></div><div><div class="k">Spesa</div><div class="v num">${e.costo ? eur(e.costo) : "—"}</div></div></div>${e.spiegazione ? `<div class="sub" style="white-space:pre-wrap">${esc(e.spiegazione)}</div>` : ""}<div class="sub">Sono stime: non sostituiscono un medico o un nutrizionista.</div></div>`); },
  "shop-menu"() { completeFromMenu(); },
  "shop-toggle"(a, id) {
    const it = getDoc("shopping").items.find(x => x.id === id); if (!it) return;
    const now = !it.checked;
    mut("shopping", s => { const x = s.items.find(y => y.id === id); x.checked = now; });
    mut("pantry", p => {
      p.items = p.items || [];
      if (now) { if (!p.items.some(y => y.src === id)) p.items.push({ id: newId(), name: it.name, qty: it.qty || "", reparto: it.reparto, added: ymd(today()), src: id }); }
      else p.items = p.items.filter(y => y.src !== id);
    });
  },
  "shop-del"(a, id) { const prev = structuredClone(getDoc("shopping")); const it = prev.items.find(x => x.id === id); mut("shopping", s => { s.items = s.items.filter(x => x.id !== id); }); toast(`"${it?.name}" eliminato`, () => mut("shopping", s => { s.items = prev.items; })); },
  "shop-clear"() { const prev = structuredClone(getDoc("shopping")); const n = prev.items.filter(x => x.checked).length; mut("shopping", s => { s.items = s.items.filter(x => !x.checked); }); toast(`${n} prodotti rimossi dalla lista`, () => mut("shopping", s => { s.items = prev.items; })); },
  "pantry-del"(a, id) { const prev = structuredClone(getDoc("pantry")); const it = prev.items.find(x => x.id === id); mut("pantry", p => { p.items = p.items.filter(x => x.id !== id); }); toast(`"${it?.name}" tolto dalla dispensa`, () => mut("pantry", p => { p.items = prev.items; })); },
  "rec-fav"(a, id) { mut("meals", m => { const r = m.recipes.find(x => x.id === id); if (r) r.fav = !r.fav; }); },
  "rec-open"(a, id) { openRecipe(id); },
  // casa
  "task-toggle"(a, id) { const t = getDoc("house").tasks.find(x => x.id === id); if (t) completeTask(t); },
  "task-edit"(a, id) { editTask(id); },
  "task-new"() { editTask(null); },
  "laundry-toggle"(a, id) {
    mut("house", h => { const l = h.laundry.find(x => x.id === id); const st = laundryState(l);
      if (st.done) { l.lastDone = l.prevLast || null; delete l.prevLast; } else { l.prevLast = l.lastDone || null; l.lastDone = ymd(today()); } });
  },
  "prod-status"(a, id) { mut("house", h => { const p = h.products.find(x => x.id === id); p.status = p.status === "low" ? "ok" : "low"; if (p.status === "ok") p.inList = false; }); },
  "prod-cart"(a, id) { const p = getDoc("house").products.find(x => x.id === id); productsToCart([p]); },
  "prod-cart-all"() { productsToCart(getDoc("house").products.filter(p => p.status === "low" && !p.inList)); },
  "prod-del"(a, id) { const prev = structuredClone(getDoc("house")); const p = prev.products.find(x => x.id === id); mut("house", h => { h.products = h.products.filter(x => x.id !== id); }); toast(`"${p?.name}" eliminato`, () => mut("house", h => { h.products = prev.products; })); },
  // soldi
  month(a) { const [y, m] = ui.month.split("-").map(Number); ui.month = monthKey(new Date(y, m - 1 + (+a.dataset.d), 1)); render(); },
  "exp-new"() { openQuickAdd("spesa-sostenuta"); },
  "exp-del"(a, id) { const key = "exp-" + ui.month; const prev = structuredClone(getDoc(key)); const it = prev.items.find(x => x.id === id); mut(key, d => { d.items = d.items.filter(x => x.id !== id); }); toast(`Spesa di ${eur(it?.amount)} eliminata`, () => mut(key, d => { d.items = prev.items; })); },
  "dl-open"(a, id) { openDeadline(id); },
  "goal-edit"(a, id) { editGoal(id); },
  // note
  "note-del"(a, id) { const prev = structuredClone(getDoc("notes")); mut("notes", n => { n.items = n.items.filter(x => x.id !== id); }); toast("Nota eliminata", () => mut("notes", n => { n.items = prev.items; })); },
};
const FORMS = {
  "prio-add"() { const v = $("#prio-in").value.trim(); if (!v) return; mut("priorities", p => { if (p.date !== ymd(today())) { p.date = ymd(today()); p.items = []; } if (p.items.length < 3) p.items.push({ text: v, done: false }); }); setTimeout(() => $("#prio-in")?.focus(), 30); },
  "shop-add"() { const v = $("#shop-name").value.trim(); if (!v) return; const rep = $("#shop-rep").value; ui.lastRep = rep; saveUi(); addShopping([{ name: v, reparto: rep }]); setTimeout(() => { const el = $("#shop-name"); if (el) { el.focus(); $("#shop-rep").value = rep; } }, 30); },
  "pantry-add"() { const v = $("#pantry-in").value.trim(); if (!v) return; const rep = $("#pantry-rep")?.value || guessRep(v); ui.lastRep = rep; saveUi(); mut("pantry", p => { p.items = p.items || []; p.items.push({ id: newId(), name: v, reparto: rep, added: ymd(today()) }); }); setTimeout(() => $("#pantry-in")?.focus(), 30); },
  "prod-add"() { const v = $("#prod-in").value.trim(); if (!v) return; mut("house", h => { h.products.push({ id: newId(), name: v, status: "ok" }); }); },
  "note-add"() { const v = $("#note-in").value.trim(); if (!v) return; mut("notes", n => { n.items = n.items || []; n.items.push({ id: newId(), text: v, at: new Date().toISOString() }); }); toast("Nota salvata"); },
};
function addShopping(list) {
  mut("shopping", s => {
    s.items = s.items || [];
    for (const it of list) {
      const ex = s.items.find(x => !x.checked && x.name.toLowerCase() === String(it.name).toLowerCase());
      if (ex) continue;
      s.items.push({ id: newId(), name: String(it.name).slice(0, 80), qty: it.qty ? String(it.qty).slice(0, 40) : "", reparto: REPARTI.includes(it.reparto) ? it.reparto : "Altro", cost: isFinite(+it.cost) && +it.cost > 0 ? +(+it.cost).toFixed(2) : null, checked: false, src: it.src || "manuale" });
    }
  });
}
function productsToCart(ps) {
  if (!ps.length) return;
  addShopping(ps.map(p => ({ name: p.name, reparto: "Casa e pulizia", src: "casa" })));
  const ids = ps.map(p => p.id);
  mut("house", h => { h.products.forEach(p => { if (ids.includes(p.id)) p.inList = true; }); });
  toast(ps.length === 1 ? `"${ps[0].name}" aggiunto alla spesa` : `${ps.length} prodotti aggiunti alla spesa`);
}

/* ===================== sheets ===================== */
function editMeal(dw, slot) {
  const m = getDoc("meals"); const cur = (m.plan || {})[dw]?.[slot] || {};
  const rs = m.recipes || [];
  openSheet(`${DOW[dw]} · ${slot}`, `<form class="form" id="f-meal">
      <div class="field"><label for="meal-t">Cosa mangi</label><textarea class="in" id="meal-t" maxlength="200" placeholder="Es. Pollo al forno con patate">${esc(cur.t || "")}</textarea></div>
      <div class="field"><label for="meal-i">Ingredienti principali (separati da virgola)</label><input class="in" id="meal-i" maxlength="300" value="${esc((cur.ing || []).join(", "))}" placeholder="Es. pollo, patate, insalata"></div>
      <div class="field"><label for="meal-r">Ricetta collegata</label><select class="in" id="meal-r"><option value="">Nessuna</option>${rs.map(r => `<option value="${r.id}" ${cur.r === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select></div>
      <div class="row"><button class="btn primary">Salva</button>${cur.t ? `<button type="button" class="btn danger" id="meal-clear">Svuota</button>` : ""}${cur.r ? `<button type="button" class="btn ghost" id="meal-open">Apri ricetta</button>` : ""}</div></form>`, body => {
    $("#f-meal", body).onsubmit = ev => { ev.preventDefault(); const t = $("#meal-t").value.trim(); const r = $("#meal-r").value || null; const ing = $("#meal-i").value.split(",").map(x => x.trim()).filter(Boolean).slice(0, 15);
      mut("meals", d => { d.plan = d.plan || {}; d.plan[dw] = d.plan[dw] || {}; d.plan[dw][slot] = t ? { t, r, ing } : {}; }); closeSheet(); logAct(SLOT_EMO[slot] || "🍽️", `Pasto modificato: ${DOW[dw]} ${slot}`, { Pasto: t || "vuoto", Ingredienti: ing.join(", ") || "—" }); toast("Pasto aggiornato"); };
    const c = $("#meal-clear", body); if (c) c.onclick = () => { const prev = structuredClone(getDoc("meals").plan?.[dw]?.[slot] || {}); mut("meals", d => { d.plan[dw][slot] = {}; }); closeSheet(); toast("Pasto svuotato", () => mut("meals", d => { d.plan[dw][slot] = prev; })); };
    const o = $("#meal-open", body); if (o) o.onclick = () => openRecipe(cur.r);
  });
}
function openDay(dw) {
  const m = getDoc("meals"); const p = (m.plan || {})[dw] || {}; const slots = dw >= 6 ? ["colazione", "pranzo", "cena"] : ["colazione", "cena"];
  openSheet(DOW[dw], `<div>${slots.map(s => { const r = p[s]?.r ? (m.recipes || []).find(x => x.id === p[s].r) : null;
    return `<div class="meal"><div class="slot">${s}</div><div class="txt"><div class="tap" data-act="meal-edit" data-dow="${dw}" data-slot="${s}">${p[s]?.t ? esc(p[s].t) : '<span class="muted">aggiungi</span>'} ${icon("edit", "sm")}</div>${r ? `<button class="btn ghost" data-act="rec-open" data-id="${r.id}" style="padding:0;min-height:36px">${icon("note", "sm")}Ricetta</button>` : ""}</div></div>`; }).join("")}
    ${dw <= 5 ? `<div class="sub">Pranzo in mensa.</div>` : ""}</div>`);
}
function openRecipe(id) {
  const r = getDoc("meals").recipes?.find(x => x.id === id); if (!r) return;
  openSheet(r.name, `<div class="form">
      <div class="row">${r.minutes ? `<span class="pill">${icon("clock", "sm")} ${r.minutes} min</span>` : ""}${r.fav ? '<span class="pill warn">Preferita</span>' : ""}</div>
      <div><div class="label">Ingredienti</div><ul>${(r.ingredients || []).map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>
      <div><div class="label">Passaggi</div><ol>${(r.steps || []).map(s => `<li style="margin-bottom:6px">${esc(s)}</li>`).join("")}</ol></div>
      <div class="row"><button class="btn soft" id="rec-cart">${icon("cart", "sm")}Ingredienti in lista</button><button class="btn" id="rec-fav">${r.fav ? "Togli dai preferiti" : "Salva tra i preferiti"}</button><button class="btn danger" id="rec-del">${icon("trash", "sm")}Elimina</button></div></div>`, body => {
    $("#rec-cart", body).onclick = () => { addShopping((r.ingredients || []).map(i => ({ name: i, reparto: "Altro", src: "ricetta" }))); closeSheet(); toast("Ingredienti aggiunti alla spesa (controlla il reparto)"); };
    $("#rec-fav", body).onclick = () => { mut("meals", m => { const x = m.recipes.find(y => y.id === id); x.fav = !x.fav; }); closeSheet(); };
    $("#rec-del", body).onclick = () => { const prev = structuredClone(getDoc("meals")); mut("meals", m => { m.recipes = m.recipes.filter(x => x.id !== id); }); closeSheet(); toast("Ricetta eliminata", () => mut("meals", m => { m.recipes = prev.recipes; })); };
  });
}
function editTask(id) {
  const h = getDoc("house"); const t = id ? h.tasks.find(x => x.id === id) : { freq: "weekly", dow: dowOf(today()), minutes: 10, every: 30, title: "" };
  if (!t) return;
  openSheet(id ? "Modifica faccenda" : "Nuova faccenda", `<form class="form" id="f-task">
      <div class="field"><label for="tk-t">Attività</label><input class="in" id="tk-t" value="${esc(t.title)}" maxlength="80" required></div>
      <div class="field"><label>Ricorrenza</label><div class="chips" id="tk-f">${[["daily", "Ogni giorno"], ["weekly", "Settimanale"], ["interval", "Ogni N giorni"], ["once", "Una volta"]].map(([v, n]) => `<button type="button" class="chip" data-v="${v}" aria-pressed="${t.freq === v}">${n}</button>`).join("")}</div></div>
      <div class="field" id="tk-dow-w"><label for="tk-dow">Giorno</label><select class="in" id="tk-dow">${[1, 2, 3, 4, 5, 6, 7].map(d => `<option value="${d}" ${t.dow === d ? "selected" : ""}>${DOW[d]}</option>`).join("")}</select></div>
      <div class="two" id="tk-int-w"><div class="field" id="tk-every-w"><label for="tk-every">Ogni quanti giorni</label><input class="in num" id="tk-every" type="number" min="1" max="365" value="${t.every || 30}"></div>
        <div class="field"><label for="tk-next">Prossima volta</label><input class="in" id="tk-next" type="date" value="${t.next || ymd(today())}"></div></div>
      <div class="field"><label for="tk-min">Minuti stimati</label><input class="in num" id="tk-min" type="number" min="1" max="240" value="${t.minutes || 10}"></div>
      <div class="row"><button class="btn primary">Salva</button>${id ? `<button type="button" class="btn danger" id="tk-del">${icon("trash", "sm")}Elimina</button>` : ""}</div></form>`, body => {
    let freq = t.freq;
    const sync = () => { $("#tk-dow-w").hidden = freq !== "weekly"; $("#tk-int-w").hidden = freq !== "interval" && freq !== "once"; $("#tk-every-w").hidden = freq !== "interval"; body.querySelectorAll("#tk-f .chip").forEach(c => c.setAttribute("aria-pressed", c.dataset.v === freq)); };
    body.querySelectorAll("#tk-f .chip").forEach(c => c.onclick = () => { freq = c.dataset.v; sync(); }); sync();
    $("#f-task", body).onsubmit = ev => { ev.preventDefault(); const title = $("#tk-t").value.trim(); if (!title) return;
      const data = { title, freq, minutes: +$("#tk-min").value || null };
      if (freq === "weekly") data.dow = +$("#tk-dow").value;
      if (freq === "interval") { data.every = Math.max(1, +$("#tk-every").value || 30); data.next = $("#tk-next").value || ymd(today()); }
      if (freq === "once") data.next = $("#tk-next").value || ymd(today());
      mut("house", hh => { if (id) { const x = hh.tasks.find(y => y.id === id); Object.assign(x, data); if (freq !== "weekly") delete x.dow; if (freq !== "interval") delete x.every; if (freq !== "interval" && freq !== "once") delete x.next; } else hh.tasks.push({ id: newId(), ...data }); });
      closeSheet(); logAct(emo("chore", title, "🧹"), (id ? "Faccenda modificata: " : "Nuova faccenda: ") + title, { Ricorrenza: { daily: "ogni giorno", weekly: "ogni " + DOW[data.dow || 1].toLowerCase(), interval: `ogni ${data.every} giorni`, once: "una volta" }[freq], Minuti: data.minutes || "—" }); toast(id ? "Faccenda aggiornata" : "Faccenda aggiunta"); };
    const d = $("#tk-del", body); if (d) d.onclick = () => { const prev = structuredClone(getDoc("house")); mut("house", hh => { hh.tasks = hh.tasks.filter(x => x.id !== id); }); closeSheet(); toast("Faccenda eliminata", () => mut("house", hh => { hh.tasks = prev.tasks; })); };
  });
}
function openDeadline(id) {
  const dl = getDoc("money").deadlines.find(x => x.id === id); if (!dl) return;
  const occ = deadlineOccurrence(dl); const st = statusOf(occ);
  const recurring = dl.kind === "monthly" ? "Ogni mese, il " + dl.day : dl.kind === "yearly" ? "Ogni anno" : dl.kind === "biennial" ? "Ogni 2 anni" : dl.kind === "every" ? `Ogni ${dl.everyDays || 14} giorni` : dl.kind === "months" ? `Ogni ${dl.everyMonths || 2} mesi` : "Una volta";
  openSheet(dl.title, `<div class="form">
      <div class="row"><span class="pill ${st.cls}">${st.label}</span><span class="sub">${recurring}</span></div>
      <div class="kv"><div><div class="k">Data</div><div class="v">${occ ? fmtDateY(occ.date) : "—"}</div></div><div><div class="k">Importo</div><div class="v num">${dl.amount != null ? eur(dl.amount) : "da definire"}</div></div></div>
      ${dl.payee ? `<div><div class="label">Destinatario / modalità</div><div>${esc(dl.payee)}</div></div>` : ""}
      ${dl.amountNote ? `<div class="notice info">${icon("info", "sm")}<div>${esc(dl.amountNote)}</div></div>` : ""}
      ${occ?.prevPaid ? `<div class="sub">Il mese in corso risulta già pagato.</div>` : ""}
      <form class="form" id="f-dl"><div class="two"><div class="field"><label for="dl-amt">Importo €</label><input class="in num" id="dl-amt" type="number" step="0.01" min="0" value="${dl.amount ?? ""}" placeholder="da definire"></div>
        ${dl.kind !== "monthly" ? `<div class="field"><label for="dl-date">Prossima scadenza</label><input class="in" id="dl-date" type="date" value="${dl.date || ""}"></div>` : ""}</div>
        <div class="row"><button class="btn">Salva modifiche</button></div></form>
      <hr class="sep">
      <div class="row">${occ && !occ.paid ? `<button class="btn primary" id="dl-pay">${icon("check", "sm")}${dl.task ? "Segna fatto" : "Segna pagato"}</button>` : ""}${occ?.prevPaid ? `<button class="btn" id="dl-unpay">Annulla "pagato" del mese</button>` : ""}</div></div>`, body => {
    $("#f-dl", body).onsubmit = ev => { ev.preventDefault(); const v = $("#dl-amt").value; const dd = $("#dl-date", body)?.value;
      mut("money", m => { const x = m.deadlines.find(y => y.id === id); x.amount = v === "" ? null : +(+v).toFixed(2); if (dd) x.date = dd; }); closeSheet(); logAct("✏️", "Scadenza modificata: " + dl.title, { Importo: v === "" ? "da definire" : eur(+v), "Prossima data": dd ? fmtDateY(parseD(dd)) : "invariata" }); toast("Scadenza aggiornata"); };
    const p = $("#dl-pay", body); if (p) p.onclick = () => { const prev = structuredClone(dl); markPaid(dl, occ); closeSheet(); toast(`${dl.title}: ${dl.task ? "fatto" : "pagato"} ✓`, () => mut("money", m => { const i = m.deadlines.findIndex(y => y.id === id); m.deadlines[i] = prev; })); };
    const u = $("#dl-unpay", body); if (u) u.onclick = () => { mut("money", m => { const x = m.deadlines.find(y => y.id === id); delete x.paid[occ.paidKey]; }); closeSheet(); };
  });
}
function markPaid(dl, occ) {
  logAct(emo("deadline", dl.title, "📌"), (dl.task ? "Fatto: " : "Pagato: ") + dl.title, { Scadenza: occ?.date ? fmtDateY(occ.date) : "—", Importo: dl.amount != null ? eur(dl.amount) : "—", Destinatario: dl.payee || "—" });
  mut("money", m => {
    const x = m.deadlines.find(y => y.id === dl.id);
    if (x.kind === "monthly") { x.paid = x.paid || {}; x.paid[occ.key] = ymd(today()); }
    else {
      x.history = x.history || []; x.history.push({ due: x.date, paidOn: ymd(today()), amount: x.amount });
      if (x.kind === "yearly") x.date = ymd(addMonths(parseD(x.date), 12));
      else if (x.kind === "biennial") x.date = ymd(addMonths(parseD(x.date), 24));
      else if (x.kind === "every") x.date = ymd(addDays(parseD(x.date), x.everyDays || 14));
      else if (x.kind === "months") x.date = ymd(addMonths(parseD(x.date), x.everyMonths || 2));
      else x.date = null;
    }
  });
}
function editGoal(id) {
  const g = getDoc("money").goals.find(x => x.id === id); if (!g) return;
  openSheet(g.name, `<form class="form" id="f-goal">
      <div class="two"><div class="field"><label for="g-cur">Saldo attuale €</label><input class="in num" id="g-cur" type="number" step="0.01" value="${g.current ?? 0}"></div>
      <div class="field"><label for="g-tar">Traguardo €</label><input class="in num" id="g-tar" type="number" step="0.01" min="0" value="${g.target ?? ""}" placeholder="da definire"></div></div>
      ${g.note ? `<div class="sub">${esc(g.note)}</div>` : ""}
      <div class="row"><button class="btn primary">Salva</button></div></form>`, body => {
    $("#f-goal", body).onsubmit = ev => { ev.preventDefault(); const c = +$("#g-cur").value || 0; const tv = $("#g-tar").value;
      mut("money", m => { const x = m.goals.find(y => y.id === id); x.current = +c.toFixed(2); x.target = tv === "" ? null : +(+tv).toFixed(2); x.updated = ymd(today()); }); closeSheet(); logAct(emo("goal", g.name, "🎯"), "Obiettivo aggiornato: " + g.name, { Saldo: eur(c), Traguardo: tv === "" ? "—" : eur(+tv) }); toast("Obiettivo aggiornato"); };
  });
}

/* ===================== quick add ===================== */
function openQuickAdd(kind) {
  const kinds = [["smart", "Idea / da fare", "💡"], ["spesa-sostenuta", "Spesa fatta", "💶"], ["spesa-lista", "Da comprare", "🛒"], ["evento", "Evento", "📅"]];
  const fillFrom = (dest, text, body) => {
    const set = (sel, v) => { const el = $(sel, body); if (el && v != null) el.value = v; };
    if (dest === "spesa-sostenuta") { const m = text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro)?/i); if (m) set("#qa-amt", m[1].replace(",", ".")); set("#qa-note", text.replace(m ? m[0] : "", "").replace(/\s+/g, " ").trim().slice(0, 80)); }
    else set("#qa-name", text.slice(0, dest === "nota" ? 2000 : 120));
    if (dest === "spesa-lista") set("#qa-rep", guessRep(text));
  };
  let k = kind || "smart"; let pre = "";
  const forms = {
    "smart": () => `<div class="field"><label for="qa-name" class="sr">Cosa ti è venuto in mente?</label><textarea class="in" id="qa-name" maxlength="600" placeholder="Scrivi qui: «comprare olio», «pulire il forno», «chiamare il meccanico giovedì»…">${esc(pre)}</textarea></div>
      <div class="label" style="margin-top:4px">Dove la metto?</div>
      <div class="dest">${[["spesa-lista", "🛒", "Spesa", "var(--c-pasti)"], ["faccenda", "🧹", "Faccenda", "var(--c-casa)"], ["spesa-sostenuta", "💶", "Spesa fatta", "var(--c-soldi)"], ["nota", "📝", "Nota", "var(--c-altro)"], ["evento", "📅", "Evento", "var(--c-oggi)"]].map(([v, e, n, c]) => `<button type="button" data-dest="${v}" style="--dc:${c}"><span class="e">${e}</span>${n}</button>`).join("")}</div>`,
    "spesa-lista": () => `<div class="field"><label for="qa-name">Prodotto</label><input class="in" id="qa-name" maxlength="80" placeholder="Es. Yogurt greco 500 g" required></div>
      <div class="field"><label for="qa-rep">Reparto</label><select class="in" id="qa-rep">${REPARTI.map(r => `<option>${r}</option>`).join("")}</select></div>`,
    "faccenda": () => `<div class="field"><label for="qa-name">Attività</label><input class="in" id="qa-name" maxlength="120" placeholder="Es. Pulire il filtro della lavatrice" required></div>
      <div class="two"><div class="field"><label for="qa-date">Quando</label><input class="in" id="qa-date" type="date" value="${ymd(today())}"></div><div class="field"><label for="qa-every">Ripeti ogni (giorni)</label><input class="in num" id="qa-every" type="number" min="1" placeholder="una volta"></div></div>`,
    "spesa-sostenuta": () => `<div class="two"><div class="field"><label for="qa-amt">Importo €</label><input class="in num" id="qa-amt" type="number" inputmode="decimal" step="0.01" min="0.01" required placeholder="0,00"></div>
      <div class="field"><label for="qa-date">Data</label><input class="in" id="qa-date" type="date" value="${ymd(today())}"></div></div>
      <div class="field"><label>Categoria</label><div class="chips" id="qa-cat">${CATS.map((c, i) => `<button type="button" class="chip" data-v="${c.id}" aria-pressed="${i === 0}">${CAT_EMO[c.id] || ""} ${c.name}</button>`).join("")}</div></div>
      <div class="field"><label for="qa-note">Nota (facoltativa)</label><input class="in" id="qa-note" maxlength="80" placeholder="Es. Pieno Punto"></div>`,
    "nota": () => `<div class="field"><label for="qa-name">Nota</label><textarea class="in" id="qa-name" maxlength="2000" placeholder="Idea, cosa da ricordare…" required></textarea></div>`,
    "evento": () => `<div class="field"><label for="qa-pre">Tipo</label><select class="in" id="qa-pre">${PREFIXES.map(p => `<option ${p === "PERSONALE" ? "selected" : ""}>${p}</option>`).join("")}</select></div>
      <div class="field"><label for="qa-name">Titolo</label><input class="in" id="qa-name" maxlength="100" placeholder="Es. Cambio gomme Punto" required></div>
      <div class="field"><label for="qa-date">Data</label><input class="in" id="qa-date" type="date" value="${ymd(today())}" required></div>
      <div class="two"><div class="field"><label for="qa-s">Inizio</label><input class="in" id="qa-s" type="time" value="18:00" required></div><div class="field"><label for="qa-e">Fine</label><input class="in" id="qa-e" type="time" value="19:00" required></div></div>
      `,
  };
  const draw = () => {
    openSheet("Aggiungi", `<div class="pick" id="qa-kinds">${kinds.map(([v, n, e]) => `<button type="button" data-v="${v}" aria-pressed="${v === k}"><span class="e">${e}</span>${n}</button>`).join("")}</div>
      <form class="form" id="f-qa">${forms[k]()}${k === "smart" ? "" : `<button class="btn primary block">${k === "evento" ? "Continua →" : "＋ Aggiungi"}</button>`}</form>`, body => {
      body.querySelectorAll("#qa-kinds button").forEach(c => c.onclick = () => { k = c.dataset.v; draw(); });
      let cat = "carburante";
      body.querySelectorAll("#qa-cat .chip").forEach(c => c.onclick = () => { cat = c.dataset.v; body.querySelectorAll("#qa-cat .chip").forEach(x => x.setAttribute("aria-pressed", x === c)); });
      body.querySelectorAll("[data-dest]").forEach(b => b.onclick = () => { const t = ($("#qa-name", body)?.value || "").trim(); k = b.dataset.dest; pre = t; draw(); fillFrom(k, t, $("#sheet-body")); });
      if (k !== "smart" && pre) fillFrom(k, pre, body);
      const f = $("#qa-name", body) || $("#qa-amt", body); if (f) setTimeout(() => f.focus(), 60);
      $("#f-qa", body).onsubmit = ev => {
        ev.preventDefault();
        if (k === "smart") { const v = $("#qa-name").value.trim(); if (v) toast("Scegli dove metterla 👆"); }
        else if (k === "spesa-lista") { const nm = $("#qa-name").value.trim(); addShopping([{ name: nm, reparto: $("#qa-rep").value }]); logAct("🛒", "Da comprare: " + nm, { Reparto: $("#qa-rep").value }); closeSheet(); toast("Aggiunto alla lista della spesa"); }
        else if (k === "faccenda") { const t = $("#qa-name").value.trim(); if (!t) return; const ev = +$("#qa-every").value || 0; const nx = $("#qa-date").value || ymd(today());
          mut("house", h => { h.tasks.push(ev > 0 ? { id: newId(), title: t, freq: "interval", every: ev, next: nx, minutes: 15 } : { id: newId(), title: t, freq: "once", next: nx, minutes: 15 }); });
          logAct(emo("chore", t, "🧹"), "Nuova faccenda: " + t, { Quando: fmtDateY(parseD(nx)), Ricorrenza: ev > 0 ? `ogni ${ev} giorni` : "una volta" }); closeSheet(); toast("🧹 Faccenda aggiunta"); }
        else if (k === "spesa-sostenuta") {
          const amt = +(+$("#qa-amt").value).toFixed(2); if (!(amt > 0)) return; const date = $("#qa-date").value || ymd(today()); const mk = date.slice(0, 7); const note = $("#qa-note").value.trim();
          const eid = newId(); mut("exp-" + mk, d => { d.items = d.items || []; d.items.push({ id: eid, date, amount: amt, cat, note }); });
          logAct(CAT_EMO[cat] || "💶", `Spesa registrata: ${eur(amt)}`, { Categoria: catName(cat), Data: fmtDateY(parseD(date)), Nota: note || "—" });
          closeSheet(); toast(`${eur(amt)} registrati in ${catName(cat)}`, () => mut("exp-" + mk, d => { d.items = d.items.filter(x => x.id !== eid); }));
        }
        else if (k === "nota") { const v = $("#qa-name").value.trim(); if (!v) return; mut("notes", n => { n.items = n.items || []; n.items.push({ id: newId(), text: v, at: new Date().toISOString() }); }); logAct("📝", "Nota salvata", { Testo: v }); closeSheet(); toast("📝 Nota salvata"); }
        else if (k === "evento") confirmEvent({ prefix: $("#qa-pre").value, title: $("#qa-name").value.trim(), date: $("#qa-date").value, s: $("#qa-s").value, e: $("#qa-e").value });
      };
    });
  };
  draw();
}

/* ===================== promemoria (Calendario in arrivo nella v2) ===================== */
function saveReminder(ev) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date || "") || !/^\d{2}:\d{2}$/.test(ev.s || "") || !/^\d{2}:\d{2}$/.test(ev.e || "") || ev.e <= ev.s) return { ok: false, msg: "Data o orario non validi: promemoria non salvato." };
  if (!ev.title) return { ok: false, msg: "Titolo mancante: promemoria non salvato." };
  const prefix = PREFIXES.includes(ev.prefix) ? ev.prefix : "PERSONALE";
  const summary = `[${prefix}] ${ev.title}`;
  mut("reminders", r => { r.items = r.items || []; r.items.push({ id: newId(), title: summary, date: ev.date, s: ev.s, e: ev.e, prefix }); });
  logAct("📅", "Promemoria salvato: " + summary, { Data: fmtDateY(parseD(ev.date)), Orario: `${ev.s}–${ev.e}` });
  return { ok: true, msg: "📅 Promemoria salvato (locale)." };
}
function confirmEvent(ev) {
  if (!ev.title || !ev.date || !ev.s || !ev.e) return;
  if (ev.e <= ev.s) { toast("L'ora di fine deve essere dopo l'inizio."); return; }
  const summary = `[${ev.prefix}] ${ev.title}`;
  const d = parseD(ev.date);
  openSheet("Conferma promemoria", `<div class="form">
      <div class="sub">Sto per salvare questo promemoria (il calendario di Google arriva nella v2):</div>
      <div class="card" style="box-shadow:none;background:var(--surface-2)"><div class="t" style="font-weight:700">${esc(summary)}</div>
      <div class="sub">${DOW[dowOf(d)]} ${fmtDateY(d)} · ${ev.s}–${ev.e}</div></div>
      <div id="ev-msg"></div>
      <div class="row"><button class="btn primary" id="ev-ok">${icon("check", "sm")}Salva promemoria</button><button class="btn" id="ev-back">Indietro</button></div></div>`, body => {
    $("#ev-back", body).onclick = () => openQuickAdd("evento");
    $("#ev-ok", body).onclick = () => {
      const res = saveReminder(ev);
      if (res.ok) { closeSheet(); toast(res.msg); return; }
      $("#ev-msg", body).innerHTML = `<div class="notice err">${icon("alert", "sm")}<div>${esc(res.msg)}</div></div>`;
    };
  });
}

const SUBPAGES = {
  note: { e: "📝", t: "Note" }, storia: { e: "🕘", t: "Cronologia" }, impostazioni: { e: "⚙️", t: "Impostazioni" },
};
function nextDateForDow(dw, from = today()) { const back = (dw - dowOf(from) + 7) % 7; return addDays(from, back); }
function sheetMsg(sel, ok, text) { const el = $(sel); if (el) el.innerHTML = `<div class="notice ${ok ? "info" : "err"}">${icon(ok ? "check" : "alert", "sm")}<div>${esc(text)}</div></div>`; }

function viewAltro() {
  const v = { note: altroNote, impostazioni: viewImpostazioni, storia: viewStoria }[ui.altro];
  if (v) return v();
  const tiles = [["storia", "🕘", "Cronologia"], ["note", "📝", "Note"], ["impostazioni", "⚙️", "Impostazioni"]];
  return `<div class="tiles">${tiles.map(([id, e, n]) => `<button class="tile" data-act="altro" data-id="${id}">${E(e)}<div class="tt">${n}</div></button>`).join("")}</div>`;
}

/* ---------- 🚗 Auto e moto ---------- */
function viewVeicoli() {
  const v = getDoc("vehicles"); const money = getDoc("money");
  const cards = (v.list || []).map(veh => {
    const dls = (veh.dls || []).map(id => (money.deadlines || []).find(d => d.id === id)).filter(Boolean);
    const maint = (veh.maint || []).map(m => { const n = m.next ? daysBetween(parseD(m.next), today()) : null; const cls = n == null ? "warn" : n < 0 ? "bad" : n <= 30 ? "warn" : "";
      return `<div class="item tap" data-act="maint-edit" data-id="${veh.id}:${m.id}"><span class="em e">🔧</span><div class="body"><div class="t">${esc(m.title)}</div><div class="s">${m.next ? fmtDateY(parseD(m.next)) : "data da definire"}${m.km ? " · a " + Number(m.km).toLocaleString("it-IT") + " km" : ""}</div></div><span class="pill ${cls}">${n == null ? "data?" : n < 0 ? "scaduto" : n === 0 ? "oggi" : n <= 60 ? `tra ${n} gg` : fmtDate(parseD(m.next))}</span></div>`; }).join("");
    const hist = (v.history || []).filter(h => h.vid === veh.id).sort((a, b) => b.date.localeCompare(a.date));
    const tot = hist.reduce((s, h) => s + (+h.cost || 0), 0);
    return `<section class="card"><div class="card-h"><h2><span class="badge">${E(veh.emoji)}</span>${esc(veh.name)}</h2><button class="pill acc num" style="border:0;min-height:36px" data-act="km-edit" data-id="${veh.id}">📍 ${veh.km ? Number(veh.km).toLocaleString("it-IT") + " km" : "km?"}</button></div>
      <div class="list">${dls.map(d => dlRow(d)).join("")}${maint}</div>
      <div class="row" style="margin-top:10px"><button class="btn soft" data-act="maint-new" data-id="${veh.id}" style="flex:1">🔧 Promemoria</button><button class="btn soft" data-act="int-new" data-id="${veh.id}" style="flex:1">🧾 Intervento</button></div>
      ${hist.length ? `<div style="margin-top:6px">${fold("hist-" + veh.id, `🧾 Storico · ${eur(tot)}`, `<div class="list">${hist.map(h => `<div class="item"><div class="body"><div class="t">${esc(h.title)}</div><div class="s">${fmtDateY(parseD(h.date))}${h.km ? " · " + Number(h.km).toLocaleString("it-IT") + " km" : ""}</div></div><span class="num">${eur(h.cost)}</span><button class="iconbtn" aria-label="Elimina" data-act="int-del" data-id="${h.id}">${icon("x", "sm")}</button></div>`).join("")}</div>`)}</div>` : ""}</section>`;
  }).join("");
  return `<div class="grid2">${cards || emptyBox("🚗", "Nessun veicolo")}</div>`;
}
function editKm(vid) {
  const veh = (getDoc("vehicles").list || []).find(x => x.id === vid); if (!veh) return;
  openSheet(`📍 Chilometri ${veh.name}`, `<form class="form" id="f-km"><input class="in num" id="km-v" type="number" min="0" step="1" value="${veh.km || ""}" aria-label="Chilometri"><button class="btn primary block">💾 Salva</button></form>`, body => {
    $("#f-km", body).onsubmit = e => { e.preventDefault(); const k = Math.round(+$("#km-v").value || 0); mut("vehicles", v => { const x = v.list.find(y => y.id === vid); x.km = k; x.kmDate = ymd(today()); }); closeSheet(); logAct("📍", `Chilometri ${veh.name}`, { Chilometri: k.toLocaleString("it-IT") + " km" }); toast("📍 Chilometri aggiornati"); };
  });
}
function editMaint(vid, mid) {
  const veh = (getDoc("vehicles").list || []).find(x => x.id === vid); if (!veh) return;
  const m = mid ? (veh.maint || []).find(x => x.id === mid) : { title: "", next: "", km: "" };
  openSheet(mid ? "🔧 Promemoria" : "🔧 Nuovo promemoria", `<form class="form" id="f-mt"><div class="field"><label for="mt-t">Cosa</label><input class="in" id="mt-t" value="${esc(m.title)}" maxlength="60" placeholder="Es. Tagliando, gomme invernali" required></div>
    <div class="two"><div class="field"><label for="mt-d">Entro il</label><input class="in" id="mt-d" type="date" value="${m.next || ""}"></div><div class="field"><label for="mt-k">o ai km</label><input class="in num" id="mt-k" type="number" min="0" value="${m.km || ""}"></div></div>
    <div class="row"><button class="btn primary" style="flex:1">💾 Salva</button>${mid ? `<button type="button" class="btn danger" id="mt-del">🗑️</button>` : ""}</div></form>`, body => {
    $("#f-mt", body).onsubmit = e => { e.preventDefault(); const data = { title: $("#mt-t").value.trim(), next: $("#mt-d").value || null, km: +$("#mt-k").value || null }; if (!data.title) return;
      mut("vehicles", v => { const x = v.list.find(y => y.id === vid); x.maint = x.maint || []; if (mid) Object.assign(x.maint.find(y => y.id === mid), data); else x.maint.push({ id: newId(), ...data }); }); closeSheet(); logAct("🔧", `Promemoria ${veh.name}: ${data.title}`, { Entro: data.next ? fmtDateY(parseD(data.next)) : "—", Km: data.km || "—" }); toast("🔧 Salvato"); };
    const d = $("#mt-del", body); if (d) d.onclick = () => { const prev = structuredClone(getDoc("vehicles")); mut("vehicles", v => { const x = v.list.find(y => y.id === vid); x.maint = x.maint.filter(y => y.id !== mid); }); closeSheet(); toast("Promemoria eliminato", () => mut("vehicles", v => { Object.assign(v, prev); })); };
  });
}
function newIntervento(vid) {
  const veh = (getDoc("vehicles").list || []).find(x => x.id === vid); if (!veh) return;
  openSheet(`🧾 Intervento ${veh.name}`, `<form class="form" id="f-int"><div class="field"><label for="in-t">Cosa hai fatto</label><input class="in" id="in-t" maxlength="80" placeholder="Es. Tagliando, cambio gomme" required></div>
    <div class="two"><div class="field"><label for="in-c">Costo €</label><input class="in num" id="in-c" type="number" step="0.01" min="0" inputmode="decimal"></div><div class="field"><label for="in-d">Data</label><input class="in" id="in-d" type="date" value="${ymd(today())}"></div></div>
    <div class="field"><label for="in-k">Km (facoltativo)</label><input class="in num" id="in-k" type="number" min="0" value="${veh.km || ""}"></div>
    <label class="row" style="min-height:40px"><input type="checkbox" id="in-e" checked style="width:22px;height:22px"> Registra anche nelle spese del mese</label>
    <button class="btn primary block">💾 Salva</button></form>`, body => {
    $("#f-int", body).onsubmit = e => { e.preventDefault(); const title = $("#in-t").value.trim(); if (!title) return; const cost = +(+$("#in-c").value || 0).toFixed(2); const date = $("#in-d").value || ymd(today()); const km = +$("#in-k").value || null;
      const id = newId(); mut("vehicles", v => { v.history = v.history || []; v.history.push({ id, vid, title, cost, date, km }); if (km) { const x = v.list.find(y => y.id === vid); if (!x.km || km > x.km) { x.km = km; x.kmDate = date; } } });
      if ($("#in-e").checked && cost > 0) mut("exp-" + date.slice(0, 7), d => { d.items = d.items || []; d.items.push({ id: "v" + id, date, amount: cost, cat: "veicoli", note: `${veh.name}: ${title}` }); });
      logAct("🧾", `Intervento ${veh.name}: ${title}`, { Costo: eur(cost), Data: fmtDateY(parseD(date)), Km: km || "—" }); closeSheet(); toast("🧾 Intervento salvato"); };
  });
}

/* ---------- ⚙️ Impostazioni ---------- */
function viewImpostazioni() {
  const pr = getDoc("profile"); const b = getDoc("money").budget || {};
  const rows = [
    ["👤", "Profilo", `${pr.name || "—"} · ${pr.pesoKg ? pr.pesoKg + " kg" : ""}`, "set-profilo"],
    ["🍽️", "Alimentazione", (pr.piacciono || []).slice(0, 3).join(", ") || "—", "set-cibo"],
    ["💶", "Budget", `entrate ${eur(b.income)}`, "set-budget"],
  ];
  return `${card("I tuoi dati", "👤", `<div class="list">${rows.map(([e, t, s, a]) => `<div class="item tap" data-act="${a}"><span class="em e">${e}</span><div class="body"><div class="t">${t}</div><div class="s">${esc(s)}</div></div>${icon("chev-r", "sm")}</div>`).join("")}</div>`)}
    ${card("Assistente AI", "✨", `<div class="item" style="border:0"><span class="em e">💤</span><div class="body"><div class="t">Assistente AI</div><div class="s">In arrivo nella Fase 4: per ora l'app non usa l'AI.</div></div></div>`)}
    ${card("Backup", "💾", `<div class="row"><button class="btn soft" data-act="bk-export" style="flex:1">📤 Esporta</button><label class="btn soft" style="flex:1;cursor:pointer">📥 Importa<input type="file" id="bk-file" accept="application/json,.json" class="sr"></label></div><div class="sub" style="margin-top:8px">Un file JSON con tutti i dati dell'app.</div>`)}
    ${card("Calendario", "📅", `<div class="notice info">${icon("info", "sm")}<div>Google Calendar è in arrivo nella v2. Gli eventi creati dal "+" vengono salvati come promemoria locali (vedi "Oggi").</div></div>`)}`;
}
function settingsSheet(kind) {
  const pr = getDoc("profile");
  if (kind === "profilo") {
    const f = [["name", "Nome"], ["pesoKg", "Peso (kg)", "number"], ["altezzaCm", "Altezza (cm)"], ["obiettivo", "Obiettivo fisico", "area"], ["lavoro", "Orari di lavoro"], ["sonno", "Sonno"]];
    return formSheet("👤 Profilo", f, pr, d => mut("profile", p => { Object.assign(p, d); if (d.pesoKg) p.pesoKg = +d.pesoKg; }));
  }
  if (kind === "cibo") {
    const f = [["piacciono", "Cibi che ti piacciono (separati da virgola)", "list"], ["nonMangia", "Cibi che non mangi", "list"], ["note", "Note", "area"], ["cucinaFerialiMin", "Minuti max per cucinare nei feriali", "number"], ["giornoSpesa", "Spesa e batch cooking"]];
    return formSheet("🍽️ Alimentazione", f, pr, d => mut("profile", p => { Object.assign(p, d); p.cucinaFerialiMin = +d.cucinaFerialiMin || p.cucinaFerialiMin; }));
  }
  if (kind === "budget") {
    const b = getDoc("money").budget || { lines: [] };
    const lines = (b.lines || []);
    openSheet("💶 Budget mensile", `<form class="form" id="f-bud"><div class="field"><label for="bd-in">💰 Entrate nette al mese</label><input class="in num" id="bd-in" type="number" step="1" value="${b.income || 0}"></div>
      ${["fisse", "variabili", "accantonamenti"].map(g => `<div class="label">${{ fisse: "🏠 Spese fisse", variabili: "🛒 Spese variabili", accantonamenti: "🐷 Accantonamenti" }[g]}</div>${lines.filter(l => l.group === g).map(l => `<div class="row between"><label for="bl-${l.id}" style="flex:1;font-weight:600">${l.cat ? CAT_EMO[l.cat] + " " : ""}${esc(l.name)}${l.from ? ` <span class="sub">da ${l.from}</span>` : ""}${l.to ? ` <span class="sub">fino a ${l.to}</span>` : ""}</label><input class="in num" id="bl-${l.id}" data-bl="${l.id}" type="number" step="0.01" value="${l.amount}" style="width:110px"></div>`).join("")}`).join("")}
      <button class="btn primary block">💾 Salva</button></form>`, body => {
      $("#f-bud", body).onsubmit = e => { e.preventDefault(); const inc = +$("#bd-in").value || 0; const vals = {}; body.querySelectorAll("[data-bl]").forEach(i => vals[i.dataset.bl] = +(+i.value || 0).toFixed(2));
        mut("money", m => { m.budget.income = inc; for (const l of m.budget.lines) if (l.id in vals) l.amount = vals[l.id]; }); closeSheet(); logAct("💶", "Budget modificato", { Entrate: eur(inc) }); toast("💶 Budget aggiornato"); };
    });
  }
}
function formSheet(title, fields, src, save) {
  openSheet(title, `<form class="form" id="f-set">${fields.map(([k, n, t]) => `<div class="field"><label for="st-${k}">${n}</label>${t === "area" ? `<textarea class="in" id="st-${k}" style="min-height:70px">${esc(src[k] || "")}</textarea>` : `<input class="in" id="st-${k}" ${t === "number" ? 'type="number" step="0.1"' : ""} value="${esc(t === "list" ? (src[k] || []).join(", ") : src[k] ?? "")}">`}</div>`).join("")}<button class="btn primary block">💾 Salva</button></form>`, body => {
    $("#f-set", body).onsubmit = e => { e.preventDefault(); const d = {}; for (const [k, , t] of fields) { const v = $("#st-" + k).value.trim(); d[k] = t === "list" ? v.split(",").map(x => x.trim()).filter(Boolean) : v; } save(d); logAct("⚙️", title.replace(/^\S+\s/, "") + " modificato", Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v]))); closeSheet(); toast("💾 Salvato"); };
  });
}
async function backupExport() {
  const ids = Object.keys(store.docs);
  const data = JSON.stringify({ app: "gestione-vita", version: 1, exportedAt: new Date().toISOString(), docs: Object.fromEntries(ids.map(id => [id, store.docs[id]])) }, null, 1);
  openSheet("📤 Backup", `<div class="form"><div class="sub">Il download non è disponibile qui: copia il testo e salvalo come file .json.</div><textarea class="in" id="bk-txt" style="min-height:200px;font-size:12px" readonly>${esc(data)}</textarea><button class="btn primary block" id="bk-copy">📋 Copia</button></div>`, body => {
    $("#bk-copy", body).onclick = async () => { const ta = $("#bk-txt"); try { await navigator.clipboard.writeText(ta.value); toast("📋 Copiato"); } catch { ta.select(); toast("Testo selezionato: copialo"); } };
  });
}
function backupImport(file) {
  const fr = new FileReader();
  fr.onload = () => {
    let j; try { j = JSON.parse(fr.result); } catch { toast("⚠️ File non valido"); return; }
    if (j?.app !== "gestione-vita" || !j.docs || typeof j.docs !== "object") { toast("⚠️ Non è un backup di Gestione Vita"); return; }
    const ids = Object.keys(j.docs).filter(id => /^[A-Za-z0-9_\-]+$/.test(id) && j.docs[id] && typeof j.docs[id] === "object");
    openSheet("📥 Importa backup", `<div class="form"><div class="notice">${icon("alert", "sm")}<div>Sostituisco ${ids.length} sezioni dell'app con quelle del backup del ${j.exportedAt ? fmtDateY(new Date(j.exportedAt)) : "?"}. I dati attuali di quelle sezioni vengono sovrascritti.</div></div><div class="row"><button class="btn primary" id="bk-ok" style="flex:1">📥 Importa</button><button class="btn" id="bk-no" style="flex:1">Annulla</button></div></div>`, body => {
      $("#bk-no", body).onclick = closeSheet;
      $("#bk-ok", body).onclick = () => { for (const id of ids) { store.docs[id] = j.docs[id]; Storage.set(id, j.docs[id]); } schedule(); closeSheet(); logAct("📥", "Backup importato", { Sezioni: ids.length }); toast(`📥 ${ids.length} sezioni ripristinate`); };
    });
  };
  fr.readAsText(file);
}

/* ---------- azioni ---------- */
Object.assign(ACTIONS, {
  "km-edit"(a, id) { editKm(id); }, "maint-new"(a, id) { editMaint(id, null); }, "maint-edit"(a, id) { const [v, m] = id.split(":"); editMaint(v, m); },
  "int-new"(a, id) { newIntervento(id); },
  "int-del"(a, id) { const prev = structuredClone(getDoc("vehicles")); mut("vehicles", v => { v.history = v.history.filter(h => h.id !== id); }); toast("Intervento eliminato", () => mut("vehicles", v => { Object.assign(v, prev); })); },
  "set-profilo"() { settingsSheet("profilo"); }, "set-cibo"() { settingsSheet("cibo"); }, "set-budget"() { settingsSheet("budget"); },
  "bk-export"() { backupExport(); },
});
document.addEventListener("change", e => {
  if (e.target.id === "bk-file" && e.target.files?.[0]) { backupImport(e.target.files[0]); e.target.value = ""; }
});


/* ---------- 🕘 Cronologia ---------- */
function logAct(emoji, title, details) {
  try {
    const d = details && typeof details === "object" ? Object.fromEntries(Object.entries(details).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v).slice(0, 600)])) : null;
    mut("history", h => { h.items = h.items || []; h.items.push({ id: newId(), at: new Date().toISOString(), e: emoji || "•", t: String(title || "").slice(0, 140), d }); if (h.items.length > 400) h.items = h.items.slice(-400); });
  } catch { }
}
function viewStoria() {
  const items = (getDoc("history").items || []).slice().reverse();
  if (!items.length) return card("Cronologia", "🕘", emptyBox("🕘", "Qui compariranno le azioni che fai nell'app"));
  const t = today(); const groups = []; let cur = null;
  for (const it of items.slice(0, 200)) {
    const d = new Date(it.at); const day = ymd(d);
    const label = day === ymd(t) ? "Oggi" : day === ymd(addDays(t, -1)) ? "Ieri" : `${DOW[dowOf(d)]} ${fmtDate(d)}`;
    if (!cur || cur.day !== day) { cur = { day, label, rows: [] }; groups.push(cur); }
    cur.rows.push(`<div class="item tap" data-act="hist-open" data-id="${it.id}"><span class="em e">${esc(it.e)}</span><div class="body"><div class="t" style="font-weight:600">${esc(it.t)}</div></div><span class="sub num">${fmtTime(d)}</span></div>`);
  }
  return card("Cronologia", "🕘", groups.map(g => `<div class="label daylabel" style="margin-top:10px">${g.label}</div><div class="list">${g.rows.join("")}</div>`).join("")
    + `<button class="btn ghost" data-act="hist-clear" style="margin-top:10px">🗑️ Svuota cronologia</button>`);
}
function openHist(id) {
  const it = (getDoc("history").items || []).find(x => x.id === id); if (!it) return;
  const d = new Date(it.at);
  openSheet(`${it.e} Dettagli`, `<div class="form"><div class="t" style="font-weight:800;font-size:18px">${esc(it.t)}</div>
    <div class="sub">🕘 ${DOW[dowOf(d)]} ${fmtDateY(d)} alle ${fmtTime(d)}</div>
    ${it.d && Object.keys(it.d).length ? `<div class="list">${Object.entries(it.d).map(([k, v]) => `<div class="item" style="align-items:flex-start;min-height:44px"><div class="body"><div class="s">${esc(k)}</div><div class="t" style="font-weight:600;white-space:pre-wrap">${esc(v)}</div></div></div>`).join("")}</div>` : `<div class="sub">Nessun dettaglio in più.</div>`}</div>`);
}
(function wrapForLog() {
  const H = () => getDoc("house"), SH = () => getDoc("shopping"), PA = () => getDoc("pantry");
  const wrap = (obj, key, fn) => { const orig = obj[key]; if (!orig) return; obj[key] = function (...args) { let after; try { after = fn(...args); } catch { } const r = orig.apply(this, args); try { after && after(); } catch { } return r; }; };
  wrap(ACTIONS, "task-toggle", (a, id) => { const x = (H().tasks || []).find(y => y.id === id); if (!x) return; const was = taskState(x).done; return () => { if (!was) logAct(emo("chore", x.title, "✅"), "Fatto: " + x.title, { Faccenda: x.title, Minuti: x.minutes || "—" }); }; });
  wrap(ACTIONS, "laundry-toggle", (a, id) => { const l = (H().laundry || []).find(y => y.id === id); if (!l) return; const was = laundryState(l).done; return () => { if (!was) logAct("🧺", "Lavatrice fatta: " + l.type, { Programma: l.program, Temperatura: l.temp }); }; });
  wrap(ACTIONS, "shop-toggle", (a, id) => { const it = (SH().items || []).find(y => y.id === id); if (!it) return; return () => { if (!it.checked) logAct("✅", "Preso: " + it.name, { Quantità: it.qty || "—", Reparto: it.reparto, Nota: "aggiunto alla dispensa" }); }; });
  wrap(ACTIONS, "shop-del", (a, id) => { const it = (SH().items || []).find(y => y.id === id); return () => it && logAct("🗑️", "Tolto dalla lista: " + it.name, { Quantità: it.qty || "—" }); });
  wrap(ACTIONS, "shop-clear", () => { const l = (SH().items || []).filter(y => y.checked).map(y => y.name); return () => l.length && logAct("🧹", `Tolti ${l.length} prodotti presi dalla lista`, { Prodotti: l.join(", ") }); });
  wrap(ACTIONS, "pantry-del", (a, id) => { const it = (PA().items || []).find(y => y.id === id); return () => it && logAct("🥫", "Finito: " + it.name, {}); });
  wrap(ACTIONS, "ing-add", (a, id) => () => logAct("🛒", "Da comprare: " + id, { Origine: "ingrediente mancante" }));
  wrap(ACTIONS, "shop-menu", () => { const before = new Set((SH().items || []).map(y => y.id)); return () => { const added = (SH().items || []).filter(y => !before.has(y.id)).map(y => y.name); if (added.length) logAct("🔄", `Lista completata dal menu: ${added.length} prodotti`, { Prodotti: added.join(", ") }); }; });
  wrap(ACTIONS, "prod-status", (a, id) => { const p = (H().products || []).find(y => y.id === id); return () => { const q = (H().products || []).find(y => y.id === id); if (q) logAct(emo("product", q.name, "🧴"), `${q.name}: ${q.status === "low" ? "sta finendo" : "ok"}`, {}); }; });
  const cartLog = names => names.length && logAct("🛒", names.length === 1 ? `In lista: ${names[0]}` : `${names.length} prodotti casa in lista`, { Prodotti: names.join(", ") });
  wrap(ACTIONS, "prod-cart", (a, id) => { const p = (H().products || []).find(y => y.id === id); return () => p && cartLog([p.name]); });
  wrap(ACTIONS, "prod-cart-all", () => { const l = (H().products || []).filter(p => p.status === "low" && !p.inList).map(p => p.name); return () => cartLog(l); });
  wrap(ACTIONS, "prod-del", (a, id) => { const p = (H().products || []).find(y => y.id === id); return () => p && logAct("🗑️", "Prodotto eliminato: " + p.name, {}); });
  wrap(ACTIONS, "exp-del", (a, id) => { const it = (getDoc("exp-" + ui.month).items || []).find(y => y.id === id); return () => it && logAct("🗑️", `Spesa eliminata: ${eur(it.amount)}`, { Categoria: catName(it.cat), Data: fmtDateY(parseD(it.date)), Nota: it.note || "—" }); });
  wrap(ACTIONS, "note-del", (a, id) => { const it = (getDoc("notes").items || []).find(y => y.id === id); return () => it && logAct("🗑️", "Nota eliminata", { Testo: it.text }); });
  wrap(ACTIONS, "int-del", (a, id) => { const it = (getDoc("vehicles").history || []).find(y => y.id === id); return () => it && logAct("🗑️", "Intervento eliminato: " + it.title, { Costo: eur(it.cost) }); });
  wrap(FORMS, "shop-add", () => { const v = $("#shop-name")?.value.trim(); const r = $("#shop-rep")?.value; return () => v && logAct("🛒", "Da comprare: " + v, { Reparto: r }); });
  wrap(FORMS, "pantry-add", () => { const v = $("#pantry-in")?.value.trim(); const r = $("#pantry-rep")?.value; return () => v && logAct("🥫", "In casa: " + v, { Reparto: r || "—" }); });
  wrap(FORMS, "prod-add", () => { const v = $("#prod-in")?.value.trim(); return () => v && logAct("🧴", "Nuovo prodotto casa: " + v, {}); });
  wrap(FORMS, "note-add", () => { const v = $("#note-in")?.value.trim(); return () => v && logAct("📝", "Nota salvata", { Testo: v }); });
})();
Object.assign(ACTIONS, {
  "hist-open"(a, id) { openHist(id); },
  "hist-clear"() { const prev = structuredClone(getDoc("history")); mut("history", h => { h.items = []; }); toast("🕘 Cronologia svuotata", () => mut("history", h => { h.items = prev.items; })); },
});


/* ===================== boot ===================== */
async function boot() {
  render();
  store.docs = await Storage.loadAll();
  store.loaded = true;
  render();
}
// aggiorna saluto/data a cambio giorno o ritorno in primo piano
document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });
setInterval(() => schedule(), 60000);
boot();
