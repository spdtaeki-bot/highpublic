export type SystemType = 'TABLE' | 'PUBLIC' | 'HOPPER';
export type StaffType = 'HOPPER' | 'PUBLIC' | 'COFFEE';
export type PaymentMethod = 'CASH' | 'TRANSFER' | 'UNPAID';

export interface CollectionHistoryEntry {
  collectedAt: any; // Firestore Timestamp
  amount?: number;
  paymentMethod?: PaymentMethod;
  depositorName?: string;
  note?: string; // e.g. "1차 수금", "2차 추가수금", "3차 추가수금"
}

export interface BouncedRecord {
  id?: string;
  staffName: string;
  establishmentName: string;
  time: string; // e.g. "19:30"
  date: string; // YYYY-MM-DD
  createdAt: any;
  uid: string;
}

export interface DispatchRecord {
  id?: string;
  staffName: string;
  establishmentName: string;
  systemType: SystemType;
  startTime: any; // Firestore Timestamp
  endTime: any; // Firestore Timestamp
  durationHours: number;
  totalAmount: number;
  commission: number;
  staffPayment: number;
  paymentMethod: PaymentMethod;
  date: string; // YYYY-MM-DD
  isBanti?: boolean;
  isNoBanti?: boolean;
  isStaffPaid?: boolean;
  staffPaymentMethod?: 'CASH' | 'TRANSFER';
  wasUnpaid?: boolean;
  collectedAt?: any; // Firestore Timestamp
  additionalCollectedAt?: any; // Firestore Timestamp
  collectionHistory?: CollectionHistoryEntry[];
  staffPaidAt?: any; // Firestore Timestamp
  isPass?: boolean;
  isRoundUp?: boolean;
  isRoundDownHalf?: boolean;
  isRoundDownFull?: boolean;
  extraFullUnits?: number;
  isDispatchBoxCollection?: boolean;
  tip?: number;
  depositorName?: string;
  collectedAmount?: number;
  isBounced?: boolean;
  bounceCount?: number;
  createdAt: any; // Firestore Timestamp
  uid: string;
}

export interface Staff {
  id?: string;
  name: string;
  active: boolean;
  uid: string;
  createdAt: any;
  type: StaffType;
  employmentType?: "DIRECT" | "DELEGATED";
  office?: string;
  isBanti?: boolean;
  isNoBanti?: boolean;
  defaultTip?: number;
  accountNumber?: string;
  previousNames?: string[];
}

export interface ActiveChoice {
  establishmentName: string;
  choiceTime: string; // e.g. "19:30"
  createdAt?: any;
}

export interface Attendance {
  id?: string;
  date: string;
  staffIds: string[];
  checkInTimes?: Record<string, any>; // staffId -> Firestore Timestamp
  offStaffIds?: string[]; // IDs of staff who have left for the day
  manualDailyProfits?: Record<string, number>; // staffId -> manual profit amount
  activeChoices?: Record<string, ActiveChoice>; // staffName -> ActiveChoice
  uid: string;
}

export const SYSTEM_RATES: Record<SystemType, number> = {
  TABLE: 50000,
  PUBLIC: 80000,
  HOPPER: 100000,
};

export const COMMISSION_RATE = 10000;
