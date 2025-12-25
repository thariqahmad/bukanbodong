import { auth, db, fmtIDR, fmtDate, escapeHtml } from "./common.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection, query, where, getDocs, addDoc, serverTimestamp,
  orderBy, getDoc, doc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const elWho = document.getElementById("who");
const elMsg = document.getElementById("msg");
const elTxBody = document.getElementById("txBody");
const elBalance = document.getElementById("balance");
const elSumIn = document.getElementById("sumIn");
const elSumOut = document.getElementById("sumOut");
const elStatus = document.getElementById("status");

function setMsg(t, cls=""){ elMsg.className = "toast " + cls; elMsg.textContent = t; }
function setStatus(t){ elStatus.textContent = t; }

async function getRole(uid){
  const s = await getDoc(doc(db, "users", uid));
  return s.exists() ? s.data().role : "user";
}

async function findUserUidByUsername(username){
  const q1 = query(collection(db, "users"), where("username", "==", username));
  const snap = await getDocs(q1);
  if (snap.empty) return null;
  return snap.docs[0].id;
}

async function loadTx(ownerUid){
  const qx = query(
    collection(db, "transactions"),
    where("ownerUid", "==", ownerUid),
    orderBy("date", "asc")
  );
  const snap = await getDocs(qx);
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

function renderTx(txs){
  let bal=0, sumIn=0, sumOut=0;
  const rows = txs.map(t => {
    const amt = Number(t.amount);
    if (t.type === "in"){ bal += amt; sumIn += amt; }
    else { bal -= amt; sumOut += amt; }

    const inCol = t.type === "in" ? `<span class="good">${fmtIDR(amt)}</span>` : "—";
    const outCol = t.type === "out" ? `<span class="bad">${fmtIDR(amt)}</span>` : "—";

    return `<tr>
      <td>${fmtDate(t.date)}</td>
      <td>${escapeHtml(t.note)}</td>
      <td class="right">${inCol}</td>
      <td class="right">${outCol}</td>
      <td class="right">${fmtIDR(bal)}</td>
    </tr>`;
  });

  elTxBody.innerHTML = rows.length ? rows.join("") : `<tr><td colspan="5">Belum ada transaksi.</td></tr>`;
  elBalance.textContent = fmtIDR(bal);
  elSumIn.textContent = `Masuk: ${fmtIDR(sumIn)}`;
  elSumOut.textContent = `Keluar: ${fmtIDR(sumOut)}`;
}

async function refreshTable(){
  const targetUsername = document.getElementById("targetUsername").value.trim();
  if (!targetUsername) return setMsg("Isi username target dulu.", "err");

  setStatus("Memuat…");
  const ownerUid = await findUserUidByUsername(targetUsername);
  if (!ownerUid){ setStatus("User tidak ditemukan"); return setMsg("Username target tidak ditemukan.", "err"); }

  const txs = await loadTx(ownerUid);
  renderTx(txs);
  setStatus(`Target: ${targetUsername} • ${txs.length} transaksi`);
  setMsg("Tabel diperbarui.", "ok");
}

document.getElementById("btnAdd").addEventListener("click", async () => {
  try{
    const targetUsername = document.getElementById("targetUsername").value.trim();
    const date = document.getElementById("date").value;
    const type = document.getElementById("type").value;
    const amount = Number(document.getElementById("amount").value);
    const note = document.getElementById("note").value.trim();

    if (!targetUsername) return setMsg("Isi username target.", "err");
    if (!date) return setMsg("Isi tanggal.", "err");
    if (!Number.isFinite(amount) || amount <= 0) return setMsg("Nominal harus angka > 0.", "err");

    setMsg("Menyimpan…");

    const ownerUid = await findUserUidByUsername(targetUsername);
    if (!ownerUid) return setMsg("Username target tidak ditemukan.", "err");

    await addDoc(collection(db, "transactions"), {
      ownerUid, date, type, amount, note,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid
    });

    setMsg("Transaksi tersimpan.", "ok");
    await refreshTable();
  }catch(e){
    setMsg("Gagal: " + e.message, "err");
  }
});

document.getElementById("btnRefresh").addEventListener("click", refreshTable);
document.getElementById("btnLogout").addEventListener("click", async () => {
  await signOut(auth);
  location.href = "login.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = "login.html";
  const role = await getRole(user.uid);
  if (role !== "admin") return location.href = "user.html";
  const profile = await getDoc(doc(db, "users", user.uid));
  elWho.textContent = profile.exists() ? `Login sebagai: ${profile.data().username} (admin)` : "Admin";

  // default tanggal hari ini
  document.getElementById("date").value = new Date().toISOString().slice(0,10);
});