"use client";

import { LiveFigure } from "@/components/ui/LiveFigure";
import { useLivePrice } from "@/components/research/LivePrice";
import { cn, currency, signedPercent, signedTone } from "@/lib/format";
import { formatDateTime } from "@/lib/timezone";

/**
 * The share price at the top of a research page.
 *
 * The polling lives in `LivePriceProvider`, which hands the same live
 * figure to this, the fair value zones and the valuation picture, so the
 * three cannot disagree. What this adds is the honest label: the server's
 * figure is printed with the moment it was taken, and the label changes to
 * say the price is live once a live one has landed.
 */
export function ResearchPrice({
  price,
  changePercent,
  code,
  at,
}: {
  ticker?: string;
  price: number | null;
  changePercent: number | null;
  code: string;
  /** When the server took the figure above. */
  at: string | null;
}) {
  const { price: shown, live } = useLivePrice(price);
  const stamp = live
    ? "Live price"
    : at
      ? `Price taken ${formatDateTime(at, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}`
      : null;

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <LiveFigure value={shown} className="font-mono text-2xl font-bold tabular-nums text-foreground">
        {currency(shown, 2, code)}
      </LiveFigure>
      {changePercent !== null && !live && (
        <span
          className={cn(
            "font-mono text-sm tabular-nums",
            signedTone(changePercent)
          )}
        >
          {signedPercent(changePercent)} on the day it was taken
        </span>
      )}
      {stamp && (
        <span className="text-xs text-muted-foreground">{stamp}</span>
      )}
    </div>
  );
}
