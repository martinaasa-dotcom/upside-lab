"use client";

import { MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import { WhyThis } from "@/components/ui/WhyThis";
import {
  NO_VALUE,
  cashtag,
  cn,
  currency,
  percent,
  signedPercent,
} from "@/lib/format";
import { fairValueProvenance } from "@/lib/provenance";
import {
  earningsRamp,
  impliedGrowth,
  valueGlance,
  type FairValueRead,
} from "@/lib/company/fair-value";
import type { CompanyFacts } from "@/lib/company/facts";
import type { ModelRun } from "@/lib/ai/model-label";
import { Gauge } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Valuation, at the top of the page, in the words a person would use.
 *
 * Three rules, and all three were learned by getting them wrong.
 *
 * **Say the real name of the thing.** This panel was headed "What you pay,
 * and what it looks worth", with cells called "Is the profit arriving" and
 * "What the price is assuming". Nobody speaks like that. Vagueness is not
 * the same as simplicity: a reader who does not know what a price target
 * is learns nothing from a riddle, and a reader who does has to decode one
 * to find a figure they could have read at a glance.
 *
 * **No method appears whose premise does not hold.** The panel used to
 * carry a second figure, "on today's earnings", which multiplied this
 * year's profit by the market's average multiple. Applied to a company
 * growing earnings at 104% a year that is not a conservative estimate, it
 * is a wrong one, and it printed $223 against a share price of $478.
 *
 * **The line is the panel, and everything else is a caption on it.** This
 * was three tall cards each carrying a figure and a paragraph, then a
 * hairline nobody could see, then three more cards. Nine hundred pixels to
 * say one thing. The whole content of this panel is where one price sits
 * against a band of estimates, which is a picture, so the picture is the
 * hero at full size and every figure around it is one line at most. Two
 * cards went entirely: the analyst target range, whose spread is a fact
 * about analysts rather than about the company and which already has a
 * line inside the method that uses it, and earnings per share, which is
 * the input to every method below rather than a reading in its own right
 * and now sits as one line under the picture.
 */

/**
 * The picture: today's price against the band the estimates cover.
 *
 * Deliberately no red-to-green gradient, because that would be the traffic
 * light this panel exists to avoid, and no arrow, because neither
 * direction is being recommended.
 *
 * **Both marks are labelled where they stand, and that is the fix for a
 * real complaint.** The gold mark was a 3px hairline on a 1,800px track
 * with its figure printed at the far end of the row, so the one thing this
 * panel is for was the least visible thing on it and the reader had to
 * measure across the panel to pair a mark with its number. Each mark now
 * carries its own name and figure directly above it, the price is a
 * ringed gold pill rather than a line, and the blend is marked too, since
 * "where the price sits against the estimate" needs both ends of the
 * comparison drawn.
 */
function Ladder({
  low,
  high,
  spot,
  blend,
  code,
}: {
  low: number;
  high: number;
  spot: number;
  blend: number | null;
  code: string;
}) {
  const values = [low, high, spot, ...(blend === null ? [] : [blend])];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.18 || Math.max(max * 0.06, 1);
  const from = min - pad;
  const span = max + pad - from || 1;
  const at = (v: number) => ((v - from) / span) * 100;
  /*
    A label is centred on its mark and would hang off the panel at either
    end, so its own anchor is clamped while the mark it belongs to stays
    exactly where the arithmetic put it. Clamping the mark instead would
    be drawing a price in the wrong place to make a caption fit.
  */
  const clamp = (v: number) => Math.min(Math.max(at(v), 9), 91);
  /*
    Two labels centred on marks that nearly coincide would print over each
    other, which happens exactly when the price and the estimate agree and
    is therefore not a rare case. They are pushed apart to a readable
    distance while the marks themselves stay put.
  */
  const LABEL_GAP = 26;
  let spotLabel = clamp(spot);
  let blendLabel = blend === null ? null : clamp(blend);
  if (blendLabel !== null && Math.abs(spotLabel - blendLabel) < LABEL_GAP) {
    const middle = (spotLabel + blendLabel) / 2;
    const half = LABEL_GAP / 2;
    const left = Math.min(Math.max(middle - half, 9), 91 - LABEL_GAP);
    const right = left + LABEL_GAP;
    if (spotLabel <= blendLabel) {
      spotLabel = left;
      blendLabel = right;
    } else {
      blendLabel = left;
      spotLabel = right;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/*
        The labels stand clear above the track rather than inside it. They
        were absolutely positioned in the same box as the marks, so the gold
        pill was drawn straight through its own figure and the one thing
        this panel is for was the least readable thing on it.
      */}
      <div className="relative mt-9 h-2">
        <span
          aria-hidden
          className="absolute inset-x-0 inset-y-0 rounded-full bg-foreground/[0.07]"
        />
        <span
          aria-hidden
          className="absolute inset-y-0 rounded-full bg-foreground/25"
          style={{ left: `${at(low)}%`, width: `${at(high) - at(low)}%` }}
        />
        {blend !== null && (
          <>
            <Mark
              left={blendLabel ?? clamp(blend)}
              name="Estimate"
              figure={currency(blend, 2, code)}
              className="text-muted-foreground"
            />
            <span
              aria-hidden
              className="absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
              style={{ left: `${at(blend)}%` }}
            />
          </>
        )}
        <Mark
          left={spotLabel}
          name="Today"
          figure={currency(spot, 2, code)}
          className="text-primary"
        />
        <span
          aria-hidden
          className="absolute top-1/2 h-5 w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-4 ring-primary/20"
          style={{ left: `${at(spot)}%` }}
        />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        The band is every estimate on this page, running{" "}
        <span className="font-mono tabular-nums text-foreground">
          {currency(low, 2, code)}
        </span>{" "}
        to{" "}
        <span className="font-mono tabular-nums text-foreground">
          {currency(high, 2, code)}
        </span>
        . The gold mark is today.
      </p>
    </div>
  );
}

/** One labelled mark, standing over the point it names. */
function Mark({
  left,
  name,
  figure,
  className,
}: {
  left: number;
  name: string;
  figure: string;
  className: string;
}) {
  return (
    <span
      className={cn(
        "absolute bottom-full mb-2 flex -translate-x-1/2 flex-col items-center leading-tight",
        className
      )}
      style={{ left: `${left}%` }}
    >
      <span className="font-mono text-xs uppercase tracking-[0.08em]">
        {name}
      </span>
      <span className="font-mono text-sm font-bold tabular-nums">{figure}</span>
    </span>
  );
}

/** One figure and its name, on one line, divided from the next by a rule. */
function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "warn";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-4 py-3">
      <MicroLabel>{label}</MicroLabel>
      <p
        className={cn(
          "min-w-0 font-mono text-base font-bold tabular-nums break-words",
          tone === "warn" ? "text-warning" : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function ValueGlance({
  ticker,
  facts,
  read,
  code,
  at,
  model,
}: {
  ticker: string;
  facts: CompanyFacts;
  read: FairValueRead;
  code: string;
  at?: string | null;
  model?: ModelRun | null;
}) {
  const glance = valueGlance(read);
  const implied = impliedGrowth(facts);
  const ramp = earningsRamp(facts);
  const usesModel = read.estimate.used.some((m) => m.maker === "model");
  const methodNames = read.estimate.used.map((m) => m.name);
  const tag = cashtag(ticker);

  /*
    Built as a list rather than written out inline, because the column
    count has to divide the cells: a `md:grid-cols-4` with three children
    leaves a quarter of the strip empty, which is the same fault
    `filledCardColumns` exists to prevent on a `Scoreboard`.
  */
  const cells = [
    <Stat
      key="gap"
      label="Difference"
      /*
        Deliberately not a gain or loss colour. That pairing is for figures
        where up is good and down is bad, which a profit is and this is
        not: a gap between an estimate and a price says the estimate is
        higher, not that the company is a good one.
      */
      value={read.gap === null ? NO_VALUE : signedPercent(read.gap)}
    />,
    implied ? (
      <Stat
        key="implied"
        label="Growth the price needs"
        value={`${percent(implied.rate, 0)} a year`}
        tone={
          implied.marketRate !== null && implied.rate > implied.marketRate * 2
            ? "warn"
            : undefined
        }
      />
    ) : null,
    facts.fiftyTwoWeekLow !== null && facts.fiftyTwoWeekHigh !== null ? (
      <Stat
        key="range"
        label="52 week range"
        value={
          <span className="text-sm">
            {currency(facts.fiftyTwoWeekLow, 2, code)} to{" "}
            {currency(facts.fiftyTwoWeekHigh, 2, code)}
          </span>
        }
      />
    ) : null,
    ramp ? (
      <Stat
        key="eps"
        label="Earnings per share"
        value={
          <span className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
            {ramp.steps.map((step, i) => (
              <span key={step.label} className="flex items-baseline gap-1.5">
                {i > 0 && (
                  <span aria-hidden className="text-muted-foreground">
                    &rarr;
                  </span>
                )}
                <span>{currency(step.eps, 2, code)}</span>
              </span>
            ))}
          </span>
        }
        tone={ramp.total !== null && ramp.total < 0 ? "warn" : undefined}
      />
    ) : null,
  ].filter(Boolean);

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            Valuation
            {methodNames.length > 0 && (
              <WhyThis
                provenance={fairValueProvenance({
                  ticker,
                  methodNames,
                  droppedCount: read.estimate.dropped.length,
                  usesModel,
                  model,
                  at,
                })}
              />
            )}
          </span>
        }
        subtitle={`Where ${tag} trades today against every estimate on this page, twelve months out. Upside Lab is not an adviser and will not tell you whether to buy it.`}
        icon={<Gauge className="h-4 w-4" />}
      />

      {glance.low !== null && glance.high !== null && read.spot !== null ? (
        <Ladder
          low={glance.low}
          high={glance.high}
          spot={read.spot}
          blend={read.estimate.price}
          code={code}
        />
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-base font-semibold leading-relaxed text-foreground">
          {glance.read}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {glance.nextQuestion}
        </p>
      </div>

      {/*
        THE FIGURES, ON ONE ROW, EACH ONE LINE.

        These used to be three cards of a figure and a paragraph and then
        three more below them. Every sentence in those paragraphs is said
        better somewhere else on the page: the method card carries how the
        estimate was reached, the readings panel carries what a multiple
        means, and the sentence above this row says where the price sits.
        What is left is what a professional actually scans, which is four
        numbers, and they cost four lines rather than nine hundred pixels.
      */}
      {/*
        THE STRIP CARRIES WHAT THE PICTURE DOES NOT.

        It held the share price and the estimate, which are the two marks
        drawn on the line directly above it, so a third of this panel was
        printing numbers a reader had just been shown. Every cell here is
        now a fact that appears nowhere else above: the gap as a figure, the
        bet the price is making, the year the shares have had, and the
        earnings line every method below is a multiple of.
      */}
      <div
        className={cn(
          "glass-well grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-lg md:divide-y-0",
          cells.length >= 4 ? "md:grid-cols-4" : "md:grid-cols-3"
        )}
      >
        {cells}
      </div>

      {implied ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Earnings per share have to compound at {percent(implied.rate, 0)} a
          year for {implied.years} years, from what analysts expect{" "}
          {implied.basis}, before today&apos;s price sits at the market&apos;s
          ordinary multiple
          {implied.marketRate !== null
            ? `, against ${percent(implied.marketRate, 0)} a year expected of the S&P 500`
            : ""}
          . That is the bet, in one number.
        </p>
      ) : null}
    </Panel>
  );
}
