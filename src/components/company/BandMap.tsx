"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import { WhyThis } from "@/components/ui/WhyThis";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { cashtag, cn, currency, percent, signedPercent } from "@/lib/format";
import { bandMapProvenance } from "@/lib/provenance";
import { companyHref } from "@/lib/company/client";
import {
  CHIP_WIDTH_PX,
  buildBandMap,
  type BandLane,
  type BandMap as Map,
  type BandMapPoint,
} from "@/lib/company/band-map";
import type { PlanLadder } from "@/lib/company/plan-ladder";
import { ChevronRight, Map as MapIcon } from "lucide-react";

/**
 * Every holding on one ladder.
 *
 * A band is a multiple of that name's own anchor, so the ladder is a
 * unit every company shares even though their prices are not: two names
 * in the same band are in the same place in their own plans whether one
 * trades at $2 and the other at $2,000.
 *
 * **Two drawings, not one, and the phone gets the better of them.** A
 * scatter needs width to say anything, and at 390px the plot is 215px
 * across, which is three chips: an axis that cannot separate its own
 * points is furniture. Below `sm` the same model is drawn as a ladder of
 * sections, one per band, each holding a row carrying its ticker, its
 * share as a bar, its price and how far it is from the next level. That
 * is more information than the plot gives, not less, and it is the same
 * numbers. The forecast panel already splits this way for the same
 * reason.
 *
 * What the picture must never become: a score. Both axes are figures
 * printed elsewhere in the app, and nothing here adds them up.
 */

/** Height of an ordinary one-step lane, in pixels. */
const LANE_H = 62;
/**
 * A chip's height, plus a little air, as a fraction of an ordinary lane.
 *
 * Measured off a rendered chip rather than typed, for the same reason the
 * width is: a guess four pixels short draws two tickers through each
 * other, and four pixels is well inside what a font or a padding change
 * moves this by. The constant is only the value before the first
 * measurement, and it is deliberately generous.
 */
const CHIP_H_PX = 30;

/**
 * Colour says what the reader has made or lost on the holding, which is
 * what these two mean everywhere else in this app.
 *
 * Deliberately NOT spent on where the price sits against its plan, which
 * was the first version: that is the height, and attaching a second
 * meaning to a fixed pair is how a holding in profit ends up drawn in
 * the colour of a loss. The two questions are independent and the
 * picture answers both at once, which is the whole reason to draw it.
 */
function toneOf(point: BandMapPoint): string {
  if (point.roiPct === null) return "border-border bg-card text-foreground";
  return point.roiPct >= 0
    ? "border-gain/40 bg-gain/10 text-foreground"
    : "border-loss/40 bg-loss/10 text-foreground";
}

function Chip({
  point,
  code,
  compact,
}: {
  point: BandMapPoint;
  code: string;
  compact?: boolean;
}) {
  return (
    <>
      <span className="font-semibold">{cashtag(point.ticker)}</span>
      {!compact && (
        <span className="ml-1.5 text-muted-foreground">
          {percent(point.share, 0)}
        </span>
      )}
      <span className="sr-only">
        , {currency(point.spot, 2, code)}, in the band your plan calls{" "}
        {point.bandLabel}
      </span>
    </>
  );
}

/** The plot, at `sm` and up, where an axis has the width to mean something. */
function Plot({ map, code }: { map: Map; code: string }) {
  // Lane units into pixels, and nothing else in this file knows about
  // lanes: a chip's own height is already in the same units.
  const height = map.units * LANE_H;
  const laneTop = (lane: BandLane) => (map.units - lane.to) * LANE_H;
  const laneHeight = (lane: BandLane) => lane.weight * LANE_H;

  const hold = map.lanes.find((l) => l.id === "hold");
  const anchorAt = hold
    ? (map.units - (hold.from + hold.to) / 2) * LANE_H
    : null;

  return (
    <div className="flex">
      {/*
        The band names are a column of their own rather than captions
        floating in the picture: a label inside the plot is a label a
        chip can land on, and this plot is made of chips that move.
      */}
      <div className="relative w-40 shrink-0" style={{ height }} aria-hidden>
        {map.lanes.map((lane) => (
          <div
            key={lane.id}
            className="absolute right-0 flex w-full items-center justify-end pr-3"
            style={{ top: laneTop(lane), height: laneHeight(lane) }}
          >
            <span
              className={cn(
                "text-right text-xs leading-tight",
                lane.actionable ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {lane.label}
            </span>
          </div>
        ))}
      </div>

      <div
        className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-border"
        style={{ height }}
      >
        {map.lanes.map((lane) => (
          <div
            key={lane.id}
            className={cn(
              "absolute inset-x-0 border-b border-border last:border-b-0",
              // The ends of the ladder are the two places anything is
              // worth acting on, so they carry the accent and the middle
              // carries nothing.
              lane.actionable && "bg-primary/[0.05]"
            )}
            style={{ top: laneTop(lane), height: laneHeight(lane) }}
          />
        ))}

        {/*
          The estimate itself, across the middle of the "hold" band, which
          is where the anchor sits by construction: every band on this
          ladder is a multiple of it, and the picture said nothing about
          it before. Read off that band rather than from the middle of
          the picture, because the lanes are not all the same height.
        */}
        {anchorAt !== null && (
          <>
            <div
              className="absolute inset-x-0 border-t border-dashed border-primary/40"
              style={{ top: anchorAt }}
              aria-hidden
            />
            <span
              className="absolute left-2 -translate-y-1/2 rounded bg-background/80 px-1 font-mono text-xs uppercase tracking-wide text-primary/80"
              style={{ top: anchorAt }}
              aria-hidden
            >
              Estimate
            </span>
          </>
        )}

        {map.points.map((p) => (
          <Link
            key={p.ticker}
            href={companyHref(p.ticker)}
            data-band-chip=""
            title={`${cashtag(p.ticker)}: ${currency(p.spot, 2, code)}, ${percent(p.share, 1)} of this portfolio, in the band your plan calls "${p.bandLabel}"`}
            className={cn(
              "absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border px-2 py-1 font-mono text-xs tabular-nums transition hover:z-20 hover:brightness-125",
              toneOf(p),
              // The ones at an end of their own plan carry the accent
              // ring on top of their own colour, so the two readings do
              // not compete for the same property.
              p.actionable && "ring-1 ring-primary/70"
            )}
            style={{
              left: `${p.x * 100}%`,
              top: (map.units - p.y) * LANE_H,
            }}
          >
            <Chip point={p} code={code} />
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * The phone's drawing: the ladder as sections, biggest holding first
 * inside each.
 *
 * Every band is present even when it is empty, because the shape of the
 * ladder is half of what the reader came for: a portfolio with nothing
 * in the bottom two bands should be able to see that at a glance rather
 * than infer it from an absence.
 */
function Sections({ map, code }: { map: Map; code: string }) {
  return (
    <div className="flex flex-col gap-2">
      {map.lanes.map((lane) => {
        const inLane = map.points
          .filter((p) => p.bandId === lane.id)
          .sort((a, b) => b.share - a.share);
        return (
          <div key={lane.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <p
                className={cn(
                  "flex min-w-0 items-center gap-2 text-sm",
                  lane.actionable
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-3 w-1 shrink-0 rounded-full",
                    lane.actionable ? "bg-primary" : "bg-border"
                  )}
                />
                {lane.label}
              </p>
              <MicroLabel>
                {inLane.length === 0 ? "None" : `${inLane.length}`}
              </MicroLabel>
            </div>
            {inLane.length > 0 && (
              <div className="flex flex-col gap-1.5 pl-3">
                {inLane.map((p) => (
                  <Link
                    key={p.ticker}
                    href={companyHref(p.ticker)}
                    className="block rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
                  >
                    <Card
                      className={cn(
                        "flex items-center gap-3 border-l-2 p-3",
                        p.actionable ? "border-l-primary" : "border-l-border"
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="flex min-w-0 items-baseline gap-2">
                            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                              {cashtag(p.ticker)}
                            </span>
                            {/*
                              The price, which the plot leaves to a
                              tooltip and a phone has no tooltip for.
                            */}
                            <span className="truncate font-mono text-xs tabular-nums text-muted-foreground">
                              {currency(p.spot, 2, code)}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "font-mono text-xs tabular-nums",
                              p.roiPct === null
                                ? "text-muted-foreground"
                                : p.roiPct >= 0
                                  ? "text-gain"
                                  : "text-loss"
                            )}
                          >
                            {p.roiPct === null ? "" : signedPercent(p.roiPct)}
                          </span>
                        </span>
                        {/*
                          The share as a bar, which is the across axis of
                          the plot doing its job in the room a phone
                          actually has: a row each, so ten holdings at a
                          tenth apiece are ten bars of the same length
                          rather than ten chips on one spot.
                        */}
                        <span className="mt-1.5 flex items-center gap-2">
                          <span
                            aria-hidden
                            className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10"
                          >
                            <span
                              className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
                              style={{
                                width: `${
                                  map.topShare > 0
                                    ? Math.max((p.share / map.topShare) * 100, 3)
                                    : 3
                                }%`,
                              }}
                            />
                          </span>
                          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                            {percent(p.share, 1)}
                          </span>
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                      />
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function BandMap({
  rows,
  code = "USD",
  at,
  title = "Where your holdings sit on their own plans",
}: {
  rows: Array<{
    ticker: string;
    ladder: PlanLadder | null;
    value: number;
    roiPct?: number | null;
  }>;
  code?: string;
  at?: string | null;
  title?: string;
}) {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{
    plot: number;
    chip: number;
    chipH: number;
  }>({ plot: 0, chip: CHIP_WIDTH_PX, chipH: CHIP_H_PX });

  /*
    How wide a chip is as a fraction of the axis is a fact about the
    device rather than about the portfolio, and half a chip is exactly
    the margin that decides whether the outermost holding is cut off, so
    it is measured off the widest chip actually drawn. It settles in one
    pass: moving a chip never changes how wide it is.
  */
  useEffect(() => {
    const node = plotRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const read = () => {
      const chips = node.querySelectorAll<HTMLElement>("[data-band-chip]");
      let chip = CHIP_WIDTH_PX;
      let chipH = CHIP_H_PX;
      chips.forEach((c) => {
        chip = Math.max(chip, c.offsetWidth);
        // Four pixels of air, so two chips that have been separated do
        // not sit with their borders touching.
        chipH = Math.max(chipH, c.offsetHeight + 4);
      });
      setSize((prev) =>
        prev.plot === node.clientWidth &&
        prev.chip === chip &&
        prev.chipH === chipH
          ? prev
          : { plot: node.clientWidth, chip, chipH }
      );
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const map = useMemo(
    () =>
      buildBandMap(rows, {
        chipHeight: size.chipH / LANE_H,
        ...(size.plot > 0 ? { chipWidth: size.chip / size.plot } : {}),
      }),
    [rows, size]
  );

  if (map.points.length === 0) return null;

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            {title}
            <WhyThis
              provenance={bandMapProvenance({ count: map.points.length, at })}
            />
          </span>
        }
        subtitle="Every name on its own price plan, so two in the same band are in the same place in their own plans whatever their prices are. Green and red are what you are up or down on each one, which is a different question from where its price sits."
        icon={<MapIcon className="h-4 w-4" />}
      />

      <div className="hidden flex-col gap-2 sm:flex" ref={plotRef}>
        <Plot map={map} code={code} />
        <div className="flex">
          <div className="w-40 shrink-0" />
          <div className="flex min-w-0 flex-1 items-center justify-between">
            {/*
              An ordering, said as one. The axis is not the share itself:
              ten holdings at a tenth each are the same figure and would
              land on one spot, so the smallest is on the left and the
              biggest on the right, and each chip prints its own share.
            */}
            <MicroLabel>Smallest holding</MicroLabel>
            <MicroLabel>Biggest, {percent(map.topShare, 0)}</MicroLabel>
          </div>
        </div>
      </div>

      <div className="sm:hidden">
        <Sections map={map} code={code} />
      </div>

      {map.missing.length > 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Not on this: {map.missing.map((t) => cashtag(t)).join(", ")}. A plan
          needs a price and something to anchor on, and one of those is
          missing for {map.missing.length === 1 ? "that one" : "those"}.
        </p>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {"Height is that name's own plan, not a score, and the two are only comparable because every band is a multiple of that company's own anchor. Tap a name to open its plan and change any level. "}
        {ADVICE_DISCLAIMER_SHORT}
      </p>
    </Panel>
  );
}
