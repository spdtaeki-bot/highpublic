/**
 * A Firestore listener can emit an older local-cache snapshot before its
 * server snapshot. Keep a previously server-confirmed month visible until the
 * replacement server snapshot arrives.
 */
export function shouldApplyStatsDispatchSnapshot(
  hasServerBackedCache: boolean,
  snapshotFromCache: boolean,
): boolean {
  return !(hasServerBackedCache && snapshotFromCache);
}
