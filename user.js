// user.js (ES module)
import {
  auth, db, fmtIDR, fmtDate, monthKeyFromDateISO, buildMonthOptions,
  debounce, toast, escapeHtml, sortByField
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

let allTx = [];  // non-deleted only from view
let rawTx = [];  // includes deleted (but user will filter out)
let unsub = null;

let sortField = "date";
let sortDir = "desc";

function setSortIcon(field){
  const map = ["date","note","amount","type"];
  for (const f of map){
    const el = document.getElementById(`si_${f}`);
    if (el) el.textContent = "↕";
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

function rebuildMonthOptions(txs){
  const months = buildMonthOptions(txs);
  const prev = filterMonth.value;
  filterMonth.innerHTML = `<option value="">Semua</option>` + months.map(m => `<option value="${m}">${m}</option>`).join("");
  if (months.includes(prev)) filterMonth.value = prev;
}

function applyFilters(){
  // user: hide deleted always
  allTx = rawTx.filter(t => !t.isDeleted);

  rebuildMonthOptions(allTx);

  const month = filterMonth.value;
  const type = filterType.value;
  const q = (filterSearch.value || "").trim().toLowerCase();

  let view = [...allTx];

  if (month){
    view = view.filter(t => monthKeyFromDateISO(t.date) === month);
  }
  if (type){
    view = view.filter(t => t.type === type);
  }
  if (q){
    view = view.filter(t => String(t.note || "").toLowerCase().includes(q));
  }

  view = sortByField(view, sortField, sortDir);

  // KPI based on all non-deleted
  const { bal, tin, tout } = computeKpis(allTx);
  kSaldo.textContent = fmtIDR(bal);
  kIn.textContent = fmtIDR(tin);
  kOut.textContent = fmtIDR(tout);

  renderTable(view);
  count.textContent = `${view.length} transaksi`;
  meta.textContent = `Non-deleted: ${allTx.length} • Terlihat: ${view.length} • Live update aktif`;
}

function renderTable(view){
  if (!view.length){
    txBody.innerHTML = `<tr><td colspan="5">
      <div class="empty">
        <div class="emoji">🗂️</div>
        <div class="big">Belum ada transaksi</div>
        <div>Nanti histori akan muncul otomatis saat admin menambah transaksi.</div>
      </div>
    </td></tr>`;
    return;
  }

  // running balance based on ascending timeline
  let run = 0;
  const baseAsc = allTx.slice().sort((a,b)=> String(a.date||"").localeCompare(String(b.date||"")));
  const runningMap = new Map();
  for (const t of baseAsc){
    run += (t.type === "in" ? t.amount : -t.amount);
    runningMap.set(t.id, run);
  }

  txBody.innerHTML = view.map(t => {
    const amt = t.type === "in"
      ? `<span class="moneyIn">${fmtIDR(t.amount)}</span>`
      : `<span class="moneyOut">${fmtIDR(t.amount)}</span>`;
    const typeLabel = t.type === "in" ? "Masuk" : "Keluar";
    const runTxt = fmtIDR(runningMap.get(t.id) ?? 0);

    return `
      <tr>
        <td data-label="Tanggal">${fmtDate(t.date)}</td>
        <td data-label="Catatan">${escapeHtml(t.note || "")}</td>
        <td class="num" data-label="Nominal">${amt}</td>
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
  toast({ title:"Info", message:"Tabel di-refresh (re-render)." });
});

btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "login.html";
});

async function getMyProfile(uid){
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

function showSkeleton(){
  txBody.innerHTML = `<tr><td colspan="5">
    <div style="padding: 12px;">
      <div class="skeleton skelLine" style="width: 65%"></div>
      <div class="skeleton skelLine" style="width: 92%"></div>
      <div class="skeleton skelLine" style="width: 86%"></div>
    </div>
  </td></tr>`;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = "login.html";
  setSortIcon(sortField);
  showSkeleton();

  const prof = await getMyProfile(user.uid);
  const label = prof ? (prof.displayName || prof.username) : "User";
  elWho.textContent = `Halo, ${label}`;
  if (prof?.role === "admin") adminLink.style.display = "inline-flex";

  // realtime transactions for this user
  if (unsub) unsub();

  const qTx = query(collection(db, "transactions"), where("ownerUid", "==", user.uid));
  unsub = onSnapshot(qTx, (snap) => {
    rawTx = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        date: data.date,
        type: data.type,
        amount: Number(data.amount || 0),
        note: data.note || "",
        isDeleted: Boolean(data.isDeleted)
      };
    });
    applyFilters();
  }, (err) => {
    toast({ title:"Gagal load transaksi", message: err.message || "Cek rules/index.", type:"err" });
  });
});
