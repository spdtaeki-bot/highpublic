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
  establishmentName: string;
  recordIds: string[];
  depositorName: string;
  amount: number;
  time: string;
  method: Exclude<PaymentMethod, "UNPAID">;
  collectedAt: Date;
}

export interface BulkCollectionSaveResult {
  appliedOperationIds: string[];
  skippedOperationIds: string[];
}

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

export function collectionOperationAlreadyExists(
  records: DispatchRecord[],
  operationId: string,
) {
  return records.some((record) =>
    record.collectionHistory?.some((entry) => entry.operationId === operationId),
  );
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
