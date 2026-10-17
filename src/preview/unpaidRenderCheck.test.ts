import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UnpaidDetailView } from "../components/UnpaidDetailView.tsx";
import { calculateEstablishmentCollection } from "../lib/utils.ts";
import { buildSampleRecords, SAMPLE_DATE } from "./sampleData.ts";

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
