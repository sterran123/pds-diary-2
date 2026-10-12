// 저장소+인증 어댑터 — 플랜두씨 다이어리 2
// 인증: Firebase Authentication REST API (SDK 없이 fetch로 호출)
//   - 가입   POST {IDENTITY}/accounts:signUp
//   - 로그인 POST {IDENTITY}/accounts:signInWithPassword
//   - 갱신   POST {SECURETOKEN}/token (refresh_token → id_token)
//   - 비번   POST {IDENTITY}/accounts:update
//   - 삭제   POST {IDENTITY}/accounts:delete
// 자료: Cloud Firestore REST — 문서 diaries/{uid} 하나가 다이어리 전체.
//   - 읽기 GET, 쓰기 PATCH(updateMask=doc,updated_at → doc 필드만 교체)
//   - ID 토큰은 Authorization: Bearer 헤더로만 실린다 (주소창·URL에 안 넣음)
//   - 잠금 판단은 서버의 firestore.rules가 한다 — 이 파일은 규칙을 우회하지 못한다.
import { FIREBASE, IDENTITY, SECURETOKEN, FIRESTORE, LEGACY_DOC_URL } from './firebase-config.js?v=4';

const SESSION_KEY = 'pds2-session';

/* ── 세션 ───────────────────────────────────────
   localStorage에는 refreshToken만 둔다(부팅 때 idToken으로 교환).
   idToken은 메모리에만 두고 만료(1시간) 전에 갱신한다. */
let session = null; // { uid, email, idToken, refreshToken, expiresAt }
let onSessionLost = null;
export function setSessionLostHandler(fn) { onSessionLost = fn; }

function persistSession() {
  if (!session) { localStorage.removeItem(SESSION_KEY); return; }
  localStorage.setItem(SESSION_KEY, JSON.stringify({ refreshToken: session.refreshToken, uid: session.uid, email: session.email }));
}

export function currentUser() { return session && { uid: session.uid, email: session.email }; }

async function idp(path, body) {
  const res = await fetch(`${IDENTITY}${path}?key=${FIREBASE.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(j.error?.message || `인증 오류 (${res.status})`);
    err.code = j.error?.message || String(res.status);
    throw err;
  }
  return j;
}

function adoptSession(j) {
  session = {
    uid: j.localId,
    email: j.email,
    idToken: j.idToken,
    refreshToken: j.refreshToken,
    expiresAt: Date.now() + Number(j.expiresIn || 3600) * 1000
  };
  persistSession();
  return session;
}

export async function signUp(email, password) {
  return adoptSession(await idp('/accounts:signUp', { email, password, returnSecureToken: true }));
}
export async function signIn(email, password) {
  return adoptSession(await idp('/accounts:signInWithPassword', { email, password, returnSecureToken: true }));
}

// 비밀번호 바꾸기 → 새 토큰이 돌아오지만 이전 토큰들은 서버에서 즉시 무효화된다.
// 여기에 revokedAtSec까지 찍으면 방금 바뀐 비밀번호로 다시 로그인한 토큰만 살아남는다.
export async function changePassword(idToken, newPassword) {
  return idp('/accounts:update', { idToken, password: newPassword, returnSecureToken: true });
}
export async function deleteAuthAccount(idToken) {
  return idp('/accounts:delete', { idToken });
}

async function refreshSession() {
  if (!session?.refreshToken) return null;
  const res = await fetch(`${SECURETOKEN}/token?key=${FIREBASE.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { session = null; persistSession(); return null; }
  session.idToken = j.id_token;
  session.refreshToken = j.refresh_token;
  session.expiresAt = Date.now() + Number(j.expires_in || 3600) * 1000;
  persistSession();
  return session.idToken;
}

// 유효한 idToken을 돌려준다. 만료 60초 전이면 미리 갱신한다.
export async function ensureToken() {
  if (!session) return null;
  if (session.idToken && session.expiresAt - 60_000 > Date.now()) return session.idToken;
  return refreshSession();
}

// 토큰의 auth_time(발급 시각, 초) — 무효화 시각을 이 값 이상으로 찍어야 이 토큰이 끊긴다
function tokenAuthTime(token) {
  try { return JSON.parse(atob(token.split('.')[1])).auth_time || 0; } catch { return 0; }
}

export async function restoreSession() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { /* 깨진 값은 무시 */ }
  if (!saved?.refreshToken) return null;
  session = { uid: saved.uid, email: saved.email, refreshToken: saved.refreshToken, idToken: null, expiresAt: 0 };
  const t = await refreshSession();
  if (!t) return null;
  return currentUser();
}

// 로그아웃 — ① 문서에 무효화 시각을 찍고 ② 로컬 세션을 지운다.
// 찍는 순간부터 같은 idToken은 규칙(auth_time > revokedAtSec)에 걸려 거절된다.
export async function signOut() {
  const t = session?.idToken ? await ensureToken() : null;
  const uid = session?.uid;
  if (t && uid) {
    const stamp = Math.max(Math.floor(Date.now() / 1000), tokenAuthTime(t));
    try {
      await fsFetch(`diaries/${uid}`, t, 'PATCH', { fields: { revokedAtSec: toFs(stamp) } }, 'updateMask.fieldPaths=revokedAtSec');
    } catch { /* 오프라인이어도 로컬 로그아웃은 진행 */ }
  }
  session = null;
  persistSession();
}

// 서버 호출 없이 로컬 세션만 지운다 — 계정 삭제처럼 되돌릴 쓰기가 없을 때
export function clearLocalSession() {
  session = null;
  persistSession();
}

/* ── Firestore 값 변환 ───────────────────────── */
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } };
}
function fromFs(v) {
  if (!v || 'nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)]));
  if ('timestampValue' in v) return v.timestampValue;
  return null;
}

async function fsFetch(path, token, method = 'GET', body = null, query = '') {
  const res = await fetch(`${FIRESTORE}/${path}${query ? `?${query}` : ''}`, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(j.error?.message || `Firestore 오류 (${res.status})`);
    err.status = res.status;
    // 권한 거절/토큰 만료 → 세션이 다른 곳에서 끊긴 것일 수 있다
    if ((res.status === 401 || res.status === 403) && onSessionLost) onSessionLost();
    throw err;
  }
  return j;
}

/* ── 다이어리 문서 ───────────────────────────── */
export function emptyDoc() {
  return {
    schema_version: 'pds-diary-v3',
    meta: { seeded: false, updated_at: null, migrated_from: null, migrated_at: null },
    settings: null,
    plans: [],
    plan_revisions: [],
    tasks: [],
    executions: [],
    completions: [],
    improvements: [],
    metric_entries: [],
    rule_changes: []
  };
}

const COLLECTIONS = ['plans', 'plan_revisions', 'tasks', 'executions', 'completions', 'improvements', 'metric_entries', 'rule_changes'];
const asArr = v => (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []));

export function normalizeDoc(data) {
  if (!data) return null;
  const doc = { ...emptyDoc(), ...data };
  for (const key of COLLECTIONS) doc[key] = asArr(doc[key]);
  return doc;
}

// 문서를 읽는다. 없으면 null. 세션의 uid 문서만 열린다(규칙이 보장).
export async function loadDoc() {
  const token = await ensureToken();
  if (!token || !session) throw new Error('로그인이 필요합니다');
  const res = await fetch(`${FIRESTORE}/diaries/${session.uid}`, {
    headers: { 'Authorization': `Bearer ${token}` },
    cache: 'no-store'
  });
  if (res.status === 404) return null;
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(j.error?.message || `읽기 실패 (${res.status})`);
    err.status = res.status;
    if ((res.status === 401 || res.status === 403) && onSessionLost) onSessionLost();
    throw err;
  }
  const inner = j.fields?.doc ? fromFs(j.fields.doc) : null;
  const doc = normalizeDoc(inner);
  if (doc) {
    doc.meta.owner = fromFs(j.fields?.owner) || session.uid;
    doc.meta.revokedAtSec = fromFs(j.fields?.revokedAtSec) || 0;
  }
  return doc;
}

// PATCH upsert — doc 필드만 통째로 교체한다(updateMask로 범위를 제한해
// owner·revokedAtSec 같은 잠금 필드를 실수로 덮어쓰지 않는다)
export async function saveDoc(doc) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await ensureToken();
    if (!token || !session) throw new Error('로그인이 필요합니다');
    try {
      await fsFetch(`diaries/${session.uid}`, token, 'PATCH',
        { fields: { doc: toFs(stripMeta(doc)), updated_at: toFs(new Date().toISOString()) } },
        'updateMask.fieldPaths=doc&updateMask.fieldPaths=updated_at');
      return;
    } catch (err) {
      if (attempt === 0 && err.status !== 403) { await new Promise(r => setTimeout(r, 400)); continue; }
      throw err;
    }
  }
}

// 저장할 땐 meta 안의 잠금 관련 부속 필드를 떼고 보낸다
function stripMeta(doc) {
  const copy = { ...doc, meta: { ...doc.meta } };
  delete copy.meta.owner;
  delete copy.meta.revokedAtSec;
  return copy;
}

// 6번 과제 공개 문서(RTDB)를 읽어 내 계정 문서로 옮긴다 — 최초 로그인 1회
export async function migrateLegacy() {
  const res = await fetch(LEGACY_DOC_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`이전 자료 읽기 실패 (${res.status})`);
  const legacy = await res.json();
  const doc = normalizeDoc(legacy) || emptyDoc();
  doc.schema_version = 'pds-diary-v3';
  doc.meta.migrated_from = 'rtdb:/pds-diary-v1';
  doc.meta.migrated_at = new Date().toISOString();
  const token = await ensureToken();
  await fsFetch(`diaries/${session.uid}`, token, 'PATCH', {
    fields: {
      owner: toFs(session.uid),
      revokedAtSec: toFs(0),
      migrated_from: toFs(doc.meta.migrated_from),
      migrated_at: toFs(doc.meta.migrated_at),
      doc: toFs(stripMeta(doc)),
      updated_at: toFs(new Date().toISOString())
    }
  });
  return doc;
}

// 새 계정용 빈 문서를 만든다
export async function createFreshDoc() {
  const doc = emptyDoc();
  const token = await ensureToken();
  await fsFetch(`diaries/${session.uid}`, token, 'PATCH', {
    fields: {
      owner: toFs(session.uid),
      revokedAtSec: toFs(0),
      doc: toFs(stripMeta(doc)),
      updated_at: toFs(new Date().toISOString())
    }
  });
  return doc;
}

// 계정 삭제 — 자료 문서를 먼저 지우고 인증 계정을 지운다
export async function deleteMyData() {
  const token = await ensureToken();
  try {
    await fsFetch(`diaries/${session.uid}`, token, 'DELETE');
  } catch (e) {
    if (e.status !== 404) throw e; // 문서가 이미 없으면 계정 삭제는 계속 진행
  }
}

// 모든 쓰기를 직렬화한다. 최신 문서를 읽고 → 변형 → 통째로 저장한다.
let queue = Promise.resolve();
export function transact(fn) {
  const job = queue.then(async () => {
    const doc = (await loadDoc()) || emptyDoc();
    const result = await fn(doc);
    doc.meta.updated_at = new Date().toISOString();
    await saveDoc(doc);
    return { doc, result };
  });
  queue = job.catch(() => {});
  return job;
}

export function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
