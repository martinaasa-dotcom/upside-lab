"use client";

import { PlaybookQuote } from "@/components/playbook/PlaybookQuote";
import { PlaybookTerms } from "@/components/playbook/PlaybookTerms";
import { Card, NESTED_PAD, NoteRows, Pill } from "@/components/ui/Panel";
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
import { useMemo, useState } from "react";

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

function Track({
  score,
  selected,
  onSelect,
}: {
  score: number | null;
  selected: TemperatureBandId | null;
  onSelect: (id: TemperatureBandId) => void;
}) {
  const widths = bandWidths();
  const cuts = bandCuts();
  const pos =
    score == null
      ? null
      : MARK_INSET_PCT +
        ladderPosition(score) * (100 - MARK_INSET_PCT * 2);
  return (
    <div>
      <div className="relative h-10 overflow-hidden rounded-lg ring-1 ring-border">
        {/*
          THE TRACK IS THE CONTROL. Each zone names itself and opens its own
          band below, so the five bands are drawn once, on the scale they
          belong to, rather than again as a list of five cards under it.
        */}
        <div role="tablist" aria-label="The five bands" className="absolute inset-0 flex">
          {TEMPERATURE_BANDS.map((band, i) => {
            const here =
              score != null && score >= band.range[0] && score <= band.range[1];
            const on = selected === band.id;
            return (
              <button
                key={band.id}
                type="button"
                role="tab"
                id={`band-${band.id}`}
                // The visible word is hidden on a phone for every zone but
                // the one being read, so the name lives on the button.
                aria-label={band.label}
                aria-selected={on}
                aria-controls="band-panel"
                onClick={() => onSelect(band.id)}
                className={cn(
                  "flex h-full items-center justify-center overflow-hidden px-1 outline-none transition hover:bg-hover focus-visible:bg-hover",
                  ZONE_WASH[i],
                  on && "bg-foreground/[0.14]"
                )}
                style={{ width: `${widths[i]}%` }}
              >
                <span
                  className={cn(
                    "truncate text-xs",
                    // A phone has room for one word per zone at most, so
                    // only the zone being read names itself there.
                    !on && "hidden sm:inline",
                    on || here ? "font-semibold text-foreground" : "text-muted-foreground"
                  )}
                >
                  {band.label}
                </span>
              </button>
            );
          })}
        </div>
        {/* The same cut points the zones above are drawn from. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
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
            className="pointer-events-none absolute bottom-0 h-1 w-8 -translate-x-1/2 rounded-full bg-primary"
            style={{ left: `${pos}%` }}
            aria-hidden
          />
        ) : null}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
        <span>0, all fear</span>
        <span className="text-right">100, all greed</span>
      </div>
    </div>
  );
}

/** The band being read: its name, the lesson, and the words behind it. */
function BandBody({ band, here }: { band: TemperatureBand; here: boolean }) {
  return (
    <Card
      tone="default"
      id="band-panel"
      role="tabpanel"
      aria-labelledby={`band-${band.id}`}
      className={cn("flex flex-col gap-6", NESTED_PAD, here && "border-l-2 border-l-primary")}
    >
      <div>
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn("font-medium", here ? "text-primary" : "text-foreground")}>
            {band.label}
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {band.range[0]} to {band.range[1]}
          </span>
          {here ? <Pill tone="brand">Today</Pill> : null}
        </span>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{band.says}</p>
      </div>
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
  const [picked, setPicked] = useState<TemperatureBandId | null>(null);

  /*
    Today's band is shown until the reader picks another, and a snapshot
    landing late never swaps the band out from under somebody who already
    chose one, because their choice is kept apart from the default.
  */
  const shown =
    TEMPERATURE_BANDS.find((b) => b.id === (picked ?? current?.id)) ??
    TEMPERATURE_BANDS[2]!;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Track score={score} selected={shown.id} onSelect={setPicked} />
        <p className="text-sm leading-relaxed text-muted-foreground">
          {score == null
            ? "The reading has not landed yet. Press a band to read it."
            : `${Math.round(score)} out of 100 today. Neither end is the good one: fear is where things are cheap, greed where they are dear.`}
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
      <BandBody band={shown} here={current?.id === shown.id} />
    </div>
  );
}
