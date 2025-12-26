// user.js (ES module)
import {
  auth, db, fmtIDR, fmtDate, monthKeyFromDateISO, buildMonthOptions,
  debounce, toast, escapeHtml, sortByField, fmtCurrency
} from "./common.js";

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection, doc, getDoc, query, where, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const elWho = document.getElementById("who");
const adminLink = document.getElementById("adminLink");
const btnLogout = document.getElementById("btnLogout");

const kSaldo = document.getElementById("kSaldo");
const kIn = document.getElementById("kIn");
const kOut = document.getElementById("kOut");
const meta = document.getElementById("meta");

const filterMonth = document.getElementById("filterMonth");
const filterType = document.getElementById("filterType");
const filterSearch = document.getElementById("filterSearch");
const btnReset = document.getElementById("btnReset");
const btnReload = document.getElementById("btnReload");

const txBody = document.getElementById("txBody");
const count = document.getElementById("count");

const pocketCards = document.getElementById("pocketCards");
const pocketCount = document.getElementById("pocketCount");

let rawIdrTx = [];
let rawPocketTx = [];
let pockets = [];

let allEvents = [];
let viewEvents = [];

let unsubIdr = null;
let unsubPT = null;
let unsubP = null;

let sortField = "date";
let sortDir = "desc";

function setSortIcon(field){
  const map = ["date","note","amount","currency","type"];
  for (const f of map){
    const el = document.getElementById(`si_${f}`);
    if (el) el.textContent = "↕";
  }
  const el = document.getElementById(`si_${field}`);
  if (el) el.textContent = sortDir === "asc" ? "↑" : "↓";
}

function computeIdrKpis(txs){
  let bal = 0, tin = 0, tout = 0;
  for (const t of txs){
    if (t.isDeleted) continue;
    if (t.type === "in"){ bal += t.amount; tin += t.amount; }
    else { bal -= t.amount; tout += t.amount; }
  }
  return { bal, tin, tout };
}

function renderPocketCards(){
  if (!pocketCards) return;

  if (!pockets.length){
    pocketCards.innerHTML = `<div class="empty" style="grid-column:1/-1;">
      <div class="emoji">💱</div>
      <div class="big">Belum ada pocket</div>
      <div>Nanti muncul setelah admin menambah pocket dan melakukan konversi.</div>
    </div>`;
    if (pocketCount) pocketCount.textContent = "0 pocket";
    return;
  }

  pocketCards.innerHTML = pockets.map(p => `
    <div class="kpi">
      <div class="k">${escapeHtml(p.currency)} • Rate ${fmtIDR(p.rate)} / 1</div>
      <div class="v">${fmtCurrency(p.currency, p.balance)}</div>
      <div class="muted" style="margin-top:6px;">Pocket aktif</div>
    </div>
  `).join("");

  if (pocketCount) pocketCount.textContent = `${pockets.length} pocket`;
}

function tsToMs(ts){
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number"){
    const ms = ts.seconds * 1000;
    const ns = typeof ts.nanoseconds === "number" ? ts.nanoseconds : 0;
    return ms + Math.floor(ns / 1e6);
  }
  return 0;
}

function normalizeEvents(){
  const events = [];

  for (const t of rawIdrTx){
    events.push({
      source: "IDR",
      id: t.id,
      date: t.date,
      type: t.type,
      amount: Number(t.amount || 0),
      currency: "IDR",
      note: t.note || "",
      isDeleted: Boolean(t.isDeleted),
      createdAt: t.createdAt || null,
      createdAtMs: tsToMs(t.createdAt)
    });
  }

  for (const t of rawPocketTx){
    const cur = String(t.currency || "").toUpperCase();

    const normalizedType =
      (t.type === "fx_buy") ? "in" :
      (t.type === "fx_sell") ? "out" :
      t.type;

    const noteExtra =
      (t.type === "fx_buy")
        ? ` (Konversi dari ${fmtIDR(t.idrAmount || 0)} @ ${fmtIDR(t.rate || 0)}/${cur})`
        : (t.type === "fx_sell")
        ? ` (Dikonversi menjadi ${fmtIDR(t.idrAmount || 0)} @ ${fmtIDR(t.rate || 0)}/${cur})`
        : "";

    events.push({
      source: "POCKET",
      id: t.id,
      date: t.date,
      type: normalizedType,
      amount: Number(t.amount || 0),
      currency: cur,
      note: (t.note || "") + noteExtra,
      isDeleted: Boolean(t.isDeleted),
      rawType: t.type,
      createdAt: t.createdAt || null,
      createdAtMs: tsToMs(t.createdAt)
    });
  }

  allEvents = events;
}

function rebuildMonthOptionsFromEvents(){
  const base = allEvents.filter(x => !x.isDeleted);
  const months = buildMonthOptions(base);
  const prev = filterMonth.value;
  filterMonth.innerHTML = `<option value="">Semua</option>` + months.map(m => `<option value="${m}">${m}</option>`).join("");
  if (months.includes(prev)) filterMonth.value = prev;
}

function computeRunningMaps(){
  // IDR running: urut berdasarkan date, lalu createdAt, lalu id (stabil)
  const idrAsc = rawIdrTx
    .filter(t => !t.isDeleted)
    .slice()
    .sort((a,b) => {
      const da = String(a.date || "");
      const db = String(b.date || "");
      const cmpD = da.localeCompare(db);
      if (cmpD !== 0) return cmpD;

      const ca = tsToMs(a.createdAt);
      const cb = tsToMs(b.createdAt);
      if (ca !== cb) return ca - cb;

      return String(a.id || "").localeCompare(String(b.id || ""));
    });

  let runIdr = 0;
  const runMapIdr = new Map();
  for (const t of idrAsc){
    runIdr += (t.type === "in" ? t.amount : -t.amount);
    runMapIdr.set(t.id, runIdr);
  }

  // Pocket running per currency: urut berdasarkan date, lalu createdAt, lalu id (stabil)
  const runMapPocket = new Map();
  const perCur = new Map();

  const pocketAsc = rawPocketTx
    .filter(t => !t.isDeleted)
    .slice()
    .sort((a,b) => {
      const da = String(a.date || "");
      const db = String(b.date || "");
      const cmpD = da.localeCompare(db);
      if (cmpD !== 0) return cmpD;

      const ca = tsToMs(a.createdAt);
      const cb = tsToMs(b.createdAt);
      if (ca !== cb) return ca - cb;

      return String(a.id || "").localeCompare(String(b.id || ""));
    });

  for (const t of pocketAsc){
    const cur = String(t.currency || "").toUpperCase();
    const running = perCur.get(cur) || 0;

    const eff =
      (t.type === "fx_buy") ? Number(t.amount || 0) :
      (t.type === "fx_sell") ? -Number(t.amount || 0) :
      (t.type === "out") ? -Number(t.amount || 0) :
      Number(t.amount || 0);

    const next = running + eff;
    perCur.set(cur, next);
    runMapPocket.set(`${cur}:${t.id}`, next);
  }

  return { runMapIdr, runMapPocket };
}

function sortEvents(view){
  if (sortField === "date"){
    // Sorting "Tanggal" = berdasarkan createdAt (waktu pembuatan), bukan string date
    view.sort((a,b) => {
      const A = Number(a.createdAtMs || 0);
      const B = Number(b.createdAtMs || 0);
      if (A !== B) return A - B;

      // fallback: date lalu id untuk stabilitas
      const d = String(a.date || "").localeCompare(String(b.date || ""));
      if (d !== 0) return d;

      return String(a.id || "").localeCompare(String(b.id || ""));
    });

    if (sortDir === "desc") view.reverse();
    return view;
  }

  return sortByField(view, sortField, sortDir);
}

function applyFilters(){
  normalizeEvents();
  rebuildMonthOptionsFromEvents();

  const month = filterMonth.value;
  const type = filterType.value;
  const q = (filterSearch.value || "").trim().toLowerCase();

  let view = allEvents.filter(t => !t.isDeleted);

  if (month) view = view.filter(t => monthKeyFromDateISO(t.date) === month);
  if (type) view = view.filter(t => t.type === type);
  if (q) view = view.filter(t => String(t.note||"").toLowerCase().includes(q));

  view = sortEvents(view);
  viewEvents = view;

  // KPI hanya untuk IDR (saldo utama)
  const { bal, tin, tout } = computeIdrKpis(rawIdrTx);
  kSaldo.textContent = fmtIDR(bal);
  kIn.textContent = fmtIDR(tin);
  kOut.textContent = fmtIDR(tout);

  renderTable();
  count.textContent = `${viewEvents.length} baris`;
  meta.textContent = `Histori gabungan IDR + Pocket • Live update aktif`;
}

function renderTable(){
  if (!viewEvents.length){
    txBody.innerHTML = `<tr><td colspan="6">
      <div class="empty">
        <div class="emoji">🗂️</div>
        <div class="big">Belum ada histori</div>
        <div>Nanti histori muncul saat admin menambah transaksi atau konversi.</div>
      </div>
    </td></tr>`;
    return;
  }

  const { runMapIdr, runMapPocket } = computeRunningMaps();

  txBody.innerHTML = viewEvents.map(e => {
    const amt = e.type === "in"
      ? `<span class="moneyIn">${fmtCurrency(e.currency, e.amount)}</span>`
      : `<span class="moneyOut">${fmtCurrency(e.currency, e.amount)}</span>`;

    const typeLabel = e.type === "in" ? "Masuk" : "Keluar";

    let runTxt = "-";
    if (e.source === "IDR"){
      const v = runMapIdr.get(e.id);
      runTxt = (v === undefined) ? "-" : fmtIDR(v);
    } else {
      const v = runMapPocket.get(`${e.currency}:${e.id}`);
      runTxt = (v === undefined) ? "-" : fmtCurrency(e.currency, v);
    }

    return `
      <tr>
        <td data-label="Tanggal">${fmtDate(e.date)}</td>
        <td data-label="Catatan">${escapeHtml(e.note || "")}</td>
        <td class="num" data-label="Nominal">${amt}</td>
        <td data-label="Currency">${escapeHtml(e.currency)}</td>
        <td data-label="Tipe">${typeLabel}</td>
        <td class="num" data-label="Saldo">${runTxt}</td>
      </tr>
    `;
  }).join("");
}

document.querySelectorAll("th.sortable").forEach(th => {
  th.addEventListener("click", () => {
    const f = th.dataset.sort;
    if (!f) return;

    if (sortField === f) sortDir = (sortDir === "asc") ? "desc" : "asc";
    else {
      sortField = f;
      sortDir = (f === "date") ? "desc" : "asc";
    }

    setSortIcon(sortField);
    applyFilters();
  });
});

filterMonth.addEventListener("change", applyFilters);
filterType.addEventListener("change", applyFilters);
filterSearch.addEventListener("input", debounce(applyFilters, 220));

btnReset.addEventListener("click", () => {
  filterMonth.value = "";
  filterType.value = "";
  filterSearch.value = "";
  applyFilters();
  toast({ title:"Reset", message:"Filter direset." });
});

btnReload.addEventListener("click", () => {
  applyFilters();
  toast({ title:"Info", message:"Re-render selesai." });
});

btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "login.html";
});

async function getMyProfile(uid){
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = "login.html";
  setSortIcon(sortField);

  const prof = await getMyProfile(user.uid);
  const label = prof ? (prof.displayName || prof.username) : "User";
  elWho.textContent = `Halo, ${label}`;
  if (prof?.role === "admin") adminLink.style.display = "inline-flex";

  if (unsubIdr) unsubIdr();
  if (unsubPT) unsubPT();
  if (unsubP) unsubP();

  // pockets
  const qP = query(collection(db, "pockets"), where("ownerUid", "==", user.uid));
  unsubP = onSnapshot(qP, (snap) => {
    pockets = snap.docs.map(d => {
      const x = d.data();
      return {
        id: d.id,
        currency: String(x.currency || "").toUpperCase(),
        rate: Number(x.rate || 0),
        balance: Number(x.balance || 0),
        isActive: Boolean(x.isActive !== false)
      };
    }).filter(p => p.isActive).sort((a,b)=>a.currency.localeCompare(b.currency));

    renderPocketCards();
  });

  // IDR transactions
  const qTx = query(collection(db, "transactions"), where("ownerUid", "==", user.uid));
  unsubIdr = onSnapshot(qTx, (snap) => {
    rawIdrTx = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        date: data.date,
        type: data.type,
        amount: Number(data.amount || 0),
        note: data.note || "",
        createdAt: data.createdAt || null,
        isDeleted: Boolean(data.isDeleted)
      };
    });
    applyFilters();
  }, (err) => toast({ title:"Gagal load IDR tx", message: err.message || "Cek rules.", type:"err" }));

  // pocket_transactions (ownerUid only; no composite index)
  const qPT = query(collection(db, "pocket_transactions"), where("ownerUid", "==", user.uid));
  unsubPT = onSnapshot(qPT, (snap) => {
    rawPocketTx = snap.docs.map(d => {
      const x = d.data();
      return {
        id: d.id,
        date: x.date,
        type: x.type,
        amount: Number(x.amount || 0),
        currency: x.currency,
        idrAmount: Number(x.idrAmount || 0),
        rate: Number(x.rate || 0),
        note: x.note || "",
        createdAt: x.createdAt || null,
        isDeleted: Boolean(x.isDeleted)
      };
    });
    applyFilters();
  }, (err) => toast({ title:"Gagal load pocket tx", message: err.message || "Cek rules.", type:"err" }));
});