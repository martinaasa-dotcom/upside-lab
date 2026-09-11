"use client";

import { cn } from "@/lib/format";
import { Check, ChevronDown, Globe, GraduationCap, Lock } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { aimOnPress } from "@/lib/route-aim";
import {
  loadCommunityListCache,
  prefetchCommunity,
  prefetchCommunityList,
  saveCommunityListCache,
  type CommunityListRow,
} from "@/lib/community-cache";

type Props = {
  communityId: string;
  currentName: string;
};

/**
 * The title of a circle room is also how you leave it for another one.
 *
 * There used to be exactly one way back to a circle you had already
 * opened: the dock's single "Circle" cell, which always opens whichever
 * circle you were in last (same design as the phone's "Holdings" cell —
 * see MobileTabBar.tsx). That is fine for the one-circle case and a trap
 * for anybody in two: opening the second circle makes it "last", so the
 * dock cell that used to return you to the first now only ever offers the
 * second one back, and the only way to the first is a trip through
 * `/communities` to find it in the list again, every single time.
 *
 * Portfolios solved the equivalent problem with a picker living in the
 * header title (`SheetPicker`) rather than one dock cell per portfolio on
 * the phone, "and the header picker stays the way you move between them."
 * This is that same answer for circles: the circle's name in the header
 * is a button when there is more than one circle to switch to, and it
 * opens every circle you belong to rather than sending you back to the
 * list to click through again.
 */
export function CirclePicker({ communityId, currentName }: Props) {
  const router = useRouter();
  const [circles, setCircles] = useHydratedCache<CommunityListRow[]>(
    () => loadCommunityListCache() ?? [],
    []
  );
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Best-effort refresh so a circle joined or left elsewhere shows up here
  // without the reader having to visit `/communities` first.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/communities", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const rows = (data.communities ?? []) as CommunityListRow[];
        setCircles(rows);
        saveCommunityListCache(rows);
        prefetchCommunityList(rows);
      })
      .catch(() => {
        /* the cached list, or the plain name, still works */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh once per mount
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest(`[data-circle-picker="${menuId}"]`)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onResize() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open, menuId]);

  // Nothing to switch to — the name alone, exactly as this read before.
  if (circles.length <= 1) {
    return <span className="truncate">{currentName}</span>;
  }

  function placeAndToggle() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const menuW = 240;
      setPos({
        top: rect.bottom + 6,
        left: Math.min(rect.left, window.innerWidth - menuW - 8),
      });
    }
    setOpen((o) => !o);
  }

  return (
    <span className="relative min-w-0" data-circle-picker={menuId}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Circle, ${currentName}`}
        title="Switch circle"
        onClick={placeAndToggle}
        className="touch-target inline-flex max-w-full items-center gap-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="truncate">{currentName}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            data-circle-picker={menuId}
            role="menu"
            aria-label="Your circles"
            className="fixed z-[80] max-h-[min(24rem,70vh)] min-w-[14rem] overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-sm"
            style={{ top: pos.top, left: pos.left }}
          >
            {circles.map((c) => {
              const selected = c.id === communityId;
              const href = `/communities/${c.id}`;
              return (
                <Link
                  key={c.id}
                  href={href}
                  role="menuitem"
                  aria-current={selected ? "true" : undefined}
                  onPointerEnter={() => void prefetchCommunity(c.id)}
                  onFocus={() => void prefetchCommunity(c.id)}
                  /*
                   * Say where this is going on the press, the same way a
                   * dock cell and a `CommunitiesList` row do (`route-aim.ts`)
                   * -- measured there at 514ms on a click against 457ms on
                   * the press for this exact move, opening a circle. The
                   * click still lands normally for a keyboard activation,
                   * which never fires a `pointerdown` to aim from.
                   */
                  onPointerDown={(e) => {
                    aimOnPress(e.nativeEvent, href, (path) => {
                      setOpen(false);
                      router.push(path);
                    });
                  }}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm sm:py-2.5",
                    selected
                      ? "bg-accent text-foreground"
                      : "text-foreground hover:bg-hover"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {c.kind === "classroom" ? (
                      <GraduationCap className="h-3.5 w-3.5 shrink-0 text-primary/80" />
                    ) : c.visibility === "public" ? (
                      <Globe className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : (
                      <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 truncate">{c.name}</span>
                  </span>
                  {selected && (
                    <Check
                      className="h-3.5 w-3.5 shrink-0 text-primary"
                      aria-hidden
                    />
                  )}
                </Link>
              );
            })}
          </div>,
          document.body
        )}
    </span>
  );
}
