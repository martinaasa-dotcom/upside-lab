"use client";

import { Panel, PanelHeader, Score, Scoreboard } from "@/components/ui/Panel";
import { TermTip } from "@/components/ui/TermTip";
import { WhyThis } from "@/components/ui/WhyThis";
import { NO_VALUE, cn } from "@/lib/format";
import { companyNumbersProvenance } from "@/lib/provenance";
import type { CompanyReading } from "@/lib/company/readings";
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
  at,
}: {
  ticker: string;
  readings: CompanyReading[];
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
    </Panel>
  );
}
