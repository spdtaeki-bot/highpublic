import "./../lib/domTestSetup.ts";
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EstablishmentAdditionalCollectForm } from "./EstablishmentAdditionalCollectForm.tsx";
import {
  deferWhileCollectTyping,
  markCollectInputIdle,
} from "../lib/collectTypingGate.ts";

function field(container: HTMLElement, name: string) {
  const input = container.querySelector<HTMLInputElement>(`[data-collect-field="${name}"]`);
  assert.ok(input, name);
  return input;
}

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  assert.ok(setter);
  setter.call(input, value);
}

async function typeInto(
  input: HTMLInputElement,
  value: string,
  init: InputEventInit = {},
) {
  setNativeValue(input, value);
  await act(async () => {
    input.dispatchEvent(
      new InputEvent("input", { bubbles: true, cancelable: true, data: value, ...init }),
    );
  });
}

function compositionEvent(type: string, data: string) {
  const event = new CompositionEvent(type, { bubbles: true });
  Object.defineProperty(event, "data", { value: data });
  return event;
}

async function flushFrames() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function mount(props: {
  currentCollected?: number;
  originalTotal?: number;
  onCollectAdditional?: (
    method: "CASH" | "TRANSFER",
    additionalAmount: number,
    depositorName: string,
    collectedDate: string,
    collectedTime: string,
  ) => Promise<void> | void;
}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  const render = (currentCollected: number) => {
    root.render(
      <EstablishmentAdditionalCollectForm
        estName="사쿠라"
        draftKey="2026-10-15_사쿠라"
        originalTotal={props.originalTotal ?? 150000}
        currentCollected={currentCollected}
        onCollectAdditional={props.onCollectAdditional ?? (async () => {})}
        onCancel={() => {}}
      />,
    );
  };
  act(() => render(props.currentCollected ?? 0));
  return {
    host,
    render,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("IME 조합과 탭 뒤의 숫자가 날짜와 입금자명을 섞지 않는다", async () => {
  sessionStorage.clear();
  const view = mount({});
  try {
    const date = field(view.host, "date");
    const depositor = field(view.host, "depositor");
    const amount = field(view.host, "amount");
    const originalDate = date.value;
    assert.equal(originalDate.length, 4);

    await act(async () => {
      depositor.focus();
      depositor.dispatchEvent(compositionEvent("compositionstart", ""));
    });
    for (const partial of ["ㅇ", "이", "이태", "이태희"]) {
      await typeInto(depositor, partial, { inputType: "insertCompositionText", isComposing: true });
    }
    await act(async () => {
      depositor.dispatchEvent(compositionEvent("compositionend", "이태희"));
    });
    assert.equal(depositor.value, "이태희");
    assert.equal(date.value, originalDate);

    await act(async () => {
      depositor.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      amount.focus();
    });
    await typeInto(amount, "10");
    assert.equal(depositor.value, "이태희");
    assert.equal(amount.value, "10");

    setNativeValue(date, "7");
    await act(async () => {
      date.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertCompositionText",
          isComposing: true,
          data: "7",
        }),
      );
    });
    assert.equal(date.value, originalDate);
    assert.notEqual(date.value, "7");
    assert.equal(depositor.value, "이태희");
  } finally {
    view.unmount();
    sessionStorage.clear();
  }
});

test("날짜를 빠르게 치고 탭해도 앞자리가 다른 칸으로 빠지지 않는다", async () => {
  sessionStorage.clear();
  const view = mount({});
  try {
    const date = field(view.host, "date");
    const depositor = field(view.host, "depositor");
    await act(async () => {
      date.focus();
    });
    await flushFrames();

    let typed = "";
    for (const digit of ["1", "0", "1", "7"]) {
      typed += digit;
      await typeInto(date, typed);
    }
    assert.equal(date.value, "1017");

    await act(async () => {
      date.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      depositor.focus();
    });
    await typeInto(date, "10177");
    await typeInto(depositor, "7", { inputType: "insertText" });
    await act(async () => {
      depositor.dispatchEvent(compositionEvent("compositionstart", ""));
    });
    await typeInto(depositor, "썸", { inputType: "insertCompositionText", isComposing: true });
    await act(async () => {
      depositor.dispatchEvent(compositionEvent("compositionend", "썸"));
      depositor.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    await typeInto(depositor, "썸3");
    assert.equal(date.value, "1017");
    assert.equal(depositor.value, "썸3");
  } finally {
    view.unmount();
    sessionStorage.clear();
  }
});

test("저장으로 기존 수금액이 바뀌어도 초과 수금이 깜빡이지 않는다", async () => {
  sessionStorage.clear();
  const view = mount({ originalTotal: 150000, currentCollected: 0 });
  try {
    const amount = field(view.host, "amount");
    await act(async () => {
      amount.focus();
    });
    await typeInto(amount, "150000");
    await act(async () => {
      amount.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    assert.equal(view.host.textContent?.includes("전액 완납"), true);
    assert.equal(view.host.textContent?.includes("초과 수금"), false);

    await act(async () => {
      view.render(150000);
    });
    assert.equal(view.host.textContent?.includes("전액 완납"), true);
    assert.equal(view.host.textContent?.includes("초과 수금"), false);
    assert.equal(field(view.host, "amount").value, amount.value);
  } finally {
    view.unmount();
    sessionStorage.clear();
  }
});

test("저장된 초안은 날짜와 입금자명 칸을 서로 바꾸지 않고 복원한다", async () => {
  sessionStorage.setItem(
    "office_additional_collect_draft:2026-10-15_사쿠라",
    JSON.stringify({
      mode: "ADD",
      method: "TRANSFER",
      amountStr: "10",
      depositorName: "이태희",
      collectedDate: "1017",
      collectedTime: "0930",
    }),
  );
  const view = mount({});
  try {
    assert.equal(field(view.host, "date").value, "1017");
    assert.equal(field(view.host, "time").value, "0930");
    assert.equal(field(view.host, "depositor").value, "이태희");
    assert.equal(field(view.host, "amount").value, "10");
    await act(async () => {
      view.render(0);
    });
    assert.equal(field(view.host, "date").value, "1017");
    assert.equal(field(view.host, "depositor").value, "이태희");
  } finally {
    view.unmount();
    sessionStorage.clear();
  }
});

test("한글 조합 직후 탭해 금액을 빠르게 쳐도 칸이 다시 마운트되지 않는다", async () => {
  sessionStorage.clear();
  let saved: { amount: number; name: string } | null = null;
  const view = mount({
    originalTotal: 1750000,
    onCollectAdditional: async (_method, amount, name) => {
      saved = { amount, name };
    },
  });
  try {
    const form = view.host.querySelector("form");
    const date = field(view.host, "date");
    const depositor = field(view.host, "depositor");
    const amount = field(view.host, "amount");
    assert.ok(form);
    const rendersBefore = depositor.dataset.collectRenders;
    assert.equal(rendersBefore, "1");
    assert.equal(amount.dataset.collectRenders, "1");

    await act(async () => {
      depositor.focus();
      depositor.dispatchEvent(compositionEvent("compositionstart", ""));
    });
    await typeInto(depositor, "커", { inputType: "insertCompositionText", isComposing: true });
    await act(async () => {
      view.render(1750000);
    });
    assert.equal(depositor.value, "커");
    assert.equal(field(view.host, "depositor"), depositor);
    assert.equal(depositor.dataset.collectRenders, "1");
    assert.equal(view.host.querySelector("form"), form);

    for (const partial of ["커티", "커티씨"]) {
      await typeInto(depositor, partial, { inputType: "insertCompositionText", isComposing: true });
    }
    await act(async () => {
      depositor.dispatchEvent(compositionEvent("compositionend", "씨"));
      depositor.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      amount.focus();
    });
    assert.equal(depositor.value, "커티씨");

    await act(async () => {
      amount.dispatchEvent(compositionEvent("compositionstart", ""));
    });
    await typeInto(amount, "1", { inputType: "insertCompositionText", isComposing: true });
    await act(async () => {
      amount.dispatchEvent(compositionEvent("compositionend", "1"));
    });
    assert.equal(amount.value, "1");

    let typed = "1";
    for (const digit of ["7", "5", "0", "0", "0", "0"]) {
      typed += digit;
      await typeInto(amount, typed);
    }
    await act(async () => {
      view.render(0);
    });

    assert.equal(depositor.value, "커티씨");
    assert.equal(amount.value, "1750000");
    assert.equal(field(view.host, "depositor"), depositor);
    assert.equal(field(view.host, "amount"), amount);
    assert.equal(field(view.host, "date"), date);
    assert.equal(depositor.dataset.collectRenders, "1");
    assert.equal(amount.dataset.collectRenders, "1");
    assert.equal(date.dataset.collectRenders, "1");
    assert.equal(view.host.querySelector("form"), form);
    assert.equal(depositor.value, "커티씨");

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(saved, { amount: 1750000, name: "커티씨" });
  } finally {
    view.unmount();
    sessionStorage.clear();
    markCollectInputIdle();
  }
});

test("미술관을 이어서 두 번 조합해도 가운데 음절을 바꾸지 않는다", async () => {
  sessionStorage.clear();
  const view = mount({});
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  assert.ok(proto?.get && proto.set);
  let writes = 0;
  Object.defineProperty(HTMLInputElement.prototype, "value", {
    configurable: true,
    get() {
      return proto.get!.call(this);
    },
    set(value: string) {
      writes += 1;
      proto.set!.call(this, value);
    },
  });
  try {
    const depositor = field(view.host, "depositor");
    const compose = async (syllable: string, full: string) => {
      await act(async () => {
        depositor.focus();
        depositor.dispatchEvent(compositionEvent("compositionstart", ""));
      });
      setNativeValue(depositor, full);
      writes = 0;
      await act(async () => {
        depositor.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            inputType: "insertCompositionText",
            isComposing: true,
            data: syllable,
          }),
        );
        depositor.dispatchEvent(compositionEvent("compositionend", syllable));
        depositor.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            inputType: "insertCompositionText",
            data: syllable,
          }),
        );
      });
      assert.equal(writes, 0, syllable);
      assert.equal(depositor.value, full);
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      setNativeValue(depositor, "");
      let full = "";
      for (const syllable of ["미", "술", "관"]) {
        full += syllable;
        await compose(syllable, full);
      }
      assert.equal(depositor.value, "미술관");
      assert.notEqual(depositor.value, "미관");
      assert.notEqual(depositor.value, "미굜");
    }
  } finally {
    Object.defineProperty(HTMLInputElement.prototype, "value", proto);
    view.unmount();
    sessionStorage.clear();
    markCollectInputIdle();
  }
});

test("입금자 조합 직후에도 시간 1931의 첫 숫자는 원래 시각으로 돌아가지 않는다", async () => {
  sessionStorage.clear();
  const view = mount({});
  try {
    const depositor = field(view.host, "depositor");
    const time = field(view.host, "time");
    const previousTime = time.value;
    assert.equal(previousTime.length, 4);

    await act(async () => {
      depositor.focus();
      depositor.dispatchEvent(compositionEvent("compositionstart", ""));
    });
    setNativeValue(depositor, "미술관");
    await act(async () => {
      depositor.dispatchEvent(compositionEvent("compositionend", "관"));
      time.focus();
      time.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }));
    });
    await typeInto(time, "1");
    assert.equal(time.value, "1");
    assert.notEqual(time.value, previousTime);

    let typed = "1";
    for (const digit of ["9", "3", "1"]) {
      typed += digit;
      await act(async () => {
        time.dispatchEvent(new KeyboardEvent("keydown", { key: digit, bubbles: true }));
      });
      await typeInto(time, typed);
      assert.equal(time.value, typed);
    }
    assert.equal(depositor.value, "미술관");
  } finally {
    view.unmount();
    sessionStorage.clear();
    markCollectInputIdle();
  }
});

test("김민준과 1018은 치는 즉시 보이고 목록 변환은 그 사이에 시작하지 않는다", async () => {
  sessionStorage.clear();
  markCollectInputIdle();
  const view = mount({});
  const applied: string[] = [];
  let mapped = 0;
  try {
    const depositor = field(view.host, "depositor");
    const date = field(view.host, "date");
    const previousDate = date.value;
    assert.equal(previousDate.length, 4);
    await act(async () => {
      depositor.focus();
    });

    for (const partial of ["박", "김", "김민", "김민준"]) {
      deferWhileCollectTyping("records", () => {
        mapped += 1;
        applied.push(partial);
      });
      await typeInto(depositor, partial);
      assert.equal(depositor.value, partial);
      assert.equal(mapped, 0);
    }

    await act(async () => {
      date.focus();
    });
    let typed = "";
    for (const digit of "1018") {
      typed += digit;
      const snapshot = typed;
      deferWhileCollectTyping("all-unpaid", () => {
        mapped += 1;
        applied.push(snapshot);
      });
      await act(async () => {
        date.dispatchEvent(new KeyboardEvent("keydown", { key: digit, bubbles: true }));
      });
      await typeInto(date, typed);
      assert.equal(date.value, typed);
      assert.equal(mapped, 0);
    }
    assert.notEqual(date.value, previousDate);
    assert.equal(depositor.value, "김민준");
    assert.deepEqual(applied, []);
    markCollectInputIdle();
    assert.equal(mapped, 2);
    assert.deepEqual(applied, ["김민준", "1018"]);
  } finally {
    view.unmount();
    sessionStorage.clear();
    markCollectInputIdle();
  }
});

test("금액을 치는 동안 조정 후 총 수금액이 따라 바뀌고 입금자 칸은 그대로다", async () => {
  sessionStorage.clear();
  markCollectInputIdle();
  const view = mount({ currentCollected: 0, originalTotal: 2000000 });
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  assert.ok(proto?.get && proto.set);
  let writes = 0;
  try {
    const depositor = field(view.host, "depositor");
    const amount = field(view.host, "amount");
    const preview = () =>
      view.host
        .querySelector("[data-collect-preview-total]")
        ?.getAttribute("data-collect-preview-total");
    await act(async () => {
      depositor.focus();
    });
    await typeInto(depositor, "김민준");
    assert.equal(preview(), "0");

    Object.defineProperty(HTMLInputElement.prototype, "value", {
      configurable: true,
      get() {
        return proto.get!.call(this);
      },
      set(value: string) {
        if (this === depositor) writes += 1;
        proto.set!.call(this, value);
      },
    });

    await act(async () => {
      amount.focus();
    });
    let typed = "";
    for (const digit of "1450000") {
      typed += digit;
      await act(async () => {
        amount.dispatchEvent(new KeyboardEvent("keydown", { key: digit, bubbles: true }));
      });
      await typeInto(amount, typed);
      assert.equal(amount.value, typed);
      assert.equal(preview(), String(Number(typed)));
      assert.equal(writes, 0);
    }
    assert.equal(depositor.value, "김민준");
    assert.equal(amount.dataset.collectRenders, "1");
    assert.equal(depositor.dataset.collectRenders, "1");
    assert.equal(preview(), "1450000");
  } finally {
    Object.defineProperty(HTMLInputElement.prototype, "value", proto);
    view.unmount();
    sessionStorage.clear();
    markCollectInputIdle();
  }
});

test("1931과 1450000은 치는 즉시 보이고 목록 갱신은 입력이 끝난 뒤에 적용된다", async () => {
  sessionStorage.clear();
  markCollectInputIdle();
  const view = mount({});
  const applied: string[] = [];
  try {
    const time = field(view.host, "time");
    const amount = field(view.host, "amount");
    await act(async () => {
      time.focus();
    });

    let typed = "";
    for (const digit of "1931") {
      typed += digit;
      const snapshot = typed;
      deferWhileCollectTyping("records", () => applied.push(`time:${snapshot}`));
      await typeInto(time, typed);
      assert.equal(time.value, typed);
    }
    assert.deepEqual(applied, []);

    await act(async () => {
      amount.focus();
    });
    typed = "";
    for (const digit of "1450000") {
      typed += digit;
      const snapshot = typed;
      deferWhileCollectTyping("all-unpaid", () => applied.push(`amount:${snapshot}`));
      await typeInto(amount, typed);
      assert.equal(amount.value, typed);
    }
    assert.equal(amount.value, "1450000");
    assert.deepEqual(applied, []);

    await act(async () => {
      amount.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    assert.deepEqual(applied, []);
    markCollectInputIdle();
    assert.deepEqual(applied, ["time:1931", "amount:1450000"]);
  } finally {
    view.unmount();
    sessionStorage.clear();
    markCollectInputIdle();
  }
});
