import type { DispatchRecord, PaymentMethod } from "../types";
import { safeSetItem } from "./siteStorage";

/**
 * 입금자명 → 업소명. 화면에서 고칠 수 있고, 저장값이 없으면 아래를 쓴다.
 * 계좌수금 원장과는 별개라 localStorage 에만 둔다.
 */
export interface DepositorMapping {
  depositorName: string;
  establishmentName: string;
}

export const DEFAULT_DEPOSITOR_MAPPINGS: DepositorMapping[] = [
  { depositorName: "커피티씨", establishmentName: "리치" },
  { depositorName: "송한빈", establishmentName: "어우동" },
  { depositorName: "박선아", establishmentName: "삼칠오" },
  { depositorName: "김태강", establishmentName: "홍콩" },
  { depositorName: "김민균", establishmentName: "어게인" },
  { depositorName: "정정희", establishmentName: "홈런" },
  { depositorName: "최정우", establishmentName: "하이엔드" },
  { depositorName: "임민혁", establishmentName: "도파민" },
  { depositorName: "김영신", establishmentName: "투썸" },
  { depositorName: "임선교", establishmentName: "팡팡" },
  { depositorName: "박혜창", establishmentName: "두바이" },
];

export const DEPOSITOR_MAP_STORAGE_KEY = "office_depositor_establishment_map";

export type MatchResultKind =
  | "일치"
  | "초과"
  | "미달"
  | "업소 불명"
  | "중복 의심";

export interface ParsedDeposit {
  lineNumber: number;
  raw: string;
  depositorName: string;
  amount: number;
  at: Date;
  hasExplicitDate: boolean;
  hasExplicitTime: boolean;
}

export interface ParseIssue {
  lineNumber: number;
  raw: string;
  reason: string;
}

/** 계좌전체 수금이 실제로 건드리는 단위. paymentMethod 가 UNPAID 인 기록만 담는다. */
export interface CollectableBucket {
  establishmentName: string;
  /** 파견 영업일 YYYY-MM-DD */
  date: string;
  records: DispatchRecord[];
}

export interface AccountCollectionWrite {
  records: DispatchRecord[];
  amount: number;
  /** MMDD. 기존 계좌수금 폼과 같다. */
  dateStr: string;
  /** HHMM */
  timeStr: string;
  year: number;
  depositorName: string;
}

export interface DepositMatchRow {
  id: string;
  lineNumber: number;
  raw: string;
  depositorName: string;
  amount: number;
  at: Date;
  establishmentName: string | null;
  /** 이 줄을 반영하기 전, 그 업소의 계좌수금 대상 미수 합계 */
  unpaidAmount: number | null;
  kind: MatchResultKind;
  /** 기본 체크. 일치만 true. */
  defaultChecked: boolean;
  /** 업소 불명·중복 의심·기록할 미수가 없으면 false */
  checkable: boolean;
  note: string;
  warnings: string[];
}

export interface KnownCollection {
  establishmentName: string;
  depositorName: string;
  amount: number;
  collectedAt: Date | null;
}

const NAME_STOPWORDS = new Set([
  "입금",
  "출금",
  "잔액",
  "거래",
  "적요",
  "내용",
  "메모",
  "이체",
  "인터넷",
  "모바일",
  "당행",
  "타행",
  "급여",
  "현금",
  "계좌",
  "취소",
  "송금",
  "전자금융",
  "거래일시",
  "입금액",
  "출금액",
  "거래금액",
  "보낸분",
  "받는분",
  "기재내용",
  "통장",
  "인쇄",
  "합계",
  "비고",
  "구분",
  "상태",
  "처리",
  "완료",
  "인터넷뱅킹",
  "스마트뱅킹",
  "오픈뱅킹",
  "자동이체",
  "이자",
  "수수료",
  "거래후잔액",
  "받으신분",
  "보내신분",
  "의뢰인",
  "수취인",
]);

export function normalizeMatchKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export function loadDepositorMappings(): DepositorMapping[] {
  if (typeof localStorage === "undefined") {
    return DEFAULT_DEPOSITOR_MAPPINGS.map((row) => ({ ...row }));
  }
  try {
    const raw = localStorage.getItem(DEPOSITOR_MAP_STORAGE_KEY);
    if (!raw) return DEFAULT_DEPOSITOR_MAPPINGS.map((row) => ({ ...row }));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return DEFAULT_DEPOSITOR_MAPPINGS.map((row) => ({ ...row }));
    }
    return parsed
      .filter(
        (row) =>
          row &&
          typeof row.depositorName === "string" &&
          typeof row.establishmentName === "string",
      )
      .map((row) => ({
        depositorName: String(row.depositorName).trim(),
        establishmentName: String(row.establishmentName).trim(),
      }))
      .filter((row) => row.depositorName && row.establishmentName);
  } catch {
    return DEFAULT_DEPOSITOR_MAPPINGS.map((row) => ({ ...row }));
  }
}

export function saveDepositorMappings(mappings: DepositorMapping[]): boolean {
  const cleaned = mappings
    .map((row) => ({
      depositorName: row.depositorName.trim(),
      establishmentName: row.establishmentName.trim(),
    }))
    .filter((row) => row.depositorName && row.establishmentName);
  return safeSetItem(DEPOSITOR_MAP_STORAGE_KEY, JSON.stringify(cleaned));
}

export function bucketUnpaidAmount(records: DispatchRecord[]): number {
  return records.reduce((sum, record) => {
    if (record.paymentMethod && record.paymentMethod !== "UNPAID") return sum;
    return sum + (record.totalAmount || 0);
  }, 0);
}

export function collectableBucketsFromRecords(
  records: DispatchRecord[],
  businessDateOf: (record: DispatchRecord) => string,
): CollectableBucket[] {
  const groups = new Map<string, CollectableBucket>();
  records.forEach((record) => {
    if (!record.id) return;
    if (record.paymentMethod && record.paymentMethod !== "UNPAID") return;
    const establishmentName = record.establishmentName?.trim();
    if (!establishmentName) return;
    const date = businessDateOf(record);
    const key = `${date}:::${establishmentName}`;
    const existing = groups.get(key);
    if (existing) {
      existing.records.push(record);
      return;
    }
    groups.set(key, { establishmentName, date, records: [record] });
  });
  return Array.from(groups.values())
    .map((bucket) => ({
      ...bucket,
      records: bucket.records.filter((record) => bucketUnpaidAmount([record]) > 0),
    }))
    .filter((bucket) => bucket.records.length > 0 && bucketUnpaidAmount(bucket.records) > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.establishmentName.localeCompare(b.establishmentName));
}

function readDate(raw: unknown): Date | null {
  if (!raw) return null;
  try {
    if (
      typeof raw === "object" &&
      raw !== null &&
      "toDate" in raw &&
      typeof (raw as { toDate: () => Date }).toDate === "function"
    ) {
      const date = (raw as { toDate: () => Date }).toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
    }
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
    if (typeof raw === "string" || typeof raw === "number") {
      const date = new Date(raw);
      if (!Number.isNaN(date.getTime())) return date;
    }
  } catch {
    return null;
  }
  return null;
}

export function extractKnownCollections(records: DispatchRecord[]): KnownCollection[] {
  const seen = new Set<string>();
  const found: KnownCollection[] = [];
  const push = (item: KnownCollection) => {
    const at = item.collectedAt ? minuteKey(item.collectedAt) : "";
    const key = [
      normalizeMatchKey(item.establishmentName),
      normalizeMatchKey(item.depositorName),
      item.amount,
      at,
    ].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    found.push(item);
  };

  records.forEach((record) => {
    const establishmentName = record.establishmentName?.trim() || "";
    if (!establishmentName) return;
    const history = Array.isArray(record.collectionHistory)
      ? record.collectionHistory
      : [];
    if (history.length > 0) {
      history.forEach((entry) => {
        const depositorName = entry?.depositorName?.trim() || "";
        const amount = entry?.amount || 0;
        if (!depositorName || amount <= 0) return;
        push({
          establishmentName,
          depositorName,
          amount,
          collectedAt: readDate(entry.collectedAt),
        });
      });
      return;
    }
    const depositorName = record.depositorName?.trim() || "";
    if (!depositorName || !record.paymentMethod || record.paymentMethod === "UNPAID") {
      return;
    }
    const amount =
      record.collectedAmount !== undefined
        ? record.collectedAmount
        : record.totalAmount || 0;
    if (amount <= 0) return;
    push({
      establishmentName,
      depositorName,
      amount,
      collectedAt: readDate(record.collectedAt),
    });
  });
  return found;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function collectionPartsFromDate(at: Date): {
  dateStr: string;
  timeStr: string;
  year: number;
} {
  return {
    dateStr: `${pad(at.getMonth() + 1)}${pad(at.getDate())}`,
    timeStr: `${pad(at.getHours())}${pad(at.getMinutes())}`,
    year: at.getFullYear(),
  };
}

export function dateKeyOf(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export function minuteKey(at: Date): string {
  return `${dateKeyOf(at)}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * 기존 계좌전체 수금이 미수 기록에 쓰는 갱신 본문.
 * 상세 화면의 계좌수금과 일괄 대조 승인이 이 함수 하나만 사용한다.
 * 헬퍼(직원) 지급 필드는 넣지 않는다.
 */
export function buildSharedAccountCollectionUpdate<T>(input: {
  collectedAt: T;
  method: PaymentMethod;
  depositorName: string;
  amount: number;
  isPass?: boolean;
}): {
  paymentMethod: PaymentMethod;
  collectedAt: T;
  additionalCollectedAt: null;
  collectionHistory: Array<{
    collectedAt: T;
    amount: number;
    paymentMethod: PaymentMethod;
    depositorName?: string;
    note: string;
    isOnSite: false;
    isShared: true;
  }>;
  isPass: boolean;
  isDispatchBoxCollection: false;
  depositorName: string | null;
  collectedAmount: undefined;
} {
  const depositorName = input.depositorName.trim();
  return {
    paymentMethod: input.method,
    collectedAt: input.collectedAt,
    additionalCollectedAt: null,
    collectionHistory: [
      {
        collectedAt: input.collectedAt,
        amount: input.amount,
        paymentMethod: input.method,
        ...(depositorName ? { depositorName } : {}),
        note: "1차 수금",
        isOnSite: false,
        isShared: true,
      },
    ],
    isPass: input.isPass ?? false,
    isDispatchBoxCollection: false,
    depositorName: depositorName || null,
    collectedAmount: undefined,
  };
}

function isHeaderLine(line: string): boolean {
  return /거래일시|입금액|출금액|거래후\s*잔액|기재\s*내용|받으신\s*분|보낸\s*분/.test(
    line,
  ) && !/\d{4}\s*[.\-/년]\s*\d{1,2}/.test(line) && !/\d{1,2}\s*월\s*\d{1,2}\s*일/.test(line);
}

function parseClock(
  hourText: string,
  minuteText: string,
  secondText: string | undefined,
  meridiem: string | undefined,
): { hour: number; minute: number } | null {
  let hour = Number(hourText);
  const minute = Number(minuteText);
  const second = secondText ? Number(secondText) : 0;
  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }
  if (meridiem === "오후" && hour < 12) hour += 12;
  if (meridiem === "오전" && hour === 12) hour = 0;
  return { hour, minute };
}

function applyCalendarDate(
  target: Date,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const next = new Date(target);
  next.setFullYear(year, month - 1, day);
  next.setHours(hour, minute, 0, 0);
  if (next.getFullYear() !== year || next.getMonth() !== month - 1 || next.getDate() !== day) {
    return null;
  }
  return next;
}

interface ExtractedWhen {
  at: Date;
  hasExplicitDate: boolean;
  hasExplicitTime: boolean;
  consumed: string;
}

function extractWhen(line: string, now: Date): ExtractedWhen {
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let day = now.getDate();
  let hour = now.getHours();
  let minute = now.getMinutes();
  let hasExplicitDate = false;
  let hasExplicitTime = false;
  let consumed = line;

  const full = line.match(
    /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/,
  );
  const compact = !full
    ? line.match(/(^|[\s\t,])(\d{4})(\d{2})(\d{2})(?!\d)/)
    : null;
  const korean = !full && !compact
    ? line.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
    : null;
  const short = !full && !compact && !korean
    ? line.match(/(^|[\s\t,])(\d{1,2})[./\-](\d{1,2})(?!\d)/)
    : null;

  if (full) {
    year = Number(full[1]);
    month = Number(full[2]);
    day = Number(full[3]);
    hasExplicitDate = true;
    consumed = consumed.replace(full[0], " ");
  } else if (compact) {
    year = Number(compact[2]);
    month = Number(compact[3]);
    day = Number(compact[4]);
    hasExplicitDate = true;
    consumed = consumed.replace(compact[2] + compact[3] + compact[4], " ");
  } else if (korean) {
    month = Number(korean[1]);
    day = Number(korean[2]);
    hasExplicitDate = true;
    consumed = consumed.replace(korean[0], " ");
  } else if (short) {
    month = Number(short[2]);
    day = Number(short[3]);
    hasExplicitDate = true;
    consumed = consumed.replace(short[0], " ");
  }

  const clock = consumed.match(
    /(오전|오후)?\s*(\d{1,2})\s*(?::|시)\s*(\d{1,2})(?:\s*분)?(?:\s*(?::|분)\s*(\d{1,2}))?\s*초?/,
  );
  if (clock && clock[2] && clock[3]) {
    const parsed = parseClock(clock[2], clock[3], clock[4], clock[1]);
    if (parsed) {
      hour = parsed.hour;
      minute = parsed.minute;
      hasExplicitTime = true;
      consumed = consumed.replace(clock[0], " ");
    }
  } else {
    const compactClock = consumed.match(/(^|[\s\t,])(\d{2})(\d{2})(\d{2})(?!\d)/);
    if (compactClock) {
      const parsed = parseClock(compactClock[2], compactClock[3], compactClock[4], undefined);
      if (parsed && Number(compactClock[2]) <= 23) {
        hour = parsed.hour;
        minute = parsed.minute;
        hasExplicitTime = true;
        consumed = consumed.replace(compactClock[2] + compactClock[3] + compactClock[4], " ");
      }
    } else if (hasExplicitDate) {
      const hhmm = consumed.match(/(^|[\s\t,])(\d{2})(\d{2})(?!\d)/);
      if (hhmm) {
        const parsed = parseClock(hhmm[2], hhmm[3], undefined, undefined);
        if (parsed) {
          hour = parsed.hour;
          minute = parsed.minute;
          hasExplicitTime = true;
          consumed = consumed.replace(hhmm[2] + hhmm[3], " ");
        }
      }
    }
  }

  if (hasExplicitDate && !full && !compact) {
    const candidate = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (candidate.getTime() - now.getTime() > 1000 * 60 * 60 * 24 * 31) {
      year -= 1;
    }
  }

  const at =
    applyCalendarDate(now, year, month, day, hour, minute) ||
    new Date(now);
  return { at, hasExplicitDate, hasExplicitTime, consumed };
}

function pickDepositAmount(amounts: number[]): number | null {
  const positive = amounts.filter((amount) => amount > 0);
  if (positive.length === 0) return null;
  if (positive.length === 1) return positive[0];
  const last = positive[positive.length - 1];
  const earlier = positive.slice(0, -1);
  const smallerThanBalance = earlier.filter((amount) => amount < last);
  if (smallerThanBalance.length > 0) return smallerThanBalance[0];
  return earlier[0];
}

function extractAmount(consumed: string): { amount: number | null; rest: string; withdrawal: boolean } {
  const withdrawalOnly =
    /출금/.test(consumed) &&
    !/입금\s*[+]?\s*\d/.test(consumed) &&
    /출금\s*[+]?\s*[1-9]/.test(consumed);
  const matches = Array.from(
    consumed.matchAll(/[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*원?|[+-]?\d{4,}(?:\.\d+)?\s*원?/g),
  );
  const amounts = matches.map((match) => {
    const token = match[0].replace(/원/g, "").replace(/,/g, "").trim();
    return Number(token);
  });
  const positive = amounts.filter((value) => value > 0);
  const amount = pickDepositAmount(positive);
  let rest = consumed;
  matches.forEach((match) => {
    rest = rest.replace(match[0], " ");
  });
  const negativesOnly = amounts.length > 0 && positive.length === 0;
  return {
    amount,
    rest,
    withdrawal: withdrawalOnly || negativesOnly,
  };
}

function extractDepositorName(rest: string): string | null {
  const tokens = rest
    .split(/[\s\t,|/]+/)
    .map((token) => token.replace(/[^\uac00-\ud7a3]/g, ""))
    .filter(Boolean);
  const names: string[] = [];
  let pending = "";
  const flush = () => {
    if (pending.length >= 2 && pending.length <= 15 && !NAME_STOPWORDS.has(pending)) {
      names.push(pending);
    }
    pending = "";
  };
  tokens.forEach((token) => {
    if (NAME_STOPWORDS.has(token)) {
      flush();
      return;
    }
    if (token.length === 1) {
      pending += token;
      return;
    }
    pending += token;
    flush();
  });
  flush();
  if (names.length === 0) return null;
  return names[names.length - 1];
}

export function parseDepositText(
  text: string,
  now: Date = new Date(),
): { deposits: ParsedDeposit[]; issues: ParseIssue[] } {
  const deposits: ParsedDeposit[] = [];
  const issues: ParseIssue[] = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  lines.forEach((original, index) => {
    const lineNumber = index + 1;
    const raw = original.replace(/\u00a0/g, " ").replace(/[，]/g, ",").trim();
    if (!raw) return;
    if (isHeaderLine(raw)) return;
    if (/^[-=_*\s]+$/.test(raw)) return;

    const when = extractWhen(raw, now);
    const amountResult = extractAmount(when.consumed);
    if (amountResult.withdrawal) {
      issues.push({ lineNumber, raw, reason: "출금 내역이라 건너뜁니다." });
      return;
    }
    if (amountResult.amount === null) {
      issues.push({ lineNumber, raw, reason: "금액을 찾지 못했습니다." });
      return;
    }
    const depositorName = extractDepositorName(amountResult.rest);
    if (!depositorName) {
      issues.push({ lineNumber, raw, reason: "입금자명을 찾지 못했습니다." });
      return;
    }
    deposits.push({
      lineNumber,
      raw,
      depositorName,
      amount: Math.round(amountResult.amount),
      at: when.at,
      hasExplicitDate: when.hasExplicitDate,
      hasExplicitTime: when.hasExplicitTime,
    });
  });

  return { deposits, issues };
}

function findEstablishmentName(
  depositorName: string,
  mappings: DepositorMapping[],
  known: KnownCollection[],
): string | null {
  const key = normalizeMatchKey(depositorName);
  const mapped = mappings.find(
    (row) => normalizeMatchKey(row.depositorName) === key,
  );
  if (mapped) return mapped.establishmentName.trim();

  const history = known
    .filter((item) => normalizeMatchKey(item.depositorName) === key)
    .sort((a, b) => {
      const aTime = a.collectedAt?.getTime() || 0;
      const bTime = b.collectedAt?.getTime() || 0;
      return bTime - aTime;
    });
  return history[0]?.establishmentName.trim() || null;
}

function isDuplicateCollection(
  establishmentName: string,
  amount: number,
  at: Date,
  known: KnownCollection[],
  batchFingerprints: { establishmentName: string; amount: number; at: Date }[],
): boolean {
  const estKey = normalizeMatchKey(establishmentName);
  const day = dateKeyOf(at);
  const minute = minuteKey(at);
  const matches = (name: string, itemAmount: number, itemAt: Date | null) => {
    if (normalizeMatchKey(name) !== estKey || itemAmount !== amount || !itemAt) {
      return false;
    }
    return dateKeyOf(itemAt) === day || minuteKey(itemAt) === minute;
  };
  if (known.some((item) => matches(item.establishmentName, item.amount, item.collectedAt))) {
    return true;
  }
  return batchFingerprints.some((item) =>
    matches(item.establishmentName, item.amount, item.at),
  );
}

export function sumBuckets(buckets: CollectableBucket[]): number {
  return buckets.reduce((sum, bucket) => sum + bucketUnpaidAmount(bucket.records), 0);
}

export function allocateDeposit(
  buckets: CollectableBucket[],
  amount: number,
  at: Date,
  depositorName: string,
): AccountCollectionWrite[] {
  const parts = collectionPartsFromDate(at);
  const ordered = [...buckets].sort((a, b) => a.date.localeCompare(b.date));
  const total = sumBuckets(ordered);
  if (ordered.length === 0 || amount <= 0 || total <= 0) return [];

  if (amount === total) {
    return ordered.map((bucket) => ({
      records: bucket.records,
      amount: bucketUnpaidAmount(bucket.records),
      depositorName,
      ...parts,
    }));
  }

  if (amount < total) {
    const writes: AccountCollectionWrite[] = [];
    let left = amount;
    for (const bucket of ordered) {
      if (left <= 0) break;
      const unpaid = bucketUnpaidAmount(bucket.records);
      const take = Math.min(unpaid, left);
      writes.push({
        records: bucket.records,
        amount: take,
        depositorName,
        ...parts,
      });
      left -= take;
    }
    return writes;
  }

  const writes = ordered.map((bucket) => ({
    records: bucket.records,
    amount: bucketUnpaidAmount(bucket.records),
    depositorName,
    ...parts,
  }));
  const excess = amount - total;
  writes[writes.length - 1] = {
    ...writes[writes.length - 1],
    amount: writes[writes.length - 1].amount + excess,
  };
  return writes;
}

function cloneBuckets(buckets: CollectableBucket[]): CollectableBucket[] {
  return buckets.map((bucket) => ({
    ...bucket,
    records: [...bucket.records],
  }));
}

function consumeWrites(
  buckets: CollectableBucket[],
  writes: AccountCollectionWrite[],
): CollectableBucket[] {
  const consumedIds = new Set<string>();
  writes.forEach((write) => {
    // 계좌수금은 대상 기록 전체를 TRANSFER 로 바꾸므로, 일부 금액이어도 그 묶음은 다시 쓰지 않는다.
    write.records.forEach((record) => {
      if (record.id) consumedIds.add(record.id);
    });
  });
  return buckets
    .map((bucket) => ({
      ...bucket,
      records: bucket.records.filter((record) => record.id && !consumedIds.has(record.id)),
    }))
    .filter((bucket) => bucket.records.length > 0 && bucketUnpaidAmount(bucket.records) > 0);
}

export function matchDeposits(input: {
  deposits: ParsedDeposit[];
  mappings: DepositorMapping[];
  buckets: CollectableBucket[];
  known: KnownCollection[];
}): DepositMatchRow[] {
  let remaining = cloneBuckets(input.buckets);
  const batchFingerprints: { establishmentName: string; amount: number; at: Date }[] = [];

  return input.deposits.map((deposit, index) => {
    const warnings: string[] = [];
    if (!deposit.hasExplicitDate) warnings.push("날짜가 없어 오늘 날짜로 대조합니다.");
    if (!deposit.hasExplicitTime) warnings.push("시각이 없어 현재 시각으로 대조합니다.");
    const establishmentName = findEstablishmentName(
      deposit.depositorName,
      input.mappings,
      input.known,
    );
    const base = {
      id: `deposit-${deposit.lineNumber}-${index}`,
      lineNumber: deposit.lineNumber,
      raw: deposit.raw,
      depositorName: deposit.depositorName,
      amount: deposit.amount,
      at: deposit.at,
      establishmentName,
      warnings,
    };

    if (!establishmentName) {
      return {
        ...base,
        unpaidAmount: null,
        kind: "업소 불명" as const,
        defaultChecked: false,
        checkable: false,
        note: "입금자 매핑과 기존 수금 기록에서 업소를 찾지 못했습니다.",
      };
    }

    if (
      isDuplicateCollection(
        establishmentName,
        deposit.amount,
        deposit.at,
        input.known,
        batchFingerprints,
      )
    ) {
      batchFingerprints.push({
        establishmentName,
        amount: deposit.amount,
        at: deposit.at,
      });
      const unpaidAmount = sumBuckets(
        remaining.filter(
          (bucket) =>
            normalizeMatchKey(bucket.establishmentName) ===
            normalizeMatchKey(establishmentName),
        ),
      );
      return {
        ...base,
        unpaidAmount,
        kind: "중복 의심" as const,
        defaultChecked: false,
        checkable: false,
        note: "같은 업소·금액·날짜(또는 시각)의 수금이 이미 있습니다.",
      };
    }

    batchFingerprints.push({
      establishmentName,
      amount: deposit.amount,
      at: deposit.at,
    });

    const buckets = remaining.filter(
      (bucket) =>
        normalizeMatchKey(bucket.establishmentName) ===
        normalizeMatchKey(establishmentName),
    );
    const unpaidAmount = sumBuckets(buckets);
    let kind: MatchResultKind;
    if (deposit.amount === unpaidAmount && unpaidAmount > 0) kind = "일치";
    else if (deposit.amount > unpaidAmount) kind = "초과";
    else kind = "미달";

    const checkable = unpaidAmount > 0 && buckets.length > 0;
    if (!checkable) {
      warnings.push("미수(계좌수금 대상) 기록이 없어 기록할 수 없습니다.");
    }

    if (kind === "일치") {
      remaining = consumeWrites(
        remaining,
        allocateDeposit(buckets, deposit.amount, deposit.at, deposit.depositorName),
      );
    }

    const diff = deposit.amount - unpaidAmount;
    const note = !checkable
      ? "미수 기록이 없습니다."
      : kind === "일치"
        ? `미수 ${unpaidAmount.toLocaleString()}원과 같습니다.`
        : kind === "초과"
          ? `미수 ${unpaidAmount.toLocaleString()}원보다 ${diff.toLocaleString()}원 많습니다.`
          : `미수 ${unpaidAmount.toLocaleString()}원보다 ${Math.abs(diff).toLocaleString()}원 적습니다.`;

    return {
      ...base,
      unpaidAmount,
      kind,
      defaultChecked: kind === "일치" && checkable,
      checkable,
      note,
    };
  });
}

export interface PlannedAccountWrite extends AccountCollectionWrite {
  rowId: string;
  establishmentName: string;
  kind: MatchResultKind;
}

export function planCheckedAccountWrites(input: {
  rows: DepositMatchRow[];
  checkedIds: string[];
  buckets: CollectableBucket[];
}): { writes: PlannedAccountWrite[]; skipped: { rowId: string; reason: string }[] } {
  const checked = new Set(input.checkedIds);
  let remaining = cloneBuckets(input.buckets);
  const writes: PlannedAccountWrite[] = [];
  const skipped: { rowId: string; reason: string }[] = [];

  input.rows.forEach((row) => {
    if (!checked.has(row.id)) return;
    if (!row.checkable || row.kind === "업소 불명" || row.kind === "중복 의심") {
      skipped.push({ rowId: row.id, reason: `${row.kind} 건은 기록하지 않습니다.` });
      return;
    }
    if (!row.establishmentName) {
      skipped.push({ rowId: row.id, reason: "업소를 찾지 못했습니다." });
      return;
    }
    const buckets = remaining.filter(
      (bucket) =>
        normalizeMatchKey(bucket.establishmentName) ===
        normalizeMatchKey(row.establishmentName || ""),
    );
    const unpaidAmount = sumBuckets(buckets);
    if (unpaidAmount <= 0) {
      skipped.push({
        rowId: row.id,
        reason: "기록 전에 미수가 없어져 건너뜁니다.",
      });
      return;
    }
    if (row.kind === "일치" && unpaidAmount !== row.amount) {
      skipped.push({
        rowId: row.id,
        reason: "미리보기 뒤 미수 금액이 바뀌어 일치 건을 건너뜁니다.",
      });
      return;
    }
    if (row.kind === "미달" && !(row.amount < unpaidAmount)) {
      skipped.push({
        rowId: row.id,
        reason: "미리보기 뒤 미수 상태가 바뀌어 미달 건을 건너뜁니다.",
      });
      return;
    }
    if (row.kind === "초과" && !(row.amount > unpaidAmount)) {
      skipped.push({
        rowId: row.id,
        reason: "미리보기 뒤 미수 상태가 바뀌어 초과 건을 건너뜁니다.",
      });
      return;
    }
    const planned = allocateDeposit(
      buckets,
      row.amount,
      row.at,
      row.depositorName,
    ).map((write) => ({
      ...write,
      rowId: row.id,
      establishmentName: row.establishmentName || "",
      kind: row.kind,
    }));
    writes.push(...planned);
    remaining = consumeWrites(remaining, planned);
  });

  return { writes, skipped };
}

export interface CollectionBackupRecord {
  id?: string;
  establishmentName: string;
  staffName: string;
  date: string;
  totalAmount: number;
  paymentMethod?: PaymentMethod;
  collectedAt: string | null;
  additionalCollectedAt: string | null;
  collectedAmount?: number;
  depositorName?: string | null;
  isPass?: boolean;
  isDispatchBoxCollection?: boolean;
  wasUnpaid?: boolean;
  collectionHistory: unknown[];
}

export interface CollectionBackupFile {
  version: 1;
  createdAt: string;
  purpose: "deposit-match-approve";
  note: string;
  rows: Array<{
    establishmentName: string | null;
    depositorName: string;
    amount: number;
    kind: MatchResultKind;
  }>;
  records: CollectionBackupRecord[];
}

function timestampToIso(raw: unknown): string | null {
  const date = readDate(raw);
  return date ? date.toISOString() : null;
}

export function buildCollectionBackup(input: {
  records: DispatchRecord[];
  establishmentNames: string[];
  rows: DepositMatchRow[];
  now?: Date;
}): CollectionBackupFile {
  const names = new Set(input.establishmentNames.map((name) => normalizeMatchKey(name)));
  const related = input.records.filter((record) => {
    if (!names.has(normalizeMatchKey(record.establishmentName || ""))) return false;
    const hasHistory =
      Array.isArray(record.collectionHistory) && record.collectionHistory.length > 0;
    return (
      !record.paymentMethod ||
      record.paymentMethod === "UNPAID" ||
      hasHistory ||
      Boolean(record.collectedAt) ||
      (record.collectedAmount || 0) > 0
    );
  });

  return {
    version: 1,
    createdAt: (input.now || new Date()).toISOString(),
    purpose: "deposit-match-approve",
    note: "계좌수금 기록 직전 스냅샷입니다. 기존 문서를 지우거나 고치는 기능은 없으므로, 되돌릴 때는 이 파일의 수금 필드를 확인한 뒤 화면의 기존 수금 취소를 사용하세요.",
    rows: input.rows.map((row) => ({
      establishmentName: row.establishmentName,
      depositorName: row.depositorName,
      amount: row.amount,
      kind: row.kind,
    })),
    records: related.map((record) => ({
      id: record.id,
      establishmentName: record.establishmentName,
      staffName: record.staffName,
      date: record.date,
      totalAmount: record.totalAmount,
      paymentMethod: record.paymentMethod,
      collectedAt: timestampToIso(record.collectedAt),
      additionalCollectedAt: timestampToIso(record.additionalCollectedAt),
      collectedAmount: record.collectedAmount,
      depositorName: record.depositorName ?? null,
      isPass: record.isPass,
      isDispatchBoxCollection: record.isDispatchBoxCollection,
      wasUnpaid: record.wasUnpaid,
      collectionHistory: (record.collectionHistory || []).map((entry) => ({
        ...entry,
        collectedAt: timestampToIso(entry.collectedAt),
      })),
    })),
  };
}

export function collectionBackupFilename(now: Date = new Date()): string {
  const parts = collectionPartsFromDate(now);
  return `수금백업_${now.getFullYear()}${parts.dateStr}_${parts.timeStr}.json`;
}
