"use client";

import {
  SCENARIO_MAINTENANCE_RATE,
  SHOCKS,
  analyzePortfolioShock,
  shockProfileIsGuessed,
  type ShockId,
} from "@/lib/book-shock";
import { TickerSymbol } from "@/components/TickerSymbol";
import { listingCurrenciesAreMixed } from "@/lib/listing-currency";
import { barFillPct, cn, currency, percent, signedCurrency, signedPercent, signedTone } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  CARD,
  EmptyState,
  MicroLabel,
  PANEL_STACK,
  Panel,
  PanelHeader,
  Pill,
} from "@/components/ui/Panel";
import { WhyThis } from "@/components/ui/WhyThis";
import { scenarioProvenance } from "@/lib/provenance";
import {
  Activity,
  Cpu,
  DollarSign,
  Flame,
  Layers,
  Shield,
  ShieldAlert,
  Snowflake,
  TrendingDown,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  holdings: {
    ticker: string;
    shares: number;
    price: number;
    /** The provider's sector in this app's words, where it answered. */
    sector?: string | null;
  }[];
  cash: number;
  scopeLabel: string;
};

const DRIVER_ICONS: Record<string, typeof Activity> = {
  Baseline: Activity,
  "Interest rates": TrendingUp,
  "Tech prices": Cpu,
  "Oil and energy": Flame,
  "AI computer builders": Sparkles,
  Crypto: Snowflake,
  "Everyone selling": TrendingDown,
  "The dollar": DollarSign,
  Factories: ShieldAlert,
  "People buying": Layers,
};

export function ScenarioSimulator({ holdings, cash }: Props) {
  const [selectedShock, setSelectedShock] = useState<ShockId>("ai_down20");
  const analysis = useMemo(() => {
    return analyzePortfolioShock(holdings, cash, selectedShock);
  }, [holdings, cash, selectedShock]);

  /* Worst first, which puts what hurts most on top and what holds up best at the foot. */
  const sortedRows = useMemo(
    () => [...analysis.rows].sort((a, b) => a.deltaVal - b.deltaVal),
    [analysis.rows]
  );

  /*
    The chosen chip is brought into view in its own row, never the page:
    the default scenario sits fourth, which on a phone is off the right
    edge, and a choice the reader cannot see reads as nothing chosen.
  */
  const chipRowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = chipRowRef.current;
    const on = row?.querySelector<HTMLElement>("[data-on]");
    if (!row || !on || row.scrollWidth <= row.clientWidth) return;
    const offset = on.getBoundingClientRect().left - row.getBoundingClientRect().left;
    const target = row.scrollLeft + offset - (row.clientWidth - on.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [selectedShock]);

  const mixedListings = listingCurrenciesAreMixed(
    holdings.map((h) => ({ ticker: h.ticker }))
  );

  const activeScenario = analysis.scenario;
  const DriverIcon = DRIVER_ICONS[activeScenario.driver] ?? Activity;

  /*
    The reader's own names this app has no profile for. Behind the mark
    rather than on the panel: it is true of a couple of rows on an
    ordinary portfolio, and a warning on the face of the room every day
    would be read past long before the day it mattered.
  */
  const guessedProfiles = useMemo(
    () =>
      holdings
        .filter((h) => shockProfileIsGuessed(h.ticker, h.sector))
        .map((h) => h.ticker),
    [holdings]
  );

  if (holdings.length === 0) {
    return (
      <EmptyState
        title="Nothing to test yet"
        detail="Add a holding and this shows what a rough day would do to your portfolio."
      />
    );
  }

  /*
    The biggest dollar move on the page, so every bar in the list below is
    drawn on one scale and a reader can compare two holdings by length.
  */
  const maxDelta = Math.max(1, ...sortedRows.map((r) => Math.abs(r.deltaVal)));
  const scaleMax = Math.max(analysis.liveTotalVal, analysis.shockedTotalVal, 1);

  return (
    <div className={PANEL_STACK}>
      <Panel>
        <PanelHeader
          icon={<Shield className="h-4 w-4" />}
          title={
            <span className="inline-flex items-center gap-2">
              What a bad day costs you
              <WhyThis
                provenance={scenarioProvenance(guessedProfiles)}
              />
            </span>
          }
          subtitle="Pick a kind of day. Everything below reprices at once."
        />

        {/*
          One row of chips, not a wall of buttons. Ten scenarios as a two
          column grid was five rows of identical outlined boxes on a phone,
          taller than the answer they choose between; a row that scrolls
          sideways keeps the choice one line tall and the answer on the
          first screen. It wraps from `sm`, where there is room for all ten.
        */}
        <div
          ref={chipRowRef}
          role="group"
          aria-label="Market scenario"
          className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 scrollbar-none [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:[mask-image:none]"
        >
          {SHOCKS.map((s) => {
            const Icon = DRIVER_ICONS[s.driver] ?? Activity;
            const isSelected = selectedShock === s.id;
            return (
              <Button
                key={s.id}
                type="button"
                variant={isSelected ? "default" : "outline"}
                size="sm"
                aria-pressed={isSelected}
                title={s.label}
                data-on={isSelected || undefined}
                onClick={() => setSelectedShock(s.id)}
                className={cn(
                  "h-9 shrink-0 snap-start rounded-full px-3.5 touch-target md:min-h-9",
                  !isSelected &&
                    "bg-background text-muted-foreground hover:text-foreground dark:bg-background"
                )}
              >
                <Icon data-icon="inline-start" aria-hidden />
                {s.shortLabel}
              </Button>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-2 lg:items-start lg:gap-8">
        <div className={cn(CARD, "flex flex-col gap-2 p-4")}>
          <div className="flex flex-wrap items-center gap-2">
            <DriverIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <h3 className="font-semibold text-foreground">{activeScenario.label}</h3>
            <Pill tone="neutral">{activeScenario.driver}</Pill>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {activeScenario.mechanism}
          </p>
          <p className="text-sm text-muted-foreground">
            Move assumed for the group hit hardest{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {activeScenario.headlinePct > 0 ? "+" : ""}
              {(activeScenario.headlinePct * 100).toFixed(0)}%
            </span>
          </p>
        </div>

        {/*
          The answer, as a figure and as two bars on one ruler. The number
          says how much; the bars say how much of the whole, which is the
          part a figure on its own cannot: losing $2,700 of $28,000 and of
          $6,000 are different days, and the eye reads that before the
          digits.
        */}
        <div className="flex flex-col gap-4" aria-live="polite">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div className="flex flex-col gap-1">
              <MicroLabel>Portfolio after this</MicroLabel>
              <p className="figure-hero text-foreground">
                {currency(analysis.shockedTotalVal, 0)}
              </p>
            </div>
            <p className="text-sm tabular-nums text-muted-foreground">
              <span className={cn("font-semibold", signedTone(analysis.deltaVal))}>
                {signedCurrency(analysis.deltaVal, 0)} ({signedPercent(analysis.deltaPct)})
              </span>{" "}
              from today&apos;s {currency(analysis.liveTotalVal, 0)}
            </p>
          </div>
          <div className="flex flex-col gap-2" aria-hidden>
            {[
              { label: "Today", value: analysis.liveTotalVal, after: false },
              { label: "After", value: analysis.shockedTotalVal, after: true },
            ].map((b) => (
              <div key={b.label} className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-3">
                <span className="text-xs text-muted-foreground">{b.label}</span>
                <div className="relative h-3 overflow-hidden rounded-full bg-foreground/[0.06]">
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                      b.after ? "bg-primary" : "bg-foreground/35"
                    )}
                    style={{ width: `${barFillPct((b.value / scaleMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {analysis.margin.isUsingMargin ? (
            <div className="flex flex-wrap items-center gap-2">
              {analysis.margin.marginCallRisk === "critical" ? (
                <Pill tone="bad">Broker could force a sale</Pill>
              ) : analysis.margin.marginCallRisk === "caution" ? (
                <Pill tone="warn">Getting tight</Pill>
              ) : (
                <Pill tone="good">Comfortable</Pill>
              )}
              <p className="text-sm leading-relaxed text-muted-foreground">
                You would be holding{" "}
                {analysis.margin.shockedLeverage.toFixed(2)} times what is really
                yours, because part of it is borrowed. If your broker wants{" "}
                {percent(SCENARIO_MAINTENANCE_RATE, 0)} of the stocks covered by
                your own money, the room before a forced sale is{" "}
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    analysis.margin.shockedEquityCushion > 0
                      ? "text-foreground"
                      : "text-loss"
                  )}
                >
                  {currency(analysis.margin.shockedEquityCushion, 0)}
                </span>
                . Brokers use 25% to 30% and can raise it without warning, so the
                Cash card on Home plans against a stricter half.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {analysis.cash > 0
                ? `Cash ${currency(analysis.cash, 0)} is untouched, ${analysis.margin.shockedCashPct.toFixed(1)}% of the portfolio after this.`
                : "There is no cash set aside as a cushion."}
            </p>
          )}
        </div>
        </div>
      </Panel>

      {/*
        WHERE IT LANDS, AS ONE RANKED LIST OF BARS.

        This used to be two lists of the same eight holdings, a table of
        changes grouped by kind of business and then a card per holding
        with the same change again, plus two cards naming the top and the
        bottom of that same list. Four answers to one question. A bar per
        holding, worst first, on one scale, says all of it: the top row is
        what hurts most, the bottom row what holds up best, and the lengths
        say by how much.
      */}
      <Panel>
        <PanelHeader
          title="Where the damage lands"
          subtitle="Each holding, worst first. The bar is what this day would cost it."
        />
        {sortedRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing held here yet.</p>
        ) : (
          <ul
            className="grid gap-x-10 gap-y-3.5 lg:grid-flow-col lg:grid-cols-2"
            style={{ gridTemplateRows: `repeat(${Math.ceil(sortedRows.length / 2)}, auto)` }}
          >
            {sortedRows.map((r) => {
              const width =
                r.deltaVal === 0 ? 0 : barFillPct((Math.abs(r.deltaVal) / maxDelta) * 100, 1.5);
              return (
                <li key={r.ticker} data-damage-row className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="font-heading text-sm font-semibold text-foreground">
                        <TickerSymbol ticker={r.ticker} showCurrency={mixedListings} />
                      </span>
                      <span className="min-w-0 truncate text-xs text-muted-foreground">
                        {r.label}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-mono text-sm font-semibold tabular-nums",
                        r.deltaVal === 0
                          ? "text-muted-foreground"
                          : r.deltaVal > 0
                            ? "text-gain"
                            : "text-loss"
                      )}
                    >
                      {signedCurrency(r.deltaVal, 0)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-foreground/[0.05]" aria-hidden>
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                        r.deltaVal > 0 ? "bg-gain/80" : r.deltaVal < 0 ? "bg-loss/80" : "bg-foreground/20"
                      )}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {signedPercent(r.movePct)} on the share price, {currency(r.shockVal, 0)} after
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
