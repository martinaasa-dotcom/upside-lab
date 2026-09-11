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
  TINY_SHARE,
  buildBandMap,
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
function Block({ point, code }: { point: BandMapPoint; code: string }) {
  return (
    <Link
      href={companyHref(point.ticker)}
      data-band-chip=""
      title={`${cashtag(point.ticker)}: ${currency(point.spot, 2, code)}, ${percent(point.share, 1)} of this portfolio, in the band your plan calls "${point.bandLabel}"`}
      className={cn(
        "flex min-w-0 items-center justify-center gap-1.5 overflow-hidden rounded-md border px-2",
        "border-border/60 bg-card font-mono text-xs tabular-nums text-foreground",
        "transition hover:border-border hover:bg-card",
        point.actionable && "border-primary/45 bg-primary/[0.08]"
      )}
      style={{
        flexGrow: Math.max(point.share, 0.0001),
        flexBasis: 0,
        minWidth: BLOCK_MIN_PX,
      }}
    >
      <Dot roi={point.roiPct} />
      <span className="truncate font-semibold tracking-tight">
        {point.ticker}
      </span>
      <span className="sr-only">
        , {currency(point.spot, 2, code)}, {percent(point.share, 1)} of this
        portfolio
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
function Rest({ folded }: { folded: BandMapPoint[] }) {
  const share = folded.reduce((s, p) => s + p.share, 0);
  const allTiny = folded.every((p) => p.share < TINY_SHARE);
  return (
    <span
      className="flex items-center justify-center whitespace-nowrap rounded-md border border-dashed border-border/50 px-2 font-mono text-xs tabular-nums text-muted-foreground"
      style={{
        flexGrow: Math.max(share, 0.0001),
        flexBasis: 0,
        minWidth: 58,
      }}
      title={`${folded.map((p) => cashtag(p.ticker)).join(", ")}: ${percent(share, 1)} of this portfolio together`}
    >
      +{folded.length}
      {allTiny ? " small" : " more"}
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
  const filled = band.items.length + band.hidden.length > 0;
  /*
    A "+N" block takes a slot of its own, so the names it leaves room
    for is one fewer than the bar holds whenever anything is folded.
  */
  const room = blocksThatFit(barWidth);
  const needsRest =
    band.hidden.length > 0 || band.items.length > room;
  const shown = band.items.slice(0, needsRest ? Math.max(room - 1, 1) : room);
  const folded = [...band.items.slice(shown.length), ...band.hidden].sort(
    (a, b) => b.share - a.share
  );
  const slots = shown.length + (folded.length > 0 ? 1 : 0);
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
          !filled && "opacity-45"
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
            {percent(band.share, 0)}
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
              width: `max(${(band.share / widest) * 100}%, ${slots * BLOCK_MIN_PX + (slots - 1) * BLOCK_GAP_PX}px)`,
              maxWidth: "100%",
            }}
          >
            {shown.map((p) => (
              <Block key={p.ticker} point={p} code={code} />
            ))}
            {folded.length > 0 && <Rest folded={folded} />}
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
        {percent(band.share, 0)}
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

/** A zero in the middle of a sentence reads worse than the word. */
function pctOrNone(v: number): string {
  return v > 0.005 ? percent(v, 0) : "none";
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
        value={percent(s.aroundFairValue, 0)}
        sub={`of this portfolio is priced near what its companies look worth. Below fair value, ${pctOrNone(s.below)}. Above it, ${pctOrNone(s.above)}.`}
      />
      <Tile
        label="Ready to act on"
        value={ready === 0 ? "None" : `${ready} of ${map.points.length}`}
        sub={
          said.length > 0
            ? said.join(", and ")
            : "every name is somewhere in the middle of its own plan"
        }
        accent={ready > 0}
      />
      <Tile
        label="Biggest holding"
        value={s.biggest ? percent(s.biggest.share, 0) : "n/a"}
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
