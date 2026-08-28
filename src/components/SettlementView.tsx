import React, { useMemo, useState } from "react";
import {
  Wallet,
  Camera,
  Users,
  Building,
  CheckCircle2,
  Calendar,
  CreditCard,
  Banknote,
  RotateCcw,
  Check,
  AlertCircle,
  X,
} from "lucide-react";
import * as htmlToImage from "html-to-image";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { DispatchRecord, Staff, BouncedRecord } from "../types";
import { updateDispatch } from "../services/dispatchService";
import { Timestamp } from "firebase/firestore";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Auto classify staff based on name length & suffix:
// 4-character format: "하퍼 요셉" -> 직속직원
// 6-character format: "하퍼 요셉 시크" -> 위탁직원 (소속: 시크)
// Any text after the first 4 characters represents the affiliation name.
export function parseStaffNameAndAffiliation(fullName: string) {
  if (!fullName) {
    return {
      isDirect: true,
      affiliation: "직속",
      displayName: "",
      rawName: "",
      category: "커피",
      employmentType: "DIRECT" as const,
      office: "직속",
    };
  }

  const trimmed = fullName.trim();
  const cleanNoSpace = trimmed.replace(/\s+/g, "");

  // 1. If 4 characters or fewer (e.g. "하퍼 요셉" -> clean: "하퍼요셉" 4자) -> 직속직원
  if (cleanNoSpace.length <= 4) {
    let category = "커피";
    if (trimmed.startsWith("하퍼") || trimmed.startsWith("하")) category = "하퍼";
    else if (trimmed.startsWith("퍼블릭") || trimmed.startsWith("퍼")) category = "퍼블릭";

    return {
      isDirect: true,
      affiliation: "직속",
      displayName: trimmed,
      rawName: trimmed,
      category,
      employmentType: "DIRECT" as const,
      office: "직속",
    };
  }

  // 2. If more than 4 characters (e.g. "하퍼 요셉 시크" -> clean: "하퍼요셉시크" 6자) -> 위탁직원
  const parts = trimmed.split(/\s+/).filter(Boolean);
  let affiliation = "";

  if (parts.length >= 3) {
    affiliation = parts.slice(2).join(" ").trim();
  } else if (parts.length === 2) {
    if (parts[1].length > 2) {
      affiliation = parts[1].slice(2).trim();
    } else {
      affiliation = cleanNoSpace.slice(4).trim();
    }
  } else {
    affiliation = cleanNoSpace.slice(4).trim();
  }

  affiliation = affiliation.replace(/^[\(\[\{]+|[\)\]\}]+$/g, "").trim();
  if (!affiliation) {
    affiliation = "위탁";
  }

  let category = "커피";
  if (trimmed.startsWith("하퍼") || trimmed.startsWith("하")) category = "하퍼";
  else if (trimmed.startsWith("퍼블릭") || trimmed.startsWith("퍼")) category = "퍼블릭";

  return {
    isDirect: false,
    affiliation,
    displayName: trimmed,
    rawName: trimmed,
    category,
    employmentType: "DELEGATED" as const,
    office: affiliation,
  };
}

interface SettlementViewProps {
  records: DispatchRecord[];
  unpaidStaffRecords: DispatchRecord[];
  staff: Staff[];
  checkInTimes: Record<string, any>;
  offStaffIds: string[];
  offTimes: Record<string, any>;
  manualDailyProfits: Record<string, number>;
  onManualProfitClick: (staffName: string, calculatedProfit: number) => void;
  onStaffPaymentClick: (staffName: string) => void;
  selectedDate?: string;
  bouncedRecords?: BouncedRecord[];
}

export function SettlementView({
  records,
  unpaidStaffRecords,
  staff,
  checkInTimes,
  offStaffIds,
  offTimes,
  manualDailyProfits,
  onManualProfitClick,
  onStaffPaymentClick,
  selectedDate,
  bouncedRecords,
}: SettlementViewProps) {
  // Modal state for Batch Affiliation Payment
  const [batchModalAffiliation, setBatchModalAffiliation] = useState<string | null>(null);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // Format date nicely for display & screenshot
  const formattedDate = useMemo(() => {
    if (!selectedDate) return format(new Date(), "yyyy년 MM월 dd일 (EEE)", { locale: ko });
    try {
      const parsed = parseISO(selectedDate);
      return format(parsed, "yyyy년 MM월 dd일 (EEE)", { locale: ko });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Aggregate staff groups
  const staffGroups = useMemo(() => {
    const groups: Record<
      string,
      {
        records: DispatchRecord[];
        unpaidRecords: DispatchRecord[];
        totalPaid: number;
        totalUnpaid: number;
        totalStaffPayment: number;
        totalTip: number;
        totalCommission: number;
        fullTimeUnits: number;
        bantiUnits: number;
        isAllStaffPaid: boolean;
        isManualProfit?: boolean;
        totalBounceCount: number;
      }
    > = {};

    // Initialize all checked-in staff or staff with records
    staff.forEach((s) => {
      if (checkInTimes[s.id]) {
        groups[s.name] = {
          records: [],
          unpaidRecords: [],
          totalPaid: 0,
          totalUnpaid: 0,
          totalStaffPayment: 0,
          totalTip: 0,
          totalCommission: 0,
          fullTimeUnits: 0,
          bantiUnits: 0,
          isAllStaffPaid: true,
          totalBounceCount: 0,
        };
      }
    });

    // Populate with records
    records.forEach((record) => {
      const name = record.staffName;
      if (!name) return;
      if (!groups[name]) {
        groups[name] = {
          records: [],
          unpaidRecords: [],
          totalPaid: 0,
          totalUnpaid: 0,
          totalStaffPayment: 0,
          totalTip: 0,
          totalCommission: 0,
          fullTimeUnits: 0,
          bantiUnits: 0,
          isAllStaffPaid: true,
          totalBounceCount: 0,
        };
      }

      groups[name].records.push(record);
      if (record.paymentMethod === "UNPAID") {
        groups[name].totalUnpaid += record.totalAmount;
      } else {
        groups[name].totalPaid += record.totalAmount;
      }

      groups[name].totalStaffPayment += record.staffPayment;
      groups[name].totalTip += record.tip || 0;
      groups[name].totalCommission += record.commission;

      if (record.isBanti) {
        groups[name].bantiUnits += 1;
      } else {
        groups[name].fullTimeUnits += Math.floor(record.durationHours);
      }

      if (!record.isStaffPaid) {
        groups[name].isAllStaffPaid = false;
      }
    });

    // Populate unpaid from other days if any
    (unpaidStaffRecords || []).forEach((record) => {
      const name = record.staffName;
      if (!name) return;
      if (!groups[name]) {
        groups[name] = {
          records: [],
          unpaidRecords: [],
          totalPaid: 0,
          totalUnpaid: 0,
          totalStaffPayment: 0,
          totalTip: 0,
          totalCommission: 0,
          fullTimeUnits: 0,
          bantiUnits: 0,
          isAllStaffPaid: true,
          totalBounceCount: 0,
        };
      }
      groups[name].unpaidRecords.push(record);
    });

    // Manual profit override & bounce count
    Object.keys(groups).forEach((name) => {
      if (manualDailyProfits[name] !== undefined) {
        groups[name].totalCommission = manualDailyProfits[name];
        groups[name].isManualProfit = true;
      }
      groups[name].totalBounceCount = (bouncedRecords || []).filter(
        (b) => b.staffName === name,
      ).length;
    });

    return groups;
  }, [
    records,
    unpaidStaffRecords,
    staff,
    checkInTimes,
    manualDailyProfits,
    bouncedRecords,
  ]);

  // Group staff by Affiliation (소속별) & calculate expected deposit (최종입금금액)
  const affiliationGroups = useMemo(() => {
    const staffNames = Object.keys(staffGroups);
    const map: Record<
      string,
      {
        affiliationName: string;
        isDirect: boolean;
        totalExpectedDeposit: number;
        totalCollection: number;
        totalStaffPayment: number;
        totalTip: number;
        totalCommission: number;
        totalDispatches: number;
        allRecords: DispatchRecord[];
        isAllAffiliationPaid: boolean;
        unpaidStaffCount: number;
        paidStaffCount: number;
        staffList: {
          rawName: string;
          displayName: string;
          affiliation: string;
          isDirect: boolean;
          staffItem?: Staff;
          type: "COFFEE" | "PUBLIC" | "HOPPER";
          isOff: boolean;
          group: (typeof staffGroups)[string];
          totalCollection: number;
          totalStaffPayment: number;
          totalTip: number;
          totalCommission: number;
          expectedDeposit: number;
          recordCount: number;
          fullTimeUnits: number;
          bantiUnits: number;
          isAllStaffPaid: boolean;
          totalUnpaid: number;
        }[];
      }
    > = {};

    staffNames.forEach((name) => {
      const parsed = parseStaffNameAndAffiliation(name);
      const groupAffiliationKey = parsed.affiliation;

      const group = staffGroups[name];
      const totalCollection = group.totalPaid + group.totalUnpaid;
      const totalStaffPayment = group.totalStaffPayment;
      const totalTip = group.totalTip || 0;
      const totalCommission = group.totalCommission;

      const staffItem = staff.find((s) => s.name === name);
      const staffId = staffItem?.id;
      const isOff = staffId ? offStaffIds.includes(staffId) : false;
      const effType: "COFFEE" | "PUBLIC" | "HOPPER" =
        staffItem?.type === "HOPPER" ||
        parsed.category === "하퍼" ||
        name.includes("하퍼") ||
        name.startsWith("H") ||
        name.startsWith("하")
          ? "HOPPER"
          : staffItem?.type === "PUBLIC" ||
              parsed.category === "퍼블릭" ||
              name.includes("퍼블릭") ||
              name.startsWith("P") ||
              name.startsWith("퍼")
            ? "PUBLIC"
            : "COFFEE";

      // Expected Deposit formula (최종입금금액):
      // 직속 하퍼: 지급액 - 20,000원
      // 직속 커피: 지급액 그대로 (-2만원 차감 없음)
      // 위탁 (6자 형식, e.g. 하퍼 요셉 시크): 수금액 - 30,000원 + 팁
      let expectedDeposit = 0;
      if (parsed.isDirect) {
        if (totalStaffPayment > 0) {
          if (effType === "HOPPER") {
            expectedDeposit = totalStaffPayment - 20000;
          } else {
            expectedDeposit = totalStaffPayment;
          }
        }
      } else {
        if (totalCollection > 0) {
          expectedDeposit = totalCollection - 30000 + totalTip;
        }
      }

      if (!map[groupAffiliationKey]) {
        map[groupAffiliationKey] = {
          affiliationName: groupAffiliationKey,
          isDirect: parsed.isDirect,
          totalExpectedDeposit: 0,
          totalCollection: 0,
          totalStaffPayment: 0,
          totalTip: 0,
          totalCommission: 0,
          totalDispatches: 0,
          allRecords: [],
          isAllAffiliationPaid: true,
          unpaidStaffCount: 0,
          paidStaffCount: 0,
          staffList: [],
        };
      }

      const aff = map[groupAffiliationKey];
      aff.totalExpectedDeposit += expectedDeposit;
      aff.totalCollection += totalCollection;
      aff.totalStaffPayment += totalStaffPayment;
      aff.totalTip += totalTip;
      aff.totalCommission += totalCommission;
      aff.totalDispatches += group.records.length;
      aff.allRecords.push(...group.records);

      if (group.records.length > 0) {
        if (group.isAllStaffPaid) {
          aff.paidStaffCount += 1;
        } else {
          aff.isAllAffiliationPaid = false;
          aff.unpaidStaffCount += 1;
        }
      }

      aff.staffList.push({
        rawName: name,
        displayName: parsed.displayName,
        affiliation: groupAffiliationKey,
        isDirect: parsed.isDirect,
        staffItem,
        type: effType,
        isOff,
        group,
        totalCollection,
        totalStaffPayment,
        totalTip,
        totalCommission,
        expectedDeposit,
        recordCount: group.records.length,
        fullTimeUnits: group.fullTimeUnits,
        bantiUnits: group.bantiUnits,
        isAllStaffPaid: group.isAllStaffPaid,
        totalUnpaid: group.totalUnpaid,
      });
    });

    // Sort staff within each group: active first, then alphabetically
    Object.values(map).forEach((aff) => {
      aff.staffList.sort((a, b) => {
        if (a.isOff !== b.isOff) return a.isOff ? 1 : -1;
        return a.displayName.localeCompare(b.displayName, "ko");
      });
    });

    // Sort groups: "직속" first, then other agencies alphabetically
    return Object.values(map).sort((a, b) => {
      if (a.isDirect && !b.isDirect) return -1;
      if (!a.isDirect && b.isDirect) return 1;
      return a.affiliationName.localeCompare(b.affiliationName, "ko");
    });
  }, [staffGroups, staff, offStaffIds]);

  // Selected Affiliation for Batch Modal
  const activeBatchGroup = useMemo(() => {
    if (!batchModalAffiliation) return null;
    return affiliationGroups.find((a) => a.affiliationName === batchModalAffiliation) || null;
  }, [batchModalAffiliation, affiliationGroups]);

  // Batch Payment Handler for an entire Affiliation
  const handleBatchPayment = async (method: "TRANSFER" | "CASH" | "CANCEL") => {
    if (!activeBatchGroup) return;
    setIsBatchProcessing(true);
    try {
      const recordsToUpdate = activeBatchGroup.allRecords;
      if (recordsToUpdate.length === 0) {
        alert("해당 소속에 처리할 파견 내역이 없습니다.");
        return;
      }

      if (method === "CANCEL") {
        const promises = recordsToUpdate.map((r) =>
          updateDispatch(r.id!, {
            isStaffPaid: false,
            staffPaymentMethod: null,
            staffPaidAt: null,
          }),
        );
        await Promise.all(promises);
      } else {
        const paidAt = Timestamp.now();
        const promises = recordsToUpdate.map((r) =>
          updateDispatch(r.id!, {
            isStaffPaid: true,
            staffPaymentMethod: method,
            staffPaidAt: paidAt,
          }),
        );
        await Promise.all(promises);
      }
      setBatchModalAffiliation(null);
    } catch (err) {
      console.error("일괄 지급 처리 오류:", err);
      alert("일괄 처리 중 오류가 발생했습니다.");
    } finally {
      setIsBatchProcessing(false);
    }
  };

  // Overall totals across all affiliations
  const grandTotals = useMemo(() => {
    let totalDeposit = 0;
    let directDeposit = 0;
    let delegatedDeposit = 0;
    let totalStaffCount = 0;
    let directStaffCount = 0;
    let delegatedStaffCount = 0;
    let totalDispatches = 0;

    affiliationGroups.forEach((aff) => {
      totalDeposit += aff.totalExpectedDeposit;
      totalDispatches += aff.totalDispatches;
      totalStaffCount += aff.staffList.length;
      if (aff.isDirect) {
        directDeposit += aff.totalExpectedDeposit;
        directStaffCount += aff.staffList.length;
      } else {
        delegatedDeposit += aff.totalExpectedDeposit;
        delegatedStaffCount += aff.staffList.length;
      }
    });

    return {
      totalDeposit,
      directDeposit,
      delegatedDeposit,
      totalStaffCount,
      directStaffCount,
      delegatedStaffCount,
      totalDispatches,
    };
  }, [affiliationGroups]);

  // Delegated-only groups for quick agency view
  const delegatedGroups = useMemo(() => {
    return affiliationGroups.filter((aff) => !aff.isDirect);
  }, [affiliationGroups]);

  // Perfect Desktop-Identical Capture Engine:
  // Captures from the dedicated desktop render template so the output is ALWAYS identical to the desktop computer view
  const handleCapture = async (
    elementId: string,
    filenamePrefix: string,
  ) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    try {
      const dataUrl = await htmlToImage.toPng(element, {
        backgroundColor: "#ffffff",
        pixelRatio: 3,
        style: {
          transform: "none",
        },
        filter: (node) => {
          if (
            node instanceof HTMLElement &&
            node.dataset.html2canvasIgnore === "true"
          ) {
            return false;
          }
          return true;
        },
      });

      const filename = `${filenamePrefix}_${selectedDate || format(new Date(), "yyyyMMdd")}.png`;

      if (navigator.canShare && navigator.share) {
        try {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const file = new File([blob], filename, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: `${filenamePrefix} 정산내역 (${formattedDate})`,
              text: `[${formattedDate}] ${filenamePrefix} 정산내역`,
              files: [file],
            });
            return;
          }
        } catch (shareErr) {
          console.warn("Share failed, fallback to download", shareErr);
        }
      }

      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("Capture failed", e);
      alert("이미지 캡쳐에 실패했습니다.");
    }
  };

  return (
    <div className="space-y-6 pb-12 w-full">
      {/* Top Grand Total Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 w-full">
        {/* Main Grand Total */}
        <div className="bg-stone-900 text-white p-4 sm:p-5 rounded-2xl shadow-md border border-stone-800 flex flex-col justify-between relative overflow-hidden md:col-span-2">
          {/* Prominent Date Tag for Screenshot recognition */}
          <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-stone-800">
            <div className="flex items-center gap-1.5 text-xs font-black text-indigo-300">
              <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>{formattedDate} 정산내역</span>
            </div>
            <button
              onClick={() =>
                handleCapture("desktop-capture-full-view", "전체_소속별_정산현황")
              }
              className="bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1 text-xs font-bold cursor-pointer whitespace-nowrap"
              title="전체 정산표 PC형태 이미지 캡쳐"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>전체 캡쳐</span>
            </button>
          </div>

          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5 text-stone-400 text-xs font-bold mb-1 whitespace-nowrap">
                <Wallet className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>총 최종입금금액 합계 (전체 소속)</span>
              </div>
              <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                <span className="text-3xl sm:text-4xl font-black text-white tracking-tight whitespace-nowrap">
                  {(grandTotals.totalDeposit / 10000).toFixed(1)}
                  <span className="text-lg font-bold ml-1 text-indigo-300">
                    만원
                  </span>
                </span>
                <span className="text-xs font-medium text-stone-400 whitespace-nowrap">
                  ({grandTotals.totalDeposit.toLocaleString()}원)
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-stone-800/80 text-xs">
            <span className="bg-stone-800 text-stone-300 px-2 py-0.5 rounded-md font-bold whitespace-nowrap">
              총 {grandTotals.totalStaffCount}명 ({grandTotals.totalDispatches}건)
            </span>
            <span className="text-stone-400 text-[11px] whitespace-nowrap">
              • 직속(하퍼: 지급액-2만 / 커피: 지급액 그대로) / 위탁(6자+): 수금액 - 3만원 + 팁
            </span>
          </div>
        </div>

        {/* Direct Subtotal (4자 형식) */}
        <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-2xl flex flex-col justify-between shadow-2xs">
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center gap-1.5">
              <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded whitespace-nowrap">
                직속
              </span>
              <span className="text-xs font-bold text-amber-900 whitespace-nowrap">
                직속 최종입금금액
              </span>
            </div>
            <span className="text-xs font-bold text-amber-700 whitespace-nowrap">
              {grandTotals.directStaffCount}명
            </span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-amber-950 whitespace-nowrap">
              {(grandTotals.directDeposit / 10000).toFixed(1)}
              <span className="text-xs font-bold ml-1 text-amber-700">만원</span>
            </div>
            <div className="text-[11px] font-medium text-amber-700/80 mt-0.5 whitespace-nowrap">
              {grandTotals.directDeposit.toLocaleString()}원
            </div>
          </div>
          <div className="text-[10px] text-amber-600/90 font-medium mt-2 pt-2 border-t border-amber-200/60 whitespace-nowrap">
            하퍼: 지급액 - 20,000원 / 커피: 지급액 그대로
          </div>
        </div>

        {/* Delegated Total (6자 형식) */}
        <div className="bg-purple-50/80 border border-purple-200 p-4 rounded-2xl flex flex-col justify-between shadow-2xs">
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center gap-1.5">
              <span className="bg-purple-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded whitespace-nowrap">
                위탁 전체
              </span>
              <span className="text-xs font-bold text-purple-900 whitespace-nowrap">
                위탁 최종입금금액
              </span>
            </div>
            <span className="text-xs font-bold text-purple-700 whitespace-nowrap">
              {grandTotals.delegatedStaffCount}명
            </span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-purple-950 whitespace-nowrap">
              {(grandTotals.delegatedDeposit / 10000).toFixed(1)}
              <span className="text-xs font-bold ml-1 text-purple-700">만원</span>
            </div>
            <div className="text-[11px] font-medium text-purple-700/80 mt-0.5 whitespace-nowrap">
              {grandTotals.delegatedDeposit.toLocaleString()}원
            </div>
          </div>
          <div className="text-[10px] text-purple-600/90 font-medium mt-2 pt-2 border-t border-purple-200/60 whitespace-nowrap">
            6자 형식 (수금액 - 30,000원 + 팁)
          </div>
        </div>
      </div>

      {/* Delegated Agencies Quick Breakdown Bar */}
      {delegatedGroups.length > 0 && (
        <div className="bg-white border border-purple-100 rounded-2xl p-4 shadow-sm w-full">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-purple-600 shrink-0" />
              <h3 className="text-xs font-bold text-stone-800 whitespace-nowrap">
                위탁 소속별 최종 입금 합산 ({delegatedGroups.length}개 소속)
              </h3>
            </div>
            <span className="text-[10px] text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-md whitespace-nowrap">
              💡 소속 뱃지를 클릭하면 해당 소속 전원 일괄 지급처리가 가능합니다
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
            {delegatedGroups.map((aff) => (
              <div
                key={`quick-${aff.affiliationName}`}
                onClick={() => setBatchModalAffiliation(aff.affiliationName)}
                className="bg-purple-50/70 hover:bg-purple-100/80 border border-purple-200/80 rounded-xl p-2.5 flex flex-col justify-between transition-all cursor-pointer group shadow-2xs"
                title={`${aff.affiliationName} 일괄 지급처리`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-black text-xs text-purple-900 truncate group-hover:text-purple-700">
                    {aff.affiliationName}
                  </span>
                  <span className="text-[10px] font-bold text-purple-600 shrink-0 whitespace-nowrap">
                    {aff.staffList.length}명
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="text-sm font-black text-purple-950 whitespace-nowrap">
                    {(aff.totalExpectedDeposit / 10000).toFixed(1)}만원
                  </span>
                  {aff.isAllAffiliationPaid ? (
                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200 whitespace-nowrap">
                      지급완료
                    </span>
                  ) : (
                    <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-1 py-0.5 rounded border border-amber-200 whitespace-nowrap">
                      미지급
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Affiliation Sections (Cards per Affiliation) */}
      {affiliationGroups.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-2xl p-12 text-center w-full">
          <p className="text-stone-500 font-bold">정산 대상 데이터가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-5 w-full">
          {affiliationGroups.map((aff) => {
            return (
              <div
                key={aff.affiliationName}
                className="bg-white border border-stone-200 rounded-2xl p-4 sm:p-5 shadow-sm transition-all w-full"
              >
                {/* Date Header for Clarity */}
                <div className="flex items-center justify-between bg-stone-50 border border-stone-200/80 rounded-xl px-3 py-1.5 mb-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-black text-stone-800">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>{formattedDate} 정산내역</span>
                  </div>
                  <div className="text-[11px] font-bold text-stone-500">
                    소속: <strong className="text-stone-900">{aff.affiliationName}</strong> {aff.isDirect ? "(직속)" : "(위탁)"}
                  </div>
                </div>

                {/* Affiliation Header & Subtotal Highlight */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 mb-3 border-b border-stone-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Clickable Affiliation Badge (triggers batch payment) */}
                    <button
                      type="button"
                      onClick={() => setBatchModalAffiliation(aff.affiliationName)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-xs font-black text-white shadow-sm active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 group whitespace-nowrap",
                        aff.isDirect
                          ? "bg-amber-500 hover:bg-amber-600 shadow-amber-200"
                          : "bg-purple-600 hover:bg-purple-700 shadow-purple-200",
                      )}
                      title="클릭하여 소속 직원 전체 일괄 지급 처리"
                    >
                      <span>
                        {aff.affiliationName} {aff.isDirect ? "(직속)" : "(위탁)"}
                      </span>
                      <span className="bg-white/20 text-white text-[9px] px-1 py-0.5 rounded font-black">
                        일괄지급
                      </span>
                    </button>

                    {/* Overall Affiliation Payment Status Badge */}
                    {aff.isAllAffiliationPaid && aff.allRecords.length > 0 ? (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 whitespace-nowrap">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        전원 지급완료
                      </span>
                    ) : aff.unpaidStaffCount > 0 ? (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 whitespace-nowrap">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        미지급 {aff.unpaidStaffCount}명
                      </span>
                    ) : null}

                    <span className="text-xs font-bold text-stone-500 whitespace-nowrap">
                      인원 {aff.staffList.length}명 ({aff.totalDispatches}건)
                    </span>
                  </div>

                  {/* Affiliation Total Expected Deposit Badge */}
                  <div className="flex items-center justify-between sm:justify-end gap-2.5 flex-wrap">
                    <div
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl border shadow-2xs whitespace-nowrap",
                        aff.isDirect
                          ? "bg-amber-50 border-amber-200 text-amber-950"
                          : "bg-purple-50 border-purple-200 text-purple-950",
                      )}
                    >
                      <span
                        className={cn(
                          "text-xs font-bold whitespace-nowrap",
                          aff.isDirect ? "text-amber-800" : "text-purple-800",
                        )}
                      >
                        [{aff.affiliationName}] 최종입금금액:
                      </span>
                      <span
                        className={cn(
                          "text-base sm:text-xl font-black whitespace-nowrap",
                          aff.isDirect ? "text-amber-950" : "text-purple-950",
                        )}
                      >
                        {(aff.totalExpectedDeposit / 10000).toFixed(1)}만원
                      </span>
                      <span
                        className={cn(
                          "text-xs font-bold whitespace-nowrap",
                          aff.isDirect ? "text-amber-600" : "text-purple-600",
                        )}
                      >
                        ({aff.totalExpectedDeposit.toLocaleString()}원)
                      </span>
                    </div>

                    <button
                      onClick={() =>
                        handleCapture(
                          `desktop-capture-group-${aff.affiliationName}`,
                          `${aff.affiliationName}_소속_정산내역`,
                        )
                      }
                      className="bg-stone-100 hover:bg-stone-200 text-stone-600 p-2 rounded-xl transition-all cursor-pointer flex items-center gap-1 text-xs font-bold shrink-0 whitespace-nowrap"
                      title={`${aff.affiliationName} 소속 정산내역 PC형태 캡쳐`}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>캡쳐</span>
                    </button>
                  </div>
                </div>

                {/* 1. Universal Responsive High-Density Card List (For ALL Mobile & Tablet screens - ZERO Horizontal Scrolling) */}
                <div className="block lg:hidden space-y-2.5 w-full">
                  {aff.staffList.map((s) => (
                    <div
                      key={`mobile-${s.rawName}`}
                      onClick={() => onStaffPaymentClick(s.rawName)}
                      className={cn(
                        "p-3 rounded-xl border transition-all cursor-pointer active:scale-[0.99] space-y-2 w-full",
                        s.isOff
                          ? "bg-stone-50/40 border-stone-200 opacity-60"
                          : "bg-stone-50/80 hover:bg-stone-100/90 border-stone-200/80 shadow-2xs",
                      )}
                    >
                      {/* Top Row: Name, Type, Dispatches, Final Deposit */}
                      <div className="flex items-center justify-between gap-1.5 flex-wrap sm:flex-nowrap">
                        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                          <span className="font-black text-stone-900 text-sm truncate">
                            {s.displayName}
                          </span>
                          <span
                            className={cn(
                              "text-[9px] font-black px-1.5 py-0.5 rounded text-white shrink-0",
                              s.type === "HOPPER"
                                ? "bg-purple-500"
                                : s.type === "PUBLIC"
                                  ? "bg-blue-500"
                                  : "bg-emerald-500",
                            )}
                          >
                            {s.type === "HOPPER"
                              ? "하퍼"
                              : s.type === "PUBLIC"
                                ? "퍼블릭"
                                : "커피"}
                          </span>
                          <span className="text-[10px] font-bold bg-stone-200/80 text-stone-700 px-1.5 py-0.5 rounded shrink-0">
                            {s.recordCount}건 (정{s.fullTimeUnits}/반{s.bantiUnits})
                          </span>
                          {s.isOff && (
                            <span className="text-[9px] font-bold bg-stone-200 text-stone-500 px-1 py-0.5 rounded shrink-0">
                              퇴근
                            </span>
                          )}
                        </div>

                        {/* Final Expected Deposit Badge */}
                        <div className="text-right shrink-0">
                          <span
                            className={cn(
                              "inline-block font-black px-2 py-0.5 rounded-lg text-xs text-white shadow-2xs",
                              s.isDirect ? "bg-amber-500" : "bg-purple-600",
                            )}
                          >
                            {(s.expectedDeposit / 10000).toFixed(1)}만원
                          </span>
                        </div>
                      </div>

                      {/* Bottom Row: Breakdown & Payment Status */}
                      <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-stone-200/60 text-[11px] flex-wrap sm:flex-nowrap">
                        <div className="flex items-center gap-1.5 text-stone-600 font-bold flex-wrap">
                          <span>
                            수금{" "}
                            <strong className="text-stone-900 font-black">
                              {(s.totalCollection / 10000).toFixed(1)}만
                            </strong>
                          </span>
                          <span className="text-stone-300">•</span>
                          <span>
                            지급{" "}
                            <strong className="text-stone-900 font-black">
                              {(s.totalStaffPayment / 10000).toFixed(1)}만
                            </strong>
                          </span>
                          {s.totalTip > 0 && (
                            <>
                              <span className="text-stone-300">•</span>
                              <span>
                                팁{" "}
                                <strong className="text-amber-700 font-black">
                                  {(s.totalTip / 10000).toFixed(1)}만
                                </strong>
                              </span>
                            </>
                          )}
                          <span className="text-stone-300">•</span>
                          <span>
                            수익{" "}
                            <strong className="text-emerald-700 font-black">
                              {(s.totalCommission / 10000).toFixed(1)}만
                            </strong>
                          </span>
                        </div>

                        {/* Status Chip */}
                        <div className="shrink-0 mt-1 sm:mt-0">
                          {s.recordCount === 0 ? (
                            <span className="text-stone-400 text-[10px]">-</span>
                          ) : s.isAllStaffPaid ? (
                            <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black inline-flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5 text-emerald-600" />
                              지급완료
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-black">
                              미지급
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 2. Desktop Full Table (Shown only on large desktop screens `lg:`) */}
                <div className="hidden lg:block overflow-x-auto w-full">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-stone-100 text-stone-400 font-bold bg-stone-50/50 rounded-lg">
                        <th className="py-2.5 px-3 rounded-l-lg whitespace-nowrap">직원명</th>
                        <th className="py-2.5 px-2 text-center whitespace-nowrap">유형</th>
                        <th className="py-2.5 px-2 text-center whitespace-nowrap">구분</th>
                        <th className="py-2.5 px-2 text-center whitespace-nowrap">파견내역</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap">총 수금액</th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap">기본 지급액</th>
                        <th className="py-2.5 px-2 text-right whitespace-nowrap">팁</th>
                        <th className="py-2.5 px-2 text-right whitespace-nowrap">수익</th>
                        <th className="py-2.5 px-2 text-center whitespace-nowrap">지급상태</th>
                        <th className="py-2.5 px-3 text-right rounded-r-lg whitespace-nowrap">
                          최종입금금액
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {aff.staffList.map((s) => {
                        return (
                          <tr
                            key={`desktop-${s.rawName}`}
                            onClick={() => onStaffPaymentClick(s.rawName)}
                            className={cn(
                              "hover:bg-stone-50/80 transition-colors cursor-pointer group",
                              s.isOff && "opacity-60 bg-stone-50/30",
                            )}
                          >
                            {/* Staff Full Name & Status */}
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-stone-900 group-hover:text-indigo-600 transition-colors text-sm whitespace-nowrap">
                                  {s.displayName}
                                </span>
                                {s.isOff && (
                                  <span className="text-[9px] font-bold bg-stone-100 text-stone-400 px-1 py-0.5 rounded whitespace-nowrap">
                                    퇴근
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Type Badge */}
                            <td className="py-3 px-2 text-center whitespace-nowrap">
                              <span
                                className={cn(
                                  "text-[10px] font-black px-1.5 py-0.5 rounded text-white inline-block whitespace-nowrap",
                                  s.type === "HOPPER"
                                    ? "bg-purple-500"
                                    : s.type === "PUBLIC"
                                      ? "bg-blue-500"
                                      : "bg-emerald-500",
                                )}
                              >
                                {s.type === "HOPPER"
                                  ? "하퍼"
                                  : s.type === "PUBLIC"
                                    ? "퍼블릭"
                                    : "커피"}
                              </span>
                            </td>

                            {/* Direct / Delegated Badge based on 4-char rule */}
                            <td className="py-3 px-2 text-center whitespace-nowrap">
                              <span
                                className={cn(
                                  "text-[9px] font-black px-1.5 py-0.5 rounded text-white inline-block whitespace-nowrap",
                                  s.isDirect ? "bg-amber-500" : "bg-purple-600",
                                )}
                              >
                                {s.isDirect ? "직속" : "위탁"}
                              </span>
                            </td>

                            {/* Dispatches summary */}
                            <td className="py-3 px-2 text-center whitespace-nowrap">
                              <div className="inline-flex items-center gap-1 bg-stone-100 px-2 py-0.5 rounded-md font-bold text-stone-700 text-[11px] whitespace-nowrap">
                                <span>{s.recordCount}건</span>
                                <span className="text-stone-400">
                                  (정{s.fullTimeUnits}/반{s.bantiUnits})
                                </span>
                              </div>
                            </td>

                            {/* Total Collection */}
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <div className="font-bold text-stone-900 whitespace-nowrap">
                                {(s.totalCollection / 10000).toFixed(1)}만
                              </div>
                              {s.totalUnpaid > 0 && (
                                <div className="text-[10px] font-bold text-red-500 whitespace-nowrap">
                                  미수 {(s.totalUnpaid / 10000).toFixed(1)}만
                                </div>
                              )}
                            </td>

                            {/* Staff Payment */}
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <div className="font-bold text-stone-900 whitespace-nowrap">
                                {(s.totalStaffPayment / 10000).toFixed(1)}만
                              </div>
                            </td>

                            {/* Tip */}
                            <td className="py-3 px-2 text-right font-medium text-stone-600 whitespace-nowrap">
                              {s.totalTip > 0
                                ? `${(s.totalTip / 10000).toFixed(1)}만`
                                : "-"}
                            </td>

                            {/* Profit */}
                            <td className="py-3 px-2 text-right font-medium text-stone-600 whitespace-nowrap">
                              {(s.totalCommission / 10000).toFixed(1)}만
                            </td>

                            {/* Payment Status (지급완료 vs 미지급) */}
                            <td className="py-3 px-2 text-center whitespace-nowrap">
                              {s.recordCount === 0 ? (
                                <span className="text-stone-300 text-[10px] font-bold">-</span>
                              ) : s.isAllStaffPaid ? (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black inline-flex items-center gap-0.5 whitespace-nowrap">
                                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                                  지급완료
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black whitespace-nowrap">
                                  미지급
                                </span>
                              )}
                            </td>

                            {/* Final Deposit (최종입금금액) */}
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <div className="inline-flex flex-col items-end whitespace-nowrap">
                                <div
                                  className={cn(
                                    "font-black px-2 py-1 rounded-lg text-xs shadow-2xs whitespace-nowrap text-white",
                                    s.isDirect ? "bg-amber-500" : "bg-purple-600",
                                  )}
                                >
                                  {(s.expectedDeposit / 10000).toFixed(1)}만원
                                </div>
                                <div className="text-[9.5px] font-medium text-stone-400 mt-0.5 whitespace-nowrap">
                                  {s.expectedDeposit.toLocaleString()}원
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* HIDDEN OFF-SCREEN DESKTOP CAPTURE TEMPLATES */}
      {/* Guarantees that capturing from mobile or PC generates the EXACT same pristine Desktop Computer Report! */}
      {/* ========================================================================= */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: "-99999px",
          top: 0,
          pointerEvents: "none",
          zIndex: -1,
        }}
      >
        {/* 1. Full View Desktop Capture Template */}
        <div
          id="desktop-capture-full-view"
          style={{ width: "880px", backgroundColor: "#ffffff" }}
          className="p-6 space-y-6 bg-white text-stone-900 font-sans"
        >
          {/* Header Summary */}
          <div className="bg-stone-900 text-white p-5 rounded-2xl border border-stone-800 shadow-md">
            <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-stone-800">
              <div className="flex items-center gap-1.5 text-xs font-black text-indigo-300">
                <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>{formattedDate} 정산내역</span>
              </div>
              <span className="text-[10px] font-bold text-stone-400">
                AI Studio 정산 시스템
              </span>
            </div>
            <div className="flex justify-between items-start">
              <div>
                <div className="text-stone-400 text-xs font-bold mb-1">
                  총 최종입금금액 합계 (전체 소속)
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-4xl font-black text-white">
                    {(grandTotals.totalDeposit / 10000).toFixed(1)}
                    <span className="text-lg font-bold ml-1 text-indigo-300">
                      만원
                    </span>
                  </span>
                  <span className="text-xs font-medium text-stone-400">
                    ({grandTotals.totalDeposit.toLocaleString()}원)
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-stone-800 text-xs">
              <span className="bg-stone-800 text-stone-300 px-2 py-0.5 rounded-md font-bold">
                총 {grandTotals.totalStaffCount}명 ({grandTotals.totalDispatches}건)
              </span>
              <span className="text-stone-400 text-[11px]">
                직속 {(grandTotals.directDeposit / 10000).toFixed(1)}만원 | 위탁 {(grandTotals.delegatedDeposit / 10000).toFixed(1)}만원
              </span>
            </div>
          </div>

          {/* All Affiliation Tables in full desktop format */}
          <div className="space-y-6">
            {affiliationGroups.map((aff) => (
              <div
                key={`full-cap-${aff.affiliationName}`}
                className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs"
              >
                {/* Date & Affiliation Header */}
                <div className="flex items-center justify-between bg-stone-50 border border-stone-200/80 rounded-xl px-3 py-1.5 mb-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-black text-stone-800">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>{formattedDate} 정산내역</span>
                  </div>
                  <div className="text-[11px] font-bold text-stone-500">
                    소속: <strong className="text-stone-900">{aff.affiliationName}</strong> {aff.isDirect ? "(직속)" : "(위탁)"}
                  </div>
                </div>

                <div className="flex items-center justify-between pb-3 mb-3 border-b border-stone-100">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "px-3 py-1 rounded-xl text-xs font-black text-white",
                        aff.isDirect ? "bg-amber-500" : "bg-purple-600",
                      )}
                    >
                      {aff.affiliationName} {aff.isDirect ? "(직속)" : "(위탁)"}
                    </span>
                    {aff.isAllAffiliationPaid ? (
                      <span className="px-2 py-0.5 rounded-lg text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                        전원 지급완료
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-lg text-xs font-black bg-amber-50 text-amber-700 border border-amber-200">
                        미지급 {aff.unpaidStaffCount}명
                      </span>
                    )}
                    <span className="text-xs font-bold text-stone-500">
                      인원 {aff.staffList.length}명 ({aff.totalDispatches}건)
                    </span>
                  </div>

                  <div
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-xl border",
                      aff.isDirect
                        ? "bg-amber-50 border-amber-200 text-amber-950"
                        : "bg-purple-50 border-purple-200 text-purple-950",
                    )}
                  >
                    <span className="text-xs font-bold">
                      [{aff.affiliationName}] 최종입금금액:
                    </span>
                    <span className="text-lg font-black">
                      {(aff.totalExpectedDeposit / 10000).toFixed(1)}만원
                    </span>
                    <span className="text-xs font-bold">
                      ({aff.totalExpectedDeposit.toLocaleString()}원)
                    </span>
                  </div>
                </div>

                {/* Table */}
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-stone-100 text-stone-400 font-bold bg-stone-50/50 rounded-lg">
                      <th className="py-2.5 px-3 rounded-l-lg whitespace-nowrap">직원명</th>
                      <th className="py-2.5 px-2 text-center whitespace-nowrap">유형</th>
                      <th className="py-2.5 px-2 text-center whitespace-nowrap">구분</th>
                      <th className="py-2.5 px-2 text-center whitespace-nowrap">파견내역</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">총 수금액</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">기본 지급액</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap">팁</th>
                      <th className="py-2.5 px-2 text-right whitespace-nowrap">수익</th>
                      <th className="py-2.5 px-2 text-center whitespace-nowrap">지급상태</th>
                      <th className="py-2.5 px-3 text-right rounded-r-lg whitespace-nowrap">
                        최종입금금액
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {aff.staffList.map((s) => (
                      <tr key={`cap-full-row-${s.rawName}`}>
                        <td className="py-3 px-3 whitespace-nowrap font-bold text-stone-900">
                          {s.displayName}
                        </td>
                        <td className="py-3 px-2 text-center whitespace-nowrap">
                          <span
                            className={cn(
                              "text-[10px] font-black px-1.5 py-0.5 rounded text-white",
                              s.type === "HOPPER"
                                ? "bg-purple-500"
                                : s.type === "PUBLIC"
                                  ? "bg-blue-500"
                                  : "bg-emerald-500",
                            )}
                          >
                            {s.type === "HOPPER" ? "하퍼" : s.type === "PUBLIC" ? "퍼블릭" : "커피"}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center whitespace-nowrap">
                          <span
                            className={cn(
                              "text-[9px] font-black px-1.5 py-0.5 rounded text-white",
                              s.isDirect ? "bg-amber-500" : "bg-purple-600",
                            )}
                          >
                            {s.isDirect ? "직속" : "위탁"}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1 bg-stone-100 px-2 py-0.5 rounded-md font-bold text-stone-700 text-[11px]">
                            <span>{s.recordCount}건</span>
                            <span className="text-stone-400">(정{s.fullTimeUnits}/반{s.bantiUnits})</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap font-bold text-stone-900">
                          {(s.totalCollection / 10000).toFixed(1)}만
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap font-bold text-stone-900">
                          {(s.totalStaffPayment / 10000).toFixed(1)}만
                        </td>
                        <td className="py-3 px-2 text-right whitespace-nowrap text-stone-600">
                          {s.totalTip > 0 ? `${(s.totalTip / 10000).toFixed(1)}만` : "-"}
                        </td>
                        <td className="py-3 px-2 text-right whitespace-nowrap text-stone-600">
                          {(s.totalCommission / 10000).toFixed(1)}만
                        </td>
                        <td className="py-3 px-2 text-center whitespace-nowrap">
                          {s.recordCount === 0 ? (
                            <span className="text-stone-300 text-[10px]">-</span>
                          ) : s.isAllStaffPaid ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black">
                              지급완료
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black">
                              미지급
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex flex-col items-end">
                            <div
                              className={cn(
                                "font-black px-2 py-1 rounded-lg text-xs text-white",
                                s.isDirect ? "bg-amber-500" : "bg-purple-600",
                              )}
                            >
                              {(s.expectedDeposit / 10000).toFixed(1)}만원
                            </div>
                            <div className="text-[9.5px] font-medium text-stone-400 mt-0.5">
                              {s.expectedDeposit.toLocaleString()}원
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Individual Affiliation Desktop Capture Templates */}
        {affiliationGroups.map((aff) => (
          <div
            id={`desktop-capture-group-${aff.affiliationName}`}
            key={`desktop-cap-card-${aff.affiliationName}`}
            style={{ width: "880px", backgroundColor: "#ffffff" }}
            className="p-6 bg-white text-stone-900 font-sans border border-stone-200 rounded-2xl space-y-4"
          >
            {/* Date & Affiliation Header */}
            <div className="flex items-center justify-between bg-stone-50 border border-stone-200/80 rounded-xl px-4 py-2">
              <div className="flex items-center gap-2 text-sm font-black text-stone-800">
                <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>{formattedDate} 정산내역</span>
              </div>
              <div className="text-xs font-bold text-stone-500">
                소속: <strong className="text-stone-900 text-sm">{aff.affiliationName}</strong> {aff.isDirect ? "(직속)" : "(위탁)"}
              </div>
            </div>

            {/* Affiliation Subtotal Bar */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-sm font-black text-white shadow-xs",
                    aff.isDirect ? "bg-amber-500" : "bg-purple-600",
                  )}
                >
                  {aff.affiliationName} {aff.isDirect ? "(직속)" : "(위탁)"}
                </span>
                {aff.isAllAffiliationPaid ? (
                  <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                    전원 지급완료
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-amber-50 text-amber-700 border border-amber-200">
                    미지급 {aff.unpaidStaffCount}명
                  </span>
                )}
                <span className="text-xs font-bold text-stone-500">
                  인원 {aff.staffList.length}명 ({aff.totalDispatches}건)
                </span>
              </div>

              <div
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl border shadow-2xs",
                  aff.isDirect
                    ? "bg-amber-50 border-amber-200 text-amber-950"
                    : "bg-purple-50 border-purple-200 text-purple-950",
                )}
              >
                <span className="text-xs font-bold">
                  [{aff.affiliationName}] 최종입금금액:
                </span>
                <span className="text-xl font-black">
                  {(aff.totalExpectedDeposit / 10000).toFixed(1)}만원
                </span>
                <span className="text-xs font-bold">
                  ({aff.totalExpectedDeposit.toLocaleString()}원)
                </span>
              </div>
            </div>

            {/* Full 10-Column Desktop Table */}
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-stone-400 font-bold bg-stone-50/70 rounded-lg">
                  <th className="py-2.5 px-3 rounded-l-lg whitespace-nowrap">직원명</th>
                  <th className="py-2.5 px-2 text-center whitespace-nowrap">유형</th>
                  <th className="py-2.5 px-2 text-center whitespace-nowrap">구분</th>
                  <th className="py-2.5 px-2 text-center whitespace-nowrap">파견내역</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">총 수금액</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">기본 지급액</th>
                  <th className="py-2.5 px-2 text-right whitespace-nowrap">팁</th>
                  <th className="py-2.5 px-2 text-right whitespace-nowrap">수익</th>
                  <th className="py-2.5 px-2 text-center whitespace-nowrap">지급상태</th>
                  <th className="py-2.5 px-3 text-right rounded-r-lg whitespace-nowrap">
                    최종입금금액
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {aff.staffList.map((s) => (
                  <tr key={`cap-ind-row-${s.rawName}`}>
                    <td className="py-3 px-3 whitespace-nowrap font-bold text-stone-900 text-sm">
                      {s.displayName}
                    </td>
                    <td className="py-3 px-2 text-center whitespace-nowrap">
                      <span
                        className={cn(
                          "text-[10px] font-black px-1.5 py-0.5 rounded text-white",
                          s.type === "HOPPER"
                            ? "bg-purple-500"
                            : s.type === "PUBLIC"
                              ? "bg-blue-500"
                              : "bg-emerald-500",
                        )}
                      >
                        {s.type === "HOPPER" ? "하퍼" : s.type === "PUBLIC" ? "퍼블릭" : "커피"}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center whitespace-nowrap">
                      <span
                        className={cn(
                          "text-[9px] font-black px-1.5 py-0.5 rounded text-white",
                          s.isDirect ? "bg-amber-500" : "bg-purple-600",
                        )}
                      >
                        {s.isDirect ? "직속" : "위탁"}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 bg-stone-100 px-2 py-0.5 rounded-md font-bold text-stone-700 text-[11px]">
                        <span>{s.recordCount}건</span>
                        <span className="text-stone-400">(정{s.fullTimeUnits}/반{s.bantiUnits})</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap font-bold text-stone-900">
                      {(s.totalCollection / 10000).toFixed(1)}만
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap font-bold text-stone-900">
                      {(s.totalStaffPayment / 10000).toFixed(1)}만
                    </td>
                    <td className="py-3 px-2 text-right whitespace-nowrap text-stone-600">
                      {s.totalTip > 0 ? `${(s.totalTip / 10000).toFixed(1)}만` : "-"}
                    </td>
                    <td className="py-3 px-2 text-right whitespace-nowrap text-stone-600">
                      {(s.totalCommission / 10000).toFixed(1)}만
                    </td>
                    <td className="py-3 px-2 text-center whitespace-nowrap">
                      {s.recordCount === 0 ? (
                        <span className="text-stone-300 text-[10px]">-</span>
                      ) : s.isAllStaffPaid ? (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black">
                          지급완료
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black">
                          미지급
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex flex-col items-end">
                        <div
                          className={cn(
                            "font-black px-2 py-1 rounded-lg text-xs text-white shadow-2xs",
                            s.isDirect ? "bg-amber-500" : "bg-purple-600",
                          )}
                        >
                          {(s.expectedDeposit / 10000).toFixed(1)}만원
                        </div>
                        <div className="text-[9.5px] font-medium text-stone-400 mt-0.5">
                          {s.expectedDeposit.toLocaleString()}원
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Batch Affiliation Payment Modal */}
      {activeBatchGroup && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          <div
            onClick={() => {
              if (!isBatchProcessing) setBatchModalAffiliation(null);
            }}
            className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm transition-opacity"
          />
          <div className="relative z-10 w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden p-6 animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-black text-white",
                    activeBatchGroup.isDirect ? "bg-amber-500" : "bg-purple-600",
                  )}
                >
                  {activeBatchGroup.affiliationName} {activeBatchGroup.isDirect ? "(직속)" : "(위탁)"}
                </span>
                <h3 className="text-base font-bold text-stone-900">
                  소속 일괄 지급 관리
                </h3>
              </div>
              <button
                disabled={isBatchProcessing}
                onClick={() => setBatchModalAffiliation(null)}
                className="text-stone-400 hover:text-stone-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Summary Body */}
            <div className="py-5 space-y-4">
              <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-4 space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-stone-500 font-bold">정산 기준일자</span>
                  <span className="font-black text-stone-800">{formattedDate}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-stone-500 font-bold">대상 인원 및 파견 건수</span>
                  <span className="font-black text-stone-800">
                    {activeBatchGroup.staffList.length}명 ({activeBatchGroup.totalDispatches}건)
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-stone-500 font-bold">총 기본 지급액 합계</span>
                  <span className="font-black text-stone-800">
                    {activeBatchGroup.totalStaffPayment.toLocaleString()}원
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs pt-2 border-t border-stone-200">
                  <span className="text-xs font-black text-indigo-900">
                    소속 최종입금금액 합계
                  </span>
                  <span className="text-base font-black text-indigo-600">
                    {activeBatchGroup.totalExpectedDeposit.toLocaleString()}원
                  </span>
                </div>
              </div>

              {/* Staff List Preview */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                <div className="text-[11px] font-bold text-stone-400 mb-1">
                  소속 직원 명단 ({activeBatchGroup.staffList.length}명)
                </div>
                {activeBatchGroup.staffList.map((s) => (
                  <div
                    key={s.rawName}
                    className="flex items-center justify-between bg-stone-50/70 border border-stone-100 rounded-xl px-3 py-2 text-xs"
                  >
                    <span className="font-bold text-stone-800">{s.displayName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-stone-500 font-medium">
                        {(s.totalStaffPayment / 10000).toFixed(1)}만원
                      </span>
                      {s.recordCount === 0 ? (
                        <span className="text-[10px] text-stone-400">-</span>
                      ) : s.isAllStaffPaid ? (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px]">
                          지급완료
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold text-[10px]">
                          미지급
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    disabled={isBatchProcessing || activeBatchGroup.allRecords.length === 0}
                    onClick={() => handleBatchPayment("TRANSFER")}
                    className="py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-blue-200 transition-all disabled:opacity-50"
                  >
                    <CreditCard className="w-4 h-4" />
                    전체 계좌이체 지급완료
                  </button>

                  <button
                    disabled={isBatchProcessing || activeBatchGroup.allRecords.length === 0}
                    onClick={() => handleBatchPayment("CASH")}
                    className="py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-200 transition-all disabled:opacity-50"
                  >
                    <Banknote className="w-4 h-4" />
                    전체 현금 지급완료
                  </button>
                </div>

                <button
                  disabled={isBatchProcessing || activeBatchGroup.allRecords.length === 0}
                  onClick={() => handleBatchPayment("CANCEL")}
                  className="w-full py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  전체 지급 취소 (미지급으로 되돌리기)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
