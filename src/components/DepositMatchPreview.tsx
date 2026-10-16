import { useMemo, useState } from "react";
import type { DispatchRecord } from "../types";
import { DepositMatchPanel } from "./DepositMatchPanel";
import { collectableBucketsFromRecords } from "../lib/depositMatch";
import type { AccountCollectionWrite } from "../lib/depositMatch";

const SAMPLE = [
  "거래일시\t적요\t입금액\t잔액\t입금자",
  "2026-10-16 14:32:10\t80,000\t김태강",
  "2026.10.16 14:40    입금    커피티씨    80,000    1,200,000",
  "10월 16일 15시 00분\t200,000\t송한빈",
  "2026-10-16 15:10\t10,000\t없는사람",
  "2026-10-15 09:00\t80,000\t김태강",
].join("\n");

function stamp(year: number, month: number, day: number, hour: number) {
  const date = new Date(year, month - 1, day, hour, 0, 0, 0);
  return { toDate: () => date };
}

function record(
  partial: Partial<DispatchRecord> &
    Pick<DispatchRecord, "id" | "establishmentName" | "totalAmount" | "date">,
): DispatchRecord {
  return {
    staffName: "하퍼가",
    systemType: "PUBLIC",
    startTime: stamp(2026, 10, 15, 19),
    endTime: stamp(2026, 10, 15, 21),
    durationHours: 2,
    commission: 0,
    staffPayment: 0,
    paymentMethod: "UNPAID",
    createdAt: stamp(2026, 10, 15, 19),
    uid: "preview",
    ...partial,
  };
}

const records: DispatchRecord[] = [
  record({ id: "h1", establishmentName: "홍콩", totalAmount: 50000, date: "2026-10-14" }),
  record({ id: "h2", establishmentName: "홍콩", totalAmount: 30000, date: "2026-10-15" }),
  record({ id: "r1", establishmentName: "리치", totalAmount: 50000, date: "2026-10-15" }),
  record({ id: "r2", establishmentName: "리치", totalAmount: 30000, date: "2026-10-14" }),
  record({ id: "e1", establishmentName: "어우동", totalAmount: 150000, date: "2026-10-15" }),
  record({
    id: "dup",
    establishmentName: "홍콩",
    totalAmount: 80000,
    date: "2026-10-10",
    paymentMethod: "TRANSFER",
    depositorName: "김태강",
    collectedAmount: 80000,
    collectedAt: stamp(2026, 10, 15, 9),
    collectionHistory: [
      {
        collectedAt: stamp(2026, 10, 15, 9),
        amount: 80000,
        paymentMethod: "TRANSFER",
        depositorName: "김태강",
        note: "1차 수금",
        isShared: true,
        isOnSite: false,
      },
    ],
  }),
];

/**
 * 샘플 미수만 보여 주고 Firestore 에는 연결하지 않는다.
 * 개발 서버: `/?depositMatchPreview=1`
 * 공개 미리보기 페이지는 `deposit-preview.html` 만 연다.
 */
export function DepositMatchPreview() {
  const [log, setLog] = useState<string>("아직 기록 호출이 없습니다.");
  const buckets = useMemo(
    () => collectableBucketsFromRecords(records, (row) => row.date),
    [],
  );

  return (
    <div className="min-h-screen bg-stone-100 p-4">
      <div className="mx-auto mb-3 max-w-3xl rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
        테스트 미리보기입니다. 아래 업소 미수는 샘플이고, 승인해도 Firestore에 쓰지 않습니다.
        <pre className="mt-2 whitespace-pre-wrap text-[11px] font-bold text-stone-700">{log}</pre>
      </div>
      <DepositMatchPanel
        records={records}
        buckets={buckets}
        initialText={SAMPLE}
        intro={<PreviewIntro />}
        onClose={() => undefined}
        onApplyBatch={async (targetRecords, _method, dateStr, timeStr, depositorName, amount, year) => {
          const summary: AccountCollectionWrite = {
            records: targetRecords,
            amount,
            dateStr,
            timeStr,
            year,
            depositorName,
          };
          setLog(
            (prev) =>
              `${prev}\n계좌수금 호출(미저장): ${depositorName} ${amount.toLocaleString()}원 ${year} ${dateStr} ${timeStr} / 기록 ${summary.records.map((row) => row.id).join(",")}`,
          );
        }}
      />
      <SamplePaste />
    </div>
  );
}

function PreviewIntro() {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-amber-950">
      <p>샘플 전용입니다. 운영 사이트와 Firestore에는 연결하지 않습니다. 승인해도 서버에 쓰지 않습니다.</p>
      <p className="mt-1">
        입력칸에 샘플 입금내역이 이미 들어 있습니다. 지웠다면 아래를 다시 붙여 넣으세요.
      </p>
      <pre className="mt-1 whitespace-pre-wrap rounded-xl bg-white px-2 py-1.5 font-bold text-stone-700">
        {SAMPLE}
      </pre>
      <p className="mt-1">
        샘플 미수는 홍콩 80,000원, 리치 80,000원, 어우동 150,000원입니다. 홍콩에는 10월 15일 09:00 김태강 80,000원 수금이 이미 있습니다.
      </p>
      <p className="mt-1">
        기대 결과: 홍콩 / 김태강 / 80,000 / 일치 · 리치 / 커피티씨 / 80,000 / 일치 · 어우동 / 송한빈 / 200,000 / 초과 · 업소 불명 / 없는사람 / 10,000 / 업소 불명 · 홍콩 / 김태강 / 80,000 / 중복 의심
      </p>
    </div>
  );
}

function SamplePaste() {
  return (
    <p className="sr-only" id="deposit-match-sample">
      {SAMPLE}
    </p>
  );
}

export const DEPOSIT_MATCH_PREVIEW_SAMPLE = SAMPLE;
