import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus, Clock, Store, Users, Check, Sparkles, X } from "lucide-react";
import { format } from "date-fns";
import { formatStaffNameComponents, cn } from "../lib/utils";

interface ChoiceSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffNames: string[];
  establishments: (string | { name: string })[];
  currentTime?: Date;
  onConfirm: (establishmentName: string, choiceTime: string) => void | Promise<void>;
}

export function ChoiceSetupModal({
  isOpen,
  onClose,
  staffNames,
  establishments,
  currentTime,
  onConfirm,
}: ChoiceSetupModalProps) {
  const [establishmentName, setEstablishmentName] = useState("");
  const [choiceTime, setChoiceTime] = useState(
    format(currentTime || new Date(), "HH:mm"),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Normalize establishment names
  const establishmentList = useMemo(() => {
    const names = establishments.map((e) => (typeof e === "string" ? e : e.name));
    return Array.from(new Set(names.filter(Boolean)));
  }, [establishments]);

  // Filter suggestions
  const filteredEstablishments = useMemo(() => {
    const term = establishmentName.trim().toLowerCase();
    if (!term) return establishmentList.slice(0, 10);
    return establishmentList
      .filter((name) => name.toLowerCase().includes(term))
      .slice(0, 10);
  }, [establishmentList, establishmentName]);

  useEffect(() => {
    if (isOpen) {
      setChoiceTime(format(currentTime || new Date(), "HH:mm"));
      setEstablishmentName("");
      setError(null);
      setIsSubmitting(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, currentTime]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEst = establishmentName.trim();
    if (!trimmedEst) {
      setError("가게명을 입력해주세요.");
      inputRef.current?.focus();
      return;
    }

    const trimmedTime = choiceTime.trim();
    if (!trimmedTime || !/^\d{1,2}:\d{2}$/.test(trimmedTime)) {
      setError("올바른 시간 형식(HH:mm)으로 입력해주세요. (예: 20:30)");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm(trimmedEst, trimmedTime);
      onClose();
    } catch (err: any) {
      console.error("초이스 설정 오류:", err);
      setError(err?.message || "초이스 설정 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const adjustMinutes = (delta: number) => {
    try {
      const [hStr, mStr] = choiceTime.split(":");
      let h = parseInt(hStr, 10) || 0;
      let m = parseInt(mStr, 10) || 0;
      let totalMins = h * 60 + m + delta;
      if (totalMins < 0) totalMins += 24 * 60;
      totalMins = totalMins % (24 * 60);
      const newH = String(Math.floor(totalMins / 60)).padStart(2, "0");
      const newM = String(totalMins % 60).padStart(2, "0");
      setChoiceTime(`${newH}:${newM}`);
    } catch {
      setChoiceTime(format(new Date(), "HH:mm"));
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-purple-100"
      >
        {/* Header */}
        <div className="p-5 border-b border-purple-100/60 bg-gradient-to-r from-purple-900 via-indigo-900 to-stone-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-purple-300 border border-white/10 shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-white flex items-center gap-1.5">
                초이스 설정
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-200 border border-purple-400/30 font-extrabold">
                  {staffNames.length}명
                </span>
              </h3>
              <p className="text-[11px] text-purple-200/80 font-medium">
                초이스 볼 가게와 시간을 지정해주세요.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Plus className="w-5 h-5 rotate-45" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Selected Staff Pill List */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-purple-600" />
              <span>선택된 직원 ({staffNames.length}명)</span>
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-stone-50 rounded-2xl border border-stone-200/70">
              {staffNames.map((name) => {
                const { main4, affiliation } = formatStaffNameComponents(name);
                return (
                  <div
                    key={name}
                    className="flex items-center gap-1 bg-white border border-purple-200/80 text-stone-800 px-2 py-1 rounded-xl text-xs font-black shadow-2xs"
                  >
                    <span>{main4}</span>
                    {affiliation && (
                      <span
                        className={cn(
                          "px-1 py-0.25 rounded text-[9px] font-black text-white leading-none",
                          affiliation === "직속" ? "bg-amber-500" : "bg-purple-600",
                        )}
                      >
                        {affiliation}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Establishment Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1">
              <Store className="w-3.5 h-3.5 text-purple-600" />
              <span>초이스 가게명</span>
              <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={establishmentName}
                onChange={(e) => setEstablishmentName(e.target.value)}
                placeholder="가게 이름을 입력하거나 아래에서 선택하세요..."
                className="w-full bg-stone-50 border border-stone-200 rounded-2xl pl-3.5 pr-8 py-3 text-sm font-black text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600/30 focus:border-purple-600 transition-all placeholder:text-stone-400"
              />
              {establishmentName && (
                <button
                  type="button"
                  onClick={() => setEstablishmentName("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-600 rounded-full"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Suggestions */}
            {filteredEstablishments.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1 max-h-24 overflow-y-auto">
                {filteredEstablishments.map((est) => (
                  <button
                    key={est}
                    type="button"
                    onClick={() => setEstablishmentName(est)}
                    className={cn(
                      "px-2 py-1 rounded-lg text-[11px] font-extrabold border transition-all cursor-pointer",
                      establishmentName === est
                        ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                        : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200",
                    )}
                  >
                    {est}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Choice Time Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black text-stone-500 uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-purple-600" />
                <span>초이스 시간</span>
                <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setChoiceTime(format(new Date(), "HH:mm"))}
                className="text-[10px] font-black text-purple-600 hover:text-purple-800 px-1.5 py-0.5 rounded bg-purple-50 hover:bg-purple-100 transition-all cursor-pointer"
              >
                현시간 적용
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={choiceTime}
                onChange={(e) => setChoiceTime(e.target.value)}
                className="flex-1 bg-stone-50 border border-stone-200 rounded-2xl px-3.5 py-3 text-sm font-black text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600/30 focus:border-purple-600 transition-all font-mono"
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => adjustMinutes(-10)}
                  className="px-2 py-2.5 bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 text-[11px] font-black rounded-xl transition-all cursor-pointer"
                  title="10분 전"
                >
                  -10분
                </button>
                <button
                  type="button"
                  onClick={() => adjustMinutes(-5)}
                  className="px-2 py-2.5 bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 text-[11px] font-black rounded-xl transition-all cursor-pointer"
                  title="5분 전"
                >
                  -5분
                </button>
                <button
                  type="button"
                  onClick={() => adjustMinutes(5)}
                  className="px-2 py-2.5 bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 text-[11px] font-black rounded-xl transition-all cursor-pointer"
                  title="5분 후"
                >
                  +5분
                </button>
                <button
                  type="button"
                  onClick={() => adjustMinutes(10)}
                  className="px-2 py-2.5 bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 text-[11px] font-black rounded-xl transition-all cursor-pointer"
                  title="10분 후"
                >
                  +10분
                </button>
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-600 text-center animate-shake">
              {error}
            </div>
          )}

          {/* Submit Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-black text-xs rounded-2xl transition-all active:scale-95 cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-[2] py-3 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white font-black text-xs rounded-2xl shadow-lg shadow-purple-200 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? "설정 중..." : `초이스 시작 (${staffNames.length}명)`}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
