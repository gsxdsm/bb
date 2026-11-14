import { definePluginApp } from "@get-bb/plugin-sdk/app";

const EXCLUDED =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="dialog"], [data-vaul-drawer]';

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "mobile-edge-sidebar",
    mount({ signal }) {
      let gesture: {
        id: number;
        x: number;
        y: number;
        time: number;
        target: Element;
        claimed: boolean;
      } | null = null;
      let markedTarget: Element | null = null;
      const restoreTarget = () => {
        if (markedTarget?.getAttribute("data-no-sidebar-swipe") === "")
          markedTarget.removeAttribute("data-no-sidebar-swipe");
        markedTarget = null;
      };
      const markTarget = (target: Element) => {
        restoreTarget();
        if (!target.hasAttribute("data-no-sidebar-swipe")) {
          target.setAttribute("data-no-sidebar-swipe", "");
          markedTarget = target;
        }
      };
      let clickTimer: number | undefined;
      let clickTarget: Element | null = null;
      const isNative = () => Boolean(Reflect.get(window, "ReactNativeWebView"));
      const getTrigger = () =>
        document.querySelector('[data-sidebar="panel"][data-state="open"]')
          ? null
          : document.querySelector<HTMLButtonElement>(
              '[data-sidebar="trigger"][aria-expanded="false"]:not([disabled])',
            );
      const canStart = (target: EventTarget | null, x: number) =>
        (isNative() || window.innerWidth < 768) &&
        x >= 0 &&
        x < 64 &&
        getTrigger() !== null &&
        !document.querySelector(
          '[role="dialog"]:not([inert]):not([data-state="closed"])',
        ) &&
        target instanceof Element &&
        !target.closest(EXCLUDED) &&
        (isNative() || !target.closest("button, a")) &&
        window.getSelection()?.isCollapsed !== false;
      const reset = () => {
        gesture = null;
        restoreTarget();
      };
      const clearClick = () => {
        window.clearTimeout(clickTimer);
        clickTimer = undefined;
        clickTarget = null;
      };
      const suppressClick = (event: MouseEvent) => {
        if (
          clickTarget &&
          event.target instanceof Node &&
          clickTarget.contains(event.target)
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          clearClick();
        }
      };
      const pointerStart = (event: PointerEvent) => {
        if (
          !event.defaultPrevented &&
          event.pointerType === "touch" &&
          event.isPrimary !== false &&
          canStart(event.target, event.clientX)
        ) {
          if (event.target instanceof Element) markTarget(event.target);
        }
      };
      const pointerEnd = () => {
        if (!gesture) restoreTarget();
      };
      const start = (event: TouchEvent) => {
        reset();
        const touch = event.touches.item(0);
        if (
          event.defaultPrevented ||
          !event.cancelable ||
          event.touches.length !== 1 ||
          !touch ||
          !canStart(event.target, touch.clientX) ||
          !(event.target instanceof Element)
        )
          return;
        markTarget(event.target);
        if (!isNative()) event.preventDefault();
        clearClick();
        gesture = {
          id: touch.identifier,
          x: touch.clientX,
          y: touch.clientY,
          time: event.timeStamp,
          target: event.target,
          claimed: false,
        };
      };
      const move = (event: TouchEvent) => {
        const current = gesture;
        if (!current) return;
        const touch = Array.from(event.touches).find(
          (item) => item.identifier === current.id,
        );
        if (!touch || event.touches.length !== 1) {
          reset();
          return;
        }
        const dx = touch.clientX - current.x;
        const dy = touch.clientY - current.y;
        if (!current.claimed) {
          if (dx < -12 || (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx))) {
            reset();
            return;
          }
          if (dx < 10 || dx <= Math.abs(dy) * 1.25) return;
          current.claimed = true;
        }
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
      };
      const end = (event: TouchEvent) => {
        const current = gesture;
        reset();
        if (!current || event.touches.length !== 0) return;
        const touch = Array.from(event.changedTouches).find(
          (item) => item.identifier === current.id,
        );
        if (!touch) return;
        const dx = touch.clientX - current.x;
        const dy = touch.clientY - current.y;
        const open =
          dx >= 48 &&
          dx > Math.abs(dy) * 1.5 &&
          event.timeStamp - current.time <= 1000;
        if (current.claimed || open) {
          if (event.cancelable) event.preventDefault();
          event.stopPropagation();
          if (open) getTrigger()?.click();
          clearClick();
          clickTarget = current.target;
          clickTimer = window.setTimeout(clearClick, 400);
        }
      };
      window.addEventListener("pointerdown", pointerStart, {
        capture: true,
        passive: true,
      });
      window.addEventListener("pointerup", pointerEnd, { capture: true });
      window.addEventListener("pointercancel", pointerEnd, { capture: true });
      window.addEventListener("touchstart", start, {
        capture: true,
        passive: false,
      });
      window.addEventListener("touchmove", move, {
        capture: true,
        passive: false,
      });
      window.addEventListener("touchend", end, {
        capture: true,
        passive: false,
      });
      window.addEventListener("touchcancel", reset, { capture: true });
      window.addEventListener("click", suppressClick, { capture: true });
      window.addEventListener("blur", reset);
      const dispose = () => {
        reset();
        clearClick();
        window.removeEventListener("pointerdown", pointerStart, true);
        window.removeEventListener("pointerup", pointerEnd, true);
        window.removeEventListener("pointercancel", pointerEnd, true);
        window.removeEventListener("touchstart", start, true);
        window.removeEventListener("touchmove", move, true);
        window.removeEventListener("touchend", end, true);
        window.removeEventListener("touchcancel", reset, true);
        window.removeEventListener("click", suppressClick, true);
        window.removeEventListener("blur", reset);
        signal.removeEventListener("abort", dispose);
      };
      signal.addEventListener("abort", dispose, { once: true });
      return dispose;
    },
  });
});
