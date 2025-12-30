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

function setStatus(msg) { $("status").textContent = msg || ""; }

function normalizeCode(raw) {
  return (raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

function fmtTs(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : (ts.seconds ? new Date(ts.seconds * 1000) : null);
  if (!d) return "";
  return d.toLocaleString();
}

function isOnline(lastSeenTs) {
  if (!lastSeenTs) return false;
  const d = lastSeenTs.toDate ? lastSeenTs.toDate() : new Date(lastSeenTs.seconds * 1000);
  const diffMs = Date.now() - d.getTime();
  return diffMs <= 2 * 60 * 1000; // 2분
}

// ===== Login =====
$("btnLogin").onclick = async () => {
  const email = $("email").value.trim();
  const pw = $("pw").value;

  if (!email || !pw) return setStatus("이메일/비밀번호를 입력하세요.");

  try {
    setStatus("로그인 중...");
    await auth.signInWithEmailAndPassword(email, pw);
    setStatus("");
  } catch (e) {
    console.error(e);
    setStatus("로그인 실패: " + (e?.message || e));
    alert("로그인 실패\n\n" + (e?.message || e));
  }
};

$("btnLogout").onclick = async () => auth.signOut();

// ===== Realtime List =====
let unsub = null;

auth.onAuthStateChanged((user) => {
  if (!user) {
    $("loginCard").style.display = "block";
    $("panel").style.display = "none";
    $("who").textContent = "";
    if (unsub) { unsub(); unsub = null; }
    return;
  }

  $("loginCard").style.display = "none";
  $("panel").style.display = "block";
  $("who").textContent = `${user.email} (uid: ${user.uid})`;

  if (unsub) unsub();
  unsub = db.collection("licenses")
    .orderBy("updatedAt", "desc")
    .limit(200)
    .onSnapshot((snap) => {
      const rows = [];
      snap.forEach((doc) => {
        const d = doc.data() || {};
        const allowed = !!d.allowed;
        const online = isOnline(d.lastSeen);

        rows.push(`
          <tr>
            <td><b>${doc.id}</b></td>
            <td><span class="pill ${allowed ? "on" : "off"}">${allowed}</span></td>
            <td><span class="pill ${online ? "on" : "off"}">${online ? "ON" : "OFF"}</span></td>
            <td class="muted">${(d.userName || "")}</td>
            <td class="muted">${(d.deviceId || "")}</td>
            <td class="muted">${(d.memo || "")}</td>
            <td class="muted">${fmtTs(d.lastSeen)}</td>
          </tr>
        `);
      });

      $("tbody").innerHTML = rows.join("") || `<tr><td colspan="7" class="muted">데이터 없음</td></tr>`;
    });
});

// ===== Admin Actions =====
async function createOrUpdateLicense({ allowedValue, mode }) {
  const codeInput = $("code").value;
  const code = normalizeCode(codeInput);
  const userName = ($("userName").value || "").trim();
  const memo = ($("memo").value || "").trim();

  if (!code) return alert("라이선스 코드를 입력하세요.");

  try {
    const ref = db.collection("licenses").doc(code);

    if (mode === "create") {
      // 발급(생성): 없으면 생성 / 있으면 merge로 갱신
      await ref.set({
        allowed: true,
        userName: userName || "",
        memo: memo || "",
        deviceId: "",     // 앱이 최초 바인딩할 칸
        ip: "",
        lastSeen: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      alert(`발급 완료: ${code}`);
    } else if (mode === "setAllowed") {
      await ref.set({
        allowed: allowedValue,
        userName: userName || "",
        memo: memo || "",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      alert(`완료: ${code} → allowed=${allowedValue}`);
    } else if (mode === "toggle") {
      const snap = await ref.get();
      if (!snap.exists) return alert("해당 코드 문서가 없습니다. 먼저 발급(생성)하세요.");
      const cur = !!(snap.data() || {}).allowed;
      await ref.update({
        allowed: !cur,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      alert(`토글 완료: ${code} → allowed=${!cur}`);
    }

    $("code").value = code; // 입력칸도 대문자 반영
  } catch (e) {
    console.error(e);
    alert("실패:\n" + (e?.message || e));
  }
}

$("btnIssue").onclick  = () => createOrUpdateLicense({ mode: "create" });
$("btnAllow").onclick  = () => createOrUpdateLicense({ mode: "setAllowed", allowedValue: true });
$("btnBlock").onclick  = () => createOrUpdateLicense({ mode: "setAllowed", allowedValue: false });
$("btnToggle").onclick = () => createOrUpdateLicense({ mode: "toggle" });







