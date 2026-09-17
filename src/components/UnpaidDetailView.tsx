import React, { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Search,
  AlertTriangle,
  Coins,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Camera,
  X,
} from "lucide-react";
import * as htmlToImage from "html-to-image";
import { motion, AnimatePresence } from "motion/react";
import { Timestamp } from "firebase/firestore";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  DispatchRecord,
  Staff,
  PaymentMethod,
  CollectionHistoryEntry,
} from "../types";
import {
  calculateEstablishmentCollection,
  RoundBreakdownItem,
  getRecordBusinessDate,
} from "../lib/utils";
import { BatchCollectForm } from "./BatchCollectForm";
import { EstablishmentAdditionalCollectForm } from "./EstablishmentAdditionalCollectForm";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function formatStaffNameComponents(fullName: string) {
  if (!fullName)
    return {
      main4: "",
      fullName: "",
      category: "",
      namePart: "",
      affiliation: "직속",
      isDirect: true,
    };

  const trimmed = fullName.trim();
  const cleanNoSpace = trimmed.replace(/\s+/g, "");

  if (cleanNoSpace.length <= 4) {
    let category = "커피";
    let namePart = cleanNoSpace;
    if (cleanNoSpace.startsWith("하퍼") || cleanNoSpace.startsWith("하_")) {
      category = "하퍼";
      namePart = cleanNoSpace.replace(/^하[퍼_]?/, "");
    } else if (
      cleanNoSpace.startsWith("퍼블릭") ||
      cleanNoSpace.startsWith("퍼_")
    ) {
      category = "퍼블릭";
      namePart = cleanNoSpace.replace(/^퍼[블릭_]?/, "");
    } else if (
      cleanNoSpace.startsWith("커피") ||
      cleanNoSpace.startsWith("커_")
    ) {
      category = "커피";
      namePart = cleanNoSpace.replace(/^커[피_]?/, "");
    }

    return {
      main4: trimmed,
      fullName: trimmed,
      category,
      namePart: namePart || trimmed,
      affiliation: "직속",
      isDirect: true,
    };
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  let affiliation = "";
  let main4 = "";

  if (parts.length >= 3) {
    main4 = `${parts[0]} ${parts[1]}`;
    affiliation = parts.slice(2).join(" ").trim();
  } else if (parts.length === 2) {
    if (parts[1].length > 2) {
      main4 = `${parts[0]} ${parts[1].slice(0, 2)}`;
      affiliation = parts[1].slice(2).trim();
    } else {
      main4 = parts[0];
      affiliation = parts[1].trim();
    }
  } else {
    main4 = `${cleanNoSpace.slice(0, 2)} ${cleanNoSpace.slice(2, 4)}`;
    affiliation = cleanNoSpace.slice(4).trim();
  }

  affiliation = affiliation.replace(/^[\(\[\{]+|[\)\]\}]+$/g, "").trim();
  if (!affiliation) {
    affiliation = "위탁";
  }

  let category = "커피";
  let namePart = cleanNoSpace.slice(0, 4);
  if (cleanNoSpace.startsWith("하퍼") || cleanNoSpace.startsWith("하_")) {
    category = "하퍼";
    namePart = cleanNoSpace.slice(0, 4).replace(/^하[퍼_]?/, "");
  } else if (
    cleanNoSpace.startsWith("퍼블릭") ||
    cleanNoSpace.startsWith("퍼_")
  ) {
    category = "퍼블릭";
    namePart = cleanNoSpace.slice(0, 4).replace(/^퍼[블릭_]?/, "");
  } else if (
    cleanNoSpace.startsWith("커피") ||
    cleanNoSpace.startsWith("커_")
  ) {
    category = "커피";
    namePart = cleanNoSpace.slice(0, 4).replace(/^커[피_]?/, "");
  }

  return {
    main4: main4 || trimmed.slice(0, 5),
    fullName: trimmed,
    category,
    namePart: namePart || trimmed,
    affiliation,
    isDirect: false,
  };
}

const getErrorMessage = (
  error: any,
  defaultMessage: string = "오류가 발생했습니다.",
) => {
  if (!error) return defaultMessage;
  try {
    const errInfo = JSON.parse(error.message);
    return `${errInfo.error} (${errInfo.operationType})`;
  } catch {
    if (error instanceof Error) return error.message;
    return typeof error === "string" ? error : defaultMessage;
  }
};

const getRecordCollectionHistory = (
  r: Partial<DispatchRecord>,
): CollectionHistoryEntry[] => {
  if (!r) return [];

  if (
    r.collectionHistory &&
    Array.isArray(r.collectionHistory) &&
    r.collectionHistory.length > 0
  ) {
    const valid = r.collectionHistory.filter(
      (e) => e && ((e.amount !== undefined && e.amount > 0) || e.collectedAt),
    );
    if (valid.length > 0) {
      return valid;
    }
  }

  if (r.isPass) {
    const targetTotal =
      r.collectedAmount !== undefined && r.collectedAmount > 0
        ? r.collectedAmount
        : r.totalAmount || 0;
    return [
      {
        collectedAt: r.collectedAt || (r as any).createdAt || null,
        amount: targetTotal,
        paymentMethod: r.paymentMethod !== "UNPAID" ? r.paymentMethod : undefined,
        depositorName: r.depositorName,
        note: "패스 수금",
      },
    ];
  }

  const targetTotal =
    r.paymentMethod !== "UNPAID" && r.collectedAmount !== undefined
      ? r.collectedAmount
      : r.paymentMethod !== "UNPAID"
        ? r.totalAmount || 0
        : 0;

  if (targetTotal <= 0 && r.paymentMethod === "UNPAID") {
    return [];
  }

  let rawList: CollectionHistoryEntry[] = [];
  if (r.collectedAt) {
    rawList.push({
      collectedAt: r.collectedAt,
      amount:
        r.collectedAmount !== undefined
          ? r.collectedAmount
          : r.totalAmount || 0,
      paymentMethod:
        r.paymentMethod !== "UNPAID" ? r.paymentMethod : undefined,
      depositorName: r.depositorName,
      note: "1차 수금",
    });
  }
  if (r.additionalCollectedAt) {
    const t1 = r.collectedAt
      ? (r.collectedAt.toDate
          ? r.collectedAt.toDate()
          : new Date(r.collectedAt)
        ).getTime()
      : 0;
    const t2 = (
      r.additionalCollectedAt.toDate
        ? r.additionalCollectedAt.toDate()
        : new Date(r.additionalCollectedAt)
    ).getTime();
    if (!isNaN(t2) && t2 !== t1) {
      const firstAmt =
        rawList.length > 0 && rawList[0].amount !== undefined
          ? rawList[0].amount
          : 0;
      const diffAmt = Math.max(0, targetTotal - firstAmt);
      if (diffAmt > 0) {
        rawList.push({
          collectedAt: r.additionalCollectedAt,
          amount: diffAmt,
          paymentMethod:
            r.paymentMethod !== "UNPAID" ? r.paymentMethod : undefined,
          depositorName: r.depositorName,
          note: "2차 추가수금",
        });
      }
    }
  }

  let cumulative = 0;
  const result: CollectionHistoryEntry[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const entry = rawList[i];
    if (!entry || !entry.collectedAt) continue;
    const entryAmt =
      entry.amount !== undefined ? entry.amount : i === 0 ? targetTotal : 0;
    if (entryAmt <= 0) continue;
    if (targetTotal > 0 && cumulative >= targetTotal) break;
    const allowable =
      targetTotal > 0 ? Math.min(entryAmt, targetTotal - cumulative) : entryAmt;
    if (allowable > 0) {
      result.push({
        ...entry,
        amount: allowable,
        note: entry.note || (i === 0 ? "1차 수금" : `${i + 1}차 추가수금`),
      });
      cumulative += allowable;
    }
  }

  return result;
};

interface UnpaidDetailViewProps {
  records: DispatchRecord[];
  allUnpaidRecords: DispatchRecord[];
  staff: Staff[];
  selectedDate: string;
  onUpdateRecord: (
    id: string,
    updates: Partial<DispatchRecord>,
  ) => Promise<void>;
  onEditRecord?: (record: DispatchRecord) => void;
}

export function UnpaidDetailView({
  records,
  allUnpaidRecords,
  staff,
  selectedDate,
  onUpdateRecord,
  onEditRecord,
}: UnpaidDetailViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<
    | "ALL_UNPAID"
    | "UNPAID_ONLY"
    | "SHORTAGE_ONLY"
    | "ALL"
    | "TODAY_ONLY"
    | "PAST_ONLY"
    | "PAID_ONLY"
  >("ALL_UNPAID");
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>(
    {},
  );
  const [allExpanded, setAllExpanded] = useState<boolean>(true);

  // Local Confirm / Alert Modal States
  const [confirmConfig, setConfirmConfig] = useState<{
    message: string;
    action: () => Promise<void> | void;
  } | null>(null);

  const [alertConfig, setAlertConfig] = useState<{
    message: string;
  } | null>(null);

  // Batch collection active state for a specific establishment
  const [batchCollecting, setBatchCollecting] = useState<{
    dateKey: string;
    estName: string;
    method: PaymentMethod;
  } | null>(null);

  const [batchAdditionalCollectingKey, setBatchAdditionalCollectingKey] =
    useState<string | null>(null);

  // Screenshot Capture State
  const [isCapturing, setIsCapturing] = useState<string | null>(null);

  // Capture Single Establishment Unpaid Card or Entire Date Group
  const handleCaptureEstablishment = async (
    elementId: string,
    estName: string,
    dateStr: string,
  ) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    setIsCapturing(elementId);
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
            (node.dataset.html2canvasIgnore === "true" ||
              node.getAttribute("data-capture-ignore") === "true")
          ) {
            return false;
          }
          return true;
        },
      });

      const formattedDatePart = dateStr ? dateStr.replace(/[^0-9]/g, "") : "";
      const filename = `${estName}_${formattedDatePart || dateStr}_미수금내역.png`;

      if (navigator.canShare && navigator.share) {
        try {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const file = new File([blob], filename, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: `${estName} 미수금 내역 (${dateStr})`,
              text: `[${dateStr}] ${estName} 미수금 내역`,
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
      setAlertConfig({ message: "이미지 캡쳐에 실패했습니다." });
    } finally {
      setIsCapturing(null);
    }
  };

  // Combine and de-duplicate records that have unpaid history or are current
  const combinedRecords = useMemo(() => {
    const map = new Map<string, DispatchRecord & { wasUnpaid?: boolean }>();

    allUnpaidRecords.forEach((r) => {
      if (r.id) {
        map.set(r.id, { ...r, wasUnpaid: true });
      }
    });

    records.forEach((r) => {
      if (r.id) {
        const existing = map.get(r.id);
        if (existing) {
          map.set(r.id, { ...existing, ...r, wasUnpaid: true });
        } else if (
          r.paymentMethod === "UNPAID" ||
          (r.collectedAmount !== undefined && r.collectedAmount < r.totalAmount)
        ) {
          map.set(r.id, { ...r, wasUnpaid: true });
        }
      }
    });

    return Array.from(map.values());
  }, [allUnpaidRecords, records]);

  // Check if dispatch is ongoing
  const isOngoing = (r: DispatchRecord) => {
    if (!r.startTime || !r.endTime) return false;
    const start = r.startTime.toDate
      ? r.startTime.toDate()
      : new Date(r.startTime);
    const end = r.endTime.toDate ? r.endTime.toDate() : new Date(r.endTime);
    return start.getTime() === end.getTime();
  };

  // Group by Date -> Establishment
  const dateEstablishmentGroups = useMemo(() => {
    const rawGroups: Record<
      string,
      Record<
        string,
        {
          totalRequested: number;
          totalCollected: number;
          unpaidAmount: number;
          records: DispatchRecord[];
          hasShortage: boolean;
          isFullyPaid: boolean;
          roundBreakdown: RoundBreakdownItem[];
          isBatchCollection: boolean;
        }
      >
    > = {};

    combinedRecords.forEach((r) => {
      if (isOngoing(r)) return;

      const date = getRecordBusinessDate(r);
      if (!rawGroups[date]) rawGroups[date] = {};
      if (!rawGroups[date][r.establishmentName]) {
        rawGroups[date][r.establishmentName] = {
          totalRequested: 0,
          totalCollected: 0,
          unpaidAmount: 0,
          records: [],
          hasShortage: false,
          isFullyPaid: false,
          roundBreakdown: [],
          isBatchCollection: false,
        };
      }

      const est = rawGroups[date][r.establishmentName];
      est.records.push(r);
    });

    // Calculate establishment-level collections accurately
    Object.values(rawGroups).forEach((estMap) => {
      Object.values(estMap).forEach((est) => {
        const calc = calculateEstablishmentCollection(est.records);
        est.totalRequested = calc.totalRequested;
        est.totalCollected = calc.totalCollected;
        est.unpaidAmount = calc.unpaidAmount;
        est.hasShortage = calc.hasShortage;
        est.isFullyPaid = calc.isFullyPaid;
        est.roundBreakdown = calc.roundBreakdown;
        est.isBatchCollection = calc.isBatchCollection;
      });
    });

    return rawGroups;
  }, [combinedRecords]);

  // Overall Totals
  const overallStats = useMemo(() => {
    let totalUnpaid = 0;
    let totalRequested = 0;
    let totalCollected = 0;
    let todayUnpaid = 0;
    let todayUnpaidCount = 0;
    let pastUnpaid = 0;
    let pastUnpaidCount = 0;
    let shortageCount = 0;
    let shortageUnpaidAmount = 0;
    let zeroCollectedCount = 0;
    let zeroCollectedAmount = 0;
    let totalUnpaidEstCount = 0;
    let paidCount = 0;
    let totalEstCount = 0;

    Object.entries(dateEstablishmentGroups).forEach(([date, ests]) => {
      const isToday = date === selectedDate;
      Object.values(ests).forEach((est) => {
        totalEstCount += 1;
        totalRequested += est.totalRequested;
        totalCollected += est.totalCollected;
        totalUnpaid += est.unpaidAmount;

        const hasUnpaid = est.unpaidAmount > 0;
        const isPureUnpaid = est.totalCollected === 0 && est.unpaidAmount > 0;
        const isShortage =
          est.totalCollected > 0 && est.totalCollected < est.totalRequested;
        const isPaid = est.unpaidAmount === 0 && est.totalRequested > 0;

        if (hasUnpaid) {
          totalUnpaidEstCount += 1;
          if (isToday) {
            todayUnpaid += est.unpaidAmount;
            todayUnpaidCount += 1;
          } else {
            pastUnpaid += est.unpaidAmount;
            pastUnpaidCount += 1;
          }
        }

        if (isPureUnpaid) {
          zeroCollectedCount += 1;
          zeroCollectedAmount += est.unpaidAmount;
        }

        if (isShortage) {
          shortageCount += 1;
          shortageUnpaidAmount += est.unpaidAmount;
        }

        if (isPaid) {
          paidCount += 1;
        }
      });
    });

    return {
      totalUnpaid,
      totalRequested,
      totalCollected,
      todayUnpaid,
      todayUnpaidCount,
      pastUnpaid,
      pastUnpaidCount,
      shortageCount,
      shortageUnpaidAmount,
      zeroCollectedCount,
      zeroCollectedAmount,
      totalUnpaidEstCount,
      paidCount,
      totalEstCount,
    };
  }, [dateEstablishmentGroups, selectedDate]);

  // Filtered & Sorted Date-Establishment list
  const filteredDateGroups = useMemo(() => {
    const result: [
      string,
      Array<{
        estName: string;
        totalRequested: number;
        totalCollected: number;
        unpaidAmount: number;
        records: DispatchRecord[];
        hasShortage: boolean;
        isFullyPaid: boolean;
        roundBreakdown: RoundBreakdownItem[];
        isBatchCollection: boolean;
      }>,
    ][] = [];

    const lowerSearch = searchTerm.trim().toLowerCase();

    // Sort dates descending
    const sortedDates = Object.keys(dateEstablishmentGroups).sort((a, b) =>
      b.localeCompare(a),
    );

    sortedDates.forEach((date) => {
      const isToday = date === selectedDate;
      if (filterMode === "TODAY_ONLY" && !isToday) return;
      if (filterMode === "PAST_ONLY" && isToday) return;

      const ests = dateEstablishmentGroups[date];
      const filteredEsts: Array<{
        estName: string;
        totalRequested: number;
        totalCollected: number;
        unpaidAmount: number;
        records: DispatchRecord[];
        hasShortage: boolean;
        isFullyPaid: boolean;
        roundBreakdown: RoundBreakdownItem[];
        isBatchCollection: boolean;
      }> = [];

      Object.entries(ests).forEach(([estName, estData]) => {
        // 1. 전체 미수건 (수금 없음 + 감액/차액 수금 모두)
        if (filterMode === "ALL_UNPAID" && estData.unpaidAmount <= 0) return;

        // 2. 미수 발생 건만 = 수금 내역이 전혀 없는 내역만 (totalCollected === 0 && unpaidAmount > 0)
        if (filterMode === "UNPAID_ONLY") {
          if (estData.totalCollected > 0 || estData.unpaidAmount <= 0) return;
        }

        // 3. 감액/차액 수금건 = 수금 내역은 있으나 금액이 일치하지 않는 내역만 (totalCollected > 0 && unpaidAmount > 0)
        if (filterMode === "SHORTAGE_ONLY") {
          if (estData.totalCollected <= 0 || estData.unpaidAmount <= 0) return;
        }

        // 4. 금일 미수건
        if (filterMode === "TODAY_ONLY" && estData.unpaidAmount <= 0) return;

        // 5. 과거 미수건
        if (filterMode === "PAST_ONLY" && estData.unpaidAmount <= 0) return;

        // 6. 완납 건만
        if (filterMode === "PAID_ONLY" && estData.unpaidAmount > 0) return;

        if (lowerSearch) {
          const matchEst = estName.toLowerCase().includes(lowerSearch);
          const matchStaff = estData.records.some((r) =>
            r.staffName?.toLowerCase().includes(lowerSearch),
          );
          const matchDepositor = estData.records.some((r) =>
            r.depositorName?.toLowerCase().includes(lowerSearch),
          );
          if (!matchEst && !matchStaff && !matchDepositor) return;
        }

        filteredEsts.push({
          estName,
          ...estData,
        });
      });

      if (filteredEsts.length > 0) {
        filteredEsts.sort((a, b) => {
          if (a.unpaidAmount !== b.unpaidAmount) {
            return b.unpaidAmount - a.unpaidAmount;
          }
          if (a.totalRequested !== b.totalRequested) {
            return b.totalRequested - a.totalRequested;
          }
          return a.estName.localeCompare(b.estName);
        });

        result.push([date, filteredEsts]);
      }
    });

    return result;
  }, [dateEstablishmentGroups, searchTerm, filterMode, selectedDate]);

  // Relative Date Label
  const getRelativeDateLabel = (dateStr: string) => {
    try {
      const target = parseISO(dateStr);
      const selected = parseISO(selectedDate);
      const diffDays = Math.round(
        (selected.getTime() - target.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diffDays === 0) return " (오늘)";
      if (diffDays === 1) return " (어제)";
      if (diffDays === 2) return " (2일 전)";
      if (diffDays > 0) return ` (${diffDays}일 전)`;
      return "";
    } catch {
      return "";
    }
  };

  // Toggle Collapse
  const toggleDateExpand = (date: string) => {
    setExpandedDates((prev) => {
      const current = prev[date] !== undefined ? prev[date] : allExpanded;
      return { ...prev, [date]: !current };
    });
  };

  const isDateExpanded = (date: string) => {
    return expandedDates[date] !== undefined
      ? expandedDates[date]
      : allExpanded;
  };

  const handleToggleAllExpand = () => {
    const nextState = !allExpanded;
    setAllExpanded(nextState);
    const updated: Record<string, boolean> = {};
    filteredDateGroups.forEach(([date]) => {
      updated[date] = nextState;
    });
    setExpandedDates(updated);
  };

  const applyRecordUpdate = async (
    id: string,
    updates: Partial<DispatchRecord>,
  ) => {
    await onUpdateRecord(id, updates);
  };

  // Batch Collect Action (Establishment level)
  const handleBatchCollect = async (
    recordsToUpdate: DispatchRecord[],
    method: PaymentMethod,
    dateStr: string,
    timeStr: string,
    isPass: boolean = false,
    depositorName: string = "",
    forceCollect: boolean = false,
    customTotalAmount?: number,
  ) => {
    try {
      let collectedAt = new Date();
      if (dateStr && timeStr) {
        const month = parseInt(dateStr.slice(0, 2), 10) - 1;
        const day = parseInt(dateStr.slice(2, 4), 10);
        const hour = parseInt(timeStr.slice(0, 2), 10);
        const minute = parseInt(timeStr.slice(2, 4), 10);
        collectedAt.setMonth(month, day);
        collectedAt.setHours(hour, minute, 0, 0);

        if (!forceCollect) {
          const duplicateRecord = combinedRecords.find((r) => {
            if (r.paymentMethod === "UNPAID" || !r.collectedAt) return false;
            const rDate = r.collectedAt.toDate
              ? r.collectedAt.toDate()
              : new Date(r.collectedAt);
            return (
              rDate.getMonth() === collectedAt.getMonth() &&
              rDate.getDate() === collectedAt.getDate() &&
              rDate.getHours() === collectedAt.getHours() &&
              rDate.getMinutes() === collectedAt.getMinutes()
            );
          });

          if (duplicateRecord) {
            const rDate = duplicateRecord.collectedAt.toDate
              ? duplicateRecord.collectedAt.toDate()
              : new Date(duplicateRecord.collectedAt);
            const formattedTime = format(rDate, "MM/dd HH:mm");
            const batchTotal = recordsToUpdate
              .filter((r) => r.paymentMethod === "UNPAID")
              .reduce((sum, r) => sum + (r.totalAmount || 0), 0);

            setConfirmConfig({
              message: `동일한 날짜와 시간의 수금 기록이 이미 존재합니다.\n\n[기존 수금 기록]\n파견일: ${duplicateRecord.date.slice(5, 7)}/${duplicateRecord.date.slice(8, 10)}\n업소: ${duplicateRecord.establishmentName}\n수금시간: ${formattedTime}\n금액: ${duplicateRecord.totalAmount.toLocaleString()}원${duplicateRecord.depositorName ? `\n입금자: ${duplicateRecord.depositorName}` : ""}\n\n[신규 일괄 입금 정보]\n대상: ${recordsToUpdate.length}건\n원래 미수 총액: ${batchTotal.toLocaleString()}원${customTotalAmount !== undefined ? `\n실제 수금 금액: ${customTotalAmount.toLocaleString()}원` : ""}${depositorName ? `\n입금자: ${depositorName}` : ""}\n\n위 내용으로 일괄 입금 처리를 진행하시겠습니까?`,
              action: () => {
                handleBatchCollect(
                  recordsToUpdate,
                  method,
                  dateStr,
                  timeStr,
                  isPass,
                  depositorName,
                  true,
                  customTotalAmount,
                );
              },
            });
            return;
          }
        }
      }

      const unpaidRecords = recordsToUpdate.filter(
        (r) => r.paymentMethod === "UNPAID",
      );
      if (unpaidRecords.length === 0) return;

      const batchOriginalTotal = unpaidRecords.reduce(
        (sum, r) => sum + (r.totalAmount || 0),
        0,
      );
      const totalAmountToCollect =
        customTotalAmount !== undefined &&
        !isNaN(customTotalAmount) &&
        customTotalAmount >= 0
          ? customTotalAmount
          : batchOriginalTotal;

      const newBatchTimestamp = Timestamp.fromDate(collectedAt);
      const newEstEntry: CollectionHistoryEntry = {
        collectedAt: newBatchTimestamp,
        amount: totalAmountToCollect,
        paymentMethod: method,
        ...(depositorName ? { depositorName } : {}),
        note: "1차 수금",
      };

      const updatePromises = unpaidRecords.map(async (r) => {
        const updates = {
          paymentMethod: method,
          collectedAt: newBatchTimestamp,
          additionalCollectedAt: null,
          collectionHistory: [newEstEntry],
          isPass: isPass,
          isDispatchBoxCollection: false,
          depositorName: depositorName || null,
          collectedAmount: undefined,
        };

        if (r.id) {
          await applyRecordUpdate(r.id, updates as any);
        }
      });

      await Promise.all(updatePromises);
      setBatchCollecting(null);
    } catch (e) {
      console.error("일괄 수금 처리 오류:", e);
      setAlertConfig({
        message: `일괄 수금 처리 중 오류: ${getErrorMessage(e, "일괄 수금 처리 중 오류가 발생했습니다.")}`,
      });
    }
  };

  // Additional Collect Action (Establishment level)
  const handleAdditionalCollect = async (
    estName: string,
    recordsToUpdate: DispatchRecord[],
    method: PaymentMethod,
    additionalAmount: number,
    depositorName: string = "",
    dateStr: string = "",
    timeStr: string = "",
  ) => {
    try {
      const currentRecords = recordsToUpdate.map((r) => {
        const found = combinedRecords.find((x) => x.id === r.id);
        return found || r;
      });

      const now = new Date();
      let year = now.getFullYear();
      let month = now.getMonth();
      let day = now.getDate();
      let hour = now.getHours();
      let minute = now.getMinutes();

      if (dateStr && dateStr.length === 4) {
        month = parseInt(dateStr.slice(0, 2), 10) - 1;
        day = parseInt(dateStr.slice(2, 4), 10);
      }
      if (timeStr && timeStr.length === 4) {
        hour = parseInt(timeStr.slice(0, 2), 10);
        minute = parseInt(timeStr.slice(2, 4), 10);
      }

      const customCollectedAt = Timestamp.fromDate(
        new Date(year, month, day, hour, minute, 0, 0),
      );

      // Find existing establishment collection history from any record
      let existingHist: CollectionHistoryEntry[] = [];
      for (const r of currentRecords) {
        if (
          r.collectionHistory &&
          Array.isArray(r.collectionHistory) &&
          r.collectionHistory.length > 0
        ) {
          existingHist = r.collectionHistory;
          break;
        }
      }

      let currentMaxRound = 1;
      let hasAnyPreviousCollection =
        currentRecords.some((r) => r.paymentMethod !== "UNPAID") ||
        existingHist.length > 0;

      existingHist.forEach((entry, idx) => {
        let rNum = idx + 1;
        if (entry.note) {
          const match = entry.note.match(/(\d+)차/);
          if (match) rNum = parseInt(match[1], 10);
        }
        if (rNum > currentMaxRound) currentMaxRound = rNum;
      });

      const nextRoundNum = hasAnyPreviousCollection ? currentMaxRound + 1 : 1;
      const nextRoundLabel = `${nextRoundNum}차 추가수금`;

      let updatedHistory: CollectionHistoryEntry[] = [];

      if (additionalAmount > 0) {
        const newEntry: CollectionHistoryEntry = {
          collectedAt: customCollectedAt,
          amount: additionalAmount,
          paymentMethod: method,
          ...(depositorName ? { depositorName } : {}),
          note:
            existingHist.length === 0 && nextRoundNum === 1
              ? "1차 수금"
              : nextRoundLabel,
        };
        updatedHistory = [...existingHist, newEntry];
      } else if (additionalAmount < 0) {
        let remainingToDeduct = Math.abs(additionalAmount);
        const newHist: CollectionHistoryEntry[] = [];
        const reversed = [...existingHist].reverse();
        for (const entry of reversed) {
          const eAmt = entry.amount || 0;
          if (remainingToDeduct <= 0) {
            newHist.unshift(entry);
          } else if (eAmt <= remainingToDeduct) {
            remainingToDeduct -= eAmt;
          } else {
            newHist.unshift({
              ...entry,
              amount: eAmt - remainingToDeduct,
            });
            remainingToDeduct = 0;
          }
        }
        updatedHistory = newHist;
      }

      const updatePromises = currentRecords.map(async (r) => {
        const isPaid = updatedHistory.length > 0;
        const updates: Partial<DispatchRecord> = {
          paymentMethod: isPaid
            ? r.paymentMethod !== "UNPAID"
              ? r.paymentMethod
              : method
            : "UNPAID",
          collectionHistory: updatedHistory,
          collectedAt: isPaid ? r.collectedAt || customCollectedAt : null,
          additionalCollectedAt: isPaid ? customCollectedAt : null,
          depositorName: depositorName || r.depositorName || null,
          collectedAmount: undefined,
        };

        if (r.id) {
          await applyRecordUpdate(r.id, updates as any);
        }
      });

      await Promise.all(updatePromises);
      setBatchAdditionalCollectingKey(null);
    } catch (e) {
      console.error("추가 수금 처리 중 오류:", e);
      setAlertConfig({
        message: `추가 수금 처리 중 오류: ${getErrorMessage(e, "추가 수금 처리 중 오류가 발생했습니다.")}`,
      });
    }
  };

  // Establishment All Cancel
  const handleEstablishmentAllCancel = (
    estName: string,
    recordsToCancel: DispatchRecord[],
  ) => {
    setConfirmConfig({
      message: `[${estName}] 전체 수금 완료 처리를 취소하고 미수로 되돌리시겠습니까?`,
      action: async () => {
        try {
          const updatePromises = recordsToCancel
            .filter((r) => r.id)
            .map(async (r) => {
              const updates = {
                paymentMethod: "UNPAID" as PaymentMethod,
                collectedAt: null,
                additionalCollectedAt: null,
                collectionHistory: [],
                isPass: false,
                collectedAmount: 0,
                depositorName: null,
                isDispatchBoxCollection: false,
                wasUnpaid: true,
              };
              await applyRecordUpdate(r.id!, updates as any);
            });

          await Promise.all(updatePromises);
        } catch (e) {
          console.error("가게 전체 수금 취소 오류:", e);
          setAlertConfig({
            message: `수금 취소 중 오류: ${getErrorMessage(e, "수금 취소 중 오류가 발생했습니다.")}`,
          });
        }
      },
    });
  };

  // Cancel a single collection round or individual collection
  const handleCancelSingleRound = (
    estName: string,
    records: DispatchRecord[],
    roundItem: RoundBreakdownItem,
    roundIdx: number,
  ) => {
    const roundTitle =
      roundItem.label ||
      (roundItem.round ? `${roundItem.round}차 수금` : "수금");

    setConfirmConfig({
      message: `[${estName}] ${roundTitle} (${roundItem.amount.toLocaleString()}원)을 취소하고 미수로 되돌리시겠습니까?`,
      action: async () => {
        try {
          const currentRecords = records.map((r) => {
            const found = combinedRecords.find((x) => x.id === r.id);
            return found || r;
          });

          // Target the specific records that belong to this round
          let targetRecs = currentRecords;
          if (roundItem.recordIds && roundItem.recordIds.length > 0) {
            targetRecs = currentRecords.filter(
              (r) => r.id && roundItem.recordIds!.includes(r.id),
            );
          } else if (roundItem.recordId) {
            targetRecs = currentRecords.filter(
              (r) => r.id === roundItem.recordId,
            );
          } else if (roundItem.staffName) {
            targetRecs = currentRecords.filter(
              (r) => r.staffName === roundItem.staffName,
            );
          }

          if (targetRecs.length === 0) {
            targetRecs = currentRecords;
          }

          const targetHistIdx = roundItem.historyIndex;
          const updatePromises = targetRecs.map(async (r) => {
            if (!r.id) return;
            if (
              r.collectionHistory &&
              Array.isArray(r.collectionHistory) &&
              r.collectionHistory.length > 1 &&
              targetHistIdx !== undefined &&
              r.collectionHistory[targetHistIdx]
            ) {
              const newHist = r.collectionHistory.filter(
                (_, idx) => idx !== targetHistIdx,
              );
              if (newHist.length === 0) {
                const updates: Partial<DispatchRecord> = {
                  paymentMethod: "UNPAID",
                  collectedAt: null,
                  additionalCollectedAt: null,
                  collectionHistory: [],
                  isPass: false,
                  collectedAmount: undefined,
                  depositorName: null,
                  wasUnpaid: true,
                  isDispatchBoxCollection: false,
                };
                await applyRecordUpdate(r.id, updates as any);
              } else {
                const firstEntry = newHist[0];
                const lastEntry = newHist[newHist.length - 1];
                const updates: Partial<DispatchRecord> = {
                  paymentMethod: firstEntry.paymentMethod || "TRANSFER",
                  collectedAt: firstEntry.collectedAt || null,
                  additionalCollectedAt:
                    newHist.length > 1 ? lastEntry.collectedAt : null,
                  collectionHistory: newHist,
                  depositorName: firstEntry.depositorName || null,
                  collectedAmount: undefined,
                };
                await applyRecordUpdate(r.id, updates as any);
              }
            } else {
              const updates: Partial<DispatchRecord> = {
                paymentMethod: "UNPAID",
                collectedAt: null,
                additionalCollectedAt: null,
                collectionHistory: [],
                isPass: false,
                collectedAmount: undefined,
                depositorName: null,
                wasUnpaid: true,
                isDispatchBoxCollection: false,
              };
              await applyRecordUpdate(r.id, updates as any);
            }
          });

          await Promise.all(updatePromises);
        } catch (e) {
          console.error("개별 수금 취소 오류:", e);
          setAlertConfig({
            message: `수금 취소 중 오류: ${getErrorMessage(e, "수금 취소 중 오류가 발생했습니다.")}`,
          });
        }
      },
    });
  };

  // Individual staff record on-site cancel
  const handleCancelRecordCollection = (r: DispatchRecord) => {
    if (!r || !r.id) return;
    const paidAmt = r.totalAmount || 0;
    setConfirmConfig({
      message: `[${r.establishmentName} - ${r.staffName}] 수금 (${paidAmt.toLocaleString()}원)을 취소하고 미수로 되돌리시겠습니까?`,
      action: async () => {
        try {
          const updates: Partial<DispatchRecord> = {
            paymentMethod: "UNPAID",
            collectedAt: null,
            additionalCollectedAt: null,
            collectionHistory: [],
            isPass: false,
            collectedAmount: undefined,
            depositorName: null,
            wasUnpaid: true,
            isDispatchBoxCollection: false,
          };
          await applyRecordUpdate(r.id!, updates as any);
        } catch (e) {
          console.error("직원 수금 취소 오류:", e);
          setAlertConfig({
            message: `수금 취소 중 오류: ${getErrorMessage(e, "수금 취소 중 오류가 발생했습니다.")}`,
          });
        }
      },
    });
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Header & KPI Metric Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: 총 누적 미수금 */}
        <div
          onClick={() => setFilterMode("ALL_UNPAID")}
          className={cn(
            "p-4 rounded-2xl border-2 transition-all cursor-pointer shadow-xs flex flex-col justify-between",
            filterMode === "ALL_UNPAID" || filterMode === "UNPAID_ONLY"
              ? "bg-red-50/80 border-red-500 ring-2 ring-red-200"
              : "bg-white border-stone-200 hover:border-red-300",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-stone-500 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              총 누적 미수금
            </span>
            <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              {overallStats.totalUnpaidEstCount}개소 미수
            </span>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-red-600 tracking-tight">
              {overallStats.totalUnpaid.toLocaleString()}
              <span className="text-sm font-bold text-stone-600 ml-1">원</span>
            </div>
            <div className="text-[11px] font-bold text-stone-400 mt-1 flex items-center justify-between">
              <span>
                수금전무 {overallStats.zeroCollectedCount}개소
              </span>
              <span>
                감액·차액 {overallStats.shortageCount}개소
              </span>
            </div>
          </div>
        </div>

        {/* KPI 2: 금일 미수금 */}
        <div
          onClick={() => setFilterMode("TODAY_ONLY")}
          className={cn(
            "p-4 rounded-2xl border-2 transition-all cursor-pointer shadow-xs flex flex-col justify-between",
            filterMode === "TODAY_ONLY"
              ? "bg-amber-50/80 border-amber-500 ring-2 ring-amber-200"
              : "bg-white border-stone-200 hover:border-amber-300",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-stone-500 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-amber-500" />
              금일 미수금 ({selectedDate.slice(5)})
            </span>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-md">
              당일 {overallStats.todayUnpaidCount}개소
            </span>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-amber-600 tracking-tight">
              {overallStats.todayUnpaid.toLocaleString()}
              <span className="text-sm font-bold text-stone-600 ml-1">원</span>
            </div>
            <div className="text-[11px] font-bold text-stone-400 mt-1">
              오늘자 파견 발생 미수 내역
            </div>
          </div>
        </div>

        {/* KPI 3: 과거 미수금 */}
        <div
          onClick={() => setFilterMode("PAST_ONLY")}
          className={cn(
            "p-4 rounded-2xl border-2 transition-all cursor-pointer shadow-xs flex flex-col justify-between",
            filterMode === "PAST_ONLY"
              ? "bg-rose-50/80 border-rose-500 ring-2 ring-rose-200"
              : "bg-white border-stone-200 hover:border-rose-300",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-stone-500 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-rose-500" />
              과거 미수금 (이전 날짜)
            </span>
            <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded-md">
              누적 {overallStats.pastUnpaidCount}개소
            </span>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-rose-600 tracking-tight">
              {overallStats.pastUnpaid.toLocaleString()}
              <span className="text-sm font-bold text-stone-600 ml-1">원</span>
            </div>
            <div className="text-[11px] font-bold text-stone-400 mt-1">
              오늘 이전 발생 미수 총계
            </div>
          </div>
        </div>

        {/* KPI 4: 감액/차액 수금 건 */}
        <div
          onClick={() => setFilterMode("SHORTAGE_ONLY")}
          className={cn(
            "p-4 rounded-2xl border-2 transition-all cursor-pointer shadow-xs flex flex-col justify-between",
            filterMode === "SHORTAGE_ONLY"
              ? "bg-purple-50/80 border-purple-500 ring-2 ring-purple-200"
              : "bg-white border-stone-200 hover:border-purple-300",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-stone-500 flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-purple-500" />
              감액 / 차액 수금
            </span>
            <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
              {overallStats.shortageCount}개소
            </span>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-black text-purple-700 tracking-tight">
              {overallStats.shortageUnpaidAmount.toLocaleString()}
              <span className="text-sm font-bold text-stone-600 ml-1">원 미수</span>
            </div>
            <div className="text-[11px] font-bold text-stone-400 mt-1">
              수금내역 있으나 금액 불일치 ({overallStats.shortageCount}건)
            </div>
          </div>
        </div>
      </div>

      {/* Control Bar: Search, Quick Filters, Collapse All */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-stone-200 shadow-xs flex flex-col gap-3">
        {/* Search input & collapse toggle */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="업소명, 직원명, 입금자명으로 빠른 검색..."
              className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-8 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:bg-white transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 text-xs font-black cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleToggleAllExpand}
              className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95"
            >
              {allExpanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>전체 접기</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>전체 펼치기</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {/* 전체 미수 건 */}
          <button
            onClick={() => setFilterMode("ALL_UNPAID")}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer flex items-center gap-1.5 border",
              filterMode === "ALL_UNPAID"
                ? "bg-red-600 text-white border-red-700 shadow-xs"
                : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100",
            )}
          >
            <span>전체 미수 건</span>
            <span
              className={cn(
                "px-1.5 py-0.2 rounded-full text-[10px]",
                filterMode === "ALL_UNPAID"
                  ? "bg-white/20 text-white font-black"
                  : "bg-stone-200 text-stone-600",
              )}
            >
              {overallStats.totalUnpaidEstCount}
            </span>
          </button>

          {/* 미수 발생 건만 (수금 내역 전혀 없음) */}
          <button
            onClick={() => setFilterMode("UNPAID_ONLY")}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer flex items-center gap-1.5 border",
              filterMode === "UNPAID_ONLY"
                ? "bg-rose-600 text-white border-rose-700 shadow-xs"
                : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100",
            )}
          >
            <span>미수 발생 건만 (수금 없음)</span>
            <span
              className={cn(
                "px-1.5 py-0.2 rounded-full text-[10px]",
                filterMode === "UNPAID_ONLY"
                  ? "bg-white/20 text-white font-black"
                  : "bg-stone-200 text-stone-600",
              )}
            >
              {overallStats.zeroCollectedCount}
            </span>
          </button>

          {/* 감액 / 차액 수금 건 (수금 내역 있으나 금액 불일치) */}
          <button
            onClick={() => setFilterMode("SHORTAGE_ONLY")}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer flex items-center gap-1.5 border",
              filterMode === "SHORTAGE_ONLY"
                ? "bg-purple-600 text-white border-purple-700 shadow-xs"
                : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100",
            )}
          >
            <span>⚠️ 감액/차액 수금 건 (부분수금)</span>
            <span
              className={cn(
                "px-1.5 py-0.2 rounded-full text-[10px]",
                filterMode === "SHORTAGE_ONLY"
                  ? "bg-white/20 text-white font-black"
                  : "bg-stone-200 text-stone-600",
              )}
            >
              {overallStats.shortageCount}
            </span>
          </button>

          {/* 금일 미수 */}
          <button
            onClick={() => setFilterMode("TODAY_ONLY")}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer flex items-center gap-1.5 border",
              filterMode === "TODAY_ONLY"
                ? "bg-amber-600 text-white border-amber-700 shadow-xs"
                : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100",
            )}
          >
            <span>금일 미수</span>
            <span
              className={cn(
                "px-1.5 py-0.2 rounded-full text-[10px]",
                filterMode === "TODAY_ONLY"
                  ? "bg-white/20 text-white font-black"
                  : "bg-stone-200 text-stone-600",
              )}
            >
              {overallStats.todayUnpaidCount}
            </span>
          </button>

          {/* 과거 누적 미수 */}
          <button
            onClick={() => setFilterMode("PAST_ONLY")}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer flex items-center gap-1.5 border",
              filterMode === "PAST_ONLY"
                ? "bg-rose-700 text-white border-rose-800 shadow-xs"
                : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100",
            )}
          >
            <span>과거 누적 미수</span>
            <span
              className={cn(
                "px-1.5 py-0.2 rounded-full text-[10px]",
                filterMode === "PAST_ONLY"
                  ? "bg-white/20 text-white font-black"
                  : "bg-stone-200 text-stone-600",
              )}
            >
              {overallStats.pastUnpaidCount}
            </span>
          </button>

          {/* 전체 내역 (완료 포함) */}
          <button
            onClick={() => setFilterMode("ALL")}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer flex items-center gap-1.5 border",
              filterMode === "ALL"
                ? "bg-stone-900 text-white border-stone-900 shadow-xs"
                : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100",
            )}
          >
            <span>전체 내역 (완료 포함)</span>
            <span
              className={cn(
                "px-1.5 py-0.2 rounded-full text-[10px]",
                filterMode === "ALL"
                  ? "bg-white/20 text-white font-black"
                  : "bg-stone-200 text-stone-600",
              )}
            >
              {overallStats.totalEstCount}
            </span>
          </button>

          {/* 수금 완료 건만 */}
          <button
            onClick={() => setFilterMode("PAID_ONLY")}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 cursor-pointer flex items-center gap-1.5 border",
              filterMode === "PAID_ONLY"
                ? "bg-emerald-600 text-white border-emerald-700 shadow-xs"
                : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100",
            )}
          >
            <span>수금 완료 건만</span>
            <span
              className={cn(
                "px-1.5 py-0.2 rounded-full text-[10px]",
                filterMode === "PAID_ONLY"
                  ? "bg-white/20 text-white font-black"
                  : "bg-stone-200 text-stone-600",
              )}
            >
              {overallStats.paidCount}
            </span>
          </button>
        </div>
      </div>

      {/* Main List: Grouped by Date */}
      {filteredDateGroups.length === 0 ? (
        <div className="bg-white border-2 border-stone-200 rounded-3xl p-12 text-center shadow-xs">
          <div className="w-14 h-14 bg-stone-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-stone-400">
            <CheckCircle2 className="w-7 h-7 text-emerald-500" />
          </div>
          <h3 className="text-lg font-black text-stone-800">
            조건에 해당하는 미수금 내역이 없습니다.
          </h3>
          <p className="text-xs text-stone-500 font-bold mt-1">
            {searchTerm
              ? `"${searchTerm}" 검색 결과가 없습니다. 검색어를 확인해주세요.`
              : filterMode === "UNPAID_ONLY"
                ? "현재 모든 업체의 미수금이 깔끔하게 수금 완료되었습니다!"
                : "선택한 필터 조건에 해당하는 기록이 없습니다."}
          </p>
          {(searchTerm || filterMode !== "UNPAID_ONLY") && (
            <button
              onClick={() => {
                setSearchTerm("");
                setFilterMode("UNPAID_ONLY");
              }}
              className="mt-4 px-4 py-2 bg-stone-900 text-white text-xs font-bold rounded-xl hover:bg-stone-800 transition-all cursor-pointer"
            >
              필터 초기화
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {filteredDateGroups.map(([date, establishments]) => {
            const isExpanded = isDateExpanded(date);
            const dateTotalUnpaid = establishments.reduce(
              (sum, e) => sum + e.unpaidAmount,
              0,
            );
            const dateTotalRequested = establishments.reduce(
              (sum, e) => sum + e.totalRequested,
              0,
            );
            const dateTotalCollected = establishments.reduce(
              (sum, e) => sum + e.totalCollected,
              0,
            );
            const dateCardId = `unpaid-date-card-${date}`;

            return (
              <div
                id={dateCardId}
                key={date}
                className="bg-white border-2 border-stone-200 rounded-3xl overflow-hidden shadow-xs transition-all"
              >
                {/* Date Header Accordion Bar */}
                <div
                  onClick={() => toggleDateExpand(date)}
                  className="px-4 sm:px-5 py-3.5 bg-stone-50/90 border-b border-stone-200 flex flex-wrap items-center justify-between gap-2.5 cursor-pointer hover:bg-stone-100/80 transition-colors select-none"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="px-3 py-1 bg-stone-900 text-white rounded-xl flex items-center gap-1.5 shadow-2xs">
                      <Calendar className="w-3.5 h-3.5" />
                      <span className="text-xs sm:text-sm font-black tracking-tight">
                        {format(parseISO(date), "yyyy-MM-dd (eee)", {
                          locale: ko,
                        })}
                        {getRelativeDateLabel(date)}
                      </span>
                    </div>
                    <span className="text-xs font-black text-stone-500">
                      총 {establishments.length}개 업소
                    </span>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 text-xs font-black">
                      {dateTotalUnpaid > 0 ? (
                        <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-lg border border-red-200 animate-pulse">
                          미수 {dateTotalUnpaid.toLocaleString()}원
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg border border-emerald-200">
                          수금완료 (총 {dateTotalCollected.toLocaleString()}원)
                        </span>
                      )}
                    </div>

                    {/* Overall Date Capture Button */}
                    <button
                      type="button"
                      data-html2canvas-ignore="true"
                      data-capture-ignore="true"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isExpanded) {
                          toggleDateExpand(date);
                        }
                        setTimeout(() => {
                          handleCaptureEstablishment(
                            dateCardId,
                            `미수금전체_${date}`,
                            date,
                          );
                        }, 150);
                      }}
                      disabled={isCapturing === dateCardId}
                      className="px-2 py-1 bg-white hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-black shadow-2xs border border-stone-300 active:scale-95 flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap"
                      title={`${date} 전체 미수금 내역 캡쳐`}
                    >
                      <Camera className="w-3.5 h-3.5 text-stone-600" />
                      <span className="hidden sm:inline">
                        {isCapturing === dateCardId ? "캡쳐중..." : "전체캡쳐"}
                      </span>
                    </button>

                    <div
                      data-html2canvas-ignore="true"
                      data-capture-ignore="true"
                      className="text-stone-400"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Date Content: Establishments List */}
                {isExpanded && (
                  <div className="p-3 sm:p-5 space-y-4 bg-stone-100/40">
                    {establishments.map((est) => {
                      const estTotalRequested = est.totalRequested;
                      const estTotalCollected = est.totalCollected;
                      const hasAnyCollection =
                        est.records.some(
                          (r) =>
                            r.paymentMethod !== "UNPAID" ||
                            (r.collectedAmount !== undefined &&
                              r.collectedAmount > 0),
                        ) || estTotalCollected > 0;

                      const isMatch =
                        hasAnyCollection &&
                        estTotalCollected === estTotalRequested;
                      const isUnder =
                        hasAnyCollection &&
                        estTotalCollected < estTotalRequested;
                      const isOver =
                        hasAnyCollection &&
                        estTotalCollected > estTotalRequested;
                      const diff = Math.abs(
                        estTotalRequested - estTotalCollected,
                      );

                      // Calculate breakdown of rounds (1차 수금, 2차 수금, etc.)
                      const estRoundBreakdown = est.roundBreakdown;

                      const isBatchCollectingActive =
                        batchCollecting?.dateKey === date &&
                        batchCollecting?.estName === est.estName;

                      const isBatchAdditionalActive =
                        batchAdditionalCollectingKey ===
                        `${date}_${est.estName}`;

                      const cardId = `unpaid-est-card-${date}-${encodeURIComponent(est.estName).replace(/%/g, "_")}`;

                      return (
                        <div
                          id={cardId}
                          key={est.estName}
                          className={cn(
                            "rounded-2xl border-2 overflow-hidden shadow-sm transition-all bg-white",
                            isMatch
                              ? "border-emerald-500/40"
                              : isOver
                                ? "border-amber-500/40"
                                : "border-red-500/40",
                          )}
                        >
                          {/* Establishment Header Bar */}
                          <div
                            className={cn(
                              "px-3.5 sm:px-4 py-3 flex flex-col gap-2 border-b-2",
                              isMatch
                                ? "bg-emerald-50/70 border-emerald-500/20"
                                : isOver
                                  ? "bg-amber-50/70 border-amber-500/20"
                                  : "bg-red-50/70 border-red-500/20",
                            )}
                          >
                            {/* Top row: Name & Action Buttons */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 w-full min-w-0">
                              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-wrap">
                                <Building2
                                  className={cn(
                                    "w-5 h-5 shrink-0",
                                    isMatch
                                      ? "text-emerald-600"
                                      : isOver
                                        ? "text-amber-600"
                                        : "text-red-600",
                                  )}
                                />
                                <span className="font-black text-stone-900 text-base sm:text-lg whitespace-nowrap">
                                  {est.estName}
                                </span>
                                <span className="text-xs font-black text-stone-400 shrink-0">
                                  ({est.records.length}건)
                                </span>
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-white/90 text-stone-800 border border-stone-300 rounded-lg text-xs font-black shrink-0 shadow-2xs">
                                  <Calendar className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                                  <span>
                                    {format(parseISO(date), "yyyy-MM-dd (eee)", {
                                      locale: ko,
                                    })}
                                  </span>
                                </span>
                              </div>

                              {/* Batch Action Buttons & Capture Button */}
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
                                {isBatchCollectingActive ? (
                                  <button
                                    data-html2canvas-ignore="true"
                                    data-capture-ignore="true"
                                    onClick={() => setBatchCollecting(null)}
                                    className="px-2.5 py-1.5 bg-stone-200 text-stone-700 rounded-xl text-xs font-black shadow-2xs hover:bg-stone-300 transition-all cursor-pointer"
                                  >
                                    ✕ 닫기
                                  </button>
                                ) : (
                                  <>
                                    {est.records.some(
                                      (r) => r.paymentMethod === "UNPAID",
                                    ) && (
                                      <>
                                        <button
                                          data-html2canvas-ignore="true"
                                          data-capture-ignore="true"
                                          onClick={() =>
                                            setBatchCollecting({
                                              dateKey: date,
                                              estName: est.estName,
                                              method: "CASH",
                                            })
                                          }
                                          className="px-2 sm:px-2.5 py-1 sm:py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs active:scale-95 flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap"
                                        >
                                          현금전체
                                        </button>
                                        <button
                                          data-html2canvas-ignore="true"
                                          data-capture-ignore="true"
                                          onClick={() =>
                                            setBatchCollecting({
                                              dateKey: date,
                                              estName: est.estName,
                                              method: "TRANSFER",
                                            })
                                          }
                                          className="px-2 sm:px-2.5 py-1 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-xs active:scale-95 flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap"
                                        >
                                          계좌전체
                                        </button>
                                      </>
                                    )}

                                    <button
                                      type="button"
                                      data-html2canvas-ignore="true"
                                      data-capture-ignore="true"
                                      onClick={() => {
                                        const key = `${date}_${est.estName}`;
                                        setBatchAdditionalCollectingKey(
                                          batchAdditionalCollectingKey === key
                                            ? null
                                            : key,
                                        );
                                      }}
                                      className="px-2 sm:px-2.5 py-1 sm:py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black shadow-xs active:scale-95 flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap"
                                    >
                                      ➕ 추가수금/조정
                                    </button>
                                  </>
                                )}

                                {(hasAnyCollection ||
                                  estTotalCollected > 0 ||
                                  est.records.some(
                                    (r) =>
                                      r.paymentMethod !== "UNPAID" ||
                                      (r.collectionHistory &&
                                        r.collectionHistory.length > 0) ||
                                      (r.collectedAmount !== undefined &&
                                        r.collectedAmount > 0),
                                  )) && (
                                  <button
                                    data-html2canvas-ignore="true"
                                    data-capture-ignore="true"
                                    onClick={() =>
                                      handleEstablishmentAllCancel(
                                        est.estName,
                                        est.records,
                                      )
                                    }
                                    className="px-2 sm:px-2.5 py-1 sm:py-1.5 bg-stone-100 hover:bg-red-50 hover:text-red-700 text-stone-600 rounded-xl text-xs font-black shadow-xs border border-stone-200 active:scale-95 flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap"
                                  >
                                    전체 취소
                                  </button>
                                )}

                                {/* Capture Badge/Button */}
                                <button
                                  type="button"
                                  data-html2canvas-ignore="true"
                                  data-capture-ignore="true"
                                  onClick={() =>
                                    handleCaptureEstablishment(
                                      cardId,
                                      est.estName,
                                      date,
                                    )
                                  }
                                  disabled={isCapturing === cardId}
                                  className="px-2 sm:px-2.5 py-1 sm:py-1.5 bg-white hover:bg-stone-100 text-stone-800 rounded-xl text-xs font-black shadow-2xs border border-stone-300 active:scale-95 flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap"
                                  title={`${est.estName} (${date}) 미수금 내역 이미지 캡쳐 및 공유`}
                                >
                                  <Camera className="w-3.5 h-3.5 text-stone-600 shrink-0" />
                                  <span>
                                    {isCapturing === cardId ? "캡쳐중..." : "캡쳐"}
                                  </span>
                                </button>
                              </div>
                            </div>

                            {/* Bottom row: Balance Badges & Round Breakdown */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1">
                              {isMatch && (
                                <span className="whitespace-nowrap shrink-0 px-2.5 py-1 bg-emerald-600 text-white text-xs rounded-lg font-black shadow-xs">
                                  수금완료 (일치)
                                </span>
                              )}
                              {isUnder && (
                                <span className="whitespace-nowrap shrink-0 px-2.5 py-1 bg-red-600 text-white text-xs rounded-lg font-black shadow-xs animate-pulse">
                                  미수 (덜 받음: -{diff.toLocaleString()}원)
                                </span>
                              )}
                              {isOver && (
                                <span className="whitespace-nowrap shrink-0 px-2.5 py-1 bg-amber-600 text-white text-xs rounded-lg font-black shadow-xs">
                                  초과수금 (+{diff.toLocaleString()}원)
                                </span>
                              )}
                              {!hasAnyCollection && est.unpaidAmount > 0 && (
                                <span className="font-black text-red-700 text-xs bg-red-100 border border-red-200 px-2 py-0.5 rounded-lg whitespace-nowrap shrink-0">
                                  미수금: {est.unpaidAmount.toLocaleString()}원
                                </span>
                              )}

                              <div className="flex items-center gap-1.5 text-xs font-bold text-stone-500 whitespace-nowrap shrink-0">
                                <span>총 청구:</span>
                                <span className="font-black text-stone-900">
                                  {estTotalRequested.toLocaleString()}원
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 text-xs font-bold text-stone-500 whitespace-nowrap shrink-0">
                                <span>총 수금:</span>
                                <span className="font-black text-emerald-600">
                                  {estTotalCollected.toLocaleString()}원
                                </span>
                              </div>

                              {estRoundBreakdown.length > 0 && (
                                <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                                  {estRoundBreakdown.map((rd, rdIdx) => (
                                    <span
                                      key={`${rd.label}-${rd.round}-${rdIdx}`}
                                      className={cn(
                                        "px-2.5 py-1 rounded-lg text-xs font-black border whitespace-nowrap shrink-0 shadow-2xs inline-flex items-center gap-1.5",
                                        rd.isOnSite
                                          ? "bg-teal-50 text-teal-950 border-teal-300"
                                          : rd.round === 1
                                            ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                                            : "bg-amber-50 text-amber-950 border-amber-300",
                                      )}
                                    >
                                      <span
                                        className={cn(
                                          "px-1.5 py-0.5 rounded text-[10px] font-black",
                                          rd.isOnSite
                                            ? "bg-teal-200/90 text-teal-950"
                                            : rd.round === 1
                                              ? "bg-emerald-200/80 text-emerald-900"
                                              : "bg-amber-200/80 text-amber-950",
                                        )}
                                      >
                                        {rd.isOnSite ? "현장" : `${rd.round}차`}
                                      </span>
                                      {rd.dateStr && (
                                        <span className="text-[11px] font-bold text-stone-600">
                                          {rd.dateStr}
                                        </span>
                                      )}
                                      <span className="font-black text-stone-900">
                                        {rd.amount.toLocaleString()}원
                                      </span>
                                      {rd.paymentMethod && (
                                        <span className="text-[10px] font-bold text-stone-500">
                                          ({rd.paymentMethod === "TRANSFER" ? "계좌" : "현금"})
                                        </span>
                                      )}
                                      {rd.depositorName && (
                                        <span className="text-[10px] font-black text-blue-600">
                                          [{rd.depositorName}]
                                        </span>
                                      )}
                                      {rd.staffName && (
                                        <span className="text-[10px] font-bold text-teal-800">
                                          ({rd.staffName})
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        data-html2canvas-ignore="true"
                                        data-capture-ignore="true"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleCancelSingleRound(
                                            est.estName,
                                            est.records,
                                            rd,
                                            rdIdx,
                                          );
                                        }}
                                        className="ml-0.5 p-0.5 rounded-full hover:bg-black/10 text-stone-400 hover:text-red-700 transition-colors cursor-pointer"
                                        title={`${rd.label || (rd.round ? `${rd.round}차` : "수금")} 취소`}
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Batch Collect Form Modal / Inline Box */}
                          {isBatchCollectingActive && (
                            <div
                              data-html2canvas-ignore="true"
                              data-capture-ignore="true"
                              className="p-4 bg-stone-50 border-b border-stone-200"
                            >
                              <BatchCollectForm
                                initialMethod={batchCollecting.method}
                                totalUnpaidAmount={est.records
                                  .filter((r) => r.paymentMethod === "UNPAID")
                                  .reduce(
                                    (sum, r) => sum + (r.totalAmount || 0),
                                    0,
                                  )}
                                onCollect={(
                                  method,
                                  dateStr,
                                  timeStr,
                                  depositorName,
                                  customAmount,
                                ) => {
                                  handleBatchCollect(
                                    est.records,
                                    method,
                                    dateStr,
                                    timeStr,
                                    false,
                                    depositorName,
                                    false,
                                    customAmount,
                                  );
                                }}
                                onPass={(method) =>
                                  handleBatchCollect(
                                    est.records,
                                    method,
                                    "",
                                    "",
                                    true,
                                  )
                                }
                                onCancel={() => setBatchCollecting(null)}
                              />
                            </div>
                          )}

                          {/* Batch Additional Collect Form */}
                          {isBatchAdditionalActive && (
                            <div
                              data-html2canvas-ignore="true"
                              data-capture-ignore="true"
                              className="p-4 border-b border-amber-200 bg-amber-50/60"
                            >
                              <EstablishmentAdditionalCollectForm
                                estName={est.estName}
                                originalTotal={estTotalRequested}
                                currentCollected={estTotalCollected}
                                onCollectAdditional={(
                                  method,
                                  additionalAmount,
                                  depositorName,
                                  collectedDate,
                                  collectedTime,
                                ) => {
                                  handleAdditionalCollect(
                                    est.estName,
                                    est.records,
                                    method,
                                    additionalAmount,
                                    depositorName,
                                    collectedDate,
                                    collectedTime,
                                  );
                                }}
                                onCancel={() =>
                                  setBatchAdditionalCollectingKey(null)
                                }
                              />
                            </div>
                          )}

                          {/* Dispatch Records List inside Establishment */}
                          <div className="p-3 sm:p-4 space-y-2.5 divide-y divide-stone-100">
                            {est.records.map((r, rIdx) => {
                              const { isDirect } =
                                formatStaffNameComponents(r.staffName);

                              const startTimeStr = r.startTime
                                ? format(
                                    r.startTime.toDate
                                      ? r.startTime.toDate()
                                      : new Date(r.startTime),
                                    "HH:mm",
                                  )
                                : "";
                              const endTimeStr = r.endTime
                                ? format(
                                    r.endTime.toDate
                                      ? r.endTime.toDate()
                                      : new Date(r.endTime),
                                    "HH:mm",
                                  )
                                : "";

                              const durationHours = r.durationHours || 0;
                              const unitCount = durationHours
                                .toFixed(1)
                                .replace(/\.0$/, "");

                              // Exact duration calculation (X시간 Y분)
                              let durationFormatted = "";
                              if (r.startTime && r.endTime) {
                                const sDate = r.startTime.toDate
                                  ? r.startTime.toDate()
                                  : new Date(r.startTime);
                                const eDate = r.endTime.toDate
                                  ? r.endTime.toDate()
                                  : new Date(r.endTime);
                                const diffMs = eDate.getTime() - sDate.getTime();
                                if (diffMs > 0) {
                                  const totalMinutes = Math.floor(diffMs / 60000);
                                  const hrs = Math.floor(totalMinutes / 60);
                                  const mins = totalMinutes % 60;
                                  if (hrs > 0 && mins > 0) {
                                    durationFormatted = `${hrs}시간 ${mins}분`;
                                  } else if (hrs > 0) {
                                    durationFormatted = `${hrs}시간`;
                                  } else if (mins > 0) {
                                    durationFormatted = `${mins}분`;
                                  }
                                }
                              } else if (durationHours > 0) {
                                const totalMinutes = Math.round(durationHours * 60);
                                const hrs = Math.floor(totalMinutes / 60);
                                const mins = totalMinutes % 60;
                                if (hrs > 0 && mins > 0) {
                                  durationFormatted = `${hrs}시간 ${mins}분`;
                                } else if (hrs > 0) {
                                  durationFormatted = `${hrs}시간`;
                                } else if (mins > 0) {
                                  durationFormatted = `${mins}분`;
                                }
                              }

                              return (
                                <div
                                  key={r.id || `${r.staffName}-${rIdx}`}
                                  className="pt-2.5 first:pt-0 flex items-center justify-between gap-3"
                                >
                                  {/* Left: Staff Info & Work Time */}
                                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-black text-stone-900 text-sm sm:text-base whitespace-nowrap">
                                        {r.staffName}
                                      </span>

                                      <span
                                        className={cn(
                                          "text-[10px] font-black px-1.5 py-0.2 rounded text-white shadow-2xs whitespace-nowrap shrink-0",
                                          r.systemType === "TABLE"
                                            ? "bg-emerald-600"
                                            : r.systemType === "PUBLIC"
                                              ? "bg-blue-600"
                                              : "bg-purple-600",
                                        )}
                                      >
                                        {r.systemType === "TABLE"
                                          ? "커피"
                                          : r.systemType === "PUBLIC"
                                            ? "퍼블릭"
                                            : "하퍼"}
                                      </span>

                                      {isDirect ? (
                                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded whitespace-nowrap shrink-0">
                                          직속
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-bold text-stone-600 bg-stone-100 px-1.5 py-0.2 rounded whitespace-nowrap shrink-0">
                                          위탁
                                        </span>
                                      )}

                                      {/* Individual staff collection status: ONLY display on-site collection history/status */}
                                      {(() => {
                                        if (r.isPass) {
                                          return (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-black text-stone-700 bg-stone-100 border border-stone-300 px-2 py-0.5 rounded-md shadow-2xs whitespace-nowrap shrink-0">
                                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-stone-500 opacity-80" />
                                              <span>패스</span>
                                              <button
                                                type="button"
                                                data-html2canvas-ignore="true"
                                                data-capture-ignore="true"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleCancelRecordCollection(r);
                                                }}
                                                className="ml-0.5 p-0.5 rounded hover:bg-black/10 text-stone-400 hover:text-red-700 transition-colors cursor-pointer"
                                                title="패스 수금 취소 (미수로 되돌리기)"
                                              >
                                                <X className="w-3 h-3" />
                                              </button>
                                            </span>
                                          );
                                        }

                                        const isOnSiteOrDirectBox =
                                          r.isDispatchBoxCollection === true ||
                                          (!r.wasUnpaid && (!r.collectionHistory || r.collectionHistory.length === 0));

                                        // If this record was NOT an on-site collection (e.g. collected via unpaid tab batch 1차/2차),
                                        // do NOT display any badge on the individual staff row!
                                        if (!isOnSiteOrDirectBox) {
                                          return null;
                                        }

                                        const history = getRecordCollectionHistory(r);
                                        const onSiteEntries = history.filter((entry, hIdx) => {
                                          return (
                                            hIdx === 0 &&
                                            (!entry.note || entry.note.includes("현장") || !entry.note.includes("추가수금"))
                                          );
                                        });

                                        if (onSiteEntries.length > 0) {
                                          return (
                                            <div className="flex items-center gap-1 flex-wrap shrink-0">
                                              {onSiteEntries.map((entry, hIdx) => {
                                                let timeStr = "";
                                                if (entry.collectedAt) {
                                                  try {
                                                    const cd = entry.collectedAt.toDate
                                                      ? entry.collectedAt.toDate()
                                                      : new Date(entry.collectedAt);
                                                    timeStr = format(cd, "HH:mm");
                                                  } catch {}
                                                }

                                                const isTransfer = entry.paymentMethod === "TRANSFER";
                                                const label = isTransfer ? "현장 계좌수금" : "현장 현금수금";

                                                return (
                                                  <span
                                                    key={hIdx}
                                                    className={cn(
                                                      "inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-md shadow-2xs border whitespace-nowrap shrink-0",
                                                      isTransfer
                                                        ? "text-blue-800 bg-blue-100/90 border-blue-300"
                                                        : "text-emerald-800 bg-emerald-100/90 border-emerald-300"
                                                    )}
                                                  >
                                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 opacity-80" />
                                                    <span>{label}</span>
                                                    {timeStr && (
                                                      <span className="text-[10px] font-bold opacity-80">
                                                        ({timeStr})
                                                      </span>
                                                    )}
                                                    {entry.amount !== undefined && entry.amount !== r.totalAmount && (
                                                      <span className="text-[10px] font-black">
                                                        {entry.amount.toLocaleString()}원
                                                      </span>
                                                    )}
                                                    {entry.depositorName && (
                                                      <span className="text-[10px] font-black text-blue-900">
                                                        [{entry.depositorName}]
                                                      </span>
                                                    )}
                                                    <button
                                                      type="button"
                                                      data-html2canvas-ignore="true"
                                                      data-capture-ignore="true"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleCancelRecordCollection(r);
                                                      }}
                                                      className="ml-0.5 p-0.5 rounded hover:bg-black/10 text-stone-400 hover:text-red-700 transition-colors cursor-pointer"
                                                      title="현장 수금 취소 (미수로 되돌리기)"
                                                    >
                                                      <X className="w-3 h-3" />
                                                    </button>
                                                  </span>
                                                );
                                              })}
                                            </div>
                                          );
                                        }

                                        if (r.paymentMethod === "CASH") {
                                          return (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-2 py-0.5 rounded-md shadow-2xs whitespace-nowrap shrink-0">
                                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                              <span>현장 현금수금</span>
                                              {r.collectedAt && (
                                                <span className="text-[10px] text-emerald-700 font-bold">
                                                  ({(() => {
                                                    try {
                                                      const cd = r.collectedAt.toDate
                                                        ? r.collectedAt.toDate()
                                                        : new Date(r.collectedAt);
                                                      return format(cd, "HH:mm");
                                                    } catch {
                                                      return "";
                                                    }
                                                  })()})
                                                </span>
                                              )}
                                              <button
                                                type="button"
                                                data-html2canvas-ignore="true"
                                                data-capture-ignore="true"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleCancelRecordCollection(r);
                                                }}
                                                className="ml-0.5 p-0.5 rounded hover:bg-black/10 text-stone-400 hover:text-red-700 transition-colors cursor-pointer"
                                                title="현장 현금수금 취소 (미수로 되돌리기)"
                                              >
                                                <X className="w-3 h-3" />
                                              </button>
                                            </span>
                                          );
                                        }

                                        if (r.paymentMethod === "TRANSFER") {
                                          return (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-black text-blue-800 bg-blue-100/90 border border-blue-300 px-2 py-0.5 rounded-md shadow-2xs whitespace-nowrap shrink-0">
                                              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                              <span>현장 계좌수금</span>
                                              {r.collectedAt && (
                                                <span className="text-[10px] text-blue-700 font-bold">
                                                  ({(() => {
                                                    try {
                                                      const cd = r.collectedAt.toDate
                                                        ? r.collectedAt.toDate()
                                                        : new Date(r.collectedAt);
                                                      return format(cd, "HH:mm");
                                                    } catch {
                                                      return "";
                                                    }
                                                  })()})
                                                </span>
                                              )}
                                              {r.depositorName && (
                                                <span className="text-[10px] text-blue-900 font-black">
                                                  [{r.depositorName}]
                                                </span>
                                              )}
                                              <button
                                                type="button"
                                                data-html2canvas-ignore="true"
                                                data-capture-ignore="true"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleCancelRecordCollection(r);
                                                }}
                                                className="ml-0.5 p-0.5 rounded hover:bg-black/10 text-stone-400 hover:text-red-700 transition-colors cursor-pointer"
                                                title="현장 계좌수금 취소 (미수로 되돌리기)"
                                              >
                                                <X className="w-3 h-3" />
                                              </button>
                                            </span>
                                          );
                                        }

                                        return null;
                                      })()}

                                      <span className="font-black text-sm ml-auto sm:ml-0 text-stone-900 whitespace-nowrap shrink-0">
                                        {(r.totalAmount || 0).toLocaleString()}원
                                      </span>
                                    </div>

                                    {/* Work info chip */}
                                    <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-stone-500 font-bold whitespace-nowrap flex-nowrap shrink-0">
                                      <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
                                        <Clock className="w-3 h-3 text-stone-400 shrink-0" />
                                        <span className="whitespace-nowrap">
                                          {startTimeStr && endTimeStr
                                            ? `${startTimeStr} ~ ${endTimeStr}`
                                            : "시간 미기록"}
                                        </span>
                                        {durationFormatted && (
                                          <span className="text-stone-600 font-bold whitespace-nowrap">
                                            ({durationFormatted})
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-stone-300 shrink-0">•</span>
                                      <span className="text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-black whitespace-nowrap shrink-0 inline-flex items-center">
                                        {unitCount}개
                                      </span>
                                    </div>
                                  </div>

                                  {/* Right: Optional Edit Button */}
                                  {onEditRecord && (
                                    <div
                                      data-html2canvas-ignore="true"
                                      data-capture-ignore="true"
                                      className="flex items-center shrink-0"
                                    >
                                      <button
                                        onClick={() => onEditRecord(r)}
                                        className="px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                      >
                                        수정
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Internal Modals */}
      <AnimatePresence>
        {confirmConfig && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmConfig(null)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 text-center"
            >
              <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-stone-900 mb-2">확인</h3>
              <p className="text-sm text-stone-600 mb-6 leading-relaxed whitespace-pre-line font-medium">
                {confirmConfig.message}
              </p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setConfirmConfig(null)}
                  className="flex-1 py-2.5 bg-stone-100 text-stone-700 rounded-xl font-black text-xs hover:bg-stone-200 transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  onClick={async () => {
                    const act = confirmConfig.action;
                    setConfirmConfig(null);
                    await act();
                  }}
                  className="flex-1 py-2.5 bg-stone-900 text-white rounded-xl font-black text-xs hover:bg-stone-800 transition-colors cursor-pointer"
                >
                  확인
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {alertConfig && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAlertConfig(null)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 text-center"
            >
              <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-stone-900 mb-2">안내</h3>
              <p className="text-sm text-stone-600 mb-6 leading-relaxed whitespace-pre-line font-medium">
                {alertConfig.message}
              </p>
              <button
                onClick={() => setAlertConfig(null)}
                className="w-full py-2.5 bg-stone-900 text-white rounded-xl font-black text-xs hover:bg-stone-800 transition-colors cursor-pointer"
              >
                확인
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
