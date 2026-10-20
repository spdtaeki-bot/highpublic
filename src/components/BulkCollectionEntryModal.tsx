import React, { useRef, useState } from "react";
import { format } from "date-fns";
import { Plus, Trash2, X } from "lucide-react";
import {
  collectionOperationAlreadyExists,
  createBulkCollectionOperationId,
  parseBulkAmount,
  parseBulkTime,
  type BulkCollectionOperation,
  type BulkCollectionSaveResult,
  type BulkCollectTarget,
} from "../lib/bulkCollect";

const fieldClass =
  "w-full min-w-0 rounded-xl border border-stone-300 bg-white px-2.5 py-2 text-xs font-bold text-stone-900 outline-none transition-all focus:border-amber-600 focus:ring-2 focus:ring-amber-200";

function defaultTime() {
  return format(new Date(), "HHmm");
}

function targetLabel(target: BulkCollectTarget) {
  return `${target.businessDate.slice(5).replace("-", "/")} ${target.establishmentName} · 미수 ${target.shortage.toLocaleString()}원`;
}

export function BulkCollectionEntryModal({
  targets,
  onSave,
  onClose,
}: {
  targets: BulkCollectTarget[];
  onSave: (operations: BulkCollectionOperation[]) => Promise<BulkCollectionSaveResult>;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const nextRowId = useRef(4);
  const [rowIds, setRowIds] = useState([1, 2, 3]);
  const [preview, setPreview] = useState<BulkCollectionOperation[] | null>(null);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<BulkCollectionSaveResult | null>(null);

  const buildPreview = () => {
    const form = formRef.current;
    if (!form) return;
    const FormDataConstructor = form.ownerDocument.defaultView?.FormData ?? FormData;
    const data = new FormDataConstructor(form);
    const now = new Date();
    const collectedDate = format(now, "yyyy-MM-dd");
    const operations: BulkCollectionOperation[] = [];

    for (const rowId of rowIds) {
      const targetKey = String(data.get(`target-${rowId}`) || "");
      const depositorName = String(data.get(`depositor-${rowId}`) || "").trim();
      const amountRaw = String(data.get(`amount-${rowId}`) || "");
      const amount = parseBulkAmount(amountRaw);
      const time = parseBulkTime(String(data.get(`time-${rowId}`) || ""));
      const method = String(data.get(`method-${rowId}`) || "TRANSFER") as
        | "CASH"
        | "TRANSFER";

      if (!targetKey && !depositorName && !amount) continue;
      const target = targets.find((item) => item.key === targetKey);
      if (!target) {
        setError(`${rowIds.indexOf(rowId) + 1}행의 업소를 선택해 주세요.`);
        return;
      }
      if (amount <= 0) {
        setError(`${rowIds.indexOf(rowId) + 1}행의 금액을 입력해 주세요.`);
        return;
      }
      if (!time) {
        setError(`${rowIds.indexOf(rowId) + 1}행의 시간을 HHMM 네 자리로 입력해 주세요.`);
        return;
      }

      const collectedAt = new Date(now);
      collectedAt.setHours(
        Number.parseInt(time.slice(0, 2), 10),
        Number.parseInt(time.slice(2), 10),
        0,
        0,
      );
      const operationId = createBulkCollectionOperationId({
        targetKey,
        collectedDate,
        time,
        depositorName,
        amount,
        method,
      });
      operations.push({
        operationId,
        targetKey,
        businessDate: target.businessDate,
        establishmentName: target.establishmentName,
        recordIds: target.records.flatMap((record) => (record.id ? [record.id] : [])),
        depositorName,
        amount,
        time,
        method,
        collectedAt,
      });
    }

    if (operations.length === 0) {
      setError("저장할 수금 내역을 한 줄 이상 입력해 주세요.");
      return;
    }
    const operationIds = operations.map((operation) => operation.operationId);
    if (new Set(operationIds).size !== operationIds.length) {
      setError("같은 수금 내역이 두 줄 이상 있습니다. 중복 행을 지워 주세요.");
      return;
    }
    const alreadySaved = operations.find((operation) => {
      const target = targets.find((item) => item.key === operation.targetKey);
      return target && collectionOperationAlreadyExists(target.records, operation.operationId);
    });
    if (alreadySaved) {
      setError(
        `${alreadySaved.establishmentName}의 같은 수금 내역이 이미 저장되어 있습니다.`,
      );
      return;
    }

    setError("");
    setResult(null);
    setPreview(operations);
  };

  const save = async () => {
    if (!preview || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      const nextResult = await onSave(preview);
      setResult(nextResult);
      setPreview(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "일괄 수금 저장 중 오류가 발생했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-4"
      data-bulk-collection-modal
    >
      <button
        type="button"
        aria-label="일괄 수금 입력 창 닫기"
        className="absolute inset-0 bg-stone-900/60 backdrop-blur-xs cursor-default"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 sm:px-5">
          <div>
            <h3 className="text-base font-black text-stone-900">일괄 수금 입력</h3>
            <p className="text-[11px] font-bold text-stone-500">
              업소별 수금을 여러 줄로 입력하고 미리 확인한 뒤 한 번에 저장합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-stone-100 p-2 text-stone-600 hover:bg-stone-200 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-3 sm:p-5">
          {result ? (
            <div className="space-y-4" data-bulk-save-result>
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-black text-emerald-800">
                {result.appliedOperationIds.length}건을 저장했습니다.
                {result.skippedOperationIds.length > 0 &&
                  ` 이미 저장된 ${result.skippedOperationIds.length}건은 중복 저장하지 않았습니다.`}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-black text-white cursor-pointer"
              >
                닫기
              </button>
            </div>
          ) : preview ? (
            <div className="space-y-4" data-bulk-collection-preview>
              <div className="overflow-x-auto rounded-2xl border border-stone-200">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-stone-100 text-[10px] font-black text-stone-500">
                    <tr>
                      <th className="px-3 py-2">업소</th>
                      <th className="px-3 py-2">입금자</th>
                      <th className="px-3 py-2 text-right">금액</th>
                      <th className="px-3 py-2">시간</th>
                      <th className="px-3 py-2">방법</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((operation) => (
                      <tr key={operation.operationId} className="border-t border-stone-100">
                        <td className="px-3 py-2 font-black text-stone-900">
                          <span className="mr-1 text-stone-400">
                            {operation.businessDate.slice(5).replace("-", "/")}
                          </span>
                          {operation.establishmentName}
                        </td>
                        <td className="px-3 py-2 font-bold">
                          {operation.depositorName || "-"}
                        </td>
                        <td className="px-3 py-2 text-right font-black text-amber-900">
                          {operation.amount.toLocaleString()}원
                        </td>
                        <td className="px-3 py-2 font-bold">
                          {operation.time.slice(0, 2)}:{operation.time.slice(2)}
                        </td>
                        <td className="px-3 py-2 font-black">
                          {operation.method === "TRANSFER" ? "계좌" : "현금"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950">
                총 {preview.length}건 ·{" "}
                {preview.reduce((sum, operation) => sum + operation.amount, 0).toLocaleString()}원
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  disabled={isSaving}
                  className="flex-1 rounded-xl border border-stone-300 bg-white py-2.5 text-xs font-black text-stone-700 cursor-pointer"
                >
                  다시 입력
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={isSaving}
                  className="flex-[2] rounded-xl bg-amber-900 py-2.5 text-xs font-black text-white cursor-pointer disabled:opacity-50"
                  data-bulk-save
                >
                  {isSaving ? "한 번에 저장 중..." : `${preview.length}건 한 번에 저장`}
                </button>
              </div>
            </div>
          ) : (
            <form ref={formRef} className="space-y-3" onSubmit={(event) => event.preventDefault()}>
              <div className="hidden grid-cols-[minmax(180px,2fr)_minmax(110px,1fr)_minmax(100px,1fr)_80px_85px_34px] gap-2 px-1 text-[10px] font-black text-stone-500 sm:grid">
                <span>업소</span>
                <span>입금자</span>
                <span>금액</span>
                <span>시간</span>
                <span>방법</span>
                <span />
              </div>
              {rowIds.map((rowId, index) => (
                <div
                  key={rowId}
                  className="grid grid-cols-2 gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-2 sm:grid-cols-[minmax(180px,2fr)_minmax(110px,1fr)_minmax(100px,1fr)_80px_85px_34px]"
                  data-bulk-row={index + 1}
                >
                  <select
                    name={`target-${rowId}`}
                    defaultValue=""
                    aria-label={`${index + 1}행 업소`}
                    className={`${fieldClass} col-span-2 sm:col-span-1`}
                  >
                    <option value="">업소 선택</option>
                    {targets.map((target) => (
                      <option key={target.key} value={target.key}>
                        {targetLabel(target)}
                      </option>
                    ))}
                  </select>
                  <input
                    name={`depositor-${rowId}`}
                    aria-label={`${index + 1}행 입금자`}
                    autoComplete="off"
                    placeholder="입금자"
                    className={fieldClass}
                  />
                  <input
                    name={`amount-${rowId}`}
                    aria-label={`${index + 1}행 금액`}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="금액"
                    className={fieldClass}
                    onInput={(event) => {
                      const amount = parseBulkAmount(event.currentTarget.value);
                      event.currentTarget.value = amount ? amount.toLocaleString() : "";
                    }}
                  />
                  <input
                    name={`time-${rowId}`}
                    aria-label={`${index + 1}행 시간`}
                    inputMode="numeric"
                    autoComplete="off"
                    defaultValue={defaultTime()}
                    maxLength={4}
                    className={fieldClass}
                    onInput={(event) => {
                      event.currentTarget.value = event.currentTarget.value
                        .replace(/\D/g, "")
                        .slice(0, 4);
                    }}
                  />
                  <select
                    name={`method-${rowId}`}
                    aria-label={`${index + 1}행 방법`}
                    defaultValue="TRANSFER"
                    className={fieldClass}
                  >
                    <option value="TRANSFER">계좌</option>
                    <option value="CASH">현금</option>
                  </select>
                  <button
                    type="button"
                    aria-label={`${index + 1}행 삭제`}
                    disabled={rowIds.length === 1}
                    onClick={() => setRowIds((current) => current.filter((id) => id !== rowId))}
                    className="flex items-center justify-center rounded-xl text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  if (rowIds.length >= 50) {
                    setError("일괄 수금은 한 번에 50건까지 입력할 수 있습니다.");
                    return;
                  }
                  setRowIds((current) => [...current, nextRowId.current++]);
                }}
                className="inline-flex items-center gap-1 rounded-xl bg-stone-100 px-3 py-2 text-xs font-black text-stone-700 hover:bg-stone-200 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> 행 추가
              </button>

              <div className="flex gap-2 border-t border-stone-200 pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-stone-300 bg-white py-2.5 text-xs font-black text-stone-700 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={buildPreview}
                  className="flex-[2] rounded-xl bg-amber-900 py-2.5 text-xs font-black text-white cursor-pointer"
                  data-bulk-preview
                >
                  입력 내용 미리 확인
                </button>
              </div>
            </form>
          )}

          {error && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700" role="alert">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
