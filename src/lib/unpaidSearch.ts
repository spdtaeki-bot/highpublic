/** 미수 카드 검색은 업소명, 직원명, 입금자명만 본다. 계산 결과와 무관하다. */
export type UnpaidSearchRecord = {
  staffName?: string | null;
  depositorName?: string | null;
};

export function unpaidEstablishmentSearchBlob(
  establishmentName: string,
  records: UnpaidSearchRecord[],
): string {
  return [establishmentName, ...records.flatMap((record) => [record.staffName, record.depositorName])]
    .filter((part): part is string => Boolean(part))
    .join("\n")
    .toLowerCase();
}

export function matchesUnpaidEstablishmentSearch(
  establishmentName: string,
  records: UnpaidSearchRecord[],
  searchTerm: string,
): boolean {
  const lowerSearch = searchTerm.trim().toLowerCase();
  if (!lowerSearch) return true;
  if (establishmentName.toLowerCase().includes(lowerSearch)) return true;
  return records.some(
    (record) =>
      Boolean(record.staffName?.toLowerCase().includes(lowerSearch)) ||
      Boolean(record.depositorName?.toLowerCase().includes(lowerSearch)),
  );
}
