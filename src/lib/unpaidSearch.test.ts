import assert from "node:assert/strict";
import test from "node:test";
import {
  matchesUnpaidEstablishmentSearch,
  unpaidEstablishmentSearchBlob,
} from "./unpaidSearch.ts";

const records = [
  { staffName: "김태강", depositorName: "" },
  { staffName: "박선아", depositorName: "송한빈" },
  { staffName: null, depositorName: null },
];

test("검색 묶음은 기존 칸별 포함 검색과 같다", () => {
  const blob = unpaidEstablishmentSearchBlob("홍콩", records);
  const terms = ["", "  ", "홍", "홍콩", "김태", "김태강", "선아", "송한빈", "한빈", "없는사람", "김태강송한빈", "콩김"];
  for (const term of terms) {
    const query = term.trim().toLowerCase();
    const byBlob = !query || blob.includes(query);
    assert.equal(
      byBlob,
      matchesUnpaidEstablishmentSearch("홍콩", records, term),
      term,
    );
  }
});

test("수금 이력 입금자명은 기록 입금자명과 따로 검색하지 않는다", () => {
  assert.equal(
    matchesUnpaidEstablishmentSearch("리치", [{ staffName: "최정우", depositorName: "김민균" }], "커피티씨"),
    false,
  );
});
