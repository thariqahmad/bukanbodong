// admin.js (ES module)
import {
  auth, db, fmtIDR, fmtDate, monthKeyFromDateISO, buildMonthOptions,
  debounce, toast, attachMoneyMask, getMoneyRaw, escapeHtml, sortByField
} from "./common.js";

import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection, doc, getDoc, getDocs, query, where,
  onSnapshot, updateDoc, addDoc, deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/** --- Elements --- */
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

const txModal = document.getElementById("txModal");
const confirmModal = document.getElementById("confirmModal");

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
const mAmount = document.getElementById("mAmount");
const mNote = document.getElementById("mNote");

const btnCloseConfirm = document.getElementById("btnCloseConfirm");
const btnCancelConfirm = document.getElementById("btnCancelConfirm");
const btnDoDelete = document.getElementById("btnDoDelete");
const confirmText = document.getElementById("confirmText");
const confirmCheck = document.getElementById("confirmCheck");

/** --- State --- */
let me = null;
let myRole = "user";
let usersList = []; // {uid, username, displayName}
let selectedOwnerUid = "";
let selectedOwnerLabel = "";

let unsubTx = null;
let allTx = [];       // raw from firestore
let viewTx = [];      // filtered + sorted

let sortField = "date";
let sortDir = "desc";

let editingTxId = null;
let deletingTxId = null;

attachMoneyMask(mAmount);

/** --- Helpers --- */
function openModal(){
  txModal.classList.add("open");
}
function closeModal(){
  txModal.classList.remove("open");
  editingTxId = null;
}
function openConfirm(){
  confirmModal.classList.add("open");
}
function closeConfirm(){
  confirmModal.classList.remove("open");
  deletingTxId = null;
  confirmCheck.checked = false;
  btnDoDelete.disabled = true;
}

function setSortIcon(field){
  const map = ["date","note","amount","type"];
  for (const f of map){
    const el = document.getElementById(`si_${f}`);
    if (!el) continue;
    el.textContent = "↕";
  }
  const el = document.getElementById(`si_${field}`);
  if (el) el.textContent = sortDir === "asc" ? "↑" : "↓";
}

function computeKpis(txs){
  let bal = 0, tin = 0, tout = 0;
  for (const t of txs){
    if (t.type === "in"){ bal += t.amount; tin += t.amount; }
    else { bal -= t.amount; tout += t.amount; }
  }
  return { bal, tin, tout };
}

function rebuildMonthFilterOptions(txs){
  const months = buildMonthOptions(txs);
  const prev = filterMonth.value;

  filterMonth.innerHTML = `<option value="">Semua</option>` + months.map(m => `<option value="${m}">${m}</option>`).join("");
  // keep selection if still exists
  if (months.includes(prev)) filterMonth.value = prev;
}

function applyFilters(){
  const month = filterMonth.value;
  const type = filterType.value;
  const q = (filterSearch.value || "").trim().toLowerCase();
  const showDeleted = toggleShowDeleted.checked;

  let arr = [...allTx];

  // soft delete visibility
  if (!showDeleted){
    arr = arr.filter(t => !t.isDeleted);
  }

  if (month){
    arr = arr.filter(t => monthKeyFromDateISO(t.date) === month);
  }
  if (type){
    arr = arr.filter(t => t.type === type);
  }
  if (q){
    arr = arr.filter(t => String(t.note || "").toLowerCase().includes(q));
  }

  // sort (client-side)
  arr = sortByField(arr, sortField, sortDir);

  viewTx = arr;

  // KPI should reflect visible non-deleted, but not necessarily filter? (lebih masuk akal: KPI seluruh non-deleted milik target)
  const kpiBase = toggleShowDeleted.checked ? allTx.filter(t => !t.isDeleted) : allTx.filter(t => !t.isDeleted);
  const { bal, tin, tout } = computeKpis(kpiBase);

  kSaldo.textContent = fmtIDR(bal);
  kIn.textContent = fmtIDR(tin);
  kOut.textContent = fmtIDR(tout);

  rebuildMonthFilterOptions(allTx.filter(t => !t.isDeleted));

  renderTable();
  meta.textContent = `Target: ${selectedOwnerLabel || "-"} • Total (terlihat): ${viewTx.length} • Total (non-deleted): ${kpiBase.length}`;
}

function renderTable(){
  if (!selectedOwnerUid){
    txBody.innerHTML = `<tr><td colspan="6">
      <div class="empty"><div class="emoji">👆</div><div class="big">Pilih target dulu</div><div>Pilih target dari dropdown untuk melihat transaksi.</div></div>
    </td></tr>`;
    return;
  }

  if (!viewTx.length){
    txBody.innerHTML = `<tr><td colspan="6">
      <div class="empty">
        <div class="emoji">🗂️</div>
        <div class="big">Belum ada transaksi</div>
        <div>Tambahkan transaksi pertama untuk mulai menghitung saldo.</div>
      </div>
    </td></tr>`;
    return;
  }

  let running = 0;
  // Running balance harus sesuai urutan date asc. Kalau viewTx sorted desc, running bukan “timeline”.
  // Solusi: hitung running dari data non-deleted urut ASC, lalu tampilkan running sesuai txId.
  const baseAsc = allTx.filter(t => !t.isDeleted).slice().sort((a,b)=> String(a.date||"").localeCompare(String(b.date||"")));
  const runningMap = new Map();
  for (const t of baseAsc){
    running += (t.type === "in" ? t.amount : -t.amount);
    runningMap.set(t.id, running);
  }

  txBody.innerHTML = viewTx.map(t => {
    const amount = t.amount || 0;
    const amt = t.type === "in"
      ? `<span class="moneyIn">${fmtIDR(amount)}</span>`
      : `<span class="moneyOut">${fmtIDR(amount)}</span>`;

    const typeLabel = t.type === "in" ? "Masuk" : "Keluar";
    const delBadge = t.isDeleted ? ` <span class="pill" style="border-color: rgba(255,92,124,.35); color:#ffb1c0;">deleted</span>` : "";
    const runBal = runningMap.get(t.id);
    const runTxt = (runBal === undefined) ? "-" : fmtIDR(runBal);

    const editBtn = `<button class="btn icon" data-action="edit" data-id="${t.id}">✏️</button>`;
    const delBtn  = `<button class="btn icon bad" data-action="delete" data-id="${t.id}">🗑️</button>`;

    const restoreBtn = `<button class="btn icon good" data-action="restore" data-id="${t.id}">↩</button>`;
    const hardBtn = `<button class="btn icon bad" data-action="hard" data-id="${t.id}">🔥</button>`;

    const actions = t.isDeleted
      ? `${restoreBtn}${hardBtn}`
      : `${editBtn}${delBtn}`;

    return `
      <tr>
        <td data-label="Tanggal">${fmtDate(t.date)}${delBadge}</td>
        <td data-label="Catatan">${escapeHtml(t.note || "")}</td>
        <td class="num" data-label="Nominal">${amt}</td>
        <td data-label="Tipe">${typeLabel}</td>
        <td class="num" data-label="Saldo">${runTxt}</td>
        <td class="num" data-label="Aksi"><div class="actions">${actions}</div></td>
      </tr>
    `;
  }).join("");
}

/** --- Users dropdown --- */
function renderTargetOptions(list, keepUid=""){
  // sort by displayName/username client-side
  const sorted = [...list].sort((a,b) => {
    const A = String(a.displayName || a.username || "");
    const B = String(b.displayName || b.username || "");
    return A.localeCompare(B);
  });

  targetSelect.innerHTML = `<option value="">— Pilih target —</option>` + sorted.map(u => {
    const label = u.displayName ? `${u.displayName} (${u.username})` : u.username;
    return `<option value="${u.uid}">${escapeHtml(label)}</option>`;
  }).join("");

  if (keepUid){
    targetSelect.value = keepUid;
  }
}

function pickTarget(uid){
  selectedOwnerUid = uid || "";
  const u = usersList.find(x => x.uid === uid);
  selectedOwnerLabel = u ? (u.displayName ? `${u.displayName} (${u.username})` : u.username) : "";
  modalSub.textContent = selectedOwnerLabel ? `Target: ${selectedOwnerLabel}` : "—";

  // stop previous listener
  if (unsubTx) unsubTx();

  allTx = [];
  viewTx = [];
  applyFilters();

  if (!selectedOwnerUid) return;

  // Realtime listener: filter by ownerUid only (avoid composite indexes)
  const qTx = query(collection(db, "transactions"), where("ownerUid", "==", selectedOwnerUid));
  unsubTx = onSnapshot(qTx, (snap) => {
    allTx = snap.docs.map(d => {
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
        deletedAt: data.deletedAt || null,
        deletedBy: data.deletedBy || null
      };
    });

    // Default sort: date desc
    applyFilters();
  }, (err) => {
    toast({ title:"Gagal load transaksi", message: err.message || "Cek rules/index.", type:"err" });
  });
}

/** --- CRUD ops --- */
function setModalModeAdd(){
  editingTxId = null;
  modalTitle.textContent = "Tambah transaksi";
  modalHint.textContent = "Tip: Nominal otomatis diformat Rupiah. Data tersimpan sebagai angka.";
  btnRestore.style.display = "none";
  btnHardDelete.style.display = "none";
  btnSaveModal.style.display = "inline-flex";

  const today = new Date().toISOString().slice(0,10);
  mDate.value = today;
  mType.value = "in";
  mAmount.value = "";
  mAmount.dataset.raw = "0";
  mNote.value = "";
}

function setModalModeEdit(tx){
  editingTxId = tx.id;
  modalTitle.textContent = "Edit transaksi";
  modalHint.textContent = "Perubahan akan terlihat realtime di mode user.";
  btnRestore.style.display = "none";
  btnHardDelete.style.display = "none";
  btnSaveModal.style.display = "inline-flex";

  mDate.value = tx.date || new Date().toISOString().slice(0,10);
  mType.value = tx.type || "in";
  mAmount.value = String(tx.amount || "");
  mAmount.dataset.raw = String(tx.amount || 0);
  // reformat after setting
  mAmount.dispatchEvent(new Event("blur"));
  mNote.value = tx.note || "";
}

function setModalModeDeleted(tx){
  editingTxId = tx.id;
  modalTitle.textContent = "Transaksi deleted";
  modalHint.textContent = "Anda bisa restore atau hapus permanen.";
  btnRestore.style.display = "inline-flex";
  btnHardDelete.style.display = "inline-flex";
  btnSaveModal.style.display = "none";

  mDate.value = tx.date || "";
  mType.value = tx.type || "in";
  mAmount.value = String(tx.amount || "");
  mAmount.dataset.raw = String(tx.amount || 0);
  mAmount.dispatchEvent(new Event("blur"));
  mNote.value = tx.note || "";

  // lock fields
  mDate.disabled = true;
  mType.disabled = true;
  mAmount.disabled = true;
  mNote.disabled = true;
}

function unlockModalFields(){
  mDate.disabled = false;
  mType.disabled = false;
  mAmount.disabled = false;
  mNote.disabled = false;
}

async function doCreate(){
  if (!selectedOwnerUid) return toast({ title:"Gagal", message:"Pilih target dulu.", type:"err" });

  const date = mDate.value;
  const type = mType.value;
  const amount = getMoneyRaw(mAmount);
  const note = (mNote.value || "").trim();

  if (!date) return toast({ title:"Validasi", message:"Tanggal wajib diisi.", type:"err" });
  if (!(type === "in" || type === "out")) return toast({ title:"Validasi", message:"Tipe tidak valid.", type:"err" });
  if (!Number.isFinite(amount) || amount <= 0) return toast({ title:"Validasi", message:"Nominal harus > 0.", type:"err" });
  if (!note) return toast({ title:"Validasi", message:"Catatan sebaiknya diisi (mis: uang makan).", type:"err" });

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

  toast({ title:"Sukses", message:"Transaksi ditambahkan." });
  closeModal();
}

async function doUpdate(){
  const id = editingTxId;
  if (!id) return;

  const date = mDate.value;
  const type = mType.value;
  const amount = getMoneyRaw(mAmount);
  const note = (mNote.value || "").trim();

  if (!date) return toast({ title:"Validasi", message:"Tanggal wajib diisi.", type:"err" });
  if (!(type === "in" || type === "out")) return toast({ title:"Validasi", message:"Tipe tidak valid.", type:"err" });
  if (!Number.isFinite(amount) || amount <= 0) return toast({ title:"Validasi", message:"Nominal harus > 0.", type:"err" });
  if (!note) return toast({ title:"Validasi", message:"Catatan sebaiknya diisi.", type:"err" });

  await updateDoc(doc(db, "transactions", id), {
    date, type, amount, note,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid
  });

  toast({ title:"Sukses", message:"Transaksi diperbarui." });
  closeModal();
}

async function doSoftDelete(){
  if (!deletingTxId) return;
  await updateDoc(doc(db, "transactions", deletingTxId), {
    isDeleted: true,
    deletedAt: serverTimestamp(),
    deletedBy: auth.currentUser.uid
  });
  toast({ title:"Sukses", message:"Transaksi dihapus (soft). Bisa restore." });
  closeConfirm();
}

async function doRestore(id){
  await updateDoc(doc(db, "transactions", id), {
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    restoredAt: serverTimestamp(),
    restoredBy: auth.currentUser.uid
  });
  toast({ title:"Sukses", message:"Transaksi di-restore." });
  closeModal();
  unlockModalFields();
}

async function doHardDelete(id){
  await deleteDoc(doc(db, "transactions", id));
  toast({ title:"Sukses", message:"Transaksi dihapus permanen." });
  closeModal();
  unlockModalFields();
}

/** --- Sorting header click --- */
document.querySelectorAll("th.sortable").forEach(th => {
  th.addEventListener("click", () => {
    const f = th.dataset.sort;
    if (!f) return;
    if (sortField === f){
      sortDir = (sortDir === "asc") ? "desc" : "asc";
    } else {
      sortField = f;
      sortDir = (f === "date") ? "desc" : "asc";
    }
    setSortIcon(sortField);
    applyFilters();
  });
});

/** --- Table actions (event delegation) --- */
txBody.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const tx = allTx.find(x => x.id === id);
  if (!tx) return;

  if (action === "edit"){
    unlockModalFields();
    setModalModeEdit(tx);
    openModal();
  }
  if (action === "delete"){
    deletingTxId = id;
    confirmText.textContent = `${fmtDate(tx.date)} • ${tx.type === "in" ? "Masuk" : "Keluar"} • ${fmtIDR(tx.amount)} • ${tx.note}`;
    openConfirm();
  }
  if (action === "restore"){
    unlockModalFields();
    setModalModeDeleted(tx);
    openModal();
  }
  if (action === "hard"){
    unlockModalFields();
    setModalModeDeleted(tx);
    openModal();
  }
});

/** --- Modal buttons --- */
btnAdd.addEventListener("click", () => {
  unlockModalFields();
  setModalModeAdd();
  openModal();
});

btnSaveModal.addEventListener("click", async () => {
  try{
    btnSaveModal.disabled = true;
    if (!editingTxId) await doCreate();
    else await doUpdate();
  }catch(e){
    toast({ title:"Gagal", message: e.message || "Operasi gagal.", type:"err" });
  }finally{
    btnSaveModal.disabled = false;
  }
});

btnRestore.addEventListener("click", async () => {
  try{
    btnRestore.disabled = true;
    await doRestore(editingTxId);
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
    await doHardDelete(editingTxId);
  }catch(e){
    toast({ title:"Gagal", message: e.message || "Delete permanen gagal.", type:"err" });
  }finally{
    btnHardDelete.disabled = false;
  }
});

btnCloseModal.addEventListener("click", () => { closeModal(); unlockModalFields(); });
btnCancelModal.addEventListener("click", () => { closeModal(); unlockModalFields(); });

txModal.addEventListener("click", (e) => {
  if (e.target === txModal) { closeModal(); unlockModalFields(); }
});

/** --- Confirm modal --- */
confirmCheck.addEventListener("change", () => {
  btnDoDelete.disabled = !confirmCheck.checked;
});
btnDoDelete.addEventListener("click", async () => {
  try{
    btnDoDelete.disabled = true;
    await doSoftDelete();
  }catch(e){
    toast({ title:"Gagal", message: e.message || "Hapus gagal.", type:"err" });
  }finally{
    btnDoDelete.disabled = !confirmCheck.checked;
  }
});

btnCloseConfirm.addEventListener("click", closeConfirm);
btnCancelConfirm.addEventListener("click", closeConfirm);
confirmModal.addEventListener("click", (e) => {
  if (e.target === confirmModal) closeConfirm();
});

/** --- Filters --- */
filterMonth.addEventListener("change", applyFilters);
filterType.addEventListener("change", applyFilters);
toggleShowDeleted.addEventListener("change", applyFilters);
filterSearch.addEventListener("input", debounce(applyFilters, 220));

/** --- Target dropdown & search --- */
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
  // force re-apply filters / render; realtime already
  applyFilters();
  toast({ title:"Info", message:"Tabel di-refresh (re-render)." });
});

btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "login.html";
});

/** --- Auth / role guard --- */
async function getMyRole(uid){
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return "user";
  return snap.data().role || "user";
}

async function loadUsers(){
  // list all users with role 'user'
  const qUsers = query(collection(db, "users"), where("role", "==", "user"));
  const snap = await getDocs(qUsers);
  usersList = snap.docs.map(d => {
    const x = d.data();
    return {
      uid: d.id,
      username: x.username,
      displayName: x.displayName || ""
    };
  });
  renderTargetOptions(usersList, selectedOwnerUid);
}

function showSkeleton(){
  txBody.innerHTML = `<tr><td colspan="6">
    <div style="padding: 12px;">
      <div class="skeleton skelLine" style="width: 65%"></div>
      <div class="skeleton skelLine" style="width: 92%"></div>
      <div class="skeleton skelLine" style="width: 86%"></div>
    </div>
  </td></tr>`;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = "login.html";
  me = user;
  myRole = await getMyRole(user.uid);

  if (myRole !== "admin") return location.href = "user.html";

  const prof = await getDoc(doc(db, "users", user.uid));
  const name = prof.exists() ? (prof.data().displayName || prof.data().username) : "Admin";
  elWho.textContent = `Login sebagai: ${name} (admin)`;

  showSkeleton();
  setSortIcon(sortField);

  try{
    await loadUsers();
    // if only one user, auto-select
    if (usersList.length === 1){
      targetSelect.value = usersList[0].uid;
      pickTarget(usersList[0].uid);
    }
  }catch(e){
    toast({ title:"Gagal", message: e.message || "Gagal memuat daftar user.", type:"err" });
  }
});
