import React, { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { DispatchRecord, PaymentMethod } from "../types";
import {
  DEFAULT_DEPOSITOR_MAPPINGS,
  type CollectableBucket,
  type DepositorMapping,
  buildCollectionBackup,
  collectionBackupFilename,
  loadDepositorMappings,
  matchDeposits,
  parseDepositText,
  planCheckedAccountWrites,
  saveDepositorMappings,
  extractKnownCollections,
} from "../lib/depositMatch";

function downloadText(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const KIND_CLASS: Record<string, string> = {
  일치: "bg-emerald-100 text-emerald-800 border-emerald-300",
  초과: "bg-amber-100 text-amber-800 border-amber-300",
  미달: "bg-red-100 text-red-800 border-red-300",
  "업소 불명": "bg-stone-200 text-stone-700 border-stone-300",
  "중복 의심": "bg-orange-100 text-orange-800 border-orange-300",
};

export function DepositMatchPanel({
  records,
  buckets,
  onClose,
  onApplyBatch,
  initialText = "",
  intro,
}: {
  records: DispatchRecord[];
  buckets: CollectableBucket[];
  onClose: () => void;
  initialText?: string;
  intro?: React.ReactNode;
  onApplyBatch: (
    records: DispatchRecord[],
    method: PaymentMethod,
    dateStr: string,
    timeStr: string,
    depositorName: string,
    customAmount: number,
    year: number,
  ) => Promise<void>;
}) {
  const [text, setText] = useState(initialText);
  const [mappings, setMappings] = useState<DepositorMapping[]>(() =>
    loadDepositorMappings(),
  );
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [blockedWarning, setBlockedWarning] = useState<string | null>(null);

  const known = useMemo(() => extractKnownCollections(records), [records]);
  const parsed = useMemo(() => parseDepositText(text), [text]);
  const rows = useMemo(
    () =>
      matchDeposits({
        deposits: parsed.deposits,
        mappings,
        buckets,
        known,
      }),
    [parsed.deposits, mappings, buckets, known],
  );

  const rowSignature = rows
    .map((row) => `${row.id}:${row.kind}:${row.defaultChecked}`)
    .join("|");

  useEffect(() => {
    const next: Record<string, boolean> = {};
    rows.forEach((row) => {
      next[row.id] = row.defaultChecked;
    });
    setChecked(next);
    setConfirming(false);
    setBlockedWarning(null);
    // 같은 대조 결과면 사람이 바꾼 체크를 유지한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSignature]);

  const selected = rows.filter((row) => checked[row.id] && row.checkable);

  const persistMappings = (next: DepositorMapping[]) => {
    setMappings(next);
    saveDepositorMappings(next);
  };

  const toggle = (id: string, checkable: boolean, kind: string) => {
    if (!checkable) {
      setBlockedWarning(
        kind === "중복 의심"
          ? "중복 의심 건은 같은 수금이 이미 있어 체크할 수 없습니다."
          : "업소를 모르거나 기록할 미수가 없는 건은 체크할 수 없습니다.",
      );
      return;
    }
    setBlockedWarning(null);
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const approve = async () => {
    if (saving || selected.length === 0) return;
    const plan = planCheckedAccountWrites({
      rows,
      checkedIds: selected.map((row) => row.id),
      buckets,
    });
    if (plan.writes.length === 0) {
      setMessage(
        plan.skipped.map((item) => item.reason).join("\n") ||
          "기록할 수 있는 건이 없습니다.",
      );
      setConfirming(false);
      return;
    }

    const backup = buildCollectionBackup({
      records,
      establishmentNames: plan.writes.map((write) => write.establishmentName),
      rows: selected,
    });
    const backupJson = JSON.stringify(backup, null, 2);
    setLastBackup(backupJson);
    try {
      downloadText(collectionBackupFilename(), backupJson);
    } catch (error) {
      setMessage(
        `백업 파일을 만들지 못해 기록하지 않았습니다. ${error instanceof Error ? error.message : ""}`,
      );
      setConfirming(false);
      return;
    }

    setSaving(true);
    try {
      for (const write of plan.writes) {
        await onApplyBatch(
          write.records,
          "TRANSFER",
          write.dateStr,
          write.timeStr,
          write.depositorName,
          write.amount,
          write.year,
        );
      }
      const skipped = plan.skipped.length
        ? `\n건너뛴 ${plan.skipped.length}건: ${plan.skipped.map((item) => item.reason).join(" / ")}`
        : "";
      setMessage(`선택한 ${selected.length}건을 계좌수금으로 기록했습니다.${skipped}`);
      setText("");
    } catch (error) {
      setMessage(
        `기록 중 오류가 났습니다. 내려받은 백업 JSON을 보관하세요.\n${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      );
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-stone-900/60"
        aria-label="입금 대조 닫기"
        onClick={() => {
          if (!saving) onClose();
        }}
      />
      <div className="relative z-10 flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[90dvh] sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-base font-black text-stone-900">입금 일괄 대조</h2>
            <p className="mt-0.5 text-[11px] font-bold text-stone-500">
              붙여 넣기와 대조는 미리보기입니다. 승인 전에는 저장하지 않습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl bg-stone-100 p-2 text-stone-600 disabled:opacity-50"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          {intro}
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onInput={(event) => setText(event.currentTarget.value)}
            onPaste={(event) => {
              const el = event.currentTarget;
              window.setTimeout(() => setText(el.value), 0);
            }}
            placeholder={"인터넷뱅킹 입금내역을 붙여 넣으세요.\n예: 2026-10-16 14:32\t80,000\t김태강"}
            className="h-36 w-full resize-y rounded-2xl bg-stone-50 px-3 py-2 text-sm font-bold text-stone-800 outline-none"
            disabled={saving}
          />

          <details className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2">
            <summary className="cursor-pointer text-xs font-black text-stone-700">
              입금자 → 업소 매핑 ({mappings.length}개)
            </summary>
            <div className="mt-2 space-y-1.5">
              {mappings.map((row, index) => (
                <div key={`${row.depositorName}-${index}`} className="flex gap-1.5">
                  <input
                    value={row.depositorName}
                    onChange={(event) => {
                      const next = mappings.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, depositorName: event.target.value }
                          : item,
                      );
                      persistMappings(next);
                    }}
                    className="w-1/2 rounded-lg bg-white px-2 py-1 text-xs font-bold"
                    aria-label={`입금자명 ${index + 1}`}
                  />
                  <input
                    value={row.establishmentName}
                    onChange={(event) => {
                      const next = mappings.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, establishmentName: event.target.value }
                          : item,
                      );
                      persistMappings(next);
                    }}
                    className="w-1/2 rounded-lg bg-white px-2 py-1 text-xs font-bold"
                    aria-label={`업소명 ${index + 1}`}
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-lg bg-white px-2 text-[11px] font-black text-stone-500"
                    onClick={() =>
                      persistMappings(mappings.filter((_, itemIndex) => itemIndex !== index))
                    }
                  >
                    삭제
                  </button>
                </div>
              ))}
              <div className="flex gap-1.5 pt-1">
                <button
                  type="button"
                  className="rounded-lg bg-stone-900 px-2 py-1 text-[11px] font-black text-white"
                  onClick={() =>
                    setMappings((prev) => [
                      ...prev,
                      { depositorName: "", establishmentName: "" },
                    ])
                  }
                >
                  매핑 추가
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-white px-2 py-1 text-[11px] font-black text-stone-600"
                  onClick={() =>
                    persistMappings(
                      DEFAULT_DEPOSITOR_MAPPINGS.map((row) => ({ ...row })),
                    )
                  }
                >
                  기본값으로
                </button>
              </div>
            </div>
          </details>

          {parsed.issues.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
              읽지 못한 {parsed.issues.length}줄:{" "}
              {parsed.issues
                .slice(0, 4)
                .map((issue) => `${issue.lineNumber}행 ${issue.reason}`)
                .join(" · ")}
            </div>
          )}

          {blockedWarning && (
            <div className="rounded-2xl border border-orange-300 bg-orange-50 px-3 py-2 text-[11px] font-black text-orange-800">
              {blockedWarning}
            </div>
          )}

          <div className="space-y-1.5">
            {rows.length === 0 ? (
              <p className="py-6 text-center text-xs font-bold text-stone-400">
                입금내역을 붙여 넣으면 업소별 미수와 대조합니다.
              </p>
            ) : (
              rows.map((row) => (
                <label
                  key={row.id}
                  className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white px-2.5 py-2"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={Boolean(checked[row.id]) && row.checkable}
                    disabled={saving}
                    onChange={() => toggle(row.id, row.checkable, row.kind)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black text-stone-900">
                      {row.establishmentName || "업소 불명"} / {row.depositorName} /{" "}
                      {row.amount.toLocaleString()}원 / {row.kind}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-bold text-stone-500">
                      {row.note}
                      {row.warnings.length > 0 ? ` · ${row.warnings.join(" ")}` : ""}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-lg border px-1.5 py-0.5 text-[10px] font-black ${KIND_CLASS[row.kind] || ""}`}
                  >
                    {row.kind}
                  </span>
                </label>
              ))
            )}
          </div>

          {message && (
            <pre className="whitespace-pre-wrap rounded-2xl bg-stone-100 px-3 py-2 text-xs font-bold text-stone-700">
              {message}
            </pre>
          )}
          {lastBackup && (
            <button
              type="button"
              className="text-[11px] font-black text-indigo-700 underline"
              onClick={() => downloadText(collectionBackupFilename(), lastBackup)}
            >
              방금 백업 JSON 다시 받기
            </button>
          )}
        </div>

        <div className="border-t border-stone-200 px-4 py-3 sm:px-5">
          {confirming ? (
            <div className="space-y-2">
              <p className="text-xs font-black text-stone-800">
                선택 {selected.length}건을 계좌수금으로 기록합니다. 저장 직전에 해당 업소
                미수·수금 기록을 JSON으로 받습니다.
              </p>
              <ul className="max-h-24 overflow-y-auto text-[11px] font-bold text-stone-600">
                {selected.map((row) => (
                  <li key={row.id}>
                    {row.establishmentName} / {row.depositorName} / {row.amount.toLocaleString()}원 / {row.kind}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void approve()}
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-black text-white disabled:opacity-50"
                >
                  {saving ? "기록 중..." : "백업 후 계좌수금"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setConfirming(false)}
                  className="rounded-xl bg-stone-100 px-4 py-2.5 text-sm font-black text-stone-600"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={selected.length === 0 || saving}
              onClick={() => setConfirming(true)}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-black text-white disabled:bg-stone-200 disabled:text-stone-400"
            >
              선택한 {selected.length}건 계좌수금
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
