// 1) Firebase 콘솔(프로젝트 설정 > 웹앱)에서 복붙한 값
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

function normalizeCode(codeRaw) {
  return (codeRaw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function fmtTs(ts) {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
  } catch {
    return "";
  }
}

// 접속 ON/OFF 기준(밀리초): lastSeen이 이 시간 이내면 ON
const ONLINE_WINDOW_MS = 2 * 60 * 1000; // 2분

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

$("btnLogout").onclick = async () => auth.signOut();

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
  db.collection("licenses")
    .orderBy("updatedAt", "desc")
    .onSnapshot((snap) => {
      const now = Date.now();
      const rows = [];

      snap.forEach((doc) => {
        const d = doc.data() || {};
        const allowed = !!d.allowed;

        const lastSeen = d.lastSeen || null;
        const lastSeenMs = lastSeen?.toDate ? lastSeen.toDate().getTime() : 0;
        const online = lastSeenMs && (now - lastSeenMs <= ONLINE_WINDOW_MS);

        rows.push(`
          <tr>
            <td><b>${doc.id}</b></td>
            <td><span class="pill ${allowed ? "on" : "off"}">${allowed}</span></td>
            <td><span class="pill ${online ? "live" : "off"}">${online ? "ON" : "OFF"}</span></td>
            <td class="muted">${d.userName || ""}</td>
            <td class="muted">${d.deviceId || ""}</td>
            <td class="muted">${d.memo || ""}</td>
            <td class="muted">${fmtTs(d.lastSeen)}</td>
          </tr>
        `);
      });

      $("tbody").innerHTML = rows.join("") || `<tr><td colspan="7" class="muted">데이터 없음</td></tr>`;
    });
});

// ✅ 발급(생성): 문서가 없으면 만들고, 있으면 값 갱신
async function issueLicense() {
  const code = normalizeCode($("code").value);
  const userName = ($("userName").value || "").trim();
  const memo = ($("memo").value || "").trim();

  if (!code) return alert("라이선스 코드를 입력하세요.");
  if (!userName) return alert("유저 이름을 입력하세요.");

  const ref = db.collection("licenses").doc(code);

  try {
    // createdAt은 "최초 생성"에만 넣고 싶으면 get()로 존재 여부 확인
    const snap = await ref.get();
    const exists = snap.exists;

    const payload = {
      allowed: true,                 // 발급 시 기본 허용
      userName,
      memo,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    if (!exists) {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      payload.deviceId = "";         // 앱이 바인딩하면 채움
      // lastSeen/ip는 앱이 업데이트(또는 Cloud Function)로 채우는 게 정상
      payload.lastSeen = null;
      payload.ip = "";
    }

    await ref.set(payload, { merge: true });

    $("code").value = code; // 입력칸도 대문자 반영
    alert(`발급 완료: ${code} (allowed=true)`);
  } catch (e) {
    console.error(e);
    alert("발급 실패:\n" + (e?.message || e));
  }
}

// ✅ 허용/차단: 문서가 없으면 생성까지 해줌(merge=true)
async function setAllowed(value) {
  const code = normalizeCode($("code").value);
  const userName = ($("userName").value || "").trim();
  const memo = ($("memo").value || "").trim();
  if (!code) return alert("라이선스 코드를 입력하세요.");

  const ref = db.collection("licenses").doc(code);

  try {
    const snap = await ref.get();
    const exists = snap.exists;

    const payload = {
      allowed: !!value,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (memo) payload.memo = memo;
    if (userName) payload.userName = userName;

    if (!exists) {
      // 새로 만드는 경우 기본 필드까지
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      payload.deviceId = "";
      payload.lastSeen = null;
      payload.ip = "";
    }

    await ref.set(payload, { merge: true });
    $("code").value = code;
    alert(`완료: ${code} → allowed=${value}`);
  } catch (e) {
    console.error(e);
    alert("실패:\n" + (e?.message || e));
  }
}

// ✅ 토글(허용<->차단)
async function toggleAllowed() {
  const code = normalizeCode($("code").value);
  if (!code) return alert("라이선스 코드를 입력하세요.");

  const ref = db.collection("licenses").doc(code);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.exists ? !!(snap.data() || {}).allowed : false;
      const next = !cur;

      if (!snap.exists) {
        tx.set(ref, {
          allowed: next,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          deviceId: "",
          userName: ($("userName").value || "").trim() || "",
          memo: ($("memo").value || "").trim() || "",
          lastSeen: null,
          ip: ""
        }, { merge: true });
      } else {
        tx.set(ref, {
          allowed: next,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    });

    alert(`토글 완료: ${code}`);
  } catch (e) {
    console.error(e);
    alert("토글 실패:\n" + (e?.message || e));
  }
}

$("btnIssue").onclick = issueLicense;
$("btnAllow").onclick = () => setAllowed(true);
$("btnBlock").onclick = () => setAllowed(false);
$("btnToggle").onclick = toggleAllowed;







