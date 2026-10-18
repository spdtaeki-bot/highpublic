import React, { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { PaymentMethod } from "../types";
import {
  additionalCollectShortage,
  createCollectInputSession,
  decideCollectFieldChange,
  readAdditionalCollectDraft,
  type CollectInputField,
  type CollectInputSession,
} from "../lib/collectInputSession";
import {
  markCollectInputActive,
  markCollectInputIdle,
} from "../lib/collectTypingGate";

type CollectValues = {
  mode: "ADD" | "SET";
  method: PaymentMethod;
  depositorName: string;
  collectedDate: string;
  collectedTime: string;
  amountStr: string;
};

type CollectNodes = Record<CollectInputField, HTMLInputElement | null>;

type CollectBridge = {
  session: CollectInputSession;
  accepted: Record<CollectInputField, string>;
  nodes: CollectNodes;
  bases: Record<CollectInputField, string>;
  commit: () => void;
};

function digitsOnly(value: string, max?: number) {
  const digits = value.replace(/\D/g, "");
  return max === undefined ? digits : digits.slice(0, max);
}

function formatAmount(value: string) {
  const digits = digitsOnly(value);
  if (!digits) return "";
  const amount = Number.parseInt(digits, 10);
  return Number.isNaN(amount) ? "" : amount.toLocaleString();
}

function nativeInputType(event: React.ChangeEvent<HTMLInputElement> | React.CompositionEvent<HTMLInputElement>) {
  const native = event.nativeEvent as InputEvent;
  return {
    isComposing: Boolean(native.isComposing),
    inputType: typeof native.inputType === "string" ? native.inputType : undefined,
  };
}

/**
 * 키 입력마다 부모를 다시 그리면 React가 input.value와 name을 덮어쓰고
 * 한글 조합의 첫 글자와 금액 숫자가 다른 칸으로 샌다.
 * 칸은 비제어로 두고, blur와 저장 때만 값을 확정한다.
 */
const BufferedCollectInput = React.memo(function BufferedCollectInput({
  field,
  defaultValue,
  placeholder,
  className,
  maxLength,
  bridge,
}: {
  field: CollectInputField;
  defaultValue: string;
  placeholder: string;
  className: string;
  maxLength?: number;
  bridge: React.MutableRefObject<CollectBridge>;
}) {
  const renders = useRef(0);
  renders.current += 1;
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bridge.current.nodes[field] = ref.current;
    return () => {
      if (bridge.current.nodes[field] === ref.current) bridge.current.nodes[field] = null;
    };
  }, [bridge, field]);

  const restore = (element: HTMLInputElement, value: string) => {
    if (element.value !== value) element.value = value;
  };

  return (
    <input
      ref={ref}
      type="text"
      lang={field === "depositor" ? "ko" : undefined}
      inputMode={field === "depositor" ? "text" : "numeric"}
      autoComplete="off"
      maxLength={maxLength}
      data-collect-field={field}
      data-collect-renders={renders.current}
      defaultValue={defaultValue}
      placeholder={placeholder}
      className={className}
      onFocus={(event) => {
        markCollectInputActive();
        if (field === "depositor") return;
        if (bridge.current.session.composingField) return;
        try {
          event.currentTarget.select();
        } catch {
          // 일부 브라우저는 숫자 입력의 전체 선택을 거절한다.
        }
      }}
      onKeyDown={(event) => {
        markCollectInputActive();
        if (event.key === "Tab") bridge.current.session.leavingField = field;
        // 조합 직후 한 프레임 동안 걸린 봉인은 날짜가 '7'로 줄어드는 것만 막는다.
        // 숫자를 직접 누르면 그 봉인을 바로 풀어서 '1931'의 첫 자리가 되돌아가지 않는다.
        if (field !== "depositor" && /^[0-9]$/.test(event.key)) {
          bridge.current.session.sealNumericCollapse = false;
        }
      }}
      onCompositionStart={(event) => {
        markCollectInputActive();
        const session = bridge.current.session;
        session.composingField = field;
        const start = event.currentTarget.selectionStart ?? event.currentTarget.value.length;
        bridge.current.bases[field] = event.currentTarget.value.slice(0, start);
      }}
      onCompositionEnd={(event) => {
        const element = event.currentTarget;
        const session = bridge.current.session;
        if (field === "depositor") {
          // 조합 직후 value를 다시 대입하면 '미술관'의 가운데 음절이 빠지거나 '미굜'처럼 깨진다.
          bridge.current.accepted.depositor = element.value;
          session.composingField = null;
          session.sealNumericCollapse = true;
          requestAnimationFrame(() => {
            session.sealNumericCollapse = false;
          });
          return;
        }
        const digits = digitsOnly(element.value, field === "amount" ? undefined : 4);
        element.value = field === "amount" ? formatAmount(digits) : digits;
        bridge.current.accepted[field] = element.value;
        session.composingField = null;
        session.sealNumericCollapse = true;
        session.dropDepositorTrailingDigits = false;
        requestAnimationFrame(() => {
          session.sealNumericCollapse = false;
        });
      }}
      onBlur={() => {
        const session = bridge.current.session;
        if (session.leavingField === field) session.leavingField = null;
        if (session.composingField === field) session.composingField = null;
        bridge.current.commit();
      }}
      onChange={(event) => {
        markCollectInputActive();
        const element = event.currentTarget;
        const native = nativeInputType(event);
        const session = bridge.current.session;
        const focused = document.activeElement === element;
        if (field === "depositor") {
          bridge.current.accepted.depositor = element.value;
          if (native.isComposing || native.inputType === "insertCompositionText") {
            session.composingField = field;
          }
          return;
        }
        if (focused && (native.isComposing || native.inputType === "insertCompositionText")) {
          session.composingField = field;
          return;
        }
        const decision = decideCollectFieldChange({
          field,
          domValue: element.value,
          previousValue: bridge.current.accepted[field],
          focusedField: focused ? field : null,
          composingField: session.composingField,
          leavingField: session.leavingField,
          isComposing: native.isComposing,
          inputType: native.inputType,
          sealNumericCollapse: session.sealNumericCollapse,
          dropTrailingDigits: session.dropDepositorTrailingDigits,
        });
        if (!decision.accept) {
          restore(element, decision.value);
          return;
        }
        bridge.current.accepted[field] = element.value;
      }}
    />
  );
});

function CollectFormBody({
  estName,
  draftKey,
  latest,
  openedTotals,
}: {
  estName: string;
  draftKey: string;
  latest: React.MutableRefObject<{
    onCollectAdditional: (
      method: PaymentMethod,
      additionalAmount: number,
      depositorName: string,
      collectedDate: string,
      collectedTime: string,
    ) => Promise<void> | void;
    onCancel: () => void;
  }>;
  openedTotals: React.MutableRefObject<{ originalTotal: number; currentCollected: number }>;
}) {
  const storageKey = `office_additional_collect_draft:${draftKey}`;
  const [initialDraft] = useState(() =>
    readAdditionalCollectDraft(
      typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(storageKey),
    ),
  );
  const [mode, setMode] = useState<"ADD" | "SET">(initialDraft?.mode || "ADD");
  const [method, setMethod] = useState<PaymentMethod>(initialDraft?.method || "TRANSFER");
  const [values, setValues] = useState<CollectValues>(() => ({
    mode: initialDraft?.mode || "ADD",
    method: initialDraft?.method || "TRANSFER",
    depositorName: initialDraft?.depositorName || "",
    collectedDate: initialDraft?.collectedDate || format(new Date(), "MMdd"),
    collectedTime: initialDraft?.collectedTime || format(new Date(), "HHmm"),
    amountStr: initialDraft?.amountStr || "",
  }));
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const modeRef = useRef(mode);
  const methodRef = useRef(method);
  modeRef.current = mode;
  methodRef.current = method;
  const seed = useRef({
    date: values.collectedDate,
    time: values.collectedTime,
    depositor: values.depositorName,
    amount: values.amountStr,
  }).current;
  const renders = useRef(0);
  renders.current += 1;
  const bridge = useRef<CollectBridge>(null as unknown as CollectBridge);
  if (!bridge.current) {
    const accepted = {
      date: values.collectedDate,
      time: values.collectedTime,
      depositor: values.depositorName,
      amount: values.amountStr,
    };
    bridge.current = {
      session: createCollectInputSession(),
      accepted,
      nodes: { date: null, time: null, depositor: null, amount: null },
      bases: { date: "", time: "", depositor: "", amount: "" },
      commit: () => undefined,
    };
  }

  const readLive = (): CollectValues => {
    const nodes = bridge.current.nodes;
    const date = digitsOnly(nodes.date?.value ?? bridge.current.accepted.date, 4);
    const time = digitsOnly(nodes.time?.value ?? bridge.current.accepted.time, 4);
    const depositor = nodes.depositor?.value ?? bridge.current.accepted.depositor;
    const amount = formatAmount(nodes.amount?.value ?? bridge.current.accepted.amount);
    return {
      mode: modeRef.current,
      method: methodRef.current,
      depositorName: depositor,
      collectedDate: date,
      collectedTime: time,
      amountStr: amount,
    };
  };

  const commit = () => {
    const next = readLive();
    const nodes = bridge.current.nodes;
    if (nodes.date) nodes.date.value = next.collectedDate;
    if (nodes.time) nodes.time.value = next.collectedTime;
    if (nodes.amount) nodes.amount.value = next.amountStr;
    bridge.current.accepted.date = next.collectedDate;
    bridge.current.accepted.time = next.collectedTime;
    bridge.current.accepted.depositor = next.depositorName;
    bridge.current.accepted.amount = next.amountStr;
    setValues(next);
  };
  bridge.current.commit = commit;

  useEffect(() => {
    if (bridge.current.session.composingField) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(values));
    } catch {
      // 저장소가 막혀도 입력칸의 글자는 그대로 둔다.
    }
  }, [storageKey, values]);

  useEffect(() => () => markCollectInputIdle(), []);

  useEffect(() => {
    const saveDraft = () => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(readLive()));
      } catch {
        // 페이지를 닫는 중에는 저장 실패를 무시한다.
      }
    };
    const preventAccidentalReload = (event: BeforeUnloadEvent) => {
      saveDraft();
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventAccidentalReload);
    return () => window.removeEventListener("beforeunload", preventAccidentalReload);
  }, [storageKey]);

  const shortage = Math.max(
    0,
    openedTotals.current.originalTotal - openedTotals.current.currentCollected,
  );
  const inputNum = values.amountStr ? parseInt(values.amountStr.replace(/,/g, ""), 10) : 0;
  const additionalAmount =
    mode === "ADD" ? inputNum : inputNum - openedTotals.current.currentCollected;
  const newTotalCollected = openedTotals.current.currentCollected + additionalAmount;
  const newShortage = additionalCollectShortage({
    originalTotal: openedTotals.current.originalTotal,
    currentCollected: openedTotals.current.currentCollected,
    mode,
    amountStr: values.amountStr,
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    const live = readLive();
    const liveAmount = live.amountStr ? parseInt(live.amountStr.replace(/,/g, ""), 10) : 0;
    const liveAdditional =
      modeRef.current === "ADD"
        ? liveAmount
        : liveAmount - openedTotals.current.currentCollected;
    if (liveAdditional === 0 && modeRef.current === "ADD") {
      alert("추가 수금 금액을 입력해주세요.");
      return;
    }
    if (bridge.current.session.composingField) bridge.current.session.composingField = null;
    commit();
    savingRef.current = true;
    setIsSaving(true);
    try {
      await latest.current.onCollectAdditional(
        method,
        liveAdditional,
        live.depositorName,
        live.collectedDate,
        live.collectedTime,
      );
      sessionStorage.removeItem(storageKey);
    } catch {
      // 상위 핸들러가 오류 안내와 낙관적 상태 복구를 담당한다.
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const datePlaceholder = format(new Date(), "MMdd");
  const timePlaceholder = format(new Date(), "HHmm");

  return (
    <form
      onSubmit={handleSubmit}
      data-collect-renders={renders.current}
      className="p-3.5 bg-amber-50 rounded-2xl border-2 border-amber-400 shadow-lg my-2 space-y-3 animate-in fade-in slide-in-from-top-2 w-full max-w-full overflow-hidden box-border"
      onClick={(e) => e.stopPropagation()}
      onFocus={() => markCollectInputActive()}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        markCollectInputIdle();
      }}
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
              modeRef.current = "ADD";
              setMode("ADD");
              const amount = bridge.current.nodes.amount;
              if (amount) amount.value = "";
              bridge.current.accepted.amount = "";
              commit();
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
              modeRef.current = "SET";
              setMode("SET");
              const next = openedTotals.current.originalTotal
                ? openedTotals.current.originalTotal.toLocaleString()
                : "";
              const amount = bridge.current.nodes.amount;
              if (amount) amount.value = next;
              bridge.current.accepted.amount = next;
              commit();
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
                const date = format(now, "MMdd");
                const time = format(now, "HHmm");
                if (bridge.current.nodes.date) bridge.current.nodes.date.value = date;
                if (bridge.current.nodes.time) bridge.current.nodes.time.value = time;
                bridge.current.accepted.date = date;
                bridge.current.accepted.time = time;
                commit();
              }}
              className="text-[10px] font-black text-amber-800 underline hover:text-amber-950 cursor-pointer"
            >
              현재 시간으로 설정
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-0.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-extrabold text-stone-500 ml-1">날짜 (MMDD)</span>
              <BufferedCollectInput
                field="date"
                defaultValue={seed.date}
                bridge={bridge}
                placeholder={datePlaceholder}
                maxLength={4}
                className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded-xl text-[13px] font-black text-stone-900 focus:ring-2 focus:ring-amber-700 outline-none transition-all"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-extrabold text-stone-500 ml-1">시간 (HHMM)</span>
              <BufferedCollectInput
                field="time"
                defaultValue={seed.time}
                bridge={bridge}
                placeholder={timePlaceholder}
                maxLength={4}
                className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded-xl text-[13px] font-black text-stone-900 focus:ring-2 focus:ring-amber-700 outline-none transition-all"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-amber-950 uppercase ml-1">2. 입금자명 (선택)</span>
            <BufferedCollectInput
              field="depositor"
              defaultValue={seed.depositor}
              bridge={bridge}
              placeholder="입금자명 입력 (선택)"
              className="w-full px-2.5 py-2 bg-white border border-stone-200 rounded-xl text-[13px] font-bold text-stone-900 focus:ring-2 focus:ring-amber-700 outline-none transition-all placeholder:text-stone-300 placeholder:font-normal"
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
                onClick={() => {
                  const next = shortage.toLocaleString();
                  const amount = bridge.current.nodes.amount;
                  if (amount) amount.value = next;
                  bridge.current.accepted.amount = next;
                  commit();
                }}
                className="text-[10px] font-black text-amber-800 underline hover:text-amber-950 cursor-pointer"
              >
                미수 잔액({shortage.toLocaleString()}원) 전액 채우기
              </button>
            )}
          </div>
          <BufferedCollectInput
            field="amount"
            defaultValue={seed.amount}
            bridge={bridge}
            placeholder={
              mode === "ADD"
                ? `추가 수금액 입력 (예: ${shortage.toLocaleString()})`
                : `${openedTotals.current.originalTotal.toLocaleString()}원`
            }
            className="w-full px-3 py-2 bg-white border-2 border-amber-300 rounded-xl text-[16px] font-black text-amber-950 focus:ring-2 focus:ring-amber-700 outline-none transition-all placeholder:text-stone-300 placeholder:font-normal"
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
            latest.current.onCancel();
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

const StableCollectFormBody = React.memo(
  CollectFormBody,
  (prev, next) =>
    prev.estName === next.estName &&
    prev.draftKey === next.draftKey &&
    prev.latest === next.latest &&
    prev.openedTotals === next.openedTotals,
);

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
  const latest = useRef({ onCollectAdditional, onCancel });
  latest.current = { onCollectAdditional, onCancel };
  const openedTotals = useRef({ originalTotal, currentCollected });
  return (
    <StableCollectFormBody
      estName={estName}
      draftKey={draftKey}
      latest={latest}
      openedTotals={openedTotals}
    />
  );
}
