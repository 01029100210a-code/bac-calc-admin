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

async function upsertLicense(allowedValue) {
  const codeRaw = $("code").value.trim();
  const memo = $("memo").value.trim();

  if (!codeRaw) {
    alert("라이선스 코드를 입력하세요.");
    return;
  }

  // ✅ 코드 통일(권장): 대문자 + 공백 제거
  const code = codeRaw.toUpperCase().replace(/\s+/g, "");

  try {
    const ref = db.collection("licenses").doc(code);

    // ✅ 문서가 없으면 생성, 있으면 필요한 필드만 갱신
    await ref.set(
      {
        allowed: allowedValue,
        memo: memo || "",
        // deviceId는 앱이 최초 바인딩 시 채우는 용도라면 비워둠
        deviceId: "",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(), // 최초 생성에도 들어가게(merge라 중복 괜찮)
      },
      { merge: true }
    );

    alert(`완료: ${code} → allowed=${allowedValue}`);
    $("code").value = code; // 입력칸도 대문자 반영
  } catch (e) {
    console.error(e);
    alert("실패:\n" + (e?.message || e));
  }
}

$("btnAllow").onclick = () => upsertLicense(true);
$("btnBlock").onclick = () => upsertLicense(false);




