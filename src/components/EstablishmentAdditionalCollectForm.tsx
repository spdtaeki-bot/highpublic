import React, { useState } from "react";
import { format } from "date-fns";
import { PaymentMethod } from "../types";

export function EstablishmentAdditionalCollectForm({
  estName,
  originalTotal,
  currentCollected,
  onCollectAdditional,
  onCancel,
}: {
  estName: string;
  originalTotal: number;
  currentCollected: number;
  onCollectAdditional: (
    method: PaymentMethod,
    additionalAmount: number,
    depositorName: string,
    collectedDate: string,
    collectedTime: string,
  ) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"ADD" | "SET">("ADD");
  const [amountStr, setAmountStr] = useState<string>("");
  const [method, setMethod] = useState<PaymentMethod>("TRANSFER");
  const [depositorName, setDepositorName] = useState<string>("");
  const [collectedDate, setCollectedDate] = useState<string>(
    format(new Date(), "MMdd"),
  );
  const [collectedTime, setCollectedTime] = useState<string>(
    format(new Date(), "HHmm"),
  );

  const shortage = Math.max(0, originalTotal - currentCollected);
  const inputNum = amountStr ? parseInt(amountStr.replace(/,/g, ""), 10) : 0;

  const additionalAmount = mode === "ADD" ? inputNum : inputNum - currentCollected;
  const newTotalCollected = currentCollected + additionalAmount;
  const newShortage = originalTotal - newTotalCollected;

  return (
    <div
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
              setAmountStr(originalTotal ? originalTotal.toLocaleString() : "");
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

      {/* 수금 현황 개요 */}
      <div className="grid grid-cols-3 gap-2 text-center bg-white/80 p-2 rounded-xl border border-amber-200 text-[11px] font-bold">
        <div>
          <span className="text-stone-400 block text-[9px]">원래 총 견적</span>
          <span className="text-stone-900 font-extrabold">{originalTotal.toLocaleString()}원</span>
        </div>
        <div>
          <span className="text-stone-400 block text-[9px]">기존 수금액</span>
          <span className="text-emerald-700 font-extrabold">{currentCollected.toLocaleString()}원</span>
        </div>
        <div>
          <span className="text-stone-400 block text-[9px]">현재 잔여 미수</span>
          <span className="text-red-600 font-extrabold">{shortage.toLocaleString()}원</span>
        </div>
      </div>

      {/* 입력 영역 */}
      <div className="flex flex-col gap-2.5">
        {/* 1. 수금 일자 및 시간 */}
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
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={collectedDate}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setCollectedDate(val);
                }}
                className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded-xl text-[13px] font-black text-stone-900 focus:ring-2 focus:ring-amber-700 outline-none transition-all"
                placeholder={format(new Date(), "MMdd")}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-extrabold text-stone-500 ml-1">시간 (HHMM)</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={collectedTime}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setCollectedTime(val);
                }}
                className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded-xl text-[13px] font-black text-stone-900 focus:ring-2 focus:ring-amber-700 outline-none transition-all"
                placeholder={format(new Date(), "HHmm")}
              />
            </div>
          </div>
        </div>

        {/* 2. 입금자명 및 수금 수단 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* 입금자명 */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-amber-950 uppercase ml-1">2. 입금자명 (선택)</span>
            <input
              type="text"
              value={depositorName}
              onChange={(e) => setDepositorName(e.target.value)}
              className="w-full px-2.5 py-2 bg-white border border-stone-200 rounded-xl text-[13px] font-bold text-stone-900 focus:ring-2 focus:ring-amber-700 outline-none transition-all placeholder:text-stone-300 placeholder:font-normal"
              placeholder="입금자명 입력 (선택)"
            />
          </div>

          {/* 수금 수단 */}
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

        {/* 3. 추가 수금액 입력 */}
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
          <input
            type="text"
            inputMode="numeric"
            value={amountStr}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, "");
              if (!raw) {
                setAmountStr("");
              } else {
                setAmountStr(parseInt(raw, 10).toLocaleString());
              }
            }}
            onFocus={(e) => e.target.select()}
            className="w-full px-3 py-2 bg-white border-2 border-amber-300 rounded-xl text-[16px] font-black text-amber-950 focus:ring-2 focus:ring-amber-700 outline-none transition-all placeholder:text-stone-300 placeholder:font-normal"
            placeholder={
              mode === "ADD"
                ? `추가 수금액 입력 (예: ${shortage.toLocaleString()})`
                : `${originalTotal.toLocaleString()}원`
            }
          />
        </div>
      </div>

      {/* 변경 후 결과 예상 */}
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
          type="button"
          onClick={() => {
            if (additionalAmount === 0 && mode === "ADD") {
              alert("추가 수금 금액을 입력해주세요.");
              return;
            }
            onCollectAdditional(
              method,
              additionalAmount,
              depositorName,
              collectedDate,
              collectedTime,
            );
          }}
          className="flex-1 py-2 bg-amber-900 text-white rounded-xl text-xs font-black hover:bg-amber-950 transition-all shadow-md active:scale-95 cursor-pointer"
        >
          추가 수금 및 자동 항목 조정 적용
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-white text-stone-600 rounded-xl text-xs font-black border border-stone-200 hover:bg-stone-100 cursor-pointer"
        >
          취소
        </button>
      </div>
    </div>
  );
}
