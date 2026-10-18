export type CollectInputField = "date" | "time" | "depositor" | "amount";

export interface AdditionalCollectDraft {
  mode: "ADD" | "SET";
  amountStr: string;
  method: "CASH" | "TRANSFER";
  depositorName: string;
  collectedDate: string;
  collectedTime: string;
}

export interface CollectInputSession {
  composingField: CollectInputField | null;
  leavingField: CollectInputField | null;
  sealNumericCollapse: boolean;
  dropDepositorTrailingDigits: boolean;
}

export function createCollectInputSession(): CollectInputSession {
  return {
    composingField: null,
    leavingField: null,
    sealNumericCollapse: false,
    dropDepositorTrailingDigits: false,
  };
}

export interface CollectFieldChange {
  field: CollectInputField;
  domValue: string;
  previousValue: string;
  focusedField: CollectInputField | null;
  composingField: CollectInputField | null;
  leavingField: CollectInputField | null;
  isComposing: boolean;
  inputType?: string;
  compositionData?: string;
  compositionBase?: string;
  sealNumericCollapse?: boolean;
  dropTrailingDigits?: boolean;
}

/**
 * 한글 조합이 끝난 직후 브라우저가 다음 칸의 숫자를 방금 칸 뒤에 붙이는 경우가 있다.
 * 조합 데이터 자체에 들어 있는 숫자는 입금자명의 일부로 두고, 그 뒤에만 붙은 숫자는 버린다.
 */
export function commitDepositorComposition(args: {
  base: string;
  compositionData: string;
  domValue: string;
}): string {
  const { base, compositionData, domValue } = args;
  if (!compositionData) return domValue;
  const expected = `${base}${compositionData}`;
  if (domValue === expected) return expected;
  // 금액 숫자가 조합 글자 사이나 뒤에 끼면, 조합에 없는 숫자만 뺀다.
  // '커티씨' 조합 중 DOM이 '커티1씨75000'이면 입금자명은 '커티씨'다.
  let index = 0;
  let output = "";
  for (const char of domValue) {
    if (index < expected.length && char === expected[index]) {
      output += char;
      index += 1;
      continue;
    }
    if (/\d/.test(char)) continue;
    output += char;
  }
  if (index === expected.length) return output;
  return domValue;
}

function trailingDigits(previous: string, dom: string): boolean {
  return (
    previous.length > 0 &&
    dom.startsWith(previous) &&
    dom.length > previous.length &&
    /^\d+$/.test(dom.slice(previous.length))
  );
}

/**
 * 수금 입력 칸에 들어온 값을 반영할지 결정한다.
 * 조합 중인 칸이 아닌 곳, 포커스를 떠난 칸, 탭 직후 앞에 붙은 숫자는 거절한다.
 */
export function decideCollectFieldChange(
  change: CollectFieldChange,
): { accept: boolean; value: string } {
  const keep = { accept: false, value: change.previousValue };

  if (change.composingField && change.composingField !== change.field) return keep;

  if (
    change.field === "depositor" &&
    change.dropTrailingDigits &&
    trailingDigits(change.previousValue, change.domValue)
  ) {
    return keep;
  }

  if (
    change.field === "depositor" &&
    change.leavingField === "depositor" &&
    trailingDigits(change.previousValue, change.domValue)
  ) {
    return keep;
  }

  if (
    change.leavingField === change.field &&
    (change.field === "date" || change.field === "time" || change.field === "amount")
  ) {
    const previousDigits = change.previousValue.replace(/\D/g, "");
    const nextDigits = change.domValue.replace(/\D/g, "");
    if (nextDigits.startsWith(previousDigits) && nextDigits.length > previousDigits.length) {
      return keep;
    }
  }

  if (change.focusedField !== change.field) return keep;

  if (change.field === "depositor") {
    if (change.compositionData) {
      return {
        accept: true,
        value: commitDepositorComposition({
          base: change.compositionBase ?? "",
          compositionData: change.compositionData,
          domValue: change.domValue,
        }),
      };
    }
    return { accept: true, value: change.domValue };
  }

  if (change.isComposing || change.inputType === "insertCompositionText") return keep;

  const digits = change.domValue.replace(/\D/g, "");
  if (change.field === "date" || change.field === "time") {
    const next = digits.slice(0, 4);
    if (
      change.sealNumericCollapse &&
      change.previousValue.length === 4 &&
      next.length <= 1 &&
      next !== change.previousValue
    ) {
      return keep;
    }
    return { accept: true, value: next };
  }

  if (!digits) return { accept: true, value: "" };
  const amount = Number.parseInt(digits, 10);
  if (Number.isNaN(amount)) return keep;
  return { accept: true, value: amount.toLocaleString() };
}

export function readAdditionalCollectDraft(raw: string | null): AdditionalCollectDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AdditionalCollectDraft> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.mode !== "ADD" && parsed.mode !== "SET") return null;
    if (parsed.method !== "CASH" && parsed.method !== "TRANSFER") return null;
    if (typeof parsed.amountStr !== "string") return null;
    if (typeof parsed.depositorName !== "string") return null;
    if (typeof parsed.collectedDate !== "string") return null;
    if (typeof parsed.collectedTime !== "string") return null;
    return {
      mode: parsed.mode,
      method: parsed.method,
      amountStr: parsed.amountStr,
      depositorName: parsed.depositorName,
      collectedDate: parsed.collectedDate.replace(/\D/g, "").slice(0, 4),
      collectedTime: parsed.collectedTime.replace(/\D/g, "").slice(0, 4),
    };
  } catch {
    return null;
  }
}

export function additionalCollectShortage(args: {
  originalTotal: number;
  currentCollected: number;
  mode: "ADD" | "SET";
  amountStr: string;
}): number {
  const parsed = args.amountStr
    ? Number.parseInt(args.amountStr.replace(/,/g, ""), 10)
    : 0;
  const inputNum = Number.isNaN(parsed) ? 0 : parsed;
  const additionalAmount = args.mode === "ADD" ? inputNum : inputNum - args.currentCollected;
  return args.originalTotal - (args.currentCollected + additionalAmount);
}
