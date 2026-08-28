import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
// @ts-ignore
import firebaseConfig from './firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
// 인증(Auth) 기능을 완전히 제거하여 브라우저 계정 충돌을 원천 차단합니다.
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// 오프라인 지속성 활성화 (서버 연결 없이도 앱이 즉시 뜨도록 함)
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      // 여러 탭이 열려있을 때 발생할 수 있음
      console.warn('Firestore persistence failed: multiple tabs open');
    } else if (err.code === 'unimplemented') {
      // 브라우저가 지원하지 않을 때
      console.warn('Firestore persistence is not supported by this browser');
    }
  });
}
