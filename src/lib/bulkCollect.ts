import type { DispatchRecord, PaymentMethod } from "../types";

export interface BulkCollectTarget {
  key: string;
  businessDate: string;
  establishmentName: string;
  shortage: number;
  records: DispatchRecord[];
}

export interface BulkCollectionOperation {
  operationId: string;
  targetKey: string;
  businessDate: string;
  collectedDate: string;
  establishmentName: string;
  recordIds: string[];
  depositorName: string;
  amount: number;
  time: string;
  method: Exclude<PaymentMethod, "UNPAID">;
  collectedAt: Date;
  /** 중복 경고를 확인하고 전부 저장한 경우에만 true */
  duplicateOverride?: boolean;
}

export interface BulkCollectionSaveResult {
  appliedOperationIds: string[];
  skippedOperationIds: string[];
}

export type BulkCollectionDuplicateStatus = "EXACT" | "SUSPECTED";

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function hash(value: string) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

/**
 * 같은 업소·입금시각·입금자·금액·수단은 새로고침/다중 탭에서도 같은 키가 된다.
 * 저장 트랜잭션은 이 키가 기존 이력에 있으면 해당 행을 건너뛴다.
 */
export function createBulkCollectionOperationId(input: {
  targetKey: string;
  collectedDate: string;
  time: string;
  depositorName: string;
  amount: number;
  method: Exclude<PaymentMethod, "UNPAID">;
}) {
  const canonical = [
    normalizeText(input.targetKey).toLocaleLowerCase("ko"),
    input.collectedDate,
    input.time.replace(/\D/g, "").slice(0, 4),
    normalizeText(input.depositorName).toLocaleLowerCase("ko"),
    String(input.amount),
    input.method,
  ].join("|");
  return `bulk-${hash(canonical)}`;
}

function dateAndTime(raw: unknown) {
  if (!raw) return null;
  const value = raw as { toDate?: () => Date };
  const collectedAt = value.toDate ? value.toDate() : new Date(raw as string | number | Date);
  if (Number.isNaN(collectedAt.getTime())) return null;
  return {
    date: [
      collectedAt.getFullYear(),
      String(collectedAt.getMonth() + 1).padStart(2, "0"),
      String(collectedAt.getDate()).padStart(2, "0"),
    ].join("-"),
    time: [
      String(collectedAt.getHours()).padStart(2, "0"),
      String(collectedAt.getMinutes()).padStart(2, "0"),
    ].join(""),
  };
}

export function getCollectionOperationDuplicateStatus(
  records: DispatchRecord[],
  operationId: string,
  operation?: Pick<
    BulkCollectionOperation,
    "collectedDate" | "time" | "depositorName" | "amount" | "method"
  >,
): BulkCollectionDuplicateStatus | null {
  let suspected = false;
  for (const record of records) {
    for (const entry of record.collectionHistory || []) {
      if (entry.operationId === operationId) return "EXACT";
      if (!operation || entry.isShared !== true) continue;
      const collected = dateAndTime(entry.collectedAt);
      if (
        !collected ||
        collected.date !== operation.collectedDate ||
        (entry.amount || 0) !== operation.amount ||
        entry.paymentMethod !== operation.method
      ) {
        continue;
      }
      if (
        collected.time === operation.time &&
        normalizeText(entry.depositorName || "").toLocaleLowerCase("ko") ===
          normalizeText(operation.depositorName).toLocaleLowerCase("ko")
      ) {
        return "EXACT";
      }
      suspected = true;
    }
  }
  return suspected ? "SUSPECTED" : null;
}

export function getRecentOperationDuplicateStatus(
  existing: BulkCollectionOperation[],
  operation: BulkCollectionOperation,
): BulkCollectionDuplicateStatus | null {
  let suspected = false;
  for (const saved of existing) {
    if (saved.targetKey !== operation.targetKey) continue;
    if (saved.operationId === operation.operationId) return "EXACT";
    if (
      saved.collectedDate !== operation.collectedDate ||
      saved.amount !== operation.amount ||
      saved.method !== operation.method
    ) {
      continue;
    }
    if (
      saved.time === operation.time &&
      normalizeText(saved.depositorName).toLocaleLowerCase("ko") ===
        normalizeText(operation.depositorName).toLocaleLowerCase("ko")
    ) {
      return "EXACT";
    }
    suspected = true;
  }
  return suspected ? "SUSPECTED" : null;
}

export function collectionOperationAlreadyExists(
  records: DispatchRecord[],
  operationId: string,
  operation?: Pick<
    BulkCollectionOperation,
    "collectedDate" | "time" | "depositorName" | "amount" | "method"
  >,
) {
  return getCollectionOperationDuplicateStatus(records, operationId, operation) === "EXACT";
}

export function createBulkCollectionOverrideOperationId(
  operationId: string,
  overrideToken: string,
) {
  return `${operationId}-override-${hash(overrideToken)}`;
}

export function parseBulkAmount(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return 0;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseBulkTime(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length !== 4) return null;
  const hour = Number.parseInt(digits.slice(0, 2), 10);
  const minute = Number.parseInt(digits.slice(2), 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return digits;
}
