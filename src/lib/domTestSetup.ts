import { GlobalWindow } from "happy-dom";

const window = new GlobalWindow({ url: "http://localhost/" });
const assign = globalThis as unknown as Record<string, unknown>;

const define = (key: string, value: unknown) => {
  try {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  } catch {
    try {
      assign[key] = value;
    } catch {
      // Node 가 읽기 전용으로 둔 전역은 테스트 입력 재현에 필요 없다.
    }
  }
};

define("window", window);
define("document", window.document);
define("HTMLElement", window.HTMLElement);
define("HTMLInputElement", window.HTMLInputElement);
define("Element", window.Element);
define("Node", window.Node);
define("Document", window.Document);
define("DocumentFragment", window.DocumentFragment);
define("navigator", window.navigator);
define("sessionStorage", window.sessionStorage);
define("localStorage", window.localStorage);
define("InputEvent", window.InputEvent);
define("CompositionEvent", window.CompositionEvent);
define("KeyboardEvent", window.KeyboardEvent);
define("FocusEvent", window.FocusEvent);
define("Event", window.Event);
define("getComputedStyle", window.getComputedStyle.bind(window));
define("requestAnimationFrame", window.requestAnimationFrame.bind(window));
define("cancelAnimationFrame", window.cancelAnimationFrame.bind(window));
define("IS_REACT_ACT_ENVIRONMENT", true);

export {};
