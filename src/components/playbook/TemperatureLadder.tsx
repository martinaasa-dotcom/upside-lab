"use client";

import { PlaybookQuote } from "@/components/playbook/PlaybookQuote";
import { Card, MicroLabel, NoteRows, Pill } from "@/components/ui/Panel";
import { cn } from "@/lib/format";
import {
  bandForScore,
  ladderPosition,
  TEMPERATURE_BANDS,
  type TemperatureBand,
  type TemperatureBandId,
} from "@/lib/playbook";
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

function zoneWidth(band: TemperatureBand): number {
  return band.range[1] - band.range[0] + 1;
}

function Track({ score }: { score: number | null }) {
  const pos = score == null ? null : ladderPosition(score) * 100;
  return (
    <div>
      <div className="relative h-9 overflow-hidden rounded-lg ring-1 ring-border">
        <div className="absolute inset-0 flex">
          {TEMPERATURE_BANDS.map((band, i) => (
            <div
              key={band.id}
              className={cn("h-full", ZONE_WASH[i])}
              style={{ width: `${zoneWidth(band)}%` }}
            />
          ))}
        </div>
        {/* Hairlines where the published bands actually change. */}
        <div aria-hidden className="absolute inset-0">
          {TEMPERATURE_BANDS.slice(1).map((band) => (
            <span
              key={band.id}
              className="absolute top-0 h-full w-px bg-border"
              style={{ left: `${band.range[0]}%` }}
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
  return (
    <Card
      tone="default"
      className={cn("p-0 sm:p-0", here && "ring-1 ring-primary/30")}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 rounded-lg p-4 text-left transition hover:bg-hover sm:p-6"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{band.label}</span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {band.range[0]} to {band.range[1]}
            </span>
            {here ? <Pill tone="brand">Where it is today</Pill> : null}
          </span>
          <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
            {band.says}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open ? (
        <div className="flex flex-col gap-5 border-t border-border p-4 sm:p-6">
          <PlaybookQuote quote={band.quote} />
          {band.second ? <PlaybookQuote quote={band.second} /> : null}
          <NoteRows
            rows={[
              { label: "The idea", body: band.idea },
              { label: "Goes wrong", body: band.goesWrong },
              { label: "Check it", body: band.check },
            ]}
          />
        </div>
      ) : null}
    </Card>
  );
}

export function TemperatureLadder({ score }: { score: number | null }) {
  const current = useMemo(
    () => (score == null ? null : bandForScore(score)),
    [score]
  );
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
