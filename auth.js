// auth.js (ES module)
import { auth, db, usernameToEmail } from "./common.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const isRegister = location.pathname.endsWith("register.html") || location.href.includes("register.html");
const isLogin = location.pathname.endsWith("login.html") || location.href.includes("login.html");

function setMsg(text, cls=""){
  const el = document.getElementById("msg");
  if (!el) return;
  el.className = "toast " + cls;
  el.textContent = text;
}

async function routeByRole(uid){
  const snap = await getDoc(doc(db, "users", uid));
  const role = snap.exists() ? snap.data().role : "user";
  location.href = role === "admin" ? "admin.html" : "user.html";
}

if (isRegister){
  document.getElementById("btnReg").addEventListener("click", async () => {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;

    if (username.length < 3) return setMsg("Username minimal 3 karakter.", "err");
    if (password.length < 6) return setMsg("Password minimal 6 karakter.", "err");

    setMsg("Membuat akun…");

    const email = usernameToEmail(username);

    try{
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "users", cred.user.uid), { username, role });
      setMsg("Register sukses. Mengarahkan…", "ok");
      await routeByRole(cred.user.uid);
    }catch(e){
      setMsg("Gagal: " + e.message, "err");
    }
  });
}

if (isLogin){
  document.getElementById("btnLogin").addEventListener("click", async () => {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    if (!username || !password) return setMsg("Isi username dan password.", "err");
    setMsg("Login…");

    const email = usernameToEmail(username);

    try{
      const cred = await signInWithEmailAndPassword(auth, email, password);
      setMsg("Login sukses. Mengarahkan…", "ok");
      await routeByRole(cred.user.uid);
    }catch(e){
      setMsg("Login gagal: " + e.message, "err");
    }
  });

  // auto-route kalau sudah login
  onAuthStateChanged(auth, async (user) => {
    if (user) routeByRole(user.uid);
  });
}