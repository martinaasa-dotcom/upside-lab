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

/*
  A layer's bar is as tall as what it actually gets, not as tall as it
  would like to be.

  The first version sized every bar off its FULL amount and only changed
  the figure printed in it, so a bad year drew an unchanged wall of blocks
  with smaller numbers inside, which is the one reading this panel exists
  to prevent. The whole argument is visual: the top of the stack is what a
  bad year takes. A bar has to shrink for that to be true.

  The floor is so a layer that still gets something never collapses to a
  sliver a reader would take for nothing, and a layer that gets nothing is
  drawn as a closed line rather than removed, so the stack keeps its shape
  and the eye can see what went.
*/
const MAX_BAR_PX = 180;
const MIN_FUNDED_PX = 34;
const EMPTY_BAR_PX = 6;

export function FlexiblePanel({ plan }: { plan: PlanResult }) {
  const [returnPct, setReturnPct] = useState(5);
  const code = plan.currency;
  const pot = Math.max(1, plan.required.target);

  /*
    The settled year, not the first one. By the last year of the plan every
    pension has started and everything temporary has ended, so it is the
    one year that describes the rest of a life rather than a stretch of it.

    Spending here is the WHOLE bill, with guaranteed income shown as the
    part of it the market cannot reach, rather than the net figure the pot
    has to find. A reader's essentials are a share of what they spend; a
    panel that made them a share of what the POT provides would hide the
    single most reassuring fact on the page, which is that a pension
    already covers most of the bottom layer.
  */
  const settled = plan.years.length > 0 ? plan.years[plan.years.length - 1] : null;
  const spend = settled ? settled.spend : plan.firstYearFromPot;
  const guaranteed = settled ? settled.income : 0;
  const rate = plan.required.swr.ratePct;

  const year = useMemo(
    () =>
      flexibleYear({
        pot,
        annualSpend: spend,
        guaranteedIncome: guaranteed,
        withdrawalRatePct: rate,
        marketReturnPct: returnPct,
        tiers: DEFAULT_TIERS,
      }),
    [pot, spend, guaranteed, rate, returnPct]
  );

  /*
    The scale is the fully funded stack and does not move with the slider.
    Rescaling per year would keep every bar the same size whatever the
    market did, which is the one thing this picture must not do.
  */
  const tallest = Math.max(...year.slices.map((t) => t.full), 1);

  return (
    <Panel>
      <PanelHeader
        icon={<SlidersHorizontal className="h-4 w-4" />}
        title="What a bad year actually costs you"
        subtitle="Your spending, split into layers. The bottom one is paid every year whatever the market did. The ones above it are what a real person would move, and moving them is worth more than any other decision available to you."
      />

      <div
        className={cn(CARD, "flex flex-col gap-2 p-4")}
        role="group"
        aria-label={`Your spending in layers at a market return of ${returnPct}%`}
      >
        {year.slices
          .slice()
          .reverse()
          .map((slice) => {
            const gone = slice.funded <= 0.5;
            const height = gone
              ? EMPTY_BAR_PX
              : Math.max(MIN_FUNDED_PX, (slice.funded / tallest) * MAX_BAR_PX);
            return (
              <div
                key={slice.tier.id}
                /*
                  `motion-safe`, because this keeps moving after the input
                  stops. A pull or a drag is direct manipulation and is not
                  the motion that setting is asking about; four blocks
                  easing to a new height over 300ms afterwards is. There is
                  no blanket rule in `globals.css` disabling transitions,
                  so every animated surface opts out by name and this one
                  has to as well.
                */
                className="flex min-w-0 items-center justify-between gap-3 overflow-hidden rounded-lg px-3 motion-safe:transition-all motion-safe:duration-300"
                style={{
                  height,
                  background: slice.tier.color,
                  opacity: gone ? 0.35 : 1,
                }}
              >
                {gone ? null : (
                  <>
                    <span className="min-w-0 truncate font-semibold text-black">
                      {slice.tier.label}
                      {slice.fill < 0.995 ? (
                        <span className="ml-1.5 font-normal opacity-70">
                          part funded
                        </span>
                      ) : null}
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
          {guaranteed > 0 ? (
            <>
              {" "}
              Of that,{" "}
              <span className="font-mono tabular-nums text-foreground">
                {currency(year.guaranteed, 0, code)}
              </span>{" "}
              arrives whatever the market did.
            </>
          ) : null}
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
            ? "At this return the year cannot cover even the bottom layer, which is the one situation a plan has to be built to avoid. Either the pot is too small for this spending, or too much of the bottom layer is resting on the market rather than on income that is guaranteed."
            : guaranteed >= year.slices[0].full
              ? "Drag it anywhere you like: your guaranteed income alone covers the whole bottom layer, so the market decides how good a year you have and never whether you eat. That is what a pension is actually worth, and it is the most under-counted number in retirement arithmetic."
              : "The essentials hold at every setting on that slider, which is what the withdrawal rate above is for. Everything above them is a choice you would get to make at the time, and being willing to make it is most of the difference between a plan that survives a bad decade and one that does not."}
        </p>
      </div>
    </Panel>
  );
}
