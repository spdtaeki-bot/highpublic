import React, { useRef, useState } from 'react';
import { format } from 'date-fns';

export function InlineRowCollectForm({ 
  initialMethod, 
  originalAmount = 0,
  onCollect, 
  onPass, 
  onCancel 
}: { 
  initialMethod: 'CASH' | 'TRANSFER' | 'UNPAID' | string,
  originalAmount?: number,
  onCollect: (method: any, date: string, time: string, depositorName: string, customAmount?: number) => void,
  onPass: (method: any) => void,
  onCancel: () => void 
}) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const depositorInputRef = useRef<HTMLInputElement>(null);
  const [amountStr, setAmountStr] = useState<string>('');

  const parsedAmount = amountStr ? parseInt(amountStr.replace(/,/g, ''), 10) : undefined;
  const isShortage = parsedAmount !== undefined && originalAmount > 0 && parsedAmount < originalAmount;
  const isExcess = parsedAmount !== undefined && originalAmount > 0 && parsedAmount > originalAmount;
  const diff = parsedAmount !== undefined && originalAmount > 0 ? Math.abs(originalAmount - parsedAmount) : 0;

  return (
    <div className="w-full max-w-full overflow-hidden box-border flex flex-col gap-2.5 p-3 bg-stone-50/95 rounded-2xl border border-stone-300 shadow-md animate-in fade-in slide-in-from-top-2" onClick={(e) => e.stopPropagation()}>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-1">
          <span className="text-[8px] font-black text-stone-400 uppercase ml-1 tracking-wider">날짜 (MMDD)</span>
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
            className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded-xl text-[15px] font-black focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none transition-all"
            placeholder={format(new Date(), 'MMdd')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[8px] font-black text-stone-400 uppercase ml-1 tracking-wider">시간 (HHMM)</span>
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
            className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded-xl text-[15px] font-black focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none transition-all"
            placeholder={format(new Date(), 'HHmm')}
          />
        </div>
        <div className="flex flex-col gap-1 col-span-2">
          <span className="text-[8px] font-black text-stone-400 uppercase ml-1 tracking-wider">입금자명 (선택)</span>
          <input 
            ref={depositorInputRef}
            type="text"
            className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded-xl text-[14px] font-bold focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none transition-all"
            placeholder="입금자명을 입력하세요"
          />
        </div>

        {/* 수금 금액 입력란 (선택) */}
        <div className="flex flex-col gap-1 col-span-2">
          <div className="flex items-center justify-between ml-1">
            <span className="text-[8px] font-black text-stone-500 uppercase tracking-wider">
              실제 수금 금액 (선택)
            </span>
            {originalAmount > 0 && (
              <span className="text-[9px] font-bold text-stone-400">
                원금: {originalAmount.toLocaleString()}원
              </span>
            )}
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
            className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded-xl text-[15px] font-black text-emerald-700 focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none transition-all placeholder:text-stone-300 placeholder:font-normal"
            placeholder={originalAmount > 0 ? `미입력 시 ${originalAmount.toLocaleString()}원` : '받은 금액 입력'}
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
                  <span>완납 처리</span>
                </div>
              )}
            </div>
          )}
          {parsedAmount === undefined && originalAmount > 0 && (
            <span className="text-[9px] text-stone-400 font-medium ml-1">
              * 금액을 입력하지 않으면 미수금({originalAmount.toLocaleString()}원)으로 처리됩니다.
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-2 mt-1">
        <button 
          onClick={() => onPass(initialMethod)}
          className="flex-1 py-1.5 bg-stone-100 text-stone-600 rounded-lg text-[9px] font-black hover:bg-stone-200 transition-all"
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
          className="flex-1 py-1.5 bg-stone-900 text-white rounded-lg text-[9px] font-black hover:bg-stone-800 transition-all shadow-sm"
        >
          확인
        </button>
        <button 
          onClick={onCancel}
          className="px-2 py-1.5 bg-white text-stone-400 rounded-lg text-[9px] font-black border border-stone-200"
        >
          취소
        </button>
      </div>
    </div>
  );
}

