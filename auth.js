// auth.js (ES module)
import { auth, db, usernameToEmail, toast } from "./common.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc, getDoc, setDoc, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const path = location.pathname.toLowerCase();
const isRegister = path.endsWith("register.html");
const isLogin = path.endsWith("login.html");

const elSkel = document.getElementById("skel");
const elHint = document.getElementById("hint");

function setLoading(on){
  if (elSkel) elSkel.style.display = on ? "block" : "none";
  if (elHint) elHint.textContent = on ? "Memproses…" : "—";
}

function normUsername(u){
  return String(u || "").trim().toLowerCase();
}

async function routeByRole(uid){
  const snap = await getDoc(doc(db, "users", uid));
  const role = snap.exists() ? snap.data().role : "user";
  location.href = role === "admin" ? "admin.html" : "user.html";
}

async function createProfileAndIndex({ uid, username, displayName, role }){
  const uname = normUsername(username);
  const indexRef = doc(db, "username_index", uname);
  const userRef = doc(db, "users", uid);

  await runTransaction(db, async (tx) => {
    const idxSnap = await tx.get(indexRef);
    if (idxSnap.exists()) {
      throw new Error("USERNAME_TAKEN");
    }
    tx.set(indexRef, { uid, createdAt: serverTimestamp() });
    tx.set(userRef, {
      username: uname,
      displayName: String(displayName || "").trim() || null,
      role,
      active: true,
      createdAt: serverTimestamp()
    });
  });
}

if (isRegister){
  document.getElementById("btnReg").addEventListener("click", async () => {
    const username = document.getElementById("username").value;
    const displayName = document.getElementById("displayName").value;
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;

    const uname = normUsername(username);

    if (uname.length < 3) return toast({ title:"Gagal", message:"Username minimal 3 karakter.", type:"err" });
    if (!/^[a-z0-9._-]+$/.test(uname)) return toast({ title:"Gagal", message:"Username hanya boleh huruf kecil/angka/titik/strip/underscore.", type:"err" });
    if ((password || "").length < 6) return toast({ title:"Gagal", message:"Password minimal 6 karakter.", type:"err" });

    setLoading(true);

    try{
      const email = usernameToEmail(uname);
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      try{
        await createProfileAndIndex({ uid: cred.user.uid, username: uname, displayName, role });
      }catch(e){
        // kalau username sudah dipakai, hapus user Auth yg baru dibuat
        if (String(e.message).includes("USERNAME_TAKEN")) {
          await deleteUser(cred.user);
          throw new Error("Username has been used. Try another one.");
        }
        // kalau error lain, biarkan
        throw e;
      }

      toast({ title:"Success", message:"Account created. Redirecting…" });
      await routeByRole(cred.user.uid);

    }catch(e){
      toast({ title:"Failed", message: e.message || "Register failed.", type:"err" });
    }finally{
      setLoading(false);
    }
  });
}

if (isLogin){
  document.getElementById("btnLogin").addEventListener("click", async () => {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const uname = normUsername(username);

    if (!uname || !password) return toast({ title:"Failed", message:"Type in your username and password.", type:"err" });

    setLoading(true);
    try{
      const email = usernameToEmail(uname);
      const cred = await signInWithEmailAndPassword(auth, email, password);
      toast({ title:"Sukses", message:"Login successful. Redirecting..." });
      await routeByRole(cred.user.uid);
    }catch(e){
      toast({ title:"Login failed", message: e.message || "Check username/password.", type:"err" });
    }finally{
      setLoading(false);
    }
  });

  onAuthStateChanged(auth, async (user) => {
    if (user) routeByRole(user.uid);
  });
}
