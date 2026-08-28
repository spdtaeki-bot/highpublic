import React, { useRef, useState } from 'react';
import { format } from 'date-fns';

export function BatchCollectForm({ 
  initialMethod, 
  totalUnpaidAmount = 0,
  onCollect, 
  onPass, 
  onCancel 
}: { 
  initialMethod: 'CASH' | 'TRANSFER' | 'UNPAID' | string,
  totalUnpaidAmount?: number,
  onCollect: (method: any, date: string, time: string, depositorName: string, customAmount?: number) => void,
  onPass: (method: any) => void,
  onCancel: () => void 
}) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const depositorInputRef = useRef<HTMLInputElement>(null);
  const [amountStr, setAmountStr] = useState<string>('');

  const parsedAmount = amountStr ? parseInt(amountStr.replace(/,/g, ''), 10) : undefined;
  const isShortage = parsedAmount !== undefined && totalUnpaidAmount > 0 && parsedAmount < totalUnpaidAmount;
  const isExcess = parsedAmount !== undefined && totalUnpaidAmount > 0 && parsedAmount > totalUnpaidAmount;
  const diff = parsedAmount !== undefined && totalUnpaidAmount > 0 ? Math.abs(totalUnpaidAmount - parsedAmount) : 0;

  const isCash = initialMethod === 'CASH';

  return (
    <div 
      className="w-full flex flex-col gap-2.5 p-3 bg-stone-50/95 rounded-2xl border-2 border-stone-800 shadow-md animate-in fade-in slide-in-from-top-2 overflow-hidden box-border" 
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-stone-200 pb-1.5 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`px-2 py-0.5 rounded-md text-[11px] font-black text-white shrink-0 ${isCash ? 'bg-emerald-600' : 'bg-blue-600'}`}>
            {isCash ? '💵 현금 전체 수금' : '💳 계좌 전체 수금'}
          </span>
          <span className="text-[11px] font-bold text-stone-600 truncate">
            일괄 수금 정보 입력
          </span>
        </div>
        {totalUnpaidAmount > 0 && (
          <span className="text-[10px] font-extrabold text-stone-500 whitespace-nowrap shrink-0">
            총 미수: {totalUnpaidAmount.toLocaleString()}원
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[9px] font-black text-stone-500 uppercase ml-0.5 tracking-wider whitespace-nowrap">날짜 (MMDD)</span>
          <input 
            ref={dateInputRef}
            type="text"
            inputMode="numeric"
            maxLength={4}
            defaultValue={format(new Date(), 'MMdd')}
            onFocus={(e) => e.target.select()}
            onChange={e => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 4);
              e.target.value = val;
              if (val.length === 4) {
                setTimeout(() => timeInputRef.current?.focus(), 0);
              }
            }}
            className="w-full px-2 py-1 bg-white border border-stone-300 rounded-xl text-xs font-black focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none transition-all box-border"
            placeholder={format(new Date(), 'MMdd')}
          />
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[9px] font-black text-stone-500 uppercase ml-0.5 tracking-wider whitespace-nowrap">시간 (HHMM)</span>
          <input 
            ref={timeInputRef}
            type="text"
            inputMode="numeric"
            maxLength={4}
            defaultValue={format(new Date(), 'HHmm')}
            onFocus={(e) => e.target.select()}
            onChange={e => {
              e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
            }}
            className="w-full px-2 py-1 bg-white border border-stone-300 rounded-xl text-xs font-black focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none transition-all box-border"
            placeholder={format(new Date(), 'HHmm')}
          />
        </div>
        <div className="flex flex-col gap-0.5 col-span-2 sm:col-span-2 min-w-0">
          <span className="text-[9px] font-black text-stone-500 uppercase ml-0.5 tracking-wider whitespace-nowrap">입금자명 (선택)</span>
          <input 
            ref={depositorInputRef}
            type="text"
            className="w-full px-2 py-1 bg-white border border-stone-300 rounded-xl text-xs font-bold focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none transition-all box-border"
            placeholder="입금자명 입력"
          />
        </div>

        {/* 수금 금액 입력란 (선택) */}
        <div className="flex flex-col gap-0.5 col-span-2 sm:col-span-4 min-w-0">
          <div className="flex items-center justify-between ml-0.5">
            <span className="text-[9px] font-black text-stone-500 uppercase tracking-wider whitespace-nowrap">
              실제 수금 금액 (선택)
            </span>
          </div>
          <input 
            type="text"
            inputMode="numeric"
            value={amountStr}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, '');
              if (!raw) {
                setAmountStr('');
              } else {
                setAmountStr(parseInt(raw, 10).toLocaleString());
              }
            }}
            onFocus={(e) => e.target.select()}
            className="w-full px-2.5 py-1.5 bg-white border border-stone-300 rounded-xl text-sm font-black text-emerald-700 focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none transition-all placeholder:text-stone-300 placeholder:font-normal box-border"
            placeholder={totalUnpaidAmount > 0 ? `미입력 시 전체 ${totalUnpaidAmount.toLocaleString()}원` : '받은 금액 입력'}
          />

          {/* 실시간 감액/완납 상태 안내 */}
          {parsedAmount !== undefined && (
            <div className="mt-0.5">
              {isShortage ? (
                <div className="px-2 py-1 bg-red-100 border border-red-200 text-red-700 text-[10px] font-black rounded-lg flex items-center justify-between animate-pulse">
                  <span>⚠️ 미수금보다 {diff.toLocaleString()}원 적게 수금됩니다 (감액)</span>
                  <span className="bg-red-600 text-white px-1.5 py-0.2 rounded text-[9px]">감액기록</span>
                </div>
              ) : isExcess ? (
                <div className="px-2 py-1 bg-blue-100 border border-blue-200 text-blue-700 text-[10px] font-black rounded-lg flex items-center justify-between">
                  <span>미수금보다 {diff.toLocaleString()}원 더 많습니다</span>
                  <span className="bg-blue-600 text-white px-1.5 py-0.2 rounded text-[9px]">초과수금</span>
                </div>
              ) : (
                <div className="px-2 py-1 bg-emerald-100 border border-emerald-200 text-emerald-700 text-[10px] font-black rounded-lg flex items-center justify-between">
                  <span>전체 미수금 완납</span>
                </div>
              )}
            </div>
          )}
          {parsedAmount === undefined && totalUnpaidAmount > 0 && (
            <span className="text-[9px] text-stone-400 font-medium ml-0.5">
              * 금액 미입력 시 전체 미수금({totalUnpaidAmount.toLocaleString()}원)으로 자동 완납 처리됩니다.
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-1.5 mt-0.5">
        <button 
          onClick={() => onPass(initialMethod)}
          className="flex-1 py-1.5 bg-stone-200 text-stone-700 rounded-xl text-[10px] font-black hover:bg-stone-300 transition-all cursor-pointer"
        >
          패스
        </button>
        <button 
          onClick={() => {
            const date = dateInputRef.current?.value || '';
            const time = timeInputRef.current?.value || '';
            const depositorName = depositorInputRef.current?.value || '';
            if (date.length === 4 && time.length === 4) {
              onCollect(initialMethod, date, time, depositorName, parsedAmount);
            } else {
              alert('날짜와 시간을 4자리씩 입력해주세요.');
            }
          }}
          className="flex-2 py-1.5 bg-stone-900 text-white rounded-xl text-[11px] font-black hover:bg-stone-800 transition-all shadow-sm cursor-pointer"
        >
          확인 (수금 완료)
        </button>
        <button 
          onClick={onCancel}
          className="px-3 py-1.5 bg-white text-stone-500 rounded-xl text-[10px] font-black border border-stone-300 cursor-pointer"
        >
          취소
        </button>
      </div>
    </div>
  );
}

