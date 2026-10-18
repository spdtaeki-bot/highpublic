import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase/firestore";
import type { DispatchRecord } from "../types.ts";
import {
  buildEstablishmentAdditionalCollectUpdates,
  calculateEstablishmentCollection,
} from "./utils.ts";
import {
  collectionPatchVisible,
  overlayRecordPatches,
} from "./optimisticCollect.ts";

function record(id: string, amount: number): DispatchRecord {
  const stamp = Timestamp.fromDate(new Date("2026-10-15T20:00:00"));
  return {
    id,
    staffName: id,
    establishmentName: "사쿠라",
    systemType: "TABLE",
    startTime: stamp,
    endTime: stamp,
    durationHours: 3,
    totalAmount: amount,
    commission: 0,
    staffPayment: 0,
    paymentMethod: "UNPAID",
    date: "2026-10-15",
    createdAt: stamp,
    uid: "sample",
  };
}

test("추가수금 패치는 한 번에 덮어야 완납이고 일부만 덮으면 초과로 튄다", () => {
  const records = [record("a", 150000), record("b", 150000)];
  const { updates, error } = buildEstablishmentAdditionalCollectUpdates(records, {
    method: "TRANSFER",
    additionalAmount: 300000,
    depositorName: "이태희",
    collectedAt: Timestamp.fromDate(new Date("2026-10-17T22:10:00")),
  });
  assert.equal(error, undefined);
  assert.equal(updates.length, 2);

  const applied = overlayRecordPatches(records, updates);
  const calc = calculateEstablishmentCollection(applied);
  assert.equal(calc.totalCollected, 300000);
  assert.equal(calc.totalRequested, 300000);
  assert.ok(calc.totalCollected <= calc.totalRequested);

  const second = buildEstablishmentAdditionalCollectUpdates(applied, {
    method: "TRANSFER",
    additionalAmount: 1,
    depositorName: "이태희",
    collectedAt: Timestamp.fromDate(new Date("2026-10-17T22:11:00")),
  });
  assert.equal(second.error, undefined);
  const partial = overlayRecordPatches(applied, [second.updates[0]]);
  const partialCalc = calculateEstablishmentCollection(partial);
  const complete = overlayRecordPatches(applied, second.updates);
  const completeCalc = calculateEstablishmentCollection(complete);
  assert.ok(partialCalc.totalCollected > completeCalc.totalCollected);
  assert.ok(partialCalc.totalCollected > partialCalc.totalRequested);

  assert.equal(collectionPatchVisible(records[0], updates[0].updates), false);
  assert.equal(collectionPatchVisible(applied[0], updates[0].updates), true);
});
