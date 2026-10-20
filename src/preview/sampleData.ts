import type { DispatchRecord, Staff } from "../types";

export const SAMPLE_DATE = "2026-10-15";

export const SAMPLE_ESTABLISHMENTS = [
  "홍콩",
  "리치",
  "어우동",
  "삼칠오",
  "어게인",
  "홈런",
  "하이엔드",
  "도파민",
];

export const SAMPLE_STAFF_NAMES = [
  "김태강",
  "박선아",
  "최정우",
  "임민혁",
  "김영신",
  "임선교",
];

const DEPOSITORS = ["송한빈", "김민균", "정정희", "박혜창", "커피티씨"];

// 운영 화면과 비슷한 2,500건대 데이터로 입력/렌더 성능을 검증한다.
export const SAMPLE_DAY_COUNT = 320;

export function previewStamp(iso: string) {
  const date = new Date(iso);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

function dateOffset(day: number): string {
  const date = new Date(`${SAMPLE_DATE}T00:00:00`);
  date.setDate(date.getDate() - day);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${dayOfMonth}`;
}

export function buildSampleRecords(dayCount = SAMPLE_DAY_COUNT): DispatchRecord[] {
  const records: DispatchRecord[] = [];
  for (let day = 0; day < dayCount; day++) {
    const dateStr = dateOffset(day);
    SAMPLE_ESTABLISHMENTS.forEach((establishmentName, estIndex) => {
      const staffName = SAMPLE_STAFF_NAMES[(day + estIndex) % SAMPLE_STAFF_NAMES.length];
      const depositor = DEPOSITORS[(day + estIndex) % DEPOSITORS.length];
      const partialCollection = day === 40 && establishmentName === "홍콩";
      const unpaid = partialCollection || estIndex % 3 !== 0;
      const stamp = previewStamp(`${dateStr}T20:00:00`);
      records.push({
        id: `${dateStr}-${establishmentName}`,
        staffName,
        establishmentName,
        systemType: "TABLE",
        startTime: stamp,
        endTime: previewStamp(`${dateStr}T23:00:00`),
        durationHours: 3,
        totalAmount: 150000,
        commission: 30000,
        staffPayment: 90000,
        paymentMethod: partialCollection || !unpaid ? "TRANSFER" : "UNPAID",
        date: dateStr,
        isStaffPaid: !unpaid,
        wasUnpaid: true,
        depositorName: partialCollection ? "송한빈" : unpaid ? "" : depositor,
        collectedAmount: partialCollection ? 80000 : unpaid ? undefined : 150000,
        createdAt: stamp,
        uid: "sample",
        collectionHistory: unpaid && !partialCollection
          ? []
          : [
              {
                collectedAt: previewStamp(`${dateStr}T23:30:00`),
                amount: partialCollection ? 80000 : 150000,
                paymentMethod: "TRANSFER",
                depositorName: partialCollection ? "송한빈" : depositor,
                note: "1차 수금",
                isShared: true,
                isOnSite: false,
              },
            ],
      });
    });
  }
  return records;
}

export function buildSampleStaff(): Staff[] {
  return SAMPLE_STAFF_NAMES.map((name, index) => ({
    id: `staff-${index + 1}`,
    name,
    active: true,
    uid: "sample",
    createdAt: previewStamp(`${SAMPLE_DATE}T18:00:00`),
    type: index % 2 === 0 ? "COFFEE" : "PUBLIC",
    employmentType: "DIRECT",
  }));
}
