import { auth, db, fmtIDR, fmtDate, escapeHtml } from "./common.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const elWho = document.getElementById("who");
const elTxBody = document.getElementById("txBody");
const elBalance = document.getElementById("balance");
const elSumIn = document.getElementById("sumIn");
const elSumOut = document.getElementById("sumOut");
const elStatus = document.getElementById("status");
const adminLink = document.getElementById("adminLink");

async function loadMyTx(uid){
  const qx = query(
    collection(db, "transactions"),
    where("ownerUid", "==", uid),
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
  elStatus.textContent = `Total transaksi: ${txs.length}`;
}

async function refresh(uid){
  elStatus.textContent = "Memuat…";
  const txs = await loadMyTx(uid);
  renderTx(txs);
}

document.getElementById("btnRefresh").addEventListener("click", () => {
  if (auth.currentUser) refresh(auth.currentUser.uid);
});

document.getElementById("btnLogout").addEventListener("click", async () => {
  await signOut(auth);
  location.href = "login.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = "login.html";

  const prof = await getDoc(doc(db, "users", user.uid));
  if (prof.exists()){
    elWho.textContent = `Halo, ${prof.data().username}`;
    if (prof.data().role === "admin") adminLink.style.display = "inline-flex";
  }

  await refresh(user.uid);
});