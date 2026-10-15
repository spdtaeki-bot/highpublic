import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
} from 'firebase/firestore';
// @ts-ignore
import firebaseConfig from './firebase-applet-config.json';
import { pruneStaleFirestoreCoordinationStorage } from './lib/siteStorage';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/**
 * 디스크 캐시 상한. 기본값(40MB)은 쓰지 않은 날짜의 문서까지 남겨 사이트 저장소가
 * 며칠 만에 한도를 넘긴다. 최근 조회분은 남기고, 그보다 오래된 캐시만 지운다.
 */
const FIRESTORE_CACHE_BYTES = 8 * 1024 * 1024;
const PENDING_INDEXED_DB_WIPE_KEY = 'office_pending_indexeddb_wipe';

function createFirestore() {
  if (typeof window !== 'undefined') {
    pruneStaleFirestoreCoordinationStorage();
    try {
      // 오프라인 지속성 및 다중 탭 지원 (모바일 사파리 및 멀티탭에서도 세션 락 없이 안전하게 동작)
      return initializeFirestore(app, {
        localCache: persistentLocalCache({
          cacheSizeBytes: FIRESTORE_CACHE_BYTES,
          tabManager: persistentMultipleTabManager(),
        }),
      }, firebaseConfig.firestoreDatabaseId);
    } catch (e) {
      console.warn('Firestore multi-tab persistence fallback:', e);
      return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
  return getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

const pendingIndexedDbWipe =
  typeof sessionStorage !== 'undefined' &&
  sessionStorage.getItem(PENDING_INDEXED_DB_WIPE_KEY) === '1';

// 복구 버튼이 IndexedDB 삭제를 예약한 경우에는 삭제가 끝난 뒤 ensureFirestore()로 연다.
export let db = pendingIndexedDbWipe ? undefined : createFirestore();

export function ensureFirestore() {
  if (!db) {
    db = createFirestore();
  }
  return db;
}
