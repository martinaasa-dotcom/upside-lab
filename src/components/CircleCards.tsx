"use client";

import {
  FluidRow,
  FluidTable,
  cellBase,
  cellTicker,
  tableCols,
} from "@/components/FluidTable";
import { TickerSymbol } from "@/components/TickerSymbol";
import { Button } from "@/components/ui/button";
import { Score, Scoreboard } from "@/components/ui/Panel";
import {
  NO_VALUE,
  cashtag,
  cn,
  percent,
  signedPercent,
  signedTone,
} from "@/lib/format";
import {
  listingCurrenciesAreMixed,
  listingCurrency,
} from "@/lib/listing-currency";
import { animalCardTone, type PortfolioPersonality } from "@/lib/portfolio-personality";
import type { Holding, Quote } from "@/lib/types";
import { AlertTriangle, ChevronDown, Shield } from "lucide-react";
import { useState } from "react";

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
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs;
}

/**
 * One row until it is asked a question.
 *
 * Measured at 390x844 with six people, the League tab was 8,436px, which is
 * ten screens, because each of these cards was about 1,100px: a paragraph,
 * two bullets, a grid of three reads, two more cells and a progress bar,
 * all open all the time. Comparing the six, which is the entire point of
 * the tab, meant scrolling the whole thing.
 *
 * So the resting state is one row that answers the only two questions worth
 * asking at a glance: which animal, and how the day went. Everything else
 * is one tap away. Six people are now about one screen rather than ten.
 *
 * No money anywhere on it. It used to print the portfolio's value under
 * today's percent, which is the figure a circle promises never to show.
 */
export function PowerAnimalCard({
  name,
  isYou,
  isPending,
  todayPct,
  personality,
  onOpen,
}: {
  name: string;
  isYou: boolean;
  isPending: boolean;
  todayPct: number | null;
  personality: PortfolioPersonality | null;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const tone = animalCardTone(personality?.archetype.id);
  return (
    <div
      className={cn(
        "card-sheen glass relative overflow-hidden rounded-xl ring-1 ring-foreground/20 transition",
        open && "ring-primary/25"
      )}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-1.5", tone.bar)}
        aria-hidden
      />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="veil-hover flex w-full items-center gap-3 p-4 pl-5 text-left sm:gap-4 sm:p-5 sm:pl-6"
      >
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg text-xl",
            tone.well
          )}
          aria-hidden
        >
          {personality?.animalEmoji ?? "❔"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">
            {name}
            {isYou && (
              <span className="ml-1.5 font-normal text-muted-foreground">
                (you)
              </span>
            )}
            {isPending && (
              <span className="ml-1.5 font-normal text-caution">
                awaiting sign-in
              </span>
            )}
          </span>
          <span className={cn("block truncate text-sm font-medium", tone.name)}>
            {personality?.animal ?? "No portfolio yet"}
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 text-base font-semibold tabular-nums",
            signedTone(todayPct, "text-foreground")
          )}
        >
          {todayPct != null ? signedPercent(todayPct) : NO_VALUE}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {open && personality ? (
        <div className="flex flex-col gap-4 px-4 pb-4 pl-5 sm:px-5 sm:pb-5 sm:pl-6">
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
              label="Biggest holding"
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
            * "Modeled year 29.0%" used to be a headline on somebody else's
            * portfolio, with "+11.9% vs an index fund" under it and no
            * hedge, sitting beside a cell that said "An illustration, not a
            * forecast." One number hedged and the other not, on a screen
            * that must never read as advice. A beginner read it as "Rasmus
            * will make 29% a year". Both cells now say what they are.
            */}
          <Scoreboard className="min-h-min shrink-0" cols={2} mobileCols={1}>
            <Score
              label="If the past repeated"
              value={
                Number.isFinite(personality.expectedAnnualReturnPct)
                  ? `${personality.expectedAnnualReturnPct.toFixed(1)}%`
                  : NO_VALUE
              }
              sub={`About ${signedPctPoints(personality.modeledAlphaPct)} points a year against an index fund. An assumption, not a forecast.`}
              subClassName={signedTone(personality.modeledAlphaPct, "text-muted-foreground")}
            />
            <Score
              label="A rough year"
              value={`-${personality.maxDrawdownPct}%`}
              sub="The fall this app assumes for a mix of these kinds of business in a bad stretch. Not a measurement of these companies."
              valueClassName="text-loss"
            />
          </Scoreboard>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={onOpen}
          >
            Open this portfolio
          </Button>
        </div>
      ) : null}
    </div>
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

/**
 * Somebody else's portfolio, in shares of itself and nothing else.
 *
 * This was a full price table: total value, cash, share count, price and a
 * dollar value per company. Any two of those give a friend's net worth, and
 * the whole promise of a circle is that they do not get it. What is left is
 * what a circle is actually for, which is seeing how somebody has put a
 * portfolio together: which companies, what share of the whole each one is,
 * and how each moved today.
 *
 * The share of the portfolio used to be on the laptop only. It is the most
 * teachable number here, so it is on the phone too.
 */
export function ReadOnlyHoldings({
  holdings,
  quotes,
}: {
  holdings: Holding[];
  quotes: Record<string, Quote>;
}) {
  const totalValue = holdings.reduce(
    (s, h) => s + (quotes[h.ticker]?.price ?? 0) * h.shares,
    0
  );
  const previousCloseValue = holdings.reduce(
    (s, h) =>
      s +
      (quotes[h.ticker]?.previousClose ?? quotes[h.ticker]?.price ?? 0) *
        h.shares,
    0
  );
  const todayPct =
    previousCloseValue > 0
      ? (totalValue - previousCloseValue) / previousCloseValue
      : null;
  const mixedListings = listingCurrenciesAreMixed(
    holdings.map((h) => ({
      ticker: h.ticker,
      currency: quotes[h.ticker]?.currency,
    }))
  );
  const tickerCell = mixedListings ? cellTicker : cellBase;

  // Biggest holding first by default. Matches the default sort in a
  // portfolio, and is far more useful at a glance than creation order.
  const sortedHoldings = [...holdings].sort(
    (a, b) =>
      (quotes[b.ticker]?.price ?? 0) * b.shares -
      (quotes[a.ticker]?.price ?? 0) * a.shares
  );

  const headerCell = "text-sm font-medium text-muted-foreground";

  return (
    <div className="flex flex-col gap-3">
      <Scoreboard cols={2}>
        <Score
          label="Today"
          value={todayPct != null ? signedPercent(todayPct) : NO_VALUE}
          sub="How the whole portfolio moved"
          tone={
            (todayPct ?? 0) > 0 ? "up" : (todayPct ?? 0) < 0 ? "down" : undefined
          }
        />
        <Score
          label="Companies"
          value={String(holdings.length)}
          sub="Sizes are shares of this portfolio, never amounts"
        />
      </Scoreboard>
      {holdings.length === 0 ? (
        <p className="glass-well rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No holdings in this portfolio.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl glass ring-1 ring-foreground/20">
          <FluidTable template={tableCols(3, mixedListings)}>
            <FluidRow>
              <div className={cn(tickerCell, headerCell)}>Company</div>
              <div className={cn(cellBase, headerCell)}>Share of it</div>
              <div className={cn(cellBase, headerCell)}>Today</div>
            </FluidRow>
            {sortedHoldings.map((h) => {
              const listed = listingCurrency(h.ticker, quotes[h.ticker]?.currency);
              const value = (quotes[h.ticker]?.price ?? 0) * h.shares;
              const rowTodayPct = quotes[h.ticker]?.changePercent ?? null;
              const pctBook = totalValue > 0 ? value / totalValue : 0;
              return (
                <FluidRow key={h.id}>
                  <div className={cn(tickerCell, "font-medium")}>
                    <TickerSymbol
                      ticker={h.ticker}
                      currency={listed}
                      showCurrency={mixedListings}
                    />
                  </div>
                  <div className={cn(cellBase, "tabular-nums text-muted-foreground")}>
                    {percent(pctBook)}
                  </div>
                  <div
                    className={cn(
                      cellBase,
                      "font-semibold tabular-nums",
                      signedTone(rowTodayPct, "text-muted-foreground")
                    )}
                  >
                    {rowTodayPct != null ? signedPercent(rowTodayPct) : NO_VALUE}
                  </div>
                </FluidRow>
              );
            })}
          </FluidTable>
        </div>
      )}
    </div>
  );
}
