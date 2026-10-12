# 플랜두씨 다이어리 2 — 로그인이 붙은 잠긴 다이어리

계획(Plan) → 실제로 한 일(Do) → 돌아보기(See)가 하나로 이어지는 다이어리의 잠금 버전입니다.
**첫 화면은 로그인 화면**이고, 내 기록은 로그인한 본인만 볼 수 있습니다. 남의 기록은 서버가 거절합니다.

- 공개 결과물: https://sterran123.github.io/pds-diary-2/ (계정 없이 열면 로그인 화면만 보입니다)
- 소스 저장소: https://github.com/sterran123/pds-diary-2
- 이어 받은 원본: 과제6 `pds-diary` 최종 제출 커밋 `ad6fdee` (이 저장소의 Git 이력에 그대로 남아 있습니다)
- 인증 설명서: [docs/AUTH.md](docs/AUTH.md) — 무엇을 골랐는지·왜·어디를 고쳤는지·거절 증거·못 막은 것
- 데이터 계약: [contracts/pds-schema-v3.json](contracts/pds-schema-v3.json)

## 구조

- `index.html` · `styles.css` · `app.js` — 순수 HTML/CSS/JavaScript(ES 모듈). 빌드 없음.
- `firebase-config.js` — Firebase 공개 클라이언트 설정(apiKey는 비밀이 아닌 프로젝트 식별자).
- `store.js` — 인증+저장소 어댑터. Firebase Authentication과 Firestore를 REST로 직접 호출합니다.
  모든 자료 쓰기는 "읽기 → 바꾸기 → 통째로 덮어쓰기(PATCH)"로 직렬화됩니다.
- `firestore.rules` — 서버 측 잠금 규칙. 본인 문서만, 그리고 로그아웃 이후 발급된 토큰만 통과.
- `contracts/` — v2(과제6 원본 참고용)와 v3(이번 버전) 계약.

## 인증·잠금 한눈에 보기

- 로그인/가입/로그아웃은 Firebase Authentication(이메일·비밀번호)이 합니다.
- 비밀번호는 Firebase가 해시+소금으로 보관합니다 — 이 저장소·Firestore·어디에도 원문이 없습니다.
- ID 토큰(JWT, 1시간 만료)은 `Authorization: Bearer` 헤더로만 이동합니다. 주소창에 안 실립니다.
- Firestore 보안 규칙이 토큰의 `uid`와 문서 경로의 `uid`를 대조해 본인 문서만 열어 줍니다.
- 로그아웃·비밀번호 변경 시 문서의 `revokedAtSec`가 갱신되고, 규칙이 그보다 먼저 발급된 토큰을 거절합니다.
- 계정을 지우면 자료 문서도 함께 지워집니다(계정 설정 모달에서 확인).

## 5일 사용 규칙 (과제 요구 반영)

- 기록 탭의 "오늘의 지표"에서 날짜·값·메모를 남깁니다 — 날짜별 최신 1건이 집계에 씁니다.
- 지표 설정(질문·지표·단위·계산 규칙·주 시작 요일)은 첫 로그인 때 한 번 정합니다.
- 계획 규칙 변경은 계획 탭 "규칙 바꾸기"로만 — 변경 시각·이유·전후가 `rule_changes`에 남습니다.
- 돌아보기의 지표 합계·평균은 계약의 집계 규칙(빠진 날 제외·중복 최신·이상치 제외·소수 첫째 반올림)대로 계산되고, 숫자를 누르면 근거 기록이 열립니다.
