import { 
  collection, 
  addDoc, 
  updateDoc,
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase';
import { DispatchRecord, BouncedRecord, SYSTEM_RATES, COMMISSION_RATE, SystemType, StaffType, ActiveChoice } from '../types';

const COLLECTION_NAME = 'dispatches';
const BOUNCED_COLLECTION = 'bounced_records';
const STAFF_COLLECTION = 'staff';
const ATTENDANCE_COLLECTION = 'attendance';
const ESTABLISHMENT_COLLECTION = 'establishments';
const FIXED_UID = 'office_admin';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

/**
 * Recursively removes any `undefined` values from objects and arrays so Firestore
 * does not throw 'Unsupported field value: undefined' errors.
 */
export const sanitizeForFirestore = <T>(obj: T): T => {
  if (obj === null || obj === undefined) {
    return obj;
  }
  // Preserve Timestamps and JS Dates
  if (
    typeof obj === 'object' &&
    (obj instanceof Timestamp ||
      obj instanceof Date ||
      (typeof (obj as any).toDate === 'function' && typeof (obj as any).seconds === 'number'))
  ) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj
      .map((item) => sanitizeForFirestore(item))
      .filter((item) => item !== undefined) as unknown as T;
  }
  if (typeof obj === 'object') {
    const cleanObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        const cleanedValue = sanitizeForFirestore(value);
        if (cleanedValue !== undefined) {
          cleanObj[key] = cleanedValue;
        }
      }
    }
    return cleanObj as T;
  }
  return obj;
};

function getErrorInfo(error: unknown, operationType: OperationType, path: string | null) {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: FIXED_UID,
      email: 'no-auth',
      emailVerified: true,
      isAnonymous: true,
      tenantId: '',
      providerInfo: []
    },
    operationType,
    path
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = getErrorInfo(error, operationType, path);
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const testConnection = async () => {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
};

export const checkTimeOverlap = (records: DispatchRecord[], staffName: string, startTime: Date, endTime: Date, excludeIds?: string | string[]) => {
  const excludeIdsArray = Array.isArray(excludeIds) ? excludeIds : (excludeIds ? [excludeIds] : []);
  
  return records.some(record => {
    if (record.id && excludeIdsArray.includes(record.id)) return false;
    if (record.staffName !== staffName) return false;
    
    const rStart = record.startTime.toDate ? record.startTime.toDate() : new Date(record.startTime);
    const rEnd = record.endTime.toDate ? record.endTime.toDate() : new Date(record.endTime);
    
    return (startTime < rEnd) && (endTime > rStart);
  });
};

// Staff Management
export const addStaff = async (
  name: string,
  type: StaffType = 'COFFEE',
  employmentType?: "DIRECT" | "DELEGATED",
  office?: string
) => {
  try {
    const trimmed = (name || '').trim();
    const cleanNoSpace = trimmed.replace(/\s+/g, '');
    let autoEmpType: "DIRECT" | "DELEGATED" = cleanNoSpace.length <= 4 ? "DIRECT" : "DELEGATED";
    let autoOffice = "";
    if (autoEmpType === "DIRECT") {
      autoOffice = "직속";
    } else {
      const parts = trimmed.split(/\s+/).filter(Boolean);
      if (parts.length >= 3) {
        autoOffice = parts.slice(2).join(" ").trim();
      } else if (parts.length === 2 && parts[1].length > 2) {
        autoOffice = parts[1].slice(2).trim();
      } else {
        autoOffice = cleanNoSpace.slice(4).trim();
      }
      autoOffice = autoOffice.replace(/^[\(\[\{]+|[\)\]\}]+$/g, "").trim() || "위탁";
    }

    await addDoc(collection(db, STAFF_COLLECTION), {
      name: trimmed,
      active: true,
      uid: FIXED_UID,
      createdAt: Timestamp.now(),
      type,
      employmentType: employmentType || autoEmpType,
      office: office || autoOffice
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, STAFF_COLLECTION);
  }
};

export const updateStaff = async (id: string, data: Partial<any>) => {
  try {
    // 1. 이름 변경 여부 확인을 위해 기존 직원 정보 가져오기
    const staffDocRef = doc(db, STAFF_COLLECTION, id);
    const staffSnapshot = await getDoc(staffDocRef);
    
    let oldName = '';
    let nameChanged = false;
    let existingPreviousNames: string[] = [];
    
    if (staffSnapshot.exists()) {
      const oldData = staffSnapshot.data();
      oldName = oldData.name;
      existingPreviousNames = oldData.previousNames || [];
      if (data.name && data.name.trim() !== oldName.trim()) {
        nameChanged = true;
      }
    }
    
    // Prepare update payload
    const updatePayload = { ...data };
    if (nameChanged && oldName) {
      const updatedPreviousNames = Array.from(new Set([
        ...existingPreviousNames,
        oldName,
        oldName.trim()
      ])).filter(Boolean);
      updatePayload.previousNames = updatedPreviousNames;
    }
    
    // 2. 직원 정보 업데이트
    await updateDoc(staffDocRef, updatePayload);
    
    // 3. 직원 이름이 실제로 변경된 경우, 연관 데이터(dispatches의 staffName, attendance의 manualDailyProfits)를 안전하게 업데이트
    if (nameChanged && oldName) {
      const newName = data.name.trim();
      
      // Let's search for dispatches of oldName or oldName.trim()
      const namesToFind = Array.from(new Set([oldName, oldName.trim()])).filter(Boolean);
      
      for (const targetName of namesToFind) {
        // A. dispatches 내의 해당 직원의 기록들을 찾아 모두 업데이트
        const dispatchesQuery = query(
          collection(db, COLLECTION_NAME),
          where('uid', '==', FIXED_UID),
          where('staffName', '==', targetName)
        );
        const dispatchesSnapshot = await getDocs(dispatchesQuery);
        
        if (!dispatchesSnapshot.empty) {
          const docs = dispatchesSnapshot.docs;
          const batchSize = 100;
          for (let i = 0; i < docs.length; i += batchSize) {
            const chunk = docs.slice(i, i + batchSize);
            await Promise.all(chunk.map(doc => 
              updateDoc(doc.ref, { staffName: newName })
            ));
          }
        }
      }
      
      // B. attendance 내의 manualDailyProfits 기입 정보 업데이트
      const attendanceQuery = query(
        collection(db, ATTENDANCE_COLLECTION),
        where('uid', '==', FIXED_UID)
      );
      const attendanceSnapshot = await getDocs(attendanceQuery);
      
      if (!attendanceSnapshot.empty) {
        await Promise.all(attendanceSnapshot.docs.map(async (doc) => {
          const attData = doc.data();
          const manualDailyProfits = attData.manualDailyProfits || {};
          let updated = false;
          const updatedProfits = { ...manualDailyProfits };
          
          for (const targetName of namesToFind) {
            if (Object.prototype.hasOwnProperty.call(updatedProfits, targetName)) {
              const val = updatedProfits[targetName];
              delete updatedProfits[targetName];
              updatedProfits[newName] = val;
              updated = true;
            }
          }
          
          if (updated) {
            await updateDoc(doc.ref, { manualDailyProfits: updatedProfits });
          }
        }));
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${STAFF_COLLECTION}/${id}`);
  }
};

export const deleteStaff = async (id: string) => {
  try {
    await deleteDoc(doc(db, STAFF_COLLECTION, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${STAFF_COLLECTION}/${id}`);
  }
};

export const subscribeToStaff = (callback: (staff: any[]) => void, onError?: (error: Error) => void) => {
  const q = query(
    collection(db, STAFF_COLLECTION),
    where('uid', '==', FIXED_UID),
    orderBy('name', 'asc')
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }, (error) => {
    if (onError) onError(error);
    const errInfo = getErrorInfo(error, OperationType.LIST, STAFF_COLLECTION);
    console.error('Firestore Subscription Error: ', JSON.stringify(errInfo));
  });
};

// Attendance Management
export const updateAttendance = async (date: string, staffIds: string[], offStaffIds: string[] = [], offTimes: Record<string, any> = {}, customCheckInTimes?: Record<string, any>, manualDailyProfits?: Record<string, number>, activeChoices?: Record<string, ActiveChoice>) => {
  const id = `${FIXED_UID}_${date}`;
  try {
    const docRef = doc(db, ATTENDANCE_COLLECTION, id);
    const existingDoc = await getDoc(docRef);
    let checkInTimes: Record<string, any> = {};
    let existingManualDailyProfits: Record<string, number> = {};
    let existingActiveChoices: Record<string, ActiveChoice> = {};

    if (existingDoc.exists()) {
      checkInTimes = existingDoc.data().checkInTimes || {};
      existingManualDailyProfits = existingDoc.data().manualDailyProfits || {};
      existingActiveChoices = existingDoc.data().activeChoices || {};
    }

    // Use custom checkInTimes if provided, otherwise merge existing/new
    const newCheckInTimes: Record<string, any> = {};
    staffIds.forEach(staffId => {
      if (customCheckInTimes && customCheckInTimes[staffId]) {
        newCheckInTimes[staffId] = customCheckInTimes[staffId];
      } else if (checkInTimes[staffId]) {
        newCheckInTimes[staffId] = checkInTimes[staffId];
      } else {
        newCheckInTimes[staffId] = Timestamp.now();
      }
    });

    const finalManualDailyProfits = manualDailyProfits || existingManualDailyProfits;
    const finalActiveChoices = activeChoices !== undefined ? activeChoices : existingActiveChoices;

    await setDoc(docRef, {
      date,
      staffIds,
      checkInTimes: newCheckInTimes,
      offStaffIds,
      offTimes,
      manualDailyProfits: finalManualDailyProfits,
      activeChoices: sanitizeForFirestore(finalActiveChoices),
      uid: FIXED_UID
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, ATTENDANCE_COLLECTION);
  }
};

export const updateActiveChoices = async (
  date: string,
  activeChoices: Record<string, ActiveChoice>
) => {
  const id = `${FIXED_UID}_${date}`;
  try {
    const docRef = doc(db, ATTENDANCE_COLLECTION, id);
    const existingDoc = await getDoc(docRef);
    if (existingDoc.exists()) {
      await updateDoc(docRef, {
        activeChoices: sanitizeForFirestore(activeChoices),
      });
    } else {
      await setDoc(docRef, {
        date,
        staffIds: [],
        offStaffIds: [],
        checkInTimes: {},
        offTimes: {},
        manualDailyProfits: {},
        activeChoices: sanitizeForFirestore(activeChoices),
        uid: FIXED_UID,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${ATTENDANCE_COLLECTION}/${id}`);
  }
};

export const setActiveChoicesMultiple = async (
  date: string,
  staffNames: string[],
  establishmentName: string,
  choiceTime: string
) => {
  const id = `${FIXED_UID}_${date}`;
  try {
    const docRef = doc(db, ATTENDANCE_COLLECTION, id);
    const existingDoc = await getDoc(docRef);
    let activeChoices: Record<string, ActiveChoice> = {};
    if (existingDoc.exists()) {
      activeChoices = { ...(existingDoc.data().activeChoices || {}) };
    }
    staffNames.forEach((name) => {
      activeChoices[name] = {
        establishmentName,
        choiceTime,
        createdAt: Timestamp.now(),
      };
    });
    if (existingDoc.exists()) {
      await updateDoc(docRef, {
        activeChoices: sanitizeForFirestore(activeChoices),
      });
    } else {
      await setDoc(docRef, {
        date,
        staffIds: [],
        offStaffIds: [],
        checkInTimes: {},
        offTimes: {},
        manualDailyProfits: {},
        activeChoices: sanitizeForFirestore(activeChoices),
        uid: FIXED_UID,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${ATTENDANCE_COLLECTION}/${id}`);
  }
};

export const removeActiveChoicesMultiple = async (
  date: string,
  staffNames: string[]
) => {
  const id = `${FIXED_UID}_${date}`;
  try {
    const docRef = doc(db, ATTENDANCE_COLLECTION, id);
    const existingDoc = await getDoc(docRef);
    if (!existingDoc.exists()) return;
    const activeChoices: Record<string, ActiveChoice> = {
      ...(existingDoc.data().activeChoices || {}),
    };
    staffNames.forEach((name) => {
      delete activeChoices[name];
    });
    await updateDoc(docRef, {
      activeChoices: sanitizeForFirestore(activeChoices),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${ATTENDANCE_COLLECTION}/${id}`);
  }
};

export const updateManualDailyProfit = async (staffName: string, date: string, amount: number | null) => {
  const id = `${FIXED_UID}_${date}`;
  try {
    const docRef = doc(db, ATTENDANCE_COLLECTION, id);
    const existingDoc = await getDoc(docRef);
    
    let manualDailyProfits = {};
    if (existingDoc.exists()) {
      manualDailyProfits = existingDoc.data().manualDailyProfits || {};
    }
    
    if (amount === null) {
      delete (manualDailyProfits as any)[staffName];
    } else {
      (manualDailyProfits as any)[staffName] = amount;
    }
    
    if (existingDoc.exists()) {
      await updateDoc(docRef, { manualDailyProfits });
    } else {
      await setDoc(docRef, {
        date,
        staffIds: [],
        offStaffIds: [],
        checkInTimes: {},
        offTimes: {},
        manualDailyProfits,
        activeChoices: {},
        uid: FIXED_UID
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${ATTENDANCE_COLLECTION}/${id}`);
  }
};

export const updateManualDailyProfitsMultiple = async (
  updates: Record<string, number | null>,
  date: string
) => {
  const id = `${FIXED_UID}_${date}`;
  try {
    const docRef = doc(db, ATTENDANCE_COLLECTION, id);
    const existingDoc = await getDoc(docRef);
    
    let manualDailyProfits: Record<string, number> = {};
    if (existingDoc.exists()) {
      manualDailyProfits = { ...(existingDoc.data().manualDailyProfits || {}) };
    }
    
    Object.entries(updates).forEach(([staffName, amount]) => {
      if (amount === null) {
        delete manualDailyProfits[staffName];
      } else {
        manualDailyProfits[staffName] = amount;
      }
    });
    
    if (existingDoc.exists()) {
      await updateDoc(docRef, { manualDailyProfits });
    } else {
      await setDoc(docRef, {
        date,
        staffIds: [],
        offStaffIds: [],
        checkInTimes: {},
        offTimes: {},
        manualDailyProfits,
        activeChoices: {},
        uid: FIXED_UID
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${ATTENDANCE_COLLECTION}/${id}`);
  }
};

export const subscribeToAttendance = (date: string, callback: (data: { staffIds: string[], offStaffIds: string[], checkInTimes?: Record<string, any>, offTimes?: Record<string, any>, manualDailyProfits?: Record<string, number>, activeChoices?: Record<string, ActiveChoice> }) => void, onError?: (error: Error) => void) => {
  const id = `${FIXED_UID}_${date}`;
  return onSnapshot(doc(db, ATTENDANCE_COLLECTION, id), (doc) => {
    if (doc.exists()) {
      const data = doc.data();
      callback({
        staffIds: data.staffIds || [],
        offStaffIds: data.offStaffIds || [],
        checkInTimes: data.checkInTimes || {},
        offTimes: data.offTimes || {},
        manualDailyProfits: data.manualDailyProfits || {},
        activeChoices: data.activeChoices || {},
      });
    } else {
      callback({ staffIds: [], offStaffIds: [], checkInTimes: {}, offTimes: {}, manualDailyProfits: {}, activeChoices: {} });
    }
  }, (error) => {
    if (onError) onError(error);
    const errInfo = getErrorInfo(error, OperationType.GET, ATTENDANCE_COLLECTION);
    console.error('Firestore Subscription Error: ', JSON.stringify(errInfo));
  });
};

export const subscribeToWeeklyAttendance = (
  startDate: string,
  endDate: string,
  callback: (attendanceList: Array<{ date: string; staffIds: string[]; checkInTimes?: Record<string, any> }>) => void,
  onError?: (error: Error) => void
) => {
  const q = query(
    collection(db, ATTENDANCE_COLLECTION),
    where('uid', '==', FIXED_UID),
    where('date', '>=', startDate),
    where('date', '<=', endDate)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        date: doc.data().date,
        staffIds: doc.data().staffIds || [],
        checkInTimes: doc.data().checkInTimes || {},
      }));
      callback(data);
    },
    (error) => {
      if (onError) onError(error);
      const errInfo = getErrorInfo(error, OperationType.LIST, ATTENDANCE_COLLECTION);
      console.error('Firestore Weekly Attendance Subscription Error: ', JSON.stringify(errInfo));
    }
  );
};

// Establishment Management
export const addEstablishment = async (name: string) => {
  try {
    const q = query(
      collection(db, ESTABLISHMENT_COLLECTION),
      where('uid', '==', FIXED_UID),
      where('name', '==', name)
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) return;

    await addDoc(collection(db, ESTABLISHMENT_COLLECTION), {
      name,
      uid: FIXED_UID,
      createdAt: Timestamp.now()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, ESTABLISHMENT_COLLECTION);
  }
};

export const subscribeToEstablishments = (callback: (establishments: any[]) => void, onError?: (error: Error) => void) => {
  const q = query(
    collection(db, ESTABLISHMENT_COLLECTION),
    where('uid', '==', FIXED_UID),
    orderBy('name', 'asc')
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }, (error) => {
    if (onError) onError(error);
    const errInfo = getErrorInfo(error, OperationType.LIST, ESTABLISHMENT_COLLECTION);
    console.error('Firestore Subscription Error: ', JSON.stringify(errInfo));
  });
};

export const deleteEstablishment = async (id: string) => {
  try {
    await deleteDoc(doc(db, ESTABLISHMENT_COLLECTION, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${ESTABLISHMENT_COLLECTION}/${id}`);
  }
};

const calculateDispatchStats = (data: { startTime: any, endTime: any, systemType: SystemType, isBanti?: boolean, isNoBanti?: boolean, isRoundUp?: boolean, isRoundDownHalf?: boolean, isRoundDownFull?: boolean, extraFullUnits?: number, staffName: string, date: string, tip?: number }, existingRecords: DispatchRecord[]) => {
  const start = data.startTime instanceof Date ? data.startTime : (data.startTime.toDate ? data.startTime.toDate() : new Date(data.startTime));
  const end = data.endTime instanceof Date ? data.endTime : (data.endTime.toDate ? data.endTime.toDate() : new Date(data.endTime));
  
  const durationMs = end.getTime() - start.getTime();
  const durationMinutes = Math.max(0, Math.floor(durationMs / 60000));
  const fullHours = Math.floor(durationMinutes / 60);
  const leftoverMinutes = durationMinutes % 60;

  let extraHours = 0;
  let isFullHourEquivalent = false;

  if (data.isRoundUp) {
    if (leftoverMinutes > 0) {
      extraHours = 1.0;
      isFullHourEquivalent = true;
    } else {
      extraHours = 0.0;
    }
  } else if (data.isRoundDownFull) {
    extraHours = -1.0;
  } else if (data.isRoundDownHalf) {
    extraHours = -0.5;
  } else if (data.isBanti) {
    extraHours = 0.5;
  } else if (data.isNoBanti) {
    extraHours = 0.0;
  } else {
    if (leftoverMinutes >= 40) {
      extraHours = 1.0;
      isFullHourEquivalent = true;
    } else if (leftoverMinutes >= 20 && leftoverMinutes <= 34) {
      extraHours = 0.5;
    } else {
      extraHours = 0.0;
    }
  }
  
  const baseEffectiveHours = fullHours + extraHours;
  const extraFullUnits = Number(data.extraFullUnits || 0);
  const effectiveHours = baseEffectiveHours + extraFullUnits;
  
  // Units for commission (each 0.5 or 1.0 extra counts as 1 unit)
  const currentRecordUnits = fullHours + (extraHours > 0 ? 1 : 0) + extraFullUnits;

  let totalAmount = 0;
  let commission = 0;
  let staffPayment = 0;

  if (data.systemType === 'TABLE') {
    totalAmount = effectiveHours * 50000;
    
    // Full hours (including rounded up ones) always 10k commission
    const effectiveFullHours = fullHours + (isFullHourEquivalent ? 1 : 0) + extraFullUnits;
    const fullHoursCommission = effectiveFullHours * 10000;
    
    // Bantis are summed and applied to the tiered table based on chronological order
    // Sort existing records by startTime to ensure consistent tiered calculation
    const sortedExisting = [...existingRecords].sort((a, b) => {
      const aStart = a.startTime.toDate ? a.startTime.toDate().getTime() : new Date(a.startTime).getTime();
      const bStart = b.startTime.toDate ? b.startTime.toDate().getTime() : new Date(b.startTime).getTime();
      return aStart - bStart;
    });

    const previousBantis = sortedExisting
      .filter(r => r.staffName === data.staffName && r.date === data.date)
      .reduce((sum, r) => sum + (r.durationHours % 1 !== 0 ? 1 : 0), 0);
    
    const currentBantiCount = effectiveHours % 1 !== 0 ? 1 : 0;
    const totalBantisToday = previousBantis + currentBantiCount;
    
    let bantiCommission = 0;
    if (currentBantiCount > 0) {
      const targetBantiProfit = 10000 + (totalBantisToday - 1) * 5000;
      const previousBantiProfit = sortedExisting
        .filter(r => r.staffName === data.staffName && r.date === data.date)
        .reduce((sum, r) => {
          const prevFullHours = Math.floor(r.durationHours || 0);
          const prevCommission = r.commission || 0;
          return sum + (prevCommission - (prevFullHours * 10000));
        }, 0);
      bantiCommission = targetBantiProfit - previousBantiProfit;
    }
    
    commission = fullHoursCommission + bantiCommission;
  } else {
    const rate = SYSTEM_RATES[data.systemType];
    totalAmount = effectiveHours * rate;
    // For PUBLIC/HOPPER, commission is 10,000 per unit (full or banti)
    commission = currentRecordUnits * 10000;
  }

  const tip = Number(data.tip || 0);
  staffPayment = totalAmount - commission + tip;
  
  return {
    durationHours: effectiveHours,
    totalAmount,
    commission,
    staffPayment,
    tip,
    date: data.date,
    startTime: Timestamp.fromDate(start),
    endTime: Timestamp.fromDate(end),
  };
};

export const syncStaffDailyStats = async (staffName: string, date: string) => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('uid', '==', FIXED_UID),
      where('staffName', '==', staffName),
      where('date', '==', date),
      orderBy('startTime', 'asc')
    );
    const snapshot = await getDocs(q);
    const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DispatchRecord));
    
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const previousRecords = records.slice(0, i);
      const newStats = calculateDispatchStats(r as any, previousRecords);
      
      // Check if stats changed
      if (
        Math.abs(newStats.durationHours - (r.durationHours || 0)) > 0.01 ||
        newStats.totalAmount !== r.totalAmount ||
        newStats.commission !== r.commission ||
        newStats.staffPayment !== r.staffPayment
      ) {
        await updateDoc(doc(db, COLLECTION_NAME, r.id!), newStats);
      }
    }
  } catch (error) {
    console.error("Error syncing daily stats:", error);
  }
};

export const addDispatch = async (data: Omit<DispatchRecord, 'id' | 'uid' | 'createdAt' | 'durationHours' | 'totalAmount' | 'commission' | 'staffPayment' | 'date'> & { date: string }) => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('uid', '==', FIXED_UID),
      where('staffName', '==', data.staffName),
      where('date', '==', data.date)
    );
    const snapshot = await getDocs(q);
    const existingRecords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DispatchRecord));

    const stats = calculateDispatchStats(data as any, existingRecords);

    const record: Omit<DispatchRecord, 'id'> = {
      ...data,
      ...stats,
      uid: FIXED_UID,
      createdAt: Timestamp.now(),
      wasUnpaid: data.paymentMethod === 'UNPAID',
      isStaffPaid: data.isStaffPaid !== undefined ? data.isStaffPaid : false,
    };

    // Filter out undefined fields recursively
    const cleanRecord = sanitizeForFirestore(record);

    await addDoc(collection(db, COLLECTION_NAME), cleanRecord);
    await addEstablishment(data.establishmentName);
    await syncStaffDailyStats(data.staffName, data.date);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, COLLECTION_NAME);
  }
};

export const updateDispatch = async (id: string, data: Partial<DispatchRecord>) => {
  try {
    let updateData = { ...data };
    
    const needsSync = !!(
      data.startTime || 
      data.endTime || 
      data.systemType || 
      data.isBanti !== undefined || 
      data.isNoBanti !== undefined || 
      data.extraFullUnits !== undefined ||
      data.staffName ||
      data.date ||
      data.tip !== undefined
    );

    if (needsSync) {
      const docRef = doc(db, COLLECTION_NAME, id);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        throw new Error('문서를 찾을 수 없습니다.');
      }
      const docData = docSnap.data() as DispatchRecord;
      
      const staffName = data.staffName || docData.staffName;
      const date = data.date || docData.date;

      const q = query(
        collection(db, COLLECTION_NAME),
        where('uid', '==', FIXED_UID),
        where('staffName', '==', staffName),
        where('date', '==', date)
      );
      const snapshot = await getDocs(q);
      const existingRecords = snapshot.docs
        .filter(doc => doc.id !== id)
        .map(doc => ({ id: doc.id, ...doc.data() } as DispatchRecord));

      const fullData = {
        ...docData,
        ...data
      };

      const stats = calculateDispatchStats(fullData as any, existingRecords);
      updateData = { ...updateData, ...stats };
    }

    if (data.paymentMethod === 'UNPAID') {
      updateData.wasUnpaid = true;
    }

    // Filter out undefined fields recursively
    const cleanUpdateData = sanitizeForFirestore(updateData);

    await updateDoc(doc(db, COLLECTION_NAME, id), cleanUpdateData);
    if (data.establishmentName) {
      await addEstablishment(data.establishmentName);
    }
    
    if (needsSync) {
      const finalStaffName = data.staffName || (await getDoc(doc(db, COLLECTION_NAME, id))).data()?.staffName;
      const finalDate = data.date || (await getDoc(doc(db, COLLECTION_NAME, id))).data()?.date;
      if (finalStaffName && finalDate) {
        await syncStaffDailyStats(finalStaffName, finalDate);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION_NAME}/${id}`);
  }
};

export const subscribeToDispatches = (date: string, callback: (records: DispatchRecord[]) => void, onError?: (error: Error) => void) => {
  const q = query(
    collection(db, COLLECTION_NAME),
    where('uid', '==', FIXED_UID),
    where('date', '==', date),
    orderBy('startTime', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const records = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as DispatchRecord));
    callback(records);
  }, (error) => {
    if (onError) onError(error);
    const errInfo = getErrorInfo(error, OperationType.LIST, COLLECTION_NAME);
    console.error('Firestore Subscription Error: ', JSON.stringify(errInfo));
  });
};

export const subscribeToAllUnpaidDispatches = (callback: (records: DispatchRecord[]) => void, onError?: (error: Error) => void) => {
  const q = query(
    collection(db, COLLECTION_NAME),
    where('uid', '==', FIXED_UID),
    where('wasUnpaid', '==', true),
    orderBy('date', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const records = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as DispatchRecord));
    callback(records);
  }, (error) => {
    if (onError) onError(error);
    const errInfo = getErrorInfo(error, OperationType.LIST, COLLECTION_NAME);
    console.error('Firestore Subscription Error: ', JSON.stringify(errInfo));
  });
};

export const subscribeToUnpaidStaffDispatches = (callback: (records: DispatchRecord[]) => void, onError?: (error: Error) => void) => {
  const q = query(
    collection(db, COLLECTION_NAME),
    where('uid', '==', FIXED_UID),
    where('isStaffPaid', '==', false),
    orderBy('date', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const records = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as DispatchRecord));
    callback(records);
  }, (error) => {
    if (onError) onError(error);
    const errInfo = getErrorInfo(error, OperationType.LIST, COLLECTION_NAME);
    console.error('Firestore Subscription Error: ', JSON.stringify(errInfo));
  });
};

export const deleteDispatch = async (id: string) => {
  try {
    const docSnap = await getDoc(doc(db, COLLECTION_NAME, id));
    const docData = docSnap.data();
    await deleteDoc(doc(db, COLLECTION_NAME, id));
    if (docData) {
      await syncStaffDailyStats(docData.staffName, docData.date);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${COLLECTION_NAME}/${id}`);
  }
};

export const addBouncedRecord = async (data: Omit<BouncedRecord, 'id' | 'createdAt' | 'uid'>) => {
  try {
    const payload = sanitizeForFirestore({
      ...data,
      uid: FIXED_UID,
      createdAt: Timestamp.now(),
    });
    const docRef = await addDoc(collection(db, BOUNCED_COLLECTION), payload);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, BOUNCED_COLLECTION);
  }
};

export const deleteBouncedRecord = async (id: string) => {
  try {
    await deleteDoc(doc(db, BOUNCED_COLLECTION, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${BOUNCED_COLLECTION}/${id}`);
  }
};

export const subscribeToBouncedRecords = (
  date: string,
  callback: (records: BouncedRecord[]) => void,
  onError?: (error: unknown) => void
) => {
  const q = query(
    collection(db, BOUNCED_COLLECTION),
    where('uid', '==', FIXED_UID),
    where('date', '==', date)
  );

  return onSnapshot(q, (snapshot) => {
    const records = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    } as BouncedRecord));
    callback(records);
  }, (error) => {
    if (onError) onError(error);
    const errInfo = getErrorInfo(error, OperationType.LIST, BOUNCED_COLLECTION);
    console.error('Firestore Subscription Error: ', JSON.stringify(errInfo));
  });
};

export const subscribeToDispatchesByDateRange = (
  startDate: string,
  endDate: string,
  callback: (records: DispatchRecord[]) => void,
  onError?: (error: unknown) => void
) => {
  const q = query(
    collection(db, COLLECTION_NAME),
    where('uid', '==', FIXED_UID),
    where('date', '>=', startDate),
    where('date', '<=', endDate)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const records = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as DispatchRecord));
      callback(records);
    },
    (error) => {
      if (onError) onError(error);
      const errInfo = getErrorInfo(error, OperationType.LIST, COLLECTION_NAME);
      console.error('Firestore Dispatches Range Error: ', JSON.stringify(errInfo));
    }
  );
};

export const subscribeToBouncedByDateRange = (
  startDate: string,
  endDate: string,
  callback: (records: BouncedRecord[]) => void,
  onError?: (error: unknown) => void
) => {
  const q = query(
    collection(db, BOUNCED_COLLECTION),
    where('uid', '==', FIXED_UID),
    where('date', '>=', startDate),
    where('date', '<=', endDate)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const records = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as BouncedRecord));
      callback(records);
    },
    (error) => {
      if (onError) onError(error);
      const errInfo = getErrorInfo(error, OperationType.LIST, BOUNCED_COLLECTION);
      console.error('Firestore Bounced Range Error: ', JSON.stringify(errInfo));
    }
  );
};

export const subscribeToAttendanceByDateRange = (
  startDate: string,
  endDate: string,
  callback: (attendanceList: Array<{ date: string; staffIds: string[]; checkInTimes?: Record<string, any> }>) => void,
  onError?: (error: Error) => void
) => {
  return subscribeToWeeklyAttendance(startDate, endDate, callback, onError);
};
