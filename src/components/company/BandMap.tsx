"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import { WhyThis } from "@/components/ui/WhyThis";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { cashtag, cn, currency, percent } from "@/lib/format";
import { bandMapProvenance } from "@/lib/provenance";
import { companyHref } from "@/lib/company/client";
import {
  CHIP_WIDTH_PX,
  buildBandMap,
  type BandMapPoint,
} from "@/lib/company/band-map";
import type { PlanLadder } from "@/lib/company/plan-ladder";
import { Map as MapIcon } from "lucide-react";

/**
 * Every holding on one ladder.
 *
 * The reason this can exist at all is that a band is a multiple of that
 * name's own anchor, so the ladder is a unit every company shares even
 * though their prices do not. Height is which band a holding is in and
 * how far through it; across is how much of the portfolio it is. The
 * corners are the point: bottom left is a small holding at the bottom of
 * its own plan, top right is a big one at the top of one.
 *
 * Two things it must never become. It is not a score: both axes are
 * figures printed elsewhere in the app, drawn against each other, and
 * nothing here adds them up. And it is not an instruction: the band names
 * are the reader's own plan, every chip opens that company's page where
 * the levels can be changed, and the legal line is said once at the foot.
 */

/** Lane height in pixels, per row of chips inside it. */
const ROW_H = 34;
/** The shortest a lane may be, so an empty one still reads as a lane. */
const LANE_MIN_H = 40;

/**
 * Colour marks that a name has reached an end of its plan, and nothing
 * else.
 *
 * Deliberately NOT the gain and loss pair, which was the first version.
 * Emerald and rose mean one thing in this app, money made and money
 * lost, and a price at the top of its plan is very often a holding in
 * profit: tinting it rose would attach a second meaning to a fixed pair
 * and read as a loss on a name that is up. Which end of the ladder a
 * chip is at is already said by where it is drawn and by the lane it is
 * in, so the accent only has to say "this one is at an end".
 */
function chipTone(point: BandMapPoint): string {
  return point.actionable
    ? "border-primary/60 bg-primary/15 text-foreground"
    : "border-border bg-card text-muted-foreground";
}

export function BandMap({
  rows,
  code = "USD",
  at,
  title = "Where your holdings sit on their own plans",
}: {
  rows: Array<{ ticker: string; ladder: PlanLadder | null; value: number }>;
  code?: string;
  at?: string | null;
  title?: string;
}) {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ plot: number; chip: number }>({
    plot: 0,
    chip: CHIP_WIDTH_PX,
  });

  /*
    How wide a chip is as a fraction of the axis is a fact about the
    device, not about the portfolio, so it is measured rather than
    guessed: the same six holdings pack onto one row on a laptop and three
    on a phone, and a guess would either overlap chips or waste height.
  */
  useEffect(() => {
    const node = plotRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const read = () => {
      /*
        The widest chip that is actually drawn, not an estimate of one.
        A ticker is between two and five characters, so a guess is wrong
        by half a chip either way, and half a chip is exactly the margin
        that decides whether the outermost holding is cut off. Reading it
        back settles in one pass: packing moves chips between rows and
        never changes how wide they are.
      */
      const chips = node.querySelectorAll<HTMLElement>("[data-band-chip]");
      let chip = CHIP_WIDTH_PX;
      chips.forEach((c) => {
        chip = Math.max(chip, c.offsetWidth);
      });
      setSize((prev) =>
        prev.plot === node.clientWidth && prev.chip === chip
          ? prev
          : { plot: node.clientWidth, chip }
      );
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const map = useMemo(
    () =>
      buildBandMap(
        rows,
        // Before the first measurement the model's own conservative
        // default stands, which over-packs by a row rather than putting
        // two chips on top of each other for a frame.
        size.plot > 0 ? { chipWidth: size.chip / size.plot } : {}
      ),
    [rows, size]
  );

  if (map.points.length === 0) return null;

  const laneHeight = (id: string) =>
    Math.max(LANE_MIN_H, (map.laneRows[id] ?? 1) * ROW_H + 6);

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            {title}
            <WhyThis
              provenance={bandMapProvenance({
                count: map.points.length,
                at,
              })}
            />
          </span>
        }
        subtitle="Each name is drawn on its own price plan, so two holdings in the same band are in the same place in their own plans whatever their prices are. Across is how much of this portfolio each one is, and a crowded band stacks, highest in the band on top."
        icon={<MapIcon className="h-4 w-4" />}
      />

      <div className="flex flex-col gap-2">
        <div className="flex">
          {/*
            The lane names are a column of their own rather than captions
            floating in the plot: a label inside the picture is a label a
            chip can land on, and this picture is made of chips that move.
          */}
          <div className="w-24 shrink-0 sm:w-44" aria-hidden>
            {map.lanes.map((lane) => (
              <div
                key={lane.id}
                className="flex items-center justify-end pr-3"
                style={{ height: laneHeight(lane.id) }}
              >
                <span
                  className={cn(
                    "text-right text-xs leading-tight",
                    lane.actionable
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {lane.label}
                </span>
              </div>
            ))}
          </div>

          <div
            ref={plotRef}
            className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-border"
          >
            {map.lanes.map((lane, i) => (
              <div
                key={lane.id}
                className={cn(
                  "relative",
                  i > 0 && "border-t border-border",
                  // The two ends of the ladder are tinted so the shape of
                  // the picture reads before any chip does.
                  lane.actionable && "bg-primary/[0.04]"
                )}
                style={{ height: laneHeight(lane.id) }}
              >
                {map.points
                  .filter((p) => p.bandId === lane.id)
                  .map((p) => (
                    <Link
                      key={p.ticker}
                      href={companyHref(p.ticker)}
                      title={`${cashtag(p.ticker)}: ${currency(p.spot, 2, code)}, ${percent(p.share, 1)} of this portfolio, in the band your plan calls "${p.bandLabel}"`}
                      data-band-chip=""
                      className={cn(
                        "absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-full border px-2 py-1 font-mono text-xs tabular-nums transition hover:z-20 hover:brightness-125",
                        chipTone(p)
                      )}
                      style={{
                        // `x` is already held half a chip in from either
                        // end by the model, which is the only place that
                        // may move a chip: whatever moves one has to be
                        // the thing that decides which row it goes on.
                        left: `${p.x * 100}%`,
                        top: p.row * ROW_H + 4,
                      }}
                    >
                      {cashtag(p.ticker)}
                    </Link>
                  ))}
              </div>
            ))}
          </div>
        </div>

        {/* The across axis, under the plot and only under the plot. */}
        <div className="flex">
          <div className="w-24 shrink-0 sm:w-44" />
          <div className="flex min-w-0 flex-1 items-center justify-between">
            {/*
              Two words each, because these wrap on a phone otherwise and
              a wrapped axis label reads as a sentence that ran out of
              room rather than as the end of an axis.
            */}
            <MicroLabel>Smaller</MicroLabel>
            <MicroLabel>Bigger, to {percent(map.topShare, 0)}</MicroLabel>
          </div>
        </div>
      </div>

      {map.missing.length > 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Not on the map: {map.missing.map((t) => cashtag(t)).join(", ")}.
          A plan needs a price and a target, and one of those is missing
          for {map.missing.length === 1 ? "that one" : "those"}.
        </p>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {"Height is that name's own plan, not a score, and the two are only comparable because every band is a multiple of that company's own anchor. Tap a name to open its plan and change any level. "}
        {ADVICE_DISCLAIMER_SHORT}
      </p>
    </Panel>
  );
}
