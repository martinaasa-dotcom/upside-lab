"use client";

/**
 * EVERY NUMBER THE ANSWER RESTS ON, NAMED, SOURCED, AND EDITABLE.
 *
 * This panel is at the foot of the page and it is the reason the rest of it
 * can be trusted. A retirement figure is the output of a dozen assumptions,
 * and a calculator that hides them is asking to be believed rather than
 * checked. Everything here is a real lever: change the equity return and the
 * headline moves while you watch.
 *
 * THE MIX IS BANDS OF YOUR LIFE, NOT ONE NUMBER. A person who is all shares
 * at 31 and half bonds at 70 is not earning one average return, and the
 * order those stretches arrive in changes the answer. The bands are why the
 * glide is a small table rather than a single field, and why somebody can
 * say a quarter in shares until 40 and the market's own mix after it.
 *
 * WHAT IS NOT OFFERED, AND WHY. There is no field for inflation. Every
 * return on this page is a real return, after inflation, so inflation is
 * already taken off at the start rather than added back at the end, and
 * every figure on screen is in money the reader can price against their own
 * weekly shop. Offering an inflation box as well would invite somebody to
 * count it twice, which is the commonest way one of these pages produces a
 * number that is wrong by a factor rather than by a margin.
 */

import { Button } from "@/components/ui/button";
import { CARD, MicroLabel, Panel, PANEL_STACK, PanelHeader } from "@/components/ui/Panel";
import { COMPOUND_INFLATION_ANNUAL_PCT } from "@/lib/compound-play";
import {
  CountField,
  FIELD_GRID,
  PercentField,
} from "@/components/retirement/fields";
import { cn, percent } from "@/lib/format";
import {
  allEquityGlide,
  CAUTIOUS_CASH_REAL_PCT,
  cashOnlyGlide,
  defaultGlide,
  equityShareAt,
  realReturnAt,
  REAL_RETURN_ASSUMPTIONS,
  RETURNS_SOURCE,
  type GlideSegment,
} from "@/lib/retirement/returns";
import { FX_REFERENCE_MONTH, regionById, UK_COST_ANCHORS } from "@/lib/retirement/regions";
import type { RetirementInputs } from "@/lib/retirement/plan";
import { SlidersVertical } from "lucide-react";

export function AssumptionsPanel({
  inputs,
  patch,
  portfolioRatePct,
}: {
  inputs: RetirementInputs;
  patch: (next: Partial<RetirementInputs>) => void;
  /**
   * The same blended growth rate Compound's "Your rate" preset shows for
   * these holdings, turned real. Null when there is nothing to blend.
   */
  portfolioRatePct: number | null;
}) {
  const region = regionById(inputs.regionId);
  const sorted = [...inputs.glide].sort((a, b) => a.fromAge - b.fromAge);

  const setSegment = (index: number, next: Partial<GlideSegment>) =>
    patch({
      glide: sorted.map((seg, i) => (i === index ? { ...seg, ...next } : seg)),
    });

  return (
    <div className={PANEL_STACK}>
      <Panel>
        <PanelHeader
          icon={<SlidersVertical className="h-4 w-4" />}
          title="What the money earns"
          subtitle="All of these are real returns, after inflation. That is why there is no inflation box: it is already taken off, and every figure on this page is in today's money."
        />
        <div className={FIELD_GRID}>
          <PercentField
            label="Global shares, a year"
            value={inputs.returns.equityPct}
            onChange={(equityPct) => patch({ returns: { ...inputs.returns, equityPct } })}
            note="The world index, not America's. The American century is the most flattering series in the data and the most quoted."
          />
          <PercentField
            label="Government bonds, a year"
            value={inputs.returns.bondPct}
            onChange={(bondPct) => patch({ returns: { ...inputs.returns, bondPct } })}
          />
          <PercentField
            label="Cash, a year"
            value={inputs.returns.cashPct}
            onChange={(cashPct) => patch({ returns: { ...inputs.returns, cashPct } })}
            note={`Only used where nothing at all is invested, and no fee comes off it, because nobody pays a platform charge on a savings account. ${CAUTIOUS_CASH_REAL_PCT}% is what a plan should assume, since cash's own bad run is a decade of inflation eating the interest. ${REAL_RETURN_ASSUMPTIONS.cashPct}% is the long run average if you would rather plan on that.`}
          />
          <PercentField
            label="What you are charged, a year"
            value={inputs.returns.feePct}
            onChange={(feePct) => patch({ returns: { ...inputs.returns, feePct } })}
            note="Platform and funds together. The one number in this whole model that is known in advance and entirely in your hands, which is why it gets its own field. Over forty years the gap between a cheap tracker and an expensive fund is most of a decade of retirement."
          />
        </div>
        {portfolioRatePct != null ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                patch({
                  returns: {
                    ...inputs.returns,
                    equityPct: REAL_RETURN_ASSUMPTIONS.equityPct,
                  },
                })
              }
            >
              The world index, {REAL_RETURN_ASSUMPTIONS.equityPct}%
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                patch({ returns: { ...inputs.returns, equityPct: portfolioRatePct } })
              }
            >
              What your own holdings blend to, {portfolioRatePct.toFixed(1)}%
            </Button>
          </div>
        ) : null}
        <p className="text-xs leading-relaxed text-muted-foreground">
          {RETURNS_SOURCE}
          {portfolioRatePct != null
            ? ` The second button above is the same blended growth rate Compound's "Your rate" preset shows for what you hold. That figure is nominal, so it is turned real here the same way Compound turns its own mattress line real, by taking off ${COMPOUND_INFLATION_ANNUAL_PCT}% assumed inflation. A portfolio concentrated in one hot theme can still blend well above the world index, so treat it as an optimistic scenario rather than a safe planning assumption.`
            : ""}
        </p>
      </Panel>

      <Panel>
        <PanelHeader
          icon={<SlidersVertical className="h-4 w-4" />}
          title="Your mix, by age"
          subtitle="What share is in shares, and from what age. Everything else is bonds. Add a band for each time it changes."
        />
        <div className={cn(CARD, "flex flex-col gap-3 p-4")}>
          {/*
            A band is a bordered block with its two fields side by side and
            its reading on a row of its own.

            As one wrapping flex row this collapsed on a phone: the two
            fields each took the full width, and the reading and the remove
            button ended up on separate lines at different baselines, so
            three bands read as nine unrelated controls with no way to tell
            which age went with which share. Two columns hold at 390px
            because both fields are short.
          */}
          {sorted.map((seg, i) => (
            <div
              key={`${seg.fromAge}-${i}`}
              className="flex flex-col gap-3 rounded-lg border border-border p-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <CountField
                  label={i === 0 ? "From the start" : "From age"}
                  value={seg.fromAge}
                  min={0}
                  max={110}
                  onChange={(fromAge) => setSegment(i, { fromAge })}
                />
                <PercentField
                  label="In shares"
                  value={seg.equityPct}
                  digits={0}
                  onChange={(equityPct) => setSegment(i, { equityPct })}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 font-mono text-xs tabular-nums text-muted-foreground">
                  earns{" "}
                  {percent(
                    realReturnAt(
                      Math.max(seg.fromAge, inputs.currentAge),
                      sorted,
                      inputs.returns
                    ),
                    1
                  )}{" "}
                  a year
                </span>
                {sorted.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => patch({ glide: sorted.filter((_, j) => j !== i) })}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                patch({
                  glide: [
                    ...sorted,
                    {
                      fromAge: Math.min(
                        110,
                        (sorted[sorted.length - 1]?.fromAge ?? 30) + 10
                      ),
                      equityPct: Math.max(
                        0,
                        (sorted[sorted.length - 1]?.equityPct ?? 100) - 20
                      ),
                    },
                  ],
                })
              }
            >
              Add a band
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => patch({ glide: defaultGlide(inputs.retirementAge) })}
            >
              The ordinary shape
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => patch({ glide: allEquityGlide() })}
            >
              All shares, forever
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                /*
                  The preset prices cash at its own bad case, exactly as the
                  grid's cash column does and from the same constant. Left at
                  the long run 0.9% average, this preset answered a different
                  question from the table two panels down and came out
                  needing less than investing. The field below is still the
                  reader's if they want the average back.
                */
                patch({
                  glide: cashOnlyGlide(),
                  returns: {
                    ...inputs.returns,
                    cashPct: CAUTIOUS_CASH_REAL_PCT,
                  },
                })
              }
            >
              Nothing invested
            </Button>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          At your age now you are{" "}
          <span className="font-mono tabular-nums text-foreground">
            {equityShareAt(inputs.currentAge, sorted)}%
          </span>{" "}
          in shares, and at{" "}
          <span className="font-mono tabular-nums text-foreground">
            {Math.round(inputs.retirementAge)}
          </span>{" "}
          you are{" "}
          <span className="font-mono tabular-nums text-foreground">
            {equityShareAt(inputs.retirementAge, sorted)}%
          </span>
          . A pot that has to last forty years after you stop cannot sit in
          cash, which is what the three figures in the panel above are an
          argument for rather than an opinion about markets.
        </p>
      </Panel>

      <Panel>
        <PanelHeader
          icon={<SlidersVertical className="h-4 w-4" />}
          title="Where the reference figures came from"
          subtitle="None of these are exact, all of them are a year or two old, and every one of them is a field you have already passed higher up this page."
        />
        <div className={cn(CARD, "flex flex-col gap-3 p-4 text-sm")}>
          <div>
            <MicroLabel>The living standards</MicroLabel>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              One published set of baskets for the United Kingdom, after tax
              and with no housing costs in them, moved onto {region.name}&apos;s
              prices with a published comparative price level of{" "}
              <span className="font-mono tabular-nums text-foreground">
                {region.priceLevel}
              </span>{" "}
              against the UK at 100, at a reference exchange rate taken in{" "}
              {FX_REFERENCE_MONTH}. The rate is fixed rather than live: a
              thirty year plan whose inputs moved every fifteen seconds
              because a currency did would be noise dressed as precision.
            </p>
          </div>
          <div>
            <MicroLabel>The state pension</MicroLabel>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              {region.statePensionSource}, starting at{" "}
              <span className="font-mono tabular-nums text-foreground">
                {region.statePensionAge}
              </span>
              .{" "}
              {region.privatePensionAge != null ? (
                <>
                  A private or workplace pension there cannot be touched
                  before{" "}
                  <span className="font-mono tabular-nums text-foreground">
                    {region.privatePensionAge}
                  </span>
                  , which is what creates the years an early retiree has to
                  cover out of ordinary savings.
                </>
              ) : null}{" "}
              If you have a statement, its figure beats this one.
            </p>
          </div>
          <div>
            <MicroLabel>The mortgage, rent and car figures</MicroLabel>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              A plan opens with a mortgage and a car payment already on it. Both
              are UK figures, a {UK_COST_ANCHORS.mortgageSource.toLowerCase()} and
              a {UK_COST_ANCHORS.carSource.toLowerCase()}, moved onto{" "}
              {region.name}&apos;s prices the same way the living standards
              above are. Rent, if you say you rent, and a child, once one is on
              the plan, are moved the same way. Every one of these is a field
              you can type your own number over.
            </p>
          </div>
          <div>
            <MicroLabel>How long the money lasts</MicroLabel>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              A survival curve fitted to the published life expectancy at 65
              for {region.name}, with age specific death rates allowed to keep
              falling as medicine improves. Both the rate and the age the plan
              runs to are controls further up.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
