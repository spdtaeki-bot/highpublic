import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, subDays, subHours } from "date-fns";
import { DispatchRecord, PaymentMethod, CollectionHistoryEntry } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 영업일 기준 계산:
 * 영업일은 당일 18:00 (오후 6시)부터 익일 17:59 (오후 5시 59분)까지를 1영업일로 처리합니다.
 * 예: 수요일 18:00 ~ 목요일 17:59 => 수요일 영업일
 * 새벽(00:00~17:59)에 등록/진행된 파견은 전일 날짜(수요일)로 자동 귀속됩니다.
 */
export function getRecordBusinessDate(r: Partial<DispatchRecord> | any): string {
  if (!r) return format(new Date(), "yyyy-MM-dd");

  // 1. startTime이 있는 경우 실제 파견 시작 시간 기준으로 18:00 영업일 판별
  if (r.startTime) {
    try {
      const startObj = r.startTime.toDate
        ? r.startTime.toDate()
        : new Date(r.startTime);
      if (startObj instanceof Date && !isNaN(startObj.getTime())) {
        const h = startObj.getHours();
        if (h < 18) {
          return format(subDays(startObj, 1), "yyyy-MM-dd");
        }
        return format(startObj, "yyyy-MM-dd");
      }
    } catch {}
  }

  // 2. r.date가 유효한 YYYY-MM-DD 형태인 경우
  if (r.date && typeof r.date === "string" && r.date.length === 10) {
    return r.date;
  }

  // 3. createdAt이 있는 경우
  if (r.createdAt) {
    try {
      const createdObj = r.createdAt.toDate
        ? r.createdAt.toDate()
        : new Date(r.createdAt);
      if (createdObj instanceof Date && !isNaN(createdObj.getTime())) {
        const h = createdObj.getHours();
        if (h < 18) {
          return format(subDays(createdObj, 1), "yyyy-MM-dd");
        }
        return format(createdObj, "yyyy-MM-dd");
      }
    } catch {}
  }

  return r.date || format(new Date(), "yyyy-MM-dd");
}

export function getCurrentBusinessDate(now: Date = new Date()): string {
  if (now.getHours() < 18) {
    return format(subDays(now, 1), "yyyy-MM-dd");
  }
  return format(now, "yyyy-MM-dd");
}

export interface RoundBreakdownItem {
  round: number;
  label: string;
  amount: number;
  dateStr: string;
  paymentMethod?: PaymentMethod;
  depositorName?: string;
  staffName?: string;
  isOnSite?: boolean;
  isDispatchBox?: boolean;
}

export interface EstablishmentCollectionResult {
  totalRequested: number;
  totalCollected: number;
  unpaidAmount: number;
  hasShortage: boolean;
  isFullyPaid: boolean;
  roundBreakdown: RoundBreakdownItem[];
  isBatchCollection: boolean;
}

export function getRecordCollectionHistory(
  r: Partial<DispatchRecord>,
): CollectionHistoryEntry[] {
  if (!r) return [];

  // If explicit collectionHistory exists and is non-empty, use it directly
  if (
    r.collectionHistory &&
    Array.isArray(r.collectionHistory) &&
    r.collectionHistory.length > 0
  ) {
    return r.collectionHistory.filter(
      (e) => e && (e.amount !== undefined || e.collectedAt),
    );
  }

  // Otherwise synthesize from single-record fields
  const targetTotal =
    r.paymentMethod !== "UNPAID" && r.collectedAmount !== undefined
      ? r.collectedAmount
      : r.paymentMethod !== "UNPAID"
        ? r.totalAmount || 0
        : 0;

  if (targetTotal <= 0 && (!r.paymentMethod || r.paymentMethod === "UNPAID")) {
    return [];
  }

  const result: CollectionHistoryEntry[] = [];
  if (r.collectedAt) {
    result.push({
      collectedAt: r.collectedAt,
      amount:
        r.collectedAmount !== undefined
          ? r.collectedAmount
          : r.totalAmount || 0,
      paymentMethod:
        r.paymentMethod && r.paymentMethod !== "UNPAID"
          ? r.paymentMethod
          : undefined,
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
      const firstAmt = result.length > 0 ? result[0].amount || 0 : 0;
      const diffAmt = Math.max(0, targetTotal - firstAmt);
      if (diffAmt > 0) {
        result.push({
          collectedAt: r.additionalCollectedAt,
          amount: diffAmt,
          paymentMethod:
            r.paymentMethod && r.paymentMethod !== "UNPAID"
              ? r.paymentMethod
              : undefined,
          depositorName: r.depositorName,
          note: "2차 추가수금",
        });
      }
    }
  }

  return result;
}

export function calculateEstablishmentCollection(
  records: DispatchRecord[],
): EstablishmentCollectionResult {
  if (!records || records.length === 0) {
    return {
      totalRequested: 0,
      totalCollected: 0,
      unpaidAmount: 0,
      hasShortage: false,
      isFullyPaid: false,
      roundBreakdown: [],
      isBatchCollection: false,
    };
  }

  const totalRequested = records.reduce(
    (sum, r) => sum + (r.totalAmount || 0),
    0,
  );

  const formatDateHelper = (raw: any): string => {
    if (!raw) return "";
    try {
      const d = raw.toDate ? raw.toDate() : new Date(raw);
      if (!isNaN(d.getTime())) {
        return format(d, "MM/dd HH:mm");
      }
    } catch {}
    return "";
  };

  const getTimestampHelper = (raw: any): number => {
    if (!raw) return 0;
    try {
      if (raw.toMillis) return raw.toMillis();
      if (raw.toDate) return raw.toDate().getTime();
      if (raw.seconds) return raw.seconds * 1000;
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d.getTime();
    } catch {}
    return 0;
  };

  // Helper to compute collected amount for an individual record
  const getRecCollected = (r: DispatchRecord): number => {
    if (
      r.collectionHistory &&
      Array.isArray(r.collectionHistory) &&
      r.collectionHistory.length > 0
    ) {
      return r.collectionHistory.reduce((s, e) => s + (e.amount || 0), 0);
    }
    if (r.paymentMethod && r.paymentMethod !== "UNPAID") {
      return r.collectedAmount !== undefined && r.collectedAmount >= 0
        ? r.collectedAmount
        : (r.totalAmount || 0);
    }
    if (r.collectedAmount !== undefined && r.collectedAmount > 0) {
      return r.collectedAmount;
    }
    return 0;
  };

  // 1. Check if all records are completely unpaid
  const isAllUnpaid = records.every(
    (r) =>
      (r.paymentMethod === "UNPAID" || !r.paymentMethod) &&
      (!r.collectionHistory || r.collectionHistory.length === 0) &&
      (!r.collectedAmount || r.collectedAmount <= 0) &&
      !r.collectedAt,
  );

  if (isAllUnpaid) {
    return {
      totalRequested,
      totalCollected: 0,
      unpaidAmount: totalRequested,
      hasShortage: false,
      isFullyPaid: false,
      roundBreakdown: [],
      isBatchCollection: records.length > 1,
    };
  }

  const recordsWithHistory = records.filter(
    (r) =>
      r.collectionHistory &&
      Array.isArray(r.collectionHistory) &&
      r.collectionHistory.length > 0,
  );

  // Determine if records share an Establishment-Level batch history
  // An establishment-level batch history is when records share an IDENTICAL collection history array
  // whose total represents the whole establishment amount.
  let isEstablishmentBatchHistory = false;
  let sharedBatchHistory: CollectionHistoryEntry[] = [];

  if (records.length === 1) {
    if (recordsWithHistory.length === 1) {
      isEstablishmentBatchHistory = true;
      sharedBatchHistory = recordsWithHistory[0].collectionHistory!;
    }
  } else if (recordsWithHistory.length > 1) {
    const firstHist = recordsWithHistory[0].collectionHistory!;
    const allIdentical = recordsWithHistory.every((r) => {
      const h = r.collectionHistory!;
      if (h.length !== firstHist.length) return false;
      return h.every(
        (entry, i) =>
          entry.amount === firstHist[i]?.amount &&
          entry.note === firstHist[i]?.note &&
          entry.paymentMethod === firstHist[i]?.paymentMethod,
      );
    });

    if (allIdentical && recordsWithHistory.length === records.length) {
      isEstablishmentBatchHistory = true;
      sharedBatchHistory = firstHist;
    }
  }

  let totalCollected = 0;
  let roundBreakdown: RoundBreakdownItem[] = [];

  if (isEstablishmentBatchHistory && sharedBatchHistory.length > 0) {
    roundBreakdown = sharedBatchHistory.map((entry, idx) => {
      let roundNum = idx + 1;
      if (entry.note) {
        const match = entry.note.match(/(\d+)차/);
        if (match) roundNum = parseInt(match[1], 10);
      }
      return {
        round: roundNum,
        label: entry.note || `${roundNum}차 수금`,
        amount: entry.amount || 0,
        dateStr: formatDateHelper(entry.collectedAt),
        paymentMethod: entry.paymentMethod,
        depositorName: entry.depositorName,
      };
    });
    totalCollected = roundBreakdown.reduce((s, x) => s + (x.amount || 0), 0);
  } else {
    // Individual record collections
    totalCollected = records.reduce((sum, r) => sum + getRecCollected(r), 0);

    interface CollectionEventItem {
      amount: number;
      timestamp: number;
      dateStr: string;
      paymentMethod?: PaymentMethod;
      depositorName?: string;
      label?: string;
      staffName?: string;
      isOnSite?: boolean;
      isDispatchBox?: boolean;
    }

    const events: CollectionEventItem[] = [];

    records.forEach((r) => {
      const hist = getRecordCollectionHistory(r);
      const isRecordDirectBox =
        r.isDispatchBoxCollection === true ||
        (!r.wasUnpaid && (!r.collectionHistory || r.collectionHistory.length === 0));

      if (hist.length > 0) {
        hist.forEach((entry, idx) => {
          if ((entry.amount || 0) > 0) {
            const isEntryOnSite =
              isRecordDirectBox &&
              idx === 0 &&
              (!entry.note || entry.note.includes("현장") || !entry.note.includes("추가수금"));

            events.push({
              amount: entry.amount || 0,
              timestamp: getTimestampHelper(entry.collectedAt),
              dateStr: formatDateHelper(entry.collectedAt),
              paymentMethod: entry.paymentMethod,
              depositorName: entry.depositorName,
              label: entry.note,
              staffName: r.staffName,
              isOnSite: isEntryOnSite,
              isDispatchBox: isRecordDirectBox,
            });
          }
        });
      } else {
        const paid = getRecCollected(r);
        if (paid > 0) {
          events.push({
            amount: paid,
            timestamp: getTimestampHelper(
              r.collectedAt ||
                (r as any).updatedAt ||
                (r as any).createdAt,
            ),
            dateStr: formatDateHelper(
              r.collectedAt ||
                (r as any).updatedAt ||
                (r as any).createdAt,
            ),
            paymentMethod: r.paymentMethod,
            depositorName: r.depositorName,
            staffName: r.staffName,
            isOnSite: isRecordDirectBox,
            isDispatchBox: isRecordDirectBox,
          });
        }
      }
    });

    // Sort all collection events chronologically by timestamp
    events.sort((a, b) => a.timestamp - b.timestamp);

    // Group only events that occurred at the exact same minute with identical paymentMethod, depositor, and onSite status
    const groupedEvents: CollectionEventItem[] = [];
    events.forEach((ev) => {
      const existing = ev.dateStr
        ? groupedEvents.find(
            (g) =>
              g.dateStr === ev.dateStr &&
              g.paymentMethod === ev.paymentMethod &&
              (g.depositorName || "") === (ev.depositorName || "") &&
              Boolean(g.isOnSite) === Boolean(ev.isOnSite),
          )
        : null;

      if (existing) {
        existing.amount += ev.amount;
        if (ev.staffName && !existing.staffName?.includes(ev.staffName)) {
          existing.staffName = existing.staffName
            ? `${existing.staffName}, ${ev.staffName}`
            : ev.staffName;
        }
      } else {
        groupedEvents.push({ ...ev });
      }
    });

    // Determine round numbers and labels:
    // On-site collections are labeled "현장" (or with staffName), non-onsite collections count rounds (1차, 2차...)
    let roundCounter = 0;
    roundBreakdown = groupedEvents.map((ev) => {
      let isRound = false;
      let label = "";

      if (ev.isOnSite) {
        label = "현장";
      } else {
        roundCounter++;
        isRound = true;
        label = ev.label && ev.label.includes("차") ? ev.label : `${roundCounter}차`;
      }

      return {
        round: isRound ? roundCounter : 0,
        label,
        amount: ev.amount,
        dateStr: ev.dateStr,
        paymentMethod: ev.paymentMethod,
        depositorName: ev.depositorName,
        staffName: ev.staffName,
        isOnSite: ev.isOnSite,
        isDispatchBox: ev.isDispatchBox,
      };
    });
  }

  const unpaidAmount = Math.max(0, totalRequested - totalCollected);

  return {
    totalRequested,
    totalCollected,
    unpaidAmount,
    hasShortage: totalCollected > 0 && totalCollected < totalRequested,
    isFullyPaid: totalCollected >= totalRequested && totalRequested > 0,
    roundBreakdown,
    isBatchCollection: isEstablishmentBatchHistory || records.length > 1,
  };
}

export function formatStaffNameComponents(fullName: string) {
  if (!fullName) return { main4: "", fullName: "", category: "", namePart: "", affiliation: "직속", isDirect: true };

  const trimmed = fullName.trim();
  const cleanNoSpace = trimmed.replace(/\s+/g, "");

  // 1. If 4 characters or fewer (e.g. "하퍼 요셉" -> clean: "하퍼요셉" 4자) -> 직속직원
  if (cleanNoSpace.length <= 4) {
    let category = "커피";
    let namePart = cleanNoSpace;
    if (cleanNoSpace.startsWith("하퍼") || cleanNoSpace.startsWith("하_")) {
      category = "하퍼";
      namePart = cleanNoSpace.replace(/^하[퍼_]?/, "");
    } else if (cleanNoSpace.startsWith("퍼블릭") || cleanNoSpace.startsWith("퍼_")) {
      category = "퍼블릭";
      namePart = cleanNoSpace.replace(/^퍼[블릭_]?/, "");
    } else if (cleanNoSpace.startsWith("커피") || cleanNoSpace.startsWith("커_")) {
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

  // 2. If longer than 4 characters -> 위탁직원
  // e.g. "하퍼 요셉(정인)" or "하퍼요셉정인"
  // If has bracket e.g. "하퍼 요셉 (정인)"
  const bracketMatch = trimmed.match(/^([^(]+)\s*\(([^)]+)\)$/);
  if (bracketMatch) {
    const mainPart = bracketMatch[1].trim();
    const affPart = bracketMatch[2].trim();
    return {
      main4: mainPart,
      fullName: trimmed,
      category: mainPart.startsWith("하퍼") ? "하퍼" : mainPart.startsWith("퍼블릭") ? "퍼블릭" : "커피",
      namePart: mainPart,
      affiliation: affPart,
      isDirect: false,
    };
  }

  // Otherwise take first 4 chars as main4 and remaining as affiliation
  const main4 = cleanNoSpace.slice(0, 4);
  const remaining = cleanNoSpace.slice(4);

  return {
    main4,
    fullName: trimmed,
    category: main4.startsWith("하퍼") ? "하퍼" : main4.startsWith("퍼블릭") ? "퍼블릭" : "커피",
    namePart: main4,
    affiliation: remaining || "위탁",
    isDirect: false,
  };
}
