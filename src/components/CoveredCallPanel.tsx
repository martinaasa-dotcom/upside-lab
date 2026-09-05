"use client";

import { FluidRow, FluidTable, cellBase, cellTicker, tableCols } from "@/components/FluidTable";
import { TickerSymbol } from "@/components/TickerSymbol";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Panel, PanelHeader } from "@/components/ui/Panel";
import { NO_VALUE, cashtag, cn, currency, percent, plural, signedTone } from "@/lib/format";
import { shareCount } from "@/lib/share-count";
import { isSafePositiveMoney } from "@/lib/input-guard";
import {
  blockWheelChange,
  formatDecimal,
  parseDecimal,
} from "@/lib/number-input";
import type { CoveredCallRow } from "@/lib/types";
import { listingCurrenciesAreMixed } from "@/lib/listing-currency";
import { format, parseISO } from "date-fns";
import { memo, useEffect, useRef, useState } from "react";

type Props = {
  rows: CoveredCallRow[];
  yield2wAvg: number;
  premiumTotal: number;
  onPatchTargetCall: (holdingId: string, targetCallPct: number) => void;
  onPatchStockTarget: (holdingId: string, stockTarget: number) => void;
  /** Pick the expiry to price against. Passing null hands the choice back
   * to the scan, which picks the listed date nearest the target tenor. */
  onPatchExpiry: (holdingId: string, expiry: string | null) => void;
  onAddHolding?: () => void;
};

function InlineTargetCall({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (pct: number) => void;
}) {
  const display = formatDecimal(Math.round(value * 100), 0);
  const [draft, setDraft] = useState(display);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(display);
  }, [display]);

  return (
    <div className="inline-flex items-center justify-center gap-0.5">
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onFocus={() => {
          focused.current = true;
        }}
        onWheel={blockWheelChange}
        onBlur={() => {
          focused.current = false;
          const n = parseDecimal(draft);
          if (Number.isFinite(n) && n >= 0 && n <= 100) {
            const pct = Math.round(n) / 100;
            if (pct !== value) onCommit(pct);
            else setDraft(display);
          } else setDraft(display);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(display);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="inline-edit no-spinner w-8 rounded-t py-0.5 text-center tabular-nums text-foreground outline-none hover:bg-hover focus:bg-muted focus:ring-1 focus:ring-ring/50"
      />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  );
}

/**
 * The price the reader would be happy to sell at.
 *
 * Until they set one, what is in the box is this app's own suggestion,
 * worked out from where the price has turned back lately, and it was
 * presented in exactly the same weight as a figure somebody chose. So a
 * suggested one is muted and says so beside it, and typing over it makes
 * it theirs.
 */
function InlineStockTarget({
  value,
  suggested = false,
  onCommit,
}: {
  value: number | null;
  /** True when nobody has set this and the number is our own guess. */
  suggested?: boolean;
  onCommit: (price: number) => void;
}) {
  const display =
    value != null && value > 0 ? formatDecimal(value, 2) : "";
  const [draft, setDraft] = useState(display);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(display);
  }, [display]);

  return (
    <div className="inline-flex items-center justify-center gap-0.5">
      <span className="text-sm text-muted-foreground">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder={NO_VALUE}
        onChange={(e) =>
          setDraft(e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, ""))
        }
        onFocus={() => {
          focused.current = true;
        }}
        onWheel={blockWheelChange}
        onBlur={() => {
          focused.current = false;
          const n = parseDecimal(draft);
          if (isSafePositiveMoney(n) && n !== value) {
            onCommit(Math.round(n * 100) / 100);
          } else setDraft(display);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(display);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={cn(
          "inline-edit no-spinner w-[4.5rem] rounded-t py-0.5 text-center tabular-nums outline-none hover:bg-hover focus:bg-muted focus:ring-1 focus:ring-ring/50",
          suggested ? "text-muted-foreground" : "text-foreground"
        )}
      />
    </div>
  );
}

/**
 * The expiry the premium is quoted for.
 *
 * A native date input rather than a bespoke picker: it is a date, every
 * platform already has a good one, and it gets keyboard and locale
 * handling for free. Clearing the field hands the choice back to the
 * scan, which is why the empty value commits null rather than being
 * rejected like the numeric editors do.
 */
function InlineExpiry({
  value,
  onCommit,
}: {
  value: string | null;
  onCommit: (expiry: string | null) => void;
}) {
  const display = value ?? "";
  const [draft, setDraft] = useState(display);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(display);
  }, [display]);

  const commit = (next: string) => {
    const cleaned = next.trim();
    if (cleaned === display) return;
    if (!cleaned) {
      onCommit(null);
      return;
    }
    // Only forward a real future date; the model rejects anything else
    // anyway, and silently reverting is clearer than showing a premium
    // that belongs to a different day.
    const when = new Date(`${cleaned}T00:00:00Z`);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      setDraft(display);
      return;
    }
    onCommit(cleaned);
  };

  return (
    <input
      type="date"
      value={draft}
      aria-label="Expiry"
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={(e) => {
        focused.current = false;
        commit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(display);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="inline-edit w-[7.5rem] rounded-t bg-transparent py-0.5 text-center tabular-nums text-muted-foreground outline-none hover:bg-hover focus:bg-muted focus:text-foreground focus:ring-1 focus:ring-ring/50"
    />
  );
}

const HEADERS = [
  "Ticker",
  "Price",
  "Call %",
  "Stock target",
  "Distance",
  "Near target?",
  "Next strike",
  "Expires",
  "Contracts",
  "2-week %",
  "Premium",
] as const;

const HEADER_HINTS: Partial<Record<(typeof HEADERS)[number], string>> = {
  Price: "What one share costs right now",
  "Call %": "How far above your target you set the strike. A strike further away pays you less, but your shares are less likely to be sold",
  "Stock target": "The price you would be happy to sell at. Until you set one, this is a suggestion worked out from where the price has turned back lately",
  Distance: "How far the price still has to travel to reach your target. Negative means it is already there",
  // The column measures the distance to the price the reader said they
  // would sell the shares at, not to the strike. It said the strike for
  // months, which is a different number in a table that shows both.
  "Near target?":
    "How close the share price is to the price you said you would be happy to sell at",
  "Next strike": "The strike this plan points at, rounded to one you can actually trade",
  Contracts: "One contract covers 100 shares",
  "2-week %": "What you collect, as a percentage of the shares this ties up, over roughly two weeks",
  Premium: "The cash you would collect for selling these calls",
};

/**
 * How close the share price is to the price the reader said they would sell
 * at, in words rather than a second percentage.
 *
 * The words are short on purpose. This sits in a column of a table whose
 * every other cell is a figure, so the longest label sets the width of the
 * track: "Far from your target" was 168px of a 104px column and printed
 * itself over the distance and the strike either side of it. "Far away"
 * says the same thing to the same reader in a third of the room.
 */
function writeProximity(distance: number | null): {
  label: string;
  className: string;
} {
  if (distance == null || !Number.isFinite(distance)) {
    return { label: NO_VALUE, className: "text-muted-foreground" };
  }
  if (distance <= 0) {
    return { label: "Already there", className: "text-primary/60" };
  }
  if (distance < 0.04) {
    // "Close" sat under a column headed Write, so a beginner read the two
    // words together as an instruction to close something.
    return { label: "Nearly there", className: "text-caution" };
  }
  if (distance < 0.12) {
    return { label: "Getting near", className: "text-foreground" };
  }
  return { label: "Far away", className: "text-muted-foreground" };
}

/** Anchor Home uses to land on this table from "Open covered calls". */
export const COVERED_CALLS_ANCHOR = "covered-calls";

/** One contract is one hundred shares, and that is the whole gate. */
const SHARES_PER_CONTRACT = 100;

export const CoveredCallPanel = memo(function CoveredCallPanel({
  rows,
  yield2wAvg,
  premiumTotal,
  onPatchTargetCall,
  onPatchStockTarget,
  onPatchExpiry,
  onAddHolding,
}: Props) {
  const mixedListings = listingCurrenciesAreMixed(
    rows.map((r) => ({ ticker: r.holding.ticker }))
  );
  const tickerCell = mixedListings ? cellTicker : cellBase;
  const template = tableCols(11, mixedListings);

  /*
   * Nothing here can apply until one holding reaches a hundred shares of
   * one company, and on a portfolio whose biggest holding is fifteen this
   * panel was about 2,300px of "0 contracts, n/a, n/a" on a phone: roughly
   * a third of the room, all of it about something the reader cannot do.
   * So it collapses to one line that says why, and names the holding that
   * is closest, which is the only useful thing on the whole panel for
   * somebody in that position.
   */
  const writable = rows.filter(
    (r) => r.holding.shares >= SHARES_PER_CONTRACT
  );
  const biggest = rows.reduce<CoveredCallRow | null>(
    (best, r) => (best == null || r.holding.shares > best.holding.shares ? r : best),
    null
  );

  /*
   * An empty portfolio used to stack four empty panels: a Holdings empty
   * state with three import buttons, this one with a fourth Add holding
   * button, a "No holdings yet" forecast and a line claiming Margus was
   * still working on prices that do not exist. The Holdings empty state
   * is the one that says what to do, so it is the only one that renders.
   */
  if (rows.length === 0) return null;

  if (writable.length === 0) {
    return (
      <Panel
        padded={false}
        id={COVERED_CALLS_ANCHOR}
        className="scroll-mt-28 overflow-hidden"
      >
        <div className="p-6">
          <PanelHeader title="Covered calls" />
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Writing one covered call needs a hundred shares of a single
            company.
            {biggest
              ? ` Your biggest holding is ${shareCount(biggest.holding.shares)} of ${cashtag(biggest.holding.ticker)}, so there is nothing to write yet.`
              : " There is nothing to write yet."}{" "}
            This fills in on its own when one of your holdings gets there.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      padded={false}
      id={COVERED_CALLS_ANCHOR}
      className="scroll-mt-28 overflow-hidden"
    >
      <div className="border-b border-border p-6">
        <PanelHeader title="Covered calls" />
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 p-6 md:hidden">
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing to write calls on yet"
            detail="You need shares before you can write calls on them. Add a holding and this fills in."
            action={
              onAddHolding && (
                <Button type="button" onClick={onAddHolding}>
                  Add holding
                </Button>
              )
            }
          />
        ) : (
          rows.map((r) => (
            <Card key={r.holding.id} tone="raised">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-base font-semibold text-foreground">
                  <TickerSymbol
                    ticker={r.holding.ticker}
                    showCurrency={mixedListings}
                  />
                </p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  Price {currency(r.spot)}
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="mb-1 text-muted-foreground">Strike gap</p>
                  <InlineTargetCall
                    value={r.targetCall}
                    onCommit={(pct) => onPatchTargetCall(r.holding.id, pct)}
                  />
                </div>
                <div>
                  <p className="mb-1 text-muted-foreground">Happy to sell at</p>
                  <InlineStockTarget
                    value={r.stockTarget}
                    suggested={r.holding.stock_target_override == null}
                    onCommit={(price) =>
                      onPatchStockTarget(r.holding.id, price)
                    }
                  />
                  {r.holding.stock_target_override == null ? (
                    <p className="mt-0.5 text-sm italic text-muted-foreground">
                      Our suggestion
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-muted-foreground">Still to go</p>
                  <p
                    className={cn(
                      "tabular-nums font-medium",
                      r.targetDistance != null
                        ? signedTone(r.targetDistance)
                        : "text-muted-foreground"
                    )}
                  >
                    {r.targetDistance != null
                      ? percent(r.targetDistance)
                      : NO_VALUE}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Near your target?</p>
                  <p
                    className={cn(
                      "font-medium",
                      writeProximity(r.targetDistance).className
                    )}
                  >
                    {writeProximity(r.targetDistance).label}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Strike</p>
                  <p className="tabular-nums font-semibold text-primary/60">
                    {r.nextStrike != null ? currency(r.nextStrike) : NO_VALUE}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">2-week %</p>
                  <p className="tabular-nums font-medium text-primary/60">
                    {r.yield2w != null ? percent(r.yield2w) : NO_VALUE}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Premium</p>
                  <p className="tabular-nums text-foreground">
                    {r.premium != null ? currency(r.premium) : NO_VALUE}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {plural(Math.round(r.contracts), "contract")}
                {r.expiration
                  ? `, expires ${format(parseISO(r.expiration), "MMM d")}`
                  : ""}
              </p>
            </Card>
          ))
        )}
        {rows.length > 0 && (
          <Card tone="raised" className="text-sm">
            <div className="flex justify-between">
              <span className="font-semibold text-foreground">All together</span>
              <span className="tabular-nums text-primary/60">
                {percent(yield2wAvg)} over 2 weeks
              </span>
            </div>
            <p className="mt-1 tabular-nums text-muted-foreground">
              {currency(premiumTotal)} in premium
            </p>
          </Card>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <FluidTable template={template}>
          <FluidRow className="border-border text-sm font-medium text-muted-foreground">
            {HEADERS.map((label, i) => (
              <div
                key={label}
                /*
                  A header is one line, like every cell under it. Headers
                  used to be allowed to wrap so a label in words would not
                  set the track's width, and the row came out with some
                  titles on two lines and most on one, which reads as
                  uneven before a figure is looked at. `cellBase` is
                  already `whitespace-nowrap`, the column floors at its
                  widest cell and `FluidTable` scrolls sideways past that,
                  so the label is kept short instead ("Near target?").
                */
                className={i === 0 ? tickerCell : cellBase}
                title={HEADER_HINTS[label]}
              >
                {label}
              </div>
            ))}
          </FluidRow>

          {rows.length === 0 && (
            <div className="col-span-full p-4">
              <EmptyState
                title="Nothing to write calls on yet"
                detail="You need shares before you can write calls on them. Add a holding and this fills in."
                action={
                  onAddHolding && (
                    <Button type="button" onClick={onAddHolding}>
                      Add holding
                    </Button>
                  )
                }
              />
            </div>
          )}

          {rows.map((r) => (
            <FluidRow key={r.holding.id} className="hover:bg-muted/50">
              <div
                className={cn(
                  tickerCell,
                  "font-semibold tracking-wide text-foreground"
                )}
              >
                <TickerSymbol
                  ticker={r.holding.ticker}
                  showCurrency={mixedListings}
                />
              </div>
              <div className={cn(cellBase, "tabular-nums text-foreground")}>
                {currency(r.spot)}
              </div>
              <div className={cellBase}>
                <InlineTargetCall
                  value={r.targetCall}
                  onCommit={(pct) => onPatchTargetCall(r.holding.id, pct)}
                />
              </div>
              <div className={cellBase}>
                <InlineStockTarget
                  value={r.stockTarget}
                  suggested={r.holding.stock_target_override == null}
                  onCommit={(price) => onPatchStockTarget(r.holding.id, price)}
                />
              </div>
              <div
                className={cn(
                  cellBase,
                  "tabular-nums font-medium",
                  r.targetDistance != null
                    ? signedTone(r.targetDistance)
                    : "text-muted-foreground"
                )}
              >
                {r.targetDistance != null ? percent(r.targetDistance) : NO_VALUE}
              </div>
              <div
                className={cn(
                  cellBase,
                  "whitespace-nowrap font-medium",
                  writeProximity(r.targetDistance).className
                )}
              >
                {writeProximity(r.targetDistance).label}
              </div>
              <div
                className={cn(
                  cellBase,
                  "tabular-nums font-semibold text-primary/60"
                )}
              >
                {r.nextStrike != null ? currency(r.nextStrike) : NO_VALUE}
              </div>
              <div className={cn(cellBase, "text-muted-foreground")}>
                <InlineExpiry
                  value={r.expiration}
                  onCommit={(expiry) => onPatchExpiry(r.holding.id, expiry)}
                />
              </div>
              <div className={cn(cellBase, "tabular-nums text-muted-foreground")}>
                {Math.round(r.contracts)}
              </div>
              <div
                className={cn(cellBase, "tabular-nums font-medium text-primary/60")}
              >
                {r.yield2w != null ? percent(r.yield2w) : NO_VALUE}
              </div>
              <div className={cn(cellBase, "tabular-nums text-foreground")}>
                {r.premium != null ? currency(r.premium) : NO_VALUE}
              </div>
            </FluidRow>
          ))}

          {rows.length > 0 && (
            <FluidRow footer className="border-t border-border font-semibold">
              <div className={tickerCell} />
              <div className={cellBase} />
              <div className={cellBase} />
              <div className={cellBase} />
              <div className={cellBase} />
              <div className={cellBase} />
              <div className={cellBase} />
              <div className={cellBase} />
              <div className={cellBase} />
              <div className={cn(cellBase, "tabular-nums text-primary/60")}>
                {percent(yield2wAvg)}
              </div>
              <div className={cn(cellBase, "tabular-nums text-foreground")}>
                {currency(premiumTotal)}
              </div>
            </FluidRow>
          )}
        </FluidTable>
      </div>
    </Panel>
  );
});
