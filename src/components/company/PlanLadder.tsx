"use client";

import { useEffect, useState } from "react";
import { Card, MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import { WhyThis } from "@/components/ui/WhyThis";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { cashtag, cn, currency, percent } from "@/lib/format";
import { planLadderProvenance } from "@/lib/provenance";
import {
  ladderRead,
  positionInBand,
  type LadderBand,
  type LadderBandId,
  type PlanLadder as Ladder,
} from "@/lib/company/plan-ladder";
import { ListOrdered, Pencil, RotateCcw } from "lucide-react";

/**
 * The price plan, as a table of bands with today's price standing in one
 * of them.
 *
 * This is the surface in the whole app that most looks like advice, and it
 * is not, so the design carries that distinction rather than a sentence
 * carrying it. Three things do the work. **The panel is the reader's**,
 * headed as their plan and not as anything this app thinks, with every
 * level editable in place and a reset beside it. **The arithmetic is on
 * the page**, so the provenance mark opens the two numbers the whole
 * ladder is multiplied from and there is nothing behind it but a
 * multiplication. And **the legal line is said once**, at the foot, per
 * the rule that a hedge repeated on every panel teaches a reader to skip
 * the one that matters.
 *
 * The live price is the point of the table, so it is drawn twice on
 * purpose: as a marker inside its own band, positioned where in that band
 * it actually sits, and as a figure in the header that moves with the
 * quote. A band a price is merely "in" tells a reader far less than one
 * that shows it eight tenths of the way to the next level.
 */

/**
 * A band's prices, in the least room they can honestly take.
 *
 * The open bands read as `>= $456.59` rather than "$456.59 and up",
 * which is both what the reference ladders print and about half the
 * width: on a 390px phone the price column is what squeezes the band's
 * own name into three lines, and the name is the part a reader is
 * scanning for.
 */
function bandPrices(band: LadderBand, code: string): string {
  if (band.to === null && band.from !== null) {
    return `\u2265 ${currency(band.from, 2, code)}`;
  }
  if (band.from === null && band.to !== null) {
    return `\u2264 ${currency(band.to, 2, code)}`;
  }
  if (band.from === null || band.to === null) return "";
  return `${currency(band.from, 2, code)} to ${currency(band.to, 2, code)}`;
}

/**
 * One row: the band's own words, its prices, and, on the one row the
 * price is actually in, a track showing where inside that band it sits.
 *
 * Three things were wrong with the first version and each is a rule.
 * **A label positioned by its own centre clips at the ends of its
 * track**: "You paid $420.00" pinned near the left edge hung outside the
 * card entirely, so the marks anchor to the near edge when they get
 * close to one, and the price mark keeps its arrow to the exact spot.
 * **The band's name is the thing a reader scans for**, so it gets the
 * room, and the prices next to it are as short as they can be said.
 * And **the row the price is in has to be findable from a foot away**,
 * which an accent tint alone was not: it takes the accent edge as well,
 * the same read `Score` uses for a lead reading.
 */
function BandRow({
  band,
  ladder,
  code,
  costBasis,
  onEdit,
}: {
  band: LadderBand;
  ladder: Ladder;
  code: string;
  /** What this reader paid on average, when they own it. */
  costBasis?: number | null;
  onEdit: ((id: LadderBandId) => void) | null;
}) {
  const here = ladder.atId === band.id && ladder.spot !== null;
  const at = here ? positionInBand(band, ladder.spot!) : null;
  /*
    What they paid, on its own band and only there. Second most useful
    mark on the table for somebody who already owns the company, and
    deliberately the quieter of the two: the plan is about where the
    price is now, and what they paid is context for that.
  */
  const paidHere =
    costBasis != null &&
    costBasis > 0 &&
    (band.from === null || costBasis > band.from) &&
    (band.to === null || costBasis <= band.to);

  /*
    THE WHOLE ROW IS THE CONTROL, NOT A PENCIL AT THE END OF IT.

    A pencil is an icon button, and `globals.css` gives every icon button
    a 44px floor under a coarse pointer, which is right and is 44 of the
    326px a 390px phone leaves this row. Measured with one there, the
    price column and the button took 200px and "Hold, nothing new" wrapped
    onto THREE lines: three words, three lines, on the row the reader is
    actually in. The row is a button instead, which needs none of that
    width and is a larger target than the pencil ever was. The glyph stays
    from `sm` up, where there is room for it and where a pointer has no
    other way to know the row does anything.
  */
  const Row = onEdit ? "button" : "div";
  const body = (
    <>
      <div className="flex w-full items-center justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "text-sm leading-snug",
              here ? "font-semibold text-foreground" : "text-foreground"
            )}
          >
            {band.label}
          </p>
          {(band.edited || paidHere) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {band.edited && <span>Your level</span>}
              {paidHere && (
                <span className="whitespace-nowrap font-mono tabular-nums">
                  You paid {currency(costBasis, 2, code)}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              /*
                A step down on the phone, where the price column is what
                squeezes the band's name: at 390px two prices and the word
                between them are 110 of the 326 the row has, and the name
                is what a reader is scanning for.
              */
              "font-mono text-xs tabular-nums sm:text-sm",
              here ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {bandPrices(band, code)}
          </span>
          {onEdit && band.to !== null && (
            <Pencil
              aria-hidden
              className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block"
            />
          )}
        </div>
      </div>
      {here && at !== null && (
        <div className="relative h-8 w-full">
          <span
            aria-hidden
            className="absolute inset-x-0 top-6 h-px bg-foreground/20"
          />
          <span
            aria-hidden
            className="absolute top-4 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-primary"
            style={{ left: `${at * 100}%` }}
          />
          {/*
            The pill anchors to whichever end it is near rather than to
            its own centre, so it can never be drawn half outside the
            card; the tick above stays at the true position, which is the
            part being read. Measured: at 390px a centred pill at either
            end hung outside the card entirely.
          */}
          <span
            className={cn(
              "absolute top-0 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-primary-foreground",
              at < 0.2 ? "left-0" : at > 0.8 ? "right-0" : "-translate-x-1/2"
            )}
            style={at >= 0.2 && at <= 0.8 ? { left: `${at * 100}%` } : undefined}
          >
            Now {currency(ladder.spot, 2, code)}
          </span>
        </div>
      )}
    </>
  );

  return (
    <Row
      {...(onEdit
        ? {
            type: "button" as const,
            onClick: () => onEdit(band.id),
            "aria-label": `Change the ${band.label} level, ${bandPrices(band, code)}`,
          }
        : {})}
      className={cn(
        "flex w-full flex-col gap-2 border-l-2 px-4 py-3 text-left transition sm:px-5",
        here ? "border-l-primary bg-primary/[0.06]" : "border-l-transparent",
        onEdit && "hover:bg-hover"
      )}
      aria-current={here ? "true" : undefined}
    >
      {body}
    </Row>
  );
}

/**
 * The table on its own, so the room and a holding you already own draw the
 * same rows.
 *
 * The drawer is inside a panel already and a second one around these rows
 * would be a heading inside a heading, which is why the panel is the
 * wrapper rather than the component.
 */
export function PlanLadderTable({
  ticker,
  ladder,
  code = "USD",
  costBasis,
  onSetEdge,
}: {
  ticker: string;
  ladder: Ladder;
  code?: string;
  /** The average price this reader paid, when they own it. */
  costBasis?: number | null;
  onSetEdge?: ((id: LadderBandId, price: number | null) => void) | null;
}) {
  const [editing, setEditing] = useState<LadderBandId | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setEditing(null);
  }, [ticker]);

  const band = ladder.bands.find((b) => b.id === editing) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Card tone="default" className="overflow-hidden p-0 sm:p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 sm:px-5">
          <MicroLabel>Band</MicroLabel>
          <MicroLabel>Price</MicroLabel>
        </div>
        <div className="divide-y divide-border">
          {ladder.bands.map((b) => (
            <BandRow
              key={b.id}
              band={b}
              ladder={ladder}
              code={code}
              costBasis={costBasis}
              onEdit={
                onSetEdge
                  ? (id) => {
                      const target = ladder.bands.find((x) => x.id === id);
                      // The bottom band has no top edge to move, so
                      // pressing it opens nothing rather than an editor
                      // with an empty field in it.
                      if (!target || target.to === null) return;
                      setEditing(id);
                      setDraft(target.to.toFixed(2));
                    }
                  : null
              }
            />
          ))}
        </div>
      </Card>

      {band && onSetEdge && (
        <Card tone="default" className="flex flex-col gap-3 p-5">
          <MicroLabel>Change the {band.label} level</MicroLabel>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The price at the top of that band. The band below ends where
            this one starts, so moving it moves both.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={draft}
              inputMode="decimal"
              className="w-32 font-mono tabular-nums"
              aria-label={`${band.label} level`}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button
              type="button"
              onClick={() => {
                const value = Number(draft.replace(/[^0-9.]/g, ""));
                onSetEdge(
                  band.id,
                  Number.isFinite(value) && value > 0 ? value : null
                );
                setEditing(null);
              }}
            >
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onSetEdge(band.id, null);
                setEditing(null);
              }}
            >
              Back to the worked-out level
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/** The anchor, the width, and the one legal line, said once at the foot. */
export function PlanLadderFoot({
  ladder,
  code = "USD",
  onReset,
}: {
  ladder: Ladder;
  code?: string;
  onReset?: (() => void) | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Anchored on {currency(ladder.anchor, 2, code)}, with bands{" "}
        {percent(ladder.step, ladder.farBelow ? 1 : 0)} of it wide
        {/*
          Said on the panel and not only behind the mark. A ladder three
          per cent wide sitting next to one ten per cent wide reads as a
          fault, and the reason it is tighter is a fact about this
          company that the reader wants anyway.
        */}
        {ladder.farBelow
          ? ", tighter than usual because the price is a long way under the anchor and the stretch below it is one band rather than five"
          : ""}
        . {ADVICE_DISCLAIMER_SHORT}
      </p>
      {ladder.edited && onReset && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={onReset}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Reset every level
        </Button>
      )}
    </div>
  );
}

export function PlanLadderPanel({
  ticker,
  ladder,
  code = "USD",
  at,
  onSetEdge,
  onReset,
}: {
  ticker: string;
  ladder: Ladder;
  code?: string;
  at?: string | null;
  /** Null where this reader cannot save, which keeps the rows read-only. */
  onSetEdge?: ((id: LadderBandId, price: number | null) => void) | null;
  onReset?: (() => void) | null;
}) {
  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            Your price plan
            <WhyThis
              provenance={planLadderProvenance({
                ticker,
                anchorSaid: ladder.anchorSaid,
                stepSaid: ladder.stepSaid,
                floorSaid: ladder.floorSaid,
                farBelow: ladder.farBelow,
                edited: ladder.edited,
                at,
              })}
            />
          </span>
        }
        subtitle={`Levels decided in advance, so the decision is made now rather than in the middle of a red week. They are built from ${
          // What the ladder actually hangs off, which is not always an
          // estimate: a fund and a coin get no valuation anywhere in this
          // app, and a subtitle promising one would be describing a panel
          // that is not on the page.
          ladder.anchorKind === "estimate"
            ? "the blended estimate below"
            : ladder.anchorKind === "target"
              ? "the end of year price above"
              : ladder.anchorKind === "your-own"
                ? "the anchor you typed"
                : "the range it has traded in over the last year"
        } and how far ${cashtag(ticker)} ordinarily travels, and every one of them is yours to change.`}
        icon={<ListOrdered className="h-4 w-4" />}
        actions={
          ladder.spot !== null ? (
            <div className="flex flex-col items-end gap-1">
              <span className="font-mono text-2xl font-bold tabular-nums text-foreground">
                {currency(ladder.spot, 2, code)}
              </span>
              <MicroLabel>Now</MicroLabel>
            </div>
          ) : undefined
        }
      />

      <p className="text-sm leading-relaxed text-foreground">
        {ladderRead(ladder)}
      </p>

      <PlanLadderTable
        ticker={ticker}
        ladder={ladder}
        code={code}
        onSetEdge={onSetEdge}
      />

      <PlanLadderFoot ladder={ladder} code={code} onReset={onReset} />
    </Panel>
  );
}
