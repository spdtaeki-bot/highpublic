import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
} from 'firebase/firestore';
// @ts-ignore
import firebaseConfig from './firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// 오프라인 지속성 및 다중 탭 지원 (모바일 사파리 및 멀티탭에서도 세션 락 없이 안전하게 동작)
let firestoreDb;
if (typeof window !== 'undefined') {
  try {
    firestoreDb = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    }, firebaseConfig.firestoreDatabaseId);
  } catch (e) {
    console.warn('Firestore multi-tab persistence fallback:', e);
    firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
} else {
  firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = firestoreDb;

