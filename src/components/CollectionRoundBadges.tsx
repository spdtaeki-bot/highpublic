import { useState } from "react";
import { Timestamp } from "firebase/firestore";
import { format } from "date-fns";
import { Pencil, X, Trash2, RotateCcw, Check, Loader2 } from "lucide-react";
import { DispatchRecord, PaymentMethod } from "../types";
import {
  cn,
  RoundBreakdownItem,
  CollectionRoundSource,
  CollectionEntryOperation,
  CollectionEntryPatch,
  buildCollectionEntryUpdates,
} from "../lib/utils";

interface CollectionRoundBadgesProps {
  rounds: RoundBreakdownItem[];
  /** 이 업소(같은 날) 기록 전체. 편집 결과 계산에 사용 */
  records: DispatchRecord[];
  size?: "sm" | "md";
  /** 계산된 기록별 변경을 실제로 저장 (Firestore + 로컬 상태) */
  onApply: (
    updates: Array<{ id: string; updates: Partial<DispatchRecord> }>,
  ) => Promise<void>;
  onConfirm: (message: string, action: () => Promise<void> | void) => void;
  onAlert: (message: string) => void;
  /** false 면 뱃지만 표시 (편집/삭제 버튼 없음) */
  editable?: boolean;
}

interface Draft {
  amount: string;
  paymentMethod: PaymentMethod;
  depositorName: string;
  /** yyyy-MM-ddTHH:mm (datetime-local) */
  datetime: string;
  deleted: boolean;
}

const toDate = (v: any): Date | null => {
  if (!v) return null;
  try {
    const d = v.toDate ? v.toDate() : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

const toLocalInput = (v: any): string => {
  const d = toDate(v);
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : "";
};

const sameMinute = (a: any, b: string): boolean => {
  const d = toDate(a);
  if (!d && !b) return true;
  if (!d || !b) return false;
  return format(d, "yyyy-MM-dd'T'HH:mm") === b;
};

const methodLabel = (m?: PaymentMethod) =>
  m === "TRANSFER" ? "계좌" : m === "CASH" ? "현금" : "";

const sourceTitle = (s: CollectionRoundSource) =>
  s.isShared
    ? `업소 공용 수금 (${s.refs.length}건 기록에 함께 저장됨)`
    : `${s.staffName || "직원"} · ${s.isOnSite ? "현장 수금" : "개별 수금"}`;

const badgeKey = (rd: RoundBreakdownItem, idx: number) =>
  `${rd.isOnSite ? "onsite" : rd.round}-${idx}-${rd.sources.map((s) => s.key).join("|")}`;

export function CollectionRoundBadges({
  rounds,
  records,
  size = "md",
  onApply,
  onConfirm,
  onAlert,
  editable = true,
}: CollectionRoundBadgesProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);

  if (!rounds || rounds.length === 0) return null;

  const sm = size === "sm";

  const openEditor = (rd: RoundBreakdownItem, key: string) => {
    if (editingKey === key) {
      setEditingKey(null);
      return;
    }
    const next: Record<string, Draft> = {};
    rd.sources.forEach((s) => {
      next[s.key] = {
        amount: String(s.amount ?? ""),
        paymentMethod: s.paymentMethod === "TRANSFER" ? "TRANSFER" : "CASH",
        depositorName: s.depositorName || "",
        datetime: toLocalInput(s.collectedAt),
        deleted: false,
      };
    });
    setDrafts(next);
    setEditingKey(key);
  };

  const runApply = async (ops: CollectionEntryOperation[]) => {
    const { updates, error } = buildCollectionEntryUpdates(records, ops);
    if (error) {
      onAlert(error);
      return false;
    }
    if (updates.length === 0) return true;
    setSaving(true);
    try {
      await onApply(updates);
      return true;
    } catch (e) {
      console.error("수금 건 편집 저장 오류:", e);
      onAlert("수금 내역 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const describe = (s: CollectionRoundSource) =>
    `- ${sourceTitle(s)}: ${s.amount.toLocaleString()}원${
      s.paymentMethod ? ` (${methodLabel(s.paymentMethod)})` : ""
    }${s.depositorName ? ` [${s.depositorName}]` : ""}`;

  const handleDeleteBadge = (rd: RoundBreakdownItem) => {
    if (rd.sources.length === 0) {
      onAlert("이 수금 건은 편집 정보를 찾을 수 없습니다. 화면을 새로고침해 주세요.");
      return;
    }
    const lines = rd.sources.map(describe).join("\n");
    onConfirm(
      `아래 수금 기록을 삭제하시겠습니까?\n\n${lines}\n\n삭제 후 남는 수금이 없는 기록은 미수로 되돌아갑니다. 다른 수금 건은 그대로 유지됩니다.`,
      async () => {
        const ok = await runApply(rd.sources.map((s) => ({ source: s, patch: null })));
        if (ok) setEditingKey(null);
      },
    );
  };

  const handleSave = (rd: RoundBreakdownItem) => {
    const ops: CollectionEntryOperation[] = [];
    const deletions: CollectionRoundSource[] = [];
    for (const s of rd.sources) {
      const d = drafts[s.key];
      if (!d) continue;
      if (d.deleted) {
        ops.push({ source: s, patch: null });
        deletions.push(s);
        continue;
      }
      const patch: CollectionEntryPatch = {};
      const amt = Number(String(d.amount).replace(/,/g, ""));
      if (isNaN(amt) || amt <= 0) {
        onAlert(`[${sourceTitle(s)}] 금액은 0보다 큰 숫자여야 합니다.`);
        return;
      }
      if (amt !== s.amount) patch.amount = amt;
      if (d.paymentMethod !== (s.paymentMethod === "TRANSFER" ? "TRANSFER" : "CASH")) {
        patch.paymentMethod = d.paymentMethod;
      }
      if ((d.depositorName || "") !== (s.depositorName || "")) {
        patch.depositorName = d.depositorName.trim() || null;
      }
      if (!sameMinute(s.collectedAt, d.datetime)) {
        if (!d.datetime) {
          onAlert(`[${sourceTitle(s)}] 수금 일시를 입력해 주세요.`);
          return;
        }
        const dt = new Date(d.datetime);
        if (isNaN(dt.getTime())) {
          onAlert(`[${sourceTitle(s)}] 수금 일시 형식이 올바르지 않습니다.`);
          return;
        }
        patch.collectedAt = Timestamp.fromDate(dt);
      }
      if (Object.keys(patch).length > 0) ops.push({ source: s, patch });
    }

    if (ops.length === 0) {
      setEditingKey(null);
      return;
    }

    const commit = async () => {
      const ok = await runApply(ops);
      if (ok) setEditingKey(null);
    };

    if (deletions.length > 0) {
      onConfirm(
        `아래 수금 기록을 삭제하고 나머지 변경을 저장하시겠습니까?\n\n${deletions
          .map(describe)
          .join("\n")}`,
        commit,
      );
    } else {
      void commit();
    }
  };

  return (
    <div className="flex flex-wrap items-start gap-1.5 w-full min-w-0">
      {rounds.map((rd, idx) => {
        const key = badgeKey(rd, idx);
        const isEditing = editingKey === key;
        const tone = rd.isOnSite
          ? {
              badge: "bg-teal-50 text-teal-950 border-teal-300",
              tag: "bg-teal-200/90 text-teal-950",
            }
          : rd.round === 1
            ? {
                badge: "bg-emerald-50 text-emerald-900 border-emerald-300",
                tag: "bg-emerald-200/80 text-emerald-900",
              }
            : {
                badge: "bg-amber-50 text-amber-950 border-amber-300",
                tag: "bg-amber-200/80 text-amber-950",
              };

        return (
          <div key={key} className={cn("contents")}>
            <span
              className={cn(
                "max-w-full min-w-0 rounded-lg border shadow-2xs inline-flex flex-wrap items-center",
                sm ? "px-2 py-0.5 text-[11px] gap-x-1 gap-y-0.5" : "px-2.5 py-1 text-xs gap-x-1.5 gap-y-0.5",
                "font-black",
                tone.badge,
                isEditing && "ring-2 ring-offset-1 ring-stone-400",
              )}
            >
              <span
                className={cn(
                  "rounded font-black whitespace-nowrap",
                  sm ? "px-1 py-px text-[9px]" : "px-1.5 py-0.5 text-[10px]",
                  tone.tag,
                )}
              >
                {rd.isOnSite ? "현장" : `${rd.round}차`}
                {rd.sources.length > 1 && ` ${rd.sources.length}건`}
              </span>
              {rd.dateStr && (
                <span
                  className={cn(
                    "font-bold text-stone-600 whitespace-nowrap",
                    sm ? "text-[10px]" : "text-[11px]",
                  )}
                >
                  {rd.dateStr}
                </span>
              )}
              <span className="font-black text-stone-900 whitespace-nowrap">
                {rd.amount.toLocaleString()}원
              </span>
              {rd.paymentMethod && (
                <span
                  className={cn(
                    "font-bold text-stone-500 whitespace-nowrap",
                    sm ? "text-[9px]" : "text-[10px]",
                  )}
                >
                  ({methodLabel(rd.paymentMethod)})
                </span>
              )}
              {rd.depositorName && (
                <span
                  className={cn(
                    "font-black text-blue-600 break-all",
                    sm ? "text-[9px]" : "text-[10px]",
                  )}
                >
                  [{rd.depositorName}]
                </span>
              )}
              {editable && rd.sources.length > 0 && (
                <span className="inline-flex items-center gap-0.5 ml-0.5 shrink-0">
                  <button
                    type="button"
                    title="이 수금 건 수정"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditor(rd, key);
                    }}
                    disabled={saving}
                    className={cn(
                      "rounded-md border border-stone-300/80 bg-white/80 text-stone-600 hover:bg-stone-900 hover:text-white hover:border-stone-900 transition-colors cursor-pointer disabled:opacity-50",
                      sm ? "p-0.5" : "p-1",
                    )}
                  >
                    <Pencil className={sm ? "w-2.5 h-2.5" : "w-3 h-3"} />
                  </button>
                  <button
                    type="button"
                    title="이 수금 건 삭제"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBadge(rd);
                    }}
                    disabled={saving}
                    className={cn(
                      "rounded-md border border-stone-300/80 bg-white/80 text-stone-600 hover:bg-red-600 hover:text-white hover:border-red-600 transition-colors cursor-pointer disabled:opacity-50",
                      sm ? "p-0.5" : "p-1",
                    )}
                  >
                    <X className={sm ? "w-2.5 h-2.5" : "w-3 h-3"} />
                  </button>
                </span>
              )}
            </span>

            {isEditing && (
              <div
                className="basis-full w-full min-w-0 mt-1 rounded-xl border-2 border-stone-300 bg-white shadow-sm p-3 space-y-2.5"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-stone-800">
                    {rd.isOnSite ? "현장 수금" : `${rd.round}차 수금`} 수정
                    {rd.sources.length > 1 && (
                      <span className="ml-1 text-stone-500 font-bold">
                        ({rd.sources.length}건이 한 뱃지로 묶여 있음)
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingKey(null)}
                    className="text-stone-400 hover:text-stone-800 cursor-pointer"
                    title="닫기"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  {rd.sources.map((s) => {
                    const d = drafts[s.key];
                    if (!d) return null;
                    return (
                      <div
                        key={s.key}
                        className={cn(
                          "rounded-lg border p-2.5 space-y-2",
                          d.deleted
                            ? "border-red-200 bg-red-50/60"
                            : "border-stone-200 bg-stone-50/70",
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={cn(
                              "text-[11px] font-black",
                              d.deleted ? "text-red-700 line-through" : "text-stone-700",
                            )}
                          >
                            {sourceTitle(s)}
                          </span>
                          {d.deleted ? (
                            <button
                              type="button"
                              onClick={() =>
                                setDrafts((p) => ({
                                  ...p,
                                  [s.key]: { ...p[s.key], deleted: false },
                                }))
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-stone-300 text-[11px] font-black text-stone-700 hover:bg-stone-100 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" /> 복구
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setDrafts((p) => ({
                                  ...p,
                                  [s.key]: { ...p[s.key], deleted: true },
                                }))
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-red-200 text-[11px] font-black text-red-700 hover:bg-red-600 hover:text-white cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" /> 이 건 삭제
                            </button>
                          )}
                        </div>

                        {!d.deleted && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <label className="flex flex-col gap-1 min-w-0">
                              <span className="text-[10px] font-black text-stone-500">금액 (원)</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                step={1000}
                                value={d.amount}
                                onChange={(e) =>
                                  setDrafts((p) => ({
                                    ...p,
                                    [s.key]: { ...p[s.key], amount: e.target.value },
                                  }))
                                }
                                className="w-full min-w-0 px-2 py-1.5 rounded-md border border-stone-300 bg-white text-xs font-black text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
                              />
                            </label>
                            <label className="flex flex-col gap-1 min-w-0">
                              <span className="text-[10px] font-black text-stone-500">수단</span>
                              <select
                                value={d.paymentMethod}
                                onChange={(e) =>
                                  setDrafts((p) => ({
                                    ...p,
                                    [s.key]: {
                                      ...p[s.key],
                                      paymentMethod: e.target.value as PaymentMethod,
                                    },
                                  }))
                                }
                                className="w-full min-w-0 px-2 py-1.5 rounded-md border border-stone-300 bg-white text-xs font-black text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
                              >
                                <option value="CASH">현금</option>
                                <option value="TRANSFER">계좌</option>
                              </select>
                            </label>
                            <label className="flex flex-col gap-1 min-w-0">
                              <span className="text-[10px] font-black text-stone-500">입금자</span>
                              <input
                                type="text"
                                value={d.depositorName}
                                placeholder="없음"
                                onChange={(e) =>
                                  setDrafts((p) => ({
                                    ...p,
                                    [s.key]: { ...p[s.key], depositorName: e.target.value },
                                  }))
                                }
                                className="w-full min-w-0 px-2 py-1.5 rounded-md border border-stone-300 bg-white text-xs font-black text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
                              />
                            </label>
                            <label className="flex flex-col gap-1 min-w-0">
                              <span className="text-[10px] font-black text-stone-500">수금 일시</span>
                              <input
                                type="datetime-local"
                                value={d.datetime}
                                onChange={(e) =>
                                  setDrafts((p) => ({
                                    ...p,
                                    [s.key]: { ...p[s.key], datetime: e.target.value },
                                  }))
                                }
                                className="w-full min-w-0 px-2 py-1.5 rounded-md border border-stone-300 bg-white text-xs font-black text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-400"
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditingKey(null)}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg bg-stone-100 text-stone-700 text-xs font-black hover:bg-stone-200 cursor-pointer disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSave(rd)}
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-black hover:bg-stone-800 cursor-pointer disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    저장
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
