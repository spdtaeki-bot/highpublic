import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { UnpaidDetailView } from "../components/UnpaidDetailView.tsx";
import { calculateEstablishmentCollection } from "../lib/utils.ts";
import type { DispatchRecord } from "../types.ts";
import { buildSampleRecords, previewStamp, SAMPLE_DATE } from "./sampleData.ts";
import "../lib/domTestSetup.ts";

function unpaidRecord(
  id: string,
  establishmentName: string,
  totalAmount: number,
): DispatchRecord {
  return {
    ...buildSampleRecords(1)[0],
    id,
    establishmentName,
    totalAmount,
    paymentMethod: "UNPAID",
    collectedAmount: undefined,
    collectedAt: undefined,
    collectionHistory: [],
    date: SAMPLE_DATE,
    wasUnpaid: true,
  };
}

function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const view = element.ownerDocument.defaultView!;
  const prototype = element.tagName === "SELECT"
    ? view.HTMLSelectElement.prototype
    : view.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", {
    bubbles: true,
  }));
}

test("미수 화면은 전체 금액을 유지하고 날짜 카드는 8개만 그린다", () => {
  const records = buildSampleRecords();
  const byEst = new Map<string, typeof records>();
  for (const record of records) {
    const key = `${record.date}__${record.establishmentName}`;
    const list = byEst.get(key) || [];
    list.push(record);
    byEst.set(key, list);
  }
  let expectedUnpaid = 0;
  for (const group of byEst.values()) {
    expectedUnpaid += calculateEstablishmentCollection(group).unpaidAmount;
  }

  const html = renderToStaticMarkup(
    React.createElement(UnpaidDetailView, {
      records: [],
      allUnpaidRecords: records,
      staff: [],
      selectedDate: SAMPLE_DATE,
      onUpdateRecord: async () => {},
      onUpdateRecordsAtomically: async () => {},
      onApplyBulkCollections: async () => ({
        appliedOperationIds: [],
        skippedOperationIds: [],
      }),
    }),
  );

  const cards = html.match(/unpaid-date-card-/g) || [];
  assert.equal(cards.length, 8);
  assert.equal(html.includes(expectedUnpaid.toLocaleString()), true);
  assert.equal(html.includes("이전 날짜 더 보기"), true);
  assert.equal(html.includes(`${records.length / 8 - 8}일 남음`) || html.includes("일 남음"), true);
  assert.equal(html.includes(`unpaid-date-card-${SAMPLE_DATE}`), true);
  const oldest = records[records.length - 1].date;
  assert.equal(html.includes(`unpaid-date-card-${oldest}`), false);
  assert.notEqual(expectedUnpaid, 0);
});

test("부분 미수 카드는 잔여 금액을 음수 없이 표시한다", () => {
  const partial = {
    ...unpaidRecord("partial", "어게인", 150000),
    paymentMethod: "TRANSFER" as const,
    collectedAmount: 20000,
    collectedAt: previewStamp(`${SAMPLE_DATE}T20:00:00`),
    collectionHistory: [{
      collectedAt: previewStamp(`${SAMPLE_DATE}T20:00:00`),
      amount: 20000,
      paymentMethod: "TRANSFER" as const,
      depositorName: "테스트",
    }],
  };
  const html = renderToStaticMarkup(
    React.createElement(UnpaidDetailView, {
      records: [],
      allUnpaidRecords: [partial],
      staff: [],
      selectedDate: SAMPLE_DATE,
      onUpdateRecord: async () => {},
      onUpdateRecordsAtomically: async () => {},
      onApplyBulkCollections: async () => ({
        appliedOperationIds: [],
        skippedOperationIds: [],
      }),
    }),
  );
  assert.match(html, /미수 \(덜 받음: 130,000원\)/);
  assert.doesNotMatch(html, /덜 받음: -130,000원/);
});

test("일괄 저장 뒤 카드 순서와 드롭다운의 최신 잔여 금액을 유지한다", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const records = [
    unpaidRecord("again", "어게인", 300000),
    unpaidRecord("rich", "리치", 200000),
  ];

  await act(async () => {
    root.render(
      React.createElement(UnpaidDetailView, {
        records: [],
        allUnpaidRecords: records,
        staff: [],
        selectedDate: SAMPLE_DATE,
        onUpdateRecord: async () => {},
        onUpdateRecordsAtomically: async () => {},
        onApplyBulkCollections: async (operations) => ({
          appliedOperationIds: operations.map((operation) => operation.operationId),
          skippedOperationIds: [],
        }),
      }),
    );
  });

  const cardNames = () =>
    Array.from(host.querySelectorAll<HTMLElement>(`[id^="unpaid-est-card-${SAMPLE_DATE}"]`))
      .map((element) => element.id);

  try {
    assert.deepEqual(cardNames(), [
      `unpaid-est-card-${SAMPLE_DATE}-${encodeURIComponent("어게인").replace(/%/g, "_")}`,
      `unpaid-est-card-${SAMPLE_DATE}-${encodeURIComponent("리치").replace(/%/g, "_")}`,
    ]);

    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-open-bulk-collection]")?.click();
    });
    assert.ok(
      host.querySelector("[data-bulk-collection-modal]"),
      host.innerHTML.slice(-1000),
    );
    const target = host.querySelector<HTMLSelectElement>('[aria-label="1행 업소"]')!;
    const depositor = host.querySelector<HTMLInputElement>('[aria-label="1행 입금자"]')!;
    const amount = host.querySelector<HTMLInputElement>('[aria-label="1행 금액"]')!;
    const time = host.querySelector<HTMLInputElement>('[aria-label="1행 시간"]')!;
    await act(async () => {
      setValue(target, `${SAMPLE_DATE}___어게인`);
      setValue(depositor, "테스트");
      setValue(amount, "180000");
      setValue(time, "2030");
      host.querySelector<HTMLButtonElement>("[data-bulk-preview]")?.click();
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-bulk-save]")?.click();
    });

    assert.deepEqual(cardNames(), [
      `unpaid-est-card-${SAMPLE_DATE}-${encodeURIComponent("어게인").replace(/%/g, "_")}`,
      `unpaid-est-card-${SAMPLE_DATE}-${encodeURIComponent("리치").replace(/%/g, "_")}`,
    ]);

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="일괄 수금 입력 창 닫기"]')?.click();
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-open-bulk-collection]")?.click();
    });
    assert.ok(
      host.querySelector("[data-bulk-collection-modal]"),
      "일괄 수금 창이 다시 열리지 않았습니다.",
    );
    const optionText = Array.from(
      host.querySelectorAll<HTMLOptionElement>('[aria-label="1행 업소"] option'),
    ).map((option) => option.textContent || "");
    assert.equal(
      optionText.some((text) => text.includes("어게인") && text.includes("미수 120,000원")),
      true,
      JSON.stringify(optionText),
    );
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
