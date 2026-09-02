"use client";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented, SUGGEST_MENU } from "@/components/ui/Panel";
import { HouseholdCoinChips } from "@/components/CoinChips";
import { TickerSymbol } from "@/components/TickerSymbol";
import { TourAsk } from "@/components/tour/TourRow";
import { ownedBookPortfolios } from "@/lib/classroom";
import { requestBookRefresh } from "@/lib/book-cache";
import { isCoinSymbol, tickerFieldText } from "@/lib/coins";
import {
  parseHoldingsCsv,
  parseHoldingsPaste,
  type CsvHoldingRow,
} from "@/lib/csv-import";
import { cashtag, cn, currency, signedPercent } from "@/lib/format";
import { holdingCostPreview } from "@/lib/holding-cost-preview";
import {
  isSafePositiveMoney,
  isSafeShares,
  sanitizeTickerQuery,
} from "@/lib/input-guard";
import {
  listingAmountToUsd,
  listingCurrency,
  listingPriceDigits,
  usdPerMapFromFx,
} from "@/lib/listing-currency";
import {
  localTickerSuggestions,
  mergeAndRankTickerSuggestions,
  pickTickerSuggestion,
  resolveTypedTicker,
} from "@/lib/market/ticker-search";
import { roundMoney, roundShares } from "@/lib/money";
import { blockWheelChange, parseDecimal } from "@/lib/number-input";
import { FIRST_SHEET_NAME } from "@/lib/product";
import { isPlausibleTicker, normalizeYahooTicker } from "@/lib/ticker";
import { useTickerSearch } from "@/lib/use-ticker-search";
import {
  screenshotPickerInputProps,
  useScreenshotPicker,
} from "@/lib/use-screenshot-picker";
import { stashTourScreenshot } from "@/lib/welcome-tour";
import type { Quote } from "@/lib/types";
import { useEffect, useMemo, useRef, useState } from "react";

/*
  Add what you own, with every way in on one screen.

  Four roads and they are genuinely different jobs, so they are a choice
  the reader makes rather than four buttons stacked up: typing one company
  is the shortest road for somebody with three holdings, pasting lines is
  the shortest for somebody with a list already in a message to themselves,
  a CSV is what a broker exports, and a picture of the broker screen is
  what somebody has on their phone right now.

  THE PICTURE OPENS FROM A REAL TAP, THROUGH `useScreenshotPicker`. Mobile
  Safari treats a file input opened from an effect as a camera prompt, so
  the input stays inert until `open()` runs inside the press. Reading the
  picture is Margus's job and Margus lives in the app rather than in this
  overlay, so the picture is handed over when the walkthrough closes, which
  is the only promise here that is kept somewhere else, and it is kept.

  And once one holding lands, the screen says something back, built out of
  that company's live price. A form that swallows what you typed and shows
  a tick is a form; a form that answers with what your shares are worth
  this minute is the app starting.
*/

type AddedHolding = { ticker: string; shares: number; buyPrice: number };

type Road = "type" | "paste" | "csv" | "picture";

/*
  One word each, because four cells across a 390px phone is about 70px of
  track apiece and "Paste a list" wraps to two lines in it. The sentence
  above the control already says these are four ways of doing one thing.
*/
const ROADS: readonly { id: Road; label: string }[] = [
  { id: "type", label: "Type it" },
  { id: "paste", label: "Paste" },
  { id: "csv", label: "CSV" },
  { id: "picture", label: "Picture" },
];

export function AddHoldingsScreen({
  added,
  onAdded,
  listOpen,
  onListOpen,
}: {
  added: AddedHolding[];
  onAdded: (rows: AddedHolding[]) => void;
  /** Lifted, because Escape closes the suggestion list before the tour. */
  listOpen: boolean;
  onListOpen: (open: boolean) => void;
}) {
  const [road, setRoad] = useState<Road>("type");

  const [ticker, setTicker] = useState("");
  /*
    The exact symbol they picked, when they picked rather than typed. See
    HoldingModal: BTC, SOL and LINK are listed symbols as well as coin
    aliases, so a pick that has to survive as field text would come back as
    the coin. Cleared as soon as they type.
  */
  const [pickedTicker, setPickedTicker] = useState<string | null>(null);
  const [shares, setShares] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockBusy, setStockBusy] = useState(false);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const tickerRef = useRef<HTMLInputElement>(null);

  const [paste, setPaste] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const [csvNote, setCsvNote] = useState<string | null>(null);
  const [picture, setPicture] = useState<string | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  const remote = useTickerSearch(ticker);
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

  const resolvedTicker = pickedTicker ?? resolveTypedTicker(ticker, suggestions);
  const holdingIsCoin = Boolean(resolvedTicker && isCoinSymbol(resolvedTicker));
  const buyCode = resolvedTicker ? listingCurrency(resolvedTicker) : "USD";
  const costPreview = holdingCostPreview(shares, buyPrice, buyCode);

  const first = added[0] ?? null;
  /* Asking, an answer, or no price at all. See `WatchScreen` for why three. */
  const [firstQuote, setFirstQuote] = useState<Quote | "none" | null>(null);

  /* The live price for the first thing they added, and nothing else. */
  useEffect(() => {
    if (!first) {
      setFirstQuote(null);
      return;
    }
    const ctrl = new AbortController();
    void fetch(`/api/quotes?tickers=${encodeURIComponent(first.ticker)}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { quotes?: Record<string, Quote> } | null) => {
        if (ctrl.signal.aborted) return;
        setFirstQuote(data?.quotes?.[first.ticker] ?? "none");
      })
      .catch(() => {
        /* No price this minute. Said out loud, never guessed at. */
        if (!ctrl.signal.aborted) setFirstQuote("none");
      });
    return () => ctrl.abort();
  }, [first]);

  const screenshot = useScreenshotPicker({
    onPick: (files) => {
      const file = files[0];
      if (!file) return;
      stashTourScreenshot(files);
      setPicture(file.name);
    },
  });

  async function ensureSheet(): Promise<string | null> {
    if (sheetId) return sheetId;
    const res = await fetch("/api/portfolios", { cache: "no-store" });
    const data = res.ok ? await res.json() : null;
    const own = ownedBookPortfolios(
      (data?.portfolios ?? []) as {
        id: string;
        classroom_community_id?: string | null;
      }[]
    );
    if (own[0]?.id) {
      setSheetId(own[0].id);
      return own[0].id;
    }
    const created = await fetch("/api/portfolios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: FIRST_SHEET_NAME }),
    });
    if (!created.ok) return null;
    const createdData = (await created.json()) as {
      portfolio?: { id?: string };
    };
    const id = createdData.portfolio?.id ?? null;
    if (id) setSheetId(id);
    return id;
  }

  async function resolveTicker(raw: string): Promise<string> {
    if (pickedTicker) return pickedTicker;
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

  async function addHolding() {
    if (stockBusy) return;
    setStockBusy(true);
    setStockError(null);
    try {
      const sharesN = parseDecimal(shares);
      const buyN = parseDecimal(buyPrice);
      const normalizedTicker = await resolveTicker(ticker.trim());
      if (!normalizedTicker) {
        setStockError("Type a ticker, a company, or a coin.");
        return;
      }
      if (!isPlausibleTicker(normalizedTicker)) {
        setStockError(
          "That does not look like a real ticker. Try the company name instead."
        );
        return;
      }
      if (!isSafeShares(sharesN)) {
        setStockError(
          isCoinSymbol(normalizedTicker)
            ? "How many you hold has to be more than 0, and a believable number."
            : "The number of shares has to be more than 0, and a believable number."
        );
        return;
      }
      if (!isSafePositiveMoney(buyN)) {
        setStockError(
          "The buy price has to be more than 0, and a believable number."
        );
        return;
      }

      let buyUsd = roundMoney(buyN);
      const code = listingCurrency(normalizedTicker);
      if (code !== "USD") {
        const fxRes = await fetch(
          `/api/quotes?tickers=${encodeURIComponent(normalizedTicker)}`,
          { cache: "no-store" }
        );
        if (!fxRes.ok) {
          setStockError(
            "That buy price could not be converted into dollars. Try again in a moment."
          );
          return;
        }
        const fxJson = (await fxRes.json()) as {
          fx?: {
            eurUsd?: number | null;
            gbpUsd?: number | null;
            usdPer?: Record<string, number | null | undefined>;
          };
        };
        const rates = usdPerMapFromFx(fxJson.fx);
        if (!(rates[code] > 0)) {
          setStockError(
            "That buy price could not be converted into dollars. Try again in a moment."
          );
          return;
        }
        buyUsd = listingAmountToUsd(buyN, code, rates);
      }

      const id = await ensureSheet();
      if (!id) {
        setStockError("Couldn't open a portfolio. Try again.");
        return;
      }
      const res = await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolio_id: id,
          ticker: normalizedTicker,
          shares: roundShares(sharesN),
          buy_price: buyUsd,
        }),
      });
      if (!res.ok) {
        setStockError("Couldn't save that holding. Try again.");
        return;
      }
      onAdded([
        ...added.filter((r) => r.ticker !== normalizedTicker),
        {
          ticker: normalizedTicker,
          shares: roundShares(sharesN),
          buyPrice: roundMoney(buyN, listingPriceDigits(code)),
        },
      ]);
      setTicker("");
      setPickedTicker(null);
      setShares("");
      setBuyPrice("");
      onListOpen(false);
      requestBookRefresh();
      requestAnimationFrame(() => tickerRef.current?.focus());
    } catch {
      setStockError("Couldn't save that holding. Try again.");
    } finally {
      setStockBusy(false);
    }
  }

  /** Both the pasted lines and the CSV land here: same rows, same import. */
  async function importRows(
    rows: CsvHoldingRow[],
    say: (note: string | null) => void
  ) {
    const id = await ensureSheet();
    if (!id) {
      say("Couldn't open a portfolio. Try again.");
      return;
    }
    const res = await fetch("/api/holdings/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolio_id: id,
        cash: null,
        /* Never a replace: this is somebody adding, not restoring. */
        replace: false,
        holdings: rows.map((r) => ({
          ticker: r.ticker,
          shares: r.shares,
          buy_price: r.buyPrice,
        })),
      }),
    });
    if (!res.ok) {
      say("Couldn't save those. Try again.");
      return;
    }
    onAdded([
      ...added.filter((a) => !rows.some((r) => r.ticker === a.ticker)),
      ...rows.map((r) => ({
        ticker: r.ticker,
        shares: r.shares,
        buyPrice: r.buyPrice,
      })),
    ]);
    say(
      `Saved ${rows.length} ${rows.length === 1 ? "company" : "companies"}.`
    );
    requestBookRefresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <TourAsk>Pick whichever of these is least work for you.</TourAsk>

      <Segmented
        value={road}
        onChange={setRoad}
        options={ROADS}
        columns={4}
        ariaLabel="How to add what you own"
      />

      {added.length > 0 && (
        <ul className="flex flex-col gap-1">
          {added.map((row) => (
            <li
              key={row.ticker}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <TickerSymbol ticker={row.ticker} />
              <span className="font-mono tabular-nums text-muted-foreground">
                {row.shares} at {currency(row.buyPrice, 2)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {road === "type" && (
        /*
          A real form, so Enter in any of the three fields adds the holding.
          On a phone that is the difference between typing a price and
          hunting for a button with the keyboard in the way.
        */
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void addHolding();
          }}
        >
          <Field>
            <FieldLabel htmlFor="onboard-ticker">
              Ticker, company, or coin
            </FieldLabel>
            <HouseholdCoinChips
              active={holdingIsCoin && resolvedTicker ? [resolvedTicker] : []}
              onPick={(symbol) => {
                setTicker(tickerFieldText(symbol));
                setPickedTicker(symbol);
                onListOpen(false);
                setStockError(null);
              }}
            />
            <div className="relative">
              <Input
                id="onboard-ticker"
                ref={tickerRef}
                value={ticker}
                onChange={(e) => {
                  setTicker(sanitizeTickerQuery(e.target.value));
                  setPickedTicker(null);
                  onListOpen(true);
                  setStockError(null);
                }}
                onFocus={() => {
                  if (ticker.trim()) onListOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && suggestions[0] && listOpen) {
                    e.preventDefault();
                    setTicker(tickerFieldText(suggestions[0]!.symbol));
                    setPickedTicker(suggestions[0]!.symbol);
                    onListOpen(false);
                  }
                }}
                placeholder="Apple, NVDA, or Bitcoin"
                autoComplete="off"
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
                          setPickedTicker(row.symbol);
                          onListOpen(false);
                        }}
                      >
                        <TickerSymbol
                          ticker={row.symbol}
                          showCurrency={listingCurrency(row.symbol) !== "USD"}
                        />
                        {row.name && (
                          <span className="truncate text-muted-foreground">
                            {row.name}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <FieldDescription>
              {holdingIsCoin
                ? "Which coin, and how many of it you hold."
                : "The ticker or the company name. A coin is fine too."}
            </FieldDescription>
          </Field>
          <div className="flex gap-6">
            <Field className="min-w-0 flex-1">
              <FieldLabel htmlFor="onboard-shares">
                {holdingIsCoin ? "How many coins" : "How many shares"}
              </FieldLabel>
              <Input
                id="onboard-shares"
                type="text"
                inputMode="decimal"
                value={shares}
                onChange={(e) => {
                  setShares(
                    e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "")
                  );
                  setStockError(null);
                }}
                onWheel={blockWheelChange}
                className="tabular-nums"
              />
            </Field>
            <Field className="min-w-0 flex-1">
              <FieldLabel htmlFor="onboard-buy">
                {holdingIsCoin ? "Paid for one coin" : "Paid for one share"}
                {buyCode !== "USD" ? ` (${buyCode})` : ""}
              </FieldLabel>
              <Input
                id="onboard-buy"
                type="text"
                inputMode="decimal"
                value={buyPrice}
                onChange={(e) => {
                  setBuyPrice(
                    e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "")
                  );
                  setStockError(null);
                }}
                onWheel={blockWheelChange}
                className="tabular-nums"
              />
            </Field>
          </div>
          {/* Same read-back as the Add holding modal. See
              `holding-cost-preview.ts` for why a label was not enough. */}
          {costPreview && (
            <p className="text-sm text-muted-foreground">
              <span className="font-mono tabular-nums text-foreground">
                {costPreview.shares} × {costPreview.each}
              </span>{" "}
              is{" "}
              <span className="font-mono tabular-nums text-foreground">
                {costPreview.total}
              </span>{" "}
              put into {holdingIsCoin ? "this coin" : "this company"}.
            </p>
          )}
          {stockError && (
            <p className="text-sm text-destructive">{stockError}</p>
          )}
          <Button
            type="submit"
            variant="outline"
            className="w-full"
            disabled={stockBusy}
          >
            {stockBusy ? "Saving …" : added.length ? "Add another" : "Add holding"}
          </Button>
        </form>
      )}

      {road === "paste" && (
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="onboard-paste">
              One company a line
            </FieldLabel>
            <textarea
              id="onboard-paste"
              value={paste}
              onChange={(e) => {
                setPaste(e.target.value);
                setPasteNote(null);
              }}
              rows={5}
              placeholder={"AAPL 12 168.40\nMSFT 6 305.20"}
              className="scroll-host w-full rounded-md border border-border bg-transparent p-3 font-mono text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
            <FieldDescription>
              The ticker, how many you hold, then what you paid for one.
            </FieldDescription>
          </Field>
          {pasteNote && (
            <p className="text-sm text-muted-foreground">{pasteNote}</p>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const parsed = parseHoldingsPaste(paste);
              if (parsed.rows.length === 0) {
                setPasteNote(
                  parsed.skipped[0]?.reason ??
                    "Each line needs to look like AAPL 12 168.40"
                );
                return;
              }
              setPasteNote(null);
              void importRows(parsed.rows, setPasteNote);
              setPaste("");
            }}
          >
            Save these
          </Button>
        </div>
      )}

      {road === "csv" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Most brokers can export one. It wants a ticker, a share count and
            what you paid, and it does not mind which order the columns are
            in or which separator your part of the world uses.
          </p>
          {csvNote && (
            <p className="text-sm text-muted-foreground">{csvNote}</p>
          )}
          <input
            ref={csvRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            tabIndex={-1}
            aria-hidden
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const parsed = parseHoldingsCsv(await file.text());
              if (parsed.rows.length === 0) {
                setCsvNote(
                  parsed.skipped[0]?.reason ??
                    "Nothing in that file looked like a holding."
                );
                return;
              }
              await importRows(parsed.rows, setCsvNote);
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => csvRef.current?.click()}
          >
            Choose a CSV
          </Button>
        </div>
      )}

      {road === "picture" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            A photo or a screenshot of your broker&apos;s holdings page, the
            one with share counts and what you paid. Margus reads it and
            fills the rows in for you.
          </p>
          {picture && (
            <p className="text-sm text-muted-foreground">
              Got <span className="text-foreground">{picture}</span>. Margus
              opens it the moment this walkthrough closes, and shows you what
              was read before anything is saved.
            </p>
          )}
          <input {...screenshotPickerInputProps(screenshot)} />
          <Button type="button" variant="outline" onClick={screenshot.open}>
            {picture ? "Choose a different picture" : "Choose a picture"}
          </Button>
        </div>
      )}

      {first && (
        <div
          className={cn(
            "card-sheen glass flex flex-col gap-1 rounded-lg p-4"
          )}
          aria-live="polite"
        >
          {firstQuote === null && (
            <p className="text-sm text-muted-foreground">
              Getting today&apos;s price for {cashtag(first.ticker)} …
            </p>
          )}
          {firstQuote === "none" && (
            <p className="text-sm text-muted-foreground">
              {cashtag(first.ticker)} is saved. There is no price for it this
              minute, so Home will put one beside it the next time the market
              prints.
            </p>
          )}
          {firstQuote !== null && firstQuote !== "none" && (
            <>
              <p className="text-sm font-medium text-foreground">
                {cashtag(first.ticker)} is {currency(firstQuote.price, 2)}{" "}
                right now, {signedPercent(firstQuote.changePercent, 1)} today.
              </p>
              <p className="text-sm text-muted-foreground">
                Your {first.shares}{" "}
                {isCoinSymbol(first.ticker) ? "of it" : "shares"} are worth{" "}
                {currency(first.shares * firstQuote.price, 0)}, which is{" "}
                {currency(
                  Math.abs(
                    first.shares * firstQuote.price -
                      first.shares * first.buyPrice
                  ),
                  0
                )}{" "}
                {first.shares * firstQuote.price >=
                first.shares * first.buyPrice
                  ? "more"
                  : "less"}{" "}
                than the {currency(first.shares * first.buyPrice, 0)} you put
                in. That is the whole app: your own money, said back to you.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
