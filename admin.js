// ===== Firebase Config =====
const firebaseConfig = {
  apiKey: "AIzaSyAzPncSA_r-dzdRVAfTXEXWG0RXgH4CMwQ",
  authDomain: "bac-calc-control.firebaseapp.com",
  projectId: "bac-calc-control",
  storageBucket: "bac-calc-control.firebasestorage.app",
  messagingSenderId: "863777506238",
  appId: "1:863777506238:web:972c8bed17ac0295b2efef"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

const $ = (id) => document.getElementById(id);
const nowMs = () => Date.now();

function setStatus(msg) { $("status").textContent = msg || ""; }

function normalizeCode(raw) {
  return (raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function isOnlineFromLastSeen(ts) {
  // lastSeen이 2분 이내면 ON
  if (!ts) return false;
  const ms = ts.toDate ? ts.toDate().getTime() : 0;
  if (!ms) return false;
  return (nowMs() - ms) <= 2 * 60 * 1000;
}

// ===== Login / Logout =====
$("btnLogin").onclick = async () => {
  const email = $("email").value.trim();
  const pw = $("pw").value;

  if (!email || !pw) return setStatus("이메일/비밀번호를 입력하세요.");

  try {
    setStatus("로그인 시도 중...");
    await auth.signInWithEmailAndPassword(email, pw);
    setStatus("");
  } catch (e) {
    console.error(e);
    setStatus("로그인 실패: " + (e?.message || e));
    alert("로그인 실패\n\n" + (e?.message || e));
  }
};

$("btnLogout").onclick = async () => {
  await auth.signOut();
};

// ===== Auth state =====
auth.onAuthStateChanged((user) => {
  if (!user) {
    $("loginCard").style.display = "block";
    $("panel").style.display = "none";
    $("who").textContent = "";
    return;
  }

  $("loginCard").style.display = "none";
  $("panel").style.display = "block";
  $("who").textContent = `${user.email} (uid: ${user.uid})`;

  // ✅ 실시간 목록
  db.collection("licenses").orderBy("createdAt", "desc").onSnapshot((snap) => {
    const rows = [];
    snap.forEach((doc) => {
      const d = doc.data() || {};
      const allowed = !!d.allowed;
      const online = isOnlineFromLastSeen(d.lastSeen);

      rows.push(`
        <tr>
          <td><b>${doc.id}</b></td>
          <td><span class="pill ${allowed ? "on" : "off"}">${allowed}</span></td>
          <td><span class="pill ${online ? "on" : "off"}">${online ? "ON" : "OFF"}</span></td>
          <td class="muted">${d.userName || ""}</td>
          <td class="muted">${d.deviceId || ""}</td>
          <td class="muted">${d.memo || ""}</td>
          <td class="muted">${d.lastSeen?.toDate ? d.lastSeen.toDate().toLocaleString() : ""}</td>
        </tr>
      `);
    });

    $("tbody").innerHTML = rows.join("") || `
      <tr><td colspan="7" class="muted">데이터 없음</td></tr>
    `;
  });
});

// ===== Actions =====
async function createLicense() {
  const code = normalizeCode($("code").value);
  const userName = $("userName").value.trim();
  const memo = $("memo").value.trim();

  if (!code) return alert("라이선스 코드를 입력하세요.");

  try {
    const ref = db.collection("licenses").doc(code);

    // ✅ 발급(생성): 없으면 생성, 있으면 merge 업데이트
    await ref.set({
      allowed: true,
      userName: userName || "",
      memo: memo || "",
      deviceId: "",
      ip: "",
      lastSeen: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    alert(`발급 완료: ${code}`);
  } catch (e) {
    console.error(e);
    alert("발급 실패:\n" + (e?.message || e));
  }
}

async function setAllowed(value) {
  const code = normalizeCode($("code").value);
  const userName = $("userName").value.trim();
  const memo = $("memo").value.trim();

  if (!code) return alert("라이선스 코드를 입력하세요.");

  try {
    const ref = db.collection("licenses").doc(code);
    await ref.set({
      allowed: value,
      userName: userName || "",
      memo: memo || "",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    alert(`완료: ${code} → allowed=${value}`);
  } catch (e) {
    console.error(e);
    alert("실패:\n" + (e?.message || e));
  }
}

async function toggleAllowed() {
  const code = normalizeCode($("code").value);
  if (!code) return alert("라이선스 코드를 입력하세요.");

  try {
    const ref = db.collection("licenses").doc(code);
    const snap = await ref.get();
    if (!snap.exists) return alert("해당 코드 문서가 없습니다. 먼저 발급하세요.");

    const cur = !!snap.data().allowed;
    await ref.update({
      allowed: !cur,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    alert(`토글 완료: ${code} → allowed=${!cur}`);
  } catch (e) {
    console.error(e);
    alert("토글 실패:\n" + (e?.message || e));
  }
}

// 버튼 연결
$("btnIssue").onclick  = () => createLicense();
$("btnAllow").onclick  = () => setAllowed(true);
$("btnBlock").onclick  = () => setAllowed(false);
$("btnToggle").onclick = () => toggleAllowed();









