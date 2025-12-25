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

/* Modal transaksi */
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

/* Confirm delete */
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

/* Pocket modal */
const pocketModal = document.getElementById("pocketModal");
const pocketModalSub = document.getElementById("pocketModalSub");
const btnClosePocketModal = document.getElementById("btnClosePocketModal");
const btnCancelPocketModal = document.getElementById("btnCancelPocketModal");
const btnSavePocket = document.getElementById("btnSavePocket");
const pCurrency = document.getElementById("pCurrency");
const pRate = document.getElementById("pRate");

/* FX modal */
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

/* FX Sell modal */
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
    mCurrencyHint.textContent = "Transaksi IDR (utama).";
  } else {
    amtIDRField.style.display = "none";
    amtFXField.style.display = "";
    const p = pockets.find(x => x.currency === cur);
    const bal = p ? fmtCurrency(cur, p.balance) : "—";
    const rate = p ? fmtIDR(p.rate) : "—";
    mCurrencyHint.textContent = `Pocket ${cur} • Rate ${rate} / 1 • Saldo pocket: ${bal}`;
    mFxHint.textContent = `Masukkan nominal dalam ${cur}.`;
  }
}

mCurrency?.addEventListener("change", onCurrencyChange);

/** ---------- Pocket Cards ---------- */
function renderPockets(){
  if (!selectedOwnerUid){
    pocketWrap.innerHTML = "";
    pocketMeta.textContent = "Pilih target untuk melihat pocket.";
    fxPocket.innerHTML = `<option value="">—</option>`;
    return;
  }
  if (!pockets.length){
    pocketWrap.innerHTML = `<div class="empty" style="grid-column:1/-1;">
      <div class="emoji">💱</div>
      <div class="big">Belum ada pocket</div>
      <div>Tambah pocket dulu (USD/JPY/EUR, dll).</div>
    </div>`;
    pocketMeta.textContent = "—";
    fxPocket.innerHTML = `<option value="">— tidak ada pocket —</option>`;
    return;
  }

  pocketWrap.innerHTML = pockets.map(p => `
    <div class="kpi">
      <div class="k">${escapeHtml(p.currency)} • Rate ${fmtIDR(p.rate)} / 1</div>
      <div class="v">${fmtCurrency(p.currency, p.balance)}</div>
      <div class="muted" style="margin-top:6px;">Pocket aktif</div>
    </div>
  `).join("");

  pocketMeta.textContent = `Total pocket: ${pockets.length}`;
  fxPocket.innerHTML = `<option value="">— Pilih pocket —</option>` + pockets.map(p => (
    `<option value="${p.id}">${escapeHtml(p.currency)} (rate ${p.rate})</option>`
  )).join("");

  fxSellPocket.innerHTML = `<option value="">— Pilih pocket —</option>` + pockets.map(p => (
  `<option value="${p.id}">${escapeHtml(p.currency)} (rate ${p.rate})</option>`
    )).join("");
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
      createdAt: t.createdAt || null
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
      pocketId: t.pocketId,
      rawType: t.type,
      createdAt: t.createdAt || null
    });
  }

  allEvents = events;
}

function rebuildMonthFilterOptions(list){
  const base = list.filter(x => !x.isDeleted);
  const months = buildMonthOptions(base);
  const prev = filterMonth.value;
  filterMonth.innerHTML = `<option value="">Semua</option>` + months.map(m => `<option value="${m}">${m}</option>`).join("");
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

  arr = sortByField(arr, sortField, sortDir);
  viewEvents = arr;

  // KPI IDR always from IDR tx
  const { bal, tin, tout } = computeIdrKpis(allIdrTx);
  kSaldo.textContent = fmtIDR(bal);
  kIn.textContent = fmtIDR(tin);
  kOut.textContent = fmtIDR(tout);

  rebuildMonthFilterOptions(allEvents);

  renderTable();
  meta.textContent = `Target: ${selectedOwnerLabel || "-"} • Terlihat: ${viewEvents.length}`;
}

function renderTable(){
  if (!selectedOwnerUid){
    txBody.innerHTML = `<tr><td colspan="7">
      <div class="empty"><div class="emoji">👆</div><div class="big">Pilih target dulu</div><div>Pilih target dari dropdown.</div></div>
    </td></tr>`;
    return;
  }

  if (!viewEvents.length){
    txBody.innerHTML = `<tr><td colspan="7">
      <div class="empty">
        <div class="emoji">🗂️</div>
        <div class="big">Belum ada histori</div>
        <div>Tambah transaksi IDR, buat pocket, lalu lakukan konversi.</div>
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
    const delBadge = e.isDeleted ? ` <span class="pill" style="border-color: rgba(255,92,124,.35); color:#ffb1c0;">deleted</span>` : "";

    let runTxt = "-";
    if (e.source === "IDR"){
      const v = runMapIdr.get(e.id);
      runTxt = (v === undefined) ? "-" : fmtIDR(v);
    } else {
      const v = runMapPocket.get(`${e.currency}:${e.id}`);
      runTxt = (v === undefined) ? "-" : fmtCurrency(e.currency, v);
    }

    const isLocked = (e.source === "POCKET" && (e.rawType === "fx_buy" || e.rawType === "fx_sell")); // konversi: no edit
    const editBtn = isLocked ? `<button class="btn icon" disabled title="Konversi tidak bisa diedit">🔒</button>` :
      `<button class="btn icon" data-action="edit" data-id="${e.id}" data-source="${e.source}">✏️</button>`;

    const delBtn  = `<button class="btn icon bad" data-action="delete" data-id="${e.id}" data-source="${e.source}">🗑️</button>`;

    const restoreBtn = `<button class="btn icon good" data-action="restore" data-id="${e.id}" data-source="${e.source}">↩</button>`;
    const hardBtn = `<button class="btn icon bad" data-action="hard" data-id="${e.id}" data-source="${e.source}">🔥</button>`;

    const actions = e.isDeleted ? `${restoreBtn}${hardBtn}` : `${editBtn}${delBtn}`;

    return `
      <tr>
        <td data-label="Tanggal">${fmtDate(e.date)}${delBadge}</td>
        <td data-label="Catatan">${escapeHtml(e.note || "")}</td>
        <td class="num" data-label="Nominal">${amt}</td>
        <td data-label="Currency">${escapeHtml(e.currency)}</td>
        <td data-label="Tipe">${typeLabel}</td>
        <td class="num" data-label="Saldo">${runTxt}</td>
        <td class="num" data-label="Aksi"><div class="actions">${actions}</div></td>
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

  targetSelect.innerHTML = `<option value="">— Pilih target —</option>` + sorted.map(u => {
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
  }, (err) => toast({ title:"Gagal load transaksi IDR", message: err.message || "Cek rules.", type:"err" }));

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
  }, (err) => toast({ title:"Gagal load pocket tx", message: err.message || "Cek rules.", type:"err" }));
}

/** ---------- Modal Modes ---------- */
function setModalModeAdd(){
  editingId = null;
  editingSource = null;
  modalTitle.textContent = "Tambah transaksi";
  modalHint.textContent = "IDR masuk/keluar atau transaksi pocket (valas). Konversi IDR→Valas pakai tombol Konversi.";
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
  modalTitle.textContent = "Edit transaksi (IDR)";
  modalHint.textContent = "Perubahan akan mempengaruhi saldo IDR.";
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
  modalTitle.textContent = "Edit transaksi (Pocket)";
  modalHint.textContent = "Tidak untuk record konversi (locked).";
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
  modalTitle.textContent = "Transaksi deleted";
  modalHint.textContent = "Anda bisa restore atau hapus permanen.";
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
  if (!p) throw new Error("Pocket tidak ditemukan.");

  const eff = getPocketEffect(type, amount);
  const nextBal = p.balance + eff;
  if (nextBal < -1e-9) throw new Error("Saldo pocket tidak cukup.");

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
  if (!p) throw new Error("Pocket tidak ditemukan.");

  const oldEff = getPocketEffect(oldTx.type === "fx_buy" ? "in" : oldTx.type, oldTx.amount);
  const newEff = getPocketEffect(type, amount);
  const delta = newEff - oldEff;

  const nextBal = p.balance + delta;
  if (nextBal < -1e-9) throw new Error("Saldo pocket tidak cukup untuk perubahan ini.");

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
  if (!p) throw new Error("Pocket tidak ditemukan.");

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
  if (!p) throw new Error("Pocket tidak ditemukan.");

  const eff = getPocketEffect(tx.type === "fx_buy" ? "in" : tx.type, tx.amount);
  const nextBal = p.balance + eff;
  if (nextBal < -1e-9) throw new Error("Saldo pocket tidak cukup untuk restore.");

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
        toast({ title:"Terkunci", message:"Record konversi tidak bisa diedit.", type:"err" });
        return;
      }
      setModalModeEditPocket(tx);
      openModal();
    }
  }

  if (action === "delete"){
    deletingId = id;
    deletingSource = source;
    confirmText.textContent = `${fmtDate(evt.date)} • ${evt.type === "in" ? "Masuk" : "Keluar"} • ${fmtCurrency(evt.currency, evt.amount)} • ${evt.note}`;
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

/** ---------- Modal buttons ---------- */
btnAdd.addEventListener("click", () => {
  setModalModeAdd();
  openModal();
});

btnSaveModal.addEventListener("click", async () => {
  try{
    btnSaveModal.disabled = true;
    if (!selectedOwnerUid) throw new Error("Pilih target dulu.");

    const date = mDate.value;
    const type = mType.value;
    const note = (mNote.value || "").trim();
    const cur = (mCurrency.value || "IDR").toUpperCase();

    if (!date) throw new Error("Tanggal wajib diisi.");
    if (!(type === "in" || type === "out")) throw new Error("Tipe tidak valid.");
    if (!note) throw new Error("Catatan wajib diisi.");

    if (cur === "IDR"){
      const amount = getMoneyRaw(mAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Nominal IDR harus > 0.");

      if (!editingId){
        await createIdrTx({ date, type, amount, note });
        toast({ title:"Sukses", message:"Transaksi IDR ditambahkan." });
      } else {
        await updateIdrTx(editingId, { date, type, amount, note });
        toast({ title:"Sukses", message:"Transaksi IDR diperbarui." });
      }

    } else {
      const p = getPocketByCurrency(cur);
      if (!p) throw new Error("Pocket tidak ditemukan. Buat pocket dulu.");
      const amount = Number(String(mAmountFX.value || "").replace(",", ".")) || 0;
      if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Nominal ${cur} harus > 0.`);

      if (!editingId){
        await createPocketTx({ pocketId: p.id, currency: cur, date, type, amount, note });
        toast({ title:"Sukses", message:`Transaksi pocket ${cur} ditambahkan.` });
      } else {
        const old = allPocketTx.find(x => x.id === editingId);
        if (!old) throw new Error("Data pocket tx tidak ditemukan.");
        await updatePocketTx(editingId, old, { date, type, amount, note });
        toast({ title:"Sukses", message:`Transaksi pocket ${cur} diperbarui.` });
      }
    }

    closeModal();
  }catch(e){
    toast({ title:"Gagal", message: e.message || "Operasi gagal.", type:"err" });
  }finally{
    btnSaveModal.disabled = false;
  }
});

btnRestore.addEventListener("click", async () => {
  try{
    btnRestore.disabled = true;
    if (!editingId || !editingSource) return;

    const evt = allEvents.find(x => x.id === editingId && x.source === editingSource);
    if (!evt) throw new Error("Data tidak ditemukan.");

    if (editingSource === "IDR"){
      await restoreIdr(editingId);
    } else {
      const tx = allPocketTx.find(x => x.id === editingId);
      if (!tx) throw new Error("Pocket tx tidak ditemukan.");
      await restorePocket(editingId, tx);
    }

    toast({ title:"Sukses", message:"Berhasil restore." });
    closeModal();
  }catch(e){
    toast({ title:"Gagal", message: e.message || "Restore gagal.", type:"err" });
  }finally{
    btnRestore.disabled = false;
  }
});

btnHardDelete.addEventListener("click", async () => {
  const ok = confirm("Hapus PERMANEN? Tidak bisa dibatalkan.");
  if (!ok) return;
  try{
    btnHardDelete.disabled = true;
    if (!editingId || !editingSource) return;

    const evt = allEvents.find(x => x.id === editingId && x.source === editingSource);
    if (!evt) throw new Error("Data tidak ditemukan.");
    if (!evt.isDeleted){
      throw new Error("Hard delete hanya untuk data yang sudah deleted (soft).");
    }

    if (editingSource === "IDR"){
      await hardDeleteIdr(editingId);
    } else {
      await hardDeletePocket(editingId);
    }

    toast({ title:"Sukses", message:"Hapus permanen berhasil." });
    closeModal();
  }catch(e){
    toast({ title:"Gagal", message: e.message || "Delete permanen gagal.", type:"err" });
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
      if (!tx) throw new Error("Pocket tx tidak ditemukan.");
      await softDeletePocket(deletingId, tx);
    }

    toast({ title:"Sukses", message:"Transaksi dihapus (soft)." });
    closeConfirm();
  }catch(e){
    toast({ title:"Gagal", message: e.message || "Hapus gagal.", type:"err" });
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
  toast({ title:"Info", message:"Re-render selesai." });
});

btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "login.html";
});

/** ---------- Pocket: create pocket ---------- */
btnNewPocket?.addEventListener("click", () => {
  if (!selectedOwnerUid) return toast({ title:"Gagal", message:"Pilih target dulu.", type:"err" });
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
    if (!selectedOwnerUid) throw new Error("Pilih target dulu.");

    const cur = String(pCurrency.value || "").trim().toUpperCase();
    const rate = Number(String(pRate.value || "").replace(/[^\d.]/g,"")) || 0;

    if (!/^[A-Z]{3}$/.test(cur)) throw new Error("Currency code harus 3 huruf, contoh USD.");
    if (rate <= 0) throw new Error("Rate harus > 0.");
    if (pockets.some(p => p.currency === cur)) throw new Error(`Pocket ${cur} sudah ada.`);

    await addDoc(collection(db, "pockets"), {
      ownerUid: selectedOwnerUid,
      currency: cur,
      rate,
      balance: 0,
      isActive: true,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid
    });

    toast({ title:"Sukses", message:`Pocket ${cur} dibuat.` });
    closePocketModal();
  }catch(e){
    toast({ title:"Gagal", message: e.message || "Gagal membuat pocket.", type:"err" });
  }
});

/** ---------- FX Convert IDR -> Valas ---------- */
btnFxConvert?.addEventListener("click", () => {
  if (!selectedOwnerUid) return toast({ title:"Gagal", message:"Pilih target dulu.", type:"err" });
  if (!pockets.length) return toast({ title:"Gagal", message:"Belum ada pocket. Buat pocket dulu.", type:"err" });

  fxModalSub.textContent = `Target: ${selectedOwnerLabel || "-"}`;
  fxDate.value = toISODateToday();
  fxIdr.value = "";
  fxResult.value = "";
  fxNote.value = "";
  fxRateHint.textContent = "Rate: —";
  fxIdrHint.textContent = `Saldo IDR tersedia: ${kSaldo.textContent || "—"}`;
  openFxModal();
});

btnFxSell?.addEventListener("click", () => {
  if (!selectedOwnerUid) return toast({ title:"Gagal", message:"Pilih target dulu.", type:"err" });
  if (!pockets.length) return toast({ title:"Gagal", message:"Belum ada pocket.", type:"err" });

  fxSellModalSub.textContent = `Target: ${selectedOwnerLabel || "-"}`;
  fxSellDate.value = toISODateToday();
  fxSellAmount.value = "";
  fxSellResult.value = "";
  fxSellNote.value = "";
  fxSellRateHint.textContent = "Rate: —";
  fxSellBalHint.textContent = "Saldo pocket: —";
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
    fxSellBalHint.textContent = "Saldo pocket: —";
    fxSellResult.value = "";
    return;
  }

  fxSellRateHint.textContent = `Rate: ${fmtIDR(p.rate)} per 1 ${p.currency}`;
  fxSellBalHint.textContent = `Saldo pocket: ${fmtCurrency(p.currency, p.balance)}`;

  const amt = Number(String(fxSellAmount.value || "").replace(",", ".")) || 0;
  if (amt <= 0){
    fxSellResult.value = "";
    return;
  }

  const idr = amt * p.rate;
  fxSellResult.value = fmtIDR(idr);
}

fxSellPocket?.addEventListener("change", calcFxSellPreview);
fxSellAmount?.addEventListener("input", debounce(calcFxSellPreview, 120));

btnDoFxSell?.addEventListener("click", async () => {
  try{
    const pid = fxSellPocket.value;
    const p = pockets.find(x => x.id === pid);
    if (!p) throw new Error("Pilih pocket dulu.");

    const date = fxSellDate.value;
    const amt = Number(String(fxSellAmount.value || "").replace(",", ".")) || 0;
    const note = (fxSellNote.value || "").trim() || `Konversi ${p.currency} → IDR`;

    if (!date) throw new Error("Tanggal wajib.");
    if (!Number.isFinite(amt) || amt <= 0) throw new Error(`Nominal ${p.currency} harus > 0.`);
    if (amt > p.balance + 1e-9) throw new Error("Nominal melebihi saldo pocket yang tersedia.");

    const idr = amt * p.rate;

    // 1) Pocket berkurang (catat fx_sell)
    await addDoc(collection(db, "pocket_transactions"), {
      ownerUid: selectedOwnerUid,
      pocketId: p.id,
      currency: p.currency,
      date,
      type: "fx_sell",
      amount: amt,
      idrAmount: idr,
      rate: p.rate,
      note,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid,
      isDeleted: false
    });

    // 2) Update saldo pocket
    await updateDoc(doc(db, "pockets", p.id), {
      balance: p.balance - amt,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid
    });

    // 3) IDR bertambah (catat transaksi IDR in)
    await addDoc(collection(db, "transactions"), {
      ownerUid: selectedOwnerUid,
      date,
      type: "in",
      amount: idr,
      note: `Hasil konversi ${p.currency} (${note})`,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid,
      isDeleted: false
    });

    toast({ title:"Sukses", message:`Konversi: ${fmtCurrency(p.currency, amt)} → ${fmtIDR(idr)}` });
    closeFxSellModal();
  }catch(e){
    toast({ title:"Gagal", message: e.message || "Konversi gagal.", type:"err" });
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
    if (!p) throw new Error("Pilih pocket dulu.");

    const date = fxDate.value;
    const idr = Number(String(fxIdr.value || "").replace(/[^\d]/g,"")) || 0;
    const note = (fxNote.value || "").trim() || `Konversi IDR → ${p.currency}`;

    if (!date) throw new Error("Tanggal wajib.");
    if (idr <= 0) throw new Error("IDR harus > 0.");

    // cek saldo IDR tersedia dari transaksi IDR (non-deleted)
    const { bal } = computeIdrKpis(allIdrTx);
    if (idr > bal) throw new Error("Nominal melebihi saldo IDR yang tersedia.");

    const fx = idr / p.rate;

    // 1) buat transaksi IDR out
    await createIdrTx({
      date,
      type: "out",
      amount: idr,
      note: `Konversi ke ${p.currency} (${note})`
    });

    // 2) buat pocket transaction fx_buy
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
      balance: p.balance + fx,
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid
    });

    toast({ title:"Sukses", message:`Konversi: ${fmtIDR(idr)} → ${fmtCurrency(p.currency, fx)}` });
    closeFxModal();
  }catch(e){
    toast({ title:"Gagal", message: e.message || "Konversi gagal.", type:"err" });
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
  elWho.textContent = `Login sebagai: ${name} (admin)`;

  setSortIcon(sortField);

  try{
    await loadUsers();
    if (usersList.length === 1){
      targetSelect.value = usersList[0].uid;
      pickTarget(usersList[0].uid);
    }
  }catch(e){
    toast({ title:"Gagal", message: e.message || "Gagal memuat user.", type:"err" });
  }
});