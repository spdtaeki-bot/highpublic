import { deferWhileCollectTyping } from "../lib/collectTypingGate";
import {
  collectionOperationAlreadyExists,
  type BulkCollectionOperation,
  type BulkCollectionSaveResult,
} from "../lib/bulkCollect";
import {
  buildEstablishmentAdditionalCollectUpdates,
  getRecordBusinessDate,
} from "../lib/utils";
import type { ActiveChoice, BouncedRecord, DispatchRecord, Staff, StaffType } from "../types";
import {
  buildSampleRecords,
  buildSampleStaff,
  previewStamp,
  SAMPLE_DATE,
  SAMPLE_ESTABLISHMENTS,
} from "./sampleData";

const records = buildSampleRecords();
const staff = buildSampleStaff();
const establishments = SAMPLE_ESTABLISHMENTS.map((name, index) => ({
  id: `est-${index + 1}`,
  name,
}));
const bounced: BouncedRecord[] = [];
const attendance = new Map<
  string,
  {
    staffIds: string[];
    offStaffIds: string[];
    checkInTimes: Record<string, ReturnType<typeof previewStamp>>;
    offTimes: Record<string, ReturnType<typeof previewStamp>>;
    manualDailyProfits: Record<string, number>;
    activeChoices: Record<string, ActiveChoice>;
  }
>();

attendance.set(SAMPLE_DATE, {
  staffIds: staff.map((person) => person.id!),
  offStaffIds: [],
  checkInTimes: Object.fromEntries(
    staff.map((person) => [person.id!, previewStamp(`${SAMPLE_DATE}T18:10:00`)]),
  ),
  offTimes: {},
  manualDailyProfits: {},
  activeChoices: {},
});

const dispatchListeners = new Set<() => void>();
const unpaidListeners = new Set<() => void>();
const staffListeners = new Set<() => void>();
const establishmentListeners = new Set<() => void>();
const attendanceListeners = new Set<() => void>();
const bouncedListeners = new Set<() => void>();

if (typeof window !== "undefined") {
  (window as any).__HIGH_PUBLIC_PREVIEW_LISTENERS__ = () => ({
    dispatch: dispatchListeners.size,
    unpaid: unpaidListeners.size,
    staff: staffListeners.size,
    establishments: establishmentListeners.size,
    attendance: attendanceListeners.size,
    bounced: bouncedListeners.size,
  });
}

function emitAll() {
  deferWhileCollectTyping("sample-updates", () => {
    dispatchListeners.forEach((listener) => listener());
    unpaidListeners.forEach((listener) => listener());
    staffListeners.forEach((listener) => listener());
    establishmentListeners.forEach((listener) => listener());
    attendanceListeners.forEach((listener) => listener());
    bouncedListeners.forEach((listener) => listener());
  });
}

function isDeleteField(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      "_methodName" in value &&
      (value as { _methodName?: string })._methodName === "deleteField",
  );
}

function applyPatch(target: Record<string, unknown>, patch: Record<string, unknown>) {
  for (const [key, value] of Object.entries(patch)) {
    if (isDeleteField(value)) delete target[key];
    else target[key] = value;
  }
}

export const checkTimeOverlap = (
  existing: DispatchRecord[],
  staffName: string,
  startTime: Date,
  endTime: Date,
  excludeIds?: string | string[],
) => {
  const excluded = Array.isArray(excludeIds) ? excludeIds : excludeIds ? [excludeIds] : [];
  const isNewOngoing = startTime.getTime() === endTime.getTime();
  return existing.some((record) => {
    if (record.id && excluded.includes(record.id)) return false;
    if (record.staffName !== staffName) return false;
    const start = record.startTime.toDate ? record.startTime.toDate() : new Date(record.startTime);
    const end = record.endTime.toDate ? record.endTime.toDate() : new Date(record.endTime);
    const isExistingOngoing = start.getTime() === end.getTime();
    if (isExistingOngoing) return isNewOngoing || endTime > start;
    if (isNewOngoing) return end > startTime;
    return startTime < end && endTime > start;
  });
};

export const subscribeToDispatches = (
  date: string,
  callback: (records: DispatchRecord[]) => void,
) => {
  const emit = () => callback(records.filter((record) => record.date === date));
  dispatchListeners.add(emit);
  emit();
  return () => dispatchListeners.delete(emit);
};

export const subscribeToAllUnpaidDispatches = (callback: (records: DispatchRecord[]) => void) => {
  const emit = () => callback(records.filter((record) => record.wasUnpaid));
  unpaidListeners.add(emit);
  emit();
  return () => unpaidListeners.delete(emit);
};

export const subscribeToUnpaidStaffDispatches = (callback: (records: DispatchRecord[]) => void) => {
  const emit = () => callback(records.filter((record) => record.isStaffPaid === false));
  unpaidListeners.add(emit);
  emit();
  return () => unpaidListeners.delete(emit);
};

export const fetchPaidStaffDispatches = async () =>
  records.filter((record) => record.isStaffPaid === true);

export const subscribeToBouncedRecords = (
  date: string,
  callback: (records: BouncedRecord[]) => void,
) => {
  const emit = () => callback(bounced.filter((record) => record.date === date));
  bouncedListeners.add(emit);
  emit();
  return () => bouncedListeners.delete(emit);
};

export const subscribeToStaff = (callback: (staffList: Staff[]) => void) => {
  const emit = () => callback(staff.map((person) => ({ ...person })));
  staffListeners.add(emit);
  emit();
  return () => staffListeners.delete(emit);
};

export const subscribeToEstablishments = (
  callback: (items: { id: string; name: string }[]) => void,
) => {
  const emit = () => callback(establishments.map((item) => ({ ...item })));
  establishmentListeners.add(emit);
  emit();
  return () => establishmentListeners.delete(emit);
};

export const subscribeToAttendance = (
  date: string,
  callback: (data: {
    staffIds: string[];
    offStaffIds: string[];
    checkInTimes?: Record<string, unknown>;
    offTimes?: Record<string, unknown>;
    manualDailyProfits?: Record<string, number>;
    activeChoices?: Record<string, ActiveChoice>;
  }) => void,
) => {
  const emit = () => {
    const day = attendance.get(date);
    callback({
      staffIds: day?.staffIds || [],
      offStaffIds: day?.offStaffIds || [],
      checkInTimes: day?.checkInTimes || {},
      offTimes: day?.offTimes || {},
      manualDailyProfits: day?.manualDailyProfits || {},
      activeChoices: day?.activeChoices || {},
    });
  };
  attendanceListeners.add(emit);
  emit();
  return () => attendanceListeners.delete(emit);
};

export const subscribeToWeeklyAttendance = (
  startDate: string,
  endDate: string,
  callback: (attendanceList: Array<{ date: string; staffIds: string[]; checkInTimes?: Record<string, unknown> }>) => void,
) => {
  const emit = () => {
    callback(
      [...attendance.entries()]
        .filter(([date]) => date >= startDate && date <= endDate)
        .map(([date, day]) => ({
          date,
          staffIds: day.staffIds,
          checkInTimes: day.checkInTimes,
        })),
    );
  };
  attendanceListeners.add(emit);
  emit();
  return () => attendanceListeners.delete(emit);
};

export const subscribeToDispatchesByDateRange = (
  startDate: string,
  endDate: string,
  callback: (rows: DispatchRecord[]) => void,
) => {
  const emit = () =>
    callback(records.filter((record) => record.date >= startDate && record.date <= endDate));
  dispatchListeners.add(emit);
  emit();
  return () => dispatchListeners.delete(emit);
};

export const subscribeToBouncedByDateRange = (
  startDate: string,
  endDate: string,
  callback: (rows: BouncedRecord[]) => void,
) => {
  const emit = () =>
    callback(bounced.filter((record) => record.date >= startDate && record.date <= endDate));
  bouncedListeners.add(emit);
  emit();
  return () => bouncedListeners.delete(emit);
};

export const subscribeToAttendanceByDateRange = subscribeToWeeklyAttendance;

export const updateDispatch = async (id: string, data: Partial<DispatchRecord>) => {
  const record = records.find((item) => item.id === id);
  if (!record) return;
  applyPatch(record as unknown as Record<string, unknown>, data as Record<string, unknown>);
  emitAll();
};

export const updateDispatchesAtomically = async (
  updates: Array<{ id: string; updates: Partial<DispatchRecord> }>,
) => {
  updates.forEach(({ id, updates: patch }) => {
    const record = records.find((item) => item.id === id);
    if (record) {
      applyPatch(
        record as unknown as Record<string, unknown>,
        patch as Record<string, unknown>,
      );
    }
  });
  emitAll();
};

export const applyBulkCollectionsAtomically = async (
  operations: BulkCollectionOperation[],
): Promise<BulkCollectionSaveResult> => {
  const appliedOperationIds: string[] = [];
  const skippedOperationIds: string[] = [];

  for (const operation of operations) {
    const targetRecords = operation.recordIds.flatMap((id) => {
      const record = records.find((item) => item.id === id);
      return record ? [record] : [];
    });
    if (
      targetRecords.length !== operation.recordIds.length ||
      targetRecords.some(
        (record) =>
          record.establishmentName !== operation.establishmentName ||
          getRecordBusinessDate(record) !== operation.businessDate,
      )
    ) {
      throw new Error(`[${operation.establishmentName}] 저장 대상이 변경되었습니다.`);
    }
    if (
      collectionOperationAlreadyExists(targetRecords, operation.operationId) ||
      (
        !operation.duplicateOverride &&
        collectionOperationAlreadyExists(
          targetRecords,
          operation.operationId,
          operation,
        )
      )
    ) {
      skippedOperationIds.push(operation.operationId);
      continue;
    }

    const { updates, error } = buildEstablishmentAdditionalCollectUpdates(
      targetRecords,
      {
        method: operation.method,
        additionalAmount: operation.amount,
        depositorName: operation.depositorName,
        operationId: operation.operationId,
        collectedAt: previewStamp(operation.collectedAt.toISOString()),
      },
    );
    if (error) throw new Error(`[${operation.establishmentName}] ${error}`);
    updates.forEach(({ id, updates: patch }) => {
      const record = records.find((item) => item.id === id);
      if (record) applyPatch(record as unknown as Record<string, unknown>, patch);
    });
    appliedOperationIds.push(operation.operationId);
  }

  emitAll();
  return { appliedOperationIds, skippedOperationIds };
};

export const payUnpaidDispatches = async (
  ids: string[],
  method: "CASH" | "TRANSFER",
  paidAt: unknown,
) => {
  let updated = 0;
  for (const id of ids) {
    const record = records.find((item) => item.id === id);
    if (!record || record.isStaffPaid) continue;
    record.isStaffPaid = true;
    record.staffPaymentMethod = method;
    record.staffPaidAt = paidAt;
    updated += 1;
  }
  emitAll();
  return updated;
};

export const addDispatch = async (data: Partial<DispatchRecord> & { date: string }) => {
  const id = `sample-${records.length + 1}`;
  records.unshift({
    id,
    uid: "sample",
    createdAt: previewStamp(new Date().toISOString()),
    durationHours: 0,
    totalAmount: 0,
    commission: 0,
    staffPayment: 0,
    paymentMethod: "UNPAID",
    systemType: "TABLE",
    staffName: "",
    establishmentName: "",
    startTime: previewStamp(new Date().toISOString()),
    endTime: previewStamp(new Date().toISOString()),
    ...data,
  } as DispatchRecord);
  emitAll();
  return id;
};

export const deleteDispatch = async (id: string) => {
  const index = records.findIndex((record) => record.id === id);
  if (index >= 0) records.splice(index, 1);
  emitAll();
};

export const addBouncedRecord = async (data: Omit<BouncedRecord, "id" | "createdAt" | "uid">) => {
  bounced.push({
    ...data,
    id: `bounce-${bounced.length + 1}`,
    uid: "sample",
    createdAt: previewStamp(new Date().toISOString()),
  });
  emitAll();
};

export const deleteBouncedRecord = async (id: string) => {
  const index = bounced.findIndex((record) => record.id === id);
  if (index >= 0) bounced.splice(index, 1);
  emitAll();
};

export const addStaff = async (
  name: string,
  type: StaffType = "COFFEE",
  employmentType?: "DIRECT" | "DELEGATED",
) => {
  staff.push({
    id: `staff-${staff.length + 1}`,
    name: name.trim(),
    active: true,
    uid: "sample",
    createdAt: previewStamp(new Date().toISOString()),
    type,
    employmentType,
  });
  emitAll();
};

export const updateStaff = async (id: string, data: Partial<Staff>) => {
  const person = staff.find((item) => item.id === id);
  if (person) Object.assign(person, data);
  emitAll();
};

export const deleteStaff = async (id: string) => {
  const index = staff.findIndex((item) => item.id === id);
  if (index >= 0) staff.splice(index, 1);
  emitAll();
};

export const addEstablishment = async (name: string) => {
  establishments.push({ id: `est-${establishments.length + 1}`, name });
  emitAll();
};

export const deleteEstablishment = async (id: string) => {
  const index = establishments.findIndex((item) => item.id === id);
  if (index >= 0) establishments.splice(index, 1);
  emitAll();
};

function ensureAttendance(date: string) {
  if (!attendance.has(date)) {
    attendance.set(date, {
      staffIds: [],
      offStaffIds: [],
      checkInTimes: {},
      offTimes: {},
      manualDailyProfits: {},
      activeChoices: {},
    });
  }
  return attendance.get(date)!;
}

export const updateAttendance = async (
  date: string,
  staffIds: string[],
  offStaffIds: string[] = [],
  offTimes: Record<string, ReturnType<typeof previewStamp>> = {},
  customCheckInTimes?: Record<string, ReturnType<typeof previewStamp>>,
  manualDailyProfits?: Record<string, number>,
  activeChoices?: Record<string, ActiveChoice>,
) => {
  const day = ensureAttendance(date);
  day.staffIds = staffIds;
  day.offStaffIds = offStaffIds;
  day.offTimes = offTimes;
  if (customCheckInTimes) day.checkInTimes = { ...day.checkInTimes, ...customCheckInTimes };
  if (manualDailyProfits) day.manualDailyProfits = manualDailyProfits;
  if (activeChoices) day.activeChoices = activeChoices;
  emitAll();
};

export const updateActiveChoices = async (
  _date: string,
  choices: Record<string, ActiveChoice>,
) => {
  const day = ensureAttendance(_date);
  day.activeChoices = choices;
  emitAll();
};

export const setActiveChoicesMultiple = async (
  date: string,
  staffNames: string[],
  establishmentName: string,
  choiceTime: string,
) => {
  const day = ensureAttendance(date);
  for (const name of staffNames) {
    day.activeChoices[name] = { establishmentName, choiceTime };
  }
  emitAll();
};

export const removeActiveChoicesMultiple = async (date: string, names: string[]) => {
  const day = ensureAttendance(date);
  for (const name of names) delete day.activeChoices[name];
  emitAll();
};

export const updateManualDailyProfit = async (
  staffName: string,
  date: string,
  amount: number | null,
) => {
  const day = ensureAttendance(date);
  if (amount === null) delete day.manualDailyProfits[staffName];
  else day.manualDailyProfits[staffName] = amount;
  emitAll();
};

export const updateManualDailyProfitsMultiple = async (
  profits: Record<string, number | null>,
  date: string,
) => {
  const day = ensureAttendance(date);
  for (const [name, amount] of Object.entries(profits)) {
    if (amount === null) delete day.manualDailyProfits[name];
    else day.manualDailyProfits[name] = amount;
  }
  emitAll();
};
