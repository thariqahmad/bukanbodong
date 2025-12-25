// common.js (ES module)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const app = initializeApp(window.FB.firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export function usernameToEmail(username){
  const u = String(username || "").trim().toLowerCase();
  return `${u}@tabungan.local`;
}

export function fmtIDR(n){
  const v = Number(n || 0);
  return new Intl.NumberFormat("id-ID", { style:"currency", currency:"IDR" }).format(v);
}

export function fmtDate(iso){
  if (!iso) return "-";
  // iso string "YYYY-MM-DD"
  return new Date(String(iso) + "T00:00:00").toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"numeric" });
}

export function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

export function debounce(fn, ms=250){
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** --- Toast system --- */
let toastWrap;
export function ensureToastWrap(){
  if (toastWrap) return toastWrap;
  toastWrap = document.createElement("div");
  toastWrap.className = "toastWrap";
  document.body.appendChild(toastWrap);
  return toastWrap;
}

export function toast({ title, message, type="ok", timeout=3200 }){
  ensureToastWrap();
  const el = document.createElement("div");
  el.className = `toast ${type === "err" ? "err" : "ok"}`;
  el.innerHTML = `<div class="t">${escapeHtml(title || "")}</div><div class="m">${escapeHtml(message || "")}</div>`;
  toastWrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-2px)";
    el.style.transition = "opacity .25s ease, transform .25s ease";
    setTimeout(() => el.remove(), 260);
  }, timeout);
}

/** --- Money input: show IDR while typing, keep numeric in dataset --- */
export function attachMoneyMask(inputEl){
  if (!inputEl) return;
  const parse = (s) => Number(String(s).replace(/[^\d]/g, "")) || 0;
  const format = (n) => new Intl.NumberFormat("id-ID").format(n);

  const sync = () => {
    const n = parse(inputEl.value);
    inputEl.dataset.raw = String(n);
    inputEl.value = n ? format(n) : "";
  };

  inputEl.addEventListener("input", () => {
    const caret = inputEl.selectionStart;
    sync();
    // best-effort caret position; ok for simple use
    inputEl.setSelectionRange(Math.min(caret, inputEl.value.length), Math.min(caret, inputEl.value.length));
  });

  inputEl.addEventListener("blur", sync);
  sync();
}

export function getMoneyRaw(inputEl){
  if (!inputEl) return 0;
  const n = Number(inputEl.dataset.raw || 0);
  return Number.isFinite(n) ? n : 0;
}

export function monthKeyFromDateISO(iso){
  if (!iso || String(iso).length < 7) return "";
  return String(iso).slice(0,7); // YYYY-MM
}

export function buildMonthOptions(txs){
  // returns sorted unique YYYY-MM
  const set = new Set();
  for (const t of txs) if (t?.date) set.add(monthKeyFromDateISO(t.date));
  const arr = Array.from(set).filter(Boolean).sort().reverse();
  return arr;
}

/** Stable sort helper */
export function sortByField(items, field, dir){
  const d = dir === "asc" ? 1 : -1;
  const arr = [...items];
  arr.sort((a,b) => {
    const va = a?.[field];
    const vb = b?.[field];

    // date ISO string sorts lexicographically
    if (field === "date"){
      return String(va || "").localeCompare(String(vb || "")) * d;
    }

    if (typeof va === "number" && typeof vb === "number"){
      return (va - vb) * d;
    }
    return String(va || "").localeCompare(String(vb || "")) * d;
  });
  return arr;
}

export function fmtCurrency(code, amount){
  const c = String(code || "IDR").toUpperCase();
  const v = Number(amount || 0);
  if (c === "IDR") return fmtIDR(v);
  try{
    return new Intl.NumberFormat("id-ID", { style:"currency", currency: c }).format(v);
  }catch{
    return `${v.toLocaleString("id-ID")} ${c}`;
  }
}

export function toISODateToday(){
  return new Date().toISOString().slice(0,10);
}

export function round2(n){
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

export function parseFx2(input){
  const s = String(input ?? "").trim().replace(",", ".");
  const v = Number(s);
  if (!Number.isFinite(v)) return 0;
  return round2(v);
}
