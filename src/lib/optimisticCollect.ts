import type { DispatchRecord } from "../types";

export interface RecordPatch {
  id: string;
  updates: Partial<DispatchRecord>;
}

/** 한 업소의 기록 패치를 같은 순간에 모두 덮어쓴다. 일부만 덮으면 공용 수금이 여러 번 더해진다. */
export function overlayRecordPatches(
  records: DispatchRecord[],
  patches: RecordPatch[],
): DispatchRecord[] {
  const byId = new Map(patches.map((patch) => [patch.id, patch.updates]));
  return records.map((record) => {
    const updates = record.id ? byId.get(record.id) : undefined;
    return updates ? { ...record, ...updates } : record;
  });
}

export function collectionPatchVisible(
  record: Pick<DispatchRecord, "collectionHistory">,
  patch: Pick<DispatchRecord, "collectionHistory">,
): boolean {
  const next = patch.collectionHistory;
  if (!Array.isArray(next)) return true;
  const current = Array.isArray(record.collectionHistory) ? record.collectionHistory : [];
  if (current.length !== next.length) return false;
  if (next.length === 0) return true;
  const last = next[next.length - 1];
  const got = current[current.length - 1];
  if (!last || !got) return false;
  return got.amount === last.amount && (got.note || "") === (last.note || "");
}
