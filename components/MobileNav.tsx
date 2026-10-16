"use client";

import { useEffect, useRef } from "react";
import { MenuIcon } from "@/components/Icons";
import { SidebarContent } from "@/components/Sidebar";

/**
 * Phone navigation: a menu button and a drawer that slides in from the left.
 * The drawer is a manual popover (top layer, dims the page) holding a
 * horizontal scroll-snap surface with two stops, open and closed, so the
 * swipe-to-close gesture is native scrolling. An IntersectionObserver on the
 * sheet is the single source of truth for open/closed: it updates focus,
 * aria-expanded and inert however the drawer moved. Styles: .drawer* in
 * globals.css.
 */
export function MobileNav({ email, signOutAction, contentId }: { email: string; signOutAction: () => Promise<void>; contentId: string }) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const drawer = drawerRef.current;
    const scroller = scrollerRef.current;
    const sheet = sheetRef.current;
    if (!drawer || !scroller || !sheet) return;
    const content = document.getElementById(contentId);

    const onOpened = () => {
      if (content) content.inert = true;
      buttonRef.current?.setAttribute("aria-expanded", "true");
      sheet.focus();
    };
    const onClosed = () => {
      if (drawer.matches(":popover-open")) drawer.hidePopover();
      if (content) content.inert = false;
      buttonRef.current?.setAttribute("aria-expanded", "false");
    };

    const threshold = 1 / window.innerWidth;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (!entry || !drawer.matches(":popover-open")) return;
        if (entry.intersectionRatio < threshold) onClosed();
        if (entry.intersectionRatio === 1) onOpened();
      },
      { root: drawer, threshold: [threshold, 1] },
    );
    observer.observe(sheet);

    // Backdrop fade where scroll-driven animations are missing (Firefox).
    const fadeFallback = () => {
      drawer.style.setProperty("--drawer-backdrop", String(1 - scroller.scrollLeft / sheet.offsetWidth));
    };
    const needsFadeFallback = !CSS.supports("animation-timeline: scroll()");
    if (needsFadeFallback) scroller.addEventListener("scroll", fadeFallback);

    const onBackdropClick = (event: MouseEvent) => {
      if (!sheet.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drawer.matches(":popover-open")) close();
    };
    drawer.addEventListener("click", onBackdropClick);
    document.addEventListener("keydown", onKey);

    return () => {
      observer.disconnect();
      if (needsFadeFallback) scroller.removeEventListener("scroll", fadeFallback);
      drawer.removeEventListener("click", onBackdropClick);
      document.removeEventListener("keydown", onKey);
      if (content) content.inert = false;
    };
  }, [contentId]);

  async function open() {
    const drawer = drawerRef.current;
    const scroller = scrollerRef.current;
    if (!drawer || !scroller) return;
    drawer.showPopover();
    // Browsers without scroll-initial-target open at the "open" stop; jump
    // to the closed stop first so the drawer visibly slides in.
    if (!CSS.supports("scroll-initial-target", "nearest")) {
      scroller.scrollTo({ left: scroller.offsetWidth, behavior: "instant" });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    scroller.scrollTo({ left: 0, behavior: "auto" });
  }

  function close() {
    const scroller = scrollerRef.current;
    // Scroll back to the closed stop; the observer hides the popover once
    // the sheet has fully left, so the slide-out stays visible.
    if (scroller) scroller.scrollTo({ left: scroller.offsetWidth, behavior: "auto" });
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={open}
        aria-label="Menu"
        aria-expanded="false"
        aria-controls="nav-drawer"
        className="inline-flex size-11 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 lg:hidden"
      >
        <MenuIcon className="size-6" />
      </button>

      <div ref={drawerRef} id="nav-drawer" popover="manual" className="drawer lg:hidden">
        <div ref={scrollerRef} className="drawer-scroller">
          <div ref={sheetRef} tabIndex={-1} className="drawer-sheet outline-none">
            <SidebarContent email={email} signOutAction={signOutAction} onNavigate={close} />
          </div>
        </div>
      </div>
    </>
  );
}
