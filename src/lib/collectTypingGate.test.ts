import assert from "node:assert/strict";
import test from "node:test";
import {
  deferWhileCollectTyping,
  isCollectInputActive,
  markCollectInputActive,
  markCollectInputIdle,
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
