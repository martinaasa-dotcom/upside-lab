"use client";

import { Button } from "@/components/ui/button";
import { HOUSEHOLD_COINS } from "@/lib/coins";

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
