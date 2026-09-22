import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Search,
  X,
  CheckCircle2,
  LogOut,
  CircleDot,
  ChevronDown,
  Users,
  Activity,
} from "lucide-react";
import { Staff } from "../types";

interface FloatingStaffSearchBarProps {
  staff: Staff[];
  workingStaffIds: string[];
  offStaffIds: string[];
  onFocusStaff: (staffName: string) => void;
}

export function FloatingStaffSearchBar({
  staff,
  workingStaffIds,
  offStaffIds,
  onFocusStaff,
}: FloatingStaffSearchBarProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtered staff list
  const filteredStaff = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    
    // Sort staff: working first, then alphabetical
    const sorted = [...staff].sort((a, b) => {
      const aWorking = workingStaffIds.includes(a.id!) && !offStaffIds.includes(a.id!);
      const bWorking = workingStaffIds.includes(b.id!) && !offStaffIds.includes(b.id!);
      if (aWorking && !bWorking) return -1;
      if (!aWorking && bWorking) return 1;
      return a.name.localeCompare(b.name);
    });

    if (!term) return sorted;
    return sorted.filter((s) => s.name.toLowerCase().includes(term));
  }, [staff, searchTerm, workingStaffIds, offStaffIds]);

  const handleSelectStaff = (staffName: string) => {
    setSearchTerm(staffName);
    setIsOpen(false);
    onFocusStaff(staffName);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredStaff.length > 0) {
        handleSelectStaff(filteredStaff[0].name);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    setSearchTerm("");
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const focusSection = (sectionId: string) => {
    setIsOpen(false);
    const section = document.getElementById(sectionId);
    if (!section) return;

    const targetTop = Math.max(
      0,
      section.getBoundingClientRect().top + window.scrollY - 80,
    );
    document.documentElement.scrollTop = targetTop;
    document.body.scrollTop = targetTop;
    section.animate(
      [
        { boxShadow: "0 0 0 0 rgba(16, 185, 129, 0)" },
        { boxShadow: "0 0 0 4px rgba(16, 185, 129, 0.45)" },
        { boxShadow: "0 0 0 0 rgba(16, 185, 129, 0)" },
      ],
      { duration: 500, easing: "ease-out" },
    );
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <button
          onClick={() => {
            setIsMinimized(false);
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 100);
          }}
          className="bg-stone-900 text-white p-3 rounded-full shadow-2xl border border-stone-700 flex items-center justify-center hover:bg-stone-800 transition-all active:scale-95 group"
          title="직원 검색창 열기"
        >
          <Search className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%_-_1rem)] max-w-2xl transition-all duration-300"
    >
      {/* Search Bar Floating Card */}
      <div className="bg-stone-900/95 text-white backdrop-blur-xl border border-stone-700/80 shadow-[0_12px_35px_rgba(0,0,0,0.4)] rounded-2xl p-2 flex items-center gap-1.5 sm:gap-2 relative">
        <div className="pl-2 shrink-0 flex items-center text-emerald-400">
          <Search className="w-4 h-4" />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="직원 이름 검색..."
          className="min-w-0 flex-1 bg-transparent text-xs sm:text-sm font-bold text-white placeholder:text-stone-400 placeholder:font-medium focus:outline-none py-1"
        />

        {searchTerm && (
          <button
            onClick={handleClear}
            className="p-1 hover:bg-stone-800 rounded-lg text-stone-400 hover:text-white transition-colors shrink-0"
            title="검색어 지우기"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="h-4 w-[1px] bg-stone-700 shrink-0" />

        <button
          type="button"
          onClick={() => focusSection("attendance-status-section")}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-blue-500/40 bg-blue-500/15 px-2 py-1.5 text-[10px] sm:text-xs font-black text-blue-300 hover:bg-blue-500/25 transition-colors active:scale-95 whitespace-nowrap"
          title="인원 현황으로 이동"
        >
          <Users className="w-3.5 h-3.5" />
          인원현황
        </button>

        <button
          type="button"
          onClick={() => focusSection("progress-status-section")}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2 py-1.5 text-[10px] sm:text-xs font-black text-emerald-300 hover:bg-emerald-500/25 transition-colors active:scale-95 whitespace-nowrap"
          title="진행 현황으로 이동"
        >
          <Activity className="w-3.5 h-3.5" />
          진행현황
        </button>

        <div className="h-4 w-[1px] bg-stone-700 shrink-0" />

        <button
          onClick={() => setIsMinimized(true)}
          className="p-1 hover:bg-stone-800 rounded-lg text-stone-400 hover:text-white transition-colors shrink-0"
          title="검색창 최소화"
        >
          <ChevronDown className="w-4 h-4" />
        </button>

        {/* Suggestions Popover floating above */}
        {isOpen && (
          <div className="absolute bottom-full mb-2.5 left-0 right-0 bg-stone-900/95 text-white backdrop-blur-xl border border-stone-700/90 shadow-2xl rounded-2xl p-2 max-h-72 overflow-y-auto space-y-1 z-50 scrollbar-thin animate-in slide-in-from-bottom-2 duration-150">
            <div className="px-2 py-1 text-[10px] font-black text-stone-400 flex items-center justify-between border-b border-stone-800 mb-1">
              <span>인원현황 검색 결과 ({filteredStaff.length}명)</span>
              <span className="text-[9px] text-stone-500">클릭 시 인원현황표로 이동</span>
            </div>

            {filteredStaff.length === 0 ? (
              <div className="py-6 text-center text-xs text-stone-400 font-medium">
                검색된 직원이 없습니다.
              </div>
            ) : (
              filteredStaff.map((s) => {
                const isWorking = workingStaffIds.includes(s.id!) && !offStaffIds.includes(s.id!);
                const isOff = offStaffIds.includes(s.id!);
                const typeLabel =
                  s.type === "COFFEE" ? "커피" : s.type === "PUBLIC" ? "퍼블릭" : "하퍼";
                const typeBg =
                  s.type === "COFFEE"
                    ? "bg-emerald-950/80 text-emerald-300 border-emerald-800/60"
                    : s.type === "PUBLIC"
                    ? "bg-blue-950/80 text-blue-300 border-blue-800/60"
                    : "bg-purple-950/80 text-purple-300 border-purple-800/60";

                const isDirect = s.employmentType === "DIRECT";

                return (
                  <button
                    key={s.id || s.name}
                    type="button"
                    onClick={() => handleSelectStaff(s.name)}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-stone-800/90 transition-colors flex items-center justify-between gap-2 group active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-stone-800 border border-stone-700 flex items-center justify-center shrink-0 font-black text-xs text-stone-300 group-hover:border-emerald-500 group-hover:text-emerald-400 transition-colors">
                        {s.name.slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-stone-100 group-hover:text-emerald-300 transition-colors truncate">
                            {s.name}
                          </span>
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.2 rounded border ${typeBg}`}
                          >
                            {typeLabel}
                          </span>
                          <span className="text-[9px] font-bold text-stone-400">
                            ({isDirect ? "직속" : "위탁"})
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status badge */}
                    <div className="shrink-0">
                      {isWorking ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          출근중
                        </span>
                      ) : isOff ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-stone-800 text-stone-400 border border-stone-700 px-2 py-0.5 rounded-full">
                          <LogOut className="w-3 h-3" />
                          퇴근
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
                          <CircleDot className="w-3 h-3" />
                          미출근
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
