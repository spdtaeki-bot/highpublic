import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "motion/react";
import {
  Play,
  XCircle,
  Clock,
  Store,
  Users,
  X,
  AlertCircle,
  Check,
} from "lucide-react";
import { format, addMinutes } from "date-fns";
import { formatStaffNameComponents, cn } from "../lib/utils";
import { DispatchRecord, BouncedRecord, ActiveChoice } from "../types";

export interface ChoiceActionModalProps {
  isOpen: boolean;
  mode: "PROGRESS" | "BOUNCE";
  onClose: () => void;
  staffNames: string[];
  initialEstablishmentName: string;
  initialTime?: string;
  choiceEntryTime?: string;
  activeChoices?: Record<string, ActiveChoice>;
  establishments?: (string | { name: string; id?: string })[];
  records?: DispatchRecord[];
  bouncedRecords?: BouncedRecord[];
  currentTime?: Date;
  onConfirm: (establishmentName: string, time: string) => Promise<void> | void;
}

function getMinuteDiff(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0;
  const s = startStr.includes(":")
    ? startStr.split(":")
    : [startStr.slice(0, 2), startStr.slice(2)];
  const e = endStr.includes(":")
    ? endStr.split(":")
    : [endStr.slice(0, 2), endStr.slice(2)];
  const sh = parseInt(s[0], 10) || 0;
  const sm = parseInt(s[1], 10) || 0;
  const eh = parseInt(e[0], 10) || 0;
  const em = parseInt(e[1], 10) || 0;

  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff < -720) {
    diff += 1440;
  } else if (diff > 720) {
    diff -= 1440;
  }
  return diff;
}

export function ChoiceActionModal({
  isOpen,
  mode,
  onClose,
  staffNames,
  initialEstablishmentName,
  initialTime,
  choiceEntryTime,
  activeChoices,
  establishments = [],
  records = [],
  bouncedRecords = [],
  currentTime,
  onConfirm,
}: ChoiceActionModalProps) {
  const [establishmentName, setEstablishmentName] = useState(
    initialEstablishmentName || "",
  );
  const [time, setTime] = useState(
    initialTime || format(currentTime || new Date(), "HH:mm"),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);

  // Collect all known establishment names across establishments master, dispatch records, and bounced records
  const allKnownEstablishmentNames = useMemo(() => {
    const set = new Set<string>();
    (establishments || []).forEach((e) => {
      const name = typeof e === "string" ? e : e?.name;
      if (name?.trim()) set.add(name.trim());
    });
    (records || []).forEach((r) => {
      if (r.establishmentName?.trim()) set.add(r.establishmentName.trim());
    });
    (bouncedRecords || []).forEach((b) => {
      if (b.establishmentName?.trim()) set.add(b.establishmentName.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [establishments, records, bouncedRecords]);

  // Filter suggestions
  const filteredEstablishments = useMemo(() => {
    const term = establishmentName.trim().toLowerCase();
    if (!term) return allKnownEstablishmentNames.slice(0, 12);
    return allKnownEstablishmentNames
      .filter((name) => name.toLowerCase().includes(term))
      .slice(0, 15);
  }, [allKnownEstablishmentNames, establishmentName]);

  const resolvedChoiceEntryTime = useMemo(() => {
    if (choiceEntryTime?.trim()) return choiceEntryTime.trim();
    if (activeChoices && staffNames && staffNames.length > 0) {
      const times = staffNames
        .map((name) => activeChoices[name]?.choiceTime?.trim())
        .filter(Boolean);
      const uniqueTimes = Array.from(new Set(times));
      return uniqueTimes.join(", ");
    }
    return "";
  }, [choiceEntryTime, activeChoices, staffNames]);

  const nowTimeStr = format(currentTime || new Date(), "HH:mm");
  const primaryChoiceTime = resolvedChoiceEntryTime.split(",")[0]?.trim() || "";

  const currentDiffMins = useMemo(
    () => (primaryChoiceTime ? getMinuteDiff(primaryChoiceTime, nowTimeStr) : 0),
    [primaryChoiceTime, nowTimeStr],
  );

  const inputDiffMins = useMemo(
    () => (primaryChoiceTime ? getMinuteDiff(primaryChoiceTime, time) : 0),
    [primaryChoiceTime, time],
  );

  useEffect(() => {
    if (isOpen) {
      setEstablishmentName(initialEstablishmentName || "");
      setTime(initialTime || format(currentTime || new Date(), "HH:mm"));
      setError(null);
      setIsSubmitting(false);
      setIsDropdownOpen(false);
    }
  }, [isOpen, initialEstablishmentName, initialTime, currentTime]);

  if (!isOpen) return null;

  const isProgress = mode === "PROGRESS";

  const handleTimeChange = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 4);
    let formatted = digits;
    if (digits.length >= 3) {
      formatted = digits.slice(0, 2) + ":" + digits.slice(2);
    }
    setTime(formatted);
  };

  const handleSelectEstablishment = (name: string) => {
    setEstablishmentName(name);
    setIsDropdownOpen(false);
    if (error) setError(null);
    inputRef.current?.blur();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setTimeout(() => {
      inputRef.current?.blur();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }, 50);
  };

  const adjustMinutes = (deltaMinutes: number) => {
    try {
      const [hStr, mStr] = time.includes(":")
        ? time.split(":")
        : [time.slice(0, 2), time.slice(2)];
      const h = parseInt(hStr, 10) || 0;
      const m = parseInt(mStr, 10) || 0;
      const d = new Date();
      d.setHours(h, m, 0, 0);
      const newDate = addMinutes(d, deltaMinutes);
      setTime(format(newDate, "HH:mm"));
    } catch {
      setTime(format(new Date(), "HH:mm"));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEst = establishmentName.trim();
    if (!trimmedEst) {
      setError("가게명을 입력해주세요.");
      inputRef.current?.focus();
      return;
    }

    const trimmedTime = time.trim();
    if (!trimmedTime || !/^\d{1,2}:\d{2}$/.test(trimmedTime)) {
      setError("올바른 시간 형식(HH:mm)으로 입력해주세요. (예: 21:00)");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm(trimmedEst, trimmedTime);
      onClose();
    } catch (err: any) {
      console.error(`${isProgress ? "진행" : "튕김"} 처리 오류:`, err);
      setError(
        err?.message || `${isProgress ? "진행" : "튕김"} 처리 중 오류가 발생했습니다.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden border",
          isProgress ? "border-emerald-100" : "border-rose-100",
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "p-4 border-b text-white flex items-center justify-between",
            isProgress
              ? "bg-gradient-to-r from-emerald-900 via-teal-900 to-stone-900 border-emerald-800/60"
              : "bg-gradient-to-r from-rose-900 via-pink-900 to-stone-900 border-rose-800/60",
          )}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "w-9 h-9 rounded-2xl flex items-center justify-center border shadow-inner backdrop-blur-xs",
                isProgress
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/30"
                  : "bg-rose-500/20 text-rose-300 border-rose-400/30",
              )}
            >
              {isProgress ? (
                <Play className="w-5 h-5 fill-emerald-300 ml-0.5" />
              ) : (
                <XCircle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-1.5">
                {isProgress ? "초이스 진행 처리" : "초이스 튕김 처리"}
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full border font-extrabold",
                    isProgress
                      ? "bg-emerald-500/30 text-emerald-200 border-emerald-400/30"
                      : "bg-rose-500/30 text-rose-200 border-rose-400/30",
                  )}
                >
                  {staffNames.length}명
                </span>
              </h3>
              <p className="text-[10.5px] text-stone-200/80 font-medium">
                {isProgress
                  ? "초이스를 완료하고 출근/진행으로 기록합니다."
                  : "초이스 튕김 기록 후 대기 상태로 복귀합니다."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl flex items-center gap-1.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Selected Staff Pill List */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black text-stone-600 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-stone-400" />
              <span>대상 직원 ({staffNames.length}명)</span>
            </label>
            <div className="p-2.5 bg-stone-50 rounded-2xl border border-stone-200 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {staffNames.map((name) => {
                const comp = formatStaffNameComponents(name);
                return (
                  <span
                    key={name}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-xl text-xs font-black shadow-2xs border",
                      isProgress
                        ? "bg-emerald-50 text-emerald-900 border-emerald-200/80"
                        : "bg-rose-50 text-rose-900 border-rose-200/80",
                    )}
                  >
                    <span>{comp.namePart || name}</span>
                    {comp.affiliation && comp.affiliation !== "직속" && (
                      <span className="text-[9.5px] px-1 py-0.2 rounded bg-stone-200/80 text-stone-700 font-bold">
                        {comp.affiliation}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Establishment Name Input with Autocomplete */}
          <div className="space-y-1.5 relative">
            <label className="text-[11px] font-black text-stone-700 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Store className="w-3.5 h-3.5 text-stone-500" />
                <span>
                  초이스 가게명 <span className="text-rose-500">*</span>
                </span>
              </span>
              <span className="text-[10px] text-stone-400 font-normal">
                변경 가능
              </span>
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={establishmentName}
                onChange={(e) => {
                  setEstablishmentName(e.target.value);
                  setIsDropdownOpen(true);
                  if (error) setError(null);
                }}
                onFocus={(e) => {
                  setIsDropdownOpen(true);
                  e.target.select();
                }}
                onClick={(e) => {
                  (e.target as HTMLInputElement).select();
                }}
                onBlur={() => {
                  setTimeout(() => setIsDropdownOpen(false), 200);
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    isDropdownOpen &&
                    filteredEstablishments.length > 0
                  ) {
                    e.preventDefault();
                    handleSelectEstablishment(filteredEstablishments[0]);
                  } else if (e.key === "Escape") {
                    setIsDropdownOpen(false);
                  }
                }}
                placeholder="가게명을 입력하세요"
                autoComplete="off"
                className={cn(
                  "w-full px-3.5 py-2.5 bg-white border rounded-2xl text-xs font-bold transition-all pr-8 shadow-2xs",
                  isProgress
                    ? "border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    : "border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-rose-500 focus:border-rose-500",
                )}
              />
              {establishmentName && (
                <button
                  type="button"
                  onClick={() => {
                    setEstablishmentName("");
                    setIsDropdownOpen(true);
                    inputRef.current?.focus();
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dropdown Suggestions */}
            {isDropdownOpen && filteredEstablishments.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-stone-200 rounded-2xl shadow-xl z-50 max-h-36 overflow-y-auto p-1.5 divide-y divide-stone-100">
                {filteredEstablishments.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectEstablishment(name);
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      handleSelectEstablishment(name);
                    }}
                    className={cn(
                      "w-full px-2.5 py-1.5 text-left text-xs font-bold rounded-xl flex items-center justify-between transition-colors cursor-pointer",
                      name === establishmentName
                        ? isProgress
                          ? "bg-emerald-50 text-emerald-900"
                          : "bg-rose-50 text-rose-900"
                        : "text-stone-700 hover:bg-stone-100",
                    )}
                  >
                    <span>{name}</span>
                    {name === establishmentName && (
                      <Check
                        className={cn(
                          "w-3.5 h-3.5",
                          isProgress ? "text-emerald-600" : "text-rose-600",
                        )}
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Choice Entry Time & Gap Info */}
          {resolvedChoiceEntryTime && (
            <div className="p-2.5 bg-purple-50/70 border border-purple-200/80 rounded-2xl space-y-1 shadow-2xs">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded-md bg-purple-200/80 text-purple-900 text-[10px] font-black">
                    초이스 들어간 시간
                  </span>
                  <span className="font-mono font-black text-purple-950 text-sm">
                    {resolvedChoiceEntryTime}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-stone-500">현재와 갭:</span>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-black font-mono shadow-2xs",
                      currentDiffMins < 0
                        ? "bg-stone-200 text-stone-700"
                        : currentDiffMins >= 40
                          ? "bg-rose-100 text-rose-700 border border-rose-200"
                          : currentDiffMins >= 20
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-emerald-100 text-emerald-800 border border-emerald-200",
                    )}
                  >
                    {currentDiffMins >= 0
                      ? `+${currentDiffMins}분`
                      : `${currentDiffMins}분`}{" "}
                    경과
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-purple-200/50 text-[11px]">
                <span className="text-stone-500 font-bold">입력 시간 기준 소요:</span>
                <span className="font-mono font-black text-purple-900">
                  {inputDiffMins >= 0 ? `+${inputDiffMins}분` : `${inputDiffMins}분`}
                </span>
              </div>
            </div>
          )}

          {/* Time Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black text-stone-700 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-stone-500" />
                <span>
                  {isProgress ? "진행 시간" : "튕김 시간"}{" "}
                  <span className="text-rose-500">*</span>
                </span>
              </label>
              <button
                type="button"
                onClick={() =>
                  setTime(format(currentTime || new Date(), "HH:mm"))
                }
                className={cn(
                  "text-[10px] font-black px-2 py-0.5 rounded transition-all cursor-pointer",
                  isProgress
                    ? "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                    : "text-rose-700 bg-rose-50 hover:bg-rose-100",
                )}
              >
                현재시간 적용
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                ref={timeInputRef}
                type="text"
                inputMode="numeric"
                value={time}
                onChange={(e) => handleTimeChange(e.target.value)}
                onFocus={(e) => {
                  const target = e.target;
                  target.select();
                  setTimeout(() => {
                    try {
                      target.select();
                      target.setSelectionRange(0, 9999);
                    } catch {}
                  }, 20);
                }}
                onMouseUp={(e) => {
                  // Keep entire text selected on click without being cleared by mouseup
                  if (document.activeElement === e.currentTarget) {
                    e.currentTarget.select();
                  }
                }}
                onClick={(e) => {
                  try {
                    const target = e.target as HTMLInputElement;
                    target.select();
                    target.setSelectionRange(0, 9999);
                  } catch {}
                }}
                placeholder="HH:mm"
                maxLength={5}
                className={cn(
                  "w-24 sm:w-28 px-2.5 py-2 bg-white border rounded-2xl text-center text-sm font-black font-mono tracking-wider transition-all shadow-2xs",
                  isProgress
                    ? "border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    : "border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-rose-500 focus:border-rose-500",
                )}
              />
              <div className="flex items-center gap-1 flex-1">
                <button
                  type="button"
                  onClick={() => adjustMinutes(-5)}
                  className="flex-1 py-2 px-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-[11px] font-black transition-all active:scale-95 cursor-pointer"
                  title="5분 전"
                >
                  -5분
                </button>
                <button
                  type="button"
                  onClick={() => adjustMinutes(5)}
                  className="flex-1 py-2 px-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-[11px] font-black transition-all active:scale-95 cursor-pointer"
                  title="5분 후"
                >
                  +5분
                </button>
                <button
                  type="button"
                  onClick={() => adjustMinutes(-1)}
                  className="flex-1 py-2 px-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-[11px] font-black transition-all active:scale-95 cursor-pointer"
                  title="1분 전"
                >
                  -1분
                </button>
                <button
                  type="button"
                  onClick={() => adjustMinutes(1)}
                  className="flex-1 py-2 px-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-[11px] font-black transition-all active:scale-95 cursor-pointer"
                  title="1분 후"
                >
                  +1분
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-2xl text-xs font-black transition-all active:scale-95 cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                "flex-2 py-2.5 rounded-2xl text-xs font-black text-white shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50",
                isProgress
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30"
                  : "bg-rose-600 hover:bg-rose-700 shadow-rose-600/30",
              )}
            >
              {isProgress ? (
                <Play className="w-3.5 h-3.5 fill-white" />
              ) : (
                <XCircle className="w-3.5 h-3.5" />
              )}
              <span>
                {isSubmitting
                  ? "처리 중..."
                  : isProgress
                    ? "진행 완료"
                    : "튕김 완료"}
              </span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
