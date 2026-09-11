"use client";

/**
 * SPENDING IN LAYERS, WITH A SLIDER ON THE MARKET.
 *
 * This panel exists to make one point that no amount of prose lands: what a
 * bad year actually takes from you is the top of the stack, not the bottom.
 *
 * Every safe withdrawal rate in the literature is built on the assumption
 * that a person's spending never changes, including in the year their
 * portfolio falls a third. That assumption is where almost all of the
 * conservatism comes from, and nobody actually behaves that way. Drag the
 * slider to a bad year and watch the luxuries and then the holidays switch
 * off while the essentials stay exactly where they are, and the point makes
 * itself: flexibility is the cheapest safety there is, and it is the one
 * thing on this page that costs nothing to have.
 *
 * WHAT THE SURPLUS DOES IS A DELIBERATE CHOICE. In a very good year the
 * budget exceeds every layer and the remainder is left invested rather than
 * spent. A rule that ratchets spending up after every good year and cannot
 * come down after a bad one is a flexible plan quietly turning back into a
 * fixed one, which is the failure this panel is arguing against.
 */

import { CARD, MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import { Slider } from "@/components/ui/slider";
import { cn, currency } from "@/lib/format";
import {
  DEFAULT_TIERS,
  flexibleYear,
  labelForReturn,
  MARKET_YEARS,
} from "@/lib/retirement/tiers";
import type { PlanResult } from "@/lib/retirement/plan";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

/** The tallest a layer's bar gets, so a big essentials block fits a phone. */
const MAX_BAR_PX = 190;
const MIN_BAR_PX = 30;

export function FlexiblePanel({ plan }: { plan: PlanResult }) {
  const [returnPct, setReturnPct] = useState(5);
  const code = plan.currency;
  const pot = Math.max(1, plan.required.safeRate);
  const spend = plan.lifelongFromPot > 0 ? plan.lifelongFromPot : plan.firstYearFromPot;
  const rate = plan.required.swr.ratePct;

  const year = useMemo(
    () =>
      flexibleYear({
        pot,
        annualSpend: spend,
        withdrawalRatePct: rate,
        marketReturnPct: returnPct,
        tiers: DEFAULT_TIERS,
      }),
    [pot, spend, rate, returnPct]
  );

  const tallest = Math.max(...year.slices.map((s) => s.full), 1);

  return (
    <Panel>
      <PanelHeader
        icon={<SlidersHorizontal className="h-4 w-4" />}
        title="What a bad year actually costs you"
        subtitle="Your spending, split into layers. The bottom one is paid every year whatever the market did. The ones above it are what a real person would move, and moving them is worth more than any other decision available to you."
      />

      <div className={cn(CARD, "flex flex-col gap-2 p-4")}>
        {year.slices
          .slice()
          .reverse()
          .map((slice) => {
            const height = Math.max(
              MIN_BAR_PX,
              (slice.full / tallest) * MAX_BAR_PX
            );
            const gone = slice.funded <= 0.5;
            return (
              <div
                key={slice.tier.id}
                className="flex min-w-0 items-start justify-between gap-3 overflow-hidden rounded-lg px-3 py-2 transition-all"
                style={{
                  height: gone ? 8 : height,
                  background: slice.tier.color,
                  opacity: gone ? 0.45 : 1,
                }}
              >
                {gone ? null : (
                  <>
                    <span className="min-w-0 truncate font-semibold text-black">
                      {slice.tier.label}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-black">
                      {currency(slice.funded, 0, code)}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        <p className="pt-1 text-center text-sm text-muted-foreground">
          You spend{" "}
          <span className="font-mono tabular-nums text-foreground">
            {currency(year.spend, 0, code)}
          </span>{" "}
          this year
          {year.unspent > 1 ? (
            <>
              , and leave{" "}
              <span className="font-mono tabular-nums text-foreground">
                {currency(year.unspent, 0, code)}
              </span>{" "}
              invested rather than spending it
            </>
          ) : null}
          .
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <MicroLabel>The market this year</MicroLabel>
          <span className="font-mono tabular-nums text-foreground">
            {returnPct > 0 ? "+" : ""}
            {returnPct}%{" "}
            <span className="font-sans text-muted-foreground">
              {labelForReturn(returnPct)}
            </span>
          </span>
        </div>
        <Slider
          value={[returnPct]}
          min={-40}
          max={35}
          step={1}
          onValueChange={(next) => {
            const n = next[0];
            if (Number.isFinite(n)) setReturnPct(n);
          }}
          aria-label="The market this year"
          className="py-2"
        />
        <div className="flex flex-wrap gap-2">
          {MARKET_YEARS.map((m) => (
            <Button
              key={m.id}
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={returnPct === m.returnPct}
              onClick={() => setReturnPct(m.returnPct)}
            >
              {m.label}
            </Button>
          ))}
        </div>
      </div>

      <div className={cn(CARD, "p-4")}>
        <MicroLabel>What this is worth</MicroLabel>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {year.essentialsShort
            ? "At this return the year cannot cover even the bottom layer, which is the one situation the plan has to be built to avoid. That is what the safe withdrawal rate above is protecting."
            : "The essentials are covered at every setting on that slider, which is what the withdrawal rate above is for. Everything else is a choice you would get to make at the time, and being willing to make it is most of the difference between a plan that survives a bad decade and one that does not."}
        </p>
      </div>
    </Panel>
  );
}
