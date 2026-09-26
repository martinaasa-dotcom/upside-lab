"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MicroLabel, Panel } from "@/components/ui/Panel";
import { cashtag, cn, currency, signedPercent, signedTone } from "@/lib/format";
import { formatDateTime } from "@/lib/timezone";
import { fetchFundTeaser, type FundTeaserPayload } from "@/lib/fund-teaser-client";

type Trade = NonNullable<FundTeaserPayload["trade"]>;

/**
 * Upside Fund's latest trade, on Home.
 *
 * A reader deciding whether to follow a trade wants three things, in this
 * order: what was done to which company, where on its chart that happened,
 * and why. So the card is exactly that: the verb and the company, the last
 * three months of its price with the trade marked on it, and the rule's
 * own sentence, which carries the figures a reader can check. It draws
 * nothing when the Fund has not traded a company in the last ten days,
 * because a card announcing a week-old trade is a card a reader learns to
 * skip.
 *
 * Buying is drawn cool and selling warm, the same pair the fair value zones
 * use, never gain and loss: a sale is not a loss.
 */
export function FundTradeCard({ className }: { className?: string }) {
  const [trade, setTrade] = useState<Trade | null>(null);
  useEffect(() => {
    let live = true;
    void fetchFundTeaser().then((t) => {
      if (live) setTrade(t?.trade ?? null);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!trade) return null;

  const colour = trade.side === "buy" ? "var(--zone-cool)" : "var(--zone-warm)";
  /*
    What the price has done since, which is what a reader deciding whether
    to follow actually wants. Coloured as money only on a buy, where it is
    the Fund's own gain or loss; after a sale it is just the price.
  */
  const lastClose = trade.path.at(-1)?.close ?? null;
  const since =
    trade.price != null && trade.price > 0 && lastClose != null &&
    trade.path.at(-1)!.date > trade.date
      ? lastClose / trade.price - 1
      : null;
  return (
    <Panel className={cn("overview-fade", className)}>
      <div className="flex items-center justify-between gap-3">
        <MicroLabel>{`Upside Fund · ${dayWord(trade.date)}`}</MicroLabel>
        <Link
          href="/upside-portfolio"
          prefetch
          className="group inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          See the fund
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
        </Link>
      </div>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-center sm:gap-8">
        <div className="flex flex-col gap-2">
          <span
            className="inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{
              color: colour,
              background: `color-mix(in oklch, ${colour} 16%, transparent)`,
            }}
          >
            {trade.verb}
          </span>
          <span className="flex items-baseline gap-3">
            <span className="font-heading text-2xl font-semibold tracking-tight text-foreground">
              {cashtag(trade.ticker)}
            </span>
            {trade.price != null ? (
              <span className="font-mono text-base tabular-nums text-muted-foreground">
                {currency(trade.price, 2)}
              </span>
            ) : null}
          </span>
          {since != null ? (
            <span
              className={cn(
                "font-mono text-sm tabular-nums",
                trade.side === "buy"
                  ? signedTone(since, "text-muted-foreground")
                  : "text-muted-foreground"
              )}
            >
              {`${signedPercent(since)} since`}
            </span>
          ) : null}
        </div>
        <TradeSpark trade={trade} colour={colour} />
      </div>
      <p className="text-sm leading-relaxed text-foreground/85">{trade.why}</p>
      <p className="text-xs text-muted-foreground">
        Paper money, traded by written rules. A diary, not advice.
      </p>
    </Panel>
  );
}

function dayWord(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days < 6) return formatDateTime(d, { weekday: "long" });
  return formatDateTime(d, { day: "numeric", month: "short" });
}

/**
 * Three months of the company's price with the trade marked on it. The
 * mark is the whole point: it shows whether the Fund bought after a fall
 * or sold after a run, which no sentence says as quickly.
 */
function TradeSpark({ trade, colour }: { trade: Trade; colour: string }) {
  const gid = useId().replace(/:/g, "");
  const pts = trade.path;
  if (pts.length < 10) return <span aria-hidden />;
  const W = 400;
  const H = 96;
  const pad = 8;
  const closes = pts.map((p) => p.close);
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => pad + (1 - (v - lo) / span) * (H - pad * 2);
  let at = pts.findIndex((p) => p.date === trade.date);
  if (at < 0) at = pts.length - 1;
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.close).toFixed(1)}`).join(" ");
  const area = `0,${H} ${line} ${W},${H}`;
  const left = (x(at) / W) * 100;
  const top = (y(pts[at]!.close) / H) * 100;
  return (
    <div className="relative h-24 w-full" aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full">
        <defs>
          <linearGradient id={`fund-trade-${gid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.12" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#fund-trade-${gid})`} className="text-foreground" />
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          className="text-foreground/60"
        />
      </svg>
      {/* The mark is HTML so it stays round whatever the chart's shape. */}
      <span
        className="absolute inset-y-0 w-px"
        style={{ left: `${left}%`, background: `color-mix(in oklch, ${colour} 55%, transparent)` }}
      />
      <span
        className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
        style={{ left: `${left}%`, top: `${top}%`, background: colour }}
      />
    </div>
  );
}
