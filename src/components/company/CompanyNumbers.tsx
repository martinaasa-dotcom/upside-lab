"use client";

import { MicroLabel, Panel, PanelHeader, Score, Scoreboard } from "@/components/ui/Panel";
import { TermTip } from "@/components/ui/TermTip";
import { WhyThis } from "@/components/ui/WhyThis";
import { NO_VALUE, cn, percent, signedPercent } from "@/lib/format";
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

function ReadingCell({
  reading,
  lead = false,
}: {
  reading: CompanyReading;
  /** One of the three read first. Heavier figure, accent rule on the card. */
  lead?: boolean;
}) {
  const missing = reading.value === NO_VALUE;
  return (
    <Score
      className={cn(lead && "border-t-2 border-t-primary/50")}
      /*
        The hierarchy is made by shrinking the reference cells rather than
        by growing the three that lead, because the type ladder stops at
        2xl and a scoreboard figure is already there. Same direction, one
        step, and the invariant stays happy.
      */
      valueClassName={lead ? undefined : "text-lg sm:text-xl"}
      label={
        reading.glossary ? (
          <TermTip term={reading.glossary}>{reading.label}</TermTip>
        ) : (
          reading.label
        )
      }
      /*
        WHAT ORDINARY LOOKS LIKE IS ONLY PRINTED ON THE THREE THAT LEAD.

        Nine cards each carrying a figure, a sentence saying what it means
        and a second sentence saying what it is next to comes to twenty
        seven lines of prose in one panel, and it reads as an essay with
        numbers in it rather than as figures. The teaching is the point of
        this room, so it is not dropped: it moves onto the label, which is
        already the thing a reader presses when a word is unfamiliar. The
        three that lead keep it in full, because those are the ones
        somebody actually stops on.
      */
      explain={lead ? undefined : reading.compare}
      /*
        A FIXED HEIGHT, AND IT IS THE FIX FOR A REAL MISALIGNMENT.

        `Score` bottom-aligns its note so a row of cells share a floor,
        which is right for a scoreboard of bare figures and wrong here.
        These cells carry a sentence, the figure line is sometimes one
        line and sometimes two (a benchmark chip is taller than the digits
        beside it), and the result was that the explanatory line started
        at a different height in every cell of the row. Reading across
        three cards whose second lines all begin somewhere else is what
        makes a grid feel thrown together.

        Pinning the figure row and top-aligning the note below it puts
        every second line on the same baseline, whatever the cell holds.
      */
      value={
        <span className="flex min-h-[2.25rem] flex-wrap items-baseline gap-x-3 gap-y-1.5 sm:min-h-[2.5rem]">
          <span className={cn(missing ? "text-muted-foreground" : TONE_CLASS[reading.tone])}>
            {reading.value}
          </span>
          {reading.versus && !missing && <Versus versus={reading.versus} />}
        </span>
      }
      subClassName="mt-0 text-muted-foreground"
      sub={
        <>
          {reading.plain ? (
            <span className="block text-foreground">{reading.plain}</span>
          ) : (
            <span className="block text-foreground">
              The feed did not carry this one. It has not been estimated.
            </span>
          )}
          {lead && <span className="mt-2 block">{reading.compare}</span>}
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
  /*
    Year-on-year growth is the column the table was missing, and it is the
    one a professional reads first. Revenue rising every year says almost
    nothing on its own: what decides whether a business is winning or
    running out of road is whether each year's rise is bigger or smaller
    than the last, and that is invisible in a column of totals. It is
    computed from the row above rather than taken from the feed, so the
    first year has none and says so.
  */
  const growthOf = (i: number): number | null => {
    const now = history[i]?.revenue;
    const before = history[i - 1]?.revenue;
    if (!now || !before || before <= 0) return null;
    return now / before - 1;
  };
  return (
    <div className="flex flex-col gap-3">
      <MicroLabel>Revenue and profit by year</MicroLabel>
      <div className="glass-well overflow-hidden rounded-lg">
        <div className="grid grid-cols-[3.5rem_1fr_auto_auto] items-center gap-x-3 border-b border-border px-3 py-2 font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground sm:grid-cols-[3.5rem_1fr_auto_auto_auto] sm:gap-x-5">
          <span>Year</span>
          <span>Revenue</span>
          <span className="hidden w-16 text-right sm:block">Growth</span>
          <span className="text-right">Profit</span>
          <span className="w-[5.5rem] text-right sm:w-[6.75rem]">Margin</span>
        </div>
        {history.map((year, i) => {
          const growth = growthOf(i);
          const revenue = year.revenue;
          const profit = year.netIncome;
          const margin =
            revenue && revenue > 0 && profit !== null ? profit / revenue : null;
          return (
            <div
              key={year.year}
              className="grid grid-cols-[3.5rem_1fr_auto_auto] items-center gap-x-3 border-b border-border px-3 py-2 last:border-b-0 sm:grid-cols-[3.5rem_1fr_auto_auto_auto] sm:gap-x-5"
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
                  "hidden w-16 text-right font-mono text-sm tabular-nums sm:block",
                  growth === null
                    ? "text-muted-foreground"
                    : growth < 0
                      ? "text-loss"
                      : "text-gain"
                )}
              >
                {growth === null ? NO_VALUE : signedPercent(growth)}
              </span>
              <span
                className={cn(
                  "text-right font-mono text-sm tabular-nums",
                  profit !== null && profit < 0 ? "text-loss" : "text-foreground"
                )}
              >
                {bigMoney(profit, code)}
              </span>
              {/*
                The margin gets its own small bar, scaled to itself rather
                than to the revenue beside it. A profit margin drawn on the
                revenue scale is a sliver, which is what made the chart this
                table replaced useless; on its own scale the column reads
                downwards as a trend, which is the question.
              */}
              <span className="flex items-center justify-end gap-2">
                <span className="relative hidden h-1.5 w-10 overflow-hidden rounded-full bg-foreground/10 sm:block">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full",
                      margin !== null && margin < 0 ? "bg-loss/70" : "bg-gain/60"
                    )}
                    style={{
                      width: `${Math.min(Math.max((margin ?? 0) * 100, 0), 100)}%`,
                    }}
                  />
                </span>
                <span
                  className={cn(
                    "w-12 text-right font-mono text-sm tabular-nums",
                    margin !== null && margin < 0
                      ? "text-loss"
                      : "text-muted-foreground"
                  )}
                >
                  {margin === null ? NO_VALUE : percent(margin, 1)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Read the growth and margin columns downwards. Growth slowing while
        the margin climbs is a business getting more valuable per sale; growth
        holding up while the margin falls is one buying its way forward.
      </p>
    </div>
  );
}

/**
 * Which figures lead.
 *
 * A grid of nine identical cards is a spreadsheet, and a reader with no
 * background has no way to tell which of the nine to start with. These
 * three are what anybody reads first: what it costs against its earnings,
 * whether those earnings are growing, and whether the business keeps what
 * it sells. They get their own row, a heavier figure and an accent rule;
 * the rest are reference and sit below.
 */
const LEAD_READINGS = ["price-tag", "earnings-growth", "profit"];

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
  const lead = LEAD_READINGS.map((id) =>
    readings.find((r) => r.id === id)
  ).filter((r): r is CompanyReading => Boolean(r));
  const rest = readings.filter((r) => !lead.includes(r));
  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            Key financials
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
        subtitle="The three that matter most first, then the rest for reference. Press any label for what the figure is and what ordinary looks like."
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
      {lead.length > 0 && (
        <Scoreboard cols={3} mobileCols={1}>
          {lead.map((r) => (
            <ReadingCell key={r.id} reading={r} lead />
          ))}
        </Scoreboard>
      )}
      {rest.length > 0 && (
        <Scoreboard cols={3} mobileCols={1}>
          {rest.map((r) => (
            <ReadingCell key={r.id} reading={r} />
          ))}
        </Scoreboard>
      )}
      {history.length >= 2 && (
        <YearTable history={history} currency={currency} />
      )}
    </Panel>
  );
}
