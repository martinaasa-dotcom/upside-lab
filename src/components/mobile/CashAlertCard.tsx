"use client";

import { cn, currency } from "@/lib/format";
import type { UpsideAlert } from "@/lib/alerts";
import type { MarginToneName } from "@/lib/margin-health";
import { AlertTriangle, ChevronRight, Landmark } from "lucide-react";

function isCashish(alert: UpsideAlert): boolean {
  return /cash|margin|borrow/i.test(`${alert.title} ${alert.detail}`);
}

/**
 * Status is a ring, never a tinted fill.
 *
 * This card used to be `border-loss/30 bg-loss/10` with a warning triangle
 * on it whenever cash was below zero, which put the same rose wash and the
 * same triangle on a portfolio borrowing 8% of itself as on one borrowing
 * 60%. The first of those is how a lot of people hold a portfolio, and a
 * card that shouts at them every morning is a card they learn to swipe
 * past, which is the last thing you want the day it starts being right.
 * The tone comes from `marginHealth` now: neutral until the loan reaches
 * 30% of what the portfolio is worth, a warning ring to 50%, rose above
 * it. See AGENTS.md on card washes.
 */
const TONE_RING: Record<MarginToneName, string> = {
  neutral: "ring-foreground/20",
  warning: "ring-warning/35",
  loss: "ring-destructive/30",
};

const TONE_GLYPH: Record<MarginToneName, string> = {
  neutral: "bg-muted text-muted-foreground",
  warning: "bg-warning/15 text-warning",
  loss: "bg-loss/15 text-loss",
};

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
  const cashAlert = alerts.find(isCashish);
  const featured = cashAlert ?? alerts[0];
  if (!featured && cash >= 0) return null;

  const openCash = Boolean(cashAlert) || cash < 0;
  const body =
    featured?.title ??
    (cash < 0 ? `Cash is ${currency(cash, 0)}.` : null);
  if (!body) return null;

  const tone: MarginToneName = featured?.tone ?? "neutral";
  // A triangle is a claim that something needs doing now. Below the
  // warning tier the card is a fact about the portfolio, so it gets the
  // bank glyph and the reader's morning back.
  const Glyph = tone === "neutral" ? Landmark : AlertTriangle;
  const cushion = cashAlert?.cushion ?? null;

  return (
    <button
      type="button"
      onClick={() => (openCash ? onOpenCash?.() : onOpenAlerts?.())}
      className={cn(
        "card-sheen glass w-full rounded-xl p-4 text-left ring-1",
        TONE_RING[tone],
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-semibold text-foreground">
          {openCash ? "Cash" : "Alert"}
        </p>
        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      <div className="mt-4 flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            TONE_GLYPH[tone]
          )}
        >
          <Glyph className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-base tabular-nums text-foreground">{body}</p>
          {cushion && (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {cushion}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
