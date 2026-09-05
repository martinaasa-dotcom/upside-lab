"use client";

import {
  MicroLabel,
  Panel,
  PanelHeader,
  Score,
  Scoreboard,
} from "@/components/ui/Panel";
import { WhyThis } from "@/components/ui/WhyThis";
import { NO_VALUE, cashtag, cn, currency, percent, signedPercent } from "@/lib/format";
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

/**
 * The answer at the top of the page: what it costs, what the arithmetic
 * says it is worth, and where estimates put it in a year.
 *
 * This is the block somebody came for, and the whole difficulty is that
 * the question they are asking is one this app may not answer. Upside Lab
 * is not an adviser. It may not tell anybody to buy or sell, and a page
 * that did would be both illegal and wrong, because the right answer
 * depends on things it cannot see: how long they are holding for, what
 * else they own, what they need the money for.
 *
 * What it may do, and what is genuinely more useful, is **state where
 * today's price sits among the estimates it has just shown, and hand back
 * the question that actually decides it**. "Above every estimate on this
 * page, the highest of which is $618" is checkable against the six methods
 * listed below, and tells the reader exactly what they would be betting
 * on. "Buy" tells them nothing and is wrong for anybody whose holding
 * period differs from whoever wrote it.
 *
 * So: no verdict word anywhere, no rating, no score out of ten, and no
 * colour that reads as a traffic light. The ladder is the design that
 * makes this work at a glance, because position on a scale is a fact
 * rather than a judgement, and a reader draws their own conclusion from it
 * in about a second.
 */

/**
 * Where the price sits between the lowest and highest estimate, drawn as
 * one line with the price marked on it.
 *
 * Deliberately plain: a track, a filled span for the range the estimates
 * cover, and a marker for today. No red-to-green gradient, because a
 * gradient would be the traffic light this block exists to avoid, and no
 * arrow, because the whole point is that neither direction is being
 * recommended.
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
  // The axis has to hold every mark, so it runs from the lowest thing on
  // it to the highest, whichever of the three that is, with a tenth of the
  // span as breathing room so a mark at an end is not half off the track.
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
        <span className="text-primary">
          Today {currency(spot, 2, code)}
        </span>
        <span>{currency(high, 2, code)}</span>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        The grey band is every estimate on this page, lowest to highest. The
        gold mark is what it costs today.
      </p>
    </div>
  );
}

/**
 * One of the three facts a professional reads before deciding whether the
 * rest of the page is worth their time. A heading, one figure, one line.
 */
function KeyFact({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: React.ReactNode;
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
  const usesModel = [...read.today.used, ...read.ahead.used].some(
    (m) => m.maker === "model"
  );
  const methodNames = [...read.today.used, ...read.ahead.used].map((m) => m.name);
  const tag = cashtag(ticker);

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            What you pay, and what it looks worth
            {methodNames.length > 0 && (
              <WhyThis
                provenance={fairValueProvenance({
                  ticker,
                  methodNames,
                  droppedCount:
                    read.today.dropped.length + read.ahead.dropped.length,
                  usesModel,
                  model,
                  at,
                })}
              />
            )}
          </span>
        }
        subtitle={`Three numbers, side by side. Upside Lab cannot tell you whether to buy ${tag} and does not try to. It can tell you where the price sits against every estimate below, which is the part you can check.`}
        icon={<Gauge className="h-4 w-4" />}
      />

      <Scoreboard cols={3} mobileCols={1}>
        <Score
          label="Price today"
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
                  It has traded between{" "}
                  {currency(facts.fiftyTwoWeekLow, 2, code)} and{" "}
                  {currency(facts.fiftyTwoWeekHigh, 2, code)} over the last
                  year.
                </span>
              ) : (
                <span className="mt-2 block">
                  The last price the feed had for it.
                </span>
              )}
            </>
          }
        />
        <Score
          label="On today's earnings"
          value={
            read.today.price === null
              ? NO_VALUE
              : currency(read.today.price, 2, code)
          }
          valueClassName={read.today.price === null ? "text-muted-foreground" : undefined}
          sub={
            read.gapToday === null
              ? "Not enough in the feed to work this one out."
              : `${read.gapToday > 0 ? "The price is" : "The price is"} ${percent(Math.abs(read.gapToday), 0)} ${read.gapToday > 0 ? "above" : "below"} this. It is what the company is worth on the profit it makes now, at the multiple the market ordinarily pays.`
          }
        />
        <Score
          label="Estimates a year out"
          value={
            read.ahead.price === null
              ? NO_VALUE
              : currency(read.ahead.price, 2, code)
          }
          valueClassName={read.ahead.price === null ? "text-muted-foreground" : undefined}
          sub={
            read.gapAhead === null
              ? "Not enough in the feed to work this one out."
              : `${signedPercent(read.gapAhead)} against today. The analysts' twelve-month average, next year's expected profit, and the model's own path, blended.`
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

      {/*
        The read and the question, in the reading order somebody actually
        uses: what the numbers say, then what that means they would be
        betting on. Never an instruction, and never a word like cheap.
      */}
      <div className="flex flex-col gap-2">
        <p className={cn("text-base font-semibold leading-relaxed text-foreground")}>
          {glance.read}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {glance.nextQuestion}
        </p>
      </div>

      {/*
        THE THREE THINGS A PROFESSIONAL READS FIRST.

        Everything else on this page is a comment on these. What the price
        is assuming, how much the people who cover it disagree, and whether
        the profit is actually arriving. Each is one figure and one line,
        each is arithmetic on the feed's own numbers, and none of them is a
        recommendation.

        The spread is the one almost nobody publishes. Every site prints
        the average target and hardly any print the range, which is the
        part that says what kind of situation this is: forty analysts
        clustered together is a consensus and the average means something,
        forty analysts spread from half the price to double it is an
        argument whose midpoint describes nobody's actual view.
      */}
      {(implied || spread || ramp) && (
        <div className="grid gap-3 md:grid-cols-3">
          {implied && (
            <KeyFact
              label="What the price is assuming"
              value={`${percent(implied.rate, 0)} a year`}
              detail={`Profit per share has to compound at that rate for ${implied.years} years, from what analysts expect ${implied.basis}, for today's price to look ordinary${implied.marketRate !== null ? `. The market as a whole is expected to manage ${percent(implied.marketRate, 0)}` : ""}. That is the bet, in one number.`}
              tone={
                implied.marketRate !== null && implied.rate > implied.marketRate * 2
                  ? "warn"
                  : undefined
              }
            />
          )}
          {spread && (
            <KeyFact
              label="How much they disagree"
              value={`${currency(spread.low, 0, code)} to ${currency(spread.high, 0, code)}`}
              detail={`${spread.count > 0 ? `${spread.count} analysts publish a twelve-month target` : "The published targets"}, and the gap between the most and least optimistic is ${spread.width !== null ? `${percent(spread.width, 0)} of today's price` : "wide"}.${spread.contested ? " That is wider than the share price itself, so the average above is the midpoint of a real argument rather than a settled view." : " Close enough together that the average is a fair summary of what they think."}`}
              tone={spread.contested ? "warn" : undefined}
            />
          )}
          {ramp && (
            <KeyFact
              label="Is the profit arriving"
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
              detail={`Profit per share ${ramp.steps.map((s) => s.label.toLowerCase()).join(", then ")}${ramp.total !== null ? `, which is ${signedPercent(ramp.total)} across that stretch` : ""}. Everything else on this page is a comment on this line.`}
              tone={ramp.total !== null && ramp.total < 0 ? "warn" : undefined}
            />
          )}
        </div>
      )}

    </Panel>
  );
}
