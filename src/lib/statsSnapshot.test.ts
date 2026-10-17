import assert from "node:assert/strict";
import test from "node:test";
import { shouldApplyStatsDispatchSnapshot } from "./statsSnapshot";

test("서버 확인 통계가 있으면 뒤늦은 로컬 캐시 스냅샷을 무시한다", () => {
  assert.equal(shouldApplyStatsDispatchSnapshot(true, true), false);
});

test("서버 스냅샷과 최초 로컬 캐시는 반영한다", () => {
  assert.equal(shouldApplyStatsDispatchSnapshot(true, false), true);
  assert.equal(shouldApplyStatsDispatchSnapshot(false, true), true);
});
