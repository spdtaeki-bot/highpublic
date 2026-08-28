import React, { useRef, useState, useEffect } from 'react';
import { format } from 'date-fns';

export function CustomPaymentTimeForm({
  initialDate,
  initialTime,
  onChange,
}: {
  initialDate: string;
  initialTime: string;
  onChange: (date: string, time: string) => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const timeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onChange(date, time);
  }, [date, time, onChange]);

  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <label className="text-[10px] font-black text-stone-400 mb-1 block ml-1">날짜 (MMDD)</label>
        <input 
          type="text"
          value={date}
          maxLength={4}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
            setDate(val);
            if (val.length === 4) {
              setTimeout(() => timeInputRef.current?.focus(), 0);
            }
          }}
          placeholder="0317"
          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>
      <div className="flex-1">
        <label className="text-[10px] font-black text-stone-400 mb-1 block ml-1">시간 (HHMM)</label>
        <input 
          ref={timeInputRef}
          type="text"
          maxLength={4}
          value={time}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setTime(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
          placeholder="1430"
          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>
    </div>
  );
}
