"use client";

import { ArrowRight, CalendarDays, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import {
  alertDestination,
  homeAlertGroups,
  type HomeAlertEntry,
  type UpsideAlert,
} from "@/lib/alerts";
import { barFillPct, cashtag, cn } from "@/lib/format";

/**
 * What Home is watching for the reader: one row per company.
 *
 * The version before this was one row per alert, and on a real account it
 * read as a column of repeated scaffolding: five rows each printing "FAIR
 * VALUE ZONES" beside the same icon, the same company on two rows, and the
 * figure that mattered (how far from fair value) as small mono text a
 * reader had to do arithmetic on. The row is the company now, and a zone
 * is drawn rather than described: a short gauge with fair value at its
 * centre and the price as a dot, cool below and warm above (the zone
 * colours, never gain and loss, since a price under fair value is not a
 * loss). Every gauge in the list shares one scale, printed once above
 * them, so the rows can be compared by eye, which is the thing a list of
 * percentages could not do.
 *
 * Anything else about the same company (a results date, a size note)
 * rides on the row as a chip, so a company never takes two rows.
 *
 * Borrowed money is left out on purpose, as it always was here: the hero
 * says it in its own cash line and the phone has `CashAlertCard`.
 */
export function HomeAlertList({
  alerts,
  onOpenPulse,
  onOpenResearch,
  onOpenAlerts,
  onOpenSheet,
  className,
}: {
  alerts: UpsideAlert[];
  onOpenPulse?: (ticker: string) => void;
  onOpenResearch?: (ticker: string) => void;
  onOpenAlerts?: () => void;
  /** A tracked covered call opens its own portfolio's panel. */
  onOpenSheet?: (portfolioId: string, focus?: "covered-calls") => void;
  className?: string;
}) {
  const { groups, more, total } = homeAlertGroups(alerts);
  if (groups.length === 0) return null;

  const gaps = groups
    .map((g) => g.lead.row.fairGap)
    .filter((g): g is number => g != null && Number.isFinite(g));
  const scale = gaugeScale(gaps);

  const openFor = (alert: UpsideAlert) => {
    const where = alertDestination(alert);
    const ticker = alert.ticker;
    if (where === "research" && ticker && onOpenResearch)
      return { run: () => onOpenResearch(ticker), goes: "opens Research" };
    if (where === "pulse" && ticker && onOpenPulse)
      return { run: () => onOpenPulse(ticker), goes: "opens Pulse" };
    if (where === "calls" && alert.portfolioId && onOpenSheet) {
      const id = alert.portfolioId;
      return {
        run: () => onOpenSheet(id, "covered-calls"),
        goes: "opens covered calls",
      };
    }
    return onOpenAlerts
      ? { run: onOpenAlerts, goes: "opens Worth a look" }
      : null;
  };

  return (
    <Panel className={className}>
      <PanelHeader title="Worth a look" />
      {/*
        One grid for the whole list. From `sm` every row is a subgrid of
        it, so the cashtags, the gauges and the figures each line up down
        one edge. A phone stacks each row into the company and its figure
        on one line and the gauge full width under them.
      */}
      <div className="-mx-2 grid grid-cols-[minmax(0,1fr)_auto_1rem] gap-x-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(10rem,18rem)_minmax(7.5rem,max-content)_1rem] sm:gap-x-5">
        {scale != null ? (
          <div
            className="col-span-full grid grid-cols-subgrid px-2 pb-2"
            aria-hidden
          >
            <span className="hidden sm:col-start-3 sm:flex sm:justify-between">
              <ScaleLegend scale={scale} />
            </span>
            <span className="col-span-2 flex justify-between sm:hidden">
              <ScaleLegend scale={scale} />
            </span>
          </div>
        ) : null}
        <ul
          className={cn(
            "col-span-full grid grid-cols-subgrid",
            /* The rows carry their own hover padding; without a legend
               above them, the first row's text starts where any other
               panel's content would. */
            scale == null && "-mt-3.5"
          )}
        >
          {groups.map(({ key, lead, extras }) => {
            const open = openFor(lead.alert);
            const body = (
              <GroupCells
                lead={lead}
                extras={extras}
                scale={scale}
                hasChevron={open != null}
              />
            );
            const rowClass =
              "col-span-full grid grid-cols-subgrid items-center gap-y-2.5 rounded-lg px-2 py-3.5 text-left";
            return (
              <li
                key={key}
                className="col-span-full grid grid-cols-subgrid border-t border-border first:border-t-0"
              >
                {open ? (
                  <button
                    type="button"
                    onClick={open.run}
                    className={cn(
                      rowClass,
                      "group/alert cursor-pointer transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    )}
                  >
                    {body}
                    <span className="sr-only">{`, ${open.goes}`}</span>
                  </button>
                ) : (
                  <div className={rowClass}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {more > 0 && onOpenAlerts ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 self-start text-muted-foreground hover:text-foreground"
          onClick={onOpenAlerts}
        >
          {`See all ${total}`}
          <ArrowRight data-icon="inline-end" />
        </Button>
      ) : null}
    </Panel>
  );
}

/**
 * The half-width of the shared gauge, as a fraction of fair value.
 *
 * Wide enough for the furthest row and rounded up to a tenth so the
 * printed ends are round numbers, never narrower than a fifth (or two
 * names 3% and 5% out would fill the gauge edge to edge and look far out),
 * and never wider than the whole of fair value, since a price cannot fall
 * further than that below it. Above that, a far outlier sits at the end.
 */
export function gaugeScale(gaps: number[]): number | null {
  if (gaps.length === 0) return null;
  const widest = Math.max(...gaps.map((g) => Math.abs(g)));
  return Math.min(1, Math.max(0.2, Math.ceil(widest * 10 - 1e-9) / 10));
}

function ScaleLegend({ scale }: { scale: number }) {
  const end = Math.round(scale * 100);
  return (
    <>
      <MicroLabel className="whitespace-nowrap">{`-${end}%`}</MicroLabel>
      <MicroLabel className="whitespace-nowrap">Fair value</MicroLabel>
      <MicroLabel className="whitespace-nowrap">{`+${end}%`}</MicroLabel>
    </>
  );
}

function GroupCells({
  lead,
  extras,
  scale,
  hasChevron,
}: {
  lead: HomeAlertEntry;
  extras: HomeAlertEntry[];
  scale: number | null;
  hasChevron: boolean;
}) {
  const { alert, row } = lead;
  const warn = (alert.tone ?? "neutral") !== "neutral";
  const gap = row.fairGap ?? null;
  return (
    <>
      {/*
        The company and what is true of it. One block on a phone; from `sm`
        `contents`, so the cashtag and the phrase take their own columns.
      */}
      <span className="flex min-w-0 flex-col gap-1 sm:contents">
        <span className="font-mono text-sm font-semibold tabular-nums text-foreground sm:col-start-1">
          {alert.ticker ? cashtag(alert.ticker) : row.tag}
        </span>
        <span className="flex min-w-0 flex-col gap-1.5 sm:col-start-2">
          <span
            className={cn(
              "text-sm",
              warn ? "text-warning" : "text-muted-foreground sm:text-foreground/85"
            )}
          >
            {row.what}
          </span>
          {/*
            On a phone the note sits under the phrase rather than under the
            figure: in the right column it was a second long line that
            squeezed the phrase beside it onto three.
          */}
          {row.note ? (
            <span className="font-mono text-xs tabular-nums text-muted-foreground sm:hidden">
              {row.note}
            </span>
          ) : null}
          {extras.length > 0 ? (
            <span className="flex flex-wrap gap-1.5">
              {extras.map((e) => (
                <ExtraChip key={e.alert.id} entry={e} />
              ))}
            </span>
          ) : null}
        </span>
      </span>

      <span className="col-start-2 row-start-1 flex flex-col items-end text-right sm:col-start-4">
        {row.figure ? (
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {row.figure}
          </span>
        ) : null}
        {row.note ? (
          <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:block sm:whitespace-nowrap">
            {row.note}
          </span>
        ) : null}
      </span>

      {hasChevron ? (
        <ChevronRight
          className="col-start-3 row-start-1 size-4 self-center text-muted-foreground transition-transform group-hover/alert:translate-x-0.5 motion-reduce:transition-none sm:col-start-5"
          aria-hidden
        />
      ) : null}

      {gap != null && scale != null ? (
        <span className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-3 sm:row-start-1">
          <FairGauge gap={gap} scale={scale} />
        </span>
      ) : null}
    </>
  );
}

/**
 * Where the price sits against fair value, drawn.
 *
 * Fair value is the tick in the middle. The fill runs from it to the dot,
 * cool when the price is under and warm when it is over; a price past the
 * printed scale sits at the end rather than off it, and the figure beside
 * it still says exactly how far.
 */
function FairGauge({ gap, scale }: { gap: number; scale: number }) {
  const below = gap < 0;
  const reach = barFillPct((Math.abs(gap) / scale) * 50, 0, 50);
  const colour = below ? "var(--zone-cool)" : "var(--zone-warm)";
  return (
    <span className="relative block h-3" aria-hidden>
      <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-foreground/10" />
      <span
        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full opacity-60"
        style={{
          background: colour,
          width: `${reach}%`,
          ...(below ? { right: "50%" } : { left: "50%" }),
        }}
      />
      <span className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-foreground/45" />
      <span
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
        style={{
          background: colour,
          left: `${below ? 50 - reach : 50 + reach}%`,
        }}
      />
    </span>
  );
}

/** Another fact about the same company, small enough to ride on its row. */
function ExtraChip({ entry }: { entry: HomeAlertEntry }) {
  const { alert, row } = entry;
  const results = alert.kind === "results";
  const text = results
    ? [`Results ${row.figure ? row.figure.toLowerCase() : ""}`.trim(), row.note]
        .filter(Boolean)
        .join(" · ")
    : [row.tag, row.figure].filter(Boolean).join(" ");
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-foreground/[0.06] px-2 py-0.5 text-xs text-muted-foreground">
      {results ? <CalendarDays className="size-3.5 shrink-0" aria-hidden /> : null}
      {text}
    </span>
  );
}
