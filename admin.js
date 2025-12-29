// 1) 여기 firebaseConfig 를 Firebase 콘솔(프로젝트 설정 > 웹앱)에서 복붙
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

$("btnLogin").onclick = async () => {
  const email = $("email").value.trim();
  const pw = $("pw").value;

  if (!email || !pw) {
    setStatus("이메일/비밀번호를 입력하세요.");
    return;
  }

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

  // 실시간 목록
  db.collection("licenses").onSnapshot((snap) => {
    const rows = [];
    snap.forEach((doc) => {
      const d = doc.data() || {};
      const allowed = !!d.allowed;
      rows.push(`
        <tr>
          <td><b>${doc.id}</b></td>
          <td><span class="pill ${allowed ? "on" : "off"}">${allowed}</span></td>
          <td class="muted">${d.deviceId || ""}</td>
          <td class="muted">${d.memo || ""}</td>
        </tr>
      `);
    });
    $("tbody").innerHTML = rows.join("") || `<tr><td colspan="4" class="muted">데이터 없음</td></tr>`;
  });
});

async function updateLicense(allowedValue) {
  const code = $("code").value.trim();
  const memo = $("memo").value.trim();

  if (!code) {
    alert("라이선스 코드를 입력하세요.");
    return;
  }

  try {
    const ref = db.collection("licenses").doc(code);

    // 문서가 없으면 set()로 생성까지 하고 싶다면 아래 주석 해제:
    // await ref.set({ allowed: allowedValue, memo: memo, deviceId: "" }, { merge: true });

    // 기존 문서가 있어야만 update() 가능 (지금은 이 방식)
    await ref.update({
      allowed: allowedValue,
      memo: memo,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    alert(`완료: ${code} → allowed=${allowedValue}`);
  } catch (e) {
    console.error(e);
    alert("실패:\n" + (e?.message || e));
  }
}

$("btnAllow").onclick = () => updateLicense(true);
$("btnBlock").onclick = () => updateLicense(false);

