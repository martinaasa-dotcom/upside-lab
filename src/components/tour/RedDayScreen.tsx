"use client";

import { TourAsk } from "@/components/tour/TourRow";
import { cashtag, cn, currency, signedCurrency, signedPercent } from "@/lib/format";
import {
  SAMPLE_HOLDINGS,
  SAMPLE_TAPS_BEFORE_SUMMARY,
  sampleDayDollar,
  sampleTotals,
  type SampleHolding,
} from "@/lib/tour-sample-day";
import { Activity } from "lucide-react";
import { useMemo, useState } from "react";

/*
  The first thing the app ever asks somebody to do.

  The product turns on one distinction and it is a distinction nobody can
  be told: a screen of red numbers looks exactly the same whether the whole
  market fell or something happened at a company you own. Being told that
  is a sentence. Being handed eight red rows and asked which one is the odd
  one out is the same fact, arrived at by the reader, in about fifteen
  seconds, and it is the only version they still have next Tuesday.

  So there is no reading to do first. One question, eight rows, and every
  row turns over into the Pulse card for that company. Getting it wrong is
  as useful as getting it right, because either way they have just done by
  hand the thing Pulse does for them every morning.

  Everything on it is made up and the screen says so in its first line.
  Nothing here is a record of anything that happened to a real company.
*/

const totals = sampleTotals();

function RowFace({ h, open }: { h: SampleHolding; open: boolean }) {
  if (open) {
    return (
      <span className="flex min-w-0 flex-col gap-1 text-left">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-foreground">
            {cashtag(h.ticker)}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium ring-1",
              h.news
                ? "text-warning ring-warning/40"
                : "text-muted-foreground ring-border"
            )}
          >
            {h.badge}
          </span>
        </span>
        <span className="text-sm text-muted-foreground">{h.verdict}</span>
      </span>
    );
  }
  return (
    <>
      <span className="flex min-w-0 flex-col text-left">
        <span className="font-mono text-sm text-foreground">
          {cashtag(h.ticker)}
        </span>
        {/*
          Wraps rather than truncates. The fund's line is the longest and it
          is also the one a reader most needs, since "a fund holding 500 big
          American companies" is the whole reason its row moves with the
          market; cut at one line it read "is a fund holding 500 …".
        */}
        <span className="text-xs text-muted-foreground">
          {h.company}, {h.does}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="font-mono text-sm tabular-nums text-loss">
          {signedPercent(h.dayPct, 1)}
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {signedCurrency(sampleDayDollar(h), 0)}
        </span>
      </span>
    </>
  );
}

export function RedDayScreen() {
  const [opened, setOpened] = useState<string[]>([]);
  const enough = opened.length >= SAMPLE_TAPS_BEFORE_SUMMARY;
  const foundIt = useMemo(
    () => opened.includes(totals.newsTicker),
    [opened]
  );

  function turnOver(ticker: string) {
    setOpened((prev) =>
      prev.includes(ticker)
        ? prev.filter((t) => t !== ticker)
        : [...prev, ticker]
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card-sheen glass flex items-baseline justify-between gap-3 rounded-lg p-4">
        <span className="flex flex-col">
          <span className="text-xs text-muted-foreground">
            A made-up portfolio, today
          </span>
          <span className="font-mono text-xl tabular-nums text-foreground">
            {currency(totals.value, 0)}
          </span>
        </span>
        <span className="flex flex-col items-end">
          <span className="font-mono text-sm tabular-nums text-loss">
            {signedCurrency(totals.dayDollar, 0)}
          </span>
          <span className="font-mono text-xs tabular-nums text-loss">
            {signedPercent(totals.dayPct, 1)}
          </span>
        </span>
      </div>

      <TourAsk>
        One of these companies had real news today. Which one? Tap a row to
        turn it over.
      </TourAsk>

      <ul className="flex flex-col gap-2">
        {SAMPLE_HOLDINGS.map((h) => {
          const open = opened.includes(h.ticker);
          return (
            <li key={h.ticker}>
              <button
                type="button"
                onClick={() => turnOver(h.ticker)}
                aria-expanded={open}
                className={cn(
                  "card-sheen glass veil-hover flex w-full items-center justify-between gap-3 rounded-lg p-3",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  open && "ring-1 ring-foreground/20"
                )}
              >
                <RowFace h={h} open={open} />
              </button>
            </li>
          );
        })}
      </ul>

      {enough && (
        <div className="card-sheen glass flex items-start gap-3 rounded-lg p-4">
          <Activity className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-foreground">
              {foundIt
                ? `You found it. ${cashtag(totals.newsTicker)} is the one.`
                : `The one with news is ${cashtag(totals.newsTicker)}.`}
            </span>
            <span className="text-sm text-muted-foreground">
              Seven of these eight fell because the whole market fell, and
              nothing happened at any of them. One fell because of something
              at the company, and it is{" "}
              {Math.round(totals.newsShareOfDay * 100)}% of the whole day&apos;s{" "}
              {currency(Math.abs(totals.dayDollar), 0)} on its own. Telling
              those two apart, every day, for everything you own, is what
              Pulse is.
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
