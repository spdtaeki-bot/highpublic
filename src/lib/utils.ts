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
  recordId?: string;
  recordIds?: string[];
  historyIndex?: number;
  rawEntry?: CollectionHistoryEntry;
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
    const valid = r.collectionHistory.filter(
      (e) => e && ((e.amount !== undefined && e.amount > 0) || e.collectedAt),
    );
    if (valid.length > 0) {
      return valid;
    }
  }

  // If isPass is true, treat it as collected with the full totalAmount
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

  // Otherwise synthesize from single-record fields
  if (r.paymentMethod && r.paymentMethod !== "UNPAID") {
    const targetTotal =
      r.collectedAmount !== undefined && r.collectedAmount > 0
        ? r.collectedAmount
        : r.totalAmount || 0;

    if (targetTotal > 0) {
      const result: CollectionHistoryEntry[] = [];
      result.push({
        collectedAt: r.collectedAt || (r as any).createdAt || null,
        amount: targetTotal,
        paymentMethod: r.paymentMethod,
        depositorName: r.depositorName,
        note: r.isDispatchBoxCollection ? "현장수금" : "1차 수금",
      });

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
          const firstAmt = result[0].amount || 0;
          const diffAmt = Math.max(0, targetTotal - firstAmt);
          if (diffAmt > 0) {
            result.push({
              collectedAt: r.additionalCollectedAt,
              amount: diffAmt,
              paymentMethod: r.paymentMethod,
              depositorName: r.depositorName,
              note: "2차 추가수금",
            });
          }
        }
      }

      return result;
    }
  }

  return [];
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
    if (!r) return 0;
    if (
      r.collectionHistory &&
      Array.isArray(r.collectionHistory) &&
      r.collectionHistory.length > 0
    ) {
      const sum = r.collectionHistory.reduce((s, e) => s + (e.amount || 0), 0);
      if (sum > 0) return sum;
    }
    if (r.isPass) {
      return r.collectedAmount !== undefined && r.collectedAmount > 0
        ? r.collectedAmount
        : (r.totalAmount || 0);
    }
    if (r.paymentMethod && r.paymentMethod !== "UNPAID") {
      return r.collectedAmount !== undefined && r.collectedAmount > 0
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
      !r.isPass &&
      (r.paymentMethod === "UNPAID" || !r.paymentMethod) &&
      (!r.collectionHistory ||
        r.collectionHistory.length === 0 ||
        r.collectionHistory.every((e) => !e.amount || e.amount <= 0)) &&
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
      r.collectionHistory.length > 0 &&
      r.collectionHistory.some((e) => (e.amount || 0) > 0),
  );

  // Determine if records share an Establishment-Level batch history
  let isEstablishmentBatchHistory = false;
  let sharedBatchHistory: CollectionHistoryEntry[] = [];
  let batchRecordIds: string[] = [];

  if (recordsWithHistory.length > 0) {
    const firstHist = recordsWithHistory[0].collectionHistory!.filter(
      (e) => (e.amount || 0) > 0,
    );
    const allIdentical = recordsWithHistory.every((r) => {
      const h = r.collectionHistory!.filter((e) => (e.amount || 0) > 0);
      if (h.length !== firstHist.length) return false;
      return h.every(
        (entry, i) =>
          entry.amount === firstHist[i]?.amount &&
          entry.note === firstHist[i]?.note &&
          entry.paymentMethod === firstHist[i]?.paymentMethod,
      );
    });

    if (allIdentical && firstHist.length > 0) {
      if (records.length === 1) {
        isEstablishmentBatchHistory = true;
        sharedBatchHistory = firstHist;
        batchRecordIds = [records[0].id!].filter(Boolean);
      } else if (recordsWithHistory.length > 1) {
        const sharedSum = firstHist.reduce((s, e) => s + (e.amount || 0), 0);
        const maxSingleRecordAmount = Math.max(
          ...recordsWithHistory.map((r) => r.totalAmount || 0),
        );
        const sumOfIndividual = recordsWithHistory.reduce(
          (s, r) => s + getRecCollected(r),
          0,
        );
        const recordsWithHistoryRequestedSum = recordsWithHistory.reduce(
          (s, r) => s + (r.totalAmount || 0),
          0,
        );

        // Check if each record with history is simply paying its own individual total amount
        const eachRecordPaysItsOwn = recordsWithHistory.every(
          (r) =>
            firstHist.length === 1 &&
            (r.totalAmount || 0) === (firstHist[0].amount || 0),
        );

        if (!eachRecordPaysItsOwn) {
          if (
            sumOfIndividual > recordsWithHistoryRequestedSum ||
            sharedSum === recordsWithHistoryRequestedSum ||
            sharedSum > maxSingleRecordAmount ||
            recordsWithHistory.every((r) => !r.isDispatchBoxCollection)
          ) {
            isEstablishmentBatchHistory = true;
            sharedBatchHistory = firstHist;
            batchRecordIds = recordsWithHistory
              .map((r) => r.id!)
              .filter(Boolean);
          }
        }
      }
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
        historyIndex: idx,
        recordIds: batchRecordIds,
        rawEntry: entry,
      };
    });
    totalCollected = roundBreakdown.reduce((s, x) => s + (x.amount || 0), 0);

    // Also include any individual payments from records without batch history
    records
      .filter((r) => !batchRecordIds.includes(r.id!))
      .forEach((r) => {
        const paid = getRecCollected(r);
        if (paid > 0) {
          totalCollected += paid;
          roundBreakdown.push({
            round: 0,
            label: "현장",
            amount: paid,
            dateStr: formatDateHelper(
              r.collectedAt || (r as any).updatedAt || (r as any).createdAt,
            ),
            paymentMethod: r.paymentMethod,
            depositorName: r.depositorName,
            staffName: r.staffName,
            isOnSite: true,
            isDispatchBox: true,
            recordId: r.id,
            recordIds: r.id ? [r.id] : [],
          });
        }
      });
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
      recordId?: string;
      recordIds?: string[];
      historyIndex?: number;
      rawEntry?: CollectionHistoryEntry;
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
              recordId: r.id,
              historyIndex: idx,
              rawEntry: entry,
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
            recordId: r.id,
          });
        }
      }
    });

    // Sort all collection events chronologically by timestamp
    events.sort((a, b) => a.timestamp - b.timestamp);

    let roundCounter = 0;
    roundBreakdown = events.map((ev) => {
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
        recordId: ev.recordId,
        recordIds: ev.recordIds || (ev.recordId ? [ev.recordId] : []),
        historyIndex: ev.historyIndex,
        rawEntry: ev.rawEntry,
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
  const bracketMatch = trimmed.match(/^([^(]+)\s*\(([^)]+)\)$/);
  if (bracketMatch) {
    const mainPart = bracketMatch[1].trim();
    const affPart = bracketMatch[2].trim();
    return {
      main4: mainPart,
      fullName: trimmed,
      category: mainPart.startsWith("하퍼") ? "하퍼" : mainPart.startsWith("퍼블릭") ? "퍼블릭" : "커피",
      namePart: mainPart,
      affiliation: affPart || "위탁",
      isDirect: false,
    };
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  let affiliation = "";
  let main4 = "";

  if (parts.length >= 3) {
    // e.g. ["하퍼", "예슬", "샤넬"]
    main4 = `${parts[0]} ${parts[1]}`;
    affiliation = parts.slice(2).join(" ").trim();
  } else if (parts.length === 2) {
    // e.g. ["하퍼", "예슬샤넬"]
    if (parts[1].length > 2) {
      main4 = `${parts[0]} ${parts[1].slice(0, 2)}`;
      affiliation = parts[1].slice(2).trim();
    } else {
      main4 = parts[0];
      affiliation = parts[1].trim();
    }
  } else {
    // e.g. "하퍼예슬샤넬"
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
  } else if (cleanNoSpace.startsWith("퍼블릭") || cleanNoSpace.startsWith("퍼_")) {
    category = "퍼블릭";
    namePart = cleanNoSpace.slice(0, 4).replace(/^퍼[블릭_]?/, "");
  } else if (cleanNoSpace.startsWith("커피") || cleanNoSpace.startsWith("커_")) {
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

/**
 * 소속(직속 vs 위탁/샤넬 등)을 기준으로 두 직원 이름이 동일인물인지 철저히 판별하는 함수.
 * 직속 예슬과 샤넬 예슬처럼 동명이인이더라도 소속이 다르면 절대 같은 사람으로 간주하지 않습니다.
 */
export function isSameStaffIdentity(nameA: string, nameB: string): boolean {
  if (!nameA || !nameB) return false;
  const trimmedA = nameA.trim();
  const trimmedB = nameB.trim();
  if (trimmedA === trimmedB) return true;

  const cleanA = trimmedA.replace(/\s+/g, "");
  const cleanB = trimmedB.replace(/\s+/g, "");
  if (cleanA === cleanB) return true;

  const compA = formatStaffNameComponents(trimmedA);
  const compB = formatStaffNameComponents(trimmedB);

  // 1. 한 쪽은 직속이고 다른 쪽은 위탁인 경우 -> 절대 동일인이 아님!
  if (compA.isDirect !== compB.isDirect) {
    return false;
  }

  // 2. 둘 다 위탁인 경우 -> 소속(affiliation)이 반드시 일치해야 함
  if (!compA.isDirect && !compB.isDirect) {
    const cleanAffA = compA.affiliation.replace(/\s+/g, "").toLowerCase();
    const cleanAffB = compB.affiliation.replace(/\s+/g, "").toLowerCase();
    if (cleanAffA !== cleanAffB) {
      return false;
    }
  }

  // 3. 본명 4글자(공백 무시) 비교
  const cleanMainA = compA.main4.replace(/\s+/g, "").toLowerCase();
  const cleanMainB = compB.main4.replace(/\s+/g, "").toLowerCase();
  return cleanMainA === cleanMainB;
}

/**
 * 검색어에 따라 직원을 필터링할 때, 직속 직원과 위탁(샤넬 등) 직원의 동명 혼동을 방지하는 정밀 검색 함수.
 * - 특정 직원 선택 시(targetStaffName): 해당 직원과 동일인(소속 일치)만 정확히 매칭
 * - 직속 이름(4글자 이하, 예: "하퍼 예슬")으로 검색 시 -> 직속 직원만 매칭 (위탁 샤넬 예슬 완전 제외)
 * - 소속명(예: "샤넬")이나 위탁 전체 이름(예: "하퍼 예슬 샤넬")으로 검색 시 -> 해당 소속 위탁 직원만 매칭
 */
export function matchesStaffSearch(
  staffFullName: string,
  searchTerm: string,
  targetStaffName?: string
): boolean {
  if (!staffFullName) return false;

  // 특정 직원을 콕 찍어서 열람한 경우(targetStaffName 지정)
  if (targetStaffName && targetStaffName.trim()) {
    const cleanTarget = targetStaffName.trim().replace(/\s+/g, "").toLowerCase();
    const cleanSearch = (searchTerm || "").trim().replace(/\s+/g, "").toLowerCase();
    const targetComp = formatStaffNameComponents(targetStaffName);
    const cleanTargetMain4 = targetComp.main4.replace(/\s+/g, "").toLowerCase();

    // 검색어가 타깃 직원의 이름(또는 본명4글자)과 일치하거나 비어있는 경우, 타깃 직원과 동일인인 것만 정확히 반환
    if (!cleanSearch || cleanSearch === cleanTarget || cleanSearch === cleanTargetMain4) {
      return isSameStaffIdentity(staffFullName, targetStaffName);
    }
  }

  if (!searchTerm || !searchTerm.trim()) return true;
  const term = searchTerm.trim().toLowerCase();
  const cleanTerm = term.replace(/\s+/g, "");

  const staffComp = formatStaffNameComponents(staffFullName);
  const cleanStaff = staffFullName.replace(/\s+/g, "").toLowerCase();
  const cleanMain4 = staffComp.main4.replace(/\s+/g, "").toLowerCase();
  const cleanAff = staffComp.affiliation.replace(/\s+/g, "").toLowerCase();

  // 1. 완전 일치 (공백 무시)
  if (cleanStaff === cleanTerm) return true;

  // 2. 검색어가 "직속"인 경우
  if (cleanTerm === "직속") {
    return staffComp.isDirect;
  }

  // 3. 검색어가 "위탁"인 경우
  if (cleanTerm === "위탁") {
    return !staffComp.isDirect;
  }

  // 4. 검색어가 특정 소속명(예: "샤넬", "골드" 등)과 일치하는 경우
  if (cleanTerm === cleanAff) {
    return !staffComp.isDirect;
  }

  // 검색어의 소속 성분 분석
  const searchComp = formatStaffNameComponents(searchTerm);

  // 직속 직원의 경우:
  // 검색어에 위탁 소속명이나 "위탁" 키워드가 포함되어 있다면 직속 직원은 절대 매칭하지 않음!
  if (staffComp.isDirect) {
    if (!searchComp.isDirect && searchComp.affiliation !== "직속") {
      return false;
    }
    if (term.includes("위탁")) {
      return false;
    }
    return cleanMain4.includes(cleanTerm) || cleanTerm.includes(cleanMain4);
  }

  // 위탁 직원의 경우 (예: "하퍼 예슬 샤넬"):
  // 만약 검색어가 소속명이 명시되지 않은 직속 형식(4글자 이하 순수 이름, 예: "하퍼 예슬", "예슬")이라면,
  // 직속 직원을 찾는 검색이므로 위탁 직원은 절대 매칭하지 않음!
  if (searchComp.isDirect && cleanTerm.length <= 4) {
    return false;
  }

  // 위탁 직원은 검색어에 본명이나 소속이 포함된 경우 매칭
  if (cleanTerm.includes(cleanAff)) {
    const termWithoutAff = cleanTerm.replace(cleanAff, "");
    if (!termWithoutAff || cleanMain4.includes(termWithoutAff) || termWithoutAff.includes(cleanMain4)) {
      return true;
    }
  }

  if (cleanStaff.includes(cleanTerm)) {
    return true;
  }

  return false;
}
