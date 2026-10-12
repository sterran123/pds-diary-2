// Firebase 공개 클라이언트 설정 — 비밀이 아니다.
// apiKey는 "어느 Firebase 프로젝트인가"를 가리키는 식별자일 뿐,
// 이 키만으로는 아무 자료도 열 수 없다. 접근 권한은 Firestore 보안 규칙이
// ID 토큰의 uid와 문서 주인을 대조해 결정한다 (웹용 공개 키 표준 방식).
export const FIREBASE = {
  apiKey: 'AIzaSyC4VG8vlbMU-BDVINArQMkxqwEgyGtyM_c',
  authDomain: 'pds-diary-sterran.firebaseapp.com',
  projectId: 'pds-diary-sterran',
  appId: '1:294022249197:web:cc509e4c9ae4289879eae4'
};

export const IDENTITY = 'https://identitytoolkit.googleapis.com/v1';
export const SECURETOKEN = 'https://securetoken.googleapis.com/v1';
export const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;
// 6번 과제의 무로그인 저장소 — 최초 로그인 시 내 계정으로 옮기는 읽기 전용 출처
export const LEGACY_DOC_URL = 'https://pds-diary-sterran-default-rtdb.firebaseio.com/pds-diary-v1.json';
