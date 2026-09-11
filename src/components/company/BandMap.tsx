"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { InfoTip, MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import { WhyThis } from "@/components/ui/WhyThis";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { NO_VALUE, cashtag, cn, currency, percent } from "@/lib/format";
import { bandMapProvenance } from "@/lib/provenance";
import { companyHref } from "@/lib/company/client";
import {
  TINY_SHARE,
  barShares,
  buildBandMap,
  flexWidths,
  foldToFit,
  readySaid,
  type BandMap as Map,
  type BandMapBand,
  type BandMapPoint,
} from "@/lib/company/band-map";
import {
  bandRangeSaid,
  type LadderBandId,
  type PlanLadder,
} from "@/lib/company/plan-ladder";
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

/**
 * THE SEVEN BANDS READ AS THREE ANSWERS.
 *
 * Six rows of near-identical grey is a table a reader has to parse
 * rather than see, and the thing they are actually trying to find is
 * whether their money is priced above, around or below what its
 * companies look worth. So the rows are grouped under those three
 * headings and each group carries its own wash.
 *
 * **Warm above and cool below, never the gain and loss pair.** Every
 * block on these rows already carries a gain or loss dot, so tinting
 * the zone emerald and rose would put two meanings on one pair and a
 * holding in profit would sit in the colour of a loss. Warm and cool
 * say the direction without touching it, and the middle zone stays
 * neutral because "around fair value" is not a direction.
 *
 * The grouping pays for itself twice: with the direction said once in
 * a heading, each band's own line drops from "about 10% to 20% below
 * fair value" to "10% to 20%", which is what made the column of them
 * read as a wall of prose.
 */
const ZONES = [
  {
    key: "above",
    name: "Above fair value",
    ids: ["trim-most", "trim-some"] as LadderBandId[],
    row: "bg-[var(--zone-warm)]/[0.05]",
    head: "bg-[var(--zone-warm)]/[0.09]",
    rail: "bg-[var(--zone-warm)]/60",
    /*
      The heading takes its zone's own hue rather than the muted grey
      every other label in the app uses. A heading, a rail and a wash in
      three different colours are three things; in one they are a zone.
      Lightened well past the wash so it clears contrast as type: the
      wash is 5% of this hue and the text is the hue itself.
    */
    title: "text-[var(--zone-warm)]/85",
  },
  {
    key: "around",
    name: "Around fair value",
    ids: ["hold"] as LadderBandId[],
    row: "bg-foreground/[0.022]",
    head: "bg-foreground/[0.045]",
    rail: "bg-foreground/15",
    title: "text-muted-foreground",
  },
  {
    key: "below",
    name: "Below fair value",
    ids: ["starter", "full", "full-aggressive", "exit"] as LadderBandId[],
    /*
      Lower alphas than the warm zone's, and measured rather than
      matched by eye. The same alpha of this hue lands further from the
      near-black field than the warm one does, and a saturated blue
      reads brighter still than its luminance says (the
      Helmholtz-Kohlrausch effect this repo already balances the ambient
      lobes on), so an even pair of numbers gives a cool zone that
      shouts over the warm one. Sampled off the rendered page, 0.06 and
      0.11 measured chroma 8.0 and 13.1 against the warm zone's 5.0 and
      8.0; these land on 5.1 and 8.1.
    */
    row: "bg-[var(--zone-cool)]/[0.038]",
    head: "bg-[var(--zone-cool)]/[0.068]",
    title: "text-[var(--zone-cool)]/85",
    rail: "bg-[var(--zone-cool)]/60",
  },
] as const;

type Zone = (typeof ZONES)[number];

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
        // One inset hairline along the top, which is what the app's own
        // glass does: a flat rectangle on a flat wash reads as a gap in
        // the row rather than as an object sitting on it.
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]",
        "transition hover:border-border hover:brightness-125",
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
  zone,
}: {
  band: BandMapBand;
  widest: number;
  code: string;
  zone: Zone;
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
  const { grows, rest } = barShares({
    bandShare: band.share,
    shown: shown.map((p) => p.share),
    folded: folded.map((p) => p.share),
  });
  /*
    What the browser will really draw each block at, resolved the way
    flex resolves it: a block held at its floor keeps room the others
    were counted as having, so a proportional estimate runs over on
    every block beside a small one and asks it to print a share it has
    no room for.
  */
  const drawn = flexWidths(
    barPx - Math.max(slots - 1, 0) * BLOCK_GAP_PX,
    [...grows, ...(folded.length > 0 ? [rest] : [])],
    [
      ...shown.map(() => BLOCK_MIN_PX),
      ...(folded.length > 0 ? [REST_MIN_PX] : []),
    ]
  );
  const widthOf = new Map(shown.map((p, i) => [p.ticker, drawn[i] ?? 0]));
  return (
    <div
      data-band-row=""
      className={cn(
        "flex flex-col justify-center gap-2 border-b border-border/30 px-4 py-3 last:border-b-0",
        "sm:flex-row sm:items-center sm:gap-6 sm:px-5 sm:py-0",
        filled ? zone.row : "bg-transparent"
      )}
      style={{ minHeight: ROW_H }}
    >
      {/*
        THE BAND'S NAME AND ITS RANGE ARE TWO OBJECTS, NOT TWO LINES.

        They were stacked, both ragged left, the name at `text-sm` and
        the range under it in muted mono. That reads as one soft block of
        text: the range had no shape of its own, no column to align in,
        and an opacity that put it half way between a label and a
        whisper, so a reader's eye slid off both. The range is a quiet
        capsule now, plainly a tag rather than a second title, and from
        `sm` up it sits in a right-aligned column of its own so every
        range on the ladder stacks into one scannable edge under the
        header that says what they measure.

        A phone keeps them on two lines, because the fuller wording the
        tag needs there (nothing above it says "below fair value") would
        leave a band's own name a few characters wide.
      */}
      <div
        className={cn(
          "flex min-w-0 shrink-0 flex-col gap-1.5",
          "sm:w-[21rem] sm:flex-row sm:items-center sm:justify-between sm:gap-4",
          // Quieter, not unreadable: an empty band is still a step of
          // the ladder a reader is entitled to read.
          !filled && "opacity-55"
        )}
      >
        <span className="flex items-baseline justify-between gap-3">
          <span
            className={cn(
              "min-w-0 text-sm leading-tight sm:truncate",
              filled ? "font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            {band.label}
          </span>
          {/* The share has its own column from `sm` up, so on a phone it
              rides with the name rather than being dropped. */}
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground sm:hidden">
            {sharePct(band.share)}
          </span>
        </span>
        {/*
          A COLUMN HEADER IS WHAT MAKES A BARE NUMBER MEAN SOMETHING.

          "10% to 20%" is a quantity with no question attached to it, and
          the answer is not to print the question on all six rows: "about
          10% to 20% below fair value" six times over is the wall of
          prose this replaced. A table says it once, at the top of the
          column. Where there is no column, the tag says it itself.
        */}
        <span
          className={cn(
            "w-fit shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-xs leading-none tabular-nums",
            filled
              ? "bg-foreground/[0.07] text-muted-foreground"
              : "bg-foreground/[0.04] text-muted-foreground/80"
          )}
        >
          <span className="sm:hidden">
            {bandRangeSaid(band, { direction: true })}
          </span>
          <span className="hidden sm:inline">{bandRangeSaid(band)}</span>
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
  const ready = s.reachedTotal;
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
          ready === 0 && map.points.length === 1
            ? "your one holding is somewhere in the middle of its own plan"
            : readySaid(s)
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
        {/*
          The column header, which is the one place the ladder says what
          its own figures are. Only from `sm` up: below that the rows
          stack, so there are no columns for a header to head, and each
          tag carries its own wording instead.
        */}
        <div className="hidden items-center gap-6 border-b border-border/40 bg-foreground/[0.03] px-5 py-2 sm:flex">
          <div className="flex w-[21rem] shrink-0 items-center justify-between gap-4">
            <MicroLabel>Your plan</MicroLabel>
            <span className="flex items-center gap-1.5">
              <MicroLabel>From fair value</MicroLabel>
              <InfoTip
                label="What does from fair value mean?"
                text="Each band is a slice of that company's own fair value, so the same band means the same thing on a $2 company and a $2,000 one. How wide a slice is depends on how far the company usually travels, between 8% and 14%, so these are the shape of the ladder rather than a promise about any one holding."
              />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <MicroLabel>What you hold there</MicroLabel>
          </div>
          <div className="w-12 shrink-0 text-right">
            <MicroLabel>Share</MicroLabel>
          </div>
        </div>
        {ZONES.map((zone) => {
          const bands = map.bands.filter((b) => zone.ids.includes(b.id));
          if (bands.length === 0) return null;
          const share = bands.reduce((sum, b) => sum + b.share, 0);
          return (
            <div key={zone.key} className="flex">
              {/* The rail carries the zone's colour at full strength,
                  where a few per cent of wash cannot. */}
              <span aria-hidden className={cn("w-[3px] shrink-0", zone.rail)} />
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "flex items-center justify-between gap-3 border-b border-border/30 px-4 py-2 sm:px-5",
                    zone.head
                  )}
                >
                  <span
                    className={cn(
                      "font-mono text-xs uppercase leading-none tracking-[0.16em]",
                      zone.title
                    )}
                  >
                    {zone.name}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-foreground">
                    {sharePct(share)}
                  </span>
                </div>
                {bands.map((band) => (
                  <Row
                    key={band.id}
                    band={band}
                    widest={widest}
                    code={code}
                    zone={zone}
                  />
                ))}
              </div>
            </div>
          );
        })}
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
