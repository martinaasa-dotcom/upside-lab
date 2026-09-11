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
    /*
      THE ZONE'S HEADING IS A BANNER, NOT A CAPTION.

      It was mono caps in muted grey, the same voice every other small
      label in the app uses, sitting on a 9% wash: three zones that a
      reader had to look for. It is a filled bar now, with the zone's
      own colour in the rail, the name in that colour at sentence size
      and weight, and the share beside it. The wash on the rows below
      stays where it was, so only the heading got louder.
    */
    strong: "bg-[var(--zone-warm)]/[0.16]",
    ink: "text-[var(--zone-warm)]",
    rail: "bg-[var(--zone-warm)]",
  },
  {
    key: "around",
    name: "Around fair value",
    ids: ["hold"] as LadderBandId[],
    row: "bg-foreground/[0.022]",
    strong: "bg-foreground/[0.08]",
    ink: "text-foreground",
    rail: "bg-foreground/40",
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
    strong: "bg-[var(--zone-cool)]/[0.13]",
    ink: "text-[var(--zone-cool)]",
    rail: "bg-[var(--zone-cool)]",
  },
] as const;

type Zone = (typeof ZONES)[number];

/** How tall one band's row is. Never varies, on any portfolio. */
const ROW_H = 68;
/**
 * The same row on a phone, where it stacks the name over the bar.
 *
 * A MIN HEIGHT UNDER THE CONTENT IS NOT A FIXED HEIGHT. On a phone the
 * stacked row runs past `ROW_H` on its own, so the height came from the
 * content and landed on fractional pixels: measured, six bands drew at
 * 94.5, 93.5, 93.5, 94.5, 94.5 and 93.5, which is a ladder whose rungs
 * are visibly uneven on the one screen where the shape is hardest to
 * read. This clears the tallest of them, so every row is exactly this
 * and the rule this panel is built on ("a row is a fixed height,
 * always") holds at both layouts rather than only at one.
 */
const PHONE_ROW_H = 96;

/**
 * The narrowest a block may be drawn and still print its own name and
 * its own share, MEASURED off rendered blocks rather than guessed.
 *
 * The guess was 98 and it cost a phone most of its names: the bar there
 * is about 294px, so 98 let two blocks in where 94 lets three, and a
 * six holding portfolio came out showing one name in its busiest band
 * and "+2 more". The measurements: "NVDA 17%" needs 86px, "GOOGL 12%"
 * and "ABCDE <1%" both need 93, and "GOOGL 100%" needs 100 but can only
 * happen to a holding that is the whole portfolio and therefore alone
 * in its bar. 94 covers every case that can share a bar.
 */
const BLOCK_MIN_PX = 94;
/**
 * The same block on a phone, where it carries its name and no share.
 *
 * A PHONE BUYS NAMES WITH THE SHARE, AND NAMES ARE WORTH MORE. The bar
 * a 360px phone gives this panel is 249px, which holds one block
 * carrying a ticker and a share plus a "+2", so a six holding portfolio
 * showed one name in its busiest band. Without the share a block needs
 * 72px, so the same bar draws all three. The share is not lost: the
 * band's own share is on the row, and tapping the name opens the
 * company. Every block in any one view still looks like every other,
 * which is the rule this was fixed for; what changes is the breakpoint,
 * the way the rest of this app changes at one.
 */
const BLOCK_MIN_NARROW_PX = 72;
/** The hairline between two blocks. */
const BLOCK_GAP_PX = 3;
/** A "+N" block carries a count rather than a name, so it needs less. */
const REST_MIN_PX = 64;

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
/**
 * Whether this is the wide layout, read from the same breakpoint the
 * CSS uses rather than guessed from the bar's own width: the bar is
 * narrow on a laptop too when a band is nearly empty, and that is not
 * the same question.
 */
function useWide(): boolean {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 40rem)");
    const read = () => setWide(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return wide;
}

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

/**
 * How many names a bar that wide can carry, and whether it has to keep
 * a slot back for the "+N" block.
 *
 * A "+N" IS NARROWER THAN A NAME, so counting it as one costs a name
 * that would have fitted: it carries a count rather than a ticker and a
 * share. On the bar a phone gives this panel that was the difference
 * between two names drawn and three.
 */
export function blocksThatFit(
  width: number,
  items: number,
  block: number = BLOCK_MIN_PX
): number {
  if (!(width > 0)) return Math.min(items, 6);
  const room = (w: number) =>
    Math.max(1, Math.floor((w + BLOCK_GAP_PX) / (block + BLOCK_GAP_PX)));
  const all = room(width);
  if (items <= all) return items;
  // Something has to fold, so the "+N" takes its own, smaller, slot.
  return Math.max(1, room(width - REST_MIN_PX - BLOCK_GAP_PX));
}

/**
 * WHOSE PICTURE THIS IS, SAID ONCE AND THREADED.
 *
 * The same panel draws one person's portfolio and a circle's pooled
 * holdings, and almost every sentence on it is first person: "of this
 * portfolio", "the band your ladder calls", "levels you set", "your
 * biggest holding". Every one of those is a false statement about a
 * circle, whose shares are added up across people and whose levels
 * nobody can edit. One object carries the difference so a new sentence
 * cannot quietly ship in the wrong voice.
 */
type Voice = {
  pooled: boolean;
  /** "this portfolio" or "the circle's holdings". */
  whose: string;
  /** "your plan" or "this plan". */
  planWord: string;
};

const OWN_VOICE: Voice = {
  pooled: false,
  whose: "this portfolio",
  planWord: "your plan",
};
const POOLED_VOICE: Voice = {
  pooled: true,
  whose: "the circle's holdings",
  planWord: "this plan",
};

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
  wide,
  voice,
}: {
  voice: Voice;
  point: BandMapPoint;
  /** At `sm` and up, where the bar has the room for a share as well. */
  wide: boolean;
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
}) {
  const roi =
    point.roiPct === null
      ? ""
      : `, ${point.roiPct >= 0 ? "up" : "down"} ${percent(Math.abs(point.roiPct), 1)} on what you paid`;
  return (
    <Link
      href={companyHref(point.ticker)}
      data-band-chip=""
      title={`${cashtag(point.ticker)}: ${currency(point.spot, 2, code)}, ${percent(point.share, 1)} of ${voice.whose}, in the band ${voice.planWord} calls "${point.bandLabel}"`}
      className={cn(
        "flex min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-md border px-2",
        "border-border/60 bg-card font-mono text-xs tabular-nums text-foreground",
        // One inset hairline along the top, which is what the app's own
        // glass does: a flat rectangle on a flat wash reads as a gap in
        // the row rather than as an object sitting on it.
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]",
        "transition hover:border-border hover:brightness-125",
        "outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
      )}
      style={{
        flexGrow: Math.max(grow, 0.0001),
        flexBasis: 0,
        minWidth: wide ? BLOCK_MIN_PX : BLOCK_MIN_NARROW_PX,
      }}
    >
      {/*
        A DOT THAT IS GREY ON EVERY BLOCK IS NOT A LEGEND, IT IS NOISE.

        The dot is whether the reader is up or down, and a circle never
        knows: `/api/communities/[id]/book` sends `buy_price` as zero for
        every holding in an ordinary circle, this reader's own included,
        so cost never reaches the pooled picture at all. Drawing the
        neutral colour on all of them would be a signal that never
        varies, taking 12px of the ticker's room on a phone to say
        nothing. It is simply absent there, which is also the honest
        reading: this picture answers where a price sits and does not
        pretend to answer the other question.
      */}
      {!voice.pooled && <Dot roi={point.roiPct} />}
      <span className="truncate font-semibold tracking-tight">
        {point.ticker}
      </span>
      {/*
        EVERY BLOCK, NOT THE WIDE ONES. This printed only where a block
        had the room, which a reader reads as arbitrary: one name in a
        row carried a figure and its neighbours did not, for a reason
        invisible on the page. The block's own minimum width is the
        width that fits it, so the rule is now "always".
      */}
      {wide && (
        <span aria-hidden className="text-muted-foreground">
          {sharePct(point.share)}
        </span>
      )}
      <span className="sr-only">
        , {currency(point.spot, 2, code)}, {percent(point.share, 1)} of{" "}
        {voice.whose}
        {roi}
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
function Rest({
  folded,
  grow,
  voice,
}: {
  folded: BandMapPoint[];
  grow: number;
  voice: Voice;
}) {
  const share = folded.reduce((s, p) => s + p.share, 0);
  const allTiny = folded.every((p) => p.share < TINY_SHARE);
  return (
    <span
      className="flex items-center justify-center whitespace-nowrap rounded-md border border-dashed border-border/50 px-2 font-mono text-xs tabular-nums text-muted-foreground"
      style={{ flexGrow: Math.max(grow, 0.0001), flexBasis: 0, minWidth: REST_MIN_PX }}
      title={`${folded.map((p) => cashtag(p.ticker)).join(", ")}: ${percent(share, 1)} of ${voice.whose} together`}
    >
      <span aria-hidden>
        +{folded.length}
        {allTiny ? " small" : " more"}
      </span>
      <span className="sr-only">
        and {folded.length} not drawn here:{" "}
        {folded.map((p) => cashtag(p.ticker)).join(", ")},{" "}
        {percent(share, 1)} of {voice.whose} together
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
  wide,
  voice,
}: {
  voice: Voice;
  band: BandMapBand;
  widest: number;
  code: string;
  zone: Zone;
  wide: boolean;
}) {
  const [barRef, barWidth] = useBarWidth<HTMLDivElement>();
  const filled = band.items.length > 0;
  /*
    Both sides count NAMES: `blocksThatFit` has already kept the room
    the "+N" needs back out of the width, so what it returns is how many
    tickers can be drawn, and that is exactly what `foldToFit` keeps.
  */
  const blockMin = wide ? BLOCK_MIN_PX : BLOCK_MIN_NARROW_PX;
  const { shown, folded } = foldToFit(
    band.items,
    blocksThatFit(barWidth, band.items.length, blockMin)
  );
  /*
    The floor is what these blocks actually need, counted per block:
    the folded "+N" is narrower than a name, so counting it as a name
    overstates the floor and `max-width` then clips the bar's own end.
  */
  const slots = shown.length + (folded.length > 0 ? 1 : 0);
  const floorPx =
    shown.length * blockMin +
    (folded.length > 0 ? REST_MIN_PX : 0) +
    Math.max(slots - 1, 0) * BLOCK_GAP_PX;

  const { grows, rest } = barShares({
    bandShare: band.share,
    shown: shown.map((p) => p.share),
    folded: folded.map((p) => p.share),
  });
  return (
    <div
      data-band-row=""
      className={cn(
        "flex flex-col justify-center gap-2 border-b border-border/30 px-4 py-3 last:border-b-0",
        "sm:flex-row sm:items-center sm:gap-4 sm:px-5 sm:py-0 lg:gap-6",
        filled ? zone.row : "bg-transparent"
      )}
      style={{ minHeight: wide ? ROW_H : PHONE_ROW_H }}
    >
      {/*
        WHAT A BAND MEANS GOES BEHIND THE MARK, NOT IN A COLUMN.

        The range had a column of its own on every row, which is a fact
        a reader needs once and then never again: after the first read
        they know what "a long way above" is, and the figure is still
        printing itself six times down the table for the rest of the
        account's life. It is behind the tip beside the band's own name
        now, which is the app's one glyph for "tell me more", and the
        row is the name, what is in it, and how much of the portfolio
        that is.
      */}
      <div
        className={cn(
          /*
            THE NAME COLUMN IS SIZED BY THE NARROWEST LAYOUT THAT USES
            IT, WHICH IS THE TABLET, NOT THE LAPTOP.

            At a flat `w-56` the name and the share between them took
            272 of the 457px a 640px screen gives this panel, leaving the
            bar 137 while its own blocks needed 161: the last block was
            drawn past the end of the bar and clipped by the rounding,
            which is the "about to burst out of the table" fault in a new
            place. 176px still holds every band name this ladder has, and
            the roomier column comes back at `lg` where there is width to
            spend on it.
          */
          "flex min-w-0 shrink-0 items-center justify-between gap-3 sm:w-44 sm:justify-start lg:w-56",
          // Quieter, not unreadable: an empty band is still a step of
          // the ladder a reader is entitled to read.
          !filled && "opacity-55"
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm leading-tight",
              filled ? "font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            {band.label}
          </span>
          <InfoTip
            label={`What does ${band.label.toLowerCase()} mean?`}
            text={`${band.label}: ${bandRangeSaid(band, { direction: true })}. Every band is a slice of that company's own fair value, so the same band means the same thing on a $2 company and a $2,000 one. How wide a slice depends on how far that company usually travels, between 8% and 14%.`}
          />
        </span>
        {/* The share has its own column from `sm` up, so on a phone it
            rides with the name rather than being dropped. */}
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground sm:hidden">
          {sharePct(band.share)}
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
        /*
          A BLOCK IS A LINK, SO ON A PHONE IT IS 44px TALL.

          It was 36, which is under the coarse-pointer floor `globals.css`
          puts on every button and input in this app, and these are the
          one control on the panel: the whole picture is a grid of things
          you tap to open a company. A pointer needs no such floor and a
          taller bar would only make the ladder longer on a laptop, so
          the height steps at the same breakpoint everything else here
          steps at.
        */
        className="flex h-11 w-full min-w-0 shrink-0 items-center sm:h-9 sm:w-auto sm:flex-1"
      >
        {filled ? (
          <div
            className="flex h-11 items-stretch gap-[3px] overflow-hidden rounded-lg sm:h-9"
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
                wide={wide}
                voice={voice}
              />
            ))}
            {folded.length > 0 && (
              <Rest folded={folded} grow={rest} voice={voice} />
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
        "card-sheen glass-well rounded-xl px-4 py-3 sm:py-3.5",
        accent && "ring-1 ring-inset ring-primary/30"
      )}
    >
      {/*
        A PHONE READS THESE AS ROWS, A LAPTOP AS TILES.

        Three of these stacked cost 425px of a 390px phone before the
        first band was on screen, which is most of a screen spent on the
        caption of a picture nobody has seen yet. The figure moves up
        beside its own label, which is the one line it can share without
        crowding: measured, that is 84px back across the three, and the
        reading is unchanged because a label and the figure it names are
        one thought either way. Nothing is hidden on a phone; the app
        does not have two sets of facts.
      */}
      <div className="flex items-baseline justify-between gap-3 sm:block">
        <MicroLabel>{label}</MicroLabel>
        <p
          className={cn(
            "shrink-0 font-mono text-xl leading-none tabular-nums sm:pt-2 sm:text-2xl",
            accent ? "text-primary" : "text-foreground"
          )}
        >
          {value}
        </p>
      </div>
      <p className="pt-1.5 text-xs leading-snug text-muted-foreground sm:pt-2">
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
function Summary({ map, voice }: { map: Map; voice: Voice }) {
  const s = map.summary;
  const ready = s.reachedTotal;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Tile
        label="Around fair value"
        value={sharePct(s.aroundFairValue)}
        sub={`of ${voice.whose} is priced near what its companies look worth. Below it, ${sharePhrase(s.below)}. Above it, ${sharePhrase(s.above)}.`}
      />
      <Tile
        /*
          Not "Ready to act on", which is what this said while the bands
          were imperative. Once the table stopped telling anybody what to
          do, a tile over it counting the things to do was the last place
          the app still did, and the count is just as useful said as a
          fact about where the prices are.
        */
        /*
          A LABEL THAT SHARES ITS LINE WITH A FIGURE IS PRICED BY THAT
          LINE. "At an end of its plan" is 21 characters of mono caps,
          which on a 326px phone row wrapped and left the word "plan"
          alone under a figure reading "4 of 14". Three words say the
          same thing and fit beside every value this tile can print.
        */
        label="At a plan's end"
        value={ready === 0 ? "None" : `${ready} of ${map.points.length}`}
        sub={
          ready === 0 && map.points.length === 1 && !voice.pooled
            ? "your one holding is somewhere in the middle of its own ladder"
            : readySaid(s, voice.pooled)
        }
        accent={ready > 0}
      />
      <Tile
        label={
          voice.pooled
            ? "Biggest bet"
            : map.points.length === 1
              ? "Your holding"
              : "Biggest holding"
        }
        value={s.biggest ? sharePct(s.biggest.share) : NO_VALUE}
        sub={
          s.biggest
            ? `${s.biggest.ticker}, which its own ladder puts at "${s.biggest.bandLabel.toLowerCase()}".`
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
  title = "Where your holdings sit on their own ladders",
  pooled = false,
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
  /**
   * True for a circle's map, pooled across everyone who shared a
   * portfolio there. Shares are added up across people and no level is
   * anybody's own, so every first-person sentence on this panel is a
   * false statement about it. See `Voice`.
   */
  pooled?: boolean;
}) {
  const voice = pooled ? POOLED_VOICE : OWN_VOICE;
  const map = useMemo(() => buildBandMap(rows), [rows]);
  const wide = useWide();
  const widest = Math.max(...map.bands.map((b) => b.share), 0.0001);

  if (map.points.length === 0) return null;

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
                pooled,
              })}
            />
          </span>
        }
        subtitle={
          pooled
            ? "Everyone's holdings pooled into one company each, on its own price ladder. The bar is how much of the circle's money is in that band. What anybody paid stays theirs, so this says where a price sits and never who is up or down."
            : "Every name on its own price ladder. The bar is how much of your money is in that band, and each block is one holding."
        }
        icon={<MapIcon className="h-4 w-4" />}
      />

      <Summary map={map} voice={voice} />

      {/*
        The ladder is a surface in its own right, so it takes the app's
        own well material rather than a hollow outline: a bordered box
        with nothing in it reads as a hole cut in the panel.
      */}
      <div className="card-sheen glass-well overflow-hidden rounded-xl">
        {ZONES.map((zone) => {
          const bands = map.bands.filter((b) => zone.ids.includes(b.id));
          if (bands.length === 0) return null;
          const share = bands.reduce((sum, b) => sum + b.share, 0);
          /*
            A ZONE WITH NOTHING IN IT IS QUIETER, LIKE ITS OWN ROWS.
            The banner was at full strength over two desaturated rows
            reading "0%", so the loudest thing on a portfolio holding
            nothing above fair value was the heading announcing that.
            Same bar, same height, a fraction of the ink, which is the
            rule the empty rows under it already follow.
          */
          const zoneFilled = bands.some((b) => b.items.length > 0);
          return (
            <div key={zone.key}>
              <div
                className={cn(
                  "flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5",
                  zone.strong,
                  !zoneFilled && "opacity-55"
                )}
              >
                <span className="flex items-center gap-2.5">
                  {/* The rail carries the zone's colour at full
                      strength, where a wash of a few per cent cannot. */}
                  <span
                    aria-hidden
                    className={cn("h-4 w-1 shrink-0 rounded-full", zone.rail)}
                  />
                  <span className={cn("text-sm font-semibold", zone.ink)}>
                    {zone.name}
                  </span>
                </span>
                <span className="font-mono text-sm tabular-nums text-foreground">
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
                    wide={wide}
                    voice={voice}
                  />
                ))}
            </div>
          );
        })}
      </div>

      {map.missing.length > 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Not on this: {map.missing.map((t) => cashtag(t)).join(", ")}. A ladder
          needs a price and something to anchor on, and one of those is
          missing for {map.missing.length === 1 ? "that one" : "those"}.{" "}
          {/*
            THE SHORTFALL IS ANSWERED WHERE THE READER MEETS IT.

            Every share on this picture is of the whole portfolio, which
            is what makes the figures checkable, and it means the zones
            add up to less than a hundred per cent exactly when
            something is missing. Naming the tickers is not enough on
            its own: a reader who adds 37% and 30% and gets 67% is
            owed the reason on the same screen rather than left to infer
            it from a sentence above about a different subject.
          */}
          The shares here are of {voice.whose}, so with{" "}
          {map.missing.length === 1 ? "that one" : "those"} missing they add up
          to less than all of it.
        </p>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {"A band is a multiple of that company's own fair value, which is what makes two names comparable here. "}
        {/*
          The invitation has to be one somebody can accept. A circle's
          plan is nobody's to change, so telling a reader to change a
          level here sends them looking for a control that does not
          exist; their own page is where their own levels live.
        */}
        {pooled
          ? "Tap a name to open its own page, and set your own levels there if you hold it. "
          : "Tap a name to open its plan and change any level. "}
        {ADVICE_DISCLAIMER_SHORT}
      </p>
    </Panel>
  );
}
