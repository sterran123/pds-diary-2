# 인증 설명서 — 플랜두씨 다이어리 2

## ① 무엇을 골랐나

- **인증: Firebase Authentication의 이메일/비밀번호 제공자**를 골랐다. SDK 없이 REST 엔드포인트(`identitytoolkit.googleapis.com/v1`)를 `fetch`로 직접 호출한다 — 가입·로그인·비밀번호 변경·계정 삭제·토큰 갱신 전부.
- **자료: Cloud Firestore의 사용자별 문서 `diaries/{uid}`** 하나에 한 사람의 다이어리 전체를 둔다(과제6의 단일 문서 모델을 그대로 이어 받음).
- **잠금: `firestore.rules`**가 서버 쪽에서 막는다. 토큰의 `request.auth.uid`가 문서 경로의 `uid`와 같고, 토큰 발급 시각(`auth_time`)이 문서의 `revokedAtSec`보다 새로울 때만 읽기·쓰기·삭제를 허용한다.
- **세션**: idToken(JWT, 1시간 만료)은 메모리에만, refreshToken만 `localStorage['pds2-session']`에 둔다. 토큰은 오직 `Authorization: Bearer …` 헤더로 이동한다.

## ② 왜 골랐나

- 비밀번호를 내 코드·내 DB에 직접 두면 해시·소금·만료·재시도 제한까지 전부 스스로 맞춰야 하고 하나라도 틀리면 구멍이 된다. Firebase Auth는 그 부분을 전문 서비스가 맡는다 — 내 소스와 Firestore에는 비밀번호 원문이 한 글자도 없다.
- 과제6에서 이미 Firebase 프로젝트(`pds-diary-sterran`)를 쓰고 있어 계정 시스템을 새로 사지 않아도 됐다. 정적 GitHub Pages 사이트와 궁합도 좋다 — 별도 서버 없이 HTTPS REST만으로 돌아간다.
- 진짜 판단은 클라이언트가 아니라 **보안 규칙이 서버에서** 한다. 내 fetch 코드를 고쳐 써도 규칙을 우회할 수 없다.
- RTDB의 토큰 쿼리 인증(`?auth=`)은 토큰이 URL에 실려 로그·기록에 남을 수 있어 헤더 방식(Firestore REST의 `Authorization`)을 골랐다.

## ③ 어디를 어떻게 고쳤나

| 파일 | 변경 |
|---|---|
| `index.html` | `<body class="locked">`로 시작 → 첫 화면은 항상 로그인 게이트. 로그인·가입 폼 추가, 계정 메뉴(비밀번호 바꾸기·계정 삭제·로그아웃) 추가. 공개 안내 배너 → 잠금 안내로 교체 |
| `store.js` | 전면 재작성. RTDB 공개 문서 → Firestore 사용자 문서. 인증 REST(가입·로그인·갱신·비번변경·삭제), 토큰 자동 갱신, 로그아웃 시 `revokedAtSec` 기록, read→modify→write 직렬화는 유지, 최초 로그인 시 과제6 RTDB 자료를 내 계정으로 이주(`migrated_from` 표시) |
| `app.js` | 인증 게이트 로직, 지표·계획규칙 UI, 지표 합계·평균 집계, 규칙 변경 이력, 계정 설정 모달, 세션 끊김 감지(서버가 403으로 거절하면 잠금 화면으로) |
| `firebase-config.js` | 신규 — Firebase 공개 설정(비밀 아님)과 엔드포인트 상수 |
| `firestore.rules` + `firebase.json` | 신규 — 사용자 격리 + 토큰 무효화 규칙, 배포 설정 |
| `contracts/pds-schema-v3.json` | v2를 확장 — settings·metric_entries·rule_changes·무효화 필드 추가 |

## ④ 거절 근거 — 요청과 응답 쌍

테스트 계정 A(`pds-verify-a@test.dev`)와 B(`pds-verify-b@test.dev`)를 만들어 실제 HTTPS 호출로 확인했다. 원문 로그: `checks/auth-evidence.json`. 토큰·비밀번호는 가렸다.

**로그인 없이 읽기 → 거절**
```
GET https://firestore.googleapis.com/v1/projects/pds-diary-sterran/databases/(default)/documents/diaries/{A의uid}
(Authorization 헤더 없음)
→ 403 { "error": { "code": 403, "status": "PERMISSION_DENIED", "message": "Missing or insufficient permissions." } }
```

**주인이 내 문서 읽기 → 통과**
```
GET .../documents/diaries/{B의uid}
Authorization: Bearer eyJhbGciO…생략   (B의 idToken)
→ 200  (문서 전체가 돌아옴)
```

**A 토큰으로 B 문서 읽기·쓰기·삭제 → 전부 거절**
```
GET    .../diaries/{B의uid}   Authorization: Bearer <A토큰>  → 403 PERMISSION_DENIED
PATCH  .../diaries/{B의uid}   본문에 owner=B를 적어도        → 403 PERMISSION_DENIED
DELETE .../diaries/{B의uid}                                 → 403 PERMISSION_DENIED
```
B→A 방향도 동일하게 403. 시도 전후로 B 문서 본문이 바이트 단위로 같음을 확인했다.

**목록으로 훑기도 거절**
```
GET .../documents/diaries   Authorization: Bearer <A토큰>
→ 403 (컬렉션 list 자체를 허용하지 않음 → 목록에 남의 자료가 섞일 경로가 없다)
```

**로그아웃 뒤 같은 토큰 재사용 → 거절**
```
PATCH .../diaries/{A의uid}?updateMask.fieldPaths=revokedAtSec   (로그아웃이 찍는 무효화 시각)
→ 200
GET .../diaries/{A의uid}   Authorization: Bearer <직전과 같은 A토큰>
→ 403 PERMISSION_DENIED
```

**가입·로그인 규칙**
```
POST accounts:signUp            같은 이메일 두 번 → 400 EMAIL_EXISTS
POST accounts:signInWithPassword 비밀번호만 틀림  → 400 INVALID_LOGIN_CREDENTIALS
POST accounts:signInWithPassword 아이디 자체 없음  → 400 INVALID_LOGIN_CREDENTIALS (같은 코드 — 구분 불가)
```

**비밀번호가 어디에도 없다** — `firebase auth:export`로 내려받은 계정 목록에서 각 사용자는 `passwordHash`와 `salt`만 가지고 `password` 필드 자체가 없다. 같은 비밀번호로 만든 A와 B도 해시·소금이 서로 다르다(소금이 계정마다 다름):
```
A: passwordHash "BW7dkxx+0e…"  salt "BkqiKD+SLg…"
B: passwordHash "vLc4TRB3Xl…"  salt "yRfdXqsmoe…"   ← 같은 비밀번호인데 해시 다름
```

**계정 삭제** — 재인증 → `DELETE diaries/{uid}` → `accounts:delete` → 이후 로그인 시 `INVALID_LOGIN_CREDENTIALS`로 거절(실측). 자료 문서가 먼저 지워지고 계정이 지워진다.

## ⑤ AI와 내 판단

- **AI에게 맡긴 일** — 인증 방식 후보 조사, Firestore 규칙 작성, REST 변환·세션 관리 코드, UI(게이트·지표·규칙 변경·계정 모달), 실측 스크립트, 이 문서 초안.
- **내가 직접 판단한 일** — 과제6 공개 RTDB를 잠글지 새 백엔드로 옮길지(→Firestore 이주 결정), 지표·질문·계획 규칙의 실제 문구, 로그아웃이 반드시 토큰 무효화까지 포함하라는 해석, 테스트 계정 정책(실제 비밀번호는 내 계정에만).
- **AI 말을 따르지 않은 일** — AI 첫 제안은 "Firestore SDK + 쿼리로 사용자별 필터"였으나, 단일 문서 소유 모델이 규칙 검증이 단순하고 과제6 구조와 일치해 문서-1개 방식을 택했다. SDK 대신 REST 직접 호출을 택한 것도, 설명서의 요청/응답이 앱의 실제 호출과 1:1로 일치하게 하려는 내 판단이다.

## ⑥ 아직 못 막은 것 — 솔직히

- **로그아웃이 refreshToken을 서버에서 죽이지는 못한다.** 규칙은 발급된 idToken의 재사용을 막지만(auth_time 비교), 탈취된 refreshToken은 새 idToken을 만들 수 있다 — 새 토큰의 auth_time이 무효화 시각보다 새롭기 때문이다. 클라이언트에서 리프레시 토큰을 서버측 폐기하는 API가 없어(관리자 SDK 전용) 막지 못했다. 완화책으로 refreshToken은 기기 로컬에만 두고 로그아웃 시 지우지만, "이미 탈취된 경우"는 6번 과제와 별개로 남은 위험이다.
- **무차별 대입·레이트 제한을 직접 걸지 못했다.** Firebase가 기본 보호를 하지만 내가 임계값을 제어하지는 못한다.
- **비밀번호 재설정(이메일 링크)이 없다.** 잊으면 새 계정이 필요하다.
- **감사 로그가 없다.** 누가 언제 읽었는지 서버에서 안 남긴다.
- **로그인 화면 자체는 공개다.** 누구나 가입할 수 있고, 가입 후엔 빈 문서를 쓸 수 있다(남의 것은 못 건드리지만).
- **토큰이 탈취되면 만료(최대 1시간) 전까지는 막지 못한다.** 로그아웃·비번변경 시 revokedAtSec로 끊지만, 탈취만으로는 자동 감지가 없다.
