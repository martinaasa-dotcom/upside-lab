"use client";

import { MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import { WhyThis } from "@/components/ui/WhyThis";
import { companyNumbersProvenance } from "@/lib/provenance";
import { bigMoney } from "@/lib/company/scale";
import type { CompanyFacts } from "@/lib/company/facts";
import { NO_VALUE, cn, currency, percent } from "@/lib/format";
import { formatDateTime } from "@/lib/timezone";
import { BarChart3 } from "lucide-react";

/**
 * The quarters, the results days and the quality ladder.
 *
 * The page had four annual revenue figures and nothing else, which is the
 * least informative view of a company there is: an annual figure hides the
 * shape of the year, and it hides results days entirely. A results day is
 * the single most-read line on any company page, because it is the one
 * moment the company is measured against what the people forecasting it
 * said it would do, and a run of beats and a run of misses are different
 * companies.
 *
 * Three blocks, in the order a professional reads them. What it earned
 * each quarter and what share of revenue that was. Whether it hit the
 * number each of the last four times. And where the money goes on the way
 * down from revenue to profit, which is what separates a business with
 * pricing power from one running on volume.
 *
 * Every figure is printed. Nothing here is a chart you have to estimate
 * off, because a reader who wants the shape gets it from the bars and a
 * reader who wants the number should not have to guess it.
 */

/**
 * Revenue and profit per quarter, as a table with the shape drawn behind
 * the figures.
 *
 * It was a bar chart with a margin line over it and it went the way every
 * chart without an axis goes: four bars whose tops are cut off by the
 * container tell a reader the last quarter was bigger, which they can see
 * from the numbers, and nothing else. The margin line was the one
 * genuinely interesting thing on it and it had no scale at all, on a
 * company whose quarterly margin ran from 5% to 48%.
 *
 * The table carries every figure and a bar behind each of the two columns
 * that have a shape worth seeing. Revenue is scaled against the biggest
 * quarter, margin against 100%, so the two are readable on their own terms
 * rather than sharing an axis that would flatten one of them to nothing.
 */
function QuarterTable({
  quarters,
  code,
}: {
  quarters: CompanyFacts["quarters"];
  code: string;
}) {
  const peak = Math.max(...quarters.map((q) => q.revenue ?? 0), 1);
  return (
    <div className="flex flex-col gap-3">
      <MicroLabel>Revenue and profit by quarter</MicroLabel>
      <div className="glass-well overflow-hidden rounded-lg">
        <div className="grid grid-cols-[4.5rem_1fr_auto_6rem] items-center gap-x-3 border-b border-border px-3 py-2 font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground sm:gap-x-5">
          <span>Quarter</span>
          <span>Revenue</span>
          <span className="text-right">Profit</span>
          <span className="text-right">Margin</span>
        </div>
        {quarters.map((q) => {
          const loss = (q.earnings ?? 0) < 0;
          return (
            <div
              key={q.label}
              className="grid grid-cols-[4.5rem_1fr_auto_6rem] items-center gap-x-3 border-b border-border px-3 py-2 last:border-b-0 sm:gap-x-5"
            >
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {q.label}
              </span>
              <span className="relative flex min-w-0 items-center">
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-sm bg-foreground/[0.07]"
                  style={{
                    width: `${Math.max(((q.revenue ?? 0) / peak) * 100, 2)}%`,
                  }}
                />
                <span className="relative truncate font-mono text-sm tabular-nums text-foreground">
                  {bigMoney(q.revenue, code)}
                </span>
              </span>
              <span
                className={cn(
                  "text-right font-mono text-sm tabular-nums",
                  loss ? "text-loss" : "text-foreground"
                )}
              >
                {bigMoney(q.earnings, code)}
              </span>
              {/*
                The margin gets its own bar because it is the figure worth
                watching here and the one a column of percentages hides: a
                quarter at 5% and one at 48% read as similar text and look
                nothing alike as bars.
              */}
              <span className="flex items-center justify-end gap-2">
                <span className="relative hidden h-1.5 w-10 overflow-hidden rounded-full bg-foreground/10 sm:block">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full",
                      q.margin !== null && q.margin < 0 ? "bg-loss/70" : "bg-gain/60"
                    )}
                    style={{
                      width: `${Math.min(Math.max((q.margin ?? 0) * 100, 0), 100)}%`,
                    }}
                  />
                </span>
                <span
                  className={cn(
                    "w-12 text-right font-mono text-sm tabular-nums",
                    q.margin !== null && q.margin < 0
                      ? "text-loss"
                      : "text-muted-foreground"
                  )}
                >
                  {q.margin === null ? NO_VALUE : percent(q.margin, 1)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Did it hit the number, the last four times it was asked.
 *
 * The most-read line on any company page and it was missing entirely. A
 * beat and a miss are printed as the dollars per share by which the
 * company came in above or below what analysts had published, because a
 * percentage off a small estimate exaggerates wildly and the dollar
 * figure is the one people quote.
 */
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <MicroLabel>Results days, against what analysts expected</MicroLabel>
        {counted > 0 && (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {beats} of the last {counted} came in above
          </span>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {surprises.map((s) => {
          const beat = (s.surprise ?? 0) > 0;
          const known = s.surprise !== null && s.actual !== null && s.estimate !== null;
          const gap = known ? s.actual! - s.estimate! : null;
          return (
            <div
              key={s.label}
              className={cn(
                "glass-well flex flex-col gap-1 rounded-lg border-l-2 p-3",
                !known
                  ? "border-l-border"
                  : beat
                    ? "border-l-gain"
                    : "border-l-loss"
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
                {s.estimate === null ? NO_VALUE : currency(s.estimate, 2, code)} expected
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
 * Where the money goes on the way down from revenue to profit, plus what
 * the company earns on the money its owners left in it.
 *
 * The margin ladder is the difference between a business with pricing
 * power and one running on volume, and no single margin shows it: 80% at
 * the gross line and 30% at the bottom is a company spending heavily on
 * purpose, and 20% at the gross line and 15% at the bottom is a company
 * with nothing to spend.
 */
function QualityLadder({ facts }: { facts: CompanyFacts }) {
  const rungs = [
    {
      label: "Gross margin",
      value: facts.grossMargin,
      note: "What is left after making the thing. High means pricing power.",
    },
    {
      label: "Operating margin",
      value: facts.operatingMargin,
      note: "After running the business too, before interest and tax.",
    },
    {
      label: "Profit margin",
      value: facts.profitMargin,
      note: "What actually reaches the owners.",
    },
    /*
      Return on equity is deliberately not on this ladder. The ladder is
      shares of revenue and they nest inside each other; a return on
      equity is a share of something else entirely, and putting it on the
      same bar invites the reader to compare two numbers that have
      different denominators. It gets its own line underneath.
    */
  ].filter((r) => typeof r.value === "number" && Number.isFinite(r.value));

  if (rungs.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <MicroLabel>Where each $100 of revenue goes</MicroLabel>
      <ul className="flex flex-col gap-2">
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
      <p className="text-sm leading-relaxed text-muted-foreground">
        The gap between the top bar and the bottom one is everything the
        company spends between selling something and keeping the profit.
      </p>
      {typeof facts.returnOnEquity === "number" &&
        Number.isFinite(facts.returnOnEquity) && (
          <div className="glass-well flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg p-4">
            <span className="text-sm text-foreground">
              Return on the money its owners left in it
            </span>
            <span className="flex items-baseline gap-3">
              <span
                className={cn(
                  "font-mono text-base font-bold tabular-nums",
                  facts.returnOnEquity >= 0.15 ? "text-gain" : "text-foreground"
                )}
              >
                {percent(facts.returnOnEquity, 1)} a year
              </span>
              <span className="font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">
                15% is good
              </span>
            </span>
          </div>
        )}
    </div>
  );
}

export function CompanyFinancials({
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
    crash rather than an empty panel. The cache key is versioned for the
    same reason; this is the half that survives somebody forgetting to.
  */
  const quarters = facts.quarters ?? [];
  const surprises = facts.surprises ?? [];
  const hasQuarters = quarters.length >= 2;
  const hasSurprises = surprises.length > 0;
  const hasLadder =
    facts.grossMargin !== null ||
    facts.operatingMargin !== null ||
    facts.returnOnEquity !== null;
  if (!hasQuarters && !hasSurprises && !hasLadder) return null;

  const last = surprises[surprises.length - 1];
  const beats = surprises.filter((s) => (s.surprise ?? 0) > 0).length;

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            The last four quarters
            <WhyThis
              provenance={companyNumbersProvenance({
                ticker,
                at: facts.fetchedAt,
              })}
            />
          </span>
        }
        subtitle={
          hasSurprises && last
            ? `What it earned each quarter, whether it hit the number each time, and where the money goes on the way down. It beat expectations ${beats} of the last ${surprises.length} times, most recently in ${last.label}.`
            : "What it earned each quarter and where the money goes on the way down from revenue to profit."
        }
        icon={<BarChart3 className="h-4 w-4" />}
      />
      {hasQuarters && <QuarterTable quarters={quarters} code={code} />}
      {hasSurprises && <Surprises surprises={surprises} code={code} />}
      {hasLadder && <QualityLadder facts={facts} />}
    </Panel>
  );
}
