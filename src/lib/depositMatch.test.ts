import assert from "node:assert/strict";
import test from "node:test";
import type { DispatchRecord } from "../types.ts";
import {
  allocateDeposit,
  buildCollectionBackup,
  buildSharedAccountCollectionUpdate,
  collectableBucketsFromRecords,
  extractKnownCollections,
  matchDeposits,
  parseDepositText,
  planCheckedAccountWrites,
  DEFAULT_DEPOSITOR_MAPPINGS,
} from "./depositMatch.ts";

const NOW = new Date(2026, 9, 16, 15, 0, 0, 0);

function at(isoLocal: string) {
  const [date, time] = isoLocal.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return {
    toDate() {
      return new Date(year, month - 1, day, hour, minute, 0, 0);
    },
  };
}

function record(partial: Partial<DispatchRecord> & Pick<DispatchRecord, "id" | "establishmentName" | "totalAmount" | "date">): DispatchRecord {
  return {
    staffName: "하퍼가",
    systemType: "PUBLIC",
    startTime: at(`${partial.date}T19:00`),
    endTime: at(`${partial.date}T21:00`),
    durationHours: 2,
    commission: 0,
    staffPayment: 0,
    paymentMethod: "UNPAID",
    createdAt: at(`${partial.date}T19:00`),
    uid: "test",
    ...partial,
  };
}

test("여러 입금 형식을 관대하게 파싱한다", () => {
  const text = [
    "거래일시\t적요\t입금액\t잔액\t내용",
    "2026-10-16 14:32:10\t50,000\t김태강",
    "2026.10.16 14:23:11    입금    박선아    80,000    1,234,567",
    "10/16 09:05\t150,000원\t송한빈",
    "10월 16일 14시 32분  200000  정정희",
    "20261016 143210 30000 최정우",
    "14:32\t70,000\t임민혁",
    "2026-10-16 11:00\t출금\t40,000\t김영신",
    "2026-10-16 11:10\t-15,000\t임선교",
    "그냥 헤더 같은 줄",
    "",
  ].join("\n");

  const { deposits, issues } = parseDepositText(text, NOW);
  assert.deepEqual(
    deposits.map((row) => [row.depositorName, row.amount, row.at.getMonth() + 1, row.at.getDate(), row.at.getHours(), row.at.getMinutes()]),
    [
      ["김태강", 50000, 10, 16, 14, 32],
      ["박선아", 80000, 10, 16, 14, 23],
      ["송한빈", 150000, 10, 16, 9, 5],
      ["정정희", 200000, 10, 16, 14, 32],
      ["최정우", 30000, 10, 16, 14, 32],
      ["임민혁", 70000, 10, 16, 14, 32],
    ],
  );
  assert.equal(deposits[5].hasExplicitDate, false);
  assert.ok(issues.some((issue) => issue.reason.includes("출금")));
  assert.ok(issues.some((issue) => issue.reason.includes("금액")));
});

test("기본 매핑으로 업소별 미수와 짝을 맞추고 일치만 기본 체크한다", () => {
  const records = [
    record({ id: "a", establishmentName: "홍콩", totalAmount: 80000, date: "2026-10-15" }),
    record({ id: "b", establishmentName: "리치", totalAmount: 50000, date: "2026-10-15" }),
    record({ id: "c", establishmentName: "리치", totalAmount: 30000, date: "2026-10-14" }),
    record({ id: "d", establishmentName: "어우동", totalAmount: 150000, date: "2026-10-15" }),
  ];
  const buckets = collectableBucketsFromRecords(records, (row) => row.date);
  const { deposits } = parseDepositText(
    [
      "2026-10-16 14:32\t80,000\t김태강",
      "2026-10-16 14:40\t80,000\t커피티씨",
      "2026-10-16 15:00\t200,000\t송한빈",
      "2026-10-16 15:10\t10,000\t없는사람",
    ].join("\n"),
    NOW,
  );
  const rows = matchDeposits({
    deposits,
    mappings: DEFAULT_DEPOSITOR_MAPPINGS,
    buckets,
    known: [],
  });

  assert.equal(rows[0].establishmentName, "홍콩");
  assert.equal(rows[0].kind, "일치");
  assert.equal(rows[0].defaultChecked, true);
  assert.equal(rows[0].checkable, true);

  assert.equal(rows[1].establishmentName, "리치");
  assert.equal(rows[1].kind, "일치");
  assert.equal(rows[1].unpaidAmount, 80000);

  assert.equal(rows[2].establishmentName, "어우동");
  assert.equal(rows[2].kind, "초과");
  assert.equal(rows[2].defaultChecked, false);
  assert.equal(rows[2].checkable, true);

  assert.equal(rows[3].kind, "업소 불명");
  assert.equal(rows[3].checkable, false);
});

test("매핑이 없으면 이전 수금의 입금자명으로 업소를 찾는다", () => {
  const paid = record({
    id: "paid",
    establishmentName: "삼칠오",
    totalAmount: 40000,
    date: "2026-10-01",
    paymentMethod: "TRANSFER",
    depositorName: "새로운입금",
    collectedAmount: 40000,
    collectedAt: at("2026-10-02T13:00"),
  });
  const unpaid = record({
    id: "open",
    establishmentName: "삼칠오",
    totalAmount: 40000,
    date: "2026-10-15",
  });
  const rows = matchDeposits({
    deposits: parseDepositText("2026-10-16 12:00 40000 새로운입금", NOW).deposits,
    mappings: [],
    buckets: collectableBucketsFromRecords([paid, unpaid], (row) => row.date),
    known: extractKnownCollections([paid, unpaid]),
  });
  assert.equal(rows[0].establishmentName, "삼칠오");
  assert.equal(rows[0].kind, "일치");
});

test("같은 업소·금액·날짜의 기존 수금과 붙여 넣은 두 줄은 중복 의심이다", () => {
  const paid = record({
    id: "paid",
    establishmentName: "홍콩",
    totalAmount: 80000,
    date: "2026-10-10",
    paymentMethod: "TRANSFER",
    depositorName: "김태강",
    collectedAmount: 80000,
    collectedAt: at("2026-10-16T09:00"),
    collectionHistory: [
      {
        collectedAt: at("2026-10-16T09:00"),
        amount: 80000,
        paymentMethod: "TRANSFER",
        depositorName: "김태강",
        note: "1차 수금",
        isShared: true,
        isOnSite: false,
      },
    ],
  });
  const unpaid = record({
    id: "open",
    establishmentName: "리치",
    totalAmount: 50000,
    date: "2026-10-15",
  });
  const { deposits } = parseDepositText(
    ["2026-10-16 14:00\t80,000\t김태강", "2026-10-16 14:05\t50,000\t커피티씨", "2026-10-16 14:06\t50,000\t커피티씨"].join("\n"),
    NOW,
  );
  const rows = matchDeposits({
    deposits,
    mappings: DEFAULT_DEPOSITOR_MAPPINGS,
    buckets: collectableBucketsFromRecords([paid, unpaid], (row) => row.date),
    known: extractKnownCollections([paid]),
  });
  assert.equal(rows[0].kind, "중복 의심");
  assert.equal(rows[0].checkable, false);
  assert.equal(rows[1].kind, "일치");
  assert.equal(rows[2].kind, "중복 의심");
  assert.equal(rows[2].checkable, false);
});

test("승인 계획은 계좌수금과 같은 본문만 만들고 미달·초과는 체크된 것만 담는다", () => {
  const records = [
    record({ id: "h1", establishmentName: "홍콩", totalAmount: 50000, date: "2026-10-14" }),
    record({ id: "h2", establishmentName: "홍콩", totalAmount: 30000, date: "2026-10-15" }),
    record({ id: "r1", establishmentName: "리치", totalAmount: 40000, date: "2026-10-15" }),
  ];
  const buckets = collectableBucketsFromRecords(records, (row) => row.date);
  const { deposits } = parseDepositText(
    ["2026-10-16 10:00\t80,000\t김태강", "2026-10-16 10:05\t10,000\t커피티씨", "2026-10-16 10:06\t90,000\t없는사람"].join("\n"),
    NOW,
  );
  const rows = matchDeposits({
    deposits,
    mappings: DEFAULT_DEPOSITOR_MAPPINGS,
    buckets,
    known: [],
  });
  assert.equal(rows[0].kind, "일치");
  assert.equal(rows[1].kind, "미달");
  assert.equal(rows[2].kind, "업소 불명");

  const checked = rows.filter((row) => row.defaultChecked).map((row) => row.id);
  checked.push(rows[1].id);
  const { writes, skipped } = planCheckedAccountWrites({
    rows,
    checkedIds: [...checked, rows[2].id],
    buckets,
  });

  assert.equal(skipped.length, 1);
  assert.match(skipped[0].reason, /업소 불명/);
  assert.deepEqual(
    writes.map((write) => [write.establishmentName, write.amount, write.records.map((item) => item.id), write.dateStr, write.timeStr, write.year]),
    [
      ["홍콩", 50000, ["h1"], "1016", "1000", 2026],
      ["홍콩", 30000, ["h2"], "1016", "1000", 2026],
      ["리치", 10000, ["r1"], "1016", "1005", 2026],
    ],
  );

  const update = buildSharedAccountCollectionUpdate({
    collectedAt: "TS",
    method: "TRANSFER",
    depositorName: writes[0].depositorName,
    amount: writes[0].amount,
  });
  assert.equal(update.paymentMethod, "TRANSFER");
  assert.equal(update.isDispatchBoxCollection, false);
  assert.equal(update.collectionHistory[0].note, "1차 수금");
  assert.equal(update.collectionHistory[0].isShared, true);
  assert.equal(update.collectionHistory[0].isOnSite, false);
  assert.equal(update.collectionHistory[0].amount, 50000);
  assert.equal(update.depositorName, "김태강");
  assert.equal("isStaffPaid" in update, false);
  assert.equal("staffPaymentMethod" in update, false);
});

test("초과 금액은 가장 최근 날짜 묶음에만 더한다", () => {
  const buckets = collectableBucketsFromRecords(
    [
      record({ id: "1", establishmentName: "홍콩", totalAmount: 40000, date: "2026-10-14" }),
      record({ id: "2", establishmentName: "홍콩", totalAmount: 20000, date: "2026-10-15" }),
    ],
    (row) => row.date,
  );
  const writes = allocateDeposit(buckets, 70000, new Date(2026, 9, 16, 12, 30, 0, 0), "김태강");
  assert.deepEqual(
    writes.map((write) => [write.dateStr, write.amount, write.records.map((item) => item.id)]),
    [
      ["1016", 40000, ["1"]],
      ["1016", 30000, ["2"]],
    ],
  );
});

test("저장 전 백업은 해당 업소의 미수와 기존 수금만 담고 원본을 바꾸지 않는다", () => {
  const unpaid = record({ id: "open", establishmentName: "홍콩", totalAmount: 80000, date: "2026-10-15" });
  const paid = record({
    id: "paid",
    establishmentName: "홍콩",
    totalAmount: 80000,
    date: "2026-10-01",
    paymentMethod: "TRANSFER",
    depositorName: "김태강",
    collectedAt: at("2026-10-02T13:11"),
    collectionHistory: [
      {
        collectedAt: at("2026-10-02T13:11"),
        amount: 80000,
        paymentMethod: "TRANSFER",
        depositorName: "김태강",
        note: "1차 수금",
        isShared: true,
        isOnSite: false,
      },
    ],
  });
  const other = record({ id: "other", establishmentName: "리치", totalAmount: 10000, date: "2026-10-15" });
  const before = JSON.stringify(unpaid);
  const { deposits } = parseDepositText("2026-10-16 14:32 80000 김태강", NOW);
  const rows = matchDeposits({
    deposits,
    mappings: DEFAULT_DEPOSITOR_MAPPINGS,
    buckets: collectableBucketsFromRecords([unpaid, paid, other], (row) => row.date),
    known: [],
  });
  const backup = buildCollectionBackup({
    records: [unpaid, paid, other],
    establishmentNames: ["홍콩"],
    rows,
    now: NOW,
  });
  assert.deepEqual(backup.records.map((item) => item.id).sort(), ["open", "paid"]);
  assert.equal(backup.records.find((item) => item.id === "paid")?.collectionHistory.length, 1);
  assert.equal(backup.purpose, "deposit-match-approve");
  assert.equal(JSON.stringify(unpaid), before);
  assert.equal(backup.rows[0].kind, "일치");
});
