// @ts-ignore JSON config has no generated module types.
import firebaseConfig from "../firebase-applet-config.json";

export const ALL_OFF_CAPTURES_KEY = "office_all_off_group_captures";

/** 전원 퇴근 캡쳐 완료 표시는 최근 영업일만 남긴다. */
export const ALL_OFF_CAPTURE_RETENTION_DAYS = 14;
/** 하루에도 퇴근 시각이 바뀔 때마다 키가 생기므로 개수도 상한을 둔다. */
export const ALL_OFF_CAPTURE_MAX_ENTRIES = 200;

const CAPTURE_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})::/;

/** 멀티탭 조율용 localStorage. 문서 본문이 아니라 탭 메타데이터다. */
const FIRESTORE_COORDINATION_PREFIXES = [
  "firestore_clients_",
  "firestore_mutations_",
  "firestore_targets_",
  "firestore_zombie_",
];

const STALE_COORDINATION_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_COORDINATION_KEYS = 80;

const PENDING_INDEXED_DB_WIPE_KEY = "office_pending_indexeddb_wipe";

type CaptureMap = Record<string, true>;

export function pruneAllOffCaptureMap(
  captures: CaptureMap,
  now: Date = new Date(),
  retentionDays: number = ALL_OFF_CAPTURE_RETENTION_DAYS,
  maxEntries: number = ALL_OFF_CAPTURE_MAX_ENTRIES,
): CaptureMap {
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (retentionDays - 1));
  const cutoffMs = cutoff.getTime();

  const kept: { key: string; dateMs: number }[] = [];
  for (const [key, value] of Object.entries(captures)) {
    if (value !== true) continue;
    const dateMs = captureDateMs(key);
    if (dateMs === null || dateMs < cutoffMs) continue;
    kept.push({ key, dateMs });
  }

  kept.sort((a, b) => b.dateMs - a.dateMs || (a.key < b.key ? 1 : -1));
  const pruned: CaptureMap = {};
  for (const entry of kept.slice(0, maxEntries)) {
    pruned[entry.key] = true;
  }
  return pruned;
}

export function isBrowserStorageQuotaError(error: unknown): boolean {
  if (typeof error === "string") {
    return /QuotaExceededError|NS_ERROR_DOM_QUOTA_REACHED|exceeded the quota/i.test(
      error,
    );
  }
  if (!error || typeof error !== "object") return false;

  const name = "name" in error ? String(error.name) : "";
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return true;
  }

  const code = "code" in error ? error.code : undefined;
  if (code === "resource-exhausted") return false;

  const message = "message" in error ? String(error.message) : "";
  return (
    /QuotaExceededError|NS_ERROR_DOM_QUOTA_REACHED|exceeded the quota/i.test(
      message,
    ) && /setItem|Storage|IndexedDB|IDBDatabase|Cache/i.test(`${name} ${message}`)
  );
}

export function readAllOffCaptures(now: Date = new Date()): CaptureMap {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(
      localStorage.getItem(ALL_OFF_CAPTURES_KEY) || "{}",
    );
    if (!isCaptureMap(parsed)) {
      localStorage.removeItem(ALL_OFF_CAPTURES_KEY);
      return {};
    }
    const pruned = pruneAllOffCaptureMap(parsed, now);
    if (!sameCaptureKeys(parsed, pruned)) {
      writeCaptureMap(pruned);
    }
    return pruned;
  } catch (error) {
    console.warn("캡쳐 완료 표시를 읽지 못했습니다:", error);
    try {
      localStorage.removeItem(ALL_OFF_CAPTURES_KEY);
    } catch {
      // 저장소가 이미 잠겨 있으면 다음 복구 버튼에서 지운다.
    }
    return {};
  }
}

export function persistAllOffCaptures(
  captures: CaptureMap,
  now: Date = new Date(),
): CaptureMap {
  const pruned = pruneAllOffCaptureMap(captures, now);
  writeCaptureMap(pruned);
  return pruned;
}

export function safeSetItem(key: string, value: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (!isBrowserStorageQuotaError(error)) {
      console.warn("localStorage 저장 실패:", error);
      return false;
    }
    try {
      if (key !== ALL_OFF_CAPTURES_KEY) {
        localStorage.removeItem(ALL_OFF_CAPTURES_KEY);
      }
      pruneStaleFirestoreCoordinationStorage(Date.now(), 0);
      localStorage.setItem(key, value);
      return true;
    } catch (retryError) {
      console.warn("localStorage 저장 재시도 실패:", retryError);
      return false;
    }
  }
}

/**
 * 죽은 탭이 남긴 Firestore 멀티탭 키를 지운다.
 * `maxAgeMs`가 0이면 조율 키를 모두 지운다. 로그인 플래그는 건드리지 않는다.
 */
export function pruneStaleFirestoreCoordinationStorage(
  now: number = Date.now(),
  maxAgeMs: number = STALE_COORDINATION_MS,
): void {
  if (typeof localStorage === "undefined") return;
  try {
    const keys = snapshotLocalStorageKeys().filter(isCoordinationKey);
    const removable = keys.filter((key) => {
      if (maxAgeMs <= 0) return true;
      const updated = readStoredTime(localStorage.getItem(key));
      return updated === null || now - updated > maxAgeMs;
    });
    for (const key of removable) {
      localStorage.removeItem(key);
    }

    if (maxAgeMs <= 0) return;

    const remaining = snapshotLocalStorageKeys()
      .filter(isCoordinationKey)
      .map((key) => ({
        key,
        updated: readStoredTime(localStorage.getItem(key)) ?? 0,
      }))
      .sort((a, b) => a.updated - b.updated);
    const excess = remaining.length - MAX_COORDINATION_KEYS;
    for (let i = 0; i < excess; i++) {
      localStorage.removeItem(remaining[i].key);
    }
  } catch (error) {
    console.warn("Firestore 탭 조율 저장소 정리 실패:", error);
  }
}

export function firestoreIndexedDbName(
  projectId: string = firebaseConfig.projectId,
  databaseId: string = firebaseConfig.firestoreDatabaseId,
): string {
  const database =
    databaseId && databaseId !== "(default)"
      ? `${projectId}.${databaseId}`
      : projectId;
  return `firestore/[DEFAULT]/${database}/main`;
}

export async function clearAllSiteData(): Promise<void> {
  try {
    localStorage.clear();
  } catch (error) {
    console.warn("localStorage 삭제 실패:", error);
  }
  try {
    sessionStorage.clear();
  } catch (error) {
    console.warn("sessionStorage 삭제 실패:", error);
  }
  try {
    sessionStorage.setItem(PENDING_INDEXED_DB_WIPE_KEY, "1");
  } catch (error) {
    console.warn("IndexedDB 삭제 예약 실패:", error);
  }

  if (typeof caches !== "undefined") {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch (error) {
      console.warn("Cache Storage 삭제 실패:", error);
    }
  }

  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch (error) {
      console.warn("서비스 워커 해제 실패:", error);
    }
  }

  await deleteAllIndexedDatabases();
}

/** Firestore를 열기 전에 호출한다. 복구 버튼이 예약해 둔 IndexedDB 삭제를 끝낸다. */
export async function consumePendingIndexedDbWipe(): Promise<void> {
  if (typeof sessionStorage === "undefined") return;
  if (sessionStorage.getItem(PENDING_INDEXED_DB_WIPE_KEY) !== "1") return;
  sessionStorage.removeItem(PENDING_INDEXED_DB_WIPE_KEY);
  await deleteAllIndexedDatabases();
}

async function deleteAllIndexedDatabases(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const names = new Set<string>([
    firestoreIndexedDbName(),
    "firebase-heartbeat-database",
    "firebase-installations-database",
  ]);
  if (typeof indexedDB.databases === "function") {
    try {
      const databases = await indexedDB.databases();
      for (const database of databases) {
        if (database.name) names.add(database.name);
      }
    } catch (error) {
      console.warn("IndexedDB 목록 조회 실패:", error);
    }
  }
  await Promise.all([...names].map((name) => deleteDatabase(name)));
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = finish;
      request.onerror = finish;
      request.onblocked = finish;
    } catch (error) {
      console.warn(`IndexedDB 삭제 실패 (${name}):`, error);
      finish();
    }
  });
}

function writeCaptureMap(captures: CaptureMap): void {
  const payload = JSON.stringify(captures);
  try {
    localStorage.setItem(ALL_OFF_CAPTURES_KEY, payload);
  } catch (error) {
    if (!isBrowserStorageQuotaError(error)) {
      console.warn("캡쳐 완료 표시 저장 실패:", error);
      return;
    }
    try {
      pruneStaleFirestoreCoordinationStorage(Date.now(), 0);
      localStorage.removeItem(ALL_OFF_CAPTURES_KEY);
      localStorage.setItem(ALL_OFF_CAPTURES_KEY, payload);
    } catch (retryError) {
      console.warn("캡쳐 완료 표시 저장 재시도 실패:", retryError);
    }
  }
}

function captureDateMs(key: string): number | null {
  const match = CAPTURE_DATE_PREFIX.exec(key);
  if (!match) return null;
  const parsed = Date.parse(`${match[1]}T00:00:00`);
  return Number.isNaN(parsed) ? null : parsed;
}

function isCaptureMap(value: unknown): value is CaptureMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => entry === true);
}

function sameCaptureKeys(left: CaptureMap, right: CaptureMap): boolean {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => right[key] === true);
}

function isCoordinationKey(key: string): boolean {
  return FIRESTORE_COORDINATION_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function snapshotLocalStorageKeys(): string[] {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

function readStoredTime(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "number" && Number.isFinite(parsed)) return parsed;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.updateTimeMs === "number" &&
      Number.isFinite(parsed.updateTimeMs)
    ) {
      return parsed.updateTimeMs;
    }
  } catch {
    return null;
  }
  return null;
}
