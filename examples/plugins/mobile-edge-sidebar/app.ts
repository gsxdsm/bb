import { definePluginApp } from "@get-bb/plugin-sdk/app";

const CLOSED_PANEL =
  '[data-sidebar="panel"][data-vaul-drawer-direction="left"][data-state="closed"]';
const EXCLUDED =
  'input, textarea, select, button, a, [contenteditable], [role="slider"], [role="dialog"], [data-vaul-drawer], [data-no-sidebar-swipe], [data-sidebar="panel"]';

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "mobile-edge-sidebar",
    mount({ signal }) {
      let gesture: { id: number; x: number; y: number; time: number } | null =
        null;
      const reset = () => {
        gesture = null;
      };
      const start = (event: TouchEvent) => {
        reset();
        if (
          event.defaultPrevented ||
          !event.cancelable ||
          event.touches.length !== 1 ||
          !document.querySelector(CLOSED_PANEL) ||
          document.querySelector(
            '[role="dialog"]:not([inert]):not([data-state="closed"])',
          ) ||
          !(event.target instanceof Element) ||
          !event.target.closest('[data-sidebar="inset"]') ||
          event.target.closest(EXCLUDED) ||
          window.getSelection()?.isCollapsed === false
        )
          return;
        const touch = event.touches.item(0);
        if (!touch || touch.clientX < 0 || touch.clientX >= 24) return;
        event.preventDefault();
        gesture = {
          id: touch.identifier,
          x: touch.clientX,
          y: touch.clientY,
          time: event.timeStamp,
        };
      };
      const move = (event: TouchEvent) => {
        if (!gesture) return;
        const current = gesture;
        const touch = Array.from(event.touches).find(
          (item) => item.identifier === current.id,
        );
        if (!touch || event.touches.length !== 1) {
          reset();
          return;
        }
        const dx = touch.clientX - current.x;
        const dy = touch.clientY - current.y;
        if (dx < -12 || (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)))
          reset();
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
        if (
          dx >= 48 &&
          dx > Math.abs(dy) * 1.5 &&
          event.timeStamp - current.time <= 1000 &&
          document.querySelector(CLOSED_PANEL)
        ) {
          document
            .querySelector<HTMLButtonElement>(
              '[data-sidebar="trigger"][aria-expanded="false"]',
            )
            ?.click();
        }
      };
      document.addEventListener("touchstart", start, {
        capture: true,
        passive: false,
      });
      document.addEventListener("touchmove", move, {
        capture: true,
        passive: true,
      });
      document.addEventListener("touchend", end, { capture: true });
      document.addEventListener("touchcancel", reset, { capture: true });
      window.addEventListener("blur", reset);
      const dispose = () => {
        reset();
        document.removeEventListener("touchstart", start, true);
        document.removeEventListener("touchmove", move, true);
        document.removeEventListener("touchend", end, true);
        document.removeEventListener("touchcancel", reset, true);
        window.removeEventListener("blur", reset);
        signal.removeEventListener("abort", dispose);
      };
      signal.addEventListener("abort", dispose, { once: true });
      return dispose;
    },
  });
});
