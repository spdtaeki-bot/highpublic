import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase/firestore";
import type { DispatchRecord } from "../types.ts";
import {
  collectionOperationAlreadyExists,
  createBulkCollectionOperationId,
  parseBulkAmount,
  parseBulkTime,
} from "./bulkCollect.ts";
import { buildEstablishmentAdditionalCollectUpdates } from "./utils.ts";
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
});
