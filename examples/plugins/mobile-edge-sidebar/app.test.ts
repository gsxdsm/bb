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
  vi.stubGlobal("ReactNativeWebView", {});
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
  vi.unstubAllGlobals();
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

it("opens the native sidebar once without blocking taps at touch start", () => {
  expect(touch("touchstart", 8).defaultPrevented).toBe(false);
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
  const start = touch("touchstart", scenario === "outside edge" ? 80 : 8);
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

it.each(["header", "footer", "safe-area", "button", "link", "wider edge"])(
  "opens from the %s",
  (location) => {
    if (location === "header" || location === "footer") {
      const region = document.createElement(location);
      document.body.append(region);
      region.append(target);
    }
    if (location === "safe-area") target = document.body;
    if (location === "button" || location === "link") {
      const control = document.createElement(
        location === "link" ? "a" : "button",
      );
      target.append(control);
      target = control;
    }
    const x = location === "wider edge" ? 50 : 8;
    touch("touchstart", x);
    touch("touchmove", x + 60);
    touch("touchend", x + 70);
    expect(opened).toBe(1);
  },
);

it("keeps vertical scroll and ordinary button taps available in the native edge area", () => {
  const control = document.createElement("button");
  target.append(control);
  target = control;
  const click = vi.fn();
  target.addEventListener("click", click);
  expect(touch("touchstart", 8).defaultPrevented).toBe(false);
  expect(touch("touchmove", 9, 155).defaultPrevented).toBe(false);
  touch("touchend", 9, 170);
  target.click();
  expect(click).toHaveBeenCalledOnce();
  expect(opened).toBe(0);
});

it("claims horizontal intent and prevents a swipe over a button from clicking it", () => {
  const control = document.createElement("button");
  target.append(control);
  target = control;
  const click = vi.fn();
  target.addEventListener("click", click);
  touch("touchstart", 8);
  expect(touch("touchmove", 35).defaultPrevented).toBe(true);
  touch("touchend", 90);
  target.click();
  expect(click).not.toHaveBeenCalled();
  expect(opened).toBe(1);
});

it("delivers normal pointerdown taps to edge dropdown triggers while bb sees its swipe opt-out", () => {
  const control = document.createElement("button");
  control.setAttribute("aria-haspopup", "menu");
  target.append(control);
  target = control;
  const pointerTap = vi.fn();
  target.addEventListener("pointerdown", pointerTap);
  const excluded: boolean[] = [];
  const coreStart = (event: Event) => {
    excluded.push(
      event.target instanceof Element &&
        event.target.closest("[data-no-sidebar-swipe]") !== null,
    );
  };
  document.addEventListener("pointerdown", coreStart, true);
  document.addEventListener("touchstart", coreStart, true);
  try {
    const pointer = new Event("pointerdown", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperties(pointer, {
      pointerType: { value: "touch" },
      clientX: { value: 8 },
    });
    target.dispatchEvent(pointer);
    expect(pointerTap).toHaveBeenCalledOnce();
    expect(pointer.defaultPrevented).toBe(false);
    touch("touchstart", 8);
    expect(excluded).toEqual([true, true]);
    touch("touchend", 8);
    expect(target.hasAttribute("data-no-sidebar-swipe")).toBe(false);
    touch("touchstart", 100);
    expect(excluded).toEqual([true, true, false]);
  } finally {
    document.removeEventListener("pointerdown", coreStart, true);
    document.removeEventListener("touchstart", coreStart, true);
  }
});

it("opens the collapsed sidebar on a wide native screen without a mobile drawer", () => {
  document.querySelector('[data-sidebar="panel"]')!.remove();
  touch("touchstart", 8);
  touch("touchmove", 70);
  touch("touchend", 90);
  expect(opened).toBe(1);
});

it("keeps browser back navigation reserved while preserving browser links", () => {
  vi.stubGlobal("ReactNativeWebView", undefined);
  vi.stubGlobal("innerWidth", 390);
  expect(touch("touchstart", 8).defaultPrevented).toBe(true);
  touch("touchend", 90);
  expect(opened).toBe(1);
  target.innerHTML = "<a>Link</a>";
  target = target.querySelector("a")!;
  expect(touch("touchstart", 8).defaultPrevented).toBe(false);
});

it("opens from a collapsed native navigation rail", () => {
  const rail = document.querySelector('[data-sidebar="panel"]')!;
  rail.removeAttribute("data-vaul-drawer-direction");
  rail.removeAttribute("data-state");
  rail.append(target);
  touch("touchstart", 8);
  touch("touchmove", 75);
  touch("touchend", 90);
  expect(opened).toBe(1);
});

it.each(["touchend", "touchcancel", "blur", "dispose"])(
  "restores gesture opt-outs after %s without removing existing exclusions",
  async (finish) => {
    touch("touchstart", 8);
    if (finish === "blur") window.dispatchEvent(new Event("blur"));
    else if (finish === "dispose") await dispose?.();
    else touch(finish, 8);
    expect(target.hasAttribute("data-no-sidebar-swipe")).toBe(false);
    if (finish === "dispose") return;
    target.setAttribute("data-no-sidebar-swipe", "original");
    touch("touchstart", 8);
    touch("touchend", 8);
    expect(target.getAttribute("data-no-sidebar-swipe")).toBe("original");
  },
);
