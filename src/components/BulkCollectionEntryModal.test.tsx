import "../lib/domTestSetup.ts";
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Timestamp } from "firebase/firestore";
import type { DispatchRecord } from "../types.ts";
import {
  createBulkCollectionOperationId,
  type BulkCollectionOperation,
} from "../lib/bulkCollect.ts";
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
        defaultCollectedDate="2026-10-15"
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
    const collectedDate = host.querySelector<HTMLInputElement>('[aria-label="1행 날짜"]');
    const amount = host.querySelector<HTMLInputElement>('[aria-label="1행 금액"]');
    const time = host.querySelector<HTMLInputElement>('[aria-label="1행 시간"]');
    assert.ok(select && collectedDate && depositor && amount && time);
    assert.equal(collectedDate.value, "2026-10-15");

    await act(async () => {
      setValue(select, "2026-10-20___미술관");
      setValue(collectedDate, "2026-10-19");
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
    assert.equal(saved[0][0].collectedDate, "2026-10-19");
    assert.equal(saved[0][0].collectedAt.getDate(), 19);
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

test("입력 중에는 행과 모달을 다시 그리지 않고 IME 조합 완료값만 확정한다", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
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
        defaultCollectedDate="2026-10-20"
        onSave={async () => ({ appliedOperationIds: [], skippedOperationIds: [] })}
        onClose={() => {}}
      />,
    );
  });

  try {
    const row = host.querySelector<HTMLElement>("[data-bulk-row='1']");
    const modal = host.querySelector<HTMLElement>("[data-bulk-collection-modal]");
    const depositor = host.querySelector<HTMLInputElement>('[aria-label="1행 입금자"]');
    const amount = host.querySelector<HTMLInputElement>('[aria-label="1행 금액"]');
    const time = host.querySelector<HTMLInputElement>('[aria-label="1행 시간"]');
    assert.ok(row && modal && depositor && amount && time);
    const rowRenders = row.dataset.bulkRowRenders;
    const modalRenders = modal.dataset.bulkModalRenders;

    await act(async () => {
      depositor.dispatchEvent(new Event("compositionstart", { bubbles: true }));
      setValue(depositor, "미");
    });
    assert.equal(depositor.dataset.committedValue, undefined);

    await act(async () => {
      const view = depositor.ownerDocument.defaultView;
      const setter = Object.getOwnPropertyDescriptor(
        view!.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(depositor, "미술관");
      depositor.dispatchEvent(new Event("compositionend", { bubbles: true }));
      setValue(amount, "20000");
      setValue(time, "2030");
    });

    assert.equal(depositor.value, "미술관");
    assert.equal(depositor.dataset.committedValue, "미술관");
    assert.equal(amount.value, "20,000");
    assert.equal(time.value, "2030");
    assert.equal(row.dataset.bulkRowRenders, rowRenders);
    assert.equal(modal.dataset.bulkModalRenders, modalRenders);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

test("중복 행을 모두 표시하고 중복이 아닌 행만 저장한다", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const saved: BulkCollectionOperation[][] = [];
  const duplicateId = createBulkCollectionOperationId({
    targetKey: "2026-10-20___미술관",
    collectedDate: "2026-10-20",
    time: "1931",
    depositorName: "이태희",
    amount: 300000,
    method: "TRANSFER",
  });
  const first = {
    ...record(),
    collectionHistory: [{
      collectedAt: Timestamp.fromDate(new Date("2026-10-20T19:31:00")),
      amount: 300000,
      operationId: duplicateId,
    }],
  };
  const second = {
    ...record(),
    id: "dispatch-2",
    establishmentName: "리치",
  };

  await act(async () => {
    root.render(
      <BulkCollectionEntryModal
        targets={[
          {
            key: "2026-10-20___미술관",
            businessDate: "2026-10-20",
            establishmentName: "미술관",
            shortage: 300000,
            records: [first],
          },
          {
            key: "2026-10-20___리치",
            businessDate: "2026-10-20",
            establishmentName: "리치",
            shortage: 200000,
            records: [second],
          },
        ]}
        defaultCollectedDate="2026-10-20"
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
    const fillRow = (
      row: number,
      target: string,
      depositor: string,
      amount: string,
      time: string,
    ) => {
      setValue(host.querySelector(`[aria-label="${row}행 업소"]`)!, target);
      setValue(host.querySelector(`[aria-label="${row}행 입금자"]`)!, depositor);
      setValue(host.querySelector(`[aria-label="${row}행 금액"]`)!, amount);
      setValue(host.querySelector(`[aria-label="${row}행 시간"]`)!, time);
    };
    await act(async () => {
      fillRow(1, "2026-10-20___미술관", "이태희", "300000", "1931");
      fillRow(2, "2026-10-20___리치", "김민균", "200000", "2030");
      host.querySelector<HTMLButtonElement>("[data-bulk-preview]")?.click();
    });

    assert.equal(host.querySelectorAll('[data-bulk-preview-row="duplicate"]').length, 1);
    assert.equal(host.querySelectorAll('[data-bulk-preview-row="pending"]').length, 1);
    assert.match(host.textContent || "", /중복 제외하고 1건 저장/);

    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-bulk-save]")?.click();
    });
    assert.equal(saved.length, 1);
    assert.equal(saved[0].length, 1);
    assert.equal(saved[0][0].establishmentName, "리치");
    assert.match(host.textContent || "", /이미 저장된 1건은 중복 저장하지 않았습니다/);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
