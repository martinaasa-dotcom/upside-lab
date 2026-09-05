"use client";

import {
  MicroLabel,
  Panel,
  PanelHeader,
  Score,
  Scoreboard,
} from "@/components/ui/Panel";
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
  analystSpread,
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
 * Two rules, and both were learned by getting them wrong.
 *
 * **Say the real name of the thing.** This panel was headed "What you pay,
 * and what it looks worth", with cells called "Is the profit arriving" and
 * "What the price is assuming". Nobody speaks like that. Vagueness is not
 * the same as simplicity: a reader who does not know what a price target
 * is learns nothing from a riddle, and a reader who does has to decode one
 * to find a figure they could have read at a glance. Every heading here is
 * now the ordinary financial name for what is underneath it, with a plain
 * sentence doing the explaining.
 *
 * **No method appears whose premise does not hold.** The panel used to
 * carry a second figure, "on today's earnings", which multiplied this
 * year's profit by the market's average multiple. Applied to a company
 * growing earnings at 104% a year that is not a conservative estimate, it
 * is a wrong one, and it printed $223 against a share price of $478. A
 * page carrying a figure like that does not read as careful. It reads as
 * fabricated, and it costs every honest number beside it.
 *
 * What is left is one estimate, twelve months out, from methods that are
 * all forward by construction, plus the three things a professional reads
 * before deciding whether the rest of the page is worth their time. None
 * of it is a recommendation: Upside Lab is not an adviser, so it states
 * where the price sits against the estimates and hands back the question
 * that decides it.
 */

/** One of the three facts read first. A heading, one figure, one line. */
function KeyFact({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  tone?: "warn";
}) {
  return (
    <div className="glass-well flex min-w-0 flex-col rounded-lg p-4">
      <MicroLabel>{label}</MicroLabel>
      <p
        className={cn(
          "mt-2 font-mono text-lg font-bold leading-tight tabular-nums",
          tone === "warn" ? "text-warning" : "text-foreground"
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

/**
 * Where the price sits between the lowest and highest estimate, drawn as
 * one line with the price marked on it.
 *
 * Deliberately plain: a track, a filled span for the range the estimates
 * cover, and a marker for today. No red-to-green gradient, because that
 * would be the traffic light this panel exists to avoid, and no arrow,
 * because neither direction is being recommended.
 */
function Ladder({
  low,
  high,
  spot,
  code,
}: {
  low: number;
  high: number;
  spot: number;
  code: string;
}) {
  const min = Math.min(low, high, spot);
  const max = Math.max(low, high, spot);
  const pad = (max - min) * 0.12 || Math.max(max * 0.05, 1);
  const from = min - pad;
  const span = max + pad - from || 1;
  const at = (v: number) => ((v - from) / span) * 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-8">
        <span
          aria-hidden
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border"
        />
        <span
          aria-hidden
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/15"
          style={{ left: `${at(low)}%`, width: `${at(high) - at(low)}%` }}
        />
        {[low, high].map((v, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground/35"
            style={{ left: `${at(v)}%` }}
          />
        ))}
        <span
          aria-hidden
          className="absolute top-1/2 h-5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
          style={{ left: `${at(spot)}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between font-mono text-xs tabular-nums text-muted-foreground">
        <span>{currency(low, 2, code)}</span>
        <span className="text-primary">Today {currency(spot, 2, code)}</span>
        <span>{currency(high, 2, code)}</span>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        The grey band is every estimate on this page, lowest to highest. The
        gold mark is the share price today.
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
  const spread = analystSpread(facts);
  const ramp = earningsRamp(facts);
  const usesModel = read.estimate.used.some((m) => m.maker === "model");
  const methodNames = read.estimate.used.map((m) => m.name);
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
        subtitle={`What ${tag} costs today, and what the estimates put it at in twelve months. Upside Lab is not an adviser and will not tell you whether to buy it. It will tell you where the price sits against every estimate below, which is the part you can check.`}
        icon={<Gauge className="h-4 w-4" />}
      />

      <Scoreboard cols={3} mobileCols={1}>
        <Score
          label="Share price"
          value={currency(read.spot, 2, code)}
          sub={
            <>
              {facts.changePercent !== null && (
                <span className="block">
                  {signedPercent(facts.changePercent)} since yesterday&apos;s
                  close.
                </span>
              )}
              {facts.fiftyTwoWeekLow !== null &&
              facts.fiftyTwoWeekHigh !== null ? (
                <span className="mt-2 block">
                  Its range over the last year was{" "}
                  {currency(facts.fiftyTwoWeekLow, 2, code)} to{" "}
                  {currency(facts.fiftyTwoWeekHigh, 2, code)}.
                </span>
              ) : null}
            </>
          }
        />
        <Score
          label="12 month estimate"
          value={
            read.estimate.price === null
              ? NO_VALUE
              : currency(read.estimate.price, 2, code)
          }
          valueClassName={
            read.estimate.price === null ? "text-muted-foreground" : undefined
          }
          sub={
            read.estimate.price === null
              ? "Not enough in the feed to estimate this one."
              /*
                Deliberately not a list of the method names. They are card
                titles, and read as a sentence mid-paragraph they turn into
                "A blend of 3 methods: What Wall Street expects, Priced for
                the growth it is showing, What the model reasoned", which
                is three headings pretending to be prose. The card below
                carries each one properly, one press away.
              */
              : `${methodNames.length === 1 ? "One method, because only one could be run on this company" : `A blend of ${methodNames.length} methods`}. Each is listed further down with the assumption it rests on and the arithmetic it used.`
          }
        />
        <Score
          label="Difference"
          value={read.gap === null ? NO_VALUE : signedPercent(read.gap)}
          /*
            Deliberately not `signedTone`. That colour is for figures where
            up is good and down is bad, which a P&L is and this is not: a
            gap between an estimate and a price says the estimate is higher,
            not that the company is a good one. Painting it green would be
            the traffic light the rest of this panel is built to avoid.
          */
          valueClassName={
            read.gap === null ? "text-muted-foreground" : "text-foreground"
          }
          sub={
            read.gap === null
              ? "There is nothing to compare the price against."
              : `The estimate is ${percent(Math.abs(read.gap), 0)} ${read.gap > 0 ? "above" : "below"} the share price. That gap is the whole of what these methods are saying, and it is only as good as the assumptions behind them.`
          }
        />
      </Scoreboard>

      {glance.low !== null && glance.high !== null && read.spot !== null && (
        <Ladder
          low={glance.low}
          high={glance.high}
          spot={read.spot}
          code={code}
        />
      )}

      <div className="flex flex-col gap-2">
        <p className="text-base font-semibold leading-relaxed text-foreground">
          {glance.read}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {glance.nextQuestion}
        </p>
      </div>

      {/*
        THE THREE THINGS A PROFESSIONAL READS FIRST, EACH UNDER ITS REAL NAME.

        Everything else on the page is a comment on these. The headings
        were "What the price is assuming", "How much they disagree" and "Is
        the profit arriving", which are riddles: the reader who does not
        know the term learns nothing from them, and the reader who does has
        to decode one to find a figure they could have read at a glance.
      */}
      {(implied || spread || ramp) && (
        <div className="grid gap-3 md:grid-cols-3">
          {implied && (
            <KeyFact
              label="Growth needed to justify the price"
              value={`${percent(implied.rate, 0)} a year`}
              detail={`Earnings per share have to compound at that rate for ${implied.years} years, from what analysts expect ${implied.basis}, before today's price sits at the market's ordinary multiple${implied.marketRate !== null ? `. The S&P 500 as a whole is expected to manage ${percent(implied.marketRate, 0)} a year` : ""}. That is the bet, in one number.`}
              tone={
                implied.marketRate !== null &&
                implied.rate > implied.marketRate * 2
                  ? "warn"
                  : undefined
              }
            />
          )}
          {spread && (
            <KeyFact
              label="Analyst target range"
              value={`${currency(spread.low, 0, code)} to ${currency(spread.high, 0, code)}`}
              detail={`${spread.count > 0 ? `${spread.count} analysts publish a twelve-month price target` : "The published price targets"}, and the gap between the highest and lowest is ${spread.width !== null ? `${percent(spread.width, 0)} of the share price` : "wide"}.${spread.contested ? " That is wider than the share price itself, so the average is the midpoint of a real argument rather than a settled view." : " Close enough together that the average is a fair summary of what they think."}`}
              tone={spread.contested ? "warn" : undefined}
            />
          )}
          {ramp && (
            <KeyFact
              label="Earnings per share"
              value={
                <span className="flex flex-wrap items-baseline gap-x-2">
                  {ramp.steps.map((step, i) => (
                    <span key={step.label} className="flex items-baseline gap-2">
                      {i > 0 && (
                        <span aria-hidden className="text-muted-foreground">
                          →
                        </span>
                      )}
                      <span>{currency(step.eps, 2, code)}</span>
                    </span>
                  ))}
                </span>
              }
              detail={`What the company earns on each share: ${ramp.steps.map((s) => s.label.toLowerCase()).join(", then ")}${ramp.total !== null ? `, which is ${signedPercent(ramp.total)} across that stretch` : ""}. Every valuation on this page is a multiple of this line.`}
              tone={ramp.total !== null && ramp.total < 0 ? "warn" : undefined}
            />
          )}
        </div>
      )}
    </Panel>
  );
}
