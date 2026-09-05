"use client";

import {
  Card,
  Panel,
  PanelHeader,
  Score,
  Scoreboard,
} from "@/components/ui/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WhyThis } from "@/components/ui/WhyThis";
import { NO_VALUE, cn, currency, percent } from "@/lib/format";
import { fairValueProvenance } from "@/lib/provenance";
import type { FairValueBlend, FairValueMethod, FairValueRead } from "@/lib/company/fair-value";
import { gapSentence } from "@/lib/company/fair-value";
import { Scale } from "lucide-react";
import { useState } from "react";

/**
 * What several different ways of estimating a price add up to, and every
 * one of them shown.
 *
 * The blended figure is the headline because it is what somebody wants,
 * and the working is one press away rather than behind an eye, because
 * this is the number on the page most likely to be acted on. Somebody
 * about to spend money on the strength of an average deserves to see that
 * one of the four methods said half of it, and why.
 *
 * Two things this card must never do. It must not print a word like cheap
 * or expensive: that is a conclusion, and the whole design is that the
 * reader draws it from methods they can argue with. And it must not hide a
 * method that disagreed. A method thrown out of the blend is still listed,
 * greyed, with the reason, because a silently dropped estimate is exactly
 * the kind of quiet adjustment the forecast floor turned out to be.
 */

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
        own line while a short one kept it on the right, so a column of six
        methods had its figures in two different places. The name wraps
        inside its own column instead and the price stays put.
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
        {method.dropped ? (
          <Badge variant="outline" className="text-muted-foreground">
            Left out
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Counts for {percent(method.weight, 0)}
          </Badge>
        )}
        {gap !== null && (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {gap >= 0 ? "+" : ""}
            {percent(gap, 0)} against today
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

/*
  Phrased as "each estimate" rather than "these methods", because the two
  figures above are two separate blends. Written the other way it read as a
  count of everything on the card and sat directly above a button offering
  to show six of them.
*/
const CONFIDENCE_LINE = {
  none: "Not one of these methods could be run on this company, so there is no estimate to give.",
  thin: "Each estimate above rests on a single method rather than a blend, so treat it as one opinion with a decimal point on it.",
  mixed: "Each estimate above rests on two or three methods. Enough to be worth reading, not enough to lean on hard.",
  broad:
    "Each estimate above rests on four or more methods, so it is a genuine blend rather than one calculation dressed up.",
} as const;

/**
 * One blend, as a `Score` cell, so this panel speaks the same visual
 * language as every other figure in the app rather than inventing a
 * two-column layout of its own.
 */
function BlendScore({
  title,
  caption,
  blend,
  code,
  gap,
}: {
  title: string;
  caption: string;
  blend: FairValueBlend;
  code: string;
  gap: number | null;
}) {
  const sentence = gapSentence(gap, blend.price);
  const spread =
    blend.spread !== null && blend.used.length > 1
      ? `The methods behind it sit ${percent(blend.spread, 0)} apart, top to bottom.`
      : null;
  return (
    <Score
      label={title}
      explain={caption}
      value={blend.price === null ? NO_VALUE : currency(blend.price, 2, code)}
      valueClassName={blend.price === null ? "text-muted-foreground" : undefined}
      sub={
        <>
          {sentence && (
            <span className="block text-foreground">{sentence}</span>
          )}
          {spread && <span className="mt-2 block">{spread}</span>}
        </>
      }
    />
  );
}

export function FairValueCard({
  ticker,
  read,
  code,
  at,
  model,
}: {
  ticker: string;
  read: FairValueRead;
  code: string;
  at?: string | null;
  model?: Parameters<typeof fairValueProvenance>[0]["model"];
}) {
  const [open, setOpen] = useState(false);
  const all = [
    ...read.today.used,
    ...read.today.dropped,
    ...read.ahead.used,
    ...read.ahead.dropped,
  ];
  if (all.length === 0) return null;

  const usesModel = [...read.today.used, ...read.ahead.used].some(
    (m) => m.maker === "model"
  );
  const confidence =
    read.today.used.length >= read.ahead.used.length
      ? read.today.confidence
      : read.ahead.confidence;

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            What the arithmetic makes it worth
            <WhyThis
              provenance={fairValueProvenance({
                ticker,
                methodNames: all.map((m) => m.name),
                droppedCount:
                  read.today.dropped.length + read.ahead.dropped.length,
                usesModel,
                model,
                at,
              })}
            />
          </span>
        }
        subtitle="Several ways of estimating one share, run separately and averaged. Each is listed below with the assumption it rests on, because the assumptions are the argument."
        icon={<Scale className="h-4 w-4" />}
      />

      <Scoreboard cols={2} mobileCols={1}>
        <BlendScore
          title="On today's figures"
          caption="What the company's own accounts, as they stand, add up to per share."
          blend={read.today}
          code={code}
          gap={read.gapToday}
        />
        <BlendScore
          title="Looking a year out"
          caption="The same question about next year: the analysts' average, next year's expected profit, and the model's own path."
          blend={read.ahead}
          code={code}
          gap={read.gapAhead}
        />
      </Scoreboard>

      <p className="text-sm leading-relaxed text-muted-foreground">
        {CONFIDENCE_LINE[confidence]} None of it is a price target or anybody
        telling you to buy or sell.
      </p>

      <div className="flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="self-start"
        >
          {open ? "Hide the working" : `Show all ${all.length} methods`}
        </Button>
        {open && (
          <div className="flex flex-col gap-3">
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
