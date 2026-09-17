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

/**
 * 화면의 회차 뱃지 → 실제 저장 데이터 위치.
 * - synthesized=false : 기록의 collectionHistory(유효 항목만, getStoredHistory 기준) 의 entryIndex 번째 항목
 * - synthesized=true  : 저장 이력이 없는 기록. 기록 필드(paymentMethod/collectedAt/...)로 합성된 이력의 entryIndex 번째 항목.
 *                       entryIndex === -1 이면 그 기록의 합성 수금 전체를 가리킨다.
 */
export interface CollectionEntryRef {
  recordId: string;
  entryIndex: number;
  synthesized: boolean;
}

/**
 * 회차 뱃지를 구성하는 "논리적 수금 1건".
 * - 업소 공용(isShared) 항목은 기록마다 복제 저장되어 있으므로 refs 가 기록 수만큼 있다 (편집/삭제 시 모두 함께 반영).
 * - 개인(현장/개별) 항목은 refs 가 1개 (합성 이력이 여러 개인 과거 데이터만 예외).
 */
export interface CollectionRoundSource {
  key: string;
  isShared: boolean;
  isOnSite: boolean;
  staffName?: string;
  amount: number;
  paymentMethod?: PaymentMethod;
  depositorName?: string;
  collectedAt: any;
  note?: string;
  refs: CollectionEntryRef[];
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
  /** 이 뱃지에 묶인 실제 수금 건들 (같은 분·수단·입금자인 개인 수금은 한 뱃지로 묶여 표시된다) */
  sources: CollectionRoundSource[];
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
      isOnSite: isDirectBoxRecord(r),
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
          isOnSite: false,
        });
      }
    }
  }

  return result;
}

/**
 * 이 기록이 "현장(파견함) 수금" 기록인지 여부.
 * - isDispatchBoxCollection 플래그가 명시되어 있으면 그것을 따른다.
 * - 과거 데이터: 미수 이력이 없고(wasUnpaid 아님) 수금 이력 배열이 없으면 현장 수금으로 본다.
 */
export function isDirectBoxRecord(r: Partial<DispatchRecord>): boolean {
  if (!r) return false;
  return (
    r.isDispatchBoxCollection === true ||
    (!r.wasUnpaid && (!r.collectionHistory || r.collectionHistory.length === 0))
  );
}

/**
 * 수금 이력 항목이 "현장 수금(개인 기록 고유)"인지 판별.
 * 명시적 isOnSite 플래그가 있으면 그것을 그대로 신뢰하고,
 * 없는 과거 데이터에 한해 기존 추정 규칙(첫 항목 + note)을 사용한다.
 */
export function isOnSiteHistoryEntry(
  entry: CollectionHistoryEntry,
  idx: number,
  r: Partial<DispatchRecord>,
): boolean {
  if (!entry) return false;
  if (entry.isOnSite === true) return true;
  if (entry.isOnSite === false) return false;
  return (
    isDirectBoxRecord(r) &&
    idx === 0 &&
    (!entry.note ||
      entry.note.includes("현장") ||
      !entry.note.includes("추가수금"))
  );
}

/**
 * 기록의 수금 이력을 두 종류로 분리한다.
 * - onSite : 이 직원 기록 고유의 현장 수금 (업소 단위 작업이 절대 건드리면 안 되는 부분)
 * - shared : 업소 단위 공용 수금 원장 (일괄 수금 / N차 추가수금). 같은 업소 기록들끼리 동일해야 한다.
 */
export function splitCollectionHistory(r: Partial<DispatchRecord>): {
  onSite: CollectionHistoryEntry[];
  shared: CollectionHistoryEntry[];
} {
  const history = getRecordCollectionHistory(r);
  const onSite: CollectionHistoryEntry[] = [];
  const shared: CollectionHistoryEntry[] = [];
  history.forEach((entry, idx) => {
    if (isOnSiteHistoryEntry(entry, idx, r)) {
      onSite.push({ ...entry, isOnSite: true });
    } else {
      shared.push(entry);
    }
  });
  return { onSite, shared };
}

/**
 * 사용자가 파견 수정 폼에서 기록의 결제수단(현금↔계좌)을 직접 바꿨을 때,
 * 저장된 수금 이력 중 "현장 수금" 항목의 수단만 같이 맞춰준다.
 * (사용자의 직접 수정이므로 허용. 업소 공용 항목은 건드리지 않는다.)
 * 저장된 이력이 없으면 빈 배열을 돌려 기존 동작을 유지한다.
 */
export function syncOnSiteEntriesPaymentMethod(
  r: Partial<DispatchRecord>,
  newMethod: PaymentMethod,
): CollectionHistoryEntry[] {
  const stored = Array.isArray(r.collectionHistory) ? r.collectionHistory : [];
  if (stored.length === 0) return [];
  if (!newMethod || newMethod === "UNPAID") return stored;
  if (r.paymentMethod === newMethod) return stored;
  return stored.map((entry, idx) =>
    isOnSiteHistoryEntry(entry, idx, r) && entry.paymentMethod !== newMethod
      ? { ...entry, paymentMethod: newMethod }
      : entry,
  );
}

/**
 * 두 공용 수금 원장이 "같은 원장"인지 비교.
 * 기준은 기존 계산 로직과 동일하게 금액/메모/결제수단만 본다 (기존 데이터 계산 결과가 달라지지 않도록).
 */
export function isSameSharedHistory(
  a: CollectionHistoryEntry[],
  b: CollectionHistoryEntry[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((e, i) => {
    const o = b[i];
    if (!o) return false;
    return (
      e.amount === o.amount &&
      e.note === o.note &&
      e.paymentMethod === o.paymentMethod
    );
  });
}

export interface ClassifiedRecordHistory {
  r: DispatchRecord;
  /** 저장된 이력 (유효 항목만) */
  stored: CollectionHistoryEntry[];
  /** 이 기록 개인의 수금 (현장 수금 + 개별 수금). 기록마다 각각 합산 */
  own: CollectionHistoryEntry[];
  /** 업소 공용 원장. 같은 업소 기록들에 복제 저장되므로 한 번만 합산 */
  shared: CollectionHistoryEntry[];
}

function getStoredHistory(r: Partial<DispatchRecord>): CollectionHistoryEntry[] {
  return Array.isArray(r.collectionHistory)
    ? r.collectionHistory.filter(
        (e) => e && (e.amount !== undefined || e.collectedAt),
      )
    : [];
}

/**
 * 같은 업소(같은 날) 기록들의 "저장된" 수금 이력을 개인(own) / 업소 공용(shared) 으로 분류한다.
 *
 * 1) isShared 플래그가 있는 항목은 그대로 신뢰한다. isOnSite === true 항목은 항상 개인.
 * 2) 플래그가 없는 과거 항목은 기존 규칙으로 판정한다:
 *    - 모든 기록에 저장 이력이 있고 그 내용(금액/메모/수단)이 완전히 동일하면 업소 공용 원장으로 본다.
 *    - 단, 그 이력 합계가 "각 기록 자신의 청구액(또는 수금액)"과 정확히 같다면, 우연히 같은 금액을 각자 개별 수금한 것이다.
 *      (공용 원장이라면 합계가 업소 총액 쪽이어야 한다.) 이 경우는 개인 수금으로 본다.
 *      예) 500,000원 기록 2건에 각각 [1차 500,000] → 공용 500,000(미수 500,000)이 아니라 개별 500,000 × 2 (완납).
 *    - 그 외(기록마다 다르거나 이력이 없는 기록이 섞임)는 모두 개인 수금이다.
 */
export function classifyEstablishmentHistories(
  records: DispatchRecord[],
): ClassifiedRecordHistory[] {
  const items = records.map((r) => {
    const stored = getStoredHistory(r);
    const flaggedShared = stored.filter((e) => e.isShared === true);
    const flaggedOwn = stored.filter(
      (e) => e.isShared !== true && (e.isShared === false || e.isOnSite === true),
    );
    const unflagged = stored.filter(
      (e) => e.isShared === undefined && e.isOnSite !== true,
    );
    return { r, stored, flaggedShared, flaggedOwn, unflagged };
  });

  const allHaveStored =
    items.length > 0 && items.every((i) => i.stored.length > 0);
  let unflaggedIsShared = false;

  if (allHaveStored) {
    if (items.length === 1) {
      // 단일 기록은 공용/개인 구분이 합계에 영향을 주지 않는다 (기존과 동일하게 공용 취급)
      unflaggedIsShared = items[0].unflagged.length > 0;
    } else {
      const first = items[0].unflagged;
      const identical =
        first.length > 0 &&
        items.every((i) => isSameSharedHistory(i.unflagged, first));
      if (identical) {
        const sharedSum = first.reduce((s, e) => s + (e.amount || 0), 0);
        const looksIndividual = items.every((i) => {
          const total = i.r.totalAmount || 0;
          const collected =
            i.r.collectedAmount !== undefined && i.r.collectedAmount > 0
              ? i.r.collectedAmount
              : 0;
          return (
            sharedSum > 0 &&
            (sharedSum === total || sharedSum === collected)
          );
        });
        unflaggedIsShared = !looksIndividual;
      }
    }
  }

  return items.map((i) => ({
    r: i.r,
    stored: i.stored,
    own: [...i.flaggedOwn, ...(unflaggedIsShared ? [] : i.unflagged)],
    shared: [...i.flaggedShared, ...(unflaggedIsShared ? i.unflagged : [])],
  }));
}

export interface EstablishmentAdditionalCollectInput {
  method: PaymentMethod;
  /** 양수: 추가 수금, 음수: 차감(조정) */
  additionalAmount: number;
  depositorName?: string;
  /** Firestore Timestamp */
  collectedAt: any;
}

export interface EstablishmentAdditionalCollectResult {
  updates: Array<{ id: string; updates: Partial<DispatchRecord> }>;
  /** 값이 있으면 아무 것도 저장하지 말고 사용자에게 알려야 한다. */
  error?: string;
}

/**
 * 업소 단위 "추가수금/조정"이 각 기록에 어떤 변경을 가해야 하는지 계산한다.
 *
 * 원칙 (금전 데이터이므로 엄격히 지킨다):
 * 1. 각 직원 기록의 현장 수금(onSite) 항목은 절대 변경/삭제/대체하지 않는다.
 *    → 저장 시 isOnSite:true 로 고정(materialize)하여 이후에도 추정에 의존하지 않게 한다.
 * 2. 업소 공용 원장(shared)에만 항목을 추가하거나(양수) 마지막 항목부터 차감한다(음수).
 * 3. 차감액이 공용 원장 합계를 넘으면 현장 수금까지 건드려야 하므로 실행하지 않고 오류를 돌려준다.
 * 4. 기록별 공용 원장이 서로 다르면(데이터가 이미 어긋난 상태) 임의로 한쪽을 골라 덮어쓰지 않고 오류를 돌려준다.
 * 5. 현장 수금이 있는 기록의 paymentMethod / collectedAt / depositorName 은 손대지 않는다.
 */
export function buildEstablishmentAdditionalCollectUpdates(
  records: DispatchRecord[],
  input: EstablishmentAdditionalCollectInput,
): EstablishmentAdditionalCollectResult {
  const { method, additionalAmount, depositorName, collectedAt } = input;
  if (!records || records.length === 0) return { updates: [] };
  if (!additionalAmount || isNaN(additionalAmount) || additionalAmount === 0) {
    return { updates: [] };
  }

  // 저장 이력이 있는 기록: 개인/공용 분류 (과거 데이터는 기록 간 대조로 판정)
  // 저장 이력이 없는 기록: 화면용 합성 이력(현장 수금 등)을 모두 개인 항목으로 고정한다.
  const classified = classifyEstablishmentHistories(records);
  const splits = classified.map((c) => {
    const r = c.r;
    let own: CollectionHistoryEntry[];
    if (c.stored.length > 0) {
      own = c.own.map((e) => ({
        ...e,
        isShared: false,
        isOnSite:
          e.isOnSite !== undefined
            ? e.isOnSite
            : isOnSiteHistoryEntry(e, c.stored.indexOf(e), r),
      }));
    } else {
      own = getRecordCollectionHistory(r).map((e, idx) => ({
        ...e,
        isShared: false,
        isOnSite: isOnSiteHistoryEntry(e, idx, r),
      }));
    }
    const shared = c.shared.map((e) => ({ ...e, isShared: true, isOnSite: false }));
    return { r, own, shared };
  });

  const withShared = splits.filter((s) => s.shared.length > 0);
  const baseShared: CollectionHistoryEntry[] =
    withShared.length > 0 ? withShared[0].shared : [];
  const inconsistent = withShared.some(
    (s) => !isSameSharedHistory(s.shared, baseShared),
  );
  if (inconsistent) {
    return {
      updates: [],
      error:
        "이 업소 기록들의 업소 단위 수금 내역이 서로 달라 일괄 추가수금/조정을 적용할 수 없습니다.\n데이터를 임의로 맞추지 않았습니다. 개별 기록에서 수금 내역을 확인·수정해 주세요.",
    };
  }

  const hasAnyPreviousCollection =
    baseShared.length > 0 ||
    splits.some(
      (s) =>
        s.own.length > 0 ||
        (s.r.paymentMethod && s.r.paymentMethod !== "UNPAID"),
    );

  let currentMaxRound = 1;
  baseShared.forEach((entry, idx) => {
    let rNum = idx + 1;
    const m = entry.note ? entry.note.match(/(\d+)차/) : null;
    if (m) rNum = parseInt(m[1], 10);
    if (rNum > currentMaxRound) currentMaxRound = rNum;
  });
  const nextRoundNum = hasAnyPreviousCollection ? currentMaxRound + 1 : 1;

  let updatedShared: CollectionHistoryEntry[];
  if (additionalAmount > 0) {
    const newEntry: CollectionHistoryEntry = {
      collectedAt,
      amount: additionalAmount,
      paymentMethod: method,
      ...(depositorName ? { depositorName } : {}),
      note:
        baseShared.length === 0 && nextRoundNum === 1
          ? "1차 수금"
          : `${nextRoundNum}차 추가수금`,
      isOnSite: false,
      isShared: true,
    };
    updatedShared = [...baseShared, newEntry];
  } else {
    let remaining = Math.abs(additionalAmount);
    const next: CollectionHistoryEntry[] = [];
    for (const entry of [...baseShared].reverse()) {
      const amt = entry.amount || 0;
      if (remaining <= 0) {
        next.unshift(entry);
      } else if (amt <= remaining) {
        remaining -= amt;
      } else {
        next.unshift({ ...entry, amount: amt - remaining });
        remaining = 0;
      }
    }
    if (remaining > 0) {
      const sharedTotal = baseShared.reduce((s, e) => s + (e.amount || 0), 0);
      return {
        updates: [],
        error: `차감 금액이 업소 단위 수금액(${sharedTotal.toLocaleString()}원)을 초과합니다.\n현장 수금 건은 업소 단위 조정으로 변경할 수 없으니 해당 직원 기록에서 직접 수정해 주세요.`,
      };
    }
    updatedShared = next;
  }

  const updates = splits
    .filter((s) => !!s.r.id)
    .map(({ r, own }) => {
      const history = [...own, ...updatedShared];
      const hasOwn = own.length > 0;
      const hasOnSite = own.some((e) => e.isOnSite === true);
      const isPaid = history.length > 0;

      // null 은 Firestore 에서 필드를 비우기 위한 값 (기존 핸들러와 동일한 저장 방식)
      const u: Record<string, any> = {
        collectionHistory: history,
        additionalCollectedAt: updatedShared.length > 0 ? collectedAt : null,
      };

      if (hasOwn) {
        // 개인 수금(현장/개별)이 있는 기록: 수단/시각/입금자는 이 직원 고유의 사실이므로 그대로 둔다.
        if (hasOnSite && r.isDispatchBoxCollection !== true) {
          // 과거 데이터에서 추정으로만 현장 수금이던 기록은 플래그를 명시해 이후에도 동일하게 인식되게 한다.
          u.isDispatchBoxCollection = true;
        }
      } else {
        u.paymentMethod = isPaid
          ? r.paymentMethod && r.paymentMethod !== "UNPAID"
            ? r.paymentMethod
            : method
          : "UNPAID";
        u.collectedAt = isPaid ? r.collectedAt || collectedAt : null;
        u.depositorName = r.depositorName || depositorName || null;
      }

      return { id: r.id as string, updates: u as Partial<DispatchRecord> };
    });

  return { updates };
}

/** 수금 1건 편집 내용. 지정한 필드만 바뀐다. depositorName: null → 입금자 지움 */
export interface CollectionEntryPatch {
  amount?: number;
  paymentMethod?: PaymentMethod;
  depositorName?: string | null;
  /** Firestore Timestamp */
  collectedAt?: any;
}

export interface CollectionEntryOperation {
  source: CollectionRoundSource;
  /** null = 삭제 */
  patch: CollectionEntryPatch | null;
}

export interface CollectionEntryUpdateResult {
  updates: Array<{ id: string; updates: Partial<DispatchRecord> }>;
  error?: string;
}

/**
 * 회차 뱃지 단위의 개별 수금 편집/삭제가 각 기록에 어떤 변경을 가해야 하는지 계산한다.
 *
 * 원칙:
 * 1. 사용자가 지정한 수금 건만 바꾼다. 다른 항목은 순서·내용 그대로 유지한다.
 * 2. 업소 공용 항목은 그 항목이 복제 저장된 모든 기록에서 동일하게 바꾼다 (한쪽만 바뀌어 원장이 어긋나는 일 방지).
 * 3. 저장 이력이 없던 기록(현장 수금 등 기록 필드로만 표현된 수금)은 편집 시 이력을 명시적으로 저장한다.
 * 4. 변경 후 남는 수금이 없으면 그 기록은 미수(UNPAID)로 되돌린다 ('전체 취소'와 같은 상태).
 * 5. 과거 데이터의 추정 플래그(isShared/isOnSite)는 건드리는 업소 기록 전체에 명시 저장한다.
 *    (일부 기록만 플래그가 붙으면 개인/공용 판정이 어긋나 합계가 달라질 수 있기 때문)
 */
export function buildCollectionEntryUpdates(
  records: DispatchRecord[],
  ops: CollectionEntryOperation[],
): CollectionEntryUpdateResult {
  if (!records || records.length === 0 || ops.length === 0) return { updates: [] };

  for (const op of ops) {
    if (op.patch) {
      if (op.patch.amount !== undefined) {
        if (isNaN(op.patch.amount) || op.patch.amount <= 0) {
          return { updates: [], error: "수금 금액은 0보다 커야 합니다. 없애려면 삭제를 사용해 주세요." };
        }
      }
      if (op.source.refs.length > 1 && !op.source.isShared) {
        return {
          updates: [],
          error: "이 수금 건은 과거 데이터로 여러 항목이 합쳐져 있어 금액 편집이 불가합니다. 삭제 후 다시 입력해 주세요.",
        };
      }
    }
  }

  const classified = classifyEstablishmentHistories(records);

  // 기록별로 "편집 기준 이력"을 만든다 (플래그 명시 포함)
  type Work = {
    r: DispatchRecord;
    base: CollectionHistoryEntry[];
    synthesized: boolean;
    /** 플래그 명시 저장만 필요한 기록 (내용 변화 없음) */
    touched: boolean;
    /** 사용자가 실제로 편집/삭제한 항목이 있는 기록 */
    edited: boolean;
    deleted: Set<number>;
  };
  const works = new Map<string, Work>();
  classified.forEach((c) => {
    const r = c.r;
    if (!r.id) return;
    let base: CollectionHistoryEntry[];
    let synthesized = false;
    if (c.stored.length > 0) {
      base = c.stored.map((e) => {
        const idx = c.stored.indexOf(e);
        if (c.shared.includes(e)) return { ...e, isShared: true, isOnSite: false };
        return {
          ...e,
          isShared: false,
          isOnSite: e.isOnSite !== undefined ? e.isOnSite : isOnSiteHistoryEntry(e, idx, r),
        };
      });
    } else {
      synthesized = true;
      base = getRecordCollectionHistory(r).map((e, idx) => ({
        ...e,
        isShared: false,
        isOnSite: isOnSiteHistoryEntry(e, idx, r),
      }));
    }
    works.set(r.id, { r, base, synthesized, touched: false, edited: false, deleted: new Set() });
  });

  // 과거 데이터: 플래그가 없는 항목이 있는 기록은 (내용 변화 없이) 플래그만 명시 저장 대상에 포함
  classified.forEach((c) => {
    const w = c.r.id ? works.get(c.r.id) : undefined;
    if (!w || w.synthesized) return;
    if (c.stored.some((e) => e.isShared === undefined)) w.touched = true;
  });

  const applyPatch = (e: CollectionHistoryEntry, p: CollectionEntryPatch): CollectionHistoryEntry => {
    const next: CollectionHistoryEntry = { ...e };
    if (p.amount !== undefined) next.amount = p.amount;
    if (p.paymentMethod !== undefined) next.paymentMethod = p.paymentMethod;
    if (p.collectedAt !== undefined) next.collectedAt = p.collectedAt;
    if (p.depositorName !== undefined) {
      if (p.depositorName) next.depositorName = p.depositorName;
      else delete next.depositorName;
    }
    return next;
  };

  for (const op of ops) {
    for (const ref of op.source.refs) {
      const w = works.get(ref.recordId);
      if (!w) {
        return { updates: [], error: "대상 기록을 찾을 수 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요." };
      }
      if (ref.synthesized !== w.synthesized) {
        return { updates: [], error: "기록이 변경되어 편집 위치가 맞지 않습니다. 화면을 새로고침한 뒤 다시 시도해 주세요." };
      }
      w.touched = true;
      w.edited = true;

      if (ref.synthesized && ref.entryIndex === -1) {
        // 기록 필드로만 표현된 수금 전체
        if (op.patch === null) {
          w.base.forEach((_, i) => w.deleted.add(i));
          w.deleted.add(-1);
        } else {
          if (w.base.length === 0) {
            const r = w.r;
            w.base = [
              {
                collectedAt: r.collectedAt || null,
                amount: op.source.amount,
                paymentMethod:
                  r.paymentMethod && r.paymentMethod !== "UNPAID" ? r.paymentMethod : undefined,
                ...(r.depositorName ? { depositorName: r.depositorName } : {}),
                note: "1차 수금",
                isOnSite: isDirectBoxRecord(r),
                isShared: false,
              },
            ];
          }
          if (w.base.length !== 1) {
            return {
              updates: [],
              error: "이 기록의 수금은 여러 항목이 합쳐져 있어 금액 편집이 불가합니다. 삭제 후 다시 입력해 주세요.",
            };
          }
          w.base[0] = applyPatch(w.base[0], op.patch);
        }
        continue;
      }

      const target = w.base[ref.entryIndex];
      if (!target) {
        return { updates: [], error: "기록이 변경되어 편집 위치가 맞지 않습니다. 화면을 새로고침한 뒤 다시 시도해 주세요." };
      }
      if (op.patch === null) {
        w.deleted.add(ref.entryIndex);
      } else {
        w.base[ref.entryIndex] = applyPatch(target, op.patch);
      }
    }
  }

  const updates: Array<{ id: string; updates: Partial<DispatchRecord> }> = [];
  works.forEach((w) => {
    if (!w.touched) return;
    const r = w.r;
    const history = w.base.filter((_, i) => !w.deleted.has(i));
    const isRevertAll = w.deleted.has(-1);

    if (history.length === 0 || isRevertAll) {
      // 남는 수금 없음 → 미수로 되돌림 ('전체 취소'와 동일한 상태)
      updates.push({
        id: r.id as string,
        updates: {
          paymentMethod: "UNPAID",
          collectedAt: null,
          additionalCollectedAt: null,
          collectionHistory: [],
          isPass: false,
          collectedAmount: 0,
          depositorName: null,
          isDispatchBoxCollection: false,
          wasUnpaid: true,
        } as any,
      });
      return;
    }

    const own = history.filter((e) => e.isShared !== true);
    const shared = history.filter((e) => e.isShared === true);
    const u: Record<string, any> = { collectionHistory: history };

    if (!w.edited) {
      // 플래그 명시 저장만: 내용은 그대로, 수단/시각/입금자 등 기록 필드는 건드리지 않는다.
      if (own.some((e) => e.isOnSite === true) && r.isDispatchBoxCollection !== true) {
        u.isDispatchBoxCollection = true;
      }
      updates.push({ id: r.id as string, updates: u as Partial<DispatchRecord> });
      return;
    }

    if (own.length > 0) {
      // 개인 수금이 있는 기록: 첫 개인 항목이 이 기록의 수금 수단/시각/입금자다.
      const first = own[0];
      u.paymentMethod =
        first.paymentMethod ||
        (r.paymentMethod && r.paymentMethod !== "UNPAID" ? r.paymentMethod : "CASH");
      u.collectedAt = first.collectedAt || r.collectedAt || null;
      u.depositorName = first.depositorName || null;
      u.isDispatchBoxCollection = first.isOnSite === true;
      u.additionalCollectedAt =
        history.length > 1 ? history[history.length - 1].collectedAt || null : null;
      if (shared.length === 0) {
        u.collectedAmount = own.reduce((s, e) => s + (e.amount || 0), 0);
      }
    } else {
      // 업소 공용 수금만 있는 기록
      const first = shared[0];
      u.paymentMethod =
        first.paymentMethod ||
        (r.paymentMethod && r.paymentMethod !== "UNPAID" ? r.paymentMethod : "CASH");
      u.collectedAt = first.collectedAt || r.collectedAt || null;
      u.depositorName = first.depositorName || null;
      u.isDispatchBoxCollection = false;
      u.additionalCollectedAt =
        shared.length > 1 ? shared[shared.length - 1].collectedAt || null : null;
    }

    updates.push({ id: r.id as string, updates: u as Partial<DispatchRecord> });
  });

  return { updates };
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

  // ── 개인(own) / 업소 공용(shared) 분류 ──
  // 공용 원장은 같은 업소 기록들에 동일하게 복제 저장되므로 한 번만 합산하고,
  // 개인 수금(현장 수금·개별 수금)은 기록마다 각각 합산한다.
  // 과거 데이터(플래그 없음)는 classifyEstablishmentHistories 의 기존 규칙(+ 금액 대조 보정)으로 판정한다.
  const classified = classifyEstablishmentHistories(records);
  const withShared = classified.filter((c) => c.shared.length > 0);

  let isEstablishmentBatchHistory = false;
  let sharedBatchHistory: CollectionHistoryEntry[] = [];
  if (withShared.length > 0) {
    const firstShared = withShared[0].shared;
    if (withShared.every((c) => isSameSharedHistory(c.shared, firstShared))) {
      isEstablishmentBatchHistory = true;
      sharedBatchHistory = firstShared;
    }
    // 기록마다 공용 원장이 서로 다르면(데이터가 어긋난 상태) 임의로 하나를 고르지 않고
    // 기존과 동일하게 기록별 이력 합계로 계산한다.
  }

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
    /** 공용 원장 항목: 다른 이벤트와 묶지 않고, 회차는 메모(N차)에서 가져온다 */
    isShared?: boolean;
    fixedRound?: number;
    sources: CollectionRoundSource[];
  }

  const events: CollectionEventItem[] = [];
  let totalCollected = 0;

  const makeSource = (
    key: string,
    base: {
      isShared: boolean;
      isOnSite: boolean;
      staffName?: string;
      amount: number;
      paymentMethod?: PaymentMethod;
      depositorName?: string;
      collectedAt: any;
      note?: string;
    },
    refs: CollectionEntryRef[],
  ): CollectionRoundSource => ({ key, ...base, refs });

  if (isEstablishmentBatchHistory) {
    // (a) 공용 원장: 한 번만
    sharedBatchHistory.forEach((entry, idx) => {
      const amt = entry.amount || 0;
      totalCollected += amt;
      if (amt <= 0) return;
      let roundNum = idx + 1;
      const m = entry.note ? entry.note.match(/(\d+)차/) : null;
      if (m) roundNum = parseInt(m[1], 10);
      // 이 공용 항목이 저장된 모든 기록의 위치 (편집/삭제 시 함께 반영)
      const refs: CollectionEntryRef[] = withShared
        .filter((c) => !!c.r.id)
        .map((c) => ({
          recordId: c.r.id as string,
          entryIndex: c.stored.indexOf(c.shared[idx]),
          synthesized: false,
        }))
        .filter((ref) => ref.entryIndex >= 0);
      events.push({
        amount: amt,
        timestamp: getTimestampHelper(entry.collectedAt),
        dateStr: formatDateHelper(entry.collectedAt),
        paymentMethod: entry.paymentMethod,
        depositorName: entry.depositorName,
        label: entry.note || `${roundNum}차 수금`,
        isOnSite: false,
        isShared: true,
        fixedRound: roundNum,
        sources: [
          makeSource(
            `shared-${idx}`,
            {
              isShared: true,
              isOnSite: false,
              amount: amt,
              paymentMethod: entry.paymentMethod,
              depositorName: entry.depositorName,
              collectedAt: entry.collectedAt,
              note: entry.note,
            },
            refs,
          ),
        ],
      });
    });

    // (b) 개인 수금: 기록마다 (저장 이력이 없는 기록은 기록 필드로 계산)
    classified.forEach(({ r, stored, own }) => {
      const isRecordDirectBox = isDirectBoxRecord(r);
      if (stored.length > 0) {
        own.forEach((entry) => {
          const amt = entry.amount || 0;
          totalCollected += amt;
          if (amt <= 0) return;
          const entryIndex = stored.indexOf(entry);
          const onSite = isOnSiteHistoryEntry(entry, entryIndex, r);
          events.push({
            amount: amt,
            timestamp: getTimestampHelper(entry.collectedAt),
            dateStr: formatDateHelper(entry.collectedAt),
            paymentMethod: entry.paymentMethod,
            depositorName: entry.depositorName,
            label: entry.note,
            staffName: r.staffName,
            isOnSite: onSite,
            isDispatchBox: isRecordDirectBox,
            sources: r.id
              ? [
                  makeSource(
                    `${r.id}-${entryIndex}`,
                    {
                      isShared: false,
                      isOnSite: onSite,
                      staffName: r.staffName,
                      amount: amt,
                      paymentMethod: entry.paymentMethod,
                      depositorName: entry.depositorName,
                      collectedAt: entry.collectedAt,
                      note: entry.note,
                    },
                    [{ recordId: r.id, entryIndex, synthesized: false }],
                  ),
                ]
              : [],
          });
        });
      } else {
        const paid = getRecCollected(r);
        totalCollected += paid;
        if (paid > 0) {
          const at =
            r.collectedAt || (r as any).updatedAt || (r as any).createdAt;
          events.push({
            amount: paid,
            timestamp: getTimestampHelper(at),
            dateStr: formatDateHelper(at),
            paymentMethod: r.paymentMethod,
            depositorName: r.depositorName,
            staffName: r.staffName,
            isOnSite: isRecordDirectBox,
            isDispatchBox: isRecordDirectBox,
            sources: r.id
              ? [
                  makeSource(
                    `${r.id}-synth`,
                    {
                      isShared: false,
                      isOnSite: isRecordDirectBox,
                      staffName: r.staffName,
                      amount: paid,
                      paymentMethod: r.paymentMethod,
                      depositorName: r.depositorName,
                      collectedAt: r.collectedAt,
                    },
                    [{ recordId: r.id, entryIndex: -1, synthesized: true }],
                  ),
                ]
              : [],
          });
        }
      }
    });
  } else {
    // 기록별 개별 수금 (기존 개별 경로와 동일)
    totalCollected = records.reduce((sum, r) => sum + getRecCollected(r), 0);

    records.forEach((r) => {
      const hist = getRecordCollectionHistory(r);
      const isRecordDirectBox = isDirectBoxRecord(r);
      const hasStored = getStoredHistory(r).length > 0;

      if (hist.length > 0) {
        hist.forEach((entry, idx) => {
          if ((entry.amount || 0) > 0) {
            const onSite = isOnSiteHistoryEntry(entry, idx, r);
            events.push({
              amount: entry.amount || 0,
              timestamp: getTimestampHelper(entry.collectedAt),
              dateStr: formatDateHelper(entry.collectedAt),
              paymentMethod: entry.paymentMethod,
              depositorName: entry.depositorName,
              label: entry.note,
              staffName: r.staffName,
              isOnSite: onSite,
              isDispatchBox: isRecordDirectBox,
              sources: r.id
                ? [
                    makeSource(
                      `${r.id}-${hasStored ? idx : `synth${idx}`}`,
                      {
                        isShared: false,
                        isOnSite: onSite,
                        staffName: r.staffName,
                        amount: entry.amount || 0,
                        paymentMethod: entry.paymentMethod,
                        depositorName: entry.depositorName,
                        collectedAt: entry.collectedAt,
                        note: entry.note,
                      },
                      [{ recordId: r.id, entryIndex: idx, synthesized: !hasStored }],
                    ),
                  ]
                : [],
            });
          }
        });
      } else {
        const paid = getRecCollected(r);
        if (paid > 0) {
          const at =
            r.collectedAt || (r as any).updatedAt || (r as any).createdAt;
          events.push({
            amount: paid,
            timestamp: getTimestampHelper(at),
            dateStr: formatDateHelper(at),
            paymentMethod: r.paymentMethod,
            depositorName: r.depositorName,
            staffName: r.staffName,
            isOnSite: isRecordDirectBox,
            isDispatchBox: isRecordDirectBox,
            sources: r.id
              ? [
                  makeSource(
                    `${r.id}-synth`,
                    {
                      isShared: false,
                      isOnSite: isRecordDirectBox,
                      staffName: r.staffName,
                      amount: paid,
                      paymentMethod: r.paymentMethod,
                      depositorName: r.depositorName,
                      collectedAt: r.collectedAt,
                    },
                    [{ recordId: r.id, entryIndex: -1, synthesized: true }],
                  ),
                ]
              : [],
          });
        }
      }
    });
  }

  // 시간순 정렬
  events.sort((a, b) => a.timestamp - b.timestamp);

  // 같은 분(分)·수단·입금자·현장여부가 같은 개인 이벤트는 한 줄로 묶어 표시 (공용 원장 항목은 묶지 않음)
  const groupedEvents: CollectionEventItem[] = [];
  events.forEach((ev) => {
    const existing =
      ev.dateStr && !ev.isShared
        ? groupedEvents.find(
            (g) =>
              !g.isShared &&
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
      existing.sources = [...existing.sources, ...ev.sources];
    } else {
      groupedEvents.push({ ...ev, sources: [...ev.sources] });
    }
  });

  // 회차/라벨: 현장은 "현장", 그 외는 1차, 2차... (공용 원장 항목은 메모의 N차를 우선)
  let roundCounter = 0;
  const roundBreakdown: RoundBreakdownItem[] = groupedEvents.map((ev) => {
    if (ev.isOnSite) {
      return {
        round: 0,
        label: "현장",
        amount: ev.amount,
        dateStr: ev.dateStr,
        paymentMethod: ev.paymentMethod,
        depositorName: ev.depositorName,
        staffName: ev.staffName,
        isOnSite: true,
        isDispatchBox: ev.isDispatchBox,
        sources: ev.sources,
      };
    }
    if (ev.isShared && ev.fixedRound !== undefined) {
      roundCounter = Math.max(roundCounter, ev.fixedRound);
      return {
        round: ev.fixedRound,
        label: ev.label || `${ev.fixedRound}차 수금`,
        amount: ev.amount,
        dateStr: ev.dateStr,
        paymentMethod: ev.paymentMethod,
        depositorName: ev.depositorName,
        isOnSite: false,
        sources: ev.sources,
      };
    }
    roundCounter++;
    return {
      round: roundCounter,
      label:
        ev.label && ev.label.includes("차") ? ev.label : `${roundCounter}차`,
      amount: ev.amount,
      dateStr: ev.dateStr,
      paymentMethod: ev.paymentMethod,
      depositorName: ev.depositorName,
      staffName: ev.staffName,
      isOnSite: false,
      isDispatchBox: ev.isDispatchBox,
      sources: ev.sources,
    };
  });

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
