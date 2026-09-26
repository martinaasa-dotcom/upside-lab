"use client";

import { useEffect } from "react";

/**
 * The rim of the card under the pointer catches the light where the
 * pointer is.
 *
 * Glass in this app carries all of its light on the rim and none in the
 * body, so this is the same material answering a hand: a soft warm arc
 * along the edge nearest the cursor, drawn by `.card-sheen.glass::before`
 * (globals.css) and masked to the one-pixel rim. The body is never lit,
 * which keeps the black inside a pane the black of the room.
 *
 * One listener for the whole app, one element marked at a time, and one
 * rect read per frame for that element only. A mouse or trackpad only: a
 * finger has no hover, and a touch screen would latch the light on the
 * last card tapped. Off under reduced motion.
 */
const SELECTOR = ".card-sheen.glass:not(.glass-dock)";

export function RimLight() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || calm.matches) return;

    let lit: HTMLElement | null = null;
    let frame = 0;
    let last: PointerEvent | null = null;

    const clear = () => {
      if (lit) lit.removeAttribute("data-rim");
      lit = null;
    };

    const paint = () => {
      frame = 0;
      const e = last;
      if (!e) return;
      const target = e.target instanceof Element ? e.target : null;
      const card = target?.closest<HTMLElement>(SELECTOR) ?? null;
      if (card !== lit) {
        clear();
        lit = card;
        if (lit) lit.setAttribute("data-rim", "");
      }
      if (!lit) return;
      const r = lit.getBoundingClientRect();
      lit.style.setProperty("--rim-x", `${(e.clientX - r.left).toFixed(0)}px`);
      lit.style.setProperty("--rim-y", `${(e.clientY - r.top).toFixed(0)}px`);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      last = e;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onLeave = () => {
      last = null;
      clear();
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      if (frame) cancelAnimationFrame(frame);
      clear();
    };
  }, []);
  return null;
}
