"use client";

import { AlertTriangle, ArrowRight, ChevronRight, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { KIND_GLYPH, TONE_GLYPH } from "@/components/AlertCards";
import {
  alertDestination,
  homeAlertRows,
  type UpsideAlert,
} from "@/lib/alerts";
import { cashtag, cn } from "@/lib/format";

/**
 * What Home is watching for the reader, as one list rather than a row of
 * cards.
 *
 * It was three equal cards, each a title and a paragraph under an icon,
 * with "7 more worth a look" underneath. Read on a real account they were
 * three grey slabs a reader had to read top to bottom to learn that one
 * was a results date, one a price plan and one about options, and a
 * ladder card's paragraph ("in the zone of the level your ladder worked
 * out, which you have not changed") was the whole card. A glance asks
 * three things in order: which company, what kind of thing, and the one
 * figure. So each alert is one row that answers exactly those, from the
 * `digest` its builder wrote, and the full sentences stay where somebody
 * who wants them already goes, the "Worth a look" room and the company's
 * own page. Six rows fit where three cards stood.
 *
 * The columns line up down the list from `sm` (one subgrid), so the kinds
 * read down one edge and the figures down another; a phone stacks each
 * row into three short lines. The whole row is the control, and it says
 * where it goes to a screen reader rather than printing "Open Research on
 * $NBIS" on every row.
 *
 * Borrowed money is left out on purpose, as it always was here: the hero
 * says it in its own cash line and the phone has `CashAlertCard`.
 */
export function HomeAlertList({
  alerts,
  onOpenPulse,
  onOpenResearch,
  onOpenAlerts,
  className,
}: {
  alerts: UpsideAlert[];
  onOpenPulse?: (ticker: string) => void;
  onOpenResearch?: (ticker: string) => void;
  onOpenAlerts?: () => void;
  className?: string;
}) {
  const { shown, more, total } = homeAlertRows(alerts);
  if (shown.length === 0) return null;
  return (
    <Panel className={className}>
      <PanelHeader title="Worth a look" />
      <ul className="-mx-2 grid grid-cols-[2rem_minmax(0,1fr)_1rem] gap-x-3 sm:grid-cols-[2rem_auto_auto_auto_minmax(0,1fr)_1rem] sm:gap-x-5">
        {shown.map(({ alert, row }) => {
          const tone = alert.tone ?? "neutral";
          const Glyph =
            tone === "neutral"
              ? (KIND_GLYPH[alert.kind] ?? Landmark)
              : AlertTriangle;
          const where = alertDestination(alert);
          const ticker = alert.ticker;
          const open =
            where === "research" && ticker && onOpenResearch
              ? () => onOpenResearch(ticker)
              : where === "pulse" && ticker && onOpenPulse
                ? () => onOpenPulse(ticker)
                : onOpenAlerts;
          const goes =
            where === "research"
              ? "opens Research"
              : where === "pulse"
                ? "opens Pulse"
                : "opens Worth a look";
          const cells = (
            <>
              <span
                className={cn(
                  "flex size-8 items-center justify-center self-start rounded-lg sm:self-center",
                  TONE_GLYPH[tone]
                )}
                aria-hidden
              >
                <Glyph className="size-4" />
              </span>
              {/*
                One flex column on a phone, `contents` from `sm` so each
                piece becomes a cell of the shared grid. The figure comes
                last on a phone, under the phrase it is the number for, and
                takes its own column between the kind and the phrase on a
                wider screen, where a figure pinned to the far edge would
                be a figure with nothing beside it.
              */}
              <span className="flex min-w-0 flex-col gap-1 sm:contents">
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1 sm:contents">
                  <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                    {ticker ? cashtag(ticker) : row.tag}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-xs font-medium uppercase tracking-[0.1em]",
                      tone === "neutral" ? "text-muted-foreground" : "text-warning"
                    )}
                  >
                    {ticker ? row.tag : null}
                  </span>
                </span>
                <span className="order-last flex min-w-0 flex-wrap items-baseline gap-x-2 sm:order-none sm:flex-col sm:gap-0">
                  {row.figure ? (
                    <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                      {row.figure}
                    </span>
                  ) : null}
                  {row.note ? (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {row.note}
                    </span>
                  ) : null}
                </span>
                <span className="min-w-0 text-sm text-muted-foreground sm:text-foreground/85">
                  {row.what}
                </span>
              </span>
              {open ? (
                <ChevronRight
                  className="size-4 self-center text-muted-foreground transition-transform group-hover/alert:translate-x-0.5 motion-reduce:transition-none"
                  aria-hidden
                />
              ) : (
                <span aria-hidden />
              )}
            </>
          );
          const rowClass =
            "col-span-full grid grid-cols-subgrid items-center rounded-lg px-2 py-3 text-left";
          return (
            <li
              key={alert.id}
              className="col-span-full grid grid-cols-subgrid border-t border-border first:border-t-0"
            >
              {open ? (
                <button
                  type="button"
                  onClick={open}
                  className={cn(
                    rowClass,
                    "group/alert cursor-pointer transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  )}
                >
                  {cells}
                  <span className="sr-only">{`, ${goes}`}</span>
                </button>
              ) : (
                <div className={rowClass}>{cells}</div>
              )}
            </li>
          );
        })}
      </ul>
      {/*
        Under the list rather than in the header's actions: at phone width
        a header's actions drop onto a row of their own, which put a lone
        "All 8" between the title and the first row.
      */}
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
