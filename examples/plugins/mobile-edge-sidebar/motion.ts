import { flushSync } from "react-dom";

export function createSidebarMotion(
  openSidebar: () => void,
  closeSidebar: () => void,
) {
  const panel = document.querySelector<HTMLElement>('[data-sidebar="panel"]');
  const inset = document.querySelector<HTMLElement>('[data-sidebar="inset"]');
  if (!panel || !inset) return null;
  const mobile = panel.hasAttribute("data-vaul-drawer-direction");
  const backdrop = document.querySelector<HTMLElement>(
    "[data-sidebar-mobile-backdrop]",
  );
  const gap = mobile
    ? null
    : panel.parentElement?.querySelector<HTMLElement>('[data-sidebar="gap"]');
  if (!mobile && !gap) return null;
  const saved: {
    node: HTMLElement;
    name: string;
    value: string;
    priority: string;
  }[] = [];
  const save = (node: HTMLElement, names: string[]) => {
    for (const name of names)
      saved.push({
        node,
        name,
        value: node.style.getPropertyValue(name),
        priority: node.style.getPropertyPriority(name),
      });
  };
  save(inset, ["translate", "transition"]);
  if (backdrop && mobile)
    save(backdrop, ["translate", "transition", "opacity"]);
  let width = panel.getBoundingClientRect().width;
  let closedWidth = 0;
  if (!mobile && gap) {
    closedWidth = gap.getBoundingClientRect().width;
    save(gap, ["width", "transition"]);
    save(panel, ["width", "left", "visibility", "clip-path", "transition"]);
    gap.style.width = `${closedWidth}px`;
    gap.style.transition = "none";
    panel.style.transition = "none";
    panel.style.width = "var(--sidebar-width)";
    panel.style.left = `${gap.getBoundingClientRect().left}px`;
    panel.style.visibility = "visible";
    width = panel.getBoundingClientRect().width;
  }
  if (mobile && width <= 0) width = Math.min(window.innerWidth * 0.86, 360);
  const distance = Math.max(0, width - closedWidth);
  let committed = false;
  const restore = () => {
    const transitions = saved.filter((entry) => entry.name === "transition");
    for (const { node } of transitions) node.style.transition = "none";
    for (const { node, name, value, priority } of saved) {
      if (name === "transition") continue;
      if (mobile && committed) node.style.removeProperty(name);
      else if (value) node.style.setProperty(name, value, priority);
      else node.style.removeProperty(name);
    }
    inset.getBoundingClientRect();
    for (const { node, name, value, priority } of transitions) {
      if (mobile && committed) node.style.removeProperty(name);
      else if (value) node.style.setProperty(name, value, priority);
      else node.style.removeProperty(name);
    }
  };
  if (distance <= 0) {
    restore();
    return null;
  }
  let timer: number | undefined;
  let done = false;
  let settling = false;
  const update = (delta: number, animate = false) => {
    if (done) return;
    const translate = Math.max(0, Math.min(distance, delta));
    const transition = animate
      ? "translate 220ms cubic-bezier(0.32, 0.72, 0, 1)"
      : "none";
    inset.style.transition = transition;
    inset.style.translate = `${translate}px`;
    if (mobile && backdrop) {
      backdrop.style.transition = animate
        ? `${transition}, opacity 220ms ease-out`
        : "none";
      backdrop.style.translate = `${translate}px`;
      backdrop.style.opacity = String(translate / distance);
    }
    if (!mobile) {
      panel.style.transition = animate
        ? "clip-path 220ms cubic-bezier(0.32, 0.72, 0, 1)"
        : "none";
      panel.style.clipPath = `inset(0px ${distance - translate}px 0px 0px)`;
    }
  };
  const cancel = () => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    if (!mobile && !committed) flushSync(closeSidebar);
    restore();
  };
  update(0);
  if (!mobile) flushSync(openSidebar);
  return {
    update(delta: number) {
      if (!settling) update(delta);
    },
    finish(open: boolean) {
      if (done || settling) return;
      settling = true;
      committed = open;
      if (open && mobile) openSidebar();
      update(open ? distance : 0, true);
      timer = window.setTimeout(cancel, 220);
    },
    cancel,
  };
}
