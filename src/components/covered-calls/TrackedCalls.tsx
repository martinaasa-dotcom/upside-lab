"use client";

import { TickerSymbol } from "@/components/TickerSymbol";
import { Button } from "@/components/ui/button";
import { Card, InfoTip, MicroLabel, Pill, type PillTone } from "@/components/ui/Panel";
import { TermTip } from "@/components/ui/TermTip";
import { NO_VALUE, barFillPct, cashtag, cn, currency, percent } from "@/lib/format";
import { blockWheelChange, parseDecimal } from "@/lib/number-input";
import {
  ROLL_DELTA_RANGE,
  TAKE_PROFIT_RANGE,
  WATCH_DELTA,
  deltaText,
  oddsText,
  rollSaid,
  cardLine,
  type CallHealth,
  type CallView,
  type CallRules,
  type TrackedCall,
  type VolSource,
} from "@/lib/options/tracked-calls";
import { format, parseISO } from "date-fns";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";

/*
  The calls a reader has sold or plans to sell, one card each, most
  pressing first.

  Every card leads with the same two things, because they are the two
  things the rules are made of: delta on a meter that marks where the
  strike is and where the reader's roll level is, and how much of the
  premium has been kept. The verdict beside them is the reader's own rule
  being met, printed with the rule, so it can always be argued with; the
  sentence under it says what the reader's rule means doing, and where the
  chain has one, a roll that pays for itself with its figures.
*/

const TONE_PILL: Record<CallHealth["tone"], PillTone> = {
  loss: "bad",
  warning: "warn",
  gain: "good",
  neutral: "neutral",
};

const TONE_RULE: Record<CallHealth["tone"], string> = {
  loss: "border-l-loss",
  warning: "border-l-caution",
  gain: "border-l-gain",
  neutral: "border-l-transparent",
};

const SOURCE_SAID: Record<VolSource, string> = {
  market: "Delta worked out from the price the market is quoting for this contract today.",
  feed: "Delta worked out from the option feed's own volatility for this contract.",
  neighbour:
    "This strike has no quote today, so its delta and price use the volatility of the nearest listed strike on the same date.",
  history:
    "No option price was available, so this delta is estimated from the share's own recent daily moves and is rough.",
};

const METHOD =
  "Worked out with the Black-Scholes formula from the share price, the strike, the time left to the 16:00 New York close on expiry and the volatility named below. It leaves out dividends and early exercise, which move a delta a few weeks out by a couple of hundredths at most.";

/** One line at the top naming what needs a look, or null when nothing does. */
export function attentionLine(views: CallView[]): string | null {
  const urgent = views.filter((v) => v.health.urgent);
  if (!urgent.length) return null;
  const parts = urgent.slice(0, 3).map((v) => {
    const name = `${cashtag(v.call.ticker)} ${currency(v.call.strike)}`;
    switch (v.health.kind) {
      case "roll":
        return `${name} is past your roll level`;
      case "assignment":
        return `${name} could take your shares this week`;
      case "close":
        return `${name} is past your buy-back level`;
      case "ready":
        return `${name} has reached your price`;
      default:
        return `${name} needs a look`;
    }
  });
  const more = urgent.length > 3 ? `, and ${urgent.length - 3} more` : "";
  const head = urgent.length === 1 ? "One call needs a look" : `${urgent.length} calls need a look`;
  return `${head}: ${parts.join("; ")}${more}.`;
}

/**
 * Delta as a thin bar under its own figure, with the reader's roll level
 * marked on it. The watch level is a faint tick; the roll level is the
 * one line in colour, because it is the one that is theirs.
 */
function DeltaMeter({ delta, rollDelta }: { delta: number | null; rollDelta: number }) {
  const pct = barFillPct(delta != null ? delta * 100 : 0);
  const fill =
    delta == null
      ? "bg-transparent"
      : delta >= rollDelta
        ? "bg-loss"
        : delta >= WATCH_DELTA
          ? "bg-caution"
          : "bg-foreground/50";
  return (
    <div
      className="relative h-1.5 overflow-hidden rounded-full bg-muted"
      role="meter"
      aria-label="Delta"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={delta ?? undefined}
      aria-valuetext={
        delta != null
          ? `${deltaText(delta)}, odds of the shares being taken ${oddsText(delta)}, roll at ${deltaText(rollDelta)}`
          : "No reading"
      }
    >
      <div className={cn("h-full rounded-full transition-[width]", fill)} style={{ width: `${pct}%` }} />
      <span
        aria-hidden
        className="absolute inset-y-0 w-px bg-foreground/30"
        style={{ left: `${WATCH_DELTA * 100}%` }}
      />
      <span
        aria-hidden
        className="absolute inset-y-0 w-0.5 bg-loss/80"
        style={{ left: `${rollDelta * 100}%` }}
      />
    </div>
  );
}

function Figure({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <MicroLabel>{label}</MicroLabel>
      <p className="mt-1 font-mono text-sm tabular-nums text-foreground">{children}</p>
    </div>
  );
}

function expirySaid(expiry: string, daysLeft: number | null): string {
  let when = expiry;
  try {
    when = format(parseISO(expiry), "MMM d");
  } catch {
    /* keep the key */
  }
  if (daysLeft == null) return when;
  if (daysLeft <= 0) return `${when}, passed`;
  return `${when}, ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
}

/*
  One call, in four lines: which contract and what state it is in, the
  delta against the reader's roll level, the three figures, and the one
  sentence the figures cannot say. It was eleven: the same kept share was
  printed as a figure, as a sentence and again as a buy-back paragraph,
  with a line under all of it about where delta came from. That last one
  lives behind the mark beside Delta now, where somebody who wants it will
  look, and everything else is said once.
*/
function CallCard({
  view,
  rules,
  showCurrency,
  onEdit,
  onRemove,
  onMarkSold,
}: {
  view: CallView;
  rules: CallRules;
  showCurrency: boolean;
  onEdit: () => void;
  onRemove: () => Promise<void>;
  onMarkSold: () => void;
}) {
  const { call, reading, health, daysLeft } = view;
  const [confirming, setConfirming] = useState(false);
  const sold = call.status === "sold";
  const perShare = (n: number | null) => (n != null ? currency(n) : NO_VALUE);
  const delta = reading?.delta ?? null;
  const showRoll =
    sold && reading?.roll && (health.kind === "roll" || health.kind === "assignment" || health.kind === "watch");
  const source = reading?.volSource
    ? `${SOURCE_SAID[reading.volSource]} ${METHOD}`
    : METHOD;

  return (
    <Card tone="raised" className={cn("flex flex-col gap-3 border-l-2", TONE_RULE[health.tone])}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-foreground">
            <TickerSymbol ticker={call.ticker} showCurrency={showCurrency} />{" "}
            <span className="font-mono tabular-nums">{currency(call.strike)}</span>{" "}
            <span className="font-normal text-muted-foreground">call</span>
          </p>
          <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
            {sold ? "Sold" : "Planned"}, {call.contracts}{" "}
            {call.contracts === 1 ? "contract" : "contracts"}, {expirySaid(call.expiry, daysLeft)}
          </p>
        </div>
        <Pill tone={TONE_PILL[health.tone]}>{health.label}</Pill>
        <div className="-mr-2 -mt-1 flex items-center">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 text-muted-foreground"
            onClick={onEdit}
            aria-label="Edit this call"
          >
            <Pencil />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn("size-8", confirming ? "text-loss" : "text-muted-foreground")}
            onClick={() => {
              if (!confirming) {
                setConfirming(true);
                return;
              }
              setConfirming(false);
              void onRemove();
            }}
            onBlur={() => setConfirming(false)}
            aria-label={confirming ? "Press again to remove this call" : "Remove this call"}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xs:grid-cols-4">
        <Figure
          label={
            <span className="inline-flex items-center gap-1">
              <TermTip term="delta">Delta</TermTip>
              <InfoTip text={source} label="How delta is worked out" />
            </span>
          }
        >
          {delta != null ? deltaText(delta) : NO_VALUE}
        </Figure>
        {sold ? (
          <>
            <Figure label="Received">{perShare(call.premium)}</Figure>
            <Figure label="Now">{perShare(reading?.mid ?? null)}</Figure>
            {health.kept != null && health.kept < 0 ? (
              <Figure label="Behind">
                <span className="text-loss">
                  {health.gainTotal != null ? currency(Math.abs(health.gainTotal), 0) : NO_VALUE}
                </span>
              </Figure>
            ) : (
              <Figure label="Kept">
                <span className={health.kept != null ? "text-gain" : "text-muted-foreground"}>
                  {health.kept != null ? percent(health.kept, 0) : NO_VALUE}
                </span>
                {health.gainTotal != null && health.gainTotal > 0 ? (
                  <span className="text-muted-foreground">
                    {" "}
                    {currency(health.gainTotal, 0)}
                  </span>
                ) : null}
              </Figure>
            )}
          </>
        ) : (
          <>
            <Figure label="Pays now">{perShare(reading?.mid ?? null)}</Figure>
            <Figure label="You want">
              {call.premium != null ? currency(call.premium) : "Any"}
            </Figure>
            <Figure label="Share">{reading ? currency(reading.spot) : NO_VALUE}</Figure>
          </>
        )}
      </div>

      <DeltaMeter delta={delta} rollDelta={rules.rollDelta} />

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          {reading ? cardLine(view, rules) : "Reading the market for this contract."}
        </p>
        {!sold ? (
          <Button type="button" size="sm" variant="outline" onClick={onMarkSold}>
            Mark as sold
          </Button>
        ) : null}
      </div>

      {showRoll && reading?.roll ? (
        <div className="card-sheen glass-well rounded-lg px-3 py-2.5">
          <p className="text-sm text-foreground">
            <span className="font-medium">
              {reading.roll.kind === "up-and-out" ? "Roll up and out: " : "Roll out: "}
            </span>
            {rollSaid(reading.roll, call.contracts)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            At the middle of today&apos;s quotes; a real order fills between the bid and the ask.
          </p>
        </div>
      ) : sold && reading?.rollSearched && !reading.roll && health.kind === "roll" ? (
        <p className="text-sm text-muted-foreground">
          The chain has nothing later at this strike or above with a quote today.
        </p>
      ) : null}
    </Card>
  );
}

function RuleField({
  value,
  scale,
  min,
  max,
  digits,
  label,
  onCommit,
}: {
  value: number;
  scale: number;
  min: number;
  max: number;
  digits: number;
  label: string;
  onCommit: (n: number) => void;
}) {
  const display = (value * scale).toFixed(digits);
  const [draft, setDraft] = useState(display);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(display);
  }, [display]);
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, ""))}
      onFocus={() => {
        focused.current = true;
      }}
      onWheel={blockWheelChange}
      onBlur={() => {
        focused.current = false;
        const n = parseDecimal(draft) / scale;
        if (Number.isFinite(n) && n >= min && n <= max) onCommit(n);
        else setDraft(display);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="inline-edit no-spinner w-12 rounded-t py-0.5 text-center font-mono tabular-nums text-foreground outline-none hover:bg-hover focus:bg-muted focus:ring-1 focus:ring-ring/50"
    />
  );
}

export function CallRulesLine({
  rules,
  onChange,
}: {
  rules: CallRules;
  onChange: (next: CallRules) => void;
}) {
  return (
    <p className="text-sm text-muted-foreground">
      Your rules: <TermTip term="roll">roll</TermTip> when delta reaches{" "}
      <RuleField
        label="Delta to roll at"
        value={rules.rollDelta}
        scale={1}
        digits={2}
        min={ROLL_DELTA_RANGE.min}
        max={ROLL_DELTA_RANGE.max}
        onCommit={(rollDelta) => onChange({ ...rules, rollDelta })}
      />
      , and <TermTip term="buy-to-close">buy it back</TermTip> once you have kept{" "}
      <RuleField
        label="Share of the premium to close at, in percent"
        value={rules.takeProfit}
        scale={100}
        digits={0}
        min={TAKE_PROFIT_RANGE.min}
        max={TAKE_PROFIT_RANGE.max}
        onCommit={(takeProfit) => onChange({ ...rules, takeProfit })}
      />
      % of the premium.{" "}
      <InfoTip
        label="Where these come from"
        text="They are yours to change. The starting values are the ones most people who write covered calls begin with: past about 0.70 a call is much more likely than not to take the shares, and rolling it up and out gives them room; once half the premium is kept, the rest pays less and less for the same risk, so buying the call back frees the shares to write another."
      />
    </p>
  );
}

export function TrackedCalls({
  views,
  rules,
  showCurrency,
  onRulesChange,
  onAdd,
  onEdit,
  onRemove,
  onMarkSold,
}: {
  views: CallView[];
  rules: CallRules;
  showCurrency: boolean;
  onRulesChange: (next: CallRules) => void;
  onAdd: () => void;
  onEdit: (call: TrackedCall) => void;
  onRemove: (call: TrackedCall) => Promise<void>;
  onMarkSold: (call: TrackedCall) => void;
}) {
  const attention = useMemo(() => attentionLine(views), [views]);
  return (
    <section aria-label="Your calls" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">Your calls</h3>
          {attention ? (
            <p className="mt-1 text-sm text-foreground">{attention}</p>
          ) : views.length ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Nothing past your rules right now.
            </p>
          ) : null}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          <Plus />
          Track a call
        </Button>
      </div>
      {views.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sold a covered call, or planning one? Track it here and its delta and
          what you have kept are read from the market, with a flag when it
          reaches the level you roll or close at.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
          {views.map((v) => (
            <CallCard
              key={v.call.id}
              view={v}
              rules={rules}
              showCurrency={showCurrency}
              onEdit={() => onEdit(v.call)}
              onRemove={() => onRemove(v.call)}
              onMarkSold={() => onMarkSold(v.call)}
            />
          ))}
        </div>
      )}
      <CallRulesLine rules={rules} onChange={onRulesChange} />
    </section>
  );
}
