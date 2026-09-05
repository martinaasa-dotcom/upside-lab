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
 * Four years of the business, drawn as what the money did.
 *
 * THIS IS THE THIRD ATTEMPT AND THE FIRST TWO ARE WHY IT LOOKS LIKE THIS.
 *
 * It was two bars a year with no scale, which is useless for the reason a
 * chart without an axis always is: you can see one is taller and not from
 * what to what, and a healthy company's profit bar is a tenth the height
 * of its revenue bar, so the figure you most wanted was a sliver. Then it
 * was a table of four printed columns with a bar behind one of them, which
 * is accurate, complete, and still a spreadsheet: four numbers a row, all
 * the same size, in the same grey, with nothing telling a reader which of
 * them is the story.
 *
 * A year of a company is one quantity split in two, and that is a shape
 * rather than a row. Each year is ONE bar, its length the revenue against
 * the biggest year, and the filled part of it is the profit. So the length
 * says how big the business got and the coloured part says how much of it
 * they kept, in one object, read down the column without arithmetic. The
 * grey is not a leftover: it is what the year cost them, and it is labelled
 * as such, because "revenue minus profit" is the number nobody prints and
 * everybody should see.
 *
 * Both encodings share one scale, the biggest year's revenue, so the
 * profit blocks are comparable across years as well as within one. A
 * margin drawn on its own scale would let a small year's profit look
 * bigger than a large year's, which is the exact lie the two-bar version
 * told.
 *
 * The figures are still all printed. A professional reads the numbers and
 * a beginner reads the shape, and neither has to take the other's word.
 */
function YearTable({
  history,
  currency: code,
}: {
  history: CompanyYear[];
  currency: string;
}) {
  const peak = Math.max(...history.map((h) => h.revenue ?? 0), 1);
  const rows = history.map((year, i) => {
    const revenue = year.revenue;
    const profit = year.netIncome;
    const before = history[i - 1]?.revenue;
    return {
      year: year.year,
      revenue,
      profit,
      /*
        Growth is computed from the row above rather than taken from the
        feed, so the first year has none. Revenue rising every year says
        almost nothing on its own; whether each rise is bigger or smaller
        than the last is what decides whether a business is winning or
        running out of road, and it is invisible in a column of totals.
      */
      growth:
        revenue && before && before > 0 ? revenue / before - 1 : null,
      margin:
        revenue && revenue > 0 && profit !== null ? profit / revenue : null,
      /* Both widths are shares of the same scale, so years compare. */
      revenueWidth: Math.max(((revenue ?? 0) / peak) * 100, 1),
      profitWidth: Math.max((Math.max(profit ?? 0, 0) / peak) * 100, 0),
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <MicroLabel>Four years of the business</MicroLabel>
        <span className="flex items-center gap-4 font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-3 rounded-sm bg-gain/70" />
            Kept as profit
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-3 rounded-sm bg-foreground/15" />
            What it cost them
          </span>
        </span>
      </div>

      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.year} className="flex flex-col gap-1.5">
            {/*
              The year and its figures sit above the bar rather than in
              columns beside it, so the bar gets the full width of the panel
              and stays readable on a phone, where four columns and a bar
              cannot both fit.
            */}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                {r.year}
              </span>
              <span className="font-mono text-sm tabular-nums text-foreground">
                {bigMoney(r.revenue, code)}
              </span>
              {r.growth !== null && (
                <span
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    r.growth < 0 ? "text-loss" : "text-gain"
                  )}
                >
                  {signedPercent(r.growth)}
                </span>
              )}
              <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
                <span
                  className={cn(
                    r.profit !== null && r.profit < 0
                      ? "text-loss"
                      : "text-gain"
                  )}
                >
                  {bigMoney(r.profit, code)}
                </span>{" "}
                kept
                {r.margin !== null && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({percent(r.margin, 1)})
                  </span>
                )}
              </span>
            </div>
            <span
              aria-hidden
              className="relative block h-3 w-full overflow-hidden rounded-sm"
            >
              <span
                className="absolute inset-y-0 left-0 rounded-sm bg-foreground/15"
                style={{ width: `${r.revenueWidth}%` }}
              />
              <span
                className={cn(
                  "absolute inset-y-0 left-0 rounded-sm",
                  r.profit !== null && r.profit < 0 ? "bg-loss/70" : "bg-gain/70"
                )}
                style={{ width: `${r.profitWidth}%` }}
              />
            </span>
          </li>
        ))}
      </ul>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Each bar is one year, its length that year&apos;s revenue against the
        biggest of the four. The green part is the profit they kept and the
        grey is what the year cost them. A bar getting longer while the green
        part grows faster than the grey is a business getting better at what
        it does, not just bigger.
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
