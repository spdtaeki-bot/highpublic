import "./../lib/domTestSetup.ts";
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EstablishmentAdditionalCollectForm } from "./EstablishmentAdditionalCollectForm.tsx";

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
  onCollectAdditional?: () => Promise<void> | void;
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
    setNativeValue(depositor, "이태희10");
    await act(async () => {
      depositor.dispatchEvent(compositionEvent("compositionend", "이태희"));
    });
    assert.equal(depositor.value, "이태희");
    assert.equal(date.value, originalDate);

    await act(async () => {
      depositor.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      amount.focus();
    });
    await typeInto(depositor, "이태희10");
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
    assert.equal(view.host.textContent?.includes("이태희10"), false);
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
    assert.equal(depositor.value, "썸");
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
