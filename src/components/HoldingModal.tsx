"use client";

import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { HouseholdCoinChips } from "@/components/CoinChips";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SUGGEST_MENU } from "@/components/ui/Panel";
import { Spinner } from "@/components/ui/spinner";
import { TickerSymbol } from "@/components/TickerSymbol";
import { ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  isSafePositiveMoney,
  isSafeShares,
  sanitizeTickerQuery,
} from "@/lib/input-guard";
import {
  localTickerSuggestions,
  mergeAndRankTickerSuggestions,
  pickTickerSuggestion,
  resolveTypedTicker,
} from "@/lib/market/ticker-search";
import { useTickerSearch } from "@/lib/use-ticker-search";
import { blockWheelChange, parseDecimal } from "@/lib/number-input";
import { holdingCostPreview } from "@/lib/holding-cost-preview";
import { roundMoney, roundShares } from "@/lib/money";
import { isCoinSymbol, matchCoinQuery, tickerFieldText, callPctForTicker } from "@/lib/coins";
import {
  isPlausibleTicker,
  normalizeYahooTicker,
  tickerExchangeHint,
} from "@/lib/ticker";
import {
  listingAmountToUsd,
  listingCurrenciesAreMixed,
  listingCurrency,
  listingPriceDigits,
  usdPerMapFromFx,
} from "@/lib/listing-currency";
import { cashtag, cn, currency } from "@/lib/format";

export type HoldingFormValues = {
  ticker: string;
  shares: number;
  buy_price: number;
  target_call_pct: number;
};

type Draft = {
  id: string;
  ticker: string;
  shares: number;
  buyPrice: number;
  buyUsd: number;
  targetCall: number;
};

type Props = {
  open: boolean;
  portfolioName: string;
  onClose: () => void;
  onSave: (rows: HoldingFormValues[]) => void;
  /** Hide the Target call % field for viewers with no options experience
   * — still submits with the same default, they just never see or think
   * about it. */
  hideCallPct?: boolean;
};

function upsertDraft(list: Draft[], row: Draft): Draft[] {
  const byId = list.findIndex((r) => r.id === row.id);
  if (byId >= 0) {
    const next = list.slice();
    next[byId] = row;
    return next;
  }
  const byTicker = list.findIndex((r) => r.ticker === row.ticker);
  if (byTicker >= 0) {
    const next = list.slice();
    next[byTicker] = { ...row, id: list[byTicker]!.id };
    return next;
  }
  return [...list, row];
}

export function HoldingModal({
  open,
  portfolioName,
  onClose,
  onSave,
  hideCallPct = false,
}: Props) {
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [targetCall, setTargetCall] = useState("15");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  /*
   * The exchange suffixes, folded away.
   *
   * They used to be the permanent hint under this box: three exchanges and
   * four made-up symbols, sitting where the answer to "what do I type here"
   * should be. Almost nobody needs them, because the box searches as you
   * type and the list under it is how a name actually gets picked, and the
   * people who do need them are asking one specific question. So the hint
   * is the plain sentence and the trivia is behind that question.
   */
  const [suffixOpen, setSuffixOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Draft[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const tickerRef = useRef<HTMLInputElement>(null);
  const remote = useTickerSearch(open ? ticker : "");
  const suggestions = useMemo(
    () =>
      mergeAndRankTickerSuggestions(
        ticker,
        localTickerSuggestions(ticker, [], new Set()),
        remote,
        new Set()
      ),
    [ticker, remote]
  );

  function resetForm() {
    setTicker("");
    setShares("");
    setBuyPrice("");
    setTargetCall("15");
    setError(null);
    setBusy(false);
    setListOpen(false);
    setEditingId(null);
  }

  useEffect(() => {
    if (!open) return;
    resetForm();
    setCollapsed([]);
  }, [open]);

  if (!open) return null;

  const formIsBlank =
    !ticker.trim() && !shares.trim() && !buyPrice.trim();

  async function resolveHoldingTicker(raw: string): Promise<string> {
    const typed = resolveTypedTicker(raw, suggestions);
    if (typed) return typed;
    try {
      const res = await fetch(
        `/api/market/search?q=${encodeURIComponent(raw)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return "";
      const data = (await res.json()) as {
        results?: { symbol: string; name: string | null }[];
      };
      const hit = pickTickerSuggestion(raw, data.results ?? []);
      return hit?.symbol ? normalizeYahooTicker(hit.symbol) : "";
    } catch {
      return "";
    }
  }

  async function readCurrentDraft(): Promise<Draft | null> {
    const sharesN = parseDecimal(shares);
    const buyN = parseDecimal(buyPrice);
    const callN = Math.round(parseDecimal(targetCall));
    const normalizedTicker = await resolveHoldingTicker(ticker.trim());
    if (!normalizedTicker) {
      setError("Type a ticker, a company, or a coin.");
      return null;
    }
    if (!isPlausibleTicker(normalizedTicker)) {
      setError("That ticker doesn't look like a real symbol.");
      return null;
    }
    if (!isSafeShares(sharesN)) {
      setError(
        isCoinSymbol(normalizedTicker)
          ? "How many you hold has to be more than 0, and a believable number."
          : "The number of shares has to be more than 0, and a believable number."
      );
      return null;
    }
    if (!isSafePositiveMoney(buyN)) {
      setError("The buy price has to be more than 0, and a believable number.");
      return null;
    }
    if (!Number.isFinite(callN) || callN < 0 || callN > 100) {
      setError("That has to be a number between 0 and 100.");
      return null;
    }

    let buyUsd = roundMoney(buyN);
    const buyCode = listingCurrency(normalizedTicker);
    if (buyCode !== "USD") {
      try {
        const fxRes = await fetch(
          `/api/quotes?tickers=${encodeURIComponent(normalizedTicker)}`,
          { cache: "no-store" }
        );
        if (!fxRes.ok) {
          setError("That buy price could not be converted into dollars. Try again in a moment.");
          return null;
        }
        const fxJson = (await fxRes.json()) as {
          fx?: {
            eurUsd?: number | null;
            gbpUsd?: number | null;
            usdPer?: Record<string, number | null | undefined>;
          };
        };
        const rates = usdPerMapFromFx(fxJson.fx);
        if (!(rates[buyCode] > 0)) {
          setError("That buy price could not be converted into dollars. Try again in a moment.");
          return null;
        }
        buyUsd = listingAmountToUsd(buyN, buyCode, rates);
      } catch {
        setError("That buy price could not be converted into dollars. Try again in a moment.");
        return null;
      }
    }

    return {
      id: editingId ?? crypto.randomUUID(),
      ticker: normalizedTicker,
      shares: roundShares(sharesN),
      buyPrice: roundMoney(buyN, listingPriceDigits(buyCode)),
      buyUsd,
      targetCall: callN,
    };
  }

  async function collapseCurrent(): Promise<boolean> {
    const draft = await readCurrentDraft();
    if (!draft) return false;
    setCollapsed((prev) => upsertDraft(prev, draft));
    return true;
  }

  async function addAnother() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await collapseCurrent();
      if (!ok) return;
      resetForm();
      requestAnimationFrame(() => tickerRef.current?.focus());
    } catch {
      setError("Couldn't add that holding. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function expandRow(row: Draft) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!formIsBlank) {
        const ok = await collapseCurrent();
        if (!ok) return;
      }
      setCollapsed((prev) =>
        prev.filter((r) => r.id !== row.id && r.ticker !== row.ticker)
      );
      setTicker(tickerFieldText(row.ticker));
      setShares(String(row.shares));
      setBuyPrice(String(row.buyPrice));
      setTargetCall(String(row.targetCall));
      setEditingId(row.id);
      setListOpen(false);
      requestAnimationFrame(() => tickerRef.current?.focus());
    } catch {
      setError("Couldn't open that holding. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let rows = collapsed;
      if (!formIsBlank) {
        const draft = await readCurrentDraft();
        if (!draft) return;
        rows = upsertDraft(rows, draft);
      }
      if (rows.length === 0) {
        setError("Type a ticker, a company, or a coin.");
        return;
      }
      onSave(
        rows.map((row) => ({
          ticker: row.ticker,
          shares: row.shares,
          buy_price: row.buyUsd,
          target_call_pct: callPctForTicker(row.ticker, row.targetCall / 100),
        }))
      );
    } catch {
      setError("Couldn't save that holding. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const normalized = resolveTypedTicker(ticker, suggestions);
  const holdingIsCoin = Boolean(
    matchCoinQuery(ticker) || (normalized && isCoinSymbol(normalized))
  );
  const costPreview = holdingCostPreview(
    shares,
    buyPrice,
    normalized ? listingCurrency(normalized) : "USD"
  );
  const hideCall = hideCallPct || holdingIsCoin;
  const exchangeHint = normalized ? tickerExchangeHint(normalized) : null;
  const buyCode = normalized ? listingCurrency(normalized) : "USD";
  const mixedListings = listingCurrenciesAreMixed(
    collapsed
      .map((row) => ({ ticker: row.ticker }))
      .concat(normalized ? [{ ticker: normalized }] : [])
  );
  const rowStyle = {
    gridTemplateColumns: mixedListings
      ? "max-content minmax(0,1fr) minmax(0,1.2fr) 1.25rem"
      : "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) 1.25rem",
  };

  return (
    <ViewportOverlay
      className="z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClose={onClose}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="scroll-host relative max-h-full w-full overflow-y-auto rounded-t-xl bg-popover ring-1 ring-foreground/20 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-xl sm:pb-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Add holding</h3>
            <p className="text-sm text-muted-foreground">{portfolioName}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            className="touch-target sm:size-7"
          >
            <X />
          </Button>
        </div>

        {collapsed.length > 0 && (
          <div className="mb-4 max-h-48 overflow-x-hidden overflow-y-auto card-sheen glass-well rounded-lg">
            <div
              className="grid h-10 items-center whitespace-nowrap px-3 text-sm font-medium text-muted-foreground"
              style={rowStyle}
            >
              <span className={mixedListings ? "justify-self-start" : "justify-self-center"}>
                Ticker
              </span>
              <span className="justify-self-center">How many</span>
              <span className="justify-self-center">Paid each</span>
              <span />
            </div>
            {collapsed.map((row) => {
              const code = listingCurrency(row.ticker);
              return (
                <button
                  key={row.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void expandRow(row)}
                  aria-label={`Edit ${cashtag(row.ticker)}`}
                  className="grid h-10 w-full items-center whitespace-nowrap border-t border-border px-3 text-sm text-foreground hover:bg-hover disabled:opacity-50"
                  style={rowStyle}
                >
                  <span
                    className={cn(
                      "min-w-0",
                      mixedListings ? "justify-self-start" : "justify-self-center"
                    )}
                  >
                    <TickerSymbol
                      ticker={row.ticker}
                      showCurrency={mixedListings}
                    />
                  </span>
                  <span className="justify-self-center tabular-nums text-muted-foreground">
                    {row.shares.toLocaleString("en-US", {
                      maximumFractionDigits: 4,
                    })}
                  </span>
                  <span className="justify-self-center tabular-nums text-muted-foreground">
                    {currency(row.buyPrice, listingPriceDigits(code), code)}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 justify-self-end text-muted-foreground" />
                </button>
              );
            })}
          </div>
        )}

        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel htmlFor="holding-ticker">Ticker, company, or coin</FieldLabel>
            <HouseholdCoinChips
              active={holdingIsCoin && normalized ? [normalized] : []}
              onPick={(symbol) => {
                setTicker(tickerFieldText(symbol));
                setListOpen(false);
                setError(null);
              }}
            />
            <div className="relative">
              <Input
                id="holding-ticker"
                ref={tickerRef}
                autoFocus
                value={ticker}
                onChange={(e) => {
                  setTicker(sanitizeTickerQuery(e.target.value));
                  setListOpen(true);
                  setError(null);
                }}
                onFocus={() => {
                  if (ticker.trim()) setListOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && suggestions[0] && listOpen) {
                    e.preventDefault();
                    setTicker(tickerFieldText(suggestions[0]!.symbol));
                    setListOpen(false);
                  }
                }}
                placeholder="Apple, NVDA, or Bitcoin"
                autoComplete="off"
                aria-invalid={Boolean(error)}
              />
              {listOpen && suggestions.length > 0 && (
                <ul className={SUGGEST_MENU}>
                  {suggestions.map((row) => (
                    <li key={row.symbol}>
                      <button
                        type="button"
                        className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm text-foreground hover:bg-hover"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setTicker(tickerFieldText(row.symbol));
                          setListOpen(false);
                        }}
                      >
                        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                          <TickerSymbol
                            ticker={row.symbol}
                            showCurrency={listingCurrency(row.symbol) !== "USD"}
                          />
                        </span>
                        {row.name && (
                          <span className="truncate text-muted-foreground">{row.name}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/*
              * The suffix guide is help for a name that has not resolved
              * yet, so it goes away once one has. It used to sit here
              * permanently with "Average buy in this listing's money" tacked
              * on the end, which named a field that already exists below and
              * buried the answer in exchange trivia. A reader told us they
              * could not tell whether the second box wanted a price or a
              * date, and this sentence is where that came from.
              */}
            <FieldDescription>
              {holdingIsCoin ? (
                "Which coin, and how many of it you hold."
              ) : normalized ? (
                <>
                  {normalized !== ticker.trim().toUpperCase() && (
                    <>{normalized} </>
                  )}
                  {exchangeHint}
                </>
              ) : (
                <>
                  Type a few letters and pick it from the list.{" "}
                  <button
                    type="button"
                    onClick={() => setSuffixOpen((v) => !v)}
                    aria-expanded={suffixOpen}
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    Bought outside the US?
                  </button>
                  {suffixOpen && (
                    <span className="mt-2 block">
                      London listings end in .L, so TICKER.L. Frankfurt ends
                      in .DE. Tallinn names look like LHV1T.
                    </span>
                  )}
                </>
              )}
            </FieldDescription>
          </Field>
          <div className="flex gap-6">
            <Field className="min-w-0 flex-1">
              <FieldLabel htmlFor="holding-shares">
                {holdingIsCoin ? "How many coins" : "How many shares"}
              </FieldLabel>
              <Input
                id="holding-shares"
                type="text"
                inputMode="decimal"
                value={shares}
                onChange={(e) => {
                  setShares(
                    e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "")
                  );
                  setError(null);
                }}
                onWheel={blockWheelChange}
                className="tabular-nums"
              />
            </Field>
            <Field className="min-w-0 flex-1">
              {/*
                * "Average buy" is a phrase this app taught the reader, not
                * one they arrived with, and on its own beside another
                * numeric box it reads as anything numeric, a date included.
                * Naming the unit ("for one share") cannot be misread, and
                * the arithmetic line under the pair proves it.
                */}
              <FieldLabel htmlFor="holding-buy">
                {holdingIsCoin ? "Paid for one coin" : "Paid for one share"}
                {buyCode !== "USD" ? ` (${buyCode})` : ""}
              </FieldLabel>
              <Input
                id="holding-buy"
                type="text"
                inputMode="decimal"
                value={buyPrice}
                onChange={(e) => {
                  setBuyPrice(
                    e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "")
                  );
                  setError(null);
                }}
                onWheel={blockWheelChange}
                className="tabular-nums"
              />
            </Field>
          </div>
          {/*
            * The two boxes, read back as a sentence.
            *
            * This is the part a label cannot do. A reader who has just typed
            * two numbers wants to know the app understood which was which,
            * and no wording is as convincing as the app doing the sum out
            * loud. It also catches the swap: 110 shares at $37 reads
            * obviously wrong to somebody who meant the other way round.
            */}
          {costPreview && (
            <p className="text-sm text-muted-foreground">
              <span className="font-mono tabular-nums text-foreground">
                {costPreview.shares} × {costPreview.each}
              </span>{" "}
              is{" "}
              <span className="font-mono tabular-nums text-foreground">
                {costPreview.total}
              </span>{" "}
              put into {holdingIsCoin ? "this coin" : "this name"}.
            </p>
          )}
          {!hideCall && (
            <Field>
              <FieldLabel htmlFor="holding-call">
                How far above your target to sell (%)
              </FieldLabel>
              <Input
                id="holding-call"
                type="text"
                inputMode="numeric"
                value={targetCall}
                onChange={(e) => {
                  setTargetCall(e.target.value.replace(/[^\d]/g, ""));
                  setError(null);
                }}
                onWheel={blockWheelChange}
                className="tabular-nums"
              />
            </Field>
          )}
        </FieldGroup>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="mr-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void addAnother()}
          >
            Add another
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </ViewportOverlay>
  );
}
