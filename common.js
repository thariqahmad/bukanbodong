// common.js (ES module)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const app = initializeApp(window.FB.firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export function usernameToEmail(username){
  const u = String(username).trim().toLowerCase();
  return `${u}@tabungan.local`;
}

export const fmtIDR = (n) =>
  new Intl.NumberFormat("id-ID", { style:"currency", currency:"IDR" }).format(n);

export const fmtDate = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"numeric" });

export function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}