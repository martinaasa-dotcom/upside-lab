"use client";

import { useState } from "react";
import { AlertTriangle, ChevronRight, Landmark, X } from "lucide-react";
import { TONE_GLYPH, TONE_RING } from "@/components/AlertCards";
import { Button } from "@/components/ui/button";
import { Explain } from "@/components/ui/Explain";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import type { UpsideAlert } from "@/lib/alerts";
import { cn, currency } from "@/lib/format";
import type { MarginToneName } from "@/lib/margin-health";

/**
 * Borrowed money on Home, in the size it actually is.
 *
 * Two things this card used to get wrong, and they compounded.
 *
 * It found its alert by running `/cash|margin|borrow/i` over the alert's
 * own title and detail, so a rewrite of the copy changed where a tap went
 * and any other card whose wording happened to mention borrowed money
 * would have opened the cash editor. It reads `kind` now, which is what a
 * kind is for.
 *
 * And when the list was empty it fell back to "Cash is -$9,000." with a
 * neutral ring, which is the flat sentence `margin-health.ts` was written
 * to replace: no share of the portfolio, no distance to the broker's
 * floor, and the same calm grey for somebody borrowing 8% as for somebody
 * borrowing 153%. The tier, the ring, the glyph and every number now come
 * from the margin alert, which carries `marginCopy`'s own words.
 *
 * The tap opens the arithmetic, not a form. A reader who presses the one
 * card warning about a forced sale and lands on a field asking for a
 * figure they already know has been answered by the wrong screen; editing
 * cash is a row at the bottom of what opens, and the Cash tile beside it
 * still edits directly.
 */
function marginAlertIn(alerts: UpsideAlert[]): UpsideAlert | undefined {
  return alerts.find((a) => a.kind === "margin");
}

export function CashAlertCard({
  cash,
  alerts,
  onOpenCash,
  onOpenAlerts,
  className,
}: {
  cash: number;
  alerts: UpsideAlert[];
  onOpenCash?: () => void;
  onOpenAlerts?: () => void;
  className?: string;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const margin = marginAlertIn(alerts);
  const featured = margin ?? alerts[0];
  if (!featured && cash >= 0) return null;

  const borrowed = Boolean(margin) || cash < 0;
  const body =
    featured?.title ?? (cash < 0 ? `You have borrowed ${currency(-cash, 0)}` : null);
  if (!body) return null;

  const tone: MarginToneName = featured?.tone ?? "neutral";
  // A triangle is a claim that something needs doing now. Below the
  // warning tier the card is a fact about the portfolio, so it gets the
  // bank glyph and the reader's morning back.
  const Glyph = tone === "neutral" ? Landmark : AlertTriangle;
  const cushion = margin?.cushion ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() =>
          borrowed && margin ? setDetailOpen(true) : onOpenAlerts?.()
        }
        className={cn(
          "card-sheen glass w-full rounded-xl p-4 text-left ring-1",
          TONE_RING[tone],
          className
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-base font-semibold text-foreground">
            {borrowed ? "Borrowed money" : "Worth a look"}
          </p>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </div>
        <div className="mt-4 flex items-start gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              TONE_GLYPH[tone]
            )}
          >
            <Glyph className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-base text-foreground">{body}</p>
            {cushion ? (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {cushion}
              </p>
            ) : null}
          </div>
        </div>
      </button>

      {detailOpen && margin ? (
        <MarginSheet
          alert={margin}
          onClose={() => setDetailOpen(false)}
          onOpenCash={onOpenCash}
        />
      ) : null}
    </>
  );
}

/**
 * The whole borrowed-money story on one short screen: the size, the
 * distance to the floor, the floor this app assumed, and what the loan
 * does to an ordinary gain or loss. Nothing here tells anybody to sell or
 * repay; every line is a number they can check.
 */
function MarginSheet({
  alert,
  onClose,
  onOpenCash,
}: {
  alert: UpsideAlert;
  onClose: () => void;
  onOpenCash?: () => void;
}) {
  const tone: MarginToneName = alert.tone ?? "neutral";
  return (
    <ViewportOverlay
      className="z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClose={onClose}
      ariaLabelledBy="margin-sheet-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className={cn(
          "scroll-host glass-overlay relative max-h-full w-full max-w-md overflow-y-auto rounded-t-xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] ring-1 sm:rounded-xl sm:pb-6",
          TONE_RING[tone]
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h3
            id="margin-sheet-title"
            className="text-base font-semibold text-foreground"
          >
            {alert.title}
            {alert.term ? (
              <>
                {" "}
                <Explain term={alert.term} {...(alert.explain ?? {})} />
              </>
            ) : null}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            className="touch-target sm:size-7"
          >
            <X />
          </Button>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {alert.detail}
        </p>
        {alert.learn ? (
          <p className="card-sheen glass-well mt-4 rounded-lg p-3 text-sm leading-relaxed text-foreground">
            {alert.learn}
          </p>
        ) : null}

        {onOpenCash ? (
          <div className="mt-6 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onClose();
                onOpenCash();
              }}
            >
              Edit cash
            </Button>
          </div>
        ) : null}
      </div>
    </ViewportOverlay>
  );
}
