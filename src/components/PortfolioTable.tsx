"use client";

import { NO_VALUE, cashtag, cn, currency, percent, signedTone } from "@/lib/format";
import {
  usdToDisplay,
  formatEurUsdHint,
  type DisplayCurrency,
} from "@/lib/display-currency";
import {
  listingAmountToUsd,
  listingCurrenciesAreMixed,
  listingCurrency,
  listingPriceDigits,
  usdToListingAmount,
} from "@/lib/listing-currency";
import { TickerSymbol } from "@/components/TickerSymbol";
import { quoteAsOfTitle } from "@/lib/market/quote-freshness";
import { Button } from "@/components/ui/button";
import { Card, Panel, Segmented } from "@/components/ui/Panel";
import { TermTip } from "@/components/ui/TermTip";
import {
  blockWheelChange,
  formatDecimal,
  parseDecimal,
} from "@/lib/number-input";
import { MAX_SAFE_MONEY, MAX_SAFE_SHARES } from "@/lib/money";
import { sheetCashBalance } from "@/lib/cash-balance";
import type { EnrichedHolding, Portfolio } from "@/lib/types";
import { todayDollarFor } from "@/lib/overview";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  FileUp,
  Info,
  ImagePlus,
  Plus,
  TriangleAlert,
  Trash2,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  screenshotPickerInputProps,
  useScreenshotPicker,
} from "@/lib/use-screenshot-picker";
import { shareDigits } from "@/lib/share-count";
import { Sparkline } from "./Sparkline";
import { FluidRow, FluidTable, cellBase, cellTicker, tableCols } from "@/components/FluidTable";

export type HoldingPatch = {
  id: string;
  shares?: number;
  buy_price?: number;
  target_call_pct?: number;
  stock_target_override?: number | null;
};

type Props = {
  portfolio: Portfolio;
  holdings: EnrichedHolding[];
  totals: {
    buyValue: number;
    currentValue: number;
    roiDollar: number;
    roiPct: number;
    unrealizedProfits: number;
  };
  onPatch: (patch: HoldingPatch) => void | boolean | Promise<void | boolean>;
  onDelete: (id: string) => void;
  onEditCash: () => void;
  onAddHolding?: () => void;
  onAskMargus?: () => void;
  /** Hands chosen files to Margus. The picker lives next to this button. */
  onImportScreenshot?: (files: File[]) => void;
  /** Opens the CSV import modal. */
  onImportCsv?: () => void;
  onOpenTicker?: (ticker: string) => void;
  /** Sheet display currency for cost, value, and gain or loss. */
  displayCurrency?: DisplayCurrency;
  /** USD per 1 EUR — required when displayCurrency is EUR. */
  eurUsd?: number | null;
  /** USD per 1 unit of listing currency (SEK, NOK, …). */
  usdPer?: Record<string, number>;
  onDisplayCurrencyChange?: (currency: DisplayCurrency) => void;
  /** Class sheet: hide add / cash / sell when the teacher closed that. */
  tradeLock?: {
    canBuy: boolean;
    canSell: boolean;
    canCash: boolean;
    message: string;
  } | null;
};

function InlineNumber({
  value,
  digits = 0,
  /**
   * How many decimals to show when blurred; commit still uses `digits`.
   *
   * "auto" is the share count: whole numbers stay whole and a fraction
   * keeps only the decimals it needs. It used to be a flat 0 here, which
   * printed a tenth of a Bitcoin as "0" in the column headed Shares while
   * the forecast card two panels down said "0.12 shares".
   */
  displayDigits,
  onCommit,
  className,
}: {
  value: number;
  digits?: number;
  displayDigits?: number | "auto";
  onCommit: (n: number) => void | boolean | Promise<void | boolean>;
  className?: string;
}) {
  const shownDigits =
    displayDigits === "auto"
      ? shareDigits(value, digits > 0 ? digits : 4)
      : displayDigits ?? digits;
  const display = formatDecimal(value, shownDigits);
  // Focus shows true fractional value without trailing zeros (30 not 30.0000)
  const editDisplay =
    digits <= 0
      ? formatDecimal(value, 0)
      : Number.isFinite(value)
        ? String(Number(value.toFixed(digits)))
        : "";
  const [draft, setDraft] = useState(display);
  const focused = useRef(false);
  const allowDecimal = digits > 0;

  useEffect(() => {
    if (!focused.current) setDraft(display);
  }, [display]);

  async function commit() {
    focused.current = false;
    const n = parseDecimal(draft);
    if (!Number.isFinite(n)) {
      setDraft(display);
      return;
    }
    const rounded =
      digits <= 0
        ? Math.round(n)
        : Math.round(n * 10 ** digits) / 10 ** digits;
    const cap = digits <= 0 || digits >= 4 ? MAX_SAFE_SHARES : MAX_SAFE_MONEY;
    if (!Number.isFinite(rounded) || rounded <= 0 || rounded > cap) {
      setDraft(display);
      return;
    }
    if (rounded === value) {
      setDraft(display);
      return;
    }
    try {
      const ok = await onCommit(rounded);
      if (ok === false) setDraft(formatDecimal(value, shownDigits));
    } catch {
      setDraft(formatDecimal(value, shownDigits));
    }
  }

  return (
    <input
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      value={draft}
      onChange={(e) => {
        const next = allowDecimal
          ? e.target.value.replace(/,/g, ".").replace(/[^\d.-]/g, "")
          : e.target.value.replace(/[^\d-]/g, "");
        setDraft(next);
      }}
      onFocus={() => {
        focused.current = true;
        setDraft(editDisplay);
      }}
      onWheel={blockWheelChange}
      onBlur={() => {
        void commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(display);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(
        "inline-edit no-spinner rounded-t px-1 py-0.5 text-center tabular-nums text-foreground outline-none hover:bg-hover focus:bg-muted focus:ring-1 focus:ring-ring/50",
        className ?? "mx-auto w-full max-w-[4.5rem]"
      )}
    />
  );
}

type SortKey =
  | "ticker"
  | "pct"
  | "shares"
  | "buy"
  | "price"
  | "roiPct"
  | "cost"
  | "value"
  | "roiDollar"
  | "today"
  | "todayDollar";

/**
 * Twelve numeric columns in one row. Left to right: what you hold, what it
 * cost and what it is worth, what that made you, what happened today.
 * Vertical column rules are not used; Covered calls is the same table
 * language, row hairlines only.
 */
const COLUMNS: { label: string; key?: SortKey; term?: string }[] = [
  { label: "Ticker", key: "ticker" },
  /*
   * "% of total", not "% of portfolio": the widest header sets its
   * column's width, and this one sat over a column of "27.5%" at close to
   * twice the width of the next widest title, so the row read as one wide
   * gap and eleven narrow ones. The glossary tip beside it says the long
   * form.
   */
  { label: "% of total", key: "pct", term: "share-of-portfolio" },
  { label: "Shares", key: "shares", term: "share" },
  { label: "Paid each", key: "buy", term: "paid-each" },
  { label: "Price", key: "price" },
  { label: "Cost", key: "cost", term: "cost" },
  { label: "Value", key: "value", term: "value" },
  /*
   * One glyph per idea, on the first column that carries it.
   *
   * Gain % and Gain $ are one thing said two ways, and so are Today % and
   * Today $, so a tip on each of the pair would be the same panel twice.
   * It is also width: every column is floored at its widest cell, the
   * header usually is that cell in a narrow numeric column, and the table
   * already needs about 1,100px before it starts scrolling sideways.
   */
  { label: "Gain %", key: "roiPct", term: "gain" },
  { label: "Gain $", key: "roiDollar" },
  { label: "90 days", term: "recent-range" },
  { label: "Today %", key: "today", term: "today" },
  { label: "Today $", key: "todayDollar" },
];

/**
 * The label tier, on a tap target.
 *
 * `MicroLabel` renders a paragraph, and a paragraph is not allowed inside a
 * button, so the tip's own trigger carries the typography instead of
 * wrapping one.
 */
const TERM_LABEL =
  "font-mono text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground";

function sortValue(h: EnrichedHolding, key: SortKey): number | string {
  switch (key) {
    case "ticker":
      return h.ticker;
    case "pct":
      return h.pctOfTotal;
    case "shares":
      return h.shares;
    case "buy":
      return h.buy_price;
    case "price":
      return h.quote?.price ?? h.buy_price;
    case "roiPct":
      return h.roiPct;
    case "cost":
      return h.buyValue;
    case "value":
      return h.currentValue;
    case "roiDollar":
      return h.roiDollar;
    case "today": {
      if (!h.quote) return Number.NEGATIVE_INFINITY;
      return todayDollarFor(h.currentValue, h.quote.changePercent).pct ??
        Number.NEGATIVE_INFINITY;
    }
    case "todayDollar": {
      if (!h.quote) return Number.NEGATIVE_INFINITY;
      const t = todayDollarFor(h.currentValue, h.quote.changePercent);
      return t.pct === null ? Number.NEGATIVE_INFINITY : t.dollar;
    }
  }
}

export const PortfolioTable = memo(function PortfolioTable({
  portfolio,
  holdings,
  totals,
  onPatch,
  onDelete,
  onEditCash,
  onAddHolding,
  onAskMargus,
  onImportScreenshot,
  onImportCsv,
  onOpenTicker,
  displayCurrency = "USD",
  eurUsd = null,
  usdPer = { USD: 1 },
  onDisplayCurrencyChange,
  tradeLock,
}: Props) {
  const mixedListings = listingCurrenciesAreMixed(
    holdings.map((h) => ({ ticker: h.ticker, currency: h.quote?.currency }))
  );
  const screenshot = useScreenshotPicker({
    onPick: (files) => onImportScreenshot?.(files),
    disabled: !onImportScreenshot,
  });
  const tickerCell = mixedListings ? cellTicker : cellBase;
  const money = (usd: number, digits = 2) =>
    currency(usdToDisplay(usd, displayCurrency, eurUsd), digits, displayCurrency);

  function rowMoney(h: EnrichedHolding) {
    const code = listingCurrency(h.ticker, h.quote?.currency);
    const rate = usdPer[code];
    const canFx = code === "USD" || (typeof rate === "number" && rate > 0);
    const digits = listingPriceDigits(code);
    const spotUsd = h.quote?.price ?? h.buy_price;
    const nativeSpot =
      h.quote?.nativePrice != null && h.quote.nativePrice > 0
        ? h.quote.nativePrice
        : canFx
          ? usdToListingAmount(spotUsd, code, usdPer)
          : spotUsd;
    const nativeBuy = canFx
      ? usdToListingAmount(h.buy_price, code, usdPer)
      : h.buy_price;
    return { code, canFx, digits, nativeSpot, nativeBuy };
  }

  function commitBuy(h: EnrichedHolding, native: number) {
    const { code, canFx } = rowMoney(h);
    const buyUsd = canFx ? listingAmountToUsd(native, code, usdPer) : native;
    return onPatch({ id: h.id, buy_price: buyUsd });
  }

  // Default to biggest-position-first (% of book, descending) instead of
  // raw creation order — the most useful at-a-glance sort, and matches the
  // default in Community's read-only holdings view.
  const [sortKey, setSortKey] = useState<SortKey | null>("pct");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  function toggleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      // Numbers default to biggest-first (more useful at a glance); ticker A-Z.
      setSortDir(key === "ticker" ? 1 : -1);
      return;
    }
    setSortDir((d) => (d === 1 ? -1 : 1) as 1 | -1);
  }

  const sortedHoldings = useMemo(() => {
    if (!sortKey) return holdings;
    const rows = [...holdings];
    rows.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp =
        typeof va === "string" && typeof vb === "string"
          ? va.localeCompare(vb)
          : (va as number) - (vb as number);
      return cmp * sortDir;
    });
    return rows;
  }, [holdings, sortKey, sortDir]);

  /**
   * Today's move, per row and for the sheet, via the same shared helper the
   * Overview model uses so the two always agree. Cash is deliberately
   * outside the percentage: it doesn't move, and folding it in would dilute
   * the day's read on the positions that did.
   */
  const today = useMemo(() => {
    let dollar = 0;
    let weighted = 0;
    let weight = 0;
    for (const h of holdings) {
      const t = todayDollarFor(h.currentValue, h.quote?.changePercent);
      if (t.pct === null) continue;
      dollar += t.dollar;
      weighted += t.pct * h.currentValue;
      weight += h.currentValue;
    }
    return {
      dollar,
      pct: weight > 0 ? weighted / weight : null,
    };
  }, [holdings]);

  const rowToday = (h: (typeof holdings)[number]) =>
    todayDollarFor(h.currentValue, h.quote?.changePercent);

  /*
   * The phone's three orders, over the same `sortKey` the laptop table
   * drives, so one reading of the list serves both. A column the phone has
   * no button for (the reader sorted by cost on a laptop, then picked the
   * phone up) leaves the control showing nothing rather than lighting a
   * cell that is not what the list is doing.
   */
  const PHONE_SORTS = ["pct", "roiPct", "today"] as const;
  type PhoneSort = (typeof PHONE_SORTS)[number];
  const phoneSort: PhoneSort | null =
    sortKey && (PHONE_SORTS as readonly string[]).includes(sortKey)
      ? (sortKey as PhoneSort)
      : null;

  /**
   * Holdings nothing could price.
   *
   * `enrichHoldings` values one of these at the buy price, which keeps the
   * book's total honest (dropping the position would understate it, and
   * that is the failure the Sunday letter refuses to mail over) but leaves
   * the row reading as a stock that has not moved: cost as value, no gain,
   * no loss. A reader cannot tell that apart from a quiet week.
   *
   * The usual cause is not an outage. It is the company being renamed in a
   * merger, delisted, or the symbol having been typed wrong in the first
   * place, and all three are permanent until somebody edits the row, so the
   * position sits there looking flat forever. Naming them is the whole fix:
   * the arithmetic is fine, the silence was not.
   */
  const unpriced = holdings.filter((h) => !h.quote && h.shares > 0);

  const canAdd = !tradeLock || tradeLock.canBuy;
  const canSell = !tradeLock || tradeLock.canSell;
  // The action track only exists when a delete button can actually render,
  // so a read-only table keeps its 12 even columns.
  const template = tableCols(12, mixedListings, canSell);
  const canCash = !tradeLock || tradeLock.canCash;

  const emptyCta = canAdd ? (
    <div className="mt-4 flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {(onImportScreenshot || onAskMargus) && (
          <Button
            type="button"
            variant="outline"
            onClick={onImportScreenshot ? screenshot.open : onAskMargus}
          >
            <ImagePlus data-icon="inline-start" />
            Import screenshot
          </Button>
        )}
        {onImportCsv && (
          <Button type="button" variant="outline" onClick={onImportCsv}>
            <FileUp data-icon="inline-start" />
            Import CSV
          </Button>
        )}
        {onAddHolding && (
          <Button type="button" onClick={onAddHolding}>
            <Plus data-icon="inline-start" />
            Add holding manually
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        A screenshot or a CSV file brings every row in at once. Use whichever
        is easier for you to get hold of.
      </p>
    </div>
  ) : (
    <p className="mt-4 text-center text-sm text-muted-foreground">
      {tradeLock?.message}
    </p>
  );

  return (
    <Panel padded={false} className="overflow-hidden">
      {holdings.length === 0 && onImportScreenshot ? (
        <input {...screenshotPickerInputProps(screenshot)} />
      ) : null}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-3">
          <h2 className="font-semibold text-foreground">Holdings</h2>
          {onDisplayCurrencyChange && (
            <div
              title={
                eurUsd && eurUsd > 0
                  ? `Converted at ${formatEurUsdHint(eurUsd)}. Cost, value, and gain or loss follow this switch. Prices stay in each listing's own money.`
                  : "Waiting on the euro rate"
              }
            >
              <Segmented
                ariaLabel="Show amounts in"
                value={displayCurrency}
                onChange={onDisplayCurrencyChange}
                options={[
                  { id: "USD", label: "USD" },
                  { id: "EUR", label: "EUR" },
                ]}
              />
            </div>
          )}
          </div>
          {/*
            The three figures a reader came for, under the title rather
            than under two thousand pixels of cards. The footer keeps the
            arithmetic; this is the answer.
          */}
          {holdings.length > 0 && (
            <p className="text-sm tabular-nums text-muted-foreground">
              <span className="font-medium text-foreground">
                {money(totals.currentValue, 0)}
              </span>
              {" · "}
              <span className={signedTone(totals.roiPct)}>
                {percent(totals.roiPct)}
              </span>{" "}
              since you bought
              {today.pct !== null ? (
                <>
                  {" · "}
                  <span className={signedTone(today.pct)}>
                    {percent(today.pct, 2)}
                  </span>{" "}
                  today
                </>
              ) : null}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {/*
            Import used to share one bordered well with the cash figure,
            so a document glyph appeared to belong to Cash. It is its own
            control, and it says what it does in words rather than in a
            hover tooltip no phone can reach.
          */}
          {canAdd && onImportCsv && holdings.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onImportCsv}
              className="text-muted-foreground"
            >
              <FileUp data-icon="inline-start" />
              Import
            </Button>
          )}
          <div className="card-sheen glass-well flex items-center gap-1 rounded-lg py-1 pl-1 pr-1">
            <button
              type="button"
              onClick={canCash ? onEditCash : undefined}
              disabled={!canCash}
              className="touch-target inline-flex items-center gap-2 rounded-md px-2 py-1 text-left transition hover:bg-hover disabled:cursor-not-allowed disabled:hover:bg-transparent"
              title={canCash ? "Edit cash (stored in USD)" : tradeLock?.message}
            >
              <span className="text-sm font-medium text-muted-foreground">
                Cash
              </span>
              <span
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  sheetCashBalance(portfolio) < 0 ? "text-loss" : "text-foreground"
                )}
              >
                {money(sheetCashBalance(portfolio))}
              </span>
            </button>
          </div>
        </div>
      </header>

      {unpriced.length > 0 && (
        <div className="flex items-start gap-3 border-b border-border bg-warning/10 px-6 py-4">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-foreground">
              {unpriced.length === 1
                ? "One holding has no price"
                : `${unpriced.length} holdings have no price`}
            </p>
            <p className="mt-1 text-muted-foreground">
              {unpriced.map((h) => h.ticker).join(", ")}
              {unpriced.length === 1 ? " is" : " are"} shown at what you paid,
              so {unpriced.length === 1 ? "it reads" : "they read"} as flat
              rather than as missing. That usually means the company was
              renamed or taken over, or the symbol needs correcting. Check the
              symbol, and if the company was bought, replace the row with what
              you hold now.
            </p>
          </div>
        </div>
      )}

      {/*
        Phone cards.

        This used to be eight figures of equal weight in a two by four
        grid, 352px tall, with the two editable ones dashed like
        separators. Nothing led, so a beginner could not tell which number
        mattered, and the only visible control on the card was the bin.

        Now it leads with what the holding is worth and what that made,
        then today and how much of the portfolio it is, and last and
        smallest the three you come back to change. The header row is the
        way into the drawer, where the rest of this company lives, and
        removing the holding moved in there with it.
      */}
      <div className="flex flex-col gap-3 p-6 lg:hidden">
        {holdings.length === 0 ? (
          <div className="glass-well rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">No holdings in this portfolio yet.</p>
            {emptyCta}
          </div>
        ) : (
          <>
            {/*
              Sorting existed only on the laptop table, and the cards
              iterated the raw list, so a phone reader could not put their
              biggest holding first. Three orders is all a phone needs.
            */}
            {holdings.length > 2 && (
              <Segmented
                ariaLabel="Order the holdings by"
                value={phoneSort}
                onChange={(id) => {
                  setSortKey(id);
                  // Every phone order is a figure, so biggest first.
                  setSortDir(-1);
                }}
                options={[
                  { id: "pct", label: "Biggest" },
                  { id: "roiPct", label: "Best gain" },
                  { id: "today", label: "Today" },
                ]}
              />
            )}
            {sortedHoldings.map((h) => {
            const listed = rowMoney(h);
            const today = rowToday(h);
            return (
            <Card key={h.id} className="px-4 py-4">
              <button
                type="button"
                onClick={() => onOpenTicker?.(h.ticker)}
                disabled={!onOpenTicker}
                className="-mx-2 -mt-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2 text-left outline-none transition hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring/50 disabled:hover:bg-transparent"
                aria-label={
                  onOpenTicker ? `Open ${h.ticker}` : undefined
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-foreground">
                    <TickerSymbol
                      ticker={h.ticker}
                      currency={listed.code}
                      showCurrency={mixedListings}
                    />
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {currency(listed.nativeSpot, listed.digits, listed.code)}
                    {" a share"}
                  </span>
                </span>
                {/*
                  The line beside the ticker rather than a bare squiggle at
                  the foot of the card, with a caption saying what stretch
                  of time it covers.
                */}
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <Sparkline
                    points={h.quote?.sparkline ?? []}
                    width={72}
                    height={22}
                  />
                  <span className={TERM_LABEL}>Last 90 days</span>
                </span>
                {onOpenTicker ? (
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                ) : null}
              </button>

              <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <div className="min-w-0">
                  <TermTip
                    className={TERM_LABEL}
                    term="value"
                    example={{
                      ticker: cashtag(h.ticker),
                      amount: money(h.currentValue, 0),
                    }}
                  >
                    Value
                  </TermTip>
                  <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
                    {money(h.currentValue, 0)}
                  </p>
                </div>
                <div className="min-w-0 text-right">
                  <TermTip
                    className={TERM_LABEL}
                    term="gain"
                    align="end"
                    example={{
                      ticker: cashtag(h.ticker),
                      amount: money(h.roiDollar, 0),
                      second: percent(h.roiPct),
                    }}
                  >
                    Gain
                  </TermTip>
                  <p
                    className={cn(
                      "mt-1 font-mono text-xl font-semibold tabular-nums",
                      signedTone(h.roiPct)
                    )}
                  >
                    {percent(h.roiPct)}
                  </p>
                  <p
                    className={cn(
                      "text-sm tabular-nums",
                      signedTone(h.roiDollar)
                    )}
                  >
                    {money(h.roiDollar, 0)}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-t border-border/60 pt-3">
                <div className="min-w-0">
                  <TermTip
                    className={TERM_LABEL}
                    term="today"
                    example={{
                      ticker: cashtag(h.ticker),
                      amount:
                        today.pct != null ? money(today.dollar, 0) : undefined,
                    }}
                  >
                    Today
                  </TermTip>
                  <p
                    className={cn(
                      "mt-1 text-sm font-medium tabular-nums",
                      today.pct != null
                        ? signedTone(today.pct)
                        : "text-muted-foreground"
                    )}
                  >
                    {today.pct != null
                      ? `${percent(today.pct, 2)} · ${money(today.dollar, 0)}`
                      : NO_VALUE}
                  </p>
                </div>
                <div className="min-w-0 text-right">
                  <TermTip
                    className={TERM_LABEL}
                    term="share-of-portfolio"
                    align="end"
                    example={{
                      ticker: cashtag(h.ticker),
                      second: percent(h.pctOfTotal),
                    }}
                  >
                    Share of portfolio
                  </TermTip>
                  <p className="mt-1 text-sm font-medium tabular-nums text-muted-foreground">
                    {percent(h.pctOfTotal)}
                  </p>
                </div>
              </div>

              {/*
                What you own and what you paid: the numbers you come back
                to change rather than the ones you read every morning, so
                they sit last and small. They stay on the card rather than
                moving into the drawer because this is the only place on a
                phone they can be edited.
              */}
              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-t border-border/60 pt-3 text-sm text-muted-foreground">
                <label className="inline-flex items-baseline gap-1.5">
                  <TermTip
                    className={TERM_LABEL}
                    term="share"
                    example={{ ticker: cashtag(h.ticker), count: h.shares }}
                  >
                    Shares
                  </TermTip>
                  <InlineNumber
                    value={h.shares}
                    digits={4}
                    displayDigits="auto"
                    onCommit={(shares) => onPatch({ id: h.id, shares })}
                    className="w-16 text-right"
                  />
                </label>
                <label className="inline-flex items-baseline gap-1.5">
                  <TermTip
                    className={TERM_LABEL}
                    term="paid-each"
                    example={{
                      ticker: cashtag(h.ticker),
                      amount: currency(
                        listed.nativeBuy,
                        listed.digits,
                        listed.code
                      ),
                    }}
                  >
                    Paid each
                  </TermTip>
                  <InlineNumber
                    value={listed.nativeBuy}
                    digits={listed.digits}
                    onCommit={(buy_price) => commitBuy(h, buy_price)}
                    className="w-20 text-right"
                  />
                </label>
                <span className="inline-flex items-baseline gap-1.5">
                  <TermTip
                    className={TERM_LABEL}
                    term="cost"
                    align="end"
                    example={{
                      ticker: cashtag(h.ticker),
                      amount: money(h.buyValue, 0),
                    }}
                  >
                    Cost
                  </TermTip>
                  <span className="tabular-nums">{money(h.buyValue, 0)}</span>
                </span>
              </div>
            </Card>
            );
          })}
          </>
        )}

        {holdings.length > 0 && (
          <div className="card-sheen glass-well rounded-lg px-4 py-4 text-sm">
            <div className="flex justify-between font-semibold">
              <span className="text-foreground">Portfolio</span>
              <span className={cn("tabular-nums", signedTone(totals.roiPct))}>
                {percent(totals.roiPct)}
              </span>
            </div>
            <div className="mt-1 flex justify-between text-muted-foreground">
              <span>Cost {money(totals.buyValue, 0)}</span>
              <span>Value {money(totals.currentValue, 0)}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className={cn("tabular-nums", signedTone(totals.roiDollar))}>
                {money(totals.roiDollar, 0)}
              </span>
              {today.pct !== null && (
                <span className="tabular-nums">
                  <span className={signedTone(today.pct)}>
                    {percent(today.pct, 2)}
                  </span>
                  <span className="text-muted-foreground"> </span>
                  <span className={signedTone(today.dollar)}>
                    {money(today.dollar, 0)}
                  </span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block">
        {holdings.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">No holdings in this portfolio yet.</p>
            {emptyCta}
          </div>
        ) : (
          <FluidTable template={template}>
            <FluidRow className="border-border text-sm font-medium text-muted-foreground">
              {COLUMNS.map((col, i) => (
                <div
                  key={col.label}
                  /*
                    A header is one line, like every cell under it.
                    Headers used to be allowed to wrap so a label spelled
                    out in words ("% of portfolio", now "% of total") would
                    not set the whole track's width, and the result was a
                    header row where
                    four titles sat on two lines and eight on one, so the
                    row read as uneven before a single figure was looked
                    at. `cellBase` is already `whitespace-nowrap`, every
                    column is floored at its widest cell, and `FluidTable`
                    scrolls sideways past that, so a wider table is the
                    price and it is the right one: a title broken over
                    two lines is the same fault as a price broken over two.
                  */
                  className={cn(i === 0 ? tickerCell : cellBase, "gap-1")}
                >
                  {/*
                    Two jobs, two targets. The header still sorts, because
                    that is what a table header does; the question mark
                    beside it opens the same glossary entry the phone label
                    opens, so the explanation is not a hover tooltip a
                    touch screen can never reach.
                  */}
                  {col.key ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key!)}
                      className={cn(
                        "inline-flex items-center gap-1 transition hover:text-foreground",
                        sortKey === col.key && "text-primary/70"
                      )}
                      title={`Sort by ${col.label}`}
                    >
                      {col.label}
                      {sortKey === col.key ? (
                        sortDir === 1 ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )
                      ) : null}
                    </button>
                  ) : (
                    col.label
                  )}
                  {col.term ? (
                    <TermTip bare term={col.term} align="center">
                      <Info className="size-3.5" aria-hidden />
                    </TermTip>
                  ) : null}
                </div>
              ))}
            </FluidRow>

            {sortedHoldings.map((h) => {
              const listed = rowMoney(h);
              return (
              <FluidRow key={h.id} className="group hover:bg-muted/50">
                <div
                  className={cn(
                    tickerCell,
                    "font-semibold tracking-wide text-foreground"
                  )}
                >
                  <TickerSymbol
                    ticker={h.ticker}
                    currency={listed.code}
                    onOpen={onOpenTicker}
                    showCurrency={mixedListings}
                  />
                </div>
                <div className={cn(cellBase, "tabular-nums text-muted-foreground")}>
                  {percent(h.pctOfTotal)}
                </div>
                <div className={cellBase}>
                  <InlineNumber
                    value={h.shares}
                    digits={4}
                    displayDigits="auto"
                    onCommit={(shares) => onPatch({ id: h.id, shares })}
                  />
                </div>
                <div className={cellBase}>
                  <InlineNumber
                    value={listed.nativeBuy}
                    digits={listed.digits}
                    onCommit={(buy_price) => commitBuy(h, buy_price)}
                  />
                </div>
                <div
                  className={cn(cellBase, "tabular-nums font-semibold text-foreground")}
                  title={quoteAsOfTitle(h.quote)}
                >
                  {currency(listed.nativeSpot, listed.digits, listed.code)}
                </div>
                <div className={cn(cellBase, "tabular-nums text-muted-foreground")}>
                  {money(h.buyValue, 0)}
                </div>
                <div className={cn(cellBase, "tabular-nums text-foreground")}>
                  {money(h.currentValue, 0)}
                </div>
                <div
                  className={cn(
                    cellBase,
                    "tabular-nums font-medium",
                    signedTone(h.roiPct)
                  )}
                >
                  {percent(h.roiPct)}
                </div>
                <div
                  className={cn(
                    cellBase,
                    "tabular-nums font-medium",
                    signedTone(h.roiDollar)
                  )}
                >
                  {money(h.roiDollar, 0)}
                </div>
                <div className={cellBase}>
                  <Sparkline
                    points={h.quote?.sparkline ?? []}
                    width={56}
                    height={18}
                  />
                </div>
                <div
                  className={cn(
                    cellBase,
                    "tabular-nums font-medium",
                    rowToday(h).pct != null
                      ? signedTone(rowToday(h).pct!)
                      : "text-muted-foreground"
                  )}
                >
                  {rowToday(h).pct != null
                    ? percent(rowToday(h).pct!, 2)
                    : NO_VALUE}
                </div>
                <div
                  className={cn(
                    cellBase,
                    "tabular-nums font-medium",
                    rowToday(h).pct != null
                      ? signedTone(rowToday(h).dollar)
                      : "text-muted-foreground"
                  )}
                >
                  {rowToday(h).pct != null
                    ? money(rowToday(h).dollar, 0)
                    : NO_VALUE}
                </div>
                {canSell ? (
                  <div className="flex h-full items-center justify-center">
                    <button
                      type="button"
                      onClick={() => onDelete(h.id)}
                      className="row-action grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-loss/10 hover:text-loss focus-visible:text-loss focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-loss/40"
                      aria-label={`Delete ${h.ticker}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
              </FluidRow>
              );
            })}

            <FluidRow footer className="border-t border-border font-semibold">
              <div className={cn(tickerCell, "text-foreground")}>PORTFOLIO</div>
              <div className={cn(cellBase, "tabular-nums text-muted-foreground")}>
                100%
              </div>
              <div className={cellBase} />
              <div className={cellBase} />
              <div className={cellBase} />
              <div className={cn(cellBase, "tabular-nums text-muted-foreground")}>
                {money(totals.buyValue, 0)}
              </div>
              <div className={cn(cellBase, "tabular-nums text-foreground")}>
                {money(totals.currentValue, 0)}
              </div>
              <div
                className={cn(
                  cellBase,
                  "tabular-nums",
                  signedTone(totals.roiPct)
                )}
              >
                {percent(totals.roiPct)}
              </div>
              <div
                className={cn(
                  cellBase,
                  "tabular-nums",
                  signedTone(totals.roiDollar)
                )}
              >
                {money(totals.roiDollar, 0)}
              </div>
              <div className={cellBase} />
              <div
                className={cn(
                  cellBase,
                  "tabular-nums font-medium",
                  today.pct != null ? signedTone(today.pct) : "text-muted-foreground"
                )}
              >
                {today.pct != null ? percent(today.pct, 2) : NO_VALUE}
              </div>
              <div
                className={cn(
                  cellBase,
                  "tabular-nums font-medium",
                  today.pct != null ? signedTone(today.dollar) : "text-muted-foreground"
                )}
              >
                {today.pct != null ? money(today.dollar, 0) : NO_VALUE}
              </div>
              {canSell ? <div /> : null}
            </FluidRow>
          </FluidTable>
        )}
      </div>
    </Panel>
  );
});
