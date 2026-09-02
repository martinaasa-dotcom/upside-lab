"use client";

import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { Button } from "@/components/ui/button";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { TickerSymbol } from "@/components/TickerSymbol";
import { listingCurrenciesAreMixed } from "@/lib/listing-currency";
import { X } from "lucide-react";

export type CostBasisRow = {
  ticker: string;
  shares: number;
  /** Suggested mark-derived USD cost */
  suggestedBuy: number;
  buyPrice: number;
};

type Props = {
  open: boolean;
  rows: CostBasisRow[];
  onChangeRow: (ticker: string, buyPrice: number) => void;
  onClose: () => void;
  onApply: () => void;
};

/** Post-import pass so mark-as-cost imports can be corrected. */
export function CostBasisModal({
  open,
  rows,
  onChangeRow,
  onClose,
  onApply,
}: Props) {
  if (!open) return null;

  const mixedListings = listingCurrenciesAreMixed(
    rows.map((row) => ({ ticker: row.ticker }))
  );

  return (
    <ViewportOverlay
      className="z-[85] flex items-center justify-center p-4"
      onClose={onClose}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-xl bg-popover ring-1 ring-foreground/20">
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              What you paid
            </h3>
            <p className="text-sm text-muted-foreground">
              The import used today&apos;s prices as what you paid. Type your
              real average buy price in dollars, then apply, so the gain and
              loss numbers are right.
            </p>
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
        <div className="scroll-host min-h-0 flex-1 gap-2 overflow-y-auto px-6 py-6">
          {rows.map((r) => (
            <label
              key={r.ticker}
              className="grid grid-cols-[1fr_7rem] items-center gap-2 text-sm text-muted-foreground"
            >
              <span>
                <span className="inline-flex font-semibold text-foreground">
                  <TickerSymbol
                    ticker={r.ticker}
                    showCurrency={mixedListings}
                  />
                </span>
                {/*
                  * "mark" is on the banned list in AGENTS.md, and "sh" is an
                  * abbreviation nobody outside a trading desk expands on
                  * sight. Both sat on the one dialog every importing person
                  * meets. The heading above already says the import used
                  * today's prices, so the row only has to name the number.
                  */}
                <span className="ml-2 text-muted-foreground">
                  {r.shares.toLocaleString("en-US")} shares · today $
                  {r.suggestedBuy.toFixed(2)}
                </span>
              </span>
              <FormattedNumberInput
                kind="money"
                currency="USD"
                digits={2}
                value={r.buyPrice}
                onChange={(n) => onChangeRow(r.ticker, n)}
                className="w-[6.5rem]"
              />
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Skip
          </Button>
          <Button type="button" onClick={onApply}>
            Use these prices
          </Button>
        </div>
      </div>
    </ViewportOverlay>
  );
}
