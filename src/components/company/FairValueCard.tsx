"use client";

import { Card, Panel, PanelHeader } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WhyThis } from "@/components/ui/WhyThis";
import { cn, currency, percent } from "@/lib/format";
import { fairValueProvenance } from "@/lib/provenance";
import type {
  FairValueMethod,
  FairValueRead,
} from "@/lib/company/fair-value";
import { Scale } from "lucide-react";
import { useState } from "react";

/**
 * Every method behind the estimate at the top of the page, with what each
 * one assumed and the arithmetic it used.
 *
 * The figure itself lives in `ValueGlance`, because that is what somebody
 * came for; this is the working, one press away rather than behind the
 * mark, because it is the number on the page most likely to be acted on.
 * Somebody
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
  const all = [...read.estimate.used, ...read.estimate.dropped];
  if (all.length === 0) return null;

  const usesModel = read.estimate.used.some((m) => m.maker === "model");
  const confidence = read.estimate.confidence;

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            How the estimate was worked out
            <WhyThis
              provenance={fairValueProvenance({
                ticker,
                methodNames: all.map((m) => m.name),
                droppedCount: read.estimate.dropped.length,
                usesModel,
                model,
                at,
              })}
            />
          </span>
        }
        subtitle="Every method behind the figures at the top of the page, run separately, with the assumption each rests on and the arithmetic it used. The assumptions are the argument."
        icon={<Scale className="h-4 w-4" />}
      />

      <p className="text-sm leading-relaxed text-muted-foreground">
        {CONFIDENCE_LINE[confidence]} None of it is a price target or
        anybody telling you to buy or sell.
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
