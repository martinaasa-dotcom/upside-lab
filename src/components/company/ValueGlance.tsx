"use client";

import { Card, MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/badge";
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
  impliedGrowth,
  valueGlance,
  type FairValueMethod,
  type FairValueRead,
} from "@/lib/company/fair-value";
import type { CompanyFacts } from "@/lib/company/facts";
import type { ModelRun } from "@/lib/ai/model-label";
import { Gauge } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Valuation: one panel, because it was one subject in two.
 *
 * The figure and the working used to be separate panels stacked on top of
 * each other, `ValueGlance` and `FairValueCard`, and a reader met two
 * headings, two subtitles and two rounds of scaffolding for a single
 * question. They are one panel now, read top to bottom: where the price
 * sits, what that means, the figures around it, then every method with the
 * assumption it rests on.
 *
 * The rules this panel has been taught, each by getting it wrong.
 *
 * **Say the real name of the thing.** It was headed "What you pay, and
 * what it looks worth", with cells called "Is the profit arriving". Nobody
 * speaks like that, and vagueness is not simplicity: a reader who does not
 * know what a price target is learns nothing from a riddle, and one who
 * does has to decode it to find a figure they could have read at a glance.
 *
 * **No method appears whose premise does not hold.** It used to carry a
 * figure that multiplied this year's profit by the market's average
 * multiple. Applied to a company growing earnings at 104% a year that is
 * not a conservative estimate, it is a wrong one, and it printed $223
 * against a share price of $478.
 *
 * **The line is the panel and everything else is a caption on it.** Three
 * tall cards each carrying a figure and a paragraph, then a hairline
 * nobody could see, then three more cards, came to 900px to say one thing.
 *
 * **Nothing here repeats what the reader was just shown.** The strip below
 * the picture carried the share price and the estimate, which are the two
 * marks drawn on the picture. It carries what the picture does not.
 *
 * **A figure with no unit of comparison is not information.** The strip
 * also carried an earnings-per-share ramp, three rising numbers with
 * nothing to say what they were rising from or towards. It is gone: every
 * method's working line already states the earnings it multiplied, with
 * the year attached, which is that figure with the context that makes it
 * mean something.
 *
 * **One legal line for the product, not a hedge per panel.** The subtitle
 * used to end "Upside Lab is not an adviser and will not tell you whether
 * to buy it" and the methods ended "None of it is a price target or
 * anybody telling you to buy or sell". `ADVICE_DISCLAIMER_SHORT` is the
 * product's legal line and it is said once; a second and third hedge
 * bolted onto the panels a reader came for reads as nervousness, and
 * teaches them to skip the sentence that matters. What replaces it is
 * structural and stronger: no output here contains a verdict word, and
 * `value-glance.test.ts` fails on one.
 */

/* ---------------------------------------------------------------------- *
 * The picture
 * ---------------------------------------------------------------------- */

/**
 * Today's price against the band the estimates cover.
 *
 * Deliberately no red-to-green gradient, because that would be the traffic
 * light this panel exists to avoid, and no arrow, because neither
 * direction is being recommended.
 *
 * Both marks are labelled where they stand. The gold mark was a 3px
 * hairline with its figure printed at the far end of the row, so the one
 * thing this panel is for was the least visible thing on it and a reader
 * had to measure across the panel to pair a mark with its number.
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
    const left = Math.min(Math.max(middle - LABEL_GAP / 2, 9), 91 - LABEL_GAP);
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
        were absolutely positioned in the same box as the marks, so the
        gold pill was drawn straight through its own figure.
      */}
      <div className="relative mt-9 h-2">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-foreground/[0.07]"
        />
        <span
          aria-hidden
          className="absolute inset-y-0 rounded-full bg-foreground/25"
          style={{ left: `${at(low)}%`, width: `${at(high) - at(low)}%` }}
        />
        {blend !== null && blendLabel !== null && (
          <>
            <Mark
              left={blendLabel}
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
        The band runs from the lowest estimate below,{" "}
        <span className="font-mono tabular-nums text-foreground">
          {currency(low, 2, code)}
        </span>
        , to the highest,{" "}
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

/* ---------------------------------------------------------------------- *
 * The working
 * ---------------------------------------------------------------------- */

const MAKER_LABEL = {
  market: "Other people's figures",
  arithmetic: "Arithmetic on the accounts",
  model: "A language model",
} as const;

const MAKER_TONE = {
  market: "text-foreground",
  arithmetic: "text-foreground",
  model: "text-primary",
} as const;

/**
 * How far this method landed from today's price, drawn.
 *
 * The figure is already printed beside it, so this is not the information:
 * it is the ordering. Several methods in a column with a percentage in
 * each is a list a reader has to do arithmetic on to see that two agreed
 * and one is an outlier. A bar growing out of a centre line says it at a
 * glance, and the centre line is today's price.
 *
 * Capped at 60%, because one method landing three times the share price
 * would otherwise squash every other bar to nothing.
 */
function GapBar({ gap }: { gap: number }) {
  const width = Math.min(Math.abs(gap) / 0.6, 1) * 50;
  return (
    <span
      aria-hidden
      className="relative hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-foreground/[0.07] sm:block"
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground/25" />
      <span
        className={cn(
          "absolute inset-y-0 rounded-full",
          gap >= 0 ? "left-1/2 bg-gain/70" : "right-1/2 bg-loss/70"
        )}
        style={{ width: `${Math.max(width, 1.5)}%` }}
      />
    </span>
  );
}

/**
 * One method, with what it assumed and the arithmetic it used.
 *
 * Two things this must never do. It must not print a word like cheap or
 * expensive: that is a conclusion, and the whole design is that the reader
 * draws it from methods they can argue with. And it must not hide a method
 * that disagreed. A method thrown out of the blend is still listed,
 * greyed, with the reason, because a silently dropped estimate is exactly
 * the kind of quiet adjustment the forecast floor turned out to be.
 */
function MethodRow({
  method,
  code,
  spot,
}: {
  method: FairValueMethod;
  code: string;
  spot: number | null;
}) {
  const gap = spot && spot > 0 ? (method.price - spot) / spot : null;
  return (
    <Card
      tone="default"
      className={cn("flex flex-col gap-2", method.dropped && "opacity-60")}
    >
      {/*
        Never `flex-wrap` here. A long method name pushed the price onto its
        own line while a short one kept it on the right, so a column of
        methods had its figures in two different places.
      */}
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-sm font-semibold text-foreground">
          {method.name}
        </p>
        <p className="shrink-0 font-mono text-base font-bold tabular-nums text-foreground">
          {currency(method.price, 2, code)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={MAKER_TONE[method.maker]}>
          {MAKER_LABEL[method.maker]}
        </Badge>
        <Badge variant="outline" className="text-muted-foreground">
          {method.dropped ? "Left out" : `Counts for ${percent(method.weight, 0)}`}
        </Badge>
        {gap !== null && !method.dropped && (
          <span className="inline-flex items-center gap-2">
            <GapBar gap={gap} />
            <span
              className={cn(
                "font-mono text-xs tabular-nums",
                gap >= 0 ? "text-gain" : "text-loss"
              )}
            >
              {gap >= 0 ? "+" : ""}
              {percent(gap, 0)} against today
            </span>
          </span>
        )}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        <span className="text-foreground">It assumes: </span>
        {method.assumes}
      </p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        <span className="text-foreground">The working: </span>
        {method.working}
      </p>
      {method.dropped && (
        <p className="text-sm leading-relaxed text-warning">{method.dropped}</p>
      )}
    </Card>
  );
}

const CONFIDENCE_LINE = {
  none: "Not one of these methods could be run on this company, so there is no estimate to give.",
  thin: "The estimate rests on a single method rather than a blend, so treat it as one opinion with a decimal point on it.",
  mixed:
    "The estimate rests on two or three methods. Enough to be worth reading, not enough to lean on hard.",
  broad:
    "The estimate rests on four or more methods, so it is a genuine blend rather than one calculation dressed up.",
} as const;

/* ---------------------------------------------------------------------- *
 * The panel
 * ---------------------------------------------------------------------- */

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
  const usesModel = read.estimate.used.some((m) => m.maker === "model");
  const methodNames = read.estimate.used.map((m) => m.name);
  const all = [...read.estimate.used, ...read.estimate.dropped];
  const tag = cashtag(ticker);

  /*
    Built as a list rather than written out inline, because the column
    count has to divide the cells: `md:grid-cols-3` with two children
    leaves a third of the strip empty, which is the fault
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
        subtitle={`Where ${tag} trades today, what each method below puts it at in twelve months, and the assumption every one of them rests on.`}
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

      {cells.length > 0 && (
        <div
          className={cn(
            "glass-well grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-lg md:divide-y-0",
            cells.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2"
          )}
        >
          {cells}
        </div>
      )}

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

      {/*
        EVERY METHOD IS ON THE PAGE, NOT BEHIND A BUTTON AND NOT IN A PANEL
        OF ITS OWN.

        It was a disclosure, then a second panel with its own heading and
        subtitle, which meant a reader met two rounds of scaffolding for one
        question. The working is not an appendix to the figure: the figure
        is an average, and an average nobody can take apart is exactly the
        unfalsifiable number this room was built to replace.
      */}
      {all.length > 0 && (
        <div className="flex flex-col gap-3">
          <MicroLabel>How the estimate was worked out</MicroLabel>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {CONFIDENCE_LINE[read.estimate.confidence]} The assumptions are
            the argument.
          </p>
          {all.map((m) => (
            <MethodRow
              key={`${m.id}:${m.price}`}
              method={m}
              code={code}
              spot={read.spot}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}
