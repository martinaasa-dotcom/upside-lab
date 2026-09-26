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

import {
  CARD,
  MicroLabel,
  Panel,
  PanelHeader,
  Segmented,
} from "@/components/ui/Panel";
import { Slider } from "@/components/ui/slider";
import { cn, currency } from "@/lib/format";
import {
  DEFAULT_TIERS,
  flexibleYear,
  labelForReturn,
  layersRead,
  MARKET_YEARS,
} from "@/lib/retirement/tiers";
import {
  firstYearDiffers,
  firstYearDraw,
  settledDraw,
  type PlanResult,
} from "@/lib/retirement/plan";
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
/*
  The slider's own ends, named because the copy under the picture reads
  the same year at both of them: a layer the market takes off in a bad
  year is the point of the panel, and a layer missing even at the top of
  the slider is the plan being short, which is a different sentence.
*/
const WORST_RETURN_PCT = -40;
const BEST_RETURN_PCT = 35;

const MAX_BAR_PX = 180;
const MIN_FUNDED_PX = 34;
const EMPTY_BAR_PX = 6;

type Picture = "first" | "settled";

export function FlexiblePanel({ plan }: { plan: PlanResult }) {
  const [returnPct, setReturnPct] = useState(5);
  const code = plan.currency;

  /*
    TWO PICTURES, AND WHICH ONE A READER MOST NEEDS DEPENDS ON THEIR PLAN.

    This panel drew the settled year and only the settled year, on the
    sound argument that it is the one year describing the rest of a life
    rather than a stretch of it. What that missed is that for anybody
    stopping before their pension starts it is also the one year of their
    retirement that is NOT at risk: a couple who stop at fifty can be
    three hundred thousand short of their own target and still watch the
    settled picture pay for every luxury on the stack, because by then
    two pensions have started and everything temporary has ended. The
    arithmetic was right and the reading a person took from it was that
    the slider was broken.

    So the years that differ get a picture each. The first year is
    offered first when there is one, because it is the year the shortfall
    actually lands in, and the settled year is a press away and still
    says what it always said. A plan whose first year is its settled year
    (stopping the day the pension starts, nothing temporary left on the
    bill) gets no choice at all, since two identical pictures behind a
    control is a control that does nothing.
  */
  const hasTwo = firstYearDiffers(plan);
  const [picture, setPicture] = useState<Picture>(hasTwo ? "first" : "settled");
  const showing: Picture = hasTwo ? picture : "settled";

  const settled = plan.years.length > 0 ? plan.years[plan.years.length - 1] : null;
  const opening = plan.years.length > 0 ? plan.years[0] : null;
  const shown = showing === "first" ? opening : settled;

  /*
    Spending is the WHOLE bill, with guaranteed income shown as the part
    of it the market cannot reach, rather than the net figure the pot has
    to find. A reader's essentials are a share of what they spend; a
    panel that made them a share of what the POT provides would hide the
    single most reassuring fact on the page, which is that a pension
    already covers most of the bottom layer.
  */
  const spend = shown ? shown.spend : plan.firstYearFromPot;
  const guaranteed = shown ? shown.income : 0;

  /*
    A settled year is a forever question and a first year is a scheduled
    one, so they are drawn on different arithmetic. `plan.ts` holds both
    and says why; either way what decides the answer is the pot the
    reader is actually projected to have rather than the one the plan
    says they need.
  */
  const draw = showing === "first" ? firstYearDraw(plan) : settledDraw(plan);
  const pot = draw.pot;
  const rate = draw.ratePct;
  const earlyYears = Math.max(0, plan.required.temporaryPot);
  const stopAge = opening ? opening.age : plan.planningAge;

  /*
    How long the pot pays for everything on its own. A reader who stops
    at the age their pension starts has none of these; a reader who stops
    at fifty has seventeen, and those are the years their plan is short
    in, whatever the settled year looks like.
  */
  const bridgeYears = plan.years.filter((y) => y.income <= 0).length;

  const yearAt = useMemo(() => {
    return (marketReturnPct: number) =>
      flexibleYear({
        pot,
        annualSpend: spend,
        guaranteedIncome: guaranteed,
        withdrawalRatePct: rate,
        marketReturnPct,
        tiers: DEFAULT_TIERS,
      });
  }, [pot, spend, guaranteed, rate]);

  const year = useMemo(() => yearAt(returnPct), [yearAt, returnPct]);
  const read = useMemo(
    () =>
      layersRead({
        current: year,
        worst: yearAt(WORST_RETURN_PCT),
        best: yearAt(BEST_RETURN_PCT),
        bridgeYears,
        short: plan.gap > 0,
        which: showing,
      }),
    [year, yearAt, bridgeYears, plan.gap, showing]
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
        subtitle="The bottom layers are paid whatever the market does. The top ones are what a bad year cuts."
      />

      {hasTwo ? (
        <Segmented<Picture>
          value={showing}
          onChange={setPicture}
          columns={2}
          ariaLabel="Which year of your retirement"
          options={[
            /*
              MEASURED, NOT CHOSEN. A segmented cell is priced by the
              longest label in the row, so this pair sets the width of
              both. Rendered with the app's own compiled CSS and real
              Geist at 360, 390, 430, 820 and 1280, "Your first year, at
              50" wrapped to three lines on a phone (61px against the
              44px touch floor) and took "Once it settles" to two with
              it. This pair measures 44px at every one of those widths.
            */
            { id: "first", label: `First year, at ${stopAge}` },
            { id: "settled", label: "Once it settles" },
          ]}
        />
      ) : null}

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
                    <span className={cn("min-w-0 truncate font-semibold", inkOn())}>
                      {slice.tier.label}
                      {slice.fill < 0.995 ? (
                        <span className="ml-1.5 font-normal opacity-70">
                          part funded
                        </span>
                      ) : null}
                    </span>
                    <span className={cn("shrink-0 font-mono tabular-nums", inkOn())}>
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
        {/*
          WHICH POT THIS IS, SAID OUT LOUD.

          The whole picture now moves with what the reader is projected to
          have rather than with what the plan says they need, and a stack
          that will not fill is a serious thing to show somebody without
          naming the figure behind it. Nothing in this app states a number
          as fact that the reader cannot check, and the two figures here
          are both on the page above: the projected pot is the headline
          panel's own, and what the early years take is the difference
          between that and what the settled year lives on.
        */}
        <p className="text-center text-xs text-muted-foreground">
          {showing === "first" ? (
            pot > 0.5 ? (
              <>
                Drawn on the{" "}
                <span className="font-mono tabular-nums">
                  {currency(pot, 0, code)}
                </span>{" "}
                you are projected to have at {stopAge}, against the{" "}
                <span className="font-mono tabular-nums">
                  {currency(plan.required.target, 0, code)}
                </span>{" "}
                this plan needs by then.
              </>
            ) : (
              <>
                You are projected to have nothing invested by {stopAge}, so
                everything above is guaranteed income.
              </>
            )
          ) : pot > 0.5 ? (
            <>
              Drawn on the{" "}
              <span className="font-mono tabular-nums">{currency(pot, 0, code)}</span>{" "}
              your plan leaves working for you for good
              {earlyYears > 0.5 ? (
                <>
                  , after the{" "}
                  <span className="font-mono tabular-nums">
                    {currency(earlyYears, 0, code)}
                  </span>{" "}
                  the early years take on top
                </>
              ) : null}
              .
            </>
          ) : (
            <>
              Your pot has nothing left for a year like this one
              {earlyYears > 0.5 ? (
                <>
                  {" "}
                  once the{" "}
                  <span className="font-mono tabular-nums">
                    {currency(earlyYears, 0, code)}
                  </span>{" "}
                  the early years take is paid for
                </>
              ) : null}
              , so everything above it is guaranteed income.
            </>
          )}
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
          min={WORST_RETURN_PCT}
          max={BEST_RETURN_PCT}
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

      <p className="text-sm leading-relaxed text-muted-foreground">{read}</p>
    </Panel>
  );
}

/** Dark type on the two solid layers, light type on the two pale ones. */
/*
  Every layer is a light, saturated hue now, so every layer takes the dark
  ink. Kept as a function so a darker layer colour has one place to say so.
*/
function inkOn(): string {
  return "text-primary-foreground";
}
