"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import { WhyThis } from "@/components/ui/WhyThis";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { NO_VALUE, cashtag, cn, currency, percent } from "@/lib/format";
import { bandMapProvenance } from "@/lib/provenance";
import { companyHref } from "@/lib/company/client";
import {
  TINY_SHARE,
  barShares,
  buildBandMap,
  foldToFit,
  type BandMap as Map,
  type BandMapBand,
  type BandMapPoint,
} from "@/lib/company/band-map";
import { bandRangeSaid, type PlanLadder } from "@/lib/company/plan-ladder";
import { Map as MapIcon } from "lucide-react";

/**
 * Every holding on one ladder: a bar per band, one block per holding.
 *
 * A band is a multiple of that name's own fair value, so the ladder is
 * a unit every company shares even though their prices are not. **The
 * bar's length is how much of the reader's money is in that band**,
 * which is the reading nothing else in the app gives: a portfolio
 * mostly priced under fair value looks different at a glance from one
 * mostly priced over it, and no list of prices shows that.
 *
 * Three rules the first version had to learn, all of them about a
 * picture whose proportions moved with the portfolio. **A row is a
 * fixed height, always**: a lane sized off whatever band happened to be
 * crowded made the same ladder read differently on two portfolios.
 * **Blocks are laid out, never placed**, so two names cannot overlap
 * however many are in one band. And **colour is one dot**: a tinted
 * pill plus a tinted border plus an accent ring is three signals over
 * one object, which is what made it look muddy against the near black.
 *
 * An empty band is drawn, and drawn quieter. The shape of the whole
 * ladder is half of what a reader came for, so a band with nothing in
 * it keeps its row and its height and loses its ink.
 */

/** How tall one band's row is. Never varies, on any portfolio. */
const ROW_H = 68;

/**
 * The narrowest a block may be drawn and still print its own name.
 *
 * Five characters of 12px mono plus the gain dot, the gaps and the
 * padding. Measured against the longest ordinary ticker rather than
 * guessed: a block one character short truncates somebody's holding.
 */
const BLOCK_MIN_PX = 72;
/** The hairline between two blocks. */
const BLOCK_GAP_PX = 3;
/** A "+N" block carries a count rather than a name, so it needs less. */
const REST_MIN_PX = 58;
/**
 * How wide a block has to be before it prints its own share as well as
 * its name.
 *
 * A PHONE HAS NO HOVER, so what is not on the block is not readable at
 * all: the tooltip carrying the price and the share is a laptop's
 * privilege, and the first version left a phone reader with a ticker
 * and a coloured dot. The share is the figure this picture is about, so
 * the blocks with the room for it say it, and the ones without stay a
 * name rather than truncating one. Which blocks those are is arithmetic
 * on the bar's own width, not a guess: 116px is the name, the dot, the
 * gaps, the padding and four characters of "100%".
 */
const SHARE_AT_PX = 116;

/**
 * How wide the bar column actually is, which is what decides how many
 * names can be drawn in it.
 *
 * HOW MANY BLOCKS FIT IS A FACT ABOUT THE DEVICE, NOT ABOUT THE
 * PORTFOLIO. A fixed cap in the model was wrong in both directions: six
 * blocks at their own minimum width is 411px, which a 390px phone does
 * not have, and a 1440px laptop has room for a dozen. Measured here and
 * folded here, so the same portfolio reads right on both.
 */
function useBarWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const read = () => setWidth(node.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** How many blocks a bar that wide can carry without crushing them. */
export function blocksThatFit(width: number): number {
  if (!(width > 0)) return 6;
  return Math.max(
    1,
    Math.floor((width + BLOCK_GAP_PX) / (BLOCK_MIN_PX + BLOCK_GAP_PX))
  );
}

function Dot({ roi }: { roi: number | null }) {
  return (
    <span
      aria-hidden
      className={cn(
        "h-1.5 w-1.5 shrink-0 rounded-full",
        roi === null
          ? "bg-muted-foreground/40"
          : roi >= 0
            ? "bg-gain"
            : "bg-loss"
      )}
    />
  );
}

/** One holding, as a block of its band's bar. */
function Block({
  point,
  grow,
  code,
  showShare,
}: {
  point: BandMapPoint;
  /**
   * This holding's share OF ITS OWN BAND, not of the portfolio.
   *
   * The bar already carries the band's share of the portfolio in its
   * own width, so the blocks divide that bar between themselves. Growing
   * them by their portfolio share instead looks equivalent and is not:
   * flex distributes only the SUM of the grow factors when that sum is
   * under 1, so a band holding 55% of the money filled 55% of its own
   * bar and left the rest empty, and the length a reader actually saw
   * went as the square of the share. Measured on a real book, three
   * names in a 294px bar all sat at their 72px floor with 71px of the
   * bar unfilled beside them.
   */
  grow: number;
  code: string;
  /** Wide enough to carry its own share as well as its name. */
  showShare?: boolean;
}) {
  const roi =
    point.roiPct === null
      ? ""
      : `, ${point.roiPct >= 0 ? "up" : "down"} ${percent(Math.abs(point.roiPct), 1)} on what you paid`;
  return (
    <Link
      href={companyHref(point.ticker)}
      data-band-chip=""
      title={`${cashtag(point.ticker)}: ${currency(point.spot, 2, code)}, ${percent(point.share, 1)} of this portfolio, in the band your plan calls "${point.bandLabel}"`}
      className={cn(
        "flex min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-md border px-2",
        "border-border/60 bg-card font-mono text-xs tabular-nums text-foreground",
        "transition hover:border-border hover:bg-card",
        "outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
        point.actionable && "border-primary/45 bg-primary/[0.08]"
      )}
      style={{ flexGrow: Math.max(grow, 0.0001), flexBasis: 0, minWidth: BLOCK_MIN_PX }}
    >
      <Dot roi={point.roiPct} />
      <span className="truncate font-semibold tracking-tight">
        {point.ticker}
      </span>
      {showShare && (
        <span aria-hidden className="text-muted-foreground">
          {sharePct(point.share)}
        </span>
      )}
      <span className="sr-only">
        , {currency(point.spot, 2, code)}, {percent(point.share, 1)} of this
        portfolio{roi}
      </span>
    </Link>
  );
}

/**
 * What a band says about the names it did not draw.
 *
 * Never a silent drop: the count is here and so is what they come to
 * together, and the wording says which cutoff did it, since "+3 under
 * 3%" and "+3 more" are different facts about somebody's money.
 */
function Rest({ folded, grow }: { folded: BandMapPoint[]; grow: number }) {
  const share = folded.reduce((s, p) => s + p.share, 0);
  const allTiny = folded.every((p) => p.share < TINY_SHARE);
  return (
    <span
      className="flex items-center justify-center whitespace-nowrap rounded-md border border-dashed border-border/50 px-2 font-mono text-xs tabular-nums text-muted-foreground"
      style={{ flexGrow: Math.max(grow, 0.0001), flexBasis: 0, minWidth: REST_MIN_PX }}
      title={`${folded.map((p) => cashtag(p.ticker)).join(", ")}: ${percent(share, 1)} of this portfolio together`}
    >
      <span aria-hidden>
        +{folded.length}
        {allTiny ? " small" : " more"}
      </span>
      <span className="sr-only">
        and {folded.length} not drawn here:{" "}
        {folded.map((p) => cashtag(p.ticker)).join(", ")},{" "}
        {percent(share, 1)} of this portfolio together
      </span>
    </span>
  );
}

/** A band nothing is in: same row, same height, a fraction of the ink. */
function EmptyTrack() {
  return (
    <span
      aria-hidden
      className="h-[3px] w-24 rounded-full bg-foreground/[0.06] sm:w-32"
    />
  );
}

function Row({
  band,
  widest,
  code,
}: {
  band: BandMapBand;
  widest: number;
  code: string;
}) {
  const [barRef, barWidth] = useBarWidth<HTMLDivElement>();
  const filled = band.items.length > 0;
  const { shown, folded } = foldToFit(band.items, blocksThatFit(barWidth));
  /*
    The floor is what these blocks actually need, counted per block:
    the folded "+N" is narrower than a name, so counting it as a name
    overstates the floor and `max-width` then clips the bar's own end.
  */
  const slots = shown.length + (folded.length > 0 ? 1 : 0);
  const floorPx =
    shown.length * BLOCK_MIN_PX +
    (folded.length > 0 ? REST_MIN_PX : 0) +
    Math.max(slots - 1, 0) * BLOCK_GAP_PX;

  /*
    What each block will actually be drawn at, so a block can be asked
    to carry its own share only where there is room for it. The same
    arithmetic the browser is about to do: the bar's own width shared
    out by each block's share, with every block held at its floor.
  */
  const barPx = Math.max((band.share / widest) * (barWidth || 0), floorPx);
  const shareSum = shown.reduce((sum, p) => sum + p.share, 0) || 1;
  const { grows, rest } = barShares({
    bandShare: band.share,
    shown: shown.map((p) => p.share),
    folded: folded.map((p) => p.share),
  });
  const spare =
    barPx -
    Math.max(slots - 1, 0) * BLOCK_GAP_PX -
    (folded.length > 0 ? REST_MIN_PX : 0);
  const widthOf = new Map(
    shown.map((p) => [
      p.ticker,
      Math.max((p.share / shareSum) * spare, BLOCK_MIN_PX),
    ])
  );
  return (
    <div
      className={cn(
        "flex flex-col justify-center gap-2 border-b border-border/40 px-4 py-3 last:border-b-0",
        "sm:flex-row sm:items-center sm:gap-6 sm:px-5 sm:py-0",
        filled ? "bg-foreground/[0.022]" : "bg-transparent"
      )}
      style={{ minHeight: ROW_H }}
    >
      <div
        className={cn(
          "flex shrink-0 flex-col gap-0.5 sm:w-64 sm:justify-center",
          // Quieter, not unreadable: an empty band is still a step of
          // the ladder a reader is entitled to read.
          !filled && "opacity-60"
        )}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span
            className={cn(
              "text-sm leading-tight",
              filled
                ? band.actionable
                  ? "font-medium text-foreground"
                  : "text-foreground/90"
                : "text-muted-foreground"
            )}
          >
            {band.label}
          </span>
          {/* The share has its own column from `sm` up, so on a phone it
              rides with the label rather than being dropped. */}
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground sm:hidden">
            {sharePct(band.share)}
          </span>
        </div>
        <span className="font-mono text-xs leading-tight text-muted-foreground/70">
          {bandRangeSaid(band)}
        </span>
      </div>

      {/*
        A fixed height, so a band with nothing in it is exactly as tall
        as one with a bar: on a phone the row stacks, and without this
        an empty band collapsed to its own hairline and the ladder went
        uneven again on the one screen where it is hardest to see.
      */}
      <div
        ref={barRef}
        /*
          `flex-1` only from `sm`, where the row is a row and the main
          axis is the width. On a phone the row stacks, so `flex-1`
          would be a height of zero that grows by nothing and the fixed
          height would lose to it.
        */
        className="flex h-9 w-full min-w-0 shrink-0 items-center sm:w-auto sm:flex-1"
      >
        {filled ? (
          <div
            className="flex h-9 items-stretch gap-[3px] overflow-hidden rounded-lg"
            style={{
              /*
                The bar is how much of the portfolio is in this band,
                but never so short that a block cannot print the name it
                stands for: a bar showing a dot and no ticker is a bar
                saying nothing. The floor is what its own blocks need.
              */
              width: `max(${(band.share / widest) * 100}%, ${floorPx}px)`,
              maxWidth: "100%",
            }}
          >
            {shown.map((p, i) => (
              <Block
                key={p.ticker}
                point={p}
                grow={grows[i] ?? 0}
                code={code}
                showShare={(widthOf.get(p.ticker) ?? 0) >= SHARE_AT_PX}
              />
            ))}
            {folded.length > 0 && (
              <Rest folded={folded} grow={rest} />
            )}
          </div>
        ) : (
          <EmptyTrack />
        )}
      </div>

      <span
        className={cn(
          "hidden w-12 shrink-0 text-right font-mono text-xs tabular-nums sm:block",
          filled ? "text-muted-foreground" : "text-muted-foreground/25"
        )}
      >
        {sharePct(band.share)}
      </span>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "card-sheen glass-well rounded-xl px-4 py-3.5",
        accent && "ring-1 ring-inset ring-primary/30"
      )}
    >
      <MicroLabel>{label}</MicroLabel>
      <p
        className={cn(
          "pt-2 font-mono text-2xl leading-none tabular-nums",
          accent ? "text-primary" : "text-foreground"
        )}
      >
        {value}
      </p>
      <p className="pt-2 text-xs leading-snug text-muted-foreground">
        {sub}
      </p>
    </div>
  );
}

/**
 * A SHARE IS NEVER ROUNDED INTO OR OUT OF EXISTENCE.
 *
 * `percent(0.004, 0)` is "0%", which beside a bar with a name in it is
 * this app stating as fact that a holding it is drawing is worth
 * nothing. "none" is the same lie in the other direction: it is right
 * for a band that really is empty and wrong for one holding half a per
 * cent of the portfolio. So there are three answers, and the middle one
 * is the one that was missing.
 */
function sharePct(v: number): string {
  if (!(v > 0)) return "0%";
  return v < 0.005 ? "<1%" : percent(v, 0);
}

/** The same three answers, for a sentence rather than a column. */
function sharePhrase(v: number): string {
  if (!(v > 0)) return "none";
  return v < 0.005 ? "less than 1%" : percent(v, 0);
}

/**
 * The three readings worth having before the picture itself.
 *
 * Each one is a figure already on the page, said out loud: how much of
 * the money is priced near what its companies look worth, which names
 * have reached an end of a plan the reader set, and what the biggest
 * holding is doing. None of them is a score and none of them tells
 * anybody to do anything: the second names the level as the reader's
 * own, which is what it is.
 */
function Summary({ map }: { map: Map }) {
  const s = map.summary;
  const ready = s.trimNames.length + s.addNames.length;
  const said: string[] = [];
  if (s.trimNames.length > 0) {
    said.push(`${s.trimNames.join(", ")} at a level you set for trimming`);
  }
  if (s.addNames.length > 0) {
    said.push(`${s.addNames.join(", ")} at a level you set for adding`);
  }
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Tile
        label="Around fair value"
        value={sharePct(s.aroundFairValue)}
        sub={`of this portfolio is priced near what its companies look worth. Below fair value, ${sharePhrase(s.below)}. Above it, ${sharePhrase(s.above)}.`}
      />
      <Tile
        label="Ready to act on"
        value={ready === 0 ? "None" : `${ready} of ${map.points.length}`}
        sub={
          said.length > 0
            ? said.join(", and ")
            : map.points.length === 1
              ? "your one holding is somewhere in the middle of its own plan"
              : "every name is somewhere in the middle of its own plan"
        }
        accent={ready > 0}
      />
      <Tile
        label={map.points.length === 1 ? "Your holding" : "Biggest holding"}
        value={s.biggest ? sharePct(s.biggest.share) : NO_VALUE}
        sub={
          s.biggest
            ? `${s.biggest.ticker}, and its plan puts today's price at "${s.biggest.bandLabel.toLowerCase()}".`
            : "nothing with a plan yet"
        }
      />
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
  const map = useMemo(() => buildBandMap(rows), [rows]);
  const widest = Math.max(...map.bands.map((b) => b.share), 0.0001);

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
        subtitle="Every name on its own price plan. The bar is how much of your money is in that band, and each block is one holding."
        icon={<MapIcon className="h-4 w-4" />}
      />

      <Summary map={map} />

      {/*
        The ladder is a surface in its own right, so it takes the app's
        own well material rather than a hollow outline: a bordered box
        with nothing in it reads as a hole cut in the panel.
      */}
      <div className="card-sheen glass-well overflow-hidden rounded-xl">
        {map.bands.map((band) => (
          <Row key={band.id} band={band} widest={widest} code={code} />
        ))}
      </div>

      {map.missing.length > 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Not on this: {map.missing.map((t) => cashtag(t)).join(", ")}. A plan
          needs a price and something to anchor on, and one of those is
          missing for {map.missing.length === 1 ? "that one" : "those"}.
        </p>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {"A band is a multiple of that company's own fair value, which is what makes two names comparable here. Tap a name to open its plan and change any level. "}
        {ADVICE_DISCLAIMER_SHORT}
      </p>
    </Panel>
  );
}
