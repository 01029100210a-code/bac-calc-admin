// ======================
// Firebase 설정 (너 프로젝트 값 유지)
// ======================
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

function fmtTime(ts) {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
  } catch {
    return "";
  }
}

// lastSeen 기준 "2분 이내면 ON"
function isOnline(lastSeen) {
  if (!lastSeen || !lastSeen.toDate) return false;
  const ms = Date.now() - lastSeen.toDate().getTime();
  return ms <= 2 * 60 * 1000;
}

// ======================
// 로그인/로그아웃
// ======================
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

// ======================
// 인증 상태 변화
// ======================
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

  // 실시간 목록 구독
  if (unsub) unsub();
  unsub = db.collection("licenses").orderBy("updatedAt", "desc").onSnapshot((snap) => {
    const rows = [];
    snap.forEach((doc) => {
      const d = doc.data() || {};
      const allowed = !!d.allowed;
      const online = isOnline(d.lastSeen);

      rows.push(`
        <tr>
          <td class="mono"><b>${doc.id}</b></td>
          <td>
            <span class="pill ${allowed ? "badgeOn" : "badgeOff"}">
              <span class="dot ${allowed ? "on" : "off"}"></span>
              ${allowed ? "true" : "false"}
            </span>
          </td>
          <td>
            <span class="pill">
              <span class="dot ${online ? "on" : "off"}"></span>
              ${online ? "ON" : "OFF"}
            </span>
          </td>
          <td>${(d.userName || "")}</td>
          <td class="muted mono">${(d.deviceId || "")}</td>
          <td class="muted mono">${(d.ip || "")}</td>
          <td class="muted">${(d.memo || "")}</td>
          <td class="muted">${fmtTime(d.lastSeen)}</td>
          <td>
            <button class="smallBtn btnAccent" data-fill="${doc.id}">불러오기</button>
            <button class="smallBtn btnGood" data-allow="${doc.id}">허용</button>
            <button class="smallBtn btnBad" data-block="${doc.id}">차단</button>
          </td>
        </tr>
      `);
    });

    $("tbody").innerHTML = rows.join("") || `<tr><td colspan="9" class="muted">데이터 없음</td></tr>`;

    // 행 버튼 이벤트(이벤트 위임)
    $("tbody").onclick = async (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLElement)) return;

      const codeFill = t.getAttribute("data-fill");
      const codeAllow = t.getAttribute("data-allow");
      const codeBlock = t.getAttribute("data-block");

      if (codeFill) {
        const doc = await db.collection("licenses").doc(codeFill).get();
        const d = doc.data() || {};
        $("code").value = codeFill;
        $("userName").value = d.userName || "";
        $("memo").value = d.memo || "";
      }

      if (codeAllow) {
        await setAllowed(codeAllow, true);
      }

      if (codeBlock) {
        await setAllowed(codeBlock, false);
      }
    };
  });
});

// ======================
// 핵심 동작: 발급/저장(upsert)
// ======================
async function issueOrSave() {
  const code = normalizeCode($("code").value);
  const userName = $("userName").value.trim();
  const memo = $("memo").value.trim();

  if (!code) return alert("라이선스 코드를 입력하세요.");
  if (!userName) return alert("유저 이름을 입력하세요.");

  try {
    const ref = db.collection("licenses").doc(code);

    // 문서 없으면 생성, 있으면 업데이트(merge)
    await ref.set({
      allowed: true,                 // 기본 발급은 허용 true
      userName: userName,
      memo: memo || "",
      // deviceId/ip/lastSeen은 앱에서 채움(여기선 건드리지 않음)
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    $("code").value = code;
    alert(`발급/저장 완료: ${code}`);
  } catch (e) {
    console.error(e);
    alert("실패:\n" + (e?.message || e));
  }
}

// allowed만 변경
async function setAllowed(codeRaw, allowedValue) {
  const code = normalizeCode(codeRaw);
  if (!code) return alert("코드가 비었습니다.");

  try {
    const ref = db.collection("licenses").doc(code);
    // 문서 없으면 만들고 allowed 세팅까지
    await ref.set({
      allowed: allowedValue,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    alert(`완료: ${code} → allowed=${allowedValue}`);
  } catch (e) {
    console.error(e);
    alert("실패:\n" + (e?.message || e));
  }
}

// 토글(현재 값 읽어서 반대로)
async function toggleAllowed() {
  const code = normalizeCode($("code").value);
  if (!code) return alert("토글할 코드를 입력/불러오기 하세요.");

  try {
    const ref = db.collection("licenses").doc(code);
    const snap = await ref.get();
    if (!snap.exists) return alert("해당 코드 문서가 없습니다. 먼저 발급/저장 하세요.");

    const cur = !!(snap.data() || {}).allowed;
    await ref.update({
      allowed: !cur,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    alert(`토글 완료: ${code} → allowed=${!cur}`);
  } catch (e) {
    console.error(e);
    alert("실패:\n" + (e?.message || e));
  }
}

// ======================
// 버튼 연결
// ======================
$("btnIssue").onclick = issueOrSave;

$("btnAllow").onclick = async () => {
  const code = normalizeCode($("code").value);
  if (!code) return alert("코드를 입력하세요.");
  await setAllowed(code, true);
};

$("btnBlock").onclick = async () => {
  const code = normalizeCode($("code").value);
  if (!code) return alert("코드를 입력하세요.");
  await setAllowed(code, false);
};

$("btnToggle").onclick = toggleAllowed;






