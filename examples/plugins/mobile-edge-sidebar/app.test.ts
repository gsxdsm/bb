// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  loadPluginApp,
  mountPluginContentScripts,
} from "@get-bb/plugin-sdk/testing/app";

let dispose: (() => Promise<void>) | undefined;
let target: HTMLElement;
let trigger: HTMLButtonElement;
let opened = 0;

function touch(type: string, x: number, y = 100, count = 1) {
  const point = { identifier: 1, clientX: x, clientY: y };
  const touches =
    type === "touchend" || type === "touchcancel"
      ? []
      : Array.from({ length: count }, (_, i) => ({
          ...point,
          identifier: i + 1,
        }));
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    touches: {
      value: Object.assign(touches, {
        item: (i: number) => touches[i] ?? null,
      }),
    },
    changedTouches: { value: [point] },
  });
  target.dispatchEvent(event);
  return event;
}

beforeEach(async () => {
  opened = 0;
  document.body.innerHTML = `<button data-sidebar="trigger" aria-expanded="false"></button>
    <div data-sidebar="panel" data-vaul-drawer-direction="left" data-state="closed" inert></div>
    <main data-sidebar="inset"><div id="target">Answer</div></main>`;
  target = document.querySelector<HTMLElement>("#target")!;
  trigger = document.querySelector<HTMLButtonElement>("button")!;
  trigger.addEventListener("click", () => {
    opened += 1;
  });
  const app = await loadPluginApp(() => import("./app"));
  const scripts = await mountPluginContentScripts(app, {
    pluginId: "mobile-edge-sidebar",
    generation: 1,
  });
  dispose = () => scripts.lifecycle.dispose();
});

afterEach(async () => {
  await dispose?.();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it("claims an edge gesture before browser navigation and opens the host sidebar once", () => {
  expect(touch("touchstart", 8).defaultPrevented).toBe(true);
  touch("touchmove", 70);
  touch("touchend", 90);
  touch("touchend", 90);
  expect(opened).toBe(1);
});

it.each([
  "outside edge",
  "short",
  "vertical",
  "cancelled",
  "multitouch",
  "blur",
  "slow",
  "already open",
  "dialog",
  "input",
  "selection",
])("leaves %s gestures alone", (scenario) => {
  if (scenario === "already open")
    document
      .querySelector('[data-sidebar="panel"]')!
      .setAttribute("data-state", "open");
  if (scenario === "dialog")
    document.body.insertAdjacentHTML("beforeend", '<div role="dialog"></div>');
  if (scenario === "input") {
    target.innerHTML = "<input>";
    target = target.querySelector("input")!;
  }
  if (scenario === "selection") {
    const range = document.createRange();
    range.selectNodeContents(target);
    window.getSelection()!.addRange(range);
  }
  const start = touch("touchstart", scenario === "outside edge" ? 30 : 8);
  if (
    ["outside edge", "already open", "dialog", "input", "selection"].includes(
      scenario,
    )
  )
    expect(start.defaultPrevented).toBe(false);
  if (scenario === "vertical") touch("touchmove", 10, 150);
  if (scenario === "cancelled") touch("touchcancel", 80);
  if (scenario === "multitouch") touch("touchmove", 60, 100, 2);
  if (scenario === "blur") window.dispatchEvent(new Event("blur"));
  if (scenario === "slow") {
    touch("touchcancel", 8);
    vi.spyOn(Event.prototype, "timeStamp", "get")
      .mockReturnValueOnce(0)
      .mockReturnValue(1500);
    touch("touchstart", 8);
  }
  touch("touchend", scenario === "short" ? 35 : 90);
  expect(opened).toBe(0);
  window.getSelection()?.removeAllRanges();
});

it("does not close a sidebar opened by another control during the swipe", () => {
  touch("touchstart", 8);
  document
    .querySelector('[data-sidebar="panel"]')!
    .setAttribute("data-state", "open");
  touch("touchend", 90);
  expect(opened).toBe(0);
});

it("removes listeners and discards an active gesture on disposal", async () => {
  touch("touchstart", 8);
  await dispose?.();
  touch("touchend", 90);
  expect(touch("touchstart", 8).defaultPrevented).toBe(false);
  touch("touchend", 90);
  expect(opened).toBe(0);
});
