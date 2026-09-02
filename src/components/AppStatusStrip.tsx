"use client";

import { MacroStrip } from "@/components/MacroStrip";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { cn } from "@/lib/format";
import { PAGE_COLUMN_CLASS } from "@/lib/page-shell";
import { NO_VALUE } from "@/lib/format";
import { loadCachedQuotes } from "@/lib/quote-cache";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { useEffect, useState } from "react";

export type AppStatusProps = {
  quotesUpdatedAt?: number | null;
  quotesDelayed?: boolean;
  quotedCount?: number;
  totalCount?: number;
};

function formatAge(sec: number): string {
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

/** One locked row under the header. Same height on every room. */
export function AppStatusStrip({
  quotesUpdatedAt,
  quotesDelayed = false,
  quotedCount,
  totalCount,
}: AppStatusProps) {
  const [cachedAt] = useHydratedCache(
    () => loadCachedQuotes().savedAt,
    null as number | null
  );
  const updatedAt = quotesUpdatedAt ?? cachedAt;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 1000);
    const onVis = () => setNow(Date.now());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const sec =
    updatedAt == null
      ? null
      : Math.max(0, Math.floor((now - updatedAt) / 1000));

  return (
    <div className="border-b border-border">
      <div
        className={cn(
          PAGE_COLUMN_CLASS,
          "flex h-9 min-h-9 items-center gap-3 sm:gap-4"
        )}
      >
        {/*
          * A middle dot, never a spaced hyphen.
          *
          * "Prices - 21s ago" put a minus sign in front of a figure inside
          * a mono tabular row, which is where every other minus on the
          * screen means a loss. And the count says what it counts: it is
          * companies with a price, which is a different number from the
          * holdings figure in the page title 60px below, and two different
          * numbers for one word is what makes a reader doubt the
          * arithmetic. It is hidden at zero, where it said "0/0 holdings".
          */}
        <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs font-medium tabular-nums text-muted-foreground">
          {sec == null
            ? `Prices ${NO_VALUE}`
            : quotesDelayed && sec >= 60
              ? `Price as of ${formatAge(sec)}`
              : `Prices · ${formatAge(sec)}`}
          {quotedCount != null && totalCount != null && totalCount > 0 ? (
            <span className="hidden sm:inline">
              {quotedCount === totalCount
                ? ` · all ${totalCount} ${totalCount === 1 ? "company" : "companies"} priced`
                : ` · ${quotedCount} of ${totalCount} companies priced`}
            </span>
          ) : null}
          {quotesDelayed && sec != null && sec >= 30 * 60 ? " · delayed" : ""}
        </span>
        <WidgetErrorBoundary name="Market" className="min-w-0">
          <MacroStrip />
        </WidgetErrorBoundary>
      </div>
    </div>
  );
}
