"use client";

import { useCircleHref } from "@/lib/use-circle-href";
import { stashOpenTab } from "@/lib/active-sheet";
import { cn } from "@/lib/format";
import {
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
} from "@/lib/overview";
import { useDockPad } from "@/lib/use-dock-pad";
import {
  Activity,
  Calculator,
  Compass,
  FlaskConical,
  LayoutDashboard,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export type MobileTabId = "home" | "pulse" | "lab" | "compound" | "circle";

const TABS: {
  id: MobileTabId;
  href: string;
  label: string;
  shortLabel: string;
  Icon: typeof LayoutDashboard;
  metaId: string | null;
}[] = [
  {
    id: "home",
    href: "/?tab=overview",
    label: "Overview",
    shortLabel: "Home",
    Icon: LayoutDashboard,
    metaId: OVERVIEW_TAB_ID,
  },
  {
    id: "pulse",
    href: "/?tab=pulse",
    label: "Pulse",
    shortLabel: "Pulse",
    Icon: Activity,
    metaId: PULSE_TAB_ID,
  },
  {
    id: "lab",
    href: "/?tab=lab",
    label: "Lab",
    shortLabel: "Lab",
    Icon: FlaskConical,
    metaId: LAB_TAB_ID,
  },
  {
    id: "compound",
    href: "/?tab=compound",
    label: "Compound",
    shortLabel: "Growth",
    Icon: Calculator,
    metaId: COMPOUND_TAB_ID,
  },
  {
    id: "circle",
    href: "/communities",
    label: "Circle",
    shortLabel: "Circle",
    Icon: Compass,
    metaId: null,
  },
];

export function activeMobileTab(
  pathname: string,
  tabParam?: string | null
): MobileTabId | null {
  if (pathname.startsWith("/account") || pathname.startsWith("/admin")) {
    return null;
  }
  if (pathname.startsWith("/upside-portfolio")) {
    return null;
  }
  if (pathname.startsWith("/communities")) {
    return "circle";
  }
  const tab = (tabParam ?? "").toLowerCase();
  if (tab === "pulse") return "pulse";
  if (tab === "lab") return "lab";
  if (tab === "compound") return "compound";
  return "home";
}

export function MobileTabBar({
  active,
  alertCount = 0,
  className,
  pulseHref,
  hiddenModeIds = [],
  onSelect,
}: {
  active: MobileTabId | null;
  alertCount?: number;
  className?: string;
  pulseHref?: string;
  hiddenModeIds?: string[];
  /** Return true to stay on this page (Dashboard SPA tabs). */
  onSelect?: (id: MobileTabId) => boolean | void;
}) {
  /* A callback ref: see `use-dock-pad.ts` for why the hook takes the node. */
  const [dockEl, setDockEl] = useState<HTMLElement | null>(null);
  const circleHref = useCircleHref();
  useDockPad(dockEl);
  const tabs = TABS.filter(
    (t) => !t.metaId || !hiddenModeIds.includes(t.metaId)
  );
  const cols = tabs.length;

  return (
    <nav
      ref={setDockEl}
      aria-label="App"
      className={cn(
        /*
         * Same as the desktop dock: no band, just a centring container.
         * `pointer-events-none` here and `pointer-events-auto` on the bar
         * itself, or this full-width element eats every tap along the
         * bottom of the page even though nothing is drawn there.
         */
        "keyboard-chrome pointer-events-none fixed inset-x-0 bottom-0 z-40 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden",
        className
      )}
    >
      <div className="px-4">
        <div
          role="tablist"
          className={cn(
            "card-sheen glass pointer-events-auto grid w-full gap-1 rounded-xl p-1 ring-1 ring-foreground/20",
            cols === 3 && "grid-cols-3",
            cols === 4 && "grid-cols-4",
            cols === 5 && "grid-cols-5"
          )}
        >
          {tabs.map(({ id, href, label, shortLabel, Icon }) => {
            const on = active === id;
            const to =
              id === "circle"
                ? circleHref
                : id === "pulse" && pulseHref
                  ? pulseHref
                  : href;
            return (
              <Link
                key={id}
                href={to}
                prefetch
                role="tab"
                aria-label={label}
                aria-current={on ? "page" : undefined}
                aria-selected={on}
                onClick={(e) => {
                  if (id === "home") stashOpenTab("overview");
                  if (id === "pulse") stashOpenTab("pulse");
                  if (id === "lab") stashOpenTab("lab");
                  if (id === "compound") stashOpenTab("compound");
                  if (!onSelect) return;
                  if (onSelect(id)) e.preventDefault();
                }}
                className={cn(
                  "flex h-12 min-h-0 min-w-0 appearance-none flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-xs font-medium transition-colors",
                  on
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="relative">
                  <Icon
                    className={cn("h-4 w-4", id === "compound" && "scale-125")}
                    strokeWidth={2}
                    aria-hidden
                  />
                  {id === "home" && alertCount > 0 && (
                    <span className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </span>
                <span className="max-w-full leading-none">
                  {shortLabel}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
