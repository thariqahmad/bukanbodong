// admin.js (ES module)
import {
  auth, db, fmtIDR, fmtDate, monthKeyFromDateISO, buildMonthOptions,
  debounce, toast, attachMoneyMask, getMoneyRaw, escapeHtml, sortByField,
  fmtCurrency, toISODateToday
} from "./common.js";

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection, doc, getDoc, getDocs, query, where,
  onSnapshot, updateDoc, addDoc, deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/** ---------- Elements ---------- */
const elWho = document.getElementById("who");
const targetSelect = document.getElementById("targetSelect");
const targetSearch = document.getElementById("targetSearch");
const btnLogout = document.getElementById("btnLogout");
const btnAdd = document.getElementById("btnAdd");
const btnReload = document.getElementById("btnReload");
const toggleShowDeleted = document.getElementById("toggleShowDeleted");

const kSaldo = document.getElementById("kSaldo");
const kIn = document.getElementById("kIn");
const kOut = document.getElementById("kOut");

const filterMonth = document.getElementById("filterMonth");
const filterType = document.getElementById("filterType");
const filterSearch = document.getElementById("filterSearch");

const txBody = document.getElementById("txBody");
const meta = document.getElementById("meta");

/* Modal Transaction */
const txModal = document.getElementById("txModal");
const modalTitle = document.getElementById("modalTitle");
const modalSub = document.getElementById("modalSub");
const modalHint = document.getElementById("modalHint");
const btnCloseModal = document.getElementById("btnCloseModal");
const btnCancelModal = document.getElementById("btnCancelModal");
const btnSaveModal = document.getElementById("btnSaveModal");
const btnRestore = document.getElementById("btnRestore");
const btnHardDelete = document.getElementById("btnHardDelete");

const mDate = document.getElementById("mDate");
const mType = document.getElementById("mType");
const mNote = document.getElementById("mNote");
const mCurrency = document.getElementById("mCurrency");
const mCurrencyHint = document.getElementById("mCurrencyHint");
const amtIDRField = document.getElementById("amtIDRField");
const amtFXField = document.getElementById("amtFXField");
const mAmount = document.getElementById("mAmount");
const mAmountFX = document.getElementById("mAmountFX");
const mFxHint = document.getElementById("mFxHint");

/* Confirm Delete */
const confirmModal = document.getElementById("confirmModal");
const btnCloseConfirm = document.getElementById("btnCloseConfirm");
const btnCancelConfirm = document.getElementById("btnCancelConfirm");
const btnDoDelete = document.getElementById("btnDoDelete");
const confirmText = document.getElementById("confirmText");
const confirmCheck = document.getElementById("confirmCheck");

/* Pocket UI */
const pocketWrap = document.getElementById("pocketWrap");
const pocketMeta = document.getElementById("pocketMeta");
const btnNewPocket = document.getElementById("btnNewPocket");
const btnFxConvert = document.getElementById("btnFxConvert");

/* Pocket Modal */
const pocketModal = document.getElementById("pocketModal");
const pocketModalSub = document.getElementById("pocketModalSub");
const btnClosePocketModal = document.getElementById("btnClosePocketModal");
const btnCancelPocketModal = document.getElementById("btnCancelPocketModal");
const btnSavePocket = document.getElementById("btnSavePocket");
const pCurrency = document.getElementById("pCurrency");
const pRate = document.getElementById("pRate");

/* FX Modal */
const fxModal = document.getElementById("fxModal");
const fxModalSub = document.getElementById("fxModalSub");
const btnCloseFxModal = document.getElementById("btnCloseFxModal");
const btnCancelFxModal = document.getElementById("btnCancelFxModal");
const btnDoFx = document.getElementById("btnDoFx");
const fxPocket = document.getElementById("fxPocket");
const fxDate = document.getElementById("fxDate");
const fxIdr = document.getElementById("fxIdr");
const fxIdrHint = document.getElementById("fxIdrHint");
const fxResult = document.getElementById("fxResult");
const fxRateHint = document.getElementById("fxRateHint");
const fxNote = document.getElementById("fxNote");

/* FX Sell Modal */
const btnFxSell = document.getElementById("btnFxSell");

const fxSellModal = document.getElementById("fxSellModal");
const fxSellModalSub = document.getElementById("fxSellModalSub");
const btnCloseFxSellModal = document.getElementById("btnCloseFxSellModal");
const btnCancelFxSellModal = document.getElementById("btnCancelFxSellModal");
const btnDoFxSell = document.getElementById("btnDoFxSell");

const fxSellPocket = document.getElementById("fxSellPocket");
const fxSellDate = document.getElementById("fxSellDate");
const fxSellAmount = document.getElementById("fxSellAmount");
const fxSellBalHint = document.getElementById("fxSellBalHint");
const fxSellResult = document.getElementById("fxSellResult");
const fxSellRateHint = document.getElementById("fxSellRateHint");
const fxSellRate = document.getElementById("fxSellRate");
const fxSellNote = document.getElementById("fxSellNote");

/** ---------- State ---------- */
let me = null;
let myRole = "user";
let usersList = [];
let selectedOwnerUid = "";
let selectedOwnerLabel = "";

let unsubTx = null;
let unsubPocketTx = null;
let unsubPockets = null;

let allIdrTx = [];
let allPocketTx = [];
let pockets = []; // {id,currency,rate,balance}

let allEvents = [];
let viewEvents = [];

let sortField = "date";
let sortDir = "desc";

let editingId = null;
let editingSource = null; // "IDR" | "POCKET"
let deletingId = null;
let deletingSource = null;

attachMoneyMask(mAmount);
function round2(n){
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

// For FX amounts: always rounded to 2 decimals
function parseFx2(input){
  const s = String(input ?? "").trim().replace(",", ".");
  const v = Number(s);
  if (!Number.isFinite(v)) return 0;
  return round2(v);
}

// For IDR Rate per 1 unit: allow decimals (e.g. 4150.69)
function parseRateIDR(input){
  let s = String(input ?? "").trim();
  if (!s) return 0;

  s = s.replace(/[^0-9.,]/g, "");

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  if (hasDot && hasComma){
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");

    if (lastComma > lastDot){
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma){
    s = s.replace(",", ".");
  } else if (hasDot){
    const parts = s.split(".");
    const last = parts[parts.length - 1];
    if (last.length === 3 && parts.length > 1){
      s = s.replace(/\./g, "");
    }
  }

  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}

/** ---------- UI Helpers ---------- */
function openModal(){ txModal.classList.add("open"); }
function closeModal(){
  txModal.classList.remove("open");
  editingId = null;
  editingSource = null;
  // enable fields
  mDate.disabled = false;
  mType.disabled = false;
  mCurrency.disabled = false;
  mNote.disabled = false;
  mAmount.disabled = false;
  mAmountFX.disabled = false;
}

function openConfirm(){ confirmModal.classList.add("open"); }
function closeConfirm(){
  confirmModal.classList.remove("open");
  deletingId = null;
  deletingSource = null;
  confirmCheck.checked = false;
  btnDoDelete.disabled = true;
}

function openPocketModal(){ pocketModal.classList.add("open"); }
function closePocketModal(){ pocketModal.classList.remove("open"); }

function openFxModal(){ fxModal.classList.add("open"); }
function closeFxModal(){ fxModal.classList.remove("open"); }

function openFxSellModal(){ fxSellModal.classList.add("open"); }
function closeFxSellModal(){ fxSellModal.classList.remove("open"); }

function setSortIcon(field){
  const map = ["date","note","amount","currency","type"];
  for (const f of map){
    const el = document.getElementById(`si_${f}`);
    if (el) el.innerHTML = '<i class="fa-solid fa-sort" style="opacity:0.3"></i>';
  }
  const el = document.getElementById(`si_${field}`);
  if (el) el.innerHTML = sortDir === "asc" 
    ? '<i class="fa-solid fa-sort-up"></i>' 
    : '<i class="fa-solid fa-sort-down"></i>';
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

function buildCurrencyOptions(keep="IDR", lock=false){
  const opts = [`<option value="IDR">IDR</option>`]
    .concat(pockets.map(p => `<option value="${p.currency}">${escapeHtml(p.currency)}</option>`));
  mCurrency.innerHTML = opts.join("");
  if (keep) mCurrency.value = keep;
  mCurrency.disabled = lock;
  onCurrencyChange();
}

function onCurrencyChange(){
  const cur = (mCurrency.value || "IDR").toUpperCase();
  if (cur === "IDR"){
    amtIDRField.style.display = "";
    amtFXField.style.display = "none";
    mCurrencyHint.textContent = "IDR Transactions.";
  } else {
    amtIDRField.style.display = "none";
    amtFXField.style.display = "";
    const p = pockets.find(x => x.currency === cur);
    const bal = p ? fmtCurrency(cur, p.balance) : "—";
    const rate = p ? fmtIDR(p.rate) : "—";
    mCurrencyHint.textContent = `Pocket ${cur} • Rate ${rate} / 1 • Balance: ${bal}`;
    mFxHint.textContent = `Enter amount in ${cur}.`;
  }
}

mCurrency?.addEventListener("change", onCurrencyChange);

/** ---------- Pocket Cards ---------- */
function setHTML(el, html){
  if (el) el.innerHTML = html;
}
function setText(el, text){
  if (el) el.textContent = text;
}

function renderPockets(){
  // Guard: if DOM pocket section is missing
  if (!pocketWrap || !pocketMeta) return;

  // helper for dropdowns
  function setPocketSelectOptions(selectEl, emptyLabel){
    if (!selectEl) return;
    if (!pockets.length){
      selectEl.innerHTML = `<option value="">${emptyLabel}</option>`;
      return;
    }
    selectEl.innerHTML =
      `<option value="">— Choose Pocket —</option>` +
      pockets.map(p => `<option value="${p.id}">${escapeHtml(p.currency)} (rate ${p.rate})</option>`).join("");
  }

  if (!selectedOwnerUid){
    setHTML(pocketWrap, "");
    setText(pocketMeta, "Choose target to view pocket.");
    setPocketSelectOptions(fxPocket, "—");
    setPocketSelectOptions(fxSellPocket, "—");
    return;
  }

  if (!pockets.length){
    setHTML(pocketWrap, `<div class="empty" style="grid-column:1/-1;">
      <div class="emoji"><i class="fa-solid fa-wallet" style="font-size:2rem; color:#ccc;"></i></div>
      <div class="big">No pocket yet</div>
      <div>Add a pocket now</div>
    </div>`);
    setText(pocketMeta, "—");
    setPocketSelectOptions(fxPocket, "— No pocket found —");
    setPocketSelectOptions(fxSellPocket, "— No pocket found —");
    return;
  }

  setHTML(pocketWrap, pockets.map(p => `
    <div class="kpi">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <div>
          <div class="k">${escapeHtml(p.currency)} • Rate ${fmtIDR(p.rate)} / 1</div>
          <div class="v">${fmtCurrency(p.currency, p.balance)}</div>
        </div>
        <button class="btn icon bad" title="Remove Pocket" data-action="deletePocket" data-id="${p.id}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
      <div class="muted" style="margin-top:6px;">Active pocket</div>
    </div>
  `).join(""));

  setText(pocketMeta, `Pockets total: ${pockets.length}`);

  setPocketSelectOptions(fxPocket, "—");
  setPocketSelectOptions(fxSellPocket, "—");
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

/** ---------- Build Combined Timeline ---------- */
function normalizeEvents(){
  const events = [];

  for (const t of allIdrTx){
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

  for (const t of allPocketTx){
    const cur = String(t.currency || "").toUpperCase();
    const normalizedType =
    (t.type === "fx_buy") ? "in" :
    (t.type === "fx_sell") ? "out" :
    t.type;

    const noteExtra =
    (t.type === "fx_buy")
        ? ` (Convert from ${fmtIDR(t.idrAmount || 0)} @ ${fmtIDR(t.rate || 0)}/${cur})`
        : (t.type === "fx_sell")
        ? ` (Converted to ${fmtIDR(t.idrAmount || 0)} @ ${fmtIDR(t.rate || 0)}/${cur})`
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
      pocketId: t.pocketId,
      rawType: t.type,
      createdAt: t.createdAt || null,
      createdAtMs: tsToMs(t.createdAt)
    });
  }

  allEvents = events;
}

function rebuildMonthFilterOptions(list){
  const base = list.filter(x => !x.isDeleted);
  const months = buildMonthOptions(base);
  const prev = filterMonth.value;
  filterMonth.innerHTML = `<option value="">All</option>` + months.map(m => `<option value="${m}">${m}</option>`).join("");
  if (months.includes(prev)) filterMonth.value = prev;
}

function computeRunningMaps(){
  // IDR running by IDR tx (asc by date)
  const idrAsc = allIdrTx.filter(t => !t.isDeleted).slice().sort((a,b)=> String(a.date||"").localeCompare(String(b.date||"")));
  let runIdr = 0;
  const runMapIdr = new Map();
  for (const t of idrAsc){
    runIdr += (t.type === "in" ? t.amount : -t.amount);
    runMapIdr.set(t.id, runIdr);
  }

  // Pocket running per currency based on pocket_transactions
  const runMapPocket = new Map(); // key `${currency}:${id}` => balance
  const perCur = new Map(); // currency => running
  const pocketAsc = allPocketTx.filter(t => !t.isDeleted).slice().sort((a,b)=> String(a.date||"").localeCompare(String(b.date||"")));
  for (const t of pocketAsc){
    const cur = String(t.currency || "").toUpperCase();
    const running = perCur.get(cur) || 0;
    const eff = ((t.type === "out") ? -Number(t.amount||0) : Number(t.amount||0)); // fx_buy treated as in
    const next = running + eff;
    perCur.set(cur, next);
    runMapPocket.set(`${cur}:${t.id}`, next);
  }

  return { runMapIdr, runMapPocket };
}

function applyFilters(){
  normalizeEvents();

  const month = filterMonth.value;
  const type = filterType.value;
  const q = (filterSearch.value || "").trim().toLowerCase();
  const showDeleted = toggleShowDeleted.checked;

  let arr = [...allEvents];

  if (!showDeleted) arr = arr.filter(t => !t.isDeleted);
  if (month) arr = arr.filter(t => monthKeyFromDateISO(t.date) === month);
  if (type) arr = arr.filter(t => t.type === type);
  if (q) arr = arr.filter(t => String(t.note||"").toLowerCase().includes(q));

  if (sortField === "date"){
  arr.sort((a,b) => {
    const A = Number(a.createdAtMs || 0);
    const B = Number(b.createdAtMs || 0);
    if (A !== B) return A - B; // asc
    const d = String(a.date || "").localeCompare(String(b.date || ""));
    if (d !== 0) return d;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
  if (sortDir === "desc") arr.reverse(); // newest first
} else {
  arr = sortByField(arr, sortField, sortDir);
}

  viewEvents = arr;

  // KPI IDR always from IDR tx
  const { bal, tin, tout } = computeIdrKpis(allIdrTx);
  kSaldo.textContent = fmtIDR(bal);
  kIn.textContent = fmtIDR(tin);
  kOut.textContent = fmtIDR(tout);

  rebuildMonthFilterOptions(allEvents);

  renderTable();
  meta.textContent = `Target: ${selectedOwnerLabel || "-"} • Total: ${viewEvents.length}`;
}

function renderTable(){
  if (!selectedOwnerUid){
    txBody.innerHTML = `<tr><td colspan="7">
      <div class="empty"><div class="big">Select a target</div><div>Please choose a target from the dropdown.</div></div>
    </td></tr>`;
    return;
  }

  if (!viewEvents.length){
    txBody.innerHTML = `<tr><td colspan="7">
      <div class="empty">
        <div class="big">No history found</div>
        <div>Add IDR transactions or create a pocket to get started.</div>
      </div>
    </td></tr>`;
    return;
  }

  const { runMapIdr, runMapPocket } = computeRunningMaps();

  txBody.innerHTML = viewEvents.map(e => {
    const amt = e.type === "in"
      ? `<span class="moneyIn">${fmtCurrency(e.currency, e.amount)}</span>`
      : `<span class="moneyOut">${fmtCurrency(e.currency, e.amount)}</span>`;

    const typeLabel = e.type === "in" ? "In" : "Out";
    const delBadge = e.isDeleted ? ` <span class="pill" style="border-color: rgba(255,92,124,.35); color:#ffb1c0;">Deleted</span>` : "";

    let runTxt = "-";
    if (e.source === "IDR"){
      const v = runMapIdr.get(e.id);
      runTxt = (v === undefined) ? "-" : fmtIDR(v);
    } else {
      const v = runMapPocket.get(`${e.currency}:${e.id}`);
      runTxt = (v === undefined) ? "-" : fmtCurrency(e.currency, v);
    }

    const isLocked = (e.source === "POCKET" && (e.rawType === "fx_buy" || e.rawType === "fx_sell")); // conversion: no edit
    const editBtn = isLocked 
      ? `<button class="btn icon" disabled title="Conversion record is locked"><i class="fa-solid fa-lock"></i></button>` 
      : `<button class="btn icon" data-action="edit" data-id="${e.id}" data-source="${e.source}" title="Edit"><i class="fa-solid fa-pen"></i></button>`;

    const delBtn  = `<button class="btn icon bad" data-action="delete" data-id="${e.id}" data-source="${e.source}" title="Delete"><i class="fa-solid fa-trash"></i></button>`;

    const restoreBtn = `<button class="btn icon good" data-action="restore" data-id="${e.id}" data-source="${e.source}" title="Restore"><i class="fa-solid fa-rotate-left"></i></button>`;
    const hardBtn = `<button class="btn icon bad" data-action="hard" data-id="${e.id}" data-source="${e.source}" title="Permanent Delete"><i class="fa-solid fa-ban"></i></button>`;

    const actions = e.isDeleted ? `${restoreBtn}${hardBtn}` : `${editBtn}${delBtn}`;

    return `
      <tr>
        <td data-label="Date">${fmtDate(e.date)}${delBadge}</td>
        <td data-label="Note">${escapeHtml(e.note || "")}</td>
        <td class="num" data-label="Amount">${amt}</td>
        <td data-label="Currency">${escapeHtml(e.currency)}</td>
        <td data-label="Type">${typeLabel}</td>
        <td class="num" data-label="Balance">${runTxt}</td>
        <td class="num" data-label="Action"><div class="actions">${actions}</div></td>
      </tr>
    `;
  }).join("");
}

/** ---------- Users dropdown ---------- */
function renderTargetOptions(list, keepUid=""){
  const sorted = [...list].sort((a,b) => {
    const A = String(a.displayName || a.username || "");
    const B = String(b.displayName || b.username || "");
    return A.localeCompare(B);
  });

  targetSelect.innerHTML = `<option value="">— Select Target —</option>` + sorted.map(u => {
    const label = u.displayName ? `${u.displayName} (${u.username})` : u.username;
    return `<option value="${u.uid}">${escapeHtml(label)}</option>`;
  }).join("");

  if (keepUid) targetSelect.value = keepUid;
}

function pickTarget(uid){
  selectedOwnerUid = uid || "";
  const u = usersList.find(x => x.uid === uid);
  selectedOwnerLabel = u ? (u.displayName ? `${u.displayName} (${u.username})` : u.username) : "";
  modalSub.textContent = selectedOwnerLabel ? `Target: ${selectedOwnerLabel}` : "—";

  if (unsubTx) unsubTx();
  if (unsubPocketTx) unsubPocketTx();
  if (unsubPockets) unsubPockets();

  allIdrTx = [];
  allPocketTx = [];
  pockets = [];
  renderPockets();
  applyFilters();

  if (!selectedOwnerUid) return;

  // 1) pockets (no isActive filter to avoid composite index)
  const qP = query(collection(db, "pockets"), where("ownerUid", "==", selectedOwnerUid));
  unsubPockets = onSnapshot(qP, (snap) => {
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

    renderPockets();
    buildCurrencyOptions(mCurrency.value || "IDR", Boolean(editingId)); // keep selection
  });

  // 2) IDR transactions
  const qTx = query(collection(db, "transactions"), where("ownerUid", "==", selectedOwnerUid));
  unsubTx = onSnapshot(qTx, (snap) => {
    allIdrTx = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ownerUid: data.ownerUid,
        date: data.date,
        type: data.type,
        amount: Number(data.amount || 0),
        note: data.note || "",
        createdAt: data.createdAt || null,
        createdBy: data.createdBy || null,
        isDeleted: Boolean(data.isDeleted),
      };
    });
    applyFilters();
  }, (err) => toast({ title:"Error", message: err.message || "Failed to load IDR transactions.", type:"err" }));

  // 3) pocket_transactions (query ownerUid only to avoid composite index)
  const qPT = query(collection(db, "pocket_transactions"), where("ownerUid", "==", selectedOwnerUid));
  unsubPocketTx = onSnapshot(qPT, (snap) => {
    allPocketTx = snap.docs.map(d => {
      const x = d.data();
      return {
        id: d.id,
        ownerUid: x.ownerUid,
        pocketId: x.pocketId,
        currency: x.currency,
        date: x.date,
        type: x.type,
        amount: Number(x.amount || 0),
        idrAmount: Number(x.idrAmount || 0),
        rate: Number(x.rate || 0),
        note: x.note || "",
        createdAt: x.createdAt || null,
        createdBy: x.createdBy || null,
        isDeleted: Boolean(x.isDeleted),
      };
    });
    applyFilters();
  }, (err) => toast({ title:"Error", message: err.message || "Failed to load pocket transactions.", type:"err" }));
}

/** ---------- Modal Modes ---------- */
function setModalModeAdd(){
  editingId = null;
  editingSource = null;
  modalTitle.textContent = "Add Transaction";
  modalHint.textContent = "Add Income/Expense or Pocket Transaction. Use 'Convert' for currency exchange.";
  btnRestore.style.display = "none";
  btnHardDelete.style.display = "none";
  btnSaveModal.style.display = "inline-flex";

  mDate.value = toISODateToday();
  mType.value = "in";
  mNote.value = "";

  buildCurrencyOptions("IDR", false);
  mAmount.value = "";
  mAmount.dataset.raw = "0";
  mAmountFX.value = "";
}

function setModalModeEditIdr(tx){
  editingId = tx.id;
  editingSource = "IDR";
  modalTitle.textContent = "Edit Transaction (IDR)";
  modalHint.textContent = "Changes will affect IDR balance.";
  btnRestore.style.display = "none";
  btnHardDelete.style.display = "none";
  btnSaveModal.style.display = "inline-flex";

  mDate.value = tx.date || toISODateToday();
  mType.value = tx.type || "in";
  mNote.value = tx.note || "";

  buildCurrencyOptions("IDR", true);
  mAmount.value = String(tx.amount || "");
  mAmount.dataset.raw = String(tx.amount || 0);
  mAmount.dispatchEvent(new Event("blur"));

  mAmountFX.value = "";
}

function setModalModeEditPocket(tx){
  editingId = tx.id;
  editingSource = "POCKET";
  modalTitle.textContent = "Edit Transaction (Pocket)";
  modalHint.textContent = "Conversion records are locked.";
  btnRestore.style.display = "none";
  btnHardDelete.style.display = "none";
  btnSaveModal.style.display = "inline-flex";

  mDate.value = tx.date || toISODateToday();
  mType.value = (tx.type === "out") ? "out" : "in";
  mNote.value = tx.note || "";

  const cur = String(tx.currency || "").toUpperCase();
  buildCurrencyOptions(cur, true);

  mAmount.value = "";
  mAmount.dataset.raw = "0";
  mAmountFX.value = String(tx.amount || "");
}

function setModalModeDeleted(evt){
  editingId = evt.id;
  editingSource = evt.source;
  modalTitle.textContent = "Deleted Transaction";
  modalHint.textContent = "You can restore or permanently delete this item.";
  btnRestore.style.display = "inline-flex";
  btnHardDelete.style.display = "inline-flex";
  btnSaveModal.style.display = "none";

  mDate.value = evt.date || "";
  mType.value = evt.type || "in";
  mNote.value = evt.note || "";

  buildCurrencyOptions(evt.currency || "IDR", true);

  if ((evt.currency || "IDR") === "IDR"){
    mAmount.value = String(evt.amount || "");
    mAmount.dataset.raw = String(evt.amount || 0);
    mAmount.dispatchEvent(new Event("blur"));
    mAmountFX.value = "";
  } else {
    mAmount.value = "";
    mAmount.dataset.raw = "0";
    mAmountFX.value = String(evt.amount || "");
  }

  mDate.disabled = true;
  mType.disabled = true;
  mCurrency.disabled = true;
  mNote.disabled = true;
  mAmount.disabled = true;
  mAmountFX.disabled = true;
}

/** ---------- CRUD Logic ---------- */
function getPocketByCurrency(cur){
  const c = String(cur || "").toUpperCase();
  return pockets.find(p => p.currency === c);
}

function getPocketEffect(type, amt){
  // in adds balance, out subtracts balance
  const a = Number(amt || 0);
  return (type === "out") ? -a : a;
}

async function createIdrTx({ date, type, amount, note }){
  await addDoc(collection(db, "transactions"), {
    ownerUid: selectedOwnerUid,
    date,
    type,
    amount,
    note,
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser.uid,
    isDeleted: false
  });
}

async function updateIdrTx(id, { date, type, amount, note }){
  await updateDoc(doc(db, "transactions", id), {
    date, type, amount, note,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid
  });
}

async function createPocketTx({ pocketId, currency, date, type, amount, note }){
  const p = getPocketByCurrency(currency);
  if (!p) throw new Error("Pocket not found.");

  const eff = getPocketEffect(type, amount);
  const nextBal = p.balance + eff;
  if (nextBal < -1e-9) throw new Error("Insufficient pocket balance.");

  await addDoc(collection(db, "pocket_transactions"), {
    ownerUid: selectedOwnerUid,
    pocketId,
    currency,
    date,
    type, // in/out
    amount,
    note,
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser.uid,
    isDeleted: false
  });

  await updateDoc(doc(db, "pockets", pocketId), {
    balance: nextBal,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid
  });
}

async function updatePocketTx(id, oldTx, { date, type, amount, note }){
  const cur = String(oldTx.currency || "").toUpperCase();
  const p = getPocketByCurrency(cur);
  if (!p) throw new Error("Pocket not found.");

  const oldEff = getPocketEffect(oldTx.type === "fx_buy" ? "in" : oldTx.type, oldTx.amount);
  const newEff = getPocketEffect(type, amount);
  const delta = newEff - oldEff;

  const nextBal = p.balance + delta;
  if (nextBal < -1e-9) throw new Error("Insufficient pocket balance for this change.");

  await updateDoc(doc(db, "pocket_transactions", id), {
    date, type,
    amount, note,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid
  });

  await updateDoc(doc(db, "pockets", p.id), {
    balance: nextBal,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid
  });
}

async function softDeleteIdr(id){
  await updateDoc(doc(db, "transactions", id), {
    isDeleted: true,
    deletedAt: serverTimestamp(),
    deletedBy: auth.currentUser.uid
  });
}

async function restoreIdr(id){
  await updateDoc(doc(db, "transactions", id), {
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    restoredAt: serverTimestamp(),
    restoredBy: auth.currentUser.uid
  });
}

async function hardDeleteIdr(id){
  await deleteDoc(doc(db, "transactions", id));
}

async function softDeletePocket(id, tx){
  const cur = String(tx.currency || "").toUpperCase();
  const p = getPocketByCurrency(cur);
  if (!p) throw new Error("Pocket not found.");

  // reverse effect
  const eff = getPocketEffect(tx.type === "fx_buy" ? "in" : tx.type, tx.amount);
  const nextBal = p.balance - eff;

  await updateDoc(doc(db, "pocket_transactions", id), {
    isDeleted: true,
    deletedAt: serverTimestamp(),
    deletedBy: auth.currentUser.uid
  });

  await updateDoc(doc(db, "pockets", p.id), {
    balance: nextBal,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid
  });
}

async function restorePocket(id, tx){
  const cur = String(tx.currency || "").toUpperCase();
  const p = getPocketByCurrency(cur);
  if (!p) throw new Error("Pocket not found.");

  const eff = getPocketEffect(tx.type === "fx_buy" ? "in" : tx.type, tx.amount);
  const nextBal = p.balance + eff;
  if (nextBal < -1e-9) throw new Error("Insufficient pocket balance to restore.");

  await updateDoc(doc(db, "pocket_transactions", id), {
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    restoredAt: serverTimestamp(),
    restoredBy: auth.currentUser.uid
  });

  await updateDoc(doc(db, "pockets", p.id), {
    balance: nextBal,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid
  });
}

async function hardDeletePocket(id){
  await deleteDoc(doc(db, "pocket_transactions", id));
}

/** ---------- Table Actions ---------- */
txBody.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const source = btn.dataset.source;

  const evt = allEvents.find(x => x.id === id && x.source === source);
  if (!evt) return;

  if (action === "edit"){
    if (evt.source === "IDR"){
      const tx = allIdrTx.find(x => x.id === id);
      if (!tx) return;
      setModalModeEditIdr(tx);
      openModal();
    } else {
      const tx = allPocketTx.find(x => x.id === id);
      if (!tx) return;
      if (tx.type === "fx_buy"){
        toast({ title:"Locked", message:"Conversion records cannot be edited.", type:"err" });
        return;
      }
      setModalModeEditPocket(tx);
      openModal();
    }
  }

  if (action === "delete"){
    deletingId = id;
    deletingSource = source;
    confirmText.textContent = `${fmtDate(evt.date)} • ${evt.type === "in" ? "In" : "Out"} • ${fmtCurrency(evt.currency, evt.amount)} • ${evt.note}`;
    openConfirm();
  }

  if (action === "restore"){
    setModalModeDeleted(evt);
    openModal();
  }

  if (action === "hard"){
    setModalModeDeleted(evt);
    openModal();
  }
});

if (pocketWrap){
  pocketWrap.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action='deletePocket']");
    if (!btn) return;

    const pid = btn.dataset.id;
    const p = pockets.find(x => x.id === pid);
    if (!p) return;

    const balRounded = Math.round(Number(p.balance || 0) * 100) / 100;
    const EPS = 0.0005;

    if (balRounded > EPS){
    toast({
        title: "Denied",
        message: `Pocket ${p.currency} still has a balance of ${fmtCurrency(p.currency, balRounded)}. Please empty/sell the balance before deleting.`,
        type: "err"
    });

    return;

    }

    const ok = confirm(`Delete pocket ${p.currency}? It will be hidden from the user, but history remains.`);
    if (!ok) return;

    try{
      await updateDoc(doc(db, "pockets", pid), {
        balance: 0,
        isActive: false,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser.uid
      });
      toast({ title: "Success", message: `Pocket ${p.currency} deleted (deactivated).` });
    }catch(err){
      toast({ title: "Error", message: err.message || "Failed to delete pocket.", type: "err" });
    }
  });
}

/** ---------- Modal buttons ---------- */
btnAdd.addEventListener("click", () => {
  setModalModeAdd();
  openModal();
});

btnSaveModal.addEventListener("click", async () => {
  try{
    btnSaveModal.disabled = true;
    if (!selectedOwnerUid) throw new Error("Please select a target first.");

    const date = mDate.value;
    const type = mType.value;
    const note = (mNote.value || "").trim();
    const cur = (mCurrency.value || "IDR").toUpperCase();

    if (!date) throw new Error("Date is required.");
    if (!(type === "in" || type === "out")) throw new Error("Invalid type.");
    if (!note) throw new Error("Note is required.");

    if (cur === "IDR"){
      const amount = getMoneyRaw(mAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("IDR amount must be > 0.");

      if (!editingId){
        await createIdrTx({ date, type, amount, note });
        toast({ title:"Success", message:"IDR transaction added." });
      } else {
        await updateIdrTx(editingId, { date, type, amount, note });
        toast({ title:"Success", message:"IDR transaction updated." });
      }

    } else {
      const p = getPocketByCurrency(cur);
      if (!p) throw new Error("Pocket not found. Please create one first.");
      const amount = parseFx2(mAmountFX.value);
      if (amount <= 0) throw new Error(`Amount ${cur} must be > 0.`);

      if (!editingId){
        await createPocketTx({ pocketId: p.id, currency: cur, date, type, amount, note });
        toast({ title:"Success", message:`Pocket transaction ${cur} added.` });
      } else {
        const old = allPocketTx.find(x => x.id === editingId);
        if (!old) throw new Error("Pocket transaction data not found.");
        await updatePocketTx(editingId, old, { date, type, amount, note });
        toast({ title:"Success", message:`Pocket transaction ${cur} updated.` });
      }
    }

    closeModal();
  }catch(e){
    toast({ title:"Error", message: e.message || "Operation failed.", type:"err" });
  }finally{
    btnSaveModal.disabled = false;
  }
});

btnRestore.addEventListener("click", async () => {
  try{
    btnRestore.disabled = true;
    if (!editingId || !editingSource) return;

    const evt = allEvents.find(x => x.id === editingId && x.source === editingSource);
    if (!evt) throw new Error("Data not found.");

    if (editingSource === "IDR"){
      await restoreIdr(editingId);
    } else {
      const tx = allPocketTx.find(x => x.id === editingId);
      if (!tx) throw new Error("Pocket transaction not found.");
      await restorePocket(editingId, tx);
    }

    toast({ title:"Success", message:"Restored successfully." });
    closeModal();
  }catch(e){
    toast({ title:"Error", message: e.message || "Restore failed.", type:"err" });
  }finally{
    btnRestore.disabled = false;
  }
});

btnHardDelete.addEventListener("click", async () => {
  const ok = confirm("Delete PERMANENTLY? This action cannot be undone.");
  if (!ok) return;
  try{
    btnHardDelete.disabled = true;
    if (!editingId || !editingSource) return;

    const evt = allEvents.find(x => x.id === editingId && x.source === editingSource);
    if (!evt) throw new Error("Data not found.");
    if (!evt.isDeleted){
      throw new Error("Hard delete is only for soft-deleted data.");
    }

    if (editingSource === "IDR"){
      await hardDeleteIdr(editingId);
    } else {
      await hardDeletePocket(editingId);
    }

    toast({ title:"Success", message:"Permanently deleted." });
    closeModal();
  }catch(e){
    toast({ title:"Error", message: e.message || "Permanent delete failed.", type:"err" });
  }finally{
    btnHardDelete.disabled = false;
  }
});

btnCloseModal.addEventListener("click", closeModal);
btnCancelModal.addEventListener("click", closeModal);
txModal.addEventListener("click", (e) => { if (e.target === txModal) closeModal(); });

/** ---------- Confirm modal ---------- */
confirmCheck.addEventListener("change", () => { btnDoDelete.disabled = !confirmCheck.checked; });

btnDoDelete.addEventListener("click", async () => {
  try{
    btnDoDelete.disabled = true;
    if (!deletingId || !deletingSource) return;

    if (deletingSource === "IDR"){
      await softDeleteIdr(deletingId);
    } else {
      const tx = allPocketTx.find(x => x.id === deletingId);
      if (!tx) throw new Error("Pocket transaction not found.");
      await softDeletePocket(deletingId, tx);
    }

    toast({ title:"Success", message:"Transaction deleted (soft)." });
    closeConfirm();
  }catch(e){
    toast({ title:"Error", message: e.message || "Delete failed.", type:"err" });
    closeConfirm();
  }
});

btnCloseConfirm.addEventListener("click", closeConfirm);
btnCancelConfirm.addEventListener("click", closeConfirm);
confirmModal.addEventListener("click", (e) => { if (e.target === confirmModal) closeConfirm(); });

/** ---------- Sorting + Filters ---------- */
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
toggleShowDeleted.addEventListener("change", applyFilters);
filterSearch.addEventListener("input", debounce(applyFilters, 220));

targetSelect.addEventListener("change", () => pickTarget(targetSelect.value));

targetSearch.addEventListener("input", debounce(() => {
  const q = (targetSearch.value || "").trim().toLowerCase();
  if (!q){
    renderTargetOptions(usersList, selectedOwnerUid);
    return;
  }
  const filtered = usersList.filter(u => {
    const a = String(u.username || "").toLowerCase();
    const b = String(u.displayName || "").toLowerCase();
    return a.includes(q) || b.includes(q);
  });
  renderTargetOptions(filtered, selectedOwnerUid);
}, 220));

btnReload.addEventListener("click", () => {
  applyFilters();
  toast({ title:"Info", message:"Refresh complete." });
});

btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "login.html";
});

/** ---------- Pocket: create pocket ---------- */
btnNewPocket?.addEventListener("click", () => {
  if (!selectedOwnerUid) return toast({ title:"Error", message:"Please select a target first.", type:"err" });
  pocketModalSub.textContent = `Target: ${selectedOwnerLabel || "-"}`;
  pCurrency.value = "";
  pRate.value = "";
  openPocketModal();
});

btnClosePocketModal?.addEventListener("click", closePocketModal);
btnCancelPocketModal?.addEventListener("click", closePocketModal);
pocketModal?.addEventListener("click", (e) => { if (e.target === pocketModal) closePocketModal(); });

btnSavePocket?.addEventListener("click", async () => {
  try{
    if (!selectedOwnerUid) throw new Error("Please select a target first.");

    const cur = String(pCurrency.value || "").trim().toUpperCase();
    const rate = parseRateIDR(pRate.value);

    if (!/^[A-Z]{3}$/.test(cur)) throw new Error("Currency code must be 3 letters (e.g., USD).");
    if (rate <= 0) throw new Error("Rate must be > 0.");
    if (pockets.some(p => p.currency === cur)) throw new Error(`Pocket ${cur} already exists.`);

    await addDoc(collection(db, "pockets"), {
      ownerUid: selectedOwnerUid,
      currency: cur,
      rate,
      balance: 0,
      isActive: true,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid
    });

    toast({ title:"Success", message:`Pocket ${cur} created.` });
    closePocketModal();
  }catch(e){
    toast({ title:"Error", message: e.message || "Failed to create pocket.", type:"err" });
  }
});

/** ---------- FX Convert IDR -> Valas ---------- */
btnFxConvert?.addEventListener("click", () => {
  if (!selectedOwnerUid) return toast({ title:"Error", message:"Please select a target first.", type:"err" });
  if (!pockets.length) return toast({ title:"Error", message:"No pockets found. Please create a pocket first.", type:"err" });

  fxModalSub.textContent = `Target: ${selectedOwnerLabel || "-"}`;
  fxDate.value = toISODateToday();
  fxIdr.value = "";
  fxResult.value = "";
  fxNote.value = "";
  fxRateHint.textContent = "Rate: —";
  fxIdrHint.textContent = `Available IDR Balance: ${kSaldo.textContent || "—"}`;
  openFxModal();
});

btnFxSell?.addEventListener("click", () => {
  if (!selectedOwnerUid) return toast({ title:"Error", message:"Please select a target first.", type:"err" });
  if (!pockets.length) return toast({ title:"Error", message:"No pockets found.", type:"err" });

  fxSellModalSub.textContent = `Target: ${selectedOwnerLabel || "-"}`;
  fxSellDate.value = toISODateToday();
  fxSellAmount.value = "";
  fxSellResult.value = "";
  fxSellNote.value = "";
  fxSellRate.value = "";
  fxSellRateHint.textContent = "Default Pocket Rate: —";
  fxSellBalHint.textContent = "Pocket Balance: —";
  openFxSellModal();
});

btnCloseFxSellModal?.addEventListener("click", closeFxSellModal);
btnCancelFxSellModal?.addEventListener("click", closeFxSellModal);
fxSellModal?.addEventListener("click", (e) => { if (e.target === fxSellModal) closeFxSellModal(); });

function calcFxSellPreview(){
  const pid = fxSellPocket.value;
  const p = pockets.find(x => x.id === pid);
  if (!p){
    fxSellRateHint.textContent = "Rate: —";
    fxSellBalHint.textContent = "Pocket Balance: —";
    fxSellResult.value = "";
    return;
  }

  fxSellRateHint.textContent = `Default Pocket Rate: ${fmtIDR(p.rate)} per 1 ${p.currency}`;
  fxSellBalHint.textContent = `Pocket Balance: ${fmtCurrency(p.currency, p.balance)}`;

  // if sell rate is empty, auto-fill from default pocket
  if (fxSellRate && !String(fxSellRate.value || "").trim()){
    fxSellRate.value = String(p.rate);
  }

  const amt = parseFx2(fxSellAmount.value);
  if (amt <= 0){
    fxSellResult.value = "";
    return;
  }

  const sellRate = parseRateIDR(fxSellRate ? fxSellRate.value : "");
  if (sellRate <= 0){
    fxSellResult.value = "";
    return;
  }

  const idr = amt * sellRate;
  fxSellResult.value = fmtIDR(idr);
}

fxSellPocket?.addEventListener("change", calcFxSellPreview);
fxSellAmount?.addEventListener("input", debounce(calcFxSellPreview, 120));
fxSellRate?.addEventListener("input", debounce(calcFxSellPreview, 120));

btnDoFxSell?.addEventListener("click", async () => {
  try{
    const pid = fxSellPocket.value;
    const p = pockets.find(x => x.id === pid);
    if (!p) throw new Error("Please select a pocket first.");

    const date = fxSellDate.value;
    const amt = parseFx2(fxSellAmount.value);
    const sellRate = parseRateIDR(fxSellRate ? fxSellRate.value : "");
    if (sellRate <= 0) throw new Error("Sell rate must be > 0.");
    const note = (fxSellNote.value || "").trim() || `Converted ${p.currency} → IDR`;

    if (!date) throw new Error("Date is required.");
    if (!Number.isFinite(amt) || amt <= 0) throw new Error(`Amount ${p.currency} must be > 0.`);
    const EPS = 0.0005;
    if (amt > (p.balance + EPS)) throw new Error("Amount exceeds available pocket balance.");

    const idr = Math.round(amt * sellRate); // store IDR as integer rupiah

    // 1) Pocket decreases (record fx_sell)
    await addDoc(collection(db, "pocket_transactions"), {
      ownerUid: selectedOwnerUid,
      pocketId: p.id,
      currency: p.currency,
      date,
      type: "fx_sell",
      amount: amt,
      idrAmount: idr,
      rate: sellRate,
      note,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid,
      isDeleted: false
    });

    // 2) Update pocket balance
    await updateDoc(doc(db, "pockets", p.id), {
      balance: Math.round((p.balance - amt) * 100) / 100,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid
    });

    // 3) IDR increases (record IDR in transaction)
    await addDoc(collection(db, "transactions"), {
      ownerUid: selectedOwnerUid,
      date,
      type: "in",
      amount: idr,
      note: `Conversion result ${p.currency} @ ${fmtIDR(sellRate)} (${note})`,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid,
      isDeleted: false
    });

    toast({ title:"Success", message:`Converted: ${fmtCurrency(p.currency, amt)} → ${fmtIDR(idr)}` });
    closeFxSellModal();
  }catch(e){
    toast({ title:"Error", message: e.message || "Conversion failed.", type:"err" });
  }
});

btnCloseFxModal?.addEventListener("click", closeFxModal);
btnCancelFxModal?.addEventListener("click", closeFxModal);
fxModal?.addEventListener("click", (e) => { if (e.target === fxModal) closeFxModal(); });

function calcFxPreview(){
  const pid = fxPocket.value;
  const p = pockets.find(x => x.id === pid);
  if (!p){
    fxRateHint.textContent = "Rate: —";
    fxResult.value = "";
    return;
  }
  fxRateHint.textContent = `Rate: ${fmtIDR(p.rate)} per 1 ${p.currency}`;

  const idr = Number(String(fxIdr.value || "").replace(/[^\d]/g,"")) || 0;
  if (idr <= 0){
    fxResult.value = "";
    return;
  }
  const fx = idr / p.rate;
  fxResult.value = `${fx.toLocaleString("id-ID", { maximumFractionDigits: 4 })} ${p.currency}`;
}

fxPocket?.addEventListener("change", calcFxPreview);
fxIdr?.addEventListener("input", debounce(calcFxPreview, 120));

btnDoFx?.addEventListener("click", async () => {
  try{
    const pid = fxPocket.value;
    const p = pockets.find(x => x.id === pid);
    if (!p) throw new Error("Please select a pocket first.");

    const date = fxDate.value;
    const idr = Number(String(fxIdr.value || "").replace(/[^\d]/g,"")) || 0;
    const note = (fxNote.value || "").trim() || `Convert IDR → ${p.currency}`;

    if (!date) throw new Error("Date is required.");
    if (idr <= 0) throw new Error("IDR must be > 0.");

    // check available IDR balance from IDR transactions (non-deleted)
    const { bal } = computeIdrKpis(allIdrTx);
    if (idr > bal) throw new Error("Amount exceeds available IDR balance.");

    const fx = Math.round((idr / p.rate) * 100) / 100;

    // 1) create IDR out transaction
    await createIdrTx({
      date,
      type: "out",
      amount: idr,
      note: `Converted to ${p.currency} (${note})`
    });

    // 2) create pocket transaction fx_buy
    await addDoc(collection(db, "pocket_transactions"), {
      ownerUid: selectedOwnerUid,
      pocketId: p.id,
      currency: p.currency,
      date,
      type: "fx_buy",
      amount: fx,
      idrAmount: idr,
      rate: p.rate,
      note,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid,
      isDeleted: false
    });

    // 3) update pocket balance
    await updateDoc(doc(db, "pockets", p.id), {
      balance: Math.round((p.balance + fx) * 100) / 100,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid
    });

    toast({ title:"Success", message:`Converted: ${fmtIDR(idr)} → ${fmtCurrency(p.currency, fx)}` });
    closeFxModal();
  }catch(e){
    toast({ title:"Error", message: e.message || "Conversion failed.", type:"err" });
  }
});

/** ---------- Auth / role guard ---------- */
async function getMyRole(uid){
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return "user";
  return snap.data().role || "user";
}

async function loadUsers(){
  const qUsers = query(collection(db, "users"), where("role", "==", "user"));
  const snap = await getDocs(qUsers);
  usersList = snap.docs.map(d => {
    const x = d.data();
    return { uid: d.id, username: x.username, displayName: x.displayName || "" };
  });
  renderTargetOptions(usersList, selectedOwnerUid);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = "login.html";
  me = user;
  myRole = await getMyRole(user.uid);
  if (myRole !== "admin") return location.href = "user.html";

  const prof = await getDoc(doc(db, "users", user.uid));
  const name = prof.exists() ? (prof.data().displayName || prof.data().username) : "Admin";
  elWho.textContent = `Logged in as: ${name} (Admin)`;

  setSortIcon(sortField);

  try{
    await loadUsers();
    if (usersList.length === 1){
      targetSelect.value = usersList[0].uid;
      pickTarget(usersList[0].uid);
    }
  }catch(e){
    toast({ title:"Error", message: e.message || "Failed to load users.", type:"err" });
  }
});