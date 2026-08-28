"use client";

import {
  FluidRow,
  FluidTable,
  cellBase,
  cellTicker,
  tableCols,
} from "@/components/FluidTable";
import { TickerSymbol } from "@/components/TickerSymbol";
import { Score, Scoreboard } from "@/components/ui/Panel";
import {
  NO_VALUE,
  cashtag,
  cn,
  currency,
  percent,
  signedCurrency,
  signedPercent,
  signedTone,
} from "@/lib/format";
import {
  listingCurrenciesAreMixed,
  listingCurrency,
  listingPriceDigits,
} from "@/lib/listing-currency";
import { quoteAsOfTitle } from "@/lib/market/quote-freshness";
import { animalCardTone, type PortfolioPersonality } from "@/lib/portfolio-personality";
import type { Holding, Quote } from "@/lib/types";
import { AlertTriangle, Shield } from "lucide-react";

export function bookTodayPct(
  totalValue: number,
  todayDollar: number
): number | null {
  const previous = totalValue - todayDollar;
  return previous > 0 ? todayDollar / previous : null;
}

function signedPctPoints(n: number): string {
  if (!Number.isFinite(n)) return NO_VALUE;
  const abs = Math.abs(n).toFixed(1);
  if (n > 0) return `+${abs}%`;
  if (n < 0) return `-${abs}%`;
  return `${abs}%`;
}

export function PowerAnimalCard({
  name,
  isYou,
  isPending,
  totalValue,
  todayPct,
  personality,
  milestone,
  onOpen,
}: {
  name: string;
  isYou: boolean;
  isPending: boolean;
  totalValue: number;
  todayPct: number | null;
  personality: PortfolioPersonality | null;
  milestone: { next: number | null; progress: number };
  onOpen: () => void;
}) {
  const tone = animalCardTone(personality?.archetype.id);
  return (
    <button
      type="button"
      onClick={onOpen}
      /*
       * `.glass`, not a flat `bg-card`. This is a top-level card on the
       * page and it was the last opaque one, a solid slab that stopped
       * the ambient corner light dead where every panel around it lets it
       * through. `.glass` carries its own edge on `box-shadow`, so the
       * `border` goes with the fill; the accent bar down the left is a
       * separate absolute element and is untouched by that.
       */
      className="veil-hover card-sheen glass relative flex flex-col gap-4 overflow-hidden rounded-xl p-4 pl-4 text-left ring-1 ring-foreground/20 transition hover:scale-[1.01] active:scale-[0.995] sm:p-6 sm:pl-6 lg:grid lg:h-auto lg:grid-rows-subgrid lg:row-span-6"
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-1.5", tone.bar)}
        aria-hidden
      />
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-2xl",
            tone.well
          )}
          aria-hidden
        >
          {personality?.animalEmoji ?? "❔"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {name}
                {isYou && (
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                    (you)
                  </span>
                )}
                {isPending && (
                  <span className="ml-1.5 text-sm font-normal text-caution">
                    awaiting sign-in
                  </span>
                )}
              </p>
              <p className={cn("mt-1 text-base font-semibold", tone.name)}>
                {personality?.animal ?? "No portfolio yet"}
              </p>
            </div>
            <p className="shrink-0 text-right">
              <span
                className={cn(
                  "block text-base font-semibold tabular-nums",
                  signedTone(todayPct, "text-foreground")
                )}
              >
                {todayPct != null ? signedPercent(todayPct) : NO_VALUE}
              </span>
              <span className="mt-1 block text-sm tabular-nums text-muted-foreground">
                {currency(totalValue, 0)}
              </span>
            </p>
          </div>
        </div>
      </div>

      {personality ? (
        <>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {personality.whyThisAnimal}
          </p>
          <div className="flex flex-col gap-2 text-sm leading-relaxed">
            <p className="flex gap-2 text-gain">
              <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{personality.archetype.strength}</span>
            </p>
            <p className="flex gap-2 text-caution">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{personality.archetype.watchFor}</span>
            </p>
          </div>

          {/*
            * `grid-rows-subgrid`, not three independent stacks.
            *
            * Each read is four lines: label, figure, band, sentence, and
            * as three plain flow columns each one started its own second
            * line wherever its own first line happened to end. "How spread
            * out" wraps to two lines on a phone and the other two labels do
            * not, so its figure sat a row lower than theirs and the three
            * cells read as three unrelated things. Subgrid puts all four
            * rows on the parent, so every read's figure is on the figure
            * row and every band is on the band row whatever the labels do.
            */}
          <div className="glass-well grid grid-cols-3 grid-rows-[auto_auto_auto_auto] gap-x-2 gap-y-1 rounded-lg p-3">
            <ScoreRead
              label="How spread out"
              value={`${Math.round(personality.diversificationScore)}/100`}
              band={personality.diversificationBand.label}
              detail={personality.diversificationBand.description}
            />
            <ScoreRead
              label="How jumpy"
              value={`${Math.round(personality.riskScore)}/100`}
              band={personality.riskBand.label}
              detail={personality.riskBand.description}
            />
            <ScoreRead
              label="Biggest name"
              value={
                personality.topTicker
                  ? `${cashtag(personality.topTicker)} ${personality.convictionScore}%`
                  : `${personality.convictionScore}%`
              }
              band={personality.convictionBand.label}
              detail={personality.convictionBand.description}
            />
          </div>

          {/*
            * One column on a phone, and shorter words in it.
            *
            * Two-up, each of these cells had about 120px to work with:
            * "23.0% a year" ran straight out through the side of the card,
            * and the bad-year sentence under the other one stacked into a
            * nine-line ribbon taller than everything above it. The figure
            * is now just the number, the unit moved into the line under it
            * where there is room for words, and the pair stacks below `sm`.
            * The "not a forecast" half of that sentence is a disclaimer and
            * stays whatever else is trimmed.
            */}
          <Scoreboard
            className="min-h-min shrink-0 lg:h-full"
            cols={2}
            mobileCols={1}
          >
            <Score
              label="Modeled year"
              value={
                Number.isFinite(personality.expectedAnnualReturnPct)
                  ? `${personality.expectedAnnualReturnPct.toFixed(1)}%`
                  : NO_VALUE
              }
              sub={`A year, ${signedPctPoints(personality.modeledAlphaPct)} vs an index fund`}
              subClassName={signedTone(personality.modeledAlphaPct, "text-muted-foreground")}
            />
            <Score
              label="A rough year"
              value={`-${personality.maxDrawdownPct}%`}
              sub="How far holdings like these have fallen in the past. An illustration, not a forecast."
              valueClassName="text-loss"
            />
          </Scoreboard>

          <div className={milestone.next == null ? "max-lg:hidden" : undefined}>
            {milestone.next != null && (
              <>
                <div className="flex items-baseline justify-between gap-2 text-sm text-muted-foreground">
                  <span>
                    Next{" "}
                    <span className="font-medium text-muted-foreground">
                      {currency(milestone.next, 0)}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {Math.round(milestone.progress * 100)}%
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", tone.milestone)}
                    style={{
                      width: `${Math.round(milestone.progress * 100)}%`,
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </button>
  );
}

/**
 * Four rows of one read, handed to the parent grid rather than stacked
 * inside a box of its own. See the note at the call site for why. The
 * per-line `mt-*` are gone with it: row spacing is the parent's `gap-y`
 * now, or the three columns would drift apart again.
 */
function ScoreRead({
  label,
  value,
  band,
  detail,
}: {
  label: string;
  value: string;
  band: string;
  detail: string;
}) {
  return (
    <div className="row-span-4 grid min-w-0 grid-rows-subgrid">
      <p className="text-xs leading-snug text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-semibold leading-snug tabular-nums text-foreground">
        {value}
      </p>
      <p className="text-xs font-medium leading-snug text-foreground">{band}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

export function ReadOnlyHoldings({
  holdings,
  quotes,
  cash,
}: {
  holdings: Holding[];
  quotes: Record<string, Quote>;
  cash: number;
}) {
  const totalValue =
    holdings.reduce((s, h) => s + (quotes[h.ticker]?.price ?? 0) * h.shares, 0) +
    cash;
  const previousCloseValue =
    holdings.reduce(
      (s, h) => s + (quotes[h.ticker]?.previousClose ?? quotes[h.ticker]?.price ?? 0) * h.shares,
      0
    ) + cash;
  const todayDollar = totalValue - previousCloseValue;
  const todayPct = previousCloseValue > 0 ? todayDollar / previousCloseValue : null;
  const mixedListings = listingCurrenciesAreMixed(
    holdings.map((h) => ({
      ticker: h.ticker,
      currency: quotes[h.ticker]?.currency,
    }))
  );
  const tickerCell = mixedListings ? cellTicker : cellBase;
  const todayCell = mixedListings
    ? "flex h-full w-full items-center justify-end whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums"
    : cellBase;

  // Biggest position first by default. Matches the default sort in My
  // book, and is far more useful at a glance than raw creation order.
  const sortedHoldings = [...holdings].sort(
    (a, b) =>
      (quotes[b.ticker]?.price ?? 0) * b.shares -
      (quotes[a.ticker]?.price ?? 0) * a.shares
  );

  function holdingRow(h: Holding) {
    const listed = listingCurrency(h.ticker, quotes[h.ticker]?.currency);
    const digits = listingPriceDigits(listed);
    const native =
      quotes[h.ticker]?.nativePrice != null &&
      quotes[h.ticker]!.nativePrice! > 0
        ? quotes[h.ticker]!.nativePrice!
        : quotes[h.ticker]?.price ?? 0;
    const priceUsd = quotes[h.ticker]?.price ?? 0;
    const value = priceUsd * h.shares;
    const rowTodayPct = quotes[h.ticker]?.changePercent ?? null;
    const pctBook = totalValue > 0 ? value / totalValue : 0;
    return { listed, digits, native, value, rowTodayPct, pctBook };
  }

  return (
    <div className="flex flex-col gap-3">
      <Scoreboard cols={3}>
        <Score
          label="Today"
          value={todayPct != null ? signedPercent(todayPct) : NO_VALUE}
          sub={signedCurrency(todayDollar)}
          tone={todayDollar > 0 ? "up" : todayDollar < 0 ? "down" : undefined}
        />
        <Score label="Total value" value={currency(totalValue)} />
        <Score label="Cash" value={currency(cash)} />
      </Scoreboard>
      {holdings.length === 0 ? (
        <p className="glass-well rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No holdings in this portfolio.
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl glass ring-1 ring-foreground/20 md:hidden">
            <FluidTable template={tableCols(2, mixedListings)}>
              <FluidRow>
                <div
                  className={cn(
                    tickerCell,
                    "text-sm font-medium text-muted-foreground"
                  )}
                >
                  Ticker
                </div>
                <div
                  className={cn(
                    todayCell,
                    "text-sm font-medium text-muted-foreground"
                  )}
                >
                  Today
                </div>
              </FluidRow>
              {sortedHoldings.map((h) => {
                const row = holdingRow(h);
                return (
                  <FluidRow key={h.id}>
                    <div className={cn(tickerCell, "font-medium")}>
                      <TickerSymbol
                        ticker={h.ticker}
                        currency={row.listed}
                        showCurrency={mixedListings}
                      />
                    </div>
                    <div
                      className={cn(
                        todayCell,
                        "font-semibold",
                        signedTone(row.rowTodayPct, "text-muted-foreground")
                      )}
                    >
                      {row.rowTodayPct != null
                        ? signedPercent(row.rowTodayPct)
                        : NO_VALUE}
                    </div>
                  </FluidRow>
                );
              })}
              <FluidRow footer>
                <div className={cn(tickerCell, "text-muted-foreground")}>
                  Cash
                </div>
                <div className={cn(todayCell)}>{currency(cash)}</div>
              </FluidRow>
            </FluidTable>
          </div>
          <div className="hidden overflow-hidden rounded-xl glass ring-1 ring-foreground/20 md:block">
            <FluidTable template={tableCols(6, mixedListings)}>
              <FluidRow>
                <div
                  className={cn(
                    tickerCell,
                    "text-sm font-medium text-muted-foreground"
                  )}
                >
                  Ticker
                </div>
                <div className={cn(cellBase, "text-sm font-medium text-muted-foreground")}>
                  Today
                </div>
                <div className={cn(cellBase, "text-sm font-medium text-muted-foreground")}>
                  %
                </div>
                <div className={cn(cellBase, "text-sm font-medium text-muted-foreground")}>
                  Shares
                </div>
                <div className={cn(cellBase, "text-sm font-medium text-muted-foreground")}>
                  Price
                </div>
                <div className={cn(cellBase, "text-sm font-medium text-muted-foreground")}>
                  Value
                </div>
              </FluidRow>
              {sortedHoldings.map((h) => {
                const row = holdingRow(h);
                return (
                  <FluidRow key={h.id}>
                    <div className={cn(tickerCell, "font-medium")}>
                      <TickerSymbol
                        ticker={h.ticker}
                        currency={row.listed}
                        showCurrency={mixedListings}
                      />
                    </div>
                    <div
                      className={cn(
                        cellBase,
                        "font-semibold tabular-nums",
                        signedTone(row.rowTodayPct, "text-muted-foreground")
                      )}
                    >
                      {row.rowTodayPct != null
                        ? signedPercent(row.rowTodayPct)
                        : NO_VALUE}
                    </div>
                    <div className={cn(cellBase, "tabular-nums text-muted-foreground")}>
                      {percent(row.pctBook)}
                    </div>
                    <div className={cn(cellBase, "tabular-nums text-muted-foreground")}>
                      {h.shares}
                    </div>
                    <div
                      className={cn(cellBase, "tabular-nums text-muted-foreground")}
                      title={quoteAsOfTitle(quotes[h.ticker])}
                    >
                      {currency(row.native, row.digits, row.listed)}
                    </div>
                    <div className={cn(cellBase, "tabular-nums text-muted-foreground")}>
                      {currency(row.value)}
                    </div>
                  </FluidRow>
                );
              })}
              <FluidRow footer>
                <div className={cn(tickerCell, "text-muted-foreground")}>
                  Cash
                </div>
                <div className={cellBase} />
                <div className={cellBase} />
                <div className={cellBase} />
                <div className={cellBase} />
                <div className={cn(cellBase, "tabular-nums")}>
                  {currency(cash)}
                </div>
              </FluidRow>
            </FluidTable>
          </div>
        </>
      )}
    </div>
  );
}
