"use client";

import { Card, Panel, PanelHeader } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/badge";
import { WhyThis } from "@/components/ui/WhyThis";
import { cn, currency, percent } from "@/lib/format";
import { fairValueProvenance } from "@/lib/provenance";
import type {
  FairValueMethod,
  FairValueRead,
} from "@/lib/company/fair-value";
import { Scale } from "lucide-react";

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

/**
 * How far this method landed from today's price, drawn.
 *
 * The figure is already printed beside it, so this is not the information:
 * it is the ordering. Six methods in a column with six percentages in them
 * is a list a reader has to do arithmetic on to see that four agreed and
 * two are outliers. A bar growing right from a centre line says it at a
 * glance, and the centre line is today's price, which is the only reference
 * on this card that means anything.
 *
 * Capped at 60%, because one method landing three times the share price
 * would otherwise squash every other bar to nothing and the card would stop
 * comparing anything.
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

      {/*
        EVERY METHOD IS ON THE PAGE, NOT BEHIND A BUTTON.

        It was a disclosure that opened them, which is the ordinary way to
        keep a panel short and is the wrong way here. The working is the
        reason this card exists: the figure at the top of the page is an
        average, and an average nobody can take apart is exactly the
        unfalsifiable number this room was built to replace. A reader who
        has to press something to find out that one method said half of
        another has, in practice, not been told.
      */}
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
    </Panel>
  );
}
