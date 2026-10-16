"use client";

import { useEffect, useRef } from "react";
import { ChevronDownIcon } from "@/components/Icons";

/**
 * A pill button that opens a panel using the Popover API (top layer, light
 * dismiss, Escape to close). Where CSS anchor positioning is supported the
 * panel is tethered under the pill in CSS (.pop-panel[data-anchored]);
 * elsewhere it is placed with getBoundingClientRect while open.
 * The panel stays in the DOM, so form fields inside it still submit with
 * the surrounding form.
 */
export function PillPopover({
  id,
  label,
  active = false,
  icon,
  children,
}: {
  id: string;
  label: string;
  active?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const button = buttonRef.current;
    if (!panel || !button) return;

    if (CSS.supports("position-area: block-end")) {
      panel.dataset.anchored = "true";
      return;
    }

    const place = () => {
      const r = button.getBoundingClientRect();
      const width = panel.offsetWidth;
      panel.style.position = "fixed";
      panel.style.top = `${Math.round(r.bottom + 6)}px`;
      panel.style.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - width - 8)))}px`;
    };
    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === "open") {
        place();
        window.addEventListener("scroll", place, {
          passive: true,
          capture: true,
        });
        window.addEventListener("resize", place);
      } else {
        window.removeEventListener("scroll", place, { capture: true });
        window.removeEventListener("resize", place);
      }
    };
    panel.addEventListener("toggle", onToggle);
    return () => {
      panel.removeEventListener("toggle", onToggle);
      window.removeEventListener("scroll", place, { capture: true });
      window.removeEventListener("resize", place);
    };
  }, []);

  return (
    <>
      <button ref={buttonRef} type="button" popoverTarget={id} className="pill" data-active={active}>
        {icon}
        {label}
        <ChevronDownIcon className="size-4 opacity-70" />
      </button>
      <div ref={panelRef} id={id} popover="auto" className="pop-panel">
        {children}
      </div>
    </>
  );
}
