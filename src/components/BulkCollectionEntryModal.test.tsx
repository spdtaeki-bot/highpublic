import "../lib/domTestSetup.ts";
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Timestamp } from "firebase/firestore";
import type { DispatchRecord } from "../types.ts";
import type { BulkCollectionOperation } from "../lib/bulkCollect.ts";
import { BulkCollectionEntryModal } from "./BulkCollectionEntryModal.tsx";

function record(): DispatchRecord {
  const stamp = Timestamp.fromDate(new Date("2026-10-20T20:00:00"));
  return {
    id: "dispatch-1",
    staffName: "하퍼 다빈",
    establishmentName: "미술관",
    systemType: "TABLE",
    startTime: stamp,
    endTime: stamp,
    durationHours: 1,
    totalAmount: 300000,
    commission: 0,
    staffPayment: 0,
    paymentMethod: "UNPAID",
    date: "2026-10-20",
    createdAt: stamp,
    uid: "sample",
  };
}

function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const view = element.ownerDocument.defaultView;
  assert.ok(view);
  const isSelect = element.tagName === "SELECT";
  const prototype =
    isSelect
      ? view.HTMLSelectElement.prototype
      : view.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  assert.ok(setter);
  setter.call(element, value);
  element.dispatchEvent(new Event(isSelect ? "change" : "input", {
    bubbles: true,
  }));
}

test("여러 줄 입력을 미리 확인한 뒤 한 번만 저장한다", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const saved: BulkCollectionOperation[][] = [];
  await act(async () => {
    root.render(
      <BulkCollectionEntryModal
        targets={[{
          key: "2026-10-20___미술관",
          businessDate: "2026-10-20",
          establishmentName: "미술관",
          shortage: 300000,
          records: [record()],
        }]}
        onSave={async (operations) => {
          saved.push(operations);
          return {
            appliedOperationIds: operations.map((operation) => operation.operationId),
            skippedOperationIds: [],
          };
        }}
        onClose={() => {}}
      />,
    );
  });

  try {
    const select = host.querySelector<HTMLSelectElement>('[aria-label="1행 업소"]');
    const depositor = host.querySelector<HTMLInputElement>('[aria-label="1행 입금자"]');
    const amount = host.querySelector<HTMLInputElement>('[aria-label="1행 금액"]');
    const time = host.querySelector<HTMLInputElement>('[aria-label="1행 시간"]');
    assert.ok(select && depositor && amount && time);

    await act(async () => {
      setValue(select, "2026-10-20___미술관");
      setValue(depositor, "이태희");
      setValue(amount, "300000");
      setValue(time, "1931");
      host.querySelector<HTMLButtonElement>("[data-bulk-preview]")?.click();
    });
    assert.ok(host.querySelector("[data-bulk-collection-preview]"));
    assert.match(host.textContent || "", /300,000원/);
    assert.match(host.textContent || "", /19:31/);

    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-bulk-save]")?.click();
    });
    assert.equal(saved.length, 1);
    assert.equal(saved[0].length, 1);
    assert.equal(saved[0][0].depositorName, "이태희");
    assert.equal(saved[0][0].amount, 300000);
    assert.ok(host.querySelector("[data-bulk-save-result]"));

    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-bulk-save]")?.click();
    });
    assert.equal(saved.length, 1);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
