import assert from "node:assert/strict";
import test from "node:test";
import { resolvePastedSearchValue } from "../components/SearchField.tsx";

test("붙여넣기 이벤트가 입력값을 바꾸지 못하면 한글을 직접 넣는다", () => {
  assert.equal(
    resolvePastedSearchValue("리", "치홍콩", 1, 1, "리"),
    "리치홍콩",
  );
});

test("선택 구간을 붙여 넣은 글로 바꾼다", () => {
  assert.equal(
    resolvePastedSearchValue("가나", "송한빈", 0, 2, "가나"),
    "송한빈",
  );
});

test("브라우저가 이미 붙여 넣었으면 그 값을 쓴다", () => {
  assert.equal(
    resolvePastedSearchValue("", "송한빈", 0, 0, "송한빈"),
    "송한빈",
  );
});
