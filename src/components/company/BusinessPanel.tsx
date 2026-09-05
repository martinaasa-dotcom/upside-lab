"use client";

import { MicroLabel, Panel, PanelHeader, Segmented } from "@/components/ui/Panel";
import { WhyThis } from "@/components/ui/WhyThis";
import { NO_VALUE, cn, currency, percent, signedPercent } from "@/lib/format";
import { companyNumbersProvenance } from "@/lib/provenance";
import type { CompanyFacts } from "@/lib/company/facts";
import { bigMoney } from "@/lib/company/readings";
import { formatDateTime } from "@/lib/timezone";
import { BarChart3 } from "lucide-react";
import { useState } from "react";

/**
 * The business: what it sold, what it kept, and whether it hit the number.
 *
 * THIS PANEL IS TWO PANELS THAT WERE TALKING ABOUT THE SAME THING.
 *
 * There was a year table inside Key financials and a separate "The last
 * four quarters" panel under it, each with its own heading, its own
 * subtitle and its own copy of revenue, profit and margin. They are one
 * subject at two time scales, so they are one panel with a toggle: a
 * reader picks the scale and everything below answers at that scale. It
 * halves the page and removes the question of which of the two to read.
 *
 * **The bar had to become obvious rather than clever.** The first version
 * split each bar into a green part and a grey part with the figures
 * printed at the far right of the row, so a reader had to work out what
 * the colours meant and then travel across the panel to pair a shape with
 * a number. Every figure now sits INSIDE the bar it describes: the profit
 * in the green, the revenue at the end of the grey. One object per period,
 * nothing to pair up, and the sentence under the first one says what the
 * colours are so nobody has to guess.
 */

type Scale = "years" | "quarters";

/** One period: how big it was, and how much of it they kept. */
type Period = {
  key: string;
  label: string;
  revenue: number | null;
  profit: number | null;
  margin: number | null;
  growth: number | null;
};

function toPeriods(
  rows: { label: string; revenue: number | null; profit: number | null }[]
): Period[] {
  return rows.map((row, i) => {
    const before = rows[i - 1]?.revenue;
    return {
      key: row.label,
      label: row.label,
      revenue: row.revenue,
      profit: row.profit,
      margin:
        row.revenue && row.revenue > 0 && row.profit !== null
          ? row.profit / row.revenue
          : null,
      /*
        Computed from the row above rather than taken from the feed, so the
        first period has none. Revenue rising says almost nothing on its
        own; whether each rise is bigger than the last is what decides
        whether a business is winning or running out of road.
      */
      growth:
        row.revenue && before && before > 0 ? row.revenue / before - 1 : null,
    };
  });
}

/**
 * A period drawn as one bar with its own numbers inside it.
 *
 * The bar's length is the revenue against the biggest period shown, so
 * length is size. The filled part is the profit, on the same scale, so the
 * filled fraction of a bar is that period's margin and the filled parts
 * compare across periods as well as within one. A margin drawn on its own
 * scale would let a small period's profit look bigger than a large one's,
 * which is the lie the two-bar version of this told.
 */
function MoneyBar({
  period,
  peak,
  code,
}: {
  period: Period;
  peak: number;
  code: string;
}) {
  const revenueWidth = Math.max(((period.revenue ?? 0) / peak) * 100, 1);
  const profitWidth = Math.max((Math.max(period.profit ?? 0, 0) / peak) * 100, 0);
  const negative = period.profit !== null && period.profit < 0;

  return (
    <li className="flex flex-col gap-2.5">
      {/*
        EVERY NUMBER FOR THIS PERIOD IS ON ONE LINE, ABOVE THE BAR IT
        DESCRIBES, AND NOTHING FLOATS AT THE PANEL'S EDGE.

        The revenue used to be right-aligned on a row of its own, so it
        printed at the far right of the panel while the grey bar it named
        ended somewhere in the middle: a reader saw a bar stop, and a
        number a hand's width away from it, with nothing connecting them.
        That was the whole reason the grey read as unexplained.

        The revenue is the bar's own length, so it belongs with the label
        that names the period, and the bar below is then simply that figure
        drawn. What is left under the bar is the one number the bar splits
        out, which is what they kept.
      */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-sm font-bold tabular-nums text-foreground">
          {period.label}
        </span>
        <span className="font-mono text-sm tabular-nums text-foreground">
          {bigMoney(period.revenue, code)}
        </span>
        <span className="text-xs text-muted-foreground">revenue</span>
        {period.growth !== null && (
          <span
            className={cn(
              "font-mono text-xs tabular-nums",
              period.growth < 0 ? "text-loss" : "text-gain"
            )}
          >
            {signedPercent(period.growth)}
          </span>
        )}
      </div>

      <div className="relative h-7 w-full">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 rounded-md bg-foreground/[0.09]"
          style={{ width: `${revenueWidth}%` }}
        />
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 rounded-md",
            negative ? "bg-loss/70" : "bg-gain/70"
          )}
          style={{ width: `${profitWidth}%` }}
        />
      </div>

      {/*
        Left-aligned, under the green it names, and never right-aligned
        anywhere: a figure pinned to the panel's edge is a figure with
        nothing beside it.
      */}
      <div className="font-mono text-sm tabular-nums">
        <span className={cn("font-bold", negative ? "text-loss" : "text-gain")}>
          {bigMoney(period.profit, code)}
        </span>
        <span className="ml-1.5 text-muted-foreground">
          kept
          {period.margin !== null && `, ${percent(period.margin, 1)} of revenue`}
        </span>
      </div>
    </li>
  );
}

function MoneyBars({ periods, code }: { periods: Period[]; code: string }) {
  const peak = Math.max(...periods.map((p) => p.revenue ?? 0), 1);
  return (
    <div className="flex flex-col gap-6">
      {/*
        The key is at the top, where somebody meets the first bar, rather
        than in a paragraph under the last one. A legend a reader only
        finds after scrolling past everything it explains has not explained
        anything.
      */}
      <p className="text-sm leading-relaxed text-muted-foreground">
        Each bar is one period, and its full length is that period&apos;s
        revenue. The{" "}
        <span className="font-medium text-gain">green part is the profit</span>{" "}
        they kept; the grey is what the period cost them.
      </p>
      <ul className="flex flex-col gap-8">
        {periods.map((p) => (
          <MoneyBar key={p.key} period={p} peak={peak} code={code} />
        ))}
      </ul>
    </div>
  );
}

function Surprises({
  surprises,
  code,
}: {
  surprises: CompanyFacts["surprises"];
  code: string;
}) {
  const beats = surprises.filter((s) => (s.surprise ?? 0) > 0).length;
  const counted = surprises.filter((s) => s.surprise !== null).length;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <MicroLabel>Results days, against what analysts expected</MicroLabel>
        {counted > 0 && (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {beats} of the last {counted} came in above
          </span>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {surprises.map((s) => {
          const beat = (s.surprise ?? 0) > 0;
          const known =
            s.surprise !== null && s.actual !== null && s.estimate !== null;
          const gap = known ? s.actual! - s.estimate! : null;
          return (
            <div
              key={s.label}
              className={cn(
                "glass-well flex flex-col gap-2 rounded-lg border-l-2 p-4",
                !known ? "border-l-border" : beat ? "border-l-gain" : "border-l-loss"
              )}
            >
              <span className="font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">
                {s.label}
              </span>
              <span
                className={cn(
                  "font-mono text-base font-bold tabular-nums",
                  !known ? "text-muted-foreground" : beat ? "text-gain" : "text-loss"
                )}
              >
                {!known ? NO_VALUE : beat ? "Beat" : "Missed"}
                {gap !== null && (
                  <span className="ml-2 text-sm font-medium">
                    {gap > 0 ? "+" : "-"}
                    {currency(Math.abs(gap), 2, code)}
                  </span>
                )}
              </span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {s.actual === null ? NO_VALUE : currency(s.actual, 2, code)} against{" "}
                {s.estimate === null ? NO_VALUE : currency(s.estimate, 2, code)}{" "}
                expected
              </span>
              {s.reportedAt && (
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(s.reportedAt, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Where the money goes on the way down from revenue to profit.
 *
 * No single margin shows it: 80% at the gross line and 30% at the bottom
 * is a company spending heavily on purpose, and 20% at the gross line and
 * 15% at the bottom is a company with nothing to spend.
 *
 * Return on equity is deliberately not a rung. The ladder is shares of
 * revenue and they nest inside each other; a return on equity has a
 * different denominator, and putting it on the same bar invites a reader
 * to compare two numbers that cannot be compared.
 */
function QualityLadder({ facts }: { facts: CompanyFacts }) {
  const rungs = [
    { label: "Gross margin", value: facts.grossMargin },
    { label: "Operating margin", value: facts.operatingMargin },
    { label: "Profit margin", value: facts.profitMargin },
  ].filter((r) => typeof r.value === "number" && Number.isFinite(r.value));
  if (rungs.length === 0) return null;
  return (
    <div className="flex flex-col gap-5">
      <MicroLabel>Where each $100 of revenue goes</MicroLabel>
      <ul className="flex flex-col gap-3">
        {rungs.map((r) => (
          <li key={r.label} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-sm text-muted-foreground sm:w-40">
              {r.label}
            </span>
            <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10">
              <span
                aria-hidden
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full",
                  (r.value as number) < 0 ? "bg-loss/70" : "bg-gain/50"
                )}
                style={{
                  width: `${Math.min(Math.max((r.value as number) * 100, 0), 100)}%`,
                }}
              />
            </span>
            <span className="w-14 shrink-0 text-right font-mono text-sm tabular-nums text-foreground">
              {percent(r.value as number, 1)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SCALES = [
  { id: "years" as const, label: "By year" },
  { id: "quarters" as const, label: "By quarter" },
];

export function BusinessPanel({
  ticker,
  facts,
  code,
}: {
  ticker: string;
  facts: CompanyFacts;
  code: string;
}) {
  /*
    Read through a default rather than off the object. These arrive from a
    cache that holds a whole `CompanyFacts`, so an entry written before a
    field existed comes back without it, and a bare `.length` on that is a
    crash rather than an empty panel.
  */
  const quarters = facts.quarters ?? [];
  const surprises = facts.surprises ?? [];
  const history = facts.history ?? [];

  const years = toPeriods(
    history.map((h) => ({
      label: String(h.year),
      revenue: h.revenue,
      profit: h.netIncome,
    }))
  );
  const byQuarter = toPeriods(
    quarters.map((q) => ({
      label: q.label,
      revenue: q.revenue,
      profit: q.earnings,
    }))
  );

  const hasYears = years.length >= 2;
  const hasQuarters = byQuarter.length >= 2;
  const [scale, setScale] = useState<Scale>(hasYears ? "years" : "quarters");
  const shown = scale === "years" && hasYears ? years : byQuarter;
  const hasLadder =
    facts.grossMargin !== null ||
    facts.operatingMargin !== null ||
    facts.profitMargin !== null;

  if (!hasYears && !hasQuarters && surprises.length === 0 && !hasLadder) {
    return null;
  }

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            The business
            <WhyThis
              provenance={companyNumbersProvenance({
                ticker,
                at: facts.fetchedAt,
              })}
            />
          </span>
        }
        subtitle="What it sold, how much of that it kept, and whether it hit the number analysts had for it."
        icon={<BarChart3 className="h-4 w-4" />}
        actions={
          hasYears && hasQuarters ? (
            <Segmented
              options={SCALES}
              value={scale}
              onChange={setScale}
              ariaLabel="Time scale"
            />
          ) : undefined
        }
      />

      {/*
        One child, so this panel sets its own vertical rhythm. `Panel`
        spaces its direct children at `gap-5 sm:gap-6`, which is right for a
        panel of short blocks and far too tight for three sections of bars,
        cards and prose: stacked at 24px they read as one wall. A direct
        child may not add its own `mt-*` (it would get both), so the body is
        wrapped and the decision lives here, with the content.
      */}
      <div className="flex flex-col gap-10 sm:gap-12">
        {shown.length >= 2 && <MoneyBars periods={shown} code={code} />}
        {surprises.length > 0 && <Surprises surprises={surprises} code={code} />}
        {hasLadder && <QualityLadder facts={facts} />}
      </div>
    </Panel>
  );
}
