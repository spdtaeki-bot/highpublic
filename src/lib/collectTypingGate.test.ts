import assert from "node:assert/strict";
import { mock, test } from "node:test";
import {
  COLLECT_TYPING_QUIET_MS,
  deferWhileCollectTyping,
  isCollectInputActive,
  markCollectInputActive,
  markCollectInputIdle,
  scheduleCollectInputIdle,
} from "./collectTypingGate.ts";

test("수금 입력 중 스냅샷은 쌓아 두었다가 입력이 끝나면 마지막만 적용한다", () => {
  markCollectInputIdle();
  const applied: string[] = [];
  deferWhileCollectTyping("records", () => applied.push("before"));
  assert.deepEqual(applied, ["before"]);

  markCollectInputActive();
  assert.equal(isCollectInputActive(), true);
  deferWhileCollectTyping("records", () => applied.push("19"));
  deferWhileCollectTyping("records", () => applied.push("1931"));
  deferWhileCollectTyping("unpaid", () => applied.push("1450000"));
  assert.deepEqual(applied, ["before"]);

  markCollectInputIdle();
  assert.equal(isCollectInputActive(), false);
  assert.deepEqual(applied, ["before", "1931", "1450000"]);

  markCollectInputIdle();
  assert.deepEqual(applied, ["before", "1931", "1450000"]);
});

test("치는 동안에는 스냅샷 문서 변환 자체를 시작하지 않는다", () => {
  markCollectInputIdle();
  let mapped = 0;
  let seen = "";
  markCollectInputActive();
  deferWhileCollectTyping("all-unpaid", () => {
    mapped += 1;
    seen = "1450000";
  });
  assert.equal(mapped, 0);
  assert.equal(seen, "");
  markCollectInputIdle();
  assert.equal(mapped, 1);
  assert.equal(seen, "1450000");
});

test("입력이 이어지면 예약된 목록 갱신을 실행하지 않는다", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    markCollectInputIdle();
    markCollectInputActive();
    const applied: string[] = [];
    deferWhileCollectTyping("records", () => applied.push("1018"));
    scheduleCollectInputIdle();
    mock.timers.tick(COLLECT_TYPING_QUIET_MS - 1);
    assert.deepEqual(applied, []);
    markCollectInputActive();
    mock.timers.tick(COLLECT_TYPING_QUIET_MS);
    assert.deepEqual(applied, []);
    scheduleCollectInputIdle();
    mock.timers.tick(COLLECT_TYPING_QUIET_MS);
    assert.deepEqual(applied, ["1018"]);
    assert.equal(isCollectInputActive(), false);
  } finally {
    mock.timers.reset();
    markCollectInputIdle();
  }
});
