"use client";

import { NO_VALUE, cn, currency, percent, signedTone } from "@/lib/format";
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
import { Card, MicroLabel, Segmented } from "@/components/ui/Panel";
import {
  blockWheelChange,
  formatDecimal,
  parseDecimal,
} from "@/lib/number-input";
import { MAX_SAFE_MONEY, MAX_SAFE_SHARES } from "@/lib/money";
import { sheetCashBalance } from "@/lib/cash-balance";
import type { EnrichedHolding, Portfolio } from "@/lib/types";
import { todayDollarFor } from "@/lib/overview";
import { ArrowDown, ArrowUp, FileUp, ImagePlus, Plus, Trash2 } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
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
  /** Opens Margus AND immediately triggers the image file picker. */
  onImportScreenshot?: () => void;
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
  /** How many decimals to show when blurred; commit still uses `digits`. */
  displayDigits,
  onCommit,
  className,
}: {
  value: number;
  digits?: number;
  displayDigits?: number;
  onCommit: (n: number) => void | boolean | Promise<void | boolean>;
  className?: string;
}) {
  const shownDigits = displayDigits ?? digits;
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

const COLUMNS: { label: string; key?: SortKey; explain?: string }[] = [
  { label: "Ticker", key: "ticker" },
  {
    label: "% Total",
    key: "pct",
    explain: "Share of your whole portfolio's value this position takes up",
  },
  {
    label: "Shares",
    key: "shares",
    explain: "How many shares (or fractional shares) you hold",
  },
  {
    label: "Buy",
    key: "buy",
    explain: "Average price you paid per share, in this listing's money",
  },
  { label: "Price", key: "price", explain: "Current share price, in this listing's money" },
  {
    label: "ROI %",
    key: "roiPct",
    explain: "Gain or loss vs. what you paid, as a percentage: (Value − Cost) ÷ Cost",
  },
  {
    label: "Cost",
    key: "cost",
    explain: "Total dollars you put in: shares × buy price",
  },
  {
    label: "Value",
    key: "value",
    explain: "What that position is worth right now: shares × current price",
  },
  {
    label: "ROI $",
    key: "roiDollar",
    explain: "Gain or loss vs. what you paid, in dollars: Value − Cost",
  },
  { label: "90d", explain: "Price trend over the last ~90 days" },
  {
    label: "Today %",
    key: "today",
    explain: "Share-price move since yesterday's close",
  },
  {
    label: "Today $",
    key: "todayDollar",
    explain: "What today's share-price move did to this position, in dollars",
  },
];

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
            onClick={onImportScreenshot ?? onAskMargus}
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
        Screenshot or CSV drops every row in at once. Pick whichever&apos;s
        easier to get your hands on.
      </p>
    </div>
  ) : (
    <p className="mt-4 text-center text-sm text-muted-foreground">
      {tradeLock?.message}
    </p>
  );

  return (
    <section className="overflow-hidden rounded-xl glass ring-1 ring-foreground/20">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-6">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-foreground">Holdings</h2>
          {onDisplayCurrencyChange && (
            <div
              title={
                eurUsd && eurUsd > 0
                  ? `Converted at ${formatEurUsdHint(eurUsd)}. Cost, value, and gain or loss follow this switch. Share prices stay in each listing's own money.`
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
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 py-1 pl-1 pr-1">
            {canAdd && onImportCsv && holdings.length > 0 && (
              <button
                type="button"
                onClick={onImportCsv}
                title="Import / update holdings from a CSV file"
                className="touch-target inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-hover hover:text-foreground"
                aria-label="Import CSV"
              >
                <FileUp className="h-3.5 w-3.5" />
              </button>
            )}
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

      {/* Mobile / tablet cards. The 13-col table needs the 1080px column. */}
      <div className="flex flex-col gap-3 p-6 lg:hidden">
        {holdings.length === 0 ? (
          <div className="glass-well rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">No holdings in this portfolio yet.</p>
            {emptyCta}
          </div>
        ) : (
          holdings.map((h) => {
            const listed = rowMoney(h);
            const today = rowToday(h);
            return (
            <Card key={h.id} className="px-4 py-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-semibold text-foreground">
                    <TickerSymbol
                      ticker={h.ticker}
                      currency={listed.code}
                      onOpen={onOpenTicker}
                      showCurrency={mixedListings}
                    />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {percent(h.pctOfTotal)} of book
                  </p>
                </div>
                {canSell ? (
                <button
                  type="button"
                  onClick={() => onDelete(h.id)}
                  className="rounded-md p-2.5 text-muted-foreground hover:bg-hover hover:text-loss"
                  aria-label={`Delete ${h.ticker}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                ) : (
                  <span className="w-10" />
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <MicroLabel>Shares</MicroLabel>
                  <InlineNumber
                    value={h.shares}
                    digits={4}
                    displayDigits={0}
                    onCommit={(shares) => onPatch({ id: h.id, shares })}
                    className="w-full"
                  />
                </label>
                <label className="grid gap-1">
                  <MicroLabel>Buy</MicroLabel>
                  <InlineNumber
                    value={listed.nativeBuy}
                    digits={listed.digits}
                    onCommit={(buy_price) => commitBuy(h, buy_price)}
                    className="w-full"
                  />
                </label>
                <div>
                  <MicroLabel>Price</MicroLabel>
                  <p
                    className="mt-1 text-base font-semibold tabular-nums text-foreground"
                    title={quoteAsOfTitle(h.quote)}
                  >
                    {currency(listed.nativeSpot, listed.digits, listed.code)}
                  </p>
                </div>
                <div>
                  <MicroLabel>ROI %</MicroLabel>
                  <p className={cn("mt-1 text-base font-semibold tabular-nums", signedTone(h.roiPct))}>
                    {percent(h.roiPct)}
                  </p>
                </div>
                <div>
                  <MicroLabel>Cost</MicroLabel>
                  <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                    {money(h.buyValue, 0)}
                  </p>
                </div>
                <div>
                  <MicroLabel>Value</MicroLabel>
                  <p className="mt-1 text-sm tabular-nums text-foreground">
                    {money(h.currentValue, 0)}
                  </p>
                </div>
                <div>
                  <MicroLabel>ROI $</MicroLabel>
                  <p
                    className={cn(
                      "mt-1 text-sm font-medium tabular-nums",
                      signedTone(h.roiDollar)
                    )}
                  >
                    {money(h.roiDollar, 0)}
                  </p>
                </div>
                <div>
                  <MicroLabel>Today</MicroLabel>
                  <p
                    className={cn(
                      "mt-1 text-sm font-medium tabular-nums",
                      today.pct != null ? signedTone(today.pct) : "text-muted-foreground"
                    )}
                  >
                    {today.pct != null
                      ? `${percent(today.pct, 2)} · ${money(today.dollar, 0)}`
                      : NO_VALUE}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <Sparkline
                  points={h.quote?.sparkline ?? []}
                  width={140}
                  height={28}
                />
              </div>
            </Card>
            );
          })
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
                  className={i === 0 ? tickerCell : cellBase}
                >
                  {col.key ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key!)}
                      className={cn(
                        "inline-flex items-center gap-1 transition hover:text-foreground",
                        sortKey === col.key && "text-primary/70"
                      )}
                      title={
                        col.explain
                          ? `${col.explain}. Click to sort.`
                          : `Sort by ${col.label}`
                      }
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
                  ) : col.explain ? (
                    <span title={col.explain}>{col.label}</span>
                  ) : (
                    col.label
                  )}
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
                    displayDigits={0}
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
                <div
                  className={cn(
                    cellBase,
                    "tabular-nums font-medium",
                    signedTone(h.roiPct)
                  )}
                >
                  {percent(h.roiPct)}
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
              <div
                className={cn(
                  cellBase,
                  "tabular-nums",
                  signedTone(totals.roiPct)
                )}
              >
                {percent(totals.roiPct)}
              </div>
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
    </section>
  );
});
