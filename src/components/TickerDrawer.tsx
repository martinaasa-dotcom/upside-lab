"use client";

import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { NO_VALUE, cashtag, cn, currency, percent, signedPercent } from "@/lib/format";
import {
  Metric,
  MicroLabel,
  Pill,
  Score,
  Scoreboard,
  Segmented,
  SPLIT_COPY,
  SPLIT_ROW,
} from "@/components/ui/Panel";
import { Input } from "@/components/ui/input";
import { type ConvictionEntry } from "@/lib/conviction";
import { estimateGreenStreak } from "@/lib/streaks";
import { forecastThemeForTicker } from "@/lib/forecast-conviction";
import { THEME_LABEL } from "@/lib/portfolio-personality";
import { getShockProfile } from "@/lib/book-shock";
import {
  FIVE_YEAR,
  FORECAST_YEARS,
  THREE_YEAR,
  resolveTickerForecastPath,
  type ForecastYear,
} from "@/lib/forecast";
import { beliefLines } from "@/lib/believe";
import { shareCount } from "@/lib/share-count";
import { typicalMoveFromCloses, typicalMoveLine } from "@/lib/typical-move";
import { formatDateTime } from "@/lib/timezone";
import type { PortfolioEoyOverrides } from "@/lib/forecast-overrides";
import { coinFromSymbol, isCoinSymbol } from "@/lib/coins";
import type { CoveredCallRow } from "@/lib/types";
import { isSafePositiveMoney } from "@/lib/input-guard";
import { Bot, Trash2, X } from "lucide-react";
import { WhyThis } from "@/components/ui/WhyThis";
import { PlanLadderFoot, PlanLadderTable } from "@/components/company/PlanLadder";
import { holdingLadders } from "@/lib/company/holding-ladders";
import type {
  LadderBandId,
  LadderOverrides,
} from "@/lib/company/plan-ladder";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { planLadderProvenance } from "@/lib/provenance";
import { forecastPathProvenance } from "@/lib/provenance";
import { useEffect, useMemo, useState } from "react";

/*
 * Both horizons come from FORECAST_YEARS, never from a year typed here.
 * This file used to carry "End of 2028" and "End of 2030" as constants and
 * then read `eoyPrices[2028]` by literal, so the day the range rolls the
 * heading would keep a year the range no longer has and the price under it
 * would be read from a key that is not there.
 */
const HORIZONS = [
  { id: "3y" as const, label: "3 years", title: `End of ${THREE_YEAR}` },
  { id: "5y" as const, label: "5 years", title: `End of ${FIVE_YEAR}` },
];

type Props = {
  open: boolean;
  ticker: string | null;
  spot: number | null;
  shares: number | null;
  buyPrice: number | null;
  sparkline?: number[];
  todayChangePct?: number | null;
  /** This holding's Pulse stamp trail, newest first. */
  conviction?: ConvictionEntry | null;
  overrides?: PortfolioEoyOverrides;
  coveredCallRow?: CoveredCallRow | null;
  /** This reader's price-plan edits, keyed by ticker. */
  ladders?: LadderOverrides;
  /** Null where the plan is read-only, which keeps every level fixed. */
  onSetLadderEdge?:
    | ((ticker: string, id: LadderBandId, ratio: number | null) => void)
    | null;
  /**
   * How many portfolios the shares and the average price above cover.
   * More than one and the drawer says so, because the card it was opened
   * from shows one portfolio and a silent total disagrees with it.
   */
  portfolioCount?: number;
  onSetEoyPrice?: (ticker: string, year: ForecastYear, price: number) => void;
  onClose: () => void;
  /** Removes the holding this drawer was opened from, when there is one. */
  onDelete?: () => void;
  onAskMargus?: () => void;
};

export function TickerDrawer({
  open,
  ticker,
  spot,
  shares,
  buyPrice,
  sparkline,
  todayChangePct,
  conviction,
  overrides,
  coveredCallRow,
  ladders,
  onSetLadderEdge,
  portfolioCount = 1,
  onSetEoyPrice,
  onClose,
  onDelete,
  onAskMargus,
}: Props) {
  const [horizon, setHorizon] = useState<"3y" | "5y">("3y");
  const [editingYear, setEditingYear] = useState<ForecastYear | null>(null);
  const [yearDraftPrice, setYearDraftPrice] = useState<string>("");
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /*
   * A path needs a price to grow from, and there is no honest stand-in for
   * one. This used to read `spot ?? buyPrice ?? 50`, so a holding nothing
   * could price showed "n/a" in its header and, three inches below, a full
   * five-year path with "+43.4% from today's price" under it, worked out
   * from what the reader paid years ago. The 50 was worse still: a price
   * invented outright for any row with no buy price either. With no price,
   * the drawer says so and draws no path.
   */
  const forecastSummary = useMemo(() => {
    if (!ticker || spot == null || !(spot > 0)) return null;
    return resolveTickerForecastPath(ticker, spot, overrides);
  }, [ticker, spot, overrides]);

  /*
   * What an ordinary day looks like for this company, from the same
   * ninety-day series the sparkline already draws. A red number means
   * nothing until a reader knows whether it is a normal day.
   */
  const typical = useMemo(
    () => typicalMoveFromCloses(sparkline ?? []),
    [sparkline]
  );

  /*
    The same price plan the Research room draws, on a holding this reader
    already owns.
    
    Two differences, both forced by what is on this screen rather than by
    preference. The anchor is the holding's own end of year target, which
    is either the reader's number or the shared path's and is printed a
    few inches above, because an anchor a reader cannot see is a plan they
    cannot argue with. And the swing is read off the price history this
    browser already has, roughly three months rather than the feed's year,
    so the sentence behind the mark says three months.
  */
  const ladder = useMemo(() => {
    if (!ticker || spot == null) return null;
    /*
      The same builder the holdings map and the alerts use, rather than a
      second copy of the arithmetic here: a level reached in this drawer
      has to be the level that turns up on Home.
    */
    const [row] = holdingLadders({
      rows: [{ ticker, spot, closes: sparkline ?? null, value: 0 }],
      overrides,
      ladders,
    });
    return row?.ladder ?? null;
  }, [ticker, spot, sparkline, overrides, ladders]);

  if (!open || !ticker) return null;

  const streak = estimateGreenStreak(sparkline);
  const roi =
    spot != null && buyPrice != null && buyPrice > 0
      ? (() => {
          const v = (spot - buyPrice) / buyPrice;
          return Number.isFinite(v) ? v : null;
        })()
      : null;
  // Nothing chosen is nothing chosen. Lighting cell 3 and printing
  // "Neutral, holding it as it is" put an opinion in somebody's mouth on
  // every holding they had never answered for.
  const theme = forecastThemeForTicker(ticker);
  const shockProfile = getShockProfile(ticker);

  const targetPrice = forecastSummary
    ? horizon === "3y"
      ? forecastSummary.threeYearPrice
      : forecastSummary.fiveYearPrice
    : null;
  const targetGainPct = forecastSummary
    ? horizon === "3y"
      ? forecastSummary.threeYearGainPct
      : forecastSummary.fiveYearGainPct
    : null;
  const targetCagrPct = forecastSummary
    ? horizon === "3y"
      ? forecastSummary.threeYearCagrPct
      : forecastSummary.fiveYearCagrPct
    : null;
  const targetYear: ForecastYear = horizon === "3y" ? THREE_YEAR : FIVE_YEAR;
  const yearsOut = horizon === "3y" ? 3 : FORECAST_YEARS.length;

  /*
   * What the target is asking of the company, in arithmetic the reader can
   * weigh: the whole gain, the rate a year, and how that compares with the
   * distance this company has actually travelled lately.
   */
  const belief =
    spot != null && spot > 0 && targetPrice != null && targetPrice > 0
      ? beliefLines(
          {
            subject: cashtag(ticker),
            spot,
            target: targetPrice,
            months: yearsOut * 12,
            closes: sparkline,
          },
          (n) => currency(n)
        )
      : [];

  const todayLine = typicalMoveLine(
    cashtag(ticker),
    todayChangePct ?? null,
    typical
  );

  function handleYearEditCommit(year: ForecastYear) {
    const parsed = Number.parseFloat(yearDraftPrice.replace(/,/g, "."));
    if (isSafePositiveMoney(parsed) && onSetEoyPrice) {
      onSetEoyPrice(ticker!, year, Math.round(parsed * 100) / 100);
    }
    setEditingYear(null);
  }

  return (
    <ViewportOverlay className="z-[80] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full max-w-none flex-col border-l border-border/80 bg-background sm:max-w-md">
        <div className="flex items-start justify-between gap-2 border-b border-border px-6 py-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">
                {cashtag(ticker)}
              </h2>
              {coinFromSymbol(ticker) ? (
                <span className="text-sm text-muted-foreground">
                  {coinFromSymbol(ticker)!.name}
                </span>
              ) : null}
              <Pill tone="neutral">{THEME_LABEL[theme] ?? "other businesses"}</Pill>
            </div>
            <p className="mt-1 text-sm tabular-nums text-muted-foreground">
              {spot != null ? currency(spot) : "No price right now"}
              {todayChangePct != null && (
                <span
                  className={cn(
                    "ml-1 font-medium tabular-nums",
                    todayChangePct >= 0 ? "text-gain" : "text-loss"
                  )}
                >
                  ({signedPercent(todayChangePct)})
                </span>
              )}
              {shares != null
                ? isCoinSymbol(ticker)
                  ? ` · ${shareCount(shares)}`
                  : ` · ${shareCount(shares)} shares`
                : ""}
              {portfolioCount > 1
                ? ` across ${portfolioCount} portfolios`
                : ""}
              {roi != null ? ` · ${percent(roi)} against what you paid` : ""}
            </p>
            {todayLine ? (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {todayLine}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            onClick={onClose}
            variant="ghost"
            size="icon"
            aria-label="Close"
            className="touch-target shrink-0"
          >
            <X />
          </Button>
        </div>

        {/*
          The dock floats over this panel, so the last control in the
          scroller has to clear it. `--dock-clearance` is the measured
          height `use-dock-pad` publishes, and the safe-area inset is the
          floor for a screen with no dock on it.
        */}
        <div className="scroll-host flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6 pb-[max(1.5rem,var(--dock-clearance,0px),env(safe-area-inset-bottom))]">
          {conviction?.stamps && conviction.stamps.length > 0 ? (
            <section className="flex flex-col gap-2">
              <MicroLabel>Recent Pulse readings</MicroLabel>
              <ul className="flex flex-col gap-1.5">
                {conviction.stamps.slice(0, 3).map((s) => (
                  <li key={s.at} className="text-sm text-muted-foreground">
                    <span className="text-foreground">{s.verdict}</span>
                    {" \u00b7 "}
                    {s.line}
                    <span className="ml-1">
                      {formatDateTime(s.at, {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {forecastSummary ? (
          <section className="flex flex-col gap-4">
            <div className={SPLIT_ROW}>
              <div className={SPLIT_COPY}>
                <h3 className="inline-flex items-center gap-2 text-base text-foreground">
                  Price path
                  <WhyThis
                    provenance={forecastPathProvenance({
                      ticker,
                      spot: forecastSummary.spot,
                      sector: THEME_LABEL[forecastThemeForTicker(ticker)],
                      fallback: !forecastSummary.hasOverrides,
                    })}
                  />
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Same numbers as Forecast.
                </p>
              </div>
              <Segmented
                options={HORIZONS}
                value={horizon}
                onChange={setHorizon}
                ariaLabel="Forecast horizon"
              />
            </div>

            <Scoreboard cols={1}>
              <Score
                label={`If it plays out by ${targetYear}`}
                value={currency(targetPrice ?? 0, 2)}
                sub={
                  <>
                    Works out to about{" "}
                    <span
                      className={cn(
                        "font-medium tabular-nums",
                        (targetCagrPct ?? 0) >= 0 ? "text-gain" : "text-loss"
                      )}
                    >
                      {targetCagrPct != null && Number.isFinite(targetCagrPct)
                        ? `${targetCagrPct >= 0 ? "+" : ""}${targetCagrPct.toFixed(1)}%`
                        : NO_VALUE}
                    </span>{" "}
                    a year.{" "}
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        (targetGainPct ?? 0) >= 0 ? "text-gain" : "text-loss"
                      )}
                    >
                      {(targetGainPct ?? 0) >= 0 ? "+" : ""}
                      {percent(targetGainPct ?? 0)}
                    </span>{" "}
                    from today&apos;s price.
                  </>
                }
              />
            </Scoreboard>

            {/*
              What that price is asking for, said as arithmetic rather than
              as a claim. A figure with two decimals looks like a
              measurement whatever the label above it says, so the cure is
              to restate it in things the reader has already seen this
              company do.
            */}
            {belief.length > 0 ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {belief.join(" ")}
              </p>
            ) : null}

            <div>
              <MicroLabel className="mb-2">
                Year by year. Tap to change.
              </MicroLabel>
              {/*
                * Tighter cells on a phone, not fewer of them. At the desktop
                * gap and padding a cell has 38px of content on a 360px screen
                * and a four-figure price needs 44, so `$1,058` rendered as
                * `$1,05`. The gap, the cell padding and the price each drop a
                * step below `sm`, which keeps all five years rather than
                * trading two of them for a swipe.
                */}
              <div className="grid grid-cols-5 gap-1 sm:gap-2">
                {FORECAST_YEARS.map((yr) => {
                  const p = forecastSummary.eoyPrices[yr];
                  const g = forecastSummary.eoyGains[yr];
                  const isCurrentHorizon = yr === targetYear;

                  if (editingYear === yr) {
                    return (
                      <div
                        key={yr}
                        className="flex flex-col items-stretch gap-0.5 rounded-lg border border-input bg-background px-1 py-2 sm:px-2"
                      >
                        <p className="text-xs font-medium text-muted-foreground">
                          &apos;{String(yr).slice(2)}
                        </p>
                        <Input
                          type="text"
                          inputMode="decimal"
                          autoFocus
                          value={yearDraftPrice}
                          onChange={(e) => setYearDraftPrice(e.target.value)}
                          onBlur={() => handleYearEditCommit(yr)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleYearEditCommit(yr);
                            if (e.key === "Escape") setEditingYear(null);
                          }}
                          aria-label={`Price at end of ${yr}`}
                          className="h-7 px-1 text-center text-sm font-semibold tabular-nums"
                        />
                      </div>
                    );
                  }

                  return (
                    <Button
                      key={yr}
                      type="button"
                      variant={isCurrentHorizon ? "secondary" : "outline"}
                      onClick={() => {
                        setEditingYear(yr);
                        setYearDraftPrice(p.toFixed(2));
                      }}
                      title={`Change the end-of-${yr} price`}
                      className="h-auto flex-col items-stretch gap-0.5 px-1 py-2 sm:px-2"
                    >
                      <span className="text-xs font-medium text-muted-foreground">
                        &apos;{String(yr).slice(2)}
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-foreground sm:text-sm">
                        ${Math.round(p)}
                      </span>
                      <span
                        className={cn(
                          "text-xs tabular-nums",
                          g >= 0 ? "text-gain" : "text-loss"
                        )}
                      >
                        {g >= 0 ? "+" : ""}
                        {(g * 100).toFixed(0)}%
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>
          </section>
          ) : (
            <section className="flex flex-col gap-2">
              <h3 className="text-base text-foreground">Price path</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                No price right now, so there is nothing to draw a path from.
                A path worked out from what you paid years ago would not be
                a forecast. Check the symbol is still right: a company that
                was renamed or taken over stops reporting a price under its
                old one.
              </p>
            </section>
          )}

          {ladder && ticker && (
            <section className="flex flex-col gap-4">
              <div>
                <h3 className="inline-flex items-center gap-2 text-base text-foreground">
                  Your price plan
                  <WhyThis
                    provenance={planLadderProvenance({
                      ticker,
                      anchorSaid: ladder.anchorSaid,
                      stepSaid: ladder.stepSaid,
                      edited: ladder.edited,
                    })}
                  />
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Levels decided in advance, built from the end of year
                  price above and how far this one ordinarily travels.
                  Every one of them is yours to change, and when the price
                  reaches the top or the bottom of the ladder it turns up
                  on Home. {ADVICE_DISCLAIMER_SHORT}
                </p>
              </div>
              <PlanLadderTable
                ticker={ticker}
                ladder={ladder}
                costBasis={buyPrice}
                onSetEdge={
                  onSetLadderEdge
                    ? (id, price) =>
                        onSetLadderEdge(
                          ticker,
                          id,
                          // Stored as a multiple of the anchor, never a
                          // price, so a level set today still means the
                          // same thing when the target moves.
                          price === null ? null : price / ladder.anchor
                        )
                    : null
                }
              />
              <PlanLadderFoot ladder={ladder} />
            </section>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Metric label="Recent run">{streak.label}</Metric>
            <Metric label="What it does">{shockProfile.label}</Metric>
          </div>

          {coveredCallRow && coveredCallRow.nextStrike != null ? (
            <FieldGroup>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Your call plan
                </p>
                {coveredCallRow.yield2w != null ? (
                  <span className="text-sm font-medium tabular-nums text-foreground">
                    {percent(coveredCallRow.yield2w)} for two weeks
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Metric label="Strike">
                  {currency(coveredCallRow.nextStrike)}
                </Metric>
                <Metric label="Room above">
                  {coveredCallRow.targetDistance != null
                    ? percent(coveredCallRow.targetDistance)
                    : NO_VALUE}
                </Metric>
                <Metric label="Contracts">{coveredCallRow.contracts}</Metric>
              </div>
            </FieldGroup>
          ) : null}

          {onAskMargus ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                onClose();
                onAskMargus();
              }}
            >
              <Bot data-icon="inline-start" />
              Ask Margus about {cashtag(ticker)}
            </Button>
          ) : null}

          {/*
            Removing a holding lives here, at the end, rather than as a bin
            in the corner of every card. It used to be the only visible
            control on a phone card, so the one thing the card offered was
            the destructive one and the useful one, opening this panel, had
            no affordance at all.
          */}
          {onDelete ? (
            <div className="border-t border-border pt-4">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDelete();
                }}
                className="touch-target inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground outline-none transition hover:bg-loss/10 hover:text-loss focus-visible:text-loss focus-visible:ring-1 focus-visible:ring-loss/40"
              >
                <Trash2 className="size-4" aria-hidden />
                Remove {cashtag(ticker)} from this portfolio
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </ViewportOverlay>
  );
}
