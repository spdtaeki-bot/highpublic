import assert from "node:assert/strict";
import test from "node:test";
import {
  additionalCollectShortage,
  commitDepositorComposition,
  decideCollectFieldChange,
  readAdditionalCollectDraft,
  type CollectFieldChange,
} from "./collectInputSession.ts";

const base = (
  overrides: Partial<CollectFieldChange> & Pick<CollectFieldChange, "field" | "domValue" | "previousValue">,
): CollectFieldChange => ({
  focusedField: overrides.field,
  composingField: null,
  leavingField: null,
  isComposing: false,
  ...overrides,
});

test("한글 조합 순서대로 입금자명만 쌓이고 날짜는 그대로다", () => {
  let depositor = "";
  for (const partial of ["ㅇ", "이", "이ㅌ", "이태", "이태ㅎ", "이태희"]) {
    const decision = decideCollectFieldChange(
      base({
        field: "depositor",
        domValue: partial,
        previousValue: depositor,
        composingField: "depositor",
        isComposing: true,
        inputType: "insertCompositionText",
      }),
    );
    assert.equal(decision.accept, true);
    depositor = decision.value;
  }
  assert.equal(depositor, "이태희");

  const date = decideCollectFieldChange(
    base({
      field: "date",
      domValue: "7",
      previousValue: "1017",
      focusedField: "date",
      composingField: "depositor",
      isComposing: true,
      inputType: "insertCompositionText",
    }),
  );
  assert.equal(date.accept, false);
  assert.equal(date.value, "1017");
});

test("조합이 끝날 때 뒤에 붙은 금액 숫자는 입금자명에 남기지 않는다", () => {
  assert.equal(
    commitDepositorComposition({
      base: "",
      compositionData: "이태희",
      domValue: "이태희10",
    }),
    "이태희",
  );
  assert.equal(
    commitDepositorComposition({
      base: "",
      compositionData: "썸",
      domValue: "썸3",
    }),
    "썸",
  );
  assert.equal(
    commitDepositorComposition({
      base: "이태",
      compositionData: "희",
      domValue: "이태희10",
    }),
    "이태희",
  );
  assert.equal(
    commitDepositorComposition({
      base: "",
      compositionData: "이태희2",
      domValue: "이태희2",
    }),
    "이태희2",
  );

  const ended = decideCollectFieldChange(
    base({
      field: "depositor",
      domValue: "이태희10",
      previousValue: "이태희",
      compositionData: "이태희",
      compositionBase: "",
    }),
  );
  assert.equal(ended.value, "이태희");
});

test("빠르게 숫자를 친 뒤 탭하면 이전 칸에 숫자가 섞이지 않는다", () => {
  let date = "";
  for (const digit of ["1", "0", "1", "7"]) {
    const decision = decideCollectFieldChange(
      base({
        field: "date",
        domValue: date + digit,
        previousValue: date,
      }),
    );
    assert.equal(decision.accept, true, digit);
    date = decision.value;
  }
  assert.equal(date, "1017");

  const strayOnDate = decideCollectFieldChange(
    base({
      field: "date",
      domValue: "10177",
      previousValue: "1017",
      leavingField: "date",
    }),
  );
  assert.equal(strayOnDate.accept, false);
  assert.equal(strayOnDate.value, "1017");

  const leakedDepositor = decideCollectFieldChange(
    base({
      field: "depositor",
      domValue: "이태희10",
      previousValue: "이태희",
      focusedField: "amount",
      leavingField: "depositor",
    }),
  );
  assert.equal(leakedDepositor.accept, false);
  assert.equal(leakedDepositor.value, "이태희");

  const leakedWhileStillFocused = decideCollectFieldChange(
    base({
      field: "depositor",
      domValue: "썸3",
      previousValue: "썸",
      focusedField: "depositor",
      leavingField: "depositor",
    }),
  );
  assert.equal(leakedWhileStillFocused.accept, false);
  assert.equal(leakedWhileStillFocused.value, "썸");

  const collapsedDate = decideCollectFieldChange(
    base({
      field: "date",
      domValue: "7",
      previousValue: "1017",
      sealNumericCollapse: true,
    }),
  );
  assert.equal(collapsedDate.accept, false);
  assert.equal(collapsedDate.value, "1017");
});

test("초안은 칸 이름이 맞는 값만 복원하고 날짜와 입금자를 바꾸지 않는다", () => {
  const draft = readAdditionalCollectDraft(
    JSON.stringify({
      mode: "ADD",
      method: "TRANSFER",
      amountStr: "10",
      depositorName: "이태희",
      collectedDate: "1017",
      collectedTime: "0930",
    }),
  );
  assert.ok(draft);
  assert.equal(draft.collectedDate, "1017");
  assert.equal(draft.depositorName, "이태희");
  assert.equal(draft.amountStr, "10");
  assert.equal(draft.collectedTime, "0930");
  assert.equal(readAdditionalCollectDraft("{"), null);
  assert.equal(readAdditionalCollectDraft(null), null);
});

test("저장 중 기존 수금액이 늘어도 미리보기는 열 때의 금액으로 초과 수금을 만들지 않는다", () => {
  const opened = additionalCollectShortage({
    originalTotal: 150000,
    currentCollected: 0,
    mode: "ADD",
    amountStr: "150,000",
  });
  assert.equal(opened, 0);

  const recounted = additionalCollectShortage({
    originalTotal: 150000,
    currentCollected: 150000,
    mode: "ADD",
    amountStr: "150,000",
  });
  assert.ok(recounted < 0);

  const frozen = additionalCollectShortage({
    originalTotal: 150000,
    currentCollected: 0,
    mode: "ADD",
    amountStr: "150,000",
  });
  assert.equal(frozen, 0);
});
