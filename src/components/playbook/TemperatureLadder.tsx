"use client";

import { PlaybookQuote } from "@/components/playbook/PlaybookQuote";
import { PlaybookTerms } from "@/components/playbook/PlaybookTerms";
import { Card, MicroLabel, NESTED_PAD, NoteRows, Pill } from "@/components/ui/Panel";
import { cn } from "@/lib/format";
import {
  bandCuts,
  bandForScore,
  bandWidths,
  ladderPosition,
  TEMPERATURE_BANDS,
  type TemperatureBand,
  type TemperatureBandId,
} from "@/lib/playbook";
import { formatRelativeTime } from "@/lib/timezone";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/*
  THE THERMOMETER REFUSES TO SAY WHICH END IS GOOD, AND THAT IS THE POINT.

  The obvious drawing of a fear and greed scale is rose at one end and
  green at the other, and it is wrong twice over. In this app green and
  rose mean money made and money lost, so spending them here would say
  that fear is a loss and greed is a gain, which is the exact opposite of
  what the five bands below teach: the frightening end is where things are
  cheap and the comfortable end is where they are dear. And a reader who
  sees a colour before they read a word has already been told what to
  think.

  So the whole track is neutral, drawn in steps of the foreground at very
  low alpha so the extremes read as far out rather than as bad, and the one
  piece of colour on it is the accent on the marker, which means the same
  thing it means everywhere else in the product: this is the bit that is
  news. The copy says all of this out loud under the track, because a
  reader arriving with the usual expectation needs telling once.
*/

/** Distance from the middle, as a share of the track's own paint. */
const ZONE_WASH = [
  "bg-foreground/[0.09]",
  "bg-foreground/[0.06]",
  "bg-foreground/[0.035]",
  "bg-foreground/[0.06]",
  "bg-foreground/[0.09]",
] as const;

/*
  A MARKER AT AN END OF THE TRACK IS HALF A MARKER.

  The pill is centred on its own position, so at 0 or 100 exactly half of
  it falls outside a track that is `overflow-hidden`, and the one thing the
  picture exists to show is clipped at precisely the two readings a reader
  would most want to look at. It is the same fault this repo already
  records against a label positioned by its own centre, and the same fix:
  hold the mark its own half-width inside the ends. The drawn position is
  the only thing inset. The figure in the prose below is always the real
  score, so nothing states a number the picture has rounded.
*/
const MARK_INSET_PCT = 1.2;

function Track({ score }: { score: number | null }) {
  const widths = bandWidths();
  const cuts = bandCuts();
  const pos =
    score == null
      ? null
      : MARK_INSET_PCT +
        ladderPosition(score) * (100 - MARK_INSET_PCT * 2);
  return (
    <div>
      <div className="relative h-9 overflow-hidden rounded-lg ring-1 ring-border">
        <div className="absolute inset-0 flex">
          {TEMPERATURE_BANDS.map((band, i) => (
            <div
              key={band.id}
              className={cn("h-full", ZONE_WASH[i])}
              style={{ width: `${widths[i]}%` }}
            />
          ))}
        </div>
        {/* The same cut points the zones above are drawn from. */}
        <div aria-hidden className="absolute inset-0">
          {cuts.map((cut) => (
            <span
              key={cut}
              className="absolute top-0 h-full w-px bg-border"
              style={{ left: `${cut}%` }}
            />
          ))}
        </div>
        {pos != null ? (
          <span
            className="absolute top-1/2 h-6 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background"
            style={{ left: `${pos}%` }}
            aria-hidden
          />
        ) : null}
      </div>
      {/*
        Two words an end, measured rather than chosen: the fuller wording
        this started with ("0, every gauge at its low") wrapped to two
        lines at 390px and the two captions ran into each other across the
        middle of the track, so the axis read as one run-on sentence. The
        band names are on the rows below and the sentence under the track
        does the explaining, so the ends only have to name the direction.
      */}
      <div className="mt-1.5 flex justify-between font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
        <span>0, all fear</span>
        <span className="text-right">100, all greed</span>
      </div>
    </div>
  );
}

function BandRow({
  band,
  here,
  open,
  onToggle,
}: {
  band: TemperatureBand;
  here: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  /*
    A body opened by a button has to say which button, or a reader on a
    screen reader lands in a block of prose with nothing telling them what
    it belongs to. `aria-expanded` alone says the control opens something
    and not what.

    The body is mounted only while it is open rather than animated from
    zero height, which is the one place this room departs from the
    accordion `AlertCards` established. That one carries a handful of
    cards; this room has five bands and eighteen ideas, and the expanded
    bodies measure about fifteen thousand pixels at phone width, so keeping
    them all in the document to animate them would roughly triple what the
    room renders on its first paint. Per-panel render weight is the lever
    this repo has already measured, so the weight wins and the motion goes.
  */
  const headId = `band-${band.id}`;
  const bodyId = `band-${band.id}-body`;
  return (
    <Card
      tone="default"
      className={cn(
        "p-0 sm:p-0",
        here && "border-l-2 border-l-primary ring-1 ring-primary/50"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        id={headId}
        className="flex w-full items-start gap-3 rounded-lg p-4 text-left transition hover:bg-hover sm:p-6"
      >
        <span className="min-w-0 flex-1">
          {/*
            The pill sits on its own line above the label rather than
            inline beside it. Inline, it competed with the label and range
            for the row's width, and on a phone the longest band ("Extreme
            greed", "76 to 100") pushed the range onto a line of its own
            with nothing explaining the gap above it. A leading badge is
            width-independent: it never affects how the label wraps.
          */}
          {here ? (
            <Pill tone="brand" className="mb-1.5">
              Today
            </Pill>
          ) : null}
          <span className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "font-medium",
                here ? "text-primary" : "text-foreground"
              )}
            >
              {band.label}
            </span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {band.range[0]} to {band.range[1]}
            </span>
          </span>
          <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
            {band.says}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:duration-0",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? (
        <div
          id={bodyId}
          role="region"
          aria-labelledby={headId}
          className={cn("flex flex-col gap-6 border-t border-border", NESTED_PAD)}
        >
          <div className="flex flex-col gap-5 border-b border-border/60 pb-6">
            <PlaybookQuote quote={band.quote} />
            {band.second ? <PlaybookQuote quote={band.second} /> : null}
          </div>
          <NoteRows
            rows={[
              { label: "The idea", body: band.idea },
              { label: "Goes wrong", body: band.goesWrong },
              { label: "Check it", body: band.check },
            ]}
          />
          <PlaybookTerms terms={band.terms} />
        </div>
      ) : null}
    </Card>
  );
}

export function TemperatureLadder({
  score,
  asOf,
}: {
  score: number | null;
  /** When the snapshot carrying this score was taken. */
  asOf?: string | null;
}) {
  const current = useMemo(
    () => (score == null ? null : bandForScore(score)),
    [score]
  );
  /*
    Worked out on every render rather than once, because the point of the
    stamp is that it ages; and empty rather than a guess when the snapshot
    did not carry a time, since "read just now" over an unknown one is the
    confident wrong sentence the stamp exists to prevent.
  */
  const stamp = asOf ? formatRelativeTime(asOf) : "";
  const [open, setOpen] = useState<TemperatureBandId | null>(null);
  const [touched, setTouched] = useState(false);

  /*
    The live band opens itself, and stops doing so the moment the reader
    opens one of their own. Without the second half, a snapshot landing a
    beat after the first paint reaches in and swaps the open row out from
    under somebody already reading a different one, which is the page
    arguing with them about what they are looking at.
  */
  useEffect(() => {
    if (touched || !current) return;
    setOpen(current.id);
  }, [current, touched]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Track score={score} />
        <p className="text-sm leading-relaxed text-muted-foreground">
          {score == null
            ? "The reading has not landed yet. The five bands below are the same either way: the score only says which one the market is standing in today."
            : `The market is at ${Math.round(score)} out of 100 today, which is the band marked below. Neither end of this scale is the good one. The frightening end is where things are cheap and the comfortable end is where they are dear, which is why each band carries the idea that belongs to it and the way that idea goes wrong.`}
        </p>
        {/*
          WHOSE NUMBER IT IS, AND WHEN IT WAS READ.

          The whole design of this room is that a reader can check the
          figure instead of believing it, and a score printed with no
          source is exactly the unfalsifiable thing it was built to
          replace. The index is CNN's and is published for anybody, so it
          is named, and the stamp is here for the same reason the research
          page carries one: this panel can sit open on a screen for hours,
          and a reading with no age on it silently becomes a claim about
          right now that nobody can audit.
        */}
        <p className="text-xs leading-relaxed text-muted-foreground">
          {score == null
            ? "The score is CNN's Fear and Greed index for US stocks, which anybody can look up."
            : `The score is CNN's Fear and Greed index for US stocks, which anybody can look up.${stamp ? ` Read ${stamp}.` : ""}`}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <MicroLabel>The five bands</MicroLabel>
        {TEMPERATURE_BANDS.map((band) => (
          <BandRow
            key={band.id}
            band={band}
            here={current?.id === band.id}
            open={open === band.id}
            onToggle={() => {
              setTouched(true);
              setOpen((prev) => (prev === band.id ? null : band.id));
            }}
          />
        ))}
      </div>
    </div>
  );
}
