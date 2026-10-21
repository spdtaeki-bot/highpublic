import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase/firestore";
import type { DispatchRecord } from "../types.ts";
import {
  annotateBulkCollectionOverpayments,
  collectionOperationAlreadyExists,
  commitBulkCollectionPlan,
  commitBulkCollectRestore,
  createBulkCollectionOperationId,
  createBulkCollectionOverrideOperationId,
  formatBulkOverpaymentWarning,
  getCollectionOperationDuplicateStatus,
  getRecentOperationDuplicateStatus,
  parseBulkAmount,
  parseBulkTime,
  planBulkCollectionWrites,
  projectBulkCollectionUnpaidTotals,
  serializeBulkCollectBackup,
  type BulkCollectionOperation,
} from "./bulkCollect.ts";
import {
  buildEstablishmentAdditionalCollectUpdates,
  calculateEstablishmentCollection,
} from "./utils.ts";
import { overlayRecordPatches } from "./optimisticCollect.ts";

function record(id: string): DispatchRecord {
  const stamp = Timestamp.fromDate(new Date("2026-10-20T20:00:00"));
  return {
    id,
    staffName: id,
    establishmentName: "미술관",
    systemType: "TABLE",
    startTime: stamp,
    endTime: stamp,
    durationHours: 1,
    totalAmount: 100000,
    commission: 0,
    staffPayment: 0,
    paymentMethod: "UNPAID",
    date: "2026-10-20",
    createdAt: stamp,
    uid: "sample",
  };
}

test("표현만 다른 같은 일괄 수금은 같은 중복 방지 키를 만든다", () => {
  const first = createBulkCollectionOperationId({
    targetKey: "2026-10-20___미술관",
    collectedDate: "2026-10-20",
    time: "1931",
    depositorName: " 이태희 ",
    amount: 300000,
    method: "TRANSFER",
  });
  const second = createBulkCollectionOperationId({
    targetKey: "2026-10-20___미술관",
    collectedDate: "2026-10-20",
    time: "19:31",
    depositorName: "이태희",
    amount: 300000,
    method: "TRANSFER",
  });
  assert.equal(first, second);
  assert.notEqual(
    first,
    createBulkCollectionOperationId({
      targetKey: "2026-10-20___미술관",
      collectedDate: "2026-10-20",
      time: "1932",
      depositorName: "이태희",
      amount: 300000,
      method: "TRANSFER",
    }),
  );
});

test("금액과 시간은 저장 가능한 값만 정규화한다", () => {
  assert.equal(parseBulkAmount("1,450,000원"), 1450000);
  assert.equal(parseBulkAmount(""), 0);
  assert.equal(parseBulkTime("19:31"), "1931");
  assert.equal(parseBulkTime("2460"), null);
  assert.equal(parseBulkTime("193"), null);
});

test("operationId가 공용 수금 이력 전체에 저장되어 재시도를 찾는다", () => {
  const records = [record("a"), record("b")];
  const operationId = "bulk-fixed";
  const result = buildEstablishmentAdditionalCollectUpdates(records, {
    method: "TRANSFER",
    additionalAmount: 200000,
    depositorName: "이태희",
    operationId,
    collectedAt: Timestamp.fromDate(new Date("2026-10-20T19:31:00")),
  });
  assert.equal(result.error, undefined);
  const applied = overlayRecordPatches(records, result.updates);
  assert.equal(collectionOperationAlreadyExists(applied, operationId), true);
  assert.equal(
    applied.every((item) =>
      item.collectionHistory?.some((entry) => entry.operationId === operationId),
    ),
    true,
  );
});

test("입금자가 비어 있고 operationId가 없어도 날짜·시간·금액·수단으로 중복을 찾는다", () => {
  const existing = record("legacy-bulk");
  existing.collectionHistory = [{
    collectedAt: Timestamp.fromDate(new Date(2026, 9, 15, 13, 49, 0, 0)),
    amount: 10000,
    paymentMethod: "TRANSFER",
    isShared: true,
  }];
  const operation = {
    operationId: createBulkCollectionOperationId({
      targetKey: "2026-10-15___리치",
      collectedDate: "2026-10-15",
      time: "1349",
      depositorName: "",
      amount: 10000,
      method: "TRANSFER",
    }),
    targetKey: "2026-10-15___리치",
    businessDate: "2026-10-15",
    collectedDate: "2026-10-15",
    establishmentName: "리치",
    recordIds: ["legacy-bulk"],
    depositorName: "",
    amount: 10000,
    time: "1349",
    method: "TRANSFER" as const,
    collectedAt: new Date(2026, 9, 15, 13, 49, 0, 0),
  };

  assert.equal(
    collectionOperationAlreadyExists([existing], operation.operationId, operation),
    true,
  );
  assert.equal(
    collectionOperationAlreadyExists(
      [existing],
      operation.operationId,
      { ...operation, collectedDate: "2026-10-16" },
    ),
    false,
  );
  assert.equal(
    getCollectionOperationDuplicateStatus(
      [existing],
      operation.operationId,
      { ...operation, time: "1408" },
    ),
    "SUSPECTED",
  );
  assert.equal(
    getRecentOperationDuplicateStatus(
      [operation],
      {
        ...operation,
        operationId: createBulkCollectionOperationId({
          ...operation,
          time: "1408",
        }),
        time: "1408",
        collectedAt: new Date(2026, 9, 15, 14, 8, 0, 0),
      },
    ),
    "SUSPECTED",
  );
  assert.notEqual(
    createBulkCollectionOverrideOperationId(operation.operationId, "first"),
    createBulkCollectionOverrideOperationId(operation.operationId, "second"),
  );
});

function operation(partial: Partial<BulkCollectionOperation> & Pick<BulkCollectionOperation, "amount" | "targetKey" | "establishmentName">): BulkCollectionOperation {
  const collectedAt = partial.collectedAt ?? new Date("2026-10-20T19:31:00");
  return {
    operationId: partial.operationId ?? `op-${partial.establishmentName}-${partial.amount}`,
    targetKey: partial.targetKey,
    businessDate: partial.businessDate ?? "2026-10-20",
    collectedDate: partial.collectedDate ?? "2026-10-20",
    establishmentName: partial.establishmentName,
    recordIds: partial.recordIds ?? [],
    depositorName: partial.depositorName ?? "이태희",
    amount: partial.amount,
    time: partial.time ?? "1931",
    method: partial.method ?? "TRANSFER",
    collectedAt,
  };
}

test("입금액이 업소·날짜 미수를 넘으면 초과액을 알리고 금액은 그대로 둔다", () => {
  const rows = [
    {
      targetKey: "2026-10-20___명품",
      amount: 175000,
      outstanding: 150000,
    },
    {
      targetKey: "2026-10-20___명품",
      amount: 80000,
      outstanding: 150000,
    },
    {
      targetKey: "2026-10-20___리치",
      amount: 100000,
      outstanding: 200000,
      excludedFromDefaultSave: true,
    },
  ];
  const annotated = annotateBulkCollectionOverpayments(rows);
  assert.equal(annotated[0].overpayment?.excess, 25000);
  assert.equal(annotated[0].overpayment?.outstanding, 150000);
  assert.equal(annotated[0].overpayment?.onlySaveAll, false);
  assert.equal(annotated[0].amount, 175000);
  assert.equal(annotated[1].overpayment?.outstanding, 0);
  assert.equal(annotated[1].overpayment?.excess, 80000);
  assert.equal(annotated[2].overpayment, undefined);
  assert.equal(
    formatBulkOverpaymentWarning({
      establishmentName: "명품",
      businessDate: "2026-10-20",
      outstanding: 150000,
      amount: 175000,
      excess: 25000,
    }),
    "명품 10/20 미수 15만, 입금 17.5만 · 2.5만 초과",
  );

  const split = annotateBulkCollectionOverpayments([
    { targetKey: "2026-10-20___명품", amount: 100000, outstanding: 150000 },
    { targetKey: "2026-10-20___명품", amount: 80000, outstanding: 150000 },
  ]);
  assert.equal(split[0].overpayment, undefined);
  assert.equal(split[1].overpayment?.excess, 30000);
  assert.equal(split[1].overpayment?.outstanding, 50000);
});

test("저장 전후 총미수금은 총미수금 화면과 같은 함수로 합산하고 공용 수금은 한 번만 센다", () => {
  const first = record("a");
  const second = record("b");
  first.totalAmount = 150000;
  second.totalAmount = 150000;
  first.establishmentName = "명품";
  second.establishmentName = "명품";
  const rich = record("rich");
  rich.establishmentName = "리치";
  rich.totalAmount = 200000;
  const paid = record("paid");
  paid.establishmentName = "완납";
  paid.totalAmount = 100000;
  paid.paymentMethod = "TRANSFER";
  const groups = [
    {
      key: "2026-10-20___명품",
      businessDate: "2026-10-20",
      establishmentName: "명품",
      records: [first, second],
    },
    {
      key: "2026-10-20___리치",
      businessDate: "2026-10-20",
      establishmentName: "리치",
      records: [rich],
    },
    {
      key: "2026-10-20___완납",
      businessDate: "2026-10-20",
      establishmentName: "완납",
      records: [paid],
    },
  ];
  const screenTotal = groups.reduce(
    (sum, group) => sum + calculateEstablishmentCollection(group.records).unpaidAmount,
    0,
  );
  const beforeHistory = first.collectionHistory?.length ?? 0;
  const projected = projectBulkCollectionUnpaidTotals(groups, [
    operation({
      targetKey: "2026-10-20___명품",
      establishmentName: "명품",
      amount: 100000,
      recordIds: ["a", "b"],
    }),
  ]);
  assert.equal(projected.beforeTotal, screenTotal);
  assert.equal(projected.beforeTotal, 500000);
  assert.equal(projected.afterTotal, 400000);
  assert.deepEqual(
    projected.changes.map((change) => [change.establishmentName, change.before, change.after]),
    [["명품", 300000, 200000]],
  );
  assert.equal(first.collectionHistory?.length ?? 0, beforeHistory);

  const overpaid = projectBulkCollectionUnpaidTotals(
    [groups[0]],
    [operation({
      targetKey: "2026-10-20___명품",
      establishmentName: "명품",
      amount: 350000,
      recordIds: ["a", "b"],
    })],
  );
  assert.equal(overpaid.beforeTotal, 300000);
  assert.equal(overpaid.afterTotal, 0);
  assert.equal(overpaid.changes[0].after, 0);
});

test("저장 직전에 원본 문서를 백업하고 확인된 백업으로만 되돌린다", () => {
  const original = record("dispatch-1");
  original.establishmentName = "명품";
  original.totalAmount = 150000;
  const raw = {
    staffName: original.staffName,
    establishmentName: "명품",
    totalAmount: 150000,
    paymentMethod: "UNPAID",
    customMarker: "original",
    collectedAmount: 0,
  };
  const recordsById = new Map([["dispatch-1", original]]);
  const rawById = new Map<string, Record<string, unknown>>([["dispatch-1", raw]]);
  const createdAt = new Date("2026-10-21T04:05:06.000Z");
  const plan = planBulkCollectionWrites({
    operations: [operation({
      operationId: "bulk-over",
      targetKey: "2026-10-20___명품",
      establishmentName: "명품",
      businessDate: "2026-10-20",
      amount: 175000,
      recordIds: ["dispatch-1"],
    })],
    recordsById,
    rawById,
    createdAt,
    backupId: "bulk-backup-test",
    collectedAtFor: (item) => Timestamp.fromDate(item.collectedAt),
  });

  assert.ok(plan.backup);
  assert.equal(plan.backup?.backupId, "bulk-backup-test");
  assert.equal(plan.backup?.createdAt, "2026-10-21T04:05:06.000Z");
  assert.deepEqual(plan.backup?.operationIds, ["bulk-over"]);
  assert.equal(plan.backup?.documents[0].data.customMarker, "original");
  assert.equal(plan.backup?.documents[0].data.collectedAmount, 0);
  assert.equal(plan.backup?.documents[0].data.collectionHistory, undefined);
  const history = plan.updates[0]?.updates.collectionHistory;
  assert.ok(Array.isArray(history));
  assert.equal(history?.[history.length - 1]?.amount, 175000);

  const store = new Map<string, Record<string, unknown>>([["dispatch-1", { ...raw }]]);
  const backups = new Map<string, NonNullable<typeof plan.backup>>();
  const order: string[] = [];
  commitBulkCollectionPlan(plan, {
    setBackup: (backup) => {
      order.push("backup");
      backups.set(backup.backupId, backup);
    },
    updateRecord: (id, updates) => {
      order.push(`update:${id}`);
      store.set(id, { ...store.get(id), ...updates });
    },
  });
  assert.deepEqual(order, ["backup", "update:dispatch-1"]);
  assert.equal(
    (store.get("dispatch-1")?.collectionHistory as Array<{ amount?: number }> | undefined)?.at(-1)?.amount,
    175000,
  );
  assert.equal(backups.get("bulk-backup-test")?.documents[0].data.customMarker, "original");
  assert.equal(backups.get("bulk-backup-test")?.documents[0].data.collectionHistory, undefined);

  const json = serializeBulkCollectBackup(plan.backup!);
  assert.match(json, /"backupId": "bulk-backup-test"/);
  assert.match(json, /"operationIds"/);
  assert.match(json, /original/);
  assert.doesNotMatch(json, /1차 수금/);

  const restoredOrder: string[] = [];
  const outcome = commitBulkCollectRestore(backups.get("bulk-backup-test"), {
    setRecord: (id, data) => {
      restoredOrder.push(`set:${id}`);
      store.set(id, data);
    },
    markRestored: (restoredAt) => {
      restoredOrder.push("restored");
      const backup = backups.get("bulk-backup-test");
      if (backup) backups.set("bulk-backup-test", { ...backup, restoredAt });
    },
  }, new Date("2026-10-21T05:00:00.000Z"));
  assert.deepEqual(restoredOrder, ["set:dispatch-1", "restored"]);
  assert.equal(store.get("dispatch-1")?.paymentMethod, "UNPAID");
  assert.equal(store.get("dispatch-1")?.customMarker, "original");
  assert.equal(store.get("dispatch-1")?.collectionHistory, undefined);
  assert.equal(outcome.restored?.restoredAt, "2026-10-21T05:00:00.000Z");

  const second = commitBulkCollectRestore(backups.get("bulk-backup-test"), {
    setRecord: () => {
      throw new Error("이미 되돌린 백업은 다시 쓰면 안 됩니다.");
    },
    markRestored: () => {
      throw new Error("이미 되돌린 백업은 다시 표시하면 안 됩니다.");
    },
  });
  assert.equal(second.error, "이미 되돌린 일괄 수금입니다.");
  assert.equal(second.restored, undefined);
  assert.equal(commitBulkCollectRestore(undefined, {
    setRecord: () => {},
    markRestored: () => {},
  }).error, "되돌릴 백업을 찾지 못했습니다.");
});
