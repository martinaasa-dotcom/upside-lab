"use client";

import {
  allOpen,
  foldKey,
  openIndexes,
  readFold,
  writeFold,
  type SectionBox,
} from "@/lib/auto-fold";
import { usePathname } from "next/navigation";
import {
  Children,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/**
 * A RENDER THAT IS HYDRATING MUST WITHHOLD NOTHING, AND TIMING CANNOT
 * ANSWER WHETHER IT IS.
 *
 * Reading a remembered layout during render is how this saves anything,
 * and it is also how it would break hydration: the server has no idea
 * how tall the reader's screen is, so it renders every section, and a
 * client that renders fewer disagrees with the HTML it is hydrating.
 *
 * This was first written as a module flag flipped on the first
 * `requestAnimationFrame`, on the reasoning that hydration is over by
 * then. It is not. React 19 hydrates concurrently, in chunks, across
 * frames, so the flag turned true part-way through and the components
 * hydrated after it read the memory and rendered something else. It
 * showed up immediately as React error #418 on `/account` -- and only on
 * the second visit, once there was a memory to read, which is exactly
 * the shape of bug that reaches production.
 *
 * `useSyncExternalStore` is the mechanism React guarantees for this: the
 * server snapshot is what a hydrating render sees, and the client
 * snapshot is what every render after it sees. A component that mounts
 * *after* hydration -- which in production is every room, since every
 * gated route serves the signed-out landing -- never calls the server
 * snapshot at all, and so keeps the whole saving.
 */
const NEVER_CHANGES = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false
  );
}

/** Reasons the whole page must render, checked before any memory is used. */
function mustRenderWhole(): boolean {
  if (typeof window === "undefined") return true;
  /*
   * An anchor. A section something scrolls to would arrive empty, and a
   * reader who followed a link to it would land on nothing.
   */
  if (window.location.hash) return true;
  /* Nothing to open a closed section with. */
  if (typeof IntersectionObserver === "undefined") return true;
  return false;
}

function readMemory(key: string): SectionBox[] | null {
  try {
    return readFold(window.localStorage.getItem(key), null);
  } catch {
    /* Private mode, quota, a disabled store: render the page whole. */
    return null;
  }
}

type Fold = { count: number; open: Set<number> };

/**
 * Wraps each top-level section of a page so the ones past the fold are
 * not built until the reader is coming to them. See `auto-fold.ts` for
 * why this has to remember rather than measure up front.
 */
export function AutoFold({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hydrated = useHydrated();
  const sections = Children.toArray(children);
  const count = sections.length;

  const hostRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef<string>("");

  const start = useCallback(
    (n: number): Set<number> => {
      if (!hydrated || mustRenderWhole()) return allOpen(n);
      const vh = window.innerHeight;
      const boxes = readMemory(foldKey(pathname, vh));
      if (!boxes || !boxes.length) return allOpen(n);
      return openIndexes(boxes.slice(0, n), {
        scrollY: window.scrollY,
        viewportHeight: vh,
      });
    },
    [pathname, hydrated]
  );

  const [fold, setFold] = useState<Fold>(() => ({
    count,
    open: start(count),
  }));

  /*
   * A PAGE'S SECTION COUNT CHANGES WHILE IT LOADS, AND THAT IS THE
   * COMMON CASE RATHER THAN THE EDGE ONE.
   *
   * Sections are conditional -- `{!loading && ...}`, `{rows.length > 0
   * && ...}` -- and `Children.toArray` drops the falsy ones, so a room
   * that ends up with nine sections often renders two first. Recomputing
   * during render is React's own answer to state that depends on props:
   * it throws this render away and re-runs before anything is committed,
   * so the sections that arrive late are never built only to be closed.
   *
   * The new set is unioned with the old, never replacing it. Indexes
   * shift when a section appears, and closing one the reader is already
   * looking at is the one failure worth designing around.
   */
  if (fold.count !== count) {
    const next = start(count);
    for (const i of fold.open) if (i < count) next.add(i);
    setFold({ count, open: next });
  }

  const open = fold.open;

  const openOne = useCallback((i: number) => {
    setFold((prev) => {
      if (prev.open.has(i)) return prev;
      const next = new Set(prev.open);
      next.add(i);
      return { count: prev.count, open: next };
    });
  }, []);

  const openAll = useCallback(() => {
    setFold((prev) =>
      prev.open.size === prev.count
        ? prev
        : { count: prev.count, open: allOpen(prev.count) }
    );
  }, []);

  /*
   * One parse per page rather than one per closed section per render.
   * Safe to hold for the life of the page: the only writer is the effect
   * below, and it only ever runs with nothing closed, which is when no
   * reserve is being read.
   */
  const reserves = useMemo(() => {
    if (typeof window === "undefined") return null;
    return readMemory(foldKey(pathname, window.innerHeight));
  }, [pathname]);

  /*
   * A print, or a find-in-page the reader started, wants the whole
   * document. A withheld section is the one thing on this page that
   * neither can reach.
   */
  useEffect(() => {
    window.addEventListener("beforeprint", openAll);
    return () => window.removeEventListener("beforeprint", openAll);
  }, [openAll]);

  /* Open a closed section a screen before the reader reaches it. */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (open.size === count) return;
    if (typeof IntersectionObserver === "undefined") {
      openAll();
      return;
    }
    const watch = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = Number((e.target as HTMLElement).dataset.foldIndex);
          if (Number.isInteger(i)) openOne(i);
        }
      },
      { rootMargin: "100% 0px" }
    );
    for (const el of host.querySelectorAll<HTMLElement>("[data-fold-closed]")) {
      watch.observe(el);
    }
    return () => watch.disconnect();
  }, [open, count, openOne, openAll]);

  /*
   * MEASURE WHAT ACTUALLY LANDED, AND ONLY ONCE EVERY SECTION IS THERE.
   *
   * A page measured while some of it is still withheld would record the
   * reserve heights as though they were real and then believe them next
   * time. So the write waits for a render where nothing is closed, which
   * is the state every page reaches a task after it opens, and it
   * overwrites, so the last settled layout is the one remembered.
   */
  useLayoutEffect(() => {
    if (count === 0 || open.size !== count) return;
    const host = hostRef.current;
    if (!host) return;
    const key = foldKey(pathname, window.innerHeight);
    keyRef.current = key;
    const id = window.setTimeout(() => {
      const wrappers = host.querySelectorAll<HTMLElement>("[data-fold-index]");
      if (wrappers.length !== count) return;
      const boxes: SectionBox[] = [];
      for (const w of wrappers) {
        /*
         * An open wrapper is `display: contents` and has no box of its
         * own, so the section itself is what gets measured. A section
         * that rendered nothing takes a zero box, which is honest: it
         * costs no space and nothing needs to wait for it.
         */
        const kids = [...w.children] as HTMLElement[];
        if (!kids.length) {
          boxes.push({ top: 0, height: 0 });
          continue;
        }
        let top = Infinity;
        let bottom = -Infinity;
        for (const k of kids) {
          const r = k.getBoundingClientRect();
          top = Math.min(top, r.top + window.scrollY);
          bottom = Math.max(bottom, r.bottom + window.scrollY);
        }
        boxes.push({ top: Math.max(0, top), height: Math.max(0, bottom - top) });
      }
      try {
        window.localStorage.setItem(key, writeFold(boxes));
      } catch {
        /* Nothing to do; the page simply renders whole next time. */
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, count, pathname]);

  /*
   * A window that changed shape is a fresh question, and the only answer
   * allowed here is to open more. Closing a section because the window
   * got shorter would take content off the screen the reader is on.
   */
  useEffect(() => {
    const reset = () => {
      if (mustRenderWhole()) {
        openAll();
        return;
      }
      const key = foldKey(pathname, window.innerHeight);
      if (key === keyRef.current) return;
      if (!readMemory(key)) openAll();
    };
    window.addEventListener("resize", reset);
    window.addEventListener("orientationchange", reset);
    return () => {
      window.removeEventListener("resize", reset);
      window.removeEventListener("orientationchange", reset);
    };
  }, [pathname, openAll]);

  return (
    <div ref={hostRef} style={{ display: "contents" }}>
      {sections.map((child, i) =>
        open.has(i) ? (
          /*
           * `display: contents` so the wrapper is not a box. The page's
           * `main` is a flex column, and a real div here would become the
           * flex item in the section's place -- taking its `order`, its
           * own flex sizing and anything else the parent reads off it.
           */
          <div key={i} data-fold-index={i} style={{ display: "contents" }}>
            {child}
          </div>
        ) : (
          <div
            key={i}
            data-fold-index={i}
            data-fold-closed=""
            aria-hidden
            style={{ minHeight: reserves?.[i]?.height ?? 320 }}
          />
        )
      )}
    </div>
  );
}
