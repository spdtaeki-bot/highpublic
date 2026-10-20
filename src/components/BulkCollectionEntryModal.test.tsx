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

test("Tab과 Shift+Tab 포커스가 일괄 입력 모달 안에서만 순환한다", async () => {
  const outside = document.createElement("input");
  outside.setAttribute("aria-label", "하단 직원 검색");
  document.body.appendChild(outside);
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
    const content = host.querySelector<HTMLElement>("[data-bulk-modal-content]");
    const amount = host.querySelector<HTMLInputElement>('[aria-label="1행 금액"]');
    const time = host.querySelector<HTMLInputElement>('[aria-label="1행 시간"]');
    assert.ok(content && amount && time);
    const focusable = Array.from(
      content.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    assert.ok(focusable.length > 2);

    amount.focus();
    amount.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    }));
    assert.equal(document.activeElement, time);

    focusable[focusable.length - 1].focus();
    focusable[focusable.length - 1].dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    }));
    assert.equal(document.activeElement, focusable[0]);
    assert.notEqual(document.activeElement, outside);

    focusable[0].dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));
    assert.equal(document.activeElement, focusable[focusable.length - 1]);
  } finally {
    act(() => root.unmount());
    host.remove();
    outside.remove();
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

    assert.equal(host.querySelectorAll('[data-bulk-preview-row="exact"]').length, 1);
    assert.equal(host.querySelectorAll('[data-bulk-preview-row="pending"]').length, 1);
    assert.match(host.textContent || "", /중복·의심 제외하고 1건 저장/);

    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-bulk-save]")?.click();
    });
    assert.equal(saved.length, 1);
    assert.equal(saved[0].length, 1);
    assert.equal(saved[0][0].establishmentName, "리치");
    assert.match(host.textContent || "", /중복·의심 1건은 제외했습니다/);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

test("완전 중복과 시각이 다른 중복 의심을 구분하고 전부 저장할 수 있다", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const saved: BulkCollectionOperation[][] = [];
  const collectedAt = (hour: number, minute: number) =>
    Timestamp.fromDate(new Date(2026, 9, 15, hour, minute, 0, 0));
  const existing = (
    id: string,
    establishmentName: string,
    hour: number,
    minute: number,
  ): DispatchRecord => ({
    ...record(),
    id,
    date: "2026-10-15",
    establishmentName,
    collectionHistory: [{
      collectedAt: collectedAt(hour, minute),
      amount: 10000,
      paymentMethod: "TRANSFER",
      isShared: true,
    }],
  });
  const targets = [
    {
      key: "2026-10-15___리치",
      businessDate: "2026-10-15",
      establishmentName: "리치",
      shortage: 140000,
      records: [existing("rich", "리치", 14, 8)],
    },
    {
      key: "2026-10-15___홈런",
      businessDate: "2026-10-15",
      establishmentName: "홈런",
      shortage: 140000,
      records: [{
        ...record(),
        id: "home-run",
        date: "2026-10-15",
        establishmentName: "홈런",
      }],
    },
    {
      key: "2026-10-15___도파민",
      businessDate: "2026-10-15",
      establishmentName: "도파민",
      shortage: 150000,
      records: [{
        ...record(),
        id: "dopamine",
        date: "2026-10-15",
        establishmentName: "도파민",
      }],
    },
  ];

  await act(async () => {
    root.render(
      <BulkCollectionEntryModal
        targets={targets}
        defaultCollectedDate="2026-10-15"
        recentOperations={[{
          operationId: createBulkCollectionOperationId({
            targetKey: "2026-10-15___홈런",
            collectedDate: "2026-10-15",
            time: "1407",
            depositorName: "",
            amount: 10000,
            method: "TRANSFER",
          }),
          targetKey: "2026-10-15___홈런",
          businessDate: "2026-10-15",
          collectedDate: "2026-10-15",
          establishmentName: "홈런",
          recordIds: ["home-run"],
          depositorName: "",
          amount: 10000,
          time: "1407",
          method: "TRANSFER",
          collectedAt: new Date(2026, 9, 15, 14, 7, 0, 0),
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
    const fill = (row: number, target: string) => {
      setValue(host.querySelector(`[aria-label="${row}행 업소"]`)!, target);
      setValue(host.querySelector(`[aria-label="${row}행 금액"]`)!, "10000");
      setValue(host.querySelector(`[aria-label="${row}행 시간"]`)!, "1408");
    };
    await act(async () => {
      fill(1, "2026-10-15___리치");
      fill(2, "2026-10-15___홈런");
      fill(3, "2026-10-15___도파민");
      host.querySelector<HTMLButtonElement>("[data-bulk-preview]")?.click();
    });

    assert.equal(host.querySelectorAll('[data-bulk-preview-row="exact"]').length, 1);
    assert.equal(host.querySelectorAll('[data-bulk-preview-row="suspected"]').length, 1);
    assert.equal(host.querySelectorAll('[data-bulk-preview-row="pending"]').length, 1);
    assert.match(host.textContent || "", /완전 중복 1건 · 중복 의심 1건/);
    assert.match(host.textContent || "", /중복·의심 제외하고 1건 저장/);
    assert.match(host.textContent || "", /그래도 3건 전부 저장/);

    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-bulk-save-all]")?.click();
    });
    assert.equal(saved.length, 1);
    assert.equal(saved[0].length, 3);
    assert.equal(saved[0].filter((operation) => operation.duplicateOverride).length, 2);
    assert.equal(
      saved[0]
        .filter((operation) => operation.duplicateOverride)
        .every((operation) => operation.operationId.includes("-override-")),
      true,
    );
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
