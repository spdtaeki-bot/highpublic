import React, { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { PaymentMethod } from "../types";
import {
  additionalCollectShortage,
  createCollectInputSession,
  decideCollectFieldChange,
  readAdditionalCollectDraft,
  type CollectInputSession,
} from "../lib/collectInputSession";

export function EstablishmentAdditionalCollectForm({
  estName,
  draftKey,
  originalTotal,
  currentCollected,
  onCollectAdditional,
  onCancel,
}: {
  estName: string;
  draftKey: string;
  originalTotal: number;
  currentCollected: number;
  onCollectAdditional: (
    method: PaymentMethod,
    additionalAmount: number,
    depositorName: string,
    collectedDate: string,
    collectedTime: string,
  ) => Promise<void> | void;
  onCancel: () => void;
}) {
  const storageKey = `office_additional_collect_draft:${draftKey}`;
  const [initialDraft] = useState(() =>
    readAdditionalCollectDraft(
      typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(storageKey),
    ),
  );
  // 열린 뒤 부모가 수금액을 먼저 올려도, 이 창은 열 때의 합계만 본다.
  // 입력 중인 금액을 새 합계 위에 다시 더하면 '초과 수금'이 잠깐 뜬다.
  const openedTotals = useRef({ originalTotal, currentCollected });
  const [mode, setMode] = useState<"ADD" | "SET">(initialDraft?.mode || "ADD");
  const [amountStr, setAmountStr] = useState(initialDraft?.amountStr || "");
  const [method, setMethod] = useState<PaymentMethod>(initialDraft?.method || "TRANSFER");
  const [depositorName, setDepositorName] = useState(initialDraft?.depositorName || "");
  const [collectedDate, setCollectedDate] = useState(
    initialDraft?.collectedDate || format(new Date(), "MMdd"),
  );
  const [collectedTime, setCollectedTime] = useState(
    initialDraft?.collectedTime || format(new Date(), "HHmm"),
  );
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const sessionRef = useRef<CollectInputSession>(createCollectInputSession());
  const depositorLiveRef = useRef(initialDraft?.depositorName || "");

  const commitDepositor = useCallback((value: string) => {
    depositorLiveRef.current = value;
    setDepositorName(value);
  }, []);

  useEffect(() => {
    if (sessionRef.current.composingField) return;
    const draft = {
      mode,
      amountStr,
      method,
      depositorName,
      collectedDate,
      collectedTime,
    };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      // 저장소가 막혀도 현재 React 상태의 입력은 계속 유지한다.
    }
  }, [
    amountStr,
    collectedDate,
    collectedTime,
    depositorName,
    method,
    mode,
    storageKey,
  ]);

  useEffect(() => {
    const preventAccidentalReload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventAccidentalReload);
    return () =>
      window.removeEventListener("beforeunload", preventAccidentalReload);
  }, []);

  const shortage = Math.max(
    0,
    openedTotals.current.originalTotal - openedTotals.current.currentCollected,
  );
  const inputNum = amountStr ? parseInt(amountStr.replace(/,/g, ""), 10) : 0;
  const additionalAmount = mode === "ADD" ? inputNum : inputNum - openedTotals.current.currentCollected;
  const newTotalCollected = openedTotals.current.currentCollected + additionalAmount;
  const newShortage = additionalCollectShortage({
    originalTotal: openedTotals.current.originalTotal,
    currentCollected: openedTotals.current.currentCollected,
    mode,
    amountStr,
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current || sessionRef.current.composingField) return;
    if (additionalAmount === 0 && mode === "ADD") {
      alert("추가 수금 금액을 입력해주세요.");
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    try {
      await onCollectAdditional(
        method,
        additionalAmount,
        depositorLiveRef.current,
        collectedDate,
        collectedTime,
      );
      sessionStorage.removeItem(storageKey);
    } catch {
      // 상위 핸들러가 오류 안내와 낙관적 상태 복구를 담당한다.
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-3.5 bg-amber-50 rounded-2xl border-2 border-amber-400 shadow-lg my-2 space-y-3 animate-in fade-in slide-in-from-top-2 w-full max-w-full overflow-hidden box-border"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-amber-200 pb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-black text-amber-950">
            ➕ [{estName}] 추가 수금 및 수금액 조정
          </span>
        </div>
        <div className="flex bg-amber-200/70 p-0.5 rounded-lg text-[10px] font-black">
          <button
            type="button"
            onClick={() => {
              setMode("ADD");
              setAmountStr("");
            }}
            className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
              mode === "ADD"
                ? "bg-amber-900 text-white shadow-2xs"
                : "text-amber-800 hover:text-amber-950"
            }`}
          >
            +추가수금액
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("SET");
              setAmountStr(
                openedTotals.current.originalTotal
                  ? openedTotals.current.originalTotal.toLocaleString()
                  : "",
              );
            }}
            className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
              mode === "SET"
                ? "bg-amber-900 text-white shadow-2xs"
                : "text-amber-800 hover:text-amber-950"
            }`}
          >
            총수금액직접지정
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center bg-white/80 p-2 rounded-xl border border-amber-200 text-[11px] font-bold">
        <div>
          <span className="text-stone-400 block text-[9px]">원래 총 견적</span>
          <span className="text-stone-900 font-extrabold">
            {openedTotals.current.originalTotal.toLocaleString()}원
          </span>
        </div>
        <div>
          <span className="text-stone-400 block text-[9px]">기존 수금액</span>
          <span className="text-emerald-700 font-extrabold">
            {openedTotals.current.currentCollected.toLocaleString()}원
          </span>
        </div>
        <div>
          <span className="text-stone-400 block text-[9px]">현재 잔여 미수</span>
          <span className="text-red-600 font-extrabold">{shortage.toLocaleString()}원</span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-1 bg-white/60 p-2.5 rounded-xl border border-amber-200/80">
          <div className="flex items-center justify-between ml-1">
            <span className="text-[10px] font-black text-amber-950 uppercase">1. 수금 일시 (날짜 / 시간)</span>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setCollectedDate(format(now, "MMdd"));
                setCollectedTime(format(now, "HHmm"));
              }}
              className="text-[10px] font-black text-amber-800 underline hover:text-amber-950 cursor-pointer"
            >
              현재 시간으로 설정
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-0.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-extrabold text-stone-500 ml-1">날짜 (MMDD)</span>
              <DigitsField
                field="date"
                value={collectedDate}
                sessionRef={sessionRef}
                onValue={setCollectedDate}
                placeholder={format(new Date(), "MMdd")}
                className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded-xl text-[13px] font-black text-stone-900 focus:ring-2 focus:ring-amber-700 outline-none transition-all"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-extrabold text-stone-500 ml-1">시간 (HHMM)</span>
              <DigitsField
                field="time"
                value={collectedTime}
                sessionRef={sessionRef}
                onValue={setCollectedTime}
                placeholder={format(new Date(), "HHmm")}
                className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded-xl text-[13px] font-black text-stone-900 focus:ring-2 focus:ring-amber-700 outline-none transition-all"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-amber-950 uppercase ml-1">2. 입금자명 (선택)</span>
            <DepositorField
              committedValue={depositorName}
              onCommit={commitDepositor}
              sessionRef={sessionRef}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-amber-950 uppercase ml-1">수금 수단</span>
            <div className="flex gap-1 h-[38px]">
              <button
                type="button"
                onClick={() => setMethod("TRANSFER")}
                className={`flex-1 rounded-xl text-[12px] font-black border transition-all cursor-pointer ${
                  method === "TRANSFER"
                    ? "bg-blue-600 text-white border-blue-700 shadow-2xs"
                    : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                }`}
              >
                계좌
              </button>
              <button
                type="button"
                onClick={() => setMethod("CASH")}
                className={`flex-1 rounded-xl text-[12px] font-black border transition-all cursor-pointer ${
                  method === "CASH"
                    ? "bg-emerald-600 text-white border-emerald-700 shadow-2xs"
                    : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
                }`}
              >
                현금
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between ml-1">
            <span className="text-[10px] font-black text-amber-950 uppercase">
              3. {mode === "ADD" ? "추가로 받은 금액 (+원)" : "조정할 최종 총 수금액 (원)"}
            </span>
            {shortage > 0 && mode === "ADD" && (
              <button
                type="button"
                onClick={() => setAmountStr(shortage.toLocaleString())}
                className="text-[10px] font-black text-amber-800 underline hover:text-amber-950 cursor-pointer"
              >
                미수 잔액({shortage.toLocaleString()}원) 전액 채우기
              </button>
            )}
          </div>
          <DigitsField
            field="amount"
            value={amountStr}
            sessionRef={sessionRef}
            onValue={setAmountStr}
            placeholder={
              mode === "ADD"
                ? `추가 수금액 입력 (예: ${shortage.toLocaleString()})`
                : `${openedTotals.current.originalTotal.toLocaleString()}원`
            }
            className="w-full px-3 py-2 bg-white border-2 border-amber-300 rounded-xl text-[16px] font-black text-amber-950 focus:ring-2 focus:ring-amber-700 outline-none transition-all placeholder:text-stone-300 placeholder:font-normal"
            emphasize
          />
        </div>
      </div>

      <div className="px-3 py-2 bg-amber-100/60 border border-amber-200 rounded-xl text-[11px] font-black text-stone-800 flex items-center justify-between">
        <span>
          조정 후 총 수금액: <strong className="text-amber-950 font-black text-xs">{newTotalCollected.toLocaleString()}원</strong>
        </span>
        {newShortage > 0 ? (
          <span className="text-red-600 font-black bg-red-100 px-2 py-0.5 rounded border border-red-200">
            ⚠️ 남은 미수: {newShortage.toLocaleString()}원
          </span>
        ) : newShortage < 0 ? (
          <span className="text-blue-600 font-black bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
            초과 수금 (+{Math.abs(newShortage).toLocaleString()}원)
          </span>
        ) : (
          <span className="text-emerald-700 font-black bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
            전액 완납! 🎉 (모든 항목 수금 완료)
          </span>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={isSaving}
          className="flex-1 py-2 bg-amber-900 text-white rounded-xl text-xs font-black hover:bg-amber-950 transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50 disabled:active:scale-100"
        >
          {isSaving ? "저장 중..." : "추가 수금 및 자동 항목 조정 적용"}
        </button>
        <button
          type="button"
          onClick={() => {
            sessionStorage.removeItem(storageKey);
            onCancel();
          }}
          disabled={isSaving}
          className="px-4 py-2 bg-white text-stone-600 rounded-xl text-xs font-black border border-stone-200 hover:bg-stone-100 cursor-pointer"
        >
          취소
        </button>
      </div>
    </form>
  );
}

function nativeInputType(event: React.ChangeEvent<HTMLInputElement> | React.CompositionEvent<HTMLInputElement>) {
  const native = event.nativeEvent as InputEvent;
  return {
    isComposing: Boolean(native.isComposing),
    inputType: typeof native.inputType === "string" ? native.inputType : undefined,
  };
}

const DigitsField = React.memo(function DigitsField({
  field,
  value,
  onValue,
  sessionRef,
  placeholder,
  className,
  emphasize = false,
}: {
  field: "date" | "time" | "amount";
  value: string;
  onValue: (value: string) => void;
  sessionRef: React.MutableRefObject<CollectInputSession>;
  placeholder: string;
  className: string;
  emphasize?: boolean;
}) {
  const onFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    const element = event.currentTarget;
    requestAnimationFrame(() => {
      if (document.activeElement !== element) return;
      if (sessionRef.current.composingField || sessionRef.current.sealNumericCollapse) return;
      try {
        element.select();
      } catch {
        // 일부 브라우저는 숫자 입력의 전체 선택을 거절한다.
      }
    });
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={emphasize ? undefined : 4}
      data-collect-field={field}
      value={value}
      placeholder={placeholder}
      className={className}
      onFocus={onFocus}
      onKeyDown={(event) => {
        if (event.key === "Tab") sessionRef.current.leavingField = field;
      }}
      onBlur={() => {
        if (sessionRef.current.leavingField === field) sessionRef.current.leavingField = null;
      }}
      onChange={(event) => {
        const native = nativeInputType(event);
        const decision = decideCollectFieldChange({
          field,
          domValue: event.currentTarget.value,
          previousValue: value,
          focusedField: document.activeElement === event.currentTarget ? field : null,
          composingField: sessionRef.current.composingField,
          leavingField: sessionRef.current.leavingField,
          isComposing: native.isComposing,
          inputType: native.inputType,
          sealNumericCollapse: sessionRef.current.sealNumericCollapse,
          dropTrailingDigits: sessionRef.current.dropDepositorTrailingDigits,
        });
        if (!decision.accept) {
          event.currentTarget.value = decision.value;
          return;
        }
        if (decision.value === value) {
          event.currentTarget.value = value;
          return;
        }
        onValue(decision.value);
      }}
    />
  );
});

const DepositorField = React.memo(function DepositorField({
  committedValue,
  onCommit,
  sessionRef,
}: {
  committedValue: string;
  onCommit: (value: string) => void;
  sessionRef: React.MutableRefObject<CollectInputSession>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const liveRef = useRef(committedValue);
  const baseRef = useRef("");

  useEffect(() => {
    const element = ref.current;
    if (!element || sessionRef.current.composingField === "depositor") return;
    if (element.value !== committedValue) element.value = committedValue;
    liveRef.current = committedValue;
  }, [committedValue, sessionRef]);

  const apply = (
    element: HTMLInputElement,
    extras: {
      compositionData?: string;
      compositionBase?: string;
      isComposing: boolean;
      inputType?: string;
    },
  ) => {
    const decision = decideCollectFieldChange({
      field: "depositor",
      domValue: element.value,
      previousValue: liveRef.current,
      focusedField: document.activeElement === element ? "depositor" : null,
      composingField: sessionRef.current.composingField,
      leavingField: sessionRef.current.leavingField,
      dropTrailingDigits: sessionRef.current.dropDepositorTrailingDigits,
      isComposing: extras.isComposing,
      inputType: extras.inputType,
      compositionData: extras.compositionData,
      compositionBase: extras.compositionBase,
    });
    if (element.value !== decision.value) element.value = decision.value;
    if (!decision.accept) return;
    liveRef.current = decision.value;
    if (sessionRef.current.composingField !== "depositor") onCommit(decision.value);
  };

  return (
    <input
      ref={ref}
      type="text"
      lang="ko"
      autoComplete="off"
      data-collect-field="depositor"
      defaultValue={committedValue}
      onCompositionStart={(event) => {
        sessionRef.current.composingField = "depositor";
        const start = event.currentTarget.selectionStart ?? event.currentTarget.value.length;
        baseRef.current = event.currentTarget.value.slice(0, start);
      }}
      onCompositionEnd={(event) => {
        const native = nativeInputType(event);
        sessionRef.current.composingField = null;
        apply(event.currentTarget, {
          compositionData: event.data ?? "",
          compositionBase: baseRef.current,
          isComposing: native.isComposing,
          inputType: native.inputType,
        });
        sessionRef.current.sealNumericCollapse = true;
        sessionRef.current.dropDepositorTrailingDigits = true;
        requestAnimationFrame(() => {
          sessionRef.current.sealNumericCollapse = false;
          sessionRef.current.dropDepositorTrailingDigits = false;
        });
      }}
      onKeyDown={(event) => {
        if (event.key === "Tab") sessionRef.current.leavingField = "depositor";
      }}
      onBlur={() => {
        if (sessionRef.current.leavingField === "depositor") {
          sessionRef.current.leavingField = null;
        }
        if (sessionRef.current.composingField === "depositor") {
          sessionRef.current.composingField = null;
        }
      }}
      onChange={(event) => {
        const native = nativeInputType(event);
        apply(event.currentTarget, {
          isComposing: native.isComposing || sessionRef.current.composingField === "depositor",
          inputType: native.inputType,
        });
      }}
      className="w-full px-2.5 py-2 bg-white border border-stone-200 rounded-xl text-[13px] font-bold text-stone-900 focus:ring-2 focus:ring-amber-700 outline-none transition-all placeholder:text-stone-300 placeholder:font-normal"
      placeholder="입금자명 입력 (선택)"
    />
  );
});
