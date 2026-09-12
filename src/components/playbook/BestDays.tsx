"use client";

import { Card, MicroLabel, Segmented } from "@/components/ui/Panel";
import { WhyThis } from "@/components/ui/WhyThis";
import { bestDaysProvenance } from "@/lib/provenance";
import { barFillPct, cn, currency, percent } from "@/lib/format";
import {
  annualFromMultiple,
  BEST_DAY_STEPS,
  type BestDaysRead,
} from "@/lib/market-temperature";
import { useState } from "react";

/*
  EVERY SITE CARRIES THIS STATISTIC AND ALMOST NONE OF THEM SAY WHICH YEARS.

  A figure about missing the best days is the most quoted number in retail
  investing and it is nearly always printed without a window, which makes
  it unfalsifiable and, worse, makes it free to pick: run it over a
  different decade and you get a different answer, so an unsourced version
  of it is an advertisement rather than a measurement. This one is worked
  out from the same ten years of index closes the app already fetches for
  its market reading, it prints its own first and last date, and it moves
  when the market does.

  THE COUNTERWEIGHT IS COMPUTED TOO, AND IT IS THE HALF NOBODY PRINTS.

  The statistic is usually deployed to prove that staying put always wins,
  which does not follow from it: somebody who could dodge the best days
  could presumably have dodged the worst ones as well, and that version of
  the arithmetic comes out far better rather than worse. What makes staying
  put the sound reading is not the first figure, it is that the two sets of
  days sit inside the same few frightening weeks, so in practice nobody
  gets one without the other. That clustering is counted here rather than
  asserted, and it is the only honest way to print any of this.
*/

const STARTING = 10_000;

function amountFor(multiple: number): string {
  return currency(STARTING * multiple, 0);
}

export function BestDays({ read }: { read: BestDaysRead }) {
  const [days, setDays] = useState<number>(BEST_DAY_STEPS[1] ?? 10);

  const missed = read.missingBest.find((s) => s.days === days);
  const dodged = read.missingWorst.find((s) => s.days === days);
  if (!missed) return null;

  const fullRate = annualFromMultiple(read.full, read.years);
  const missedRate = annualFromMultiple(missed.multiple, read.years);
  const scale = Math.max(read.full, missed.multiple, dodged?.multiple ?? 0, 1);
  const clustered = read.bestNearWorst;

  /*
    The share of the whole gain those days carried, rather than a sentence
    asserting that they decided most of it. On a window that ended lower
    than it started there is no gain for them to be a share of, so this is
    null and the sentence simply stops after the two figures: an assertion
    the arithmetic cannot support is what this whole section exists to
    replace.
  */
  const gain = read.full - 1;
  const shareOfGain =
    gain > 0.05 ? Math.min(1, (read.full - missed.multiple) / gain) : null;

  const options = BEST_DAY_STEPS.map((n) => ({
    id: String(n),
    label: String(n),
    title: `${n} days`,
  }));

  /*
    Never `window`. A local of that name inside a client component shadows
    the global for the whole function body, so the next line of code here
    that reaches for `window.matchMedia` fails in a way that reads as a
    server-rendering problem and is not.
  */
  const windowLabel =
    read.from && read.to ? `${read.from} to ${read.to}` : `${read.years} years`;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm leading-relaxed text-muted-foreground">
        The rises that pay for everything do not arrive evenly. They arrive in a
        handful of days, and being somewhere else on those days costs far more
        than it sounds like it should. Here is the S&amp;P 500 over{" "}
        {read.years} years, {windowLabel}, worked out from its {read.days}{" "}
        trading days. The money is in dollars because that is what the index is
        quoted in.
      </p>

      {/*
        THE BASELINE IS ITS OWN CARD, ABOVE AND SEPARATE FROM THE PICKER,
        BECAUSE IT DOES NOT MOVE WHEN THE PICKER DOES.

        This card and the picker used to sit inside one card together, with
        "Left alone, every day" as the accented top row and the picker's own
        answer as a muted row underneath it. A reader who presses 5, 10, 20,
        30 before reading anything sees the top figure hold still every
        time, because it is the window's own total and has nothing to do
        with the picker; the muted row a few inches below it is the one that
        moves, and nothing on the page pointed there. Splitting the two
        apart, with the picker sitting directly above the row that answers
        it, makes the causality the layout rather than something the prose
        had to explain.
      */}
      <Card tone="default" className="flex flex-col gap-2">
        <Row
          label="Left alone, the whole time"
          amount={amountFor(read.full)}
          rate={fullRate}
          width={(read.full / scale) * 100}
          tone="muted"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          The whole {read.years}-year window, nothing taken out. This figure
          does not change below.
        </p>
      </Card>

      {/*
        The mark goes beside the control rather than under the figures,
        because the question it answers ("which ten years, and what did
        this app do to the number") is the one a reader has before they
        read the figures, not after. It is the header rule from the panel
        note in a smaller place: the mark stands beside the thing it is
        about.
      */}
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          {/*
            The unit is on the label, not in every cell. "10 days" does not
            fit a 65px cell at 390px and "5 days" does, so the row wrapped
            three of its four cells to two lines and left one on one, which
            reads as a broken control rather than as a choice. The cells are
            the numbers; the row above says what they count.
          */}
          <MicroLabel className="mb-1.5">
            Days taken out of the window above
          </MicroLabel>
          <Segmented
            options={options}
            value={String(days)}
            onChange={(id) => setDays(Number(id))}
            ariaLabel="How many of the best days to take out"
            columns={options.length}
          />
        </div>
        <WhyThis
          provenance={bestDaysProvenance({
            from: read.from,
            to: read.to,
            days: read.days,
            starting: currency(STARTING, 0),
          })}
        />
      </div>

      <Card tone="default" className="flex flex-col gap-6">
        <Row
          label={`Out of the market for the best ${days} days`}
          amount={amountFor(missed.multiple)}
          rate={missedRate}
          width={(missed.multiple / scale) * 100}
          tone="brand"
        />
        <p className="text-sm leading-relaxed text-foreground">
          {currency(STARTING, 0)} left alone became{" "}
          <span className="font-mono font-medium tabular-nums">
            {amountFor(read.full)}
          </span>
          . The same money, out of the market for {days} days out of{" "}
          {read.days}, became{" "}
          <span className="font-mono font-medium tabular-nums">
            {amountFor(missed.multiple)}
          </span>
          . That is {percent(days / read.days, 2)} of the days
          {shareOfGain != null ? (
            <>
              {" "}
              carrying{" "}
              <span className="font-mono font-medium tabular-nums">
                {percent(shareOfGain, 0)}
              </span>{" "}
              of everything the window made
            </>
          ) : null}
          .
        </p>
      </Card>

      {dodged ? (
        <Card tone="default" className="flex flex-col gap-4">
          <MicroLabel>The half nobody prints</MicroLabel>
          <Row
            label={`Out of the market for the worst ${days} days`}
            amount={amountFor(dodged.multiple)}
            rate={annualFromMultiple(dodged.multiple, read.years)}
            width={(dodged.multiple / scale) * 100}
            tone="muted"
          />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Dodging the worst {days} days would have turned the same{" "}
            {currency(STARTING, 0)} into{" "}
            <span className="font-mono font-medium tabular-nums">
              {amountFor(dodged.multiple)}
            </span>
            , so the first figure on its own does not prove that staying put
            always wins.{" "}
            {clustered == null ? null : clustered >= 3 ? (
              <>
                What makes it hard to have one without the other is where the
                days sit. Over this window,{" "}
                <span className="font-mono font-medium tabular-nums">
                  {clustered} of the 10 best days
                </span>{" "}
                landed within two weeks of one of the 10 worst. They are the
                same frightening fortnight seen from both sides, and nobody
                gets to be out for only one half of it.
              </>
            ) : (
              <>
                The usual answer to that is that the best days and the worst
                ones sit in the same few weeks, so nobody dodges one without
                dodging the other. Over this particular window that is weak:{" "}
                <span className="font-mono font-medium tabular-nums">
                  {clustered} of the 10 best days
                </span>{" "}
                landed within two weeks of one of the 10 worst. It is printed
                either way, because a figure that only appears when it agrees
                with the point is not a measurement.
              </>
            )}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function Row({
  label,
  amount,
  rate,
  width,
  tone,
}: {
  label: string;
  amount: string;
  rate: number | null;
  width: number;
  tone: "brand" | "muted";
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <MicroLabel>{label}</MicroLabel>
        <span className="font-mono text-xl font-bold tabular-nums text-foreground sm:text-2xl">
          {amount}
        </span>
      </div>
      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "brand" ? "bg-primary" : "bg-foreground/25"
          )}
          style={{ width: `${barFillPct(width, 1)}%` }}
        />
      </div>
      {rate != null ? (
        <p className="mt-1.5 font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
          {percent(rate, 1)} a year
        </p>
      ) : null}
    </div>
  );
}
