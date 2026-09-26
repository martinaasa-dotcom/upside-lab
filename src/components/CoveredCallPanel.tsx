"use client";

import { TermTip } from "@/components/ui/TermTip";

import {
  FluidRow,
  FluidTable,
  cellBase,
  cellCenter,
  cellText,
  cellTicker,
  headRow,
  tableCols,
} from "@/components/FluidTable";
import { TickerSymbol } from "@/components/TickerSymbol";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, InfoTip, Panel, PanelHeader } from "@/components/ui/Panel";
import { NO_VALUE, barFillPct, cashtag, cn, currency, percent, plural, signedTone } from "@/lib/format";
import { shareCount } from "@/lib/share-count";
import { isSafePositiveMoney } from "@/lib/input-guard";
import {
  blockWheelChange,
  formatDecimal,
  parseDecimal,
} from "@/lib/number-input";
import type { CoveredCallRow } from "@/lib/types";
import { parseExpiryText } from "@/lib/options/expiry-text";
import { listingCurrenciesAreMixed } from "@/lib/listing-currency";
import { Check, ClipboardPaste, Copy, Plus } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CoveredCallModal, type CallModalSeed } from "@/components/CoveredCallModal";
import { TrackedCalls } from "@/components/covered-calls/TrackedCalls";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import {
  buildCallViews,
  deltaText,
  type CallRules,
  type ContractReading,
  type TrackedCall,
  type TrackedCallDraft,
} from "@/lib/options/tracked-calls";
import type { TrackedCallsStore } from "@/lib/options/use-tracked-calls";

type Props = {
  rows: CoveredCallRow[];
  yield3wAvg: number;
  premiumTotal: number;
  onPatchTargetCall: (holdingId: string, targetCallPct: number) => void;
  onPatchStockTarget: (holdingId: string, stockTarget: number) => void;
  /** Pick the expiry to price against. Passing null hands the choice back
   * to the scan, which picks the listed date nearest the target tenor. */
  onPatchExpiry: (holdingId: string, expiry: string | null) => void;
  /** A strike typed in: the target stays and the Call % moves to meet it. */
  onPatchStrike?: (holdingId: string, strike: number, target: number | null) => void;
  onAddHolding?: () => void;
  /** Calls the reader has sold or plans to sell, and where they are kept. */
  trackedCalls?: TrackedCallsStore;
  /** The open portfolio: the store holds every portfolio's calls. */
  portfolioId?: string;
  /** What the market says about each of them, by call id. */
  readings?: Record<string, ContractReading>;
  rules?: CallRules;
  onRulesChange?: (next: CallRules) => void;
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
    <div className="inline-flex items-center justify-end gap-0.5">
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
          // Call % can carry decimals now (a typed strike sets it exactly),
          // so an untouched field is judged by its text, or leaving it
          // would round 21.97% to 22% and move the strike.
          if (draft === display) return;
          const n = parseDecimal(draft);
          if (Number.isFinite(n) && n >= 0 && n <= 100) {
            onCommit(Math.round(n) / 100);
          } else setDraft(display);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(display);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="inline-edit no-spinner w-8 rounded-t py-0.5 text-right tabular-nums text-foreground outline-none hover:bg-hover focus:bg-muted focus:ring-1 focus:ring-ring/50"
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
    <div className="inline-flex items-center justify-end gap-0.5">
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
          "inline-edit no-spinner w-[4.5rem] rounded-t py-0.5 text-right tabular-nums outline-none hover:bg-hover focus:bg-muted focus:ring-1 focus:ring-ring/50",
          suggested ? "text-muted-foreground" : "text-foreground"
        )}
      />
    </div>
  );
}

/**
 * The strike, typed straight in.
 *
 * It used to be a read-only figure worked out from the target and the
 * Call %, so the one number a reader actually picks off their broker's
 * chain could only be reached by working backwards. Typing it keeps the
 * target and moves the Call % to land on it, and the row's premium and
 * delta reprice on the spot.
 */
function InlineStrike({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (strike: number) => void;
}) {
  const display = value != null && value > 0 ? formatDecimal(value, 2) : "";
  const [draft, setDraft] = useState(display);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(display);
  }, [display]);

  return (
    <div className="inline-flex items-center justify-end gap-0.5">
      <span className="text-sm text-muted-foreground">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        aria-label="Strike"
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
          if (draft === display) return;
          const n = parseDecimal(draft);
          if (isSafePositiveMoney(n)) onCommit(Math.round(n * 100) / 100);
          else setDraft(display);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(display);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="inline-edit no-spinner w-[4.5rem] rounded-t py-0.5 text-right font-semibold tabular-nums text-primary/80 outline-none hover:bg-hover focus:bg-muted focus:ring-1 focus:ring-ring/50"
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
  copied,
  onCopy,
}: {
  value: string | null;
  onCommit: (expiry: string | null) => void;
  /** The date last copied from any row, offered to every other row. */
  copied: string | null;
  onCopy: (expiry: string) => void;
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
    if (!isFutureKey(cleaned)) {
      setDraft(display);
      return;
    }
    setDraft(cleaned);
    onCommit(cleaned);
  };

  const canPaste = copied != null && copied !== value && isFutureKey(copied);

  return (
    <div className="inline-flex flex-row-reverse items-center gap-0.5">
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
        /*
          A date field swallows ordinary copy and paste, so both are
          handled here: copying puts the date on the clipboard as text and
          offers it to the other rows, and pasting reads any of the shapes
          `parseExpiryText` knows, a broker's "NOV 20 '26" included.
        */
        onCopy={(e) => {
          if (!value) return;
          e.preventDefault();
          e.clipboardData.setData("text/plain", value);
          onCopy(value);
        }}
        onPaste={(e) => {
          const parsed = parseExpiryText(e.clipboardData.getData("text"));
          if (!parsed) return;
          e.preventDefault();
          commit(parsed);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(display);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="inline-edit w-[7.5rem] rounded-t bg-transparent py-0.5 text-right tabular-nums text-muted-foreground outline-none hover:bg-hover focus:bg-muted focus:text-foreground focus:ring-1 focus:ring-ring/50"
      />
      {canPaste ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-6 text-muted-foreground"
          aria-label={`Use ${copied} here`}
          onClick={() => commit(copied!)}
        >
          <ClipboardPaste className="size-3.5" />
        </Button>
      ) : value ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn(
            "size-6",
            copied === value ? "text-primary" : "text-muted-foreground"
          )}
          aria-label={copied === value ? "Date copied" : "Copy this date"}
          onClick={() => {
            onCopy(value);
            void navigator.clipboard?.writeText(value).catch(() => {});
          }}
        >
          {copied === value ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
      ) : null}
    </div>
  );
}

function isFutureKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const when = new Date(`${key}T00:00:00Z`);
  return !Number.isNaN(when.getTime()) && when.getTime() > Date.now();
}

/*
 * Every title fits its own column. The widest header sets a track's width,
 * and "Stock target" and "Next strike" each sat over a column of "$250.00"
 * at half again the width of the titles beside them, so the row read as
 * uneven before a figure was looked at. The phone cards already say
 * "Target" and "Strike"; the hints below carry the long form.
 */
const HEADERS = [
  "Ticker",
  "Price",
  "Call %",
  "Target",
  "Distance",
  "Near target?",
  "Strike",
  "Delta",
  "Expires",
  "Contracts",
  "3-week %",
  "Premium",
] as const;

/**
 * Headers the glossary already answers, so this table does not keep a
 * second copy of the answer. `Strike` and `Premium` are the two words a
 * reader meets again in their broker's own screens, which is exactly the
 * case the shared entry exists for.
 */
const GLOSSARY_HEADERS: Partial<Record<(typeof HEADERS)[number], string>> = {
  Strike: "strike",
  Premium: "premium",
  Delta: "delta",
};

const HEADER_HINTS: Partial<Record<(typeof HEADERS)[number], string>> = {
  Price: "What one share costs right now",
  "Call %": "How far above your target you set the strike. A strike further away pays you less, but your shares are less likely to be sold",
  Target: "The price you would be happy to sell at. Until you set one, this is a suggestion worked out from where the price has turned back lately",
  Distance: "How far the price still has to travel to reach your target. Negative means it is already there",
  // The column measures the distance to the price the reader said they
  // would sell the shares at, not to the strike. It said the strike for
  // months, which is a different number in a table that shows both.
  "Near target?":
    "How close the share price is to the price you said you would be happy to sell at",
  Contracts: "One contract covers 100 shares",
  "3-week %":
    "What you collect as a percentage of the shares this ties up, scaled to three weeks so calls to different dates can be compared",
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

/**
 * A premium or delta priced from a nearby contract's volatility (an edit
 * the scan has not answered yet, or a strike the chain does not list) is
 * drawn quieter than one read off the chain, and the note under the table
 * says why.
 */
function figureTone(r: CoveredCallRow): string {
  return r.option == null || r.option.estimated
    ? "text-muted-foreground"
    : "text-foreground";
}

/** Anchor Home uses to land on this table from "Open covered calls". */
export const COVERED_CALLS_ANCHOR = "covered-calls";

/** One contract is one hundred shares, and that is the whole gate. */
const SHARES_PER_CONTRACT = 100;

export const CoveredCallPanel = memo(function CoveredCallPanel({
  rows,
  yield3wAvg,
  premiumTotal,
  onPatchTargetCall,
  onPatchStockTarget,
  onPatchExpiry,
  onPatchStrike,
  onAddHolding,
  trackedCalls,
  portfolioId,
  readings,
  rules,
  onRulesChange,
}: Props) {
  const mixedListings = listingCurrenciesAreMixed(
    rows.map((r) => ({ ticker: r.holding.ticker }))
  );
  const tickerCell = cellTicker;
  const tracking = Boolean(trackedCalls && rules && onRulesChange);
  const template = tableCols(HEADERS.length, mixedListings, tracking);

  const [seed, setSeed] = useState<CallModalSeed | null>(null);
  /** An expiry copied from one row, offered to paste into the others. */
  const [copiedExpiry, setCopiedExpiry] = useState<string | null>(null);
  const commitStrike = (r: CoveredCallRow, strike: number) =>
    onPatchStrike?.(r.holding.id, strike, r.stockTarget);
  const callViews = useMemo(
    () =>
      trackedCalls && rules
        ? buildCallViews(
            trackedCalls.calls.filter((c) => c.portfolio_id === portfolioId),
            readings ?? {},
            rules
          )
        : [],
    [trackedCalls, portfolioId, readings, rules]
  );
  const modalHoldings = useMemo(
    () =>
      rows.map((r) => ({
        ticker: r.holding.ticker,
        contracts: Math.floor(r.holding.shares / SHARES_PER_CONTRACT),
        spot: r.spot,
      })),
    [rows]
  );
  const saveCall = useCallback(
    async (draft: TrackedCallDraft, id?: string) => {
      if (!trackedCalls) return "Tracking is not available here.";
      return id ? trackedCalls.update(id, draft) : trackedCalls.add(draft);
    },
    [trackedCalls]
  );
  const fromCall = (call: TrackedCall, patch?: Partial<TrackedCallDraft>): CallModalSeed => ({
    id: call.id,
    ticker: call.ticker,
    status: call.status,
    strike: call.strike,
    expiry: call.expiry,
    contracts: call.contracts,
    premium: call.premium,
    opened_on: call.opened_on,
    ...patch,
  });
  /** Prefill from a suggested row: the listed strike, its expiry and today's mid. */
  const fromSuggestion = (r: CoveredCallRow, status: "sold" | "planned"): CallModalSeed => ({
    ticker: r.holding.ticker,
    status,
    strike: r.option?.listedStrike ?? r.nextStrike ?? undefined,
    expiry: r.expiration ?? undefined,
    contracts: Math.max(1, Math.round(r.contracts)),
    premium: r.option?.mid != null ? Math.round(r.option.mid * 100) / 100 : null,
  });
  const trackSection =
    tracking && trackedCalls ? (
      <TrackedCalls
        views={callViews}
        rules={rules!}
        showCurrency={mixedListings}
        onRulesChange={onRulesChange!}
        onAdd={() => setSeed({})}
        onEdit={(call) => setSeed(fromCall(call))}
        onRemove={async (call) => {
          await trackedCalls.remove(call.id);
        }}
        onMarkSold={(call) =>
          setSeed(fromCall(call, { status: "sold", opened_on: null }))
        }
      />
    ) : null;
  const modal = tracking ? (
    <CoveredCallModal
      open={seed != null}
      holdings={modalHoldings}
      seed={seed}
      onClose={() => setSeed(null)}
      onSave={saveCall}
    />
  ) : null;

  /*
   * Nothing here can apply until one holding reaches a hundred shares of
   * one company, and on a portfolio whose biggest holding is fifteen this
   * panel was about 2,300px of "0 contracts, n/a, n/a" on a phone: roughly
   * a third of the room, all of it about something the reader cannot do.
   * So it collapses to one line that says why, and names the holding that
   * is closest, which is the only useful thing on the whole panel for
   * somebody in that position.
   */
  const pasteAll =
    copiedExpiry && rows.some((r) => r.contracts >= 1 && r.expiration !== copiedExpiry)
      ? () => {
          for (const r of rows) {
            if (r.contracts >= 1 && r.expiration !== copiedExpiry) {
              onPatchExpiry(r.holding.id, copiedExpiry);
            }
          }
        }
      : null;
  const anyEstimated = rows.some((r) => r.option?.estimated);

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
      <Panel id={COVERED_CALLS_ANCHOR} className="scroll-mt-28 overflow-hidden">
        <PanelHeader
          title="Covered calls"
          subtitle="One call needs a hundred shares of a single company. This opens once a holding gets there."
        />
        {/*
          How close the nearest holding is, drawn rather than said: a bar to
          a hundred shares reads at a glance where the sentence it replaced
          took three lines to say the same.
        */}
        {biggest ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold text-foreground">
                {cashtag(biggest.holding.ticker)}
              </span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {`${shareCount(biggest.holding.shares)} of ${SHARES_PER_CONTRACT}`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div
                className="h-full rounded-full bg-foreground/60"
                style={{
                  width: `${barFillPct((biggest.holding.shares / SHARES_PER_CONTRACT) * 100)}%`,
                }}
              />
            </div>
          </div>
        ) : null}
        {callViews.length > 0 ? trackSection : null}
        {modal}
      </Panel>
    );
  }

  return (
    <Panel
      padded={false}
      id={COVERED_CALLS_ANCHOR}
      className="scroll-mt-28 overflow-hidden"
    >
      <div className="border-b border-border surface-gutter py-6">
        <PanelHeader
          title="Covered calls"
          subtitle="The calls you have sold or plan to sell, read against your own rules, and below them a suggested call for each holding."
        />
      </div>

      {trackSection ? (
        <div className="border-b border-border surface-gutter py-6">{trackSection}</div>
      ) : null}
      {modal}

      <div className="surface-gutter pt-6">
        <h3 className="text-base font-semibold text-foreground">Suggested calls</h3>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 surface-gutter py-6 md:hidden">
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
                  <p className="text-muted-foreground">Near target?</p>
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
                  <p className="mb-1 text-muted-foreground">Strike</p>
                  {onPatchStrike ? (
                    <InlineStrike
                      value={r.nextStrike}
                      onCommit={(strike) => commitStrike(r, strike)}
                    />
                  ) : (
                    <p className="tabular-nums font-semibold text-primary/60">
                      {r.nextStrike != null ? currency(r.nextStrike) : NO_VALUE}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">
                    <TermTip term="delta">Delta</TermTip>
                  </p>
                  <p className={cn("tabular-nums font-medium", figureTone(r))}>
                    {r.option?.delta != null ? deltaText(r.option.delta) : NO_VALUE}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">3-week %</p>
                  <p className="tabular-nums font-medium text-primary/60">
                    {r.yield3w != null ? percent(r.yield3w) : NO_VALUE}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Premium</p>
                  <p className={cn("tabular-nums", figureTone(r))}>
                    {r.premium != null ? currency(r.premium) : NO_VALUE}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                <span>{plural(Math.round(r.contracts), "contract")}, expires</span>
                <InlineExpiry
                  value={r.expiration}
                  onCommit={(expiry) => onPatchExpiry(r.holding.id, expiry)}
                  copied={copiedExpiry}
                  onCopy={setCopiedExpiry}
                />
              </div>
              {tracking && r.contracts >= 1 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSeed(fromSuggestion(r, "sold"))}
                  >
                    I sold this
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSeed(fromSuggestion(r, "planned"))}
                  >
                    Plan it
                  </Button>
                </div>
              ) : null}
            </Card>
          ))
        )}
        {rows.length > 0 && (
          <Card tone="raised" className="text-sm">
            <div className="flex justify-between">
              <span className="font-semibold text-foreground">All together</span>
              <span className="tabular-nums text-primary/60">
                {percent(yield3wAvg)} per 3 weeks
              </span>
            </div>
            <p className="mt-1 tabular-nums text-muted-foreground">
              {currency(premiumTotal)} in premium
            </p>
            {pasteAll ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={pasteAll}
              >
                <ClipboardPaste />
                Use {copiedExpiry} for every call
              </Button>
            ) : null}
          </Card>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <FluidTable template={template}>
          <FluidRow className={cn(headRow, "hover:bg-transparent")}>
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
                className={
                  i === 0
                    ? tickerCell
                    : label === "Near target?"
                      ? cellText
                      : cellBase
                }
              >
                {/*
                  The explanation was a `title` attribute on all nine of
                  these, which is the fault `TermTip` was built to fix: a
                  hover has no equivalent on a touch screen, so the reader
                  who most needs to know what a strike is could not reach
                  a single one of them.

                  The label is the trigger rather than a circle beside it,
                  and that is a width decision as much as a taste one. A
                  circle would add its own 16px plus a 14px halo to every
                  column in a table whose tracks already floor at their
                  widest cell, so nine of them would push the whole thing
                  into a sideways scroll on the laptop this table is for.

                  `TermTip` where the glossary knows the word, so
                  improving that answer improves it everywhere at once;
                  `InfoTip` for the columns that are this table's own
                  idea and belong to no shared vocabulary. Both open the
                  same way on a tap, so the row keeps one voice.
                */}
                {GLOSSARY_HEADERS[label] ? (
                  <TermTip term={GLOSSARY_HEADERS[label]!}>{label}</TermTip>
                ) : HEADER_HINTS[label] ? (
                  <InfoTip text={HEADER_HINTS[label]!}>{label}</InfoTip>
                ) : (
                  label
                )}
              </div>
            ))}
            {tracking ? <div className={cellCenter} aria-hidden /> : null}
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
            <FluidRow
              key={r.holding.id}
              className={cn(
                "hover:bg-muted/50",
                /*
                  A holding under a hundred shares cannot carry a call yet.
                  Its row stays, because the target and the strike are
                  worth setting before it gets there, but it steps back so
                  the rows that can be written read first.
                */
                r.contracts < 1 && "opacity-55 hover:opacity-100 focus-within:opacity-100"
              )}
            >
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
                  cellText,
                  "font-medium",
                  writeProximity(r.targetDistance).className
                )}
              >
                {writeProximity(r.targetDistance).label}
              </div>
              <div className={cellBase}>
                {onPatchStrike ? (
                  <InlineStrike
                    value={r.nextStrike}
                    onCommit={(strike) => commitStrike(r, strike)}
                  />
                ) : (
                  <span className="tabular-nums font-semibold text-primary/60">
                    {r.nextStrike != null ? currency(r.nextStrike) : NO_VALUE}
                  </span>
                )}
              </div>
              <div className={cn(cellBase, "tabular-nums", figureTone(r))}>
                {r.option?.delta != null ? deltaText(r.option.delta) : NO_VALUE}
              </div>
              <div className={cn(cellBase, "text-muted-foreground")}>
                <InlineExpiry
                  value={r.expiration}
                  onCommit={(expiry) => onPatchExpiry(r.holding.id, expiry)}
                  copied={copiedExpiry}
                  onCopy={setCopiedExpiry}
                />
              </div>
              <div className={cn(cellBase, "tabular-nums text-muted-foreground")}>
                {Math.round(r.contracts)}
              </div>
              <div
                className={cn(cellBase, "tabular-nums font-medium text-primary/60")}
              >
                {r.yield3w != null ? percent(r.yield3w) : NO_VALUE}
              </div>
              <div className={cn(cellBase, "tabular-nums", figureTone(r))}>
                {r.premium != null ? currency(r.premium) : NO_VALUE}
              </div>
              {tracking ? (
                <div className={cellCenter}>
                  {r.contracts >= 1 ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={`Track a call on ${cashtag(r.holding.ticker)}`}
                      onClick={() => setSeed(fromSuggestion(r, "sold"))}
                    >
                      <Plus />
                    </Button>
                  ) : null}
                </div>
              ) : null}
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
              <div className={cellBase}>
                {pasteAll ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 font-normal text-muted-foreground"
                    onClick={pasteAll}
                  >
                    <ClipboardPaste className="size-3.5" />
                    Use for all
                  </Button>
                ) : null}
              </div>
              <div className={cellBase} />
              <div className={cn(cellBase, "tabular-nums text-primary/60")}>
                {percent(yield3wAvg)}
              </div>
              <div className={cn(cellBase, "tabular-nums text-foreground")}>
                {currency(premiumTotal)}
              </div>
              {tracking ? <div className={cellBase} /> : null}
            </FluidRow>
          )}
        </FluidTable>
      </div>
      <p className="border-t border-border surface-gutter py-4 text-sm text-muted-foreground">
        {anyEstimated
          ? "Figures in grey are worked out from the volatility of nearby contracts, because that exact strike or date is not being quoted yet. "
          : ""}
        {ADVICE_DISCLAIMER_SHORT}
      </p>
    </Panel>
  );
});
