"use client";

import {
  downloadHoldingsCsvTemplate,
  parseHoldingsCsv,
  parseHoldingsPaste,
  type CsvHoldingRow,
  type CsvSkippedRow,
} from "@/lib/csv-import";
import { htmlCell, htmlCellTicker, htmlTable } from "@/components/FluidTable";
import { TickerSymbol } from "@/components/TickerSymbol";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { cn, currency } from "@/lib/format";
import {
  listingAmountToUsd,
  listingCurrenciesAreMixed,
  listingCurrency,
  listingPriceDigits,
  usdPerMapFromFx,
} from "@/lib/listing-currency";
import { AlertTriangle, Download, FileUp, X } from "lucide-react";
import { useRef, useState } from "react";

async function nativeCsvBuysToUsd(
  rows: CsvHoldingRow[]
): Promise<{ rows: CsvHoldingRow[] } | { error: string }> {
  const foreign = rows.filter((r) => listingCurrency(r.ticker) !== "USD");
  if (foreign.length === 0) return { rows };
  try {
    const tickers = [...new Set(foreign.map((r) => r.ticker))].join(",");
    const fxRes = await fetch(`/api/quotes?tickers=${encodeURIComponent(tickers)}`, {
      cache: "no-store",
    });
    if (!fxRes.ok) {
      return { error: "Couldn't convert those buy prices. Try again in a second." };
    }
    const fxJson = (await fxRes.json()) as {
      fx?: {
        eurUsd?: number | null;
        gbpUsd?: number | null;
        usdPer?: Record<string, number | null | undefined>;
      };
    };
    const rates = usdPerMapFromFx(fxJson.fx);
    const next: CsvHoldingRow[] = [];
    for (const row of rows) {
      const code = listingCurrency(row.ticker);
      if (code === "USD") {
        next.push(row);
        continue;
      }
      if (!(rates[code] > 0)) {
        return { error: "Couldn't convert those buy prices. Try again in a second." };
      }
      next.push({ ...row, buyPrice: listingAmountToUsd(row.buyPrice, code, rates) });
    }
    return { rows: next };
  } catch {
    return { error: "Couldn't convert those buy prices. Try again in a second." };
  }
}

type Props = {
  open: boolean;
  portfolioName: string;
  onClose: () => void;
  onImport: (input: {
    rows: CsvHoldingRow[];
    cash: number | null;
    replace: boolean;
  }) => void;
  /** Hide the Call % column/copy for viewers with no options experience. */
  hideCallPct?: boolean;
};

export function CsvImportModal({
  open,
  portfolioName,
  onClose,
  onImport,
  hideCallPct = false,
}: Props) {
  const [rows, setRows] = useState<CsvHoldingRow[]>([]);
  const [cash, setCash] = useState<number | null>(null);
  const [skipped, setSkipped] = useState<CsvSkippedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [replace, setReplace] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function reset() {
    setRows([]);
    setCash(null);
    setSkipped([]);
    setFileName(null);
    setError(null);
    setPaste("");
  }

  function handleFile(file: File) {
    setError(null);
    file
      .text()
      .then((text) => {
        const parsed = parseHoldingsCsv(text);
        if (parsed.rows.length === 0 && parsed.cash == null) {
          setError(
            parsed.skipped[0]?.reason ??
              "No valid holdings found. Check the column headers match Ticker, Shares, Buy Price."
          );
          setRows([]);
          setCash(null);
          setSkipped(parsed.skipped);
          return;
        }
        setRows(parsed.rows);
        setCash(parsed.cash);
        setSkipped(parsed.skipped);
        setFileName(file.name);
      })
      .catch(() => setError("Couldn't read that file. Is it a .csv?"));
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function confirm() {
    if (busy) return;
    if (rows.length === 0 && cash == null) return;
    setBusy(true);
    setError(null);
    try {
      const converted = await nativeCsvBuysToUsd(rows);
      if ("error" in converted) {
        setError(converted.error);
        return;
      }
      onImport({ rows: converted.rows, cash, replace });
      reset();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const mixedListings = listingCurrenciesAreMixed(
    rows.map((r) => ({ ticker: r.ticker }))
  );
  const tickerTd = mixedListings ? htmlCellTicker : htmlCell;

  return (
    <ViewportOverlay
      className="z-[70] flex items-center justify-center p-4"
      onClose={handleClose}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        aria-label="Close"
        onClick={handleClose}
      />
      <div className="relative z-10 flex max-h-[min(100%,640px)] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-popover ring-1 ring-foreground/20">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <FileUp className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-foreground">
              Import CSV - {portfolioName}
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleClose}
            aria-label="Close"
            className="touch-target sm:size-7"
          >
            <X />
          </Button>
        </div>

        <div className="scroll-host min-h-0 flex-1 gap-4 overflow-y-auto px-6 py-6">
          <p className="text-sm text-muted-foreground">
            Replace this portfolio, or paste lines like{" "}
            <span className="text-foreground">NBIS 500 85.10</span>. CSV columns:
            Ticker, Shares, Buy Price. Buy price is in that listing&apos;s own money.
          </p>

          <Textarea
            aria-label="Paste holdings, one per line"
            value={paste}
            onChange={(e) => {
              setPaste(e.target.value);
              setError(null);
              const parsed = parseHoldingsPaste(e.target.value);
              if (parsed.rows.length > 0 || parsed.cash != null) {
                setRows(parsed.rows);
                setCash(parsed.cash);
                setSkipped(parsed.skipped);
                setFileName(null);
              }
            }}
            rows={4}
            placeholder={"NBIS 500 85.10\nCRWV 1100 64.45"}
            className="min-h-24 font-mono"
          />

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp data-icon="inline-start" />
              Choose CSV file
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => downloadHoldingsCsvTemplate()}
            >
              <Download data-icon="inline-start" />
              Download template
            </Button>
            {fileName && (
              <span className="text-sm text-muted-foreground">{fileName}</span>
            )}
          </div>

          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-sm text-loss">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          {rows.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Preview - {rows.length} holding{rows.length === 1 ? "" : "s"}</span>
                {cash != null && (
                  <span className="text-muted-foreground">
                    Cash ${cash.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </span>
                )}
              </div>
              {/* overflow-x too: an imported file can carry long tickers and
                  wide numbers, and on a phone the preview needs to scroll
                  sideways instead of pushing the modal past the viewport. */}
              <div className="max-h-48 overflow-x-auto overflow-y-auto card-sheen glass-well rounded-lg">
                <table className={htmlTable}>
                  <thead className="glass-well sticky top-0 text-sm text-muted-foreground">
                    <tr>
                      <th className={cn(tickerTd, "py-1.5 font-medium")}>Ticker</th>
                      <th className={cn(htmlCell, "py-1.5 font-medium")}>Shares</th>
                      <th className={cn(htmlCell, "py-1.5 font-medium")}>Buy price</th>
                      {!hideCallPct && (
                        <th className={cn(htmlCell, "py-1.5 font-medium")}>Call %</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.ticker} className="border-t border-border">
                        <td className={cn(tickerTd, "py-1.5 font-medium text-foreground")}>
                          <TickerSymbol
                            ticker={r.ticker}
                            showCurrency={mixedListings}
                          />
                        </td>
                        <td className={cn(htmlCell, "py-1.5 tabular-nums text-muted-foreground")}>
                          {r.shares}
                        </td>
                        <td className={cn(htmlCell, "py-1.5 tabular-nums text-muted-foreground")}>
                          {currency(
                            r.buyPrice,
                            listingPriceDigits(listingCurrency(r.ticker)),
                            listingCurrency(r.ticker)
                          )}
                        </td>
                        {!hideCallPct && (
                          <td className={cn(htmlCell, "py-1.5 tabular-nums text-muted-foreground")}>
                            {r.callPct != null
                              ? `${Math.round(r.callPct * 100)}%`
                              : "default"}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {skipped.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-caution">
                Skipped {skipped.length} row{skipped.length === 1 ? "" : "s"}
              </p>
              <ul className="flex flex-col max-h-24 gap-1 overflow-y-auto text-sm text-muted-foreground">
                {skipped.slice(0, 10).map((s) => (
                  <li key={`${s.line}-${s.raw}`}>
                    Line {s.line}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rows.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                id="csv-replace"
                checked={replace}
                onCheckedChange={(v) => setReplace(v === true)}
              />
              <label htmlFor="csv-replace">
                Replace this portfolio&apos;s holdings (uncheck to only add/update
                the tickers above, keeping everything else)
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || (rows.length === 0 && cash == null)}
            onClick={() => void confirm()}
          >
            Import{rows.length > 0 ? ` ${rows.length} holding${rows.length === 1 ? "" : "s"}` : ""}
          </Button>
        </div>
      </div>
    </ViewportOverlay>
  );
}
