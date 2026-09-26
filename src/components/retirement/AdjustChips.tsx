"use client";

import { Button } from "@/components/ui/button";
import { MicroLabel } from "@/components/ui/Panel";
import { cn } from "@/lib/format";
import {
  ADJUST_LABEL,
  ADJUST_TOPICS,
  topicSummary,
  type AdjustTopic,
} from "@/lib/retirement/adjust";
import type { RetirementInputs } from "@/lib/retirement/plan";
import type { MoneyWriter } from "@/lib/retirement/summary";
import {
  Baby,
  Calculator,
  Car,
  Check,
  Hourglass,
  Home,
  PiggyBank,
  Route,
  TrendingUp,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

const ICON: Record<AdjustTopic, LucideIcon> = {
  home: Home,
  children: Baby,
  car: Car,
  income: Wallet,
  savings: PiggyBank,
  returns: TrendingUp,
  lifespan: Hourglass,
  bridge: Route,
  working: Calculator,
};

/**
 * Every part of the plan the essentials do not ask about, each as a chip
 * that already says what the plan assumes. Pressing one opens that editor
 * under the card and nothing else; pressing it again, or the cross on the
 * editor, puts it away. See `adjust.ts` for why this replaced the levels.
 */
export function AdjustChips({
  inputs,
  open,
  onToggle,
  money,
  planningAge,
  swrPct,
}: {
  inputs: RetirementInputs;
  open: readonly AdjustTopic[];
  onToggle: (topic: AdjustTopic) => void;
  money: MoneyWriter;
  planningAge: number;
  swrPct: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <MicroLabel>What else the plan counts</MicroLabel>
        <p className="text-xs text-muted-foreground">
          Tick anything to change it.
        </p>
      </div>
      {/*
        Nine chips: three rows of three on a laptop, and on a phone the
        ninth takes the whole last row rather than leaving a hole beside it.
      */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 max-lg:[&>*:last-child:nth-child(odd)]:col-span-2">
        {ADJUST_TOPICS.map((topic) => {
          const on = open.includes(topic);
          const Icon = ICON[topic];
          return (
            <button
              key={topic}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(topic)}
              className={cn(
                /*
                  A border rather than a ring for the chosen state, for the
                  reason the template cards give: `glass-well` sets
                  `box-shadow` itself and a ring loses to it.
                */
                "card-sheen glass-well veil-hover lift group flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors max-sm:items-start",
                on ? "border-primary/70" : "border-transparent hover:border-border"
              )}
            >
              <span
                className={cn(
                  /*
                    Hidden on a phone: two chips across leave about 150px
                    each, and the 44px a glyph costs is the name of the
                    topic. A ticked chip still says so with its border.
                  */
                  "hidden size-8 shrink-0 place-items-center rounded-md transition-colors sm:grid",
                  on
                    ? "bg-primary text-primary-foreground"
                    : "bg-foreground/[0.06] text-muted-foreground group-hover:text-foreground"
                )}
                aria-hidden
              >
                {on ? <Check className="size-4" /> : <Icon className="size-4" />}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium leading-snug text-foreground sm:truncate">
                  {ADJUST_LABEL[topic]}
                </span>
                <span className="text-xs leading-snug tabular-nums text-muted-foreground sm:truncate">
                  {topicSummary(topic, inputs, money, { planningAge, swrPct })}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The cross on an opened editor, which unticks its chip. Pinned to the
 * panel's top corner (the panel is `relative`) rather than passed as the
 * header's `actions`: at phone width the actions drop to a line of their
 * own, and a lone cross under a title reads as a stray glyph.
 */
export function TopicClose({
  topic,
  onClose,
}: {
  topic: AdjustTopic;
  onClose: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="absolute right-2 top-2 size-8 text-muted-foreground sm:right-3 sm:top-3"
      onClick={onClose}
      aria-label={`Put away ${ADJUST_LABEL[topic].toLowerCase()}`}
    >
      <X className="size-4" />
    </Button>
  );
}
