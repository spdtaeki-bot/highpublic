import type { DispatchRecord, PaymentMethod } from "../types";
import {
  buildEstablishmentAdditionalCollectUpdates,
  calculateEstablishmentCollection,
  getRecordBusinessDate,
} from "./utils";

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

export interface BulkCollectBackupDocument {
  id: string;
  data: Record<string, unknown>;
}

/** 일괄 수금 저장 직전 원본 문서 스냅샷. Firestore `bulkCollectBackups` 와 JSON 내려받기가 같은 내용이다. */
export interface BulkCollectBackup {
  backupId: string;
  createdAt: string;
  operationIds: string[];
  documents: BulkCollectBackupDocument[];
  restoredAt?: string;
}

export interface BulkCollectionSaveResult {
  appliedOperationIds: string[];
  skippedOperationIds: string[];
  backup?: BulkCollectBackup | null;
}

export const BULK_COLLECT_BACKUP_COLLECTION = "bulkCollectBackups";

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

export interface BulkOverpaymentHit {
  index: number;
  /** 이 행을 적용하기 직전의 남은 미수 */
  outstanding: number;
  excess: number;
}

/**
 * 같은 업소·날짜의 미수를 미리보기 순서대로 줄여 가며, 행 금액이 남은 미수를 넘으면 초과액을 돌려준다.
 * 금액은 자르지 않는다. active 가 false 인 행은 기본 저장에서 빠지는 중복이라 남은 미수를 소모하지 않는다.
 */
export function detectBulkCollectionOverpayments(
  rows: Array<{
    targetKey: string;
    amount: number;
    outstanding: number;
    active?: boolean;
  }>,
): BulkOverpaymentHit[] {
  const remaining = new Map<string, number>();
  const hits: BulkOverpaymentHit[] = [];
  rows.forEach((row, index) => {
    if (row.active === false) return;
    if (!remaining.has(row.targetKey)) remaining.set(row.targetKey, row.outstanding);
    const outstanding = remaining.get(row.targetKey) ?? 0;
    if (row.amount > outstanding) {
      hits.push({
        index,
        outstanding,
        excess: row.amount - outstanding,
      });
    }
    remaining.set(row.targetKey, Math.max(0, outstanding - row.amount));
  });
  return hits;
}

export interface AnnotatedBulkOverpayment {
  /** 기본 저장(중복 제외) 기준 초과. 전부 저장에서만 넘치면 onlySaveAll */
  outstanding: number;
  excess: number;
  onlySaveAll: boolean;
  saveAllExcess: number;
}

export function annotateBulkCollectionOverpayments<
  T extends {
    targetKey: string;
    amount: number;
    outstanding: number;
    excludedFromDefaultSave?: boolean;
  },
>(rows: T[]): Array<T & { overpayment?: AnnotatedBulkOverpayment }> {
  const entered = new Map(
    detectBulkCollectionOverpayments(rows.map((row) => ({ ...row, active: true }))).map(
      (hit) => [hit.index, hit],
    ),
  );
  const saving = new Map(
    detectBulkCollectionOverpayments(
      rows.map((row) => ({ ...row, active: !row.excludedFromDefaultSave })),
    ).map((hit) => [hit.index, hit]),
  );
  return rows.map((row, index) => {
    const enteredHit = entered.get(index);
    const savingHit = saving.get(index);
    if (!enteredHit && !savingHit) return row;
    const primary = savingHit ?? enteredHit!;
    return {
      ...row,
      overpayment: {
        outstanding: primary.outstanding,
        excess: primary.excess,
        onlySaveAll: !savingHit,
        saveAllExcess: enteredHit?.excess ?? primary.excess,
      },
    };
  });
}

/** 15만, 17.5만, 2.5만 처럼 총미수금 화면에서 쓰는 만 단위 표기 */
export function formatManWon(amount: number) {
  const man = Math.round((amount / 10000) * 10000) / 10000;
  const text = Number.isInteger(man)
    ? man.toLocaleString("ko-KR")
    : man.toLocaleString("ko-KR", { maximumFractionDigits: 4 });
  return `${text}만`;
}

export function formatBulkOverpaymentWarning(input: {
  establishmentName: string;
  businessDate: string;
  outstanding: number;
  amount: number;
  excess: number;
}) {
  const dateLabel = input.businessDate.length >= 10
    ? input.businessDate.slice(5).replace("-", "/")
    : input.businessDate;
  return `${input.establishmentName} ${dateLabel} 미수 ${formatManWon(input.outstanding)}, 입금 ${formatManWon(input.amount)} · ${formatManWon(input.excess)} 초과`;
}

export interface BulkUnpaidGroup {
  key: string;
  businessDate: string;
  establishmentName: string;
  records: DispatchRecord[];
}

export interface BulkUnpaidChange {
  key: string;
  businessDate: string;
  establishmentName: string;
  before: number;
  after: number;
}

/**
 * 총미수금 화면과 같이 업소·날짜마다 calculateEstablishmentCollection 의 unpaidAmount 를 합산한다.
 * 저장 후 값은 일괄 수금 갱신을 적용한 뒤 같은 함수로 다시 합산한다. 초과 입금도 금액을 줄이지 않는다.
 */
export function projectBulkCollectionUnpaidTotals(
  groups: BulkUnpaidGroup[],
  operations: BulkCollectionOperation[],
  collectedAtFor: (operation: BulkCollectionOperation) => unknown = (operation) =>
    operation.collectedAt,
): {
  beforeTotal: number;
  afterTotal: number;
  changes: BulkUnpaidChange[];
  error?: string;
} {
  const beforeByKey = new Map<string, number>();
  let beforeTotal = 0;
  const working = new Map<string, DispatchRecord[]>();
  for (const group of groups) {
    const unpaid = calculateEstablishmentCollection(group.records).unpaidAmount;
    beforeByKey.set(group.key, unpaid);
    beforeTotal += unpaid;
    working.set(
      group.key,
      group.records.map((record) => ({
        ...record,
        collectionHistory: record.collectionHistory?.map((entry) => ({ ...entry })),
      })),
    );
  }

  let error: string | undefined;
  for (const operation of operations) {
    const records = working.get(operation.targetKey);
    if (!records) continue;
    const { updates, error: updateError } = buildEstablishmentAdditionalCollectUpdates(
      records,
      {
        method: operation.method,
        additionalAmount: operation.amount,
        depositorName: operation.depositorName,
        operationId: operation.operationId,
        collectedAt: collectedAtFor(operation),
      },
    );
    if (updateError) {
      error = updateError;
      break;
    }
    for (const update of updates) {
      const index = records.findIndex((record) => record.id === update.id);
      if (index >= 0) records[index] = { ...records[index], ...update.updates };
    }
  }

  let afterTotal = 0;
  const changes: BulkUnpaidChange[] = [];
  for (const group of groups) {
    const before = beforeByKey.get(group.key) ?? 0;
    const after = error
      ? before
      : calculateEstablishmentCollection(working.get(group.key) || []).unpaidAmount;
    afterTotal += after;
    if (before !== after) {
      changes.push({
        key: group.key,
        businessDate: group.businessDate,
        establishmentName: group.establishmentName,
        before,
        after,
      });
    }
  }

  return { beforeTotal, afterTotal, changes, error };
}

function cloneSnapshotValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneSnapshotValue);
  if (!value || typeof value !== "object") return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof (value as { toDate?: unknown }).toDate === "function") return value;
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item !== undefined) copy[key] = cloneSnapshotValue(item);
  }
  return copy;
}

function snapshotRecordData(record: DispatchRecord): Record<string, unknown> {
  const { id: _id, ...data } = record;
  return cloneSnapshotValue(data) as Record<string, unknown>;
}

export function createBulkCollectBackupId(
  createdAt: Date,
  operationIds: string[],
  nonce = "",
) {
  return `bulk-backup-${createdAt.getTime().toString(36)}-${hash(`${nonce}|${operationIds.join("|")}`)}`;
}

export function buildBulkCollectBackup(input: {
  createdAt: Date;
  operationIds: string[];
  documents: BulkCollectBackupDocument[];
  backupId?: string;
  nonce?: string;
}): BulkCollectBackup {
  return {
    backupId:
      input.backupId ||
      createBulkCollectBackupId(input.createdAt, input.operationIds, input.nonce),
    createdAt: input.createdAt.toISOString(),
    operationIds: [...input.operationIds],
    documents: input.documents.map((document) => ({
      id: document.id,
      data: cloneSnapshotValue(document.data) as Record<string, unknown>,
    })),
  };
}

export interface PlannedBulkCollectionWrite {
  appliedOperationIds: string[];
  skippedOperationIds: string[];
  updates: Array<{ id: string; updates: Partial<DispatchRecord> }>;
  backup: BulkCollectBackup | null;
}

/**
 * 트랜잭션이 문서를 다시 읽은 뒤 호출한다.
 * backup.documents 는 갱신 전 원본이고, updates 는 그 다음에 쓸 내용이다.
 */
export function planBulkCollectionWrites(input: {
  operations: BulkCollectionOperation[];
  recordsById: Map<string, DispatchRecord>;
  rawById?: Map<string, Record<string, unknown>>;
  createdAt?: Date;
  backupId?: string;
  nonce?: string;
  collectedAtFor?: (operation: BulkCollectionOperation) => unknown;
}): PlannedBulkCollectionWrite {
  const createdAt = input.createdAt ?? new Date();
  const collectedAtFor = input.collectedAtFor ?? ((operation) => operation.collectedAt);
  const current = new Map<string, DispatchRecord>();
  input.recordsById.forEach((record, id) => {
    current.set(id, {
      ...record,
      collectionHistory: record.collectionHistory?.map((entry) => ({ ...entry })),
    });
  });

  const pendingUpdates = new Map<string, Partial<DispatchRecord>>();
  const appliedOperationIds: string[] = [];
  const skippedOperationIds: string[] = [];

  for (const operation of input.operations) {
    const targetRecords = operation.recordIds.flatMap((id) => {
      const record = current.get(id);
      return record ? [record] : [];
    });
    if (targetRecords.length !== operation.recordIds.length) {
      throw new Error(`[${operation.establishmentName}] 저장할 원본 기록을 찾지 못했습니다.`);
    }
    if (
      targetRecords.some(
        (record) =>
          record.establishmentName !== operation.establishmentName ||
          getRecordBusinessDate(record) !== operation.businessDate,
      )
    ) {
      throw new Error(
        `[${operation.establishmentName}] 저장 대상이 미리보기 이후 변경되었습니다.`,
      );
    }
    if (
      collectionOperationAlreadyExists(targetRecords, operation.operationId) ||
      (
        !operation.duplicateOverride &&
        collectionOperationAlreadyExists(targetRecords, operation.operationId, operation)
      )
    ) {
      skippedOperationIds.push(operation.operationId);
      continue;
    }

    const { updates, error } = buildEstablishmentAdditionalCollectUpdates(targetRecords, {
      method: operation.method,
      additionalAmount: operation.amount,
      depositorName: operation.depositorName,
      operationId: operation.operationId,
      collectedAt: collectedAtFor(operation),
    });
    if (error) throw new Error(`[${operation.establishmentName}] ${error}`);

    for (const update of updates) {
      pendingUpdates.set(update.id, update.updates);
      const existing = current.get(update.id);
      if (existing) current.set(update.id, { ...existing, ...update.updates });
    }
    appliedOperationIds.push(operation.operationId);
  }

  const documents = [...pendingUpdates.keys()].map((id) => ({
    id,
    data: cloneSnapshotValue(
      input.rawById?.get(id) ?? snapshotRecordData(input.recordsById.get(id)!),
    ) as Record<string, unknown>,
  }));
  const backup = documents.length === 0
    ? null
    : buildBulkCollectBackup({
        createdAt,
        operationIds: appliedOperationIds,
        documents,
        backupId: input.backupId,
        nonce: input.nonce,
      });

  return {
    appliedOperationIds,
    skippedOperationIds,
    updates: [...pendingUpdates.entries()].map(([id, updates]) => ({ id, updates })),
    backup,
  };
}

/** 백업 문서를 먼저 쓰고, 그 다음 파견 기록을 갱신한다. */
export function commitBulkCollectionPlan(
  plan: PlannedBulkCollectionWrite,
  writer: {
    setBackup: (backup: BulkCollectBackup) => void;
    updateRecord: (id: string, updates: Partial<DispatchRecord>) => void;
  },
) {
  if (plan.backup) writer.setBackup(plan.backup);
  for (const update of plan.updates) writer.updateRecord(update.id, update.updates);
}

export function planBulkCollectRestore(backup: BulkCollectBackup | null | undefined): {
  error?: string;
  writes: Array<{ id: string; data: Record<string, unknown> }>;
} {
  if (!backup) return { error: "되돌릴 백업을 찾지 못했습니다.", writes: [] };
  if (backup.restoredAt) return { error: "이미 되돌린 일괄 수금입니다.", writes: [] };
  if (!backup.documents?.length) return { error: "백업에 원본 문서가 없습니다.", writes: [] };
  return {
    writes: backup.documents.map((document) => ({
      id: document.id,
      data: cloneSnapshotValue(document.data) as Record<string, unknown>,
    })),
  };
}

export function commitBulkCollectRestore(
  backup: BulkCollectBackup | null | undefined,
  writer: {
    setRecord: (id: string, data: Record<string, unknown>) => void;
    markRestored: (restoredAt: string) => void;
  },
  restoredAt: Date = new Date(),
): { error?: string; restored?: BulkCollectBackup } {
  const plan = planBulkCollectRestore(backup);
  if (plan.error || !backup) return { error: plan.error ?? "되돌릴 백업을 찾지 못했습니다." };
  for (const write of plan.writes) writer.setRecord(write.id, write.data);
  const restoredAtIso = restoredAt.toISOString();
  writer.markRestored(restoredAtIso);
  return { restored: { ...backup, restoredAt: restoredAtIso } };
}

export function serializeBulkCollectBackup(backup: BulkCollectBackup) {
  return JSON.stringify(
    backup,
    (_key, value) => {
      if (
        value &&
        typeof value === "object" &&
        typeof (value as { toDate?: unknown }).toDate === "function" &&
        typeof (value as { seconds?: unknown }).seconds === "number"
      ) {
        const date = (value as { toDate: () => Date }).toDate();
        return Number.isNaN(date.getTime()) ? value : { __timestamp: date.toISOString() };
      }
      return value;
    },
    2,
  );
}

export function bulkCollectRestorePatch(data: Record<string, unknown>): Partial<DispatchRecord> {
  return {
    ...(data as Partial<DispatchRecord>),
    collectionHistory: Array.isArray(data.collectionHistory)
      ? (data.collectionHistory as DispatchRecord["collectionHistory"])
      : [],
  };
}

export function downloadBulkCollectBackup(backup: BulkCollectBackup, doc: Document = document) {
  const json = serializeBulkCollectBackup(backup);
  const link = doc.createElement("a");
  link.download = `일괄수금백업-${backup.backupId}.json`;
  let url = "";
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    link.href = url;
  } else {
    link.href = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  }
  doc.body.appendChild(link);
  link.click();
  link.remove();
  if (url) setTimeout(() => URL.revokeObjectURL(url), 0);
}
