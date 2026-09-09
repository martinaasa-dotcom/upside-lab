"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
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
import { Map as MapIcon } from "lucide-react";

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

/**
 * Height of an ordinary one-step lane, in pixels.
 *
 * Was 62. A portfolio with a few names clustered in one or two bands
 * (the ordinary case) drew a "hold" lane -- always at least its own
 * 2-step weight, since that height is the real width of the price band
 * and must not shrink just because it is lightly populated -- as a wall
 * of near-empty space around two chips. Shrinking the unit itself keeps
 * every lane's *relative* height (what the band height is supposed to
 * mean) while making the whole chart read as full rather than mostly air.
 */
const LANE_H = 46;

/** Air around the plot, in pixels, so a chip never sits flush on an edge. */
const PLOT_PAD_PX = 20;
/**
 * How far the smallest and the biggest holding's chip sit in from the
 * plot's left and right edges, in pixels, whatever either chip's own
 * width happens to be.
 *
 * Was folded into `PLOT_PAD_PX` (20px), sized for the air this chart
 * wants above and below a chip rather than beside one, and on the
 * widest chip in a wide portfolio that read as the pill about to run
 * off the table. This is the sideways-only figure, bigger on purpose,
 * and it is added on both sides of the widest chip's own width before
 * that half-width becomes the clamp every extreme chip is held inside,
 * which is what keeps the smallest and the biggest chip the same
 * distance from their own edge rather than each keeping only its own
 * half-width of room.
 */
const EDGE_PAD_PX = 32;
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
 * How much bigger a chip is drawn than its own baseline, given how much
 * room each ticker actually has.
 *
 * A portfolio of six names in a chart built to hold thirty reads as
 * mostly empty, and the fix is not a smaller chart, it is a chart that
 * spends the room it has on the chips it is actually drawing. `perTicker`
 * is however many pixels one name gets on the axis it is being laid out
 * along (an axis's own width divided by how many chips are on it, or a
 * screen's own width divided by how many holdings are on the phone
 * strip); `base` is the perTicker figure this chart already reads as
 * comfortable at, so the scale is 1 there and grows past it. It never
 * shrinks below 1: a crowded portfolio keeps today's sizing rather than
 * being squeezed smaller than a reader has already seen.
 *
 * `max` used to reach 3.2, which a plot of six holdings across a wide
 * screen hit almost outright: a pill drawn two and a half times its own
 * size is not "readable", it is oversized, and it drags every lane a
 * crowded band needs room for up with it, since a lane's own height is
 * sized off the chips actually sitting in it. 1.35 (1.3 on the phone
 * strip) still grows a sparse portfolio's chips past a crowded one's, it
 * just stops well short of looking like a different chart.
 */
function chipScaleFor(
  perTicker: number,
  { base, max }: { base: number; max: number }
): number {
  if (!(perTicker > 0)) return 1;
  return Math.min(Math.max(perTicker / base, 1), max);
}

/** The viewport's own width, for sizing the phone strip's chips by it. */
function useViewportWidth(): number {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 390 : window.innerWidth
  );
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

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
        <span className="text-muted-foreground" style={{ marginLeft: "0.4em" }}>
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
function Plot({
  map,
  code,
  chipScale,
}: {
  map: Map;
  code: string;
  chipScale: number;
}) {
  // Lane units into pixels, and nothing else in this file knows about
  // lanes: a chip's own height is already in the same units. Padded top
  // and bottom so the outermost lane's border, and the chip nearest it,
  // never sit flush on the plot's own edge.
  const height = map.units * LANE_H + PLOT_PAD_PX * 2;
  const laneTop = (lane: BandLane) =>
    (map.units - lane.to) * LANE_H + PLOT_PAD_PX;
  const laneHeight = (lane: BandLane) => lane.weight * LANE_H;

  const hold = map.lanes.find((l) => l.id === "hold");
  const anchorAt = hold
    ? (map.units - (hold.from + hold.to) / 2) * LANE_H + PLOT_PAD_PX
    : null;

  return (
    <div className="flex">
      {/*
        The band names are a column of their own rather than captions
        floating in the picture: a label inside the plot is a label a
        chip can land on, and this plot is made of chips that move.
      */}
      <div
        className="relative w-32 shrink-0 lg:w-40"
        style={{ height }}
        aria-hidden
      >
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
              "absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border font-mono tabular-nums transition hover:z-20 hover:brightness-125",
              toneOf(p),
              // The ones at an end of their own plan carry the accent
              // ring on top of their own colour, so the two readings do
              // not compete for the same property.
              p.actionable && "ring-1 ring-primary/70"
            )}
            style={{
              left: `${p.x * 100}%`,
              top: (map.units - p.y) * LANE_H + PLOT_PAD_PX,
              // A chip is drawn bigger the more room the chart has to
              // give each one, rather than sitting at one fixed size
              // whether there are six holdings or thirty. Font size
              // rather than a transform, so the text stays crisp and the
              // measured width this scale is derived from keeps meaning
              // the same thing.
              fontSize: `${0.75 * chipScale}rem`,
              padding: `${0.25 * chipScale}rem ${0.5 * chipScale}rem`,
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
 * The phone's drawing: the ladder as labelled rows of chips, biggest
 * holding first inside each, rather than one full-width card per name.
 *
 * The first version was a card per holding, stacked one under the other,
 * which is a scroll whose length is the size of the portfolio rather
 * than the size of the ladder: twenty holdings was twenty screens'
 * worth of cards to work through. The ladder itself is seven bands
 * however many holdings a reader owns, so a design that costs one row
 * per BAND rather than one row per HOLDING stays the same length
 * whatever is in it. Chips wrap within a band's row exactly as the
 * desktop plot's chips sit across its axis, which is what makes this the
 * same picture rather than a second, poorer one built for a smaller
 * screen.
 *
 * Every band is present even when it is empty, because the shape of the
 * ladder is half of what the reader came for: a portfolio with nothing
 * in the bottom two bands should be able to see that at a glance rather
 * than infer it from an absence.
 */
function Strip({ map, code, scale }: { map: Map; code: string; scale: number }) {
  return (
    <div className="flex flex-col gap-3">
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
              {inLane.length === 0 && <MicroLabel>None</MicroLabel>}
            </div>
            {inLane.length > 0 && (
              <div className="flex flex-wrap gap-2 pl-3">
                {inLane.map((p) => {
                  // Share of the portfolio is drawn as size here rather
                  // than as a bar of its own: a bigger holding gets a
                  // bigger pill, which is the same reading a bubble
                  // chart gives and costs no extra row.
                  const shareScale =
                    map.topShare > 0
                      ? 1 + 0.6 * Math.sqrt(Math.max(p.share, 0) / map.topShare)
                      : 1;
                  return (
                    <Link
                      key={p.ticker}
                      href={companyHref(p.ticker)}
                      title={`${cashtag(p.ticker)}: ${currency(p.spot, 2, code)}, ${percent(p.share, 1)} of this portfolio, in the band your plan calls "${p.bandLabel}"`}
                      className={cn(
                        "flex min-w-[4.5rem] flex-col gap-1 rounded-xl border px-3 py-2 outline-none transition active:brightness-110 focus-visible:ring-1 focus-visible:ring-ring/50",
                        toneOf(p),
                        p.actionable && "ring-1 ring-primary/70"
                      )}
                      style={{ fontSize: `${0.8125 * scale * shareScale}rem` }}
                    >
                      <span className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
                        <span className="font-semibold">
                          {cashtag(p.ticker)}
                        </span>
                        <span
                          className="text-muted-foreground"
                          style={{ fontSize: "0.78em" }}
                        >
                          {percent(p.share, 0)}
                        </span>
                      </span>
                      <span
                        className="flex items-baseline justify-between gap-2 font-mono tabular-nums text-muted-foreground"
                        style={{ fontSize: "0.72em" }}
                      >
                        <span>{currency(p.spot, 2, code)}</span>
                        {p.roiPct !== null && (
                          <span
                            className={p.roiPct >= 0 ? "text-gain" : "text-loss"}
                          >
                            {signedPercent(p.roiPct)}
                          </span>
                        )}
                      </span>
                      {/*
                        WHERE IN THE BAND, WHICH THE BAND NAME ALONE DOES
                        NOT SAY. A price a hair under the level above it
                        and one sitting in the middle of the same band
                        are different situations, and the second is the
                        one worth doing nothing about. Drawn as a thin
                        track the width of the pill rather than a whole
                        second row, so the extra reading costs four
                        pixels of height rather than a whole line.
                      */}
                      {p.withinBand !== null ? (
                        <span
                          aria-hidden
                          className="relative mt-0.5 h-1 w-full overflow-hidden rounded-full bg-foreground/10"
                        >
                          <span
                            className={cn(
                              "absolute inset-y-0 w-1 rounded-full",
                              p.actionable ? "bg-primary" : "bg-foreground/50"
                            )}
                            style={{
                              left: `calc(${Math.min(Math.max(p.withinBand, 0.04), 0.96) * 100}% - 2px)`,
                            }}
                          />
                        </span>
                      ) : (
                        // An open band has one edge and no position, so
                        // it gets the direction said as an arrow rather
                        // than a track with nothing on it.
                        <span
                          aria-hidden
                          className="mt-0.5 text-center leading-none text-muted-foreground"
                          style={{ fontSize: "0.6em" }}
                        >
                          {p.bandTo === null ? "▲" : "▼"}
                        </span>
                      )}
                      <span className="sr-only">
                        , in the band your plan calls {p.bandLabel}
                      </span>
                    </Link>
                  );
                })}
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
        // `buildBandMap` clamps a chip's centre to half its own width in
        // from each edge, which is exactly enough room for the chip
        // itself and none left over: the outermost holding's edge lands
        // flush on the plot's own border. Padding the width fed in here
        // (rather than the plot's own CSS padding, which an absolutely
        // positioned child's percentage `left` ignores) buys genuine air
        // on both sides without changing that clamp's logic at all, and
        // it is `EDGE_PAD_PX` rather than `PLOT_PAD_PX` because this is
        // sideways room, not the air above and below a chip.
        ...(size.plot > 0
          ? { chipWidth: (size.chip + EDGE_PAD_PX * 2) / size.plot }
          : {}),
      }),
    [rows, size]
  );

  const viewportWidth = useViewportWidth();

  /*
    A chip is drawn bigger the more room the chart actually has: a wide
    monitor with six holdings gives each one far more than the 92px this
    chart was built comfortable at, and drawing them at that floor
    regardless is the dead space the chart used to read as. Never smaller
    than that floor, only bigger, so a crowded portfolio keeps the sizing
    a reader has already seen.
  */
  const chipScale = chipScaleFor(
    size.plot > 0 ? size.plot / Math.max(map.points.length, 1) : 0,
    { base: 220, max: 1.35 }
  );
  const mobileScale = chipScaleFor(
    (viewportWidth - 96) / Math.max(map.points.length, 1),
    { base: 130, max: 1.3 }
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
        <Plot map={map} code={code} chipScale={chipScale} />
        <div className="flex">
          <div className="w-32 shrink-0 lg:w-40" />
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
        <Strip map={map} code={code} scale={mobileScale} />
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
