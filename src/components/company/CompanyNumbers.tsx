"use client";

import { MicroLabel, Panel, PanelHeader, Score, Scoreboard } from "@/components/ui/Panel";
import { TermTip } from "@/components/ui/TermTip";
import { WhyThis } from "@/components/ui/WhyThis";
import { NO_VALUE, cn, percent } from "@/lib/format";
import { companyNumbersProvenance } from "@/lib/provenance";
import type { CompanyReading } from "@/lib/company/readings";
import type { CompanyYear } from "@/lib/company/facts";
import { bigMoney } from "@/lib/company/readings";
import { BarChart3 } from "lucide-react";

/**
 * The figures, each one said twice: once as a number and once as a
 * sentence with a unit somebody can picture.
 *
 * The second half is the whole reason this panel is not a table. A table
 * of ratios is exactly what people already cannot read, and it is what
 * every other site hands them. "9.2%" teaches nobody anything; "out of
 * every $100 customers pay them, about $9 is left as profit" teaches
 * anybody, and the number is identical.
 *
 * The third line, what ordinary looks like, is printed even where the
 * figure came back empty, because a reader who cannot get this company's
 * profit margin is still better off knowing what one is.
 */

const TONE_CLASS = {
  good: "text-gain",
  watch: "text-warning",
  neutral: "text-foreground",
} as const;

/**
 * The benchmark chip.
 *
 * A figure with nothing beside it is not information, which is the whole
 * complaint this room answers. Where there is a real number to compare
 * with, it goes on the same line as the figure rather than into a
 * sentence: "104%" next to "S&P 500 · 15%" is read in one glance, and the
 * same fact written out takes a line and gets skipped.
 *
 * The arrow is deliberately quiet and there is none at all when `better`
 * is null, because most of these comparisons have no better side. A high
 * multiple is not worse than a low one and this app does not pretend it is.
 */
function Versus({ versus }: { versus: NonNullable<CompanyReading["versus"]> }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
      <span className="uppercase tracking-[0.06em]">{versus.label}</span>
      <span className="text-foreground">{versus.value}</span>
      {versus.better !== null && (
        <span
          aria-hidden
          className={versus.better ? "text-gain" : "text-muted-foreground"}
        >
          {versus.better ? "▲" : "▼"}
        </span>
      )}
    </span>
  );
}

function ReadingCell({ reading }: { reading: CompanyReading }) {
  const missing = reading.value === NO_VALUE;
  return (
    <Score
      label={
        reading.glossary ? (
          <TermTip term={reading.glossary}>{reading.label}</TermTip>
        ) : (
          reading.label
        )
      }
      value={
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <span className={cn(missing ? "text-muted-foreground" : TONE_CLASS[reading.tone])}>
            {reading.value}
          </span>
          {reading.versus && !missing && <Versus versus={reading.versus} />}
        </span>
      }
      sub={
        <>
          {reading.plain ? (
            <span className="block text-foreground">{reading.plain}</span>
          ) : (
            <span className="block text-foreground">
              The feed did not carry this one, so there is nothing to show.
              It has not been estimated.
            </span>
          )}
          <span className="mt-2 block">{reading.compare}</span>
        </>
      }
    />
  );
}

/**
 * Four years of revenue and profit, as a table with a bar behind it.
 *
 * It was two bars a year with no scale on them, and it was useless for
 * exactly the reason a chart without an axis always is: a reader could see
 * that one was taller and could not see from what to what. Worse, a
 * healthy company's profit bar is a tenth the height of its revenue bar,
 * so the thing you most wanted to read was a sliver.
 *
 * A table fixes both. Every figure is printed, so a professional gets the
 * actual numbers and a beginner gets the margin worked out for them, and
 * the bar behind the revenue column carries the shape that made a chart
 * tempting in the first place. Read down the margin column and you can see
 * whether a growing business is getting better at it, which is the
 * question the bars could never answer.
 */
function YearTable({
  history,
  currency: code,
}: {
  history: CompanyYear[];
  currency: string;
}) {
  const peak = Math.max(...history.map((h) => h.revenue ?? 0), 1);
  return (
    <div className="flex flex-col gap-3">
      <MicroLabel>Revenue and profit, year by year</MicroLabel>
      <div className="glass-well overflow-hidden rounded-lg">
        <div className="grid grid-cols-[3.5rem_1fr_auto_auto] items-center gap-x-3 border-b border-border px-3 py-2 font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground sm:gap-x-5">
          <span>Year</span>
          <span>Revenue</span>
          <span className="text-right">Profit</span>
          <span className="w-14 text-right">Margin</span>
        </div>
        {history.map((year) => {
          const revenue = year.revenue;
          const profit = year.netIncome;
          const margin =
            revenue && revenue > 0 && profit !== null ? profit / revenue : null;
          return (
            <div
              key={year.year}
              className="grid grid-cols-[3.5rem_1fr_auto_auto] items-center gap-x-3 border-b border-border px-3 py-2 last:border-b-0 sm:gap-x-5"
            >
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {year.year}
              </span>
              {/*
                The bar sits behind the figure rather than beside it, so it
                costs no column width on a phone and the number stays the
                thing being read.
              */}
              <span className="relative flex min-w-0 items-center">
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-sm bg-foreground/[0.07]"
                  style={{
                    width: `${Math.max(((revenue ?? 0) / peak) * 100, 2)}%`,
                  }}
                />
                <span className="relative truncate font-mono text-sm tabular-nums text-foreground">
                  {bigMoney(revenue, code)}
                </span>
              </span>
              <span
                className={cn(
                  "text-right font-mono text-sm tabular-nums",
                  profit !== null && profit < 0 ? "text-loss" : "text-foreground"
                )}
              >
                {bigMoney(profit, code)}
              </span>
              <span
                className={cn(
                  "w-14 text-right font-mono text-sm tabular-nums",
                  margin !== null && margin < 0
                    ? "text-loss"
                    : "text-muted-foreground"
                )}
              >
                {margin === null ? NO_VALUE : percent(margin, 1)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Read the margin column downwards. A business getting bigger and
        keeping a larger share of what it sells is a different story from
        one getting bigger by selling more cheaply.
      </p>
    </div>
  );
}

export function CompanyNumbers({
  ticker,
  readings,
  history,
  currency,
  at,
}: {
  ticker: string;
  readings: CompanyReading[];
  history: CompanyYear[];
  currency: string;
  at?: string | null;
}) {
  const filled = readings.filter((r) => r.value !== NO_VALUE).length;
  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            The numbers, in plain words
            <WhyThis
              provenance={companyNumbersProvenance({
                ticker,
                at,
                filled,
                total: readings.length,
              })}
            />
          </span>
        }
        subtitle="The real name of each figure, then what it means in ordinary words, then what it is measured against. A number with nothing beside it is not information."
        icon={<BarChart3 className="h-4 w-4" />}
      />
      {/*
        Three across, and the count is not arbitrary.

        `Scoreboard` refuses to leave an empty cell in the last row, so it
        drops to however many columns divide the children. At two columns
        the nine readings a company gets divided to one, and the page ran
        to a single tall column of full-width cards on a 1280px screen. A
        company has nine, a fund four and a coin two, which at three
        columns fill exactly three rows, two rows and one.
      */}
      <Scoreboard cols={3} mobileCols={1}>
        {readings.map((r) => (
          <ReadingCell key={r.id} reading={r} />
        ))}
      </Scoreboard>
      {history.length >= 2 && (
        <YearTable history={history} currency={currency} />
      )}
    </Panel>
  );
}
