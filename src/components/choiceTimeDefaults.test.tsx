import "../lib/domTestSetup.ts";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChoiceActionModal } from "./ChoiceActionModal.tsx";
import { ChoiceSetupModal } from "./ChoiceSetupModal.tsx";

const elementPrototype = document.createElement("div").constructor.prototype as {
  animate?: () => {
    finished: Promise<void>;
    ready: Promise<void>;
    cancel: () => void;
    play: () => void;
    pause: () => void;
    finish: () => void;
  };
};
elementPrototype.animate = () => ({
  finished: Promise.resolve(),
  ready: Promise.resolve(),
  cancel() {},
  play() {},
  pause() {},
  finish() {},
});

const NOW = new Date(2026, 9, 20, 21, 59, 30);
const STALE = new Date(2026, 9, 20, 21, 43, 0);

function freezeNow(at: Date) {
  const fixed = at.getTime();
  const RealDate = globalThis.Date;
  class FrozenDate extends RealDate {
    constructor(...args: Array<string | number>) {
      if (args.length === 0) super(fixed);
      else super(...(args as ConstructorParameters<typeof RealDate>));
    }
    static now() {
      return fixed;
    }
  }
  globalThis.Date = FrozenDate as DateConstructor;
  return () => {
    globalThis.Date = RealDate;
  };
}

function setInputValue(element: HTMLInputElement, value: string) {
  const view = element.ownerDocument.defaultView;
  assert.ok(view);
  const setter = Object.getOwnPropertyDescriptor(
    view.HTMLInputElement.prototype,
    "value",
  )?.set;
  assert.ok(setter);
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function buttonByText(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll("button")].find((node) =>
    node.textContent?.includes(label),
  );
  assert.ok(button, label);
  return button;
}

async function render(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(ui);
  });
  return {
    host,
    root,
    async rerender(next: React.ReactElement) {
      await act(async () => {
        root.render(next);
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

describe("시간 기본값", { concurrency: 1 }, () => {
test("초이스 설정은 모달을 연 시각을 쓰고, 고친 시간은 유지한다", async () => {
  const restore = freezeNow(NOW);
  let view: { host: HTMLElement; rerender: (next: React.ReactElement) => Promise<void>; unmount: () => Promise<void> } | undefined;
  try {
    const props = {
      isOpen: true,
      onClose: () => {},
      staffNames: ["하퍼"],
      establishments: ["미술관"],
      onConfirm: () => {},
    };
    view = await render(<ChoiceSetupModal {...props} />);
    const time = view.host.querySelector<HTMLInputElement>('input[type="time"]');
    assert.ok(time);
    assert.equal(time.value, "21:59");

    await act(async () => {
      setInputValue(time, "21:10");
    });
    assert.equal(time.value, "21:10");

    await view.rerender(
      <ChoiceSetupModal {...props} staffNames={["하퍼", "다빈"]} establishments={["미술관", "갤러리"]} />,
    );
    const afterUpdate = view.host.querySelector<HTMLInputElement>('input[type="time"]');
    assert.ok(afterUpdate);
    assert.equal(afterUpdate.value, "21:10");

    await act(async () => {
      buttonByText(view.host, "현시간 적용").click();
    });
    assert.equal(afterUpdate.value, "21:59");
  } finally {
    await view?.unmount();
    restore();
  }
});

test("진행/튕김 시간은 멈춘 currentTime이 아니라 지금 시각이고, 수정값은 남는다", async () => {
  const restore = freezeNow(NOW);
  let view: { host: HTMLElement; root: Root; rerender: (next: React.ReactElement) => Promise<void>; unmount: () => Promise<void> } | undefined;
  try {
    const props = {
      isOpen: true,
      mode: "PROGRESS" as const,
      onClose: () => {},
      staffNames: ["하퍼"],
      initialEstablishmentName: "미술관",
      currentTime: STALE,
      onConfirm: () => {},
    };
    view = await render(<ChoiceActionModal {...props} />);
    const time = view.host.querySelector<HTMLInputElement>('input[placeholder="HH:mm"]');
    assert.ok(time);
    assert.equal(time.value, "21:59");

    await act(async () => {
      setInputValue(time, "2110");
    });
    assert.equal(time.value, "21:10");

    await view.rerender(
      <ChoiceActionModal
        {...props}
        currentTime={new Date(2026, 9, 20, 22, 5, 0)}
        initialEstablishmentName="미술관"
      />,
    );
    const afterUpdate = view.host.querySelector<HTMLInputElement>('input[placeholder="HH:mm"]');
    assert.ok(afterUpdate);
    assert.equal(afterUpdate.value, "21:10");

    await act(async () => {
      buttonByText(view.host, "현재시간 적용").click();
    });
    assert.equal(afterUpdate.value, "21:59");
  } finally {
    await view?.unmount();
    restore();
  }
});
});
