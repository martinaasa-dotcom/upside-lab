"use client";

import {
  Card,
  InfoTip,
  MicroLabel,
  Panel,
  PanelHeader,
} from "@/components/ui/Panel";
import { WhyThis } from "@/components/ui/WhyThis";
import { cashtag, cn, currency, percent, signedPercent } from "@/lib/format";
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
 * Today's price, and the stretch of the line every method below lands in.
 *
 * Deliberately no red-to-green gradient, because that would be the traffic
 * light this panel exists to avoid, and no arrow, because neither
 * direction is being recommended.
 *
 * THE TWO GREYS HAD TO BE TOLD APART, BECAUSE NOTHING SAID WHICH WAS
 * WHICH.
 *
 * It was a grey bar sitting on a slightly darker grey bar, both the same
 * height and the same shape, with two figures printed at the far left and
 * far right of the row below. A reader could see that one bar was
 * brighter than the other and had no way at all to learn what either one
 * meant: the figures naming the brighter bar's ends were a hand's width
 * from the ends they named, and the caption between them sat under the
 * middle of the panel rather than under the thing it captioned. That is
 * the fault `AGENTS.md` already records twice, once as a label belonging
 * over its own mark and once as a figure pinned to the panel's edge, and
 * it was still here.
 *
 * Two changes, no new words. The scale is a hairline now and the
 * estimates are the only bar on it, so the difference between them is a
 * difference in kind rather than two weights of the same shape: a thin
 * rule reads as the ruler, a thick bar reads as the reading. And the
 * band's own figures moved to underneath its own ends, with its name
 * directly under its middle, so every part of the picture is named where
 * it stands.
 *
 * Both marks are labelled overhead. The gold one was a 3px hairline with
 * its figure printed at the far end of the row, so the one thing this
 * panel is for was the least visible thing on it.
 */
function Ladder({
  low,
  high,
  spot,
  blend,
  gap,
  code,
}: {
  low: number;
  high: number;
  spot: number;
  blend: number | null;
  /** The estimate against today, as a fraction. Printed on the mark. */
  gap: number | null;
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
    exactly where the arithmetic put it. Clamping the mark instead would be
    drawing a price in the wrong place to make a caption fit.
  */
  const clamp = (v: number) => Math.min(Math.max(at(v), 9), 91);
  const pair =
    blend === null
      ? null
      : spread(clamp(spot), clamp(blend), LABEL_GAP);
  const spotLabel = pair ? pair[0] : clamp(spot);
  const blendLabel = pair ? pair[1] : null;
  /*
    The band's own two figures are subject to the same collision, and it
    fires more often: a company whose methods agree closely draws a band a
    few per cent wide with two prices under its ends.
  */
  const [lowLabel, highLabel] = spread(clamp(low), clamp(high), EDGE_GAP);
  /*
    The caption is wider than a price and sits on its own row, so it is
    clamped harder: at the band's own middle it would hang past the panel
    on a phone whenever the estimates land at one end of the scale.
  */
  const bandMiddle = Math.min(Math.max((at(low) + at(high)) / 2, 20), 80);

  return (
    <div className="flex flex-col gap-2">
      {/*
        The labels stand clear above the track rather than inside it. They
        were absolutely positioned in the same box as the marks, so the
        gold pill was drawn straight through its own figure.
      */}
      <div className="relative mt-12 h-2">
        {/*
          The scale is a hairline, and that is what tells a reader it is a
          scale. It used to be a rounded bar of the same height as the
          band on top of it, which made the picture two bars of slightly
          different greys and no way to tell which one was the data.
        */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 rounded-full bg-foreground/[0.12]"
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
              /*
                Not "Estimate". The word was doing nothing the figure and
                the horizon underneath it were not already doing, and it
                read as a hedge stamped over the number.
              */
              name="In 12 months"
              figure={currency(blend, 2, code)}
              /*
                The gap rides on the mark it describes rather than sitting
                in a cell of its own further down. It is the difference
                between the two marks on this very line, so printing it
                anywhere else asks a reader to hold two numbers in their
                head to get a third.

                The percentage alone, without "against today" after it.
                That phrase made the note three times wider than the price
                above it, and a label's width is what decides whether two
                marks can stand near each other: measured on a 342px track
                with the estimate a few per cent from the price, it printed
                straight through the gold mark's own figure. What it is
                against is the only other mark on the line, named in gold a
                few pixels away.
              */
              note={gap === null ? null : signedPercent(gap)}
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
      {/*
        THE BAND IS NAMED WHERE IT STANDS, NOT AT THE EDGES OF THE PANEL.

        Its two figures were printed at the far left and far right of this
        row, so a reader saw a bar stop somewhere in the middle and a
        number a hand's width away, with nothing connecting them, and the
        caption between them sat under the panel's middle rather than
        under the bar's. Every part of it is anchored to the part of the
        picture it belongs to now.
      */}
      <div className="relative h-4 font-mono text-xs tabular-nums text-muted-foreground">
        <Anchored left={lowLabel}>{currency(low, 2, code)}</Anchored>
        <Anchored left={highLabel}>{currency(high, 2, code)}</Anchored>
      </div>
      <div className="relative h-4">
        <Anchored left={bandMiddle}>
          <span className="font-mono text-xs uppercase tracking-[0.06em] text-muted-foreground/80">
            every estimate
          </span>
        </Anchored>
      </div>
    </div>
  );
}

/**
 * How far apart two labels have to stand, as a percentage of the track.
 *
 * Two labels centred on marks that nearly coincide print over each other,
 * which happens exactly when the price and the estimate agree and is
 * therefore not a rare case.
 */
const LABEL_GAP = 30;
/** The band's own two figures are shorter, so they may stand closer. */
const EDGE_GAP = 16;

/**
 * Push two label anchors apart to a readable distance, symmetrically,
 * leaving the marks they belong to exactly where the arithmetic put them.
 */
function spread(a: number, b: number, minGap: number): [number, number] {
  if (Math.abs(a - b) >= minGap) return [a, b];
  const middle = (a + b) / 2;
  const left = Math.min(Math.max(middle - minGap / 2, 9), 91 - minGap);
  const right = left + minGap;
  return a <= b ? [left, right] : [right, left];
}

/** One thing standing under the point on the track it names. */
function Anchored({
  left,
  children,
}: {
  left: number;
  children: React.ReactNode;
}) {
  return (
    <span
      className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
      style={{ left: `${left}%` }}
    >
      {children}
    </span>
  );
}

/** One labelled mark, standing over the point it names. */
function Mark({
  left,
  name,
  figure,
  note,
  className,
}: {
  left: number;
  name: string;
  figure: string;
  note?: string | null;
  className: string;
}) {
  return (
    <span
      className={cn(
        "absolute bottom-full mb-2 flex -translate-x-1/2 flex-col items-center whitespace-nowrap leading-tight",
        className
      )}
      style={{ left: `${left}%` }}
    >
      <span className="font-mono text-xs uppercase tracking-[0.08em]">
        {name}
      </span>
      <span className="font-mono text-sm font-bold tabular-nums">{figure}</span>
      {note && (
        <span className="font-mono text-xs tabular-nums opacity-80">{note}</span>
      )}
    </span>
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
      className={cn("flex flex-col gap-3 p-5", method.dropped && "opacity-60")}
    >
      {/*
        Never `flex-wrap` here. A long method name pushed the price onto its
        own line while a short one kept it on the right, so a column of
        methods had its figures in two different places.
      */}
      <div className="flex items-baseline justify-between gap-3">
        <p className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
          {method.name}
          <InfoTip
            text={method.working}
            label={`How ${method.name} was worked out`}
          />
        </p>
        <p className="shrink-0 font-mono text-base font-bold tabular-nums text-foreground">
          {currency(method.price, 2, code)}
        </p>
      </div>
      {/*
        One muted line rather than two outlined badges. Where a figure came
        from and how much it counts for are facts about the row, not two
        separate objects to draw a box around, and three boxes plus a bar
        plus a percentage on one line is what a reader called cluttered.
      */}
      {/*
        Sentence case, not the label tier. Uppercase mono is the voice of a
        short fixed label; a whole line of varying content set in it shouts,
        and this line is scaffolding rather than the point of the card.
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
        <span className={MAKER_TONE[method.maker]}>
          {MAKER_LABEL[method.maker]}
        </span>
        <span aria-hidden>&middot;</span>
        <span>
          {method.dropped ? "Left out" : `Counts for ${percent(method.weight, 0)}`}
        </span>
        {gap !== null && !method.dropped && (
          <span className="inline-flex items-center gap-2">
            <GapBar gap={gap} />
            <span
              className={cn(
                "font-mono tabular-nums",
                gap >= 0 ? "text-gain" : "text-loss"
              )}
            >
              {gap >= 0 ? "+" : ""}
              {percent(gap, 0)} against today
            </span>
          </span>
        )}
      </div>
      {/*
        THE ASSUMPTION STAYS ON THE PAGE. THE ARITHMETIC MOVES ONE PRESS
        AWAY, AND THAT IS NOT THE SAME AS HIDING A METHOD.

        Every method is still listed with its name, its price, its weight,
        its distance from today and the assumption it rests on, which is
        the part a reader argues with. The working is the line that names
        the inputs, and three of those stacked under three assumptions is
        six paragraphs in a panel somebody opened to see one number. It
        goes behind the same circled i the rest of the product uses for
        "tell me more", beside the name it belongs to.
      */}
      <p className="text-sm leading-relaxed text-muted-foreground">
        {method.assumes}
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
  mixed: "",
  broad: "",
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

      {/*
        ONE CHILD, SO THIS PANEL SETS ITS OWN VERTICAL RHYTHM.

        `Panel` spaces its direct children at `gap-5 sm:gap-6`, which is
        right for a panel of short blocks and far too tight for this one:
        four sections of prose stacked at 24px read as one wall, and a rule
        in `AGENTS.md` forbids a direct child adding its own `mt-*`, because
        it would then get both. Wrapping the body in a single child moves
        the decision here, where the content is, and every section below
        breathes at `gap-10`.
      */}
      <div className="flex flex-col gap-10 sm:gap-12">
      {glance.low !== null && glance.high !== null && read.spot !== null ? (
        <Ladder
          low={glance.low}
          high={glance.high}
          spot={read.spot}
          blend={read.estimate.price}
          gap={read.gap}
          code={code}
        />
      ) : null}

      <div className="flex flex-col gap-3">
        {/*
          THE ESTIMATE IS A MARK ON THE PICTURE, NOT A FIGURE REPEATED
          UNDER IT.

          It was pulled off the band and printed here as a row of its own,
          on the argument that the picture answers one question and a
          second mark competes with it for the same forty pixels. Read for
          real, what that cost was the one comparison the panel exists to
          draw: where the estimate stands against today is a distance
          along a line, and turning it back into two numbers in two places
          asks the reader to do in their head what the picture was already
          doing for them. It is back on the band, its label has stopped
          saying "estimate" over the top of it, and there is more room
          above the track for both marks to stand in. What does not happen
          is printing the same figure twice, so this row is gone.
        */}
        <p className="text-base font-semibold leading-relaxed text-foreground">
          {glance.read}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {glance.nextQuestion}
        </p>
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
        <div className="flex flex-col gap-5">
          {/*
            The confidence line is only printed when it says something the
            cards below do not. A reader can count three methods; being
            told there are three is a sentence spent on nothing. One
            method, or none, is the case worth naming out loud.
          */}
          <MicroLabel>How the estimate was worked out</MicroLabel>
          {CONFIDENCE_LINE[read.estimate.confidence] && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {CONFIDENCE_LINE[read.estimate.confidence]}
            </p>
          )}
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
      </div>
    </Panel>
  );
}
