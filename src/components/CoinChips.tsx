"use client";

import { Button } from "@/components/ui/button";
import { HOUSEHOLD_COINS } from "@/lib/coins";
import { cashtag } from "@/lib/format";

/**
 * Companies worth a look, for somebody with nothing on their list.
 *
 * The only suggestions Home ever offered were Bitcoin, Ethereum and
 * Solana, so a beginner holding Apple and an index fund was shown three
 * cryptocurrencies and nothing else, on the one panel that invites them to
 * explore. The list comes from the month's popular tickers, which already
 * seed the seven everybody can name, minus whatever they hold or watch.
 */
export function WatchSuggestionChips({
  tickers,
  onPick,
  disabled,
}: {
  tickers: readonly string[];
  onPick: (symbol: string) => void;
  disabled?: boolean;
}) {
  if (tickers.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {tickers.map((symbol) => (
        <Button
          key={symbol}
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onPick(symbol)}
        >
          {cashtag(symbol)}
        </Button>
      ))}
    </div>
  );
}

function asUpperSet(
  active?: ReadonlySet<string> | readonly string[]
): Set<string> {
  if (!active) return new Set();
  const values = active instanceof Set ? [...active] : [...active];
  return new Set(values.map((s) => s.toUpperCase()));
}

/** Bitcoin, Ethereum, Solana. Names, not Yahoo pairs. */
export function HouseholdCoinChips({
  active,
  hidden,
  onPick,
  disabled,
}: {
  /** Stored symbols currently selected (BTC-USD). */
  active?: ReadonlySet<string> | readonly string[];
  /** Hide a chip once it is already on the list. */
  hidden?: ReadonlySet<string>;
  onPick: (symbol: string) => void;
  disabled?: boolean;
}) {
  const on = asUpperSet(active);
  const skip = hidden ?? new Set<string>();
  const coins = HOUSEHOLD_COINS.filter((c) => !skip.has(c.symbol));
  if (coins.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {coins.map((c) => (
        <Button
          key={c.symbol}
          type="button"
          size="sm"
          variant={on.has(c.symbol) ? "default" : "outline"}
          disabled={disabled}
          onClick={() => onPick(c.symbol)}
        >
          {c.name}
        </Button>
      ))}
    </div>
  );
}
