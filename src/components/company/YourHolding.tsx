"use client";

import { Panel, PanelHeader, Score, Scoreboard } from "@/components/ui/Panel";
import { NO_VALUE, cn, currency, percent } from "@/lib/format";
import type { CurrencyCode } from "@/lib/format-live-input";
import { shareCount } from "@/lib/share-count";
import { isCoinSymbol } from "@/lib/coins";
import { Wallet } from "lucide-react";

export type OwnedRow = {
  shares: number;
  buyPrice: number;
  portfolio: string;
};

/**
 * What this reader owns of the company they are reading about.
 *
 * The room is written for somebody who does not own the company yet, and
 * for the reader who does, the first thing they came to see is their own
 * position rather than the argument about the company. So it sits above
 * the price plan, and everything on it is arithmetic on figures the
 * reader typed themselves: shares, what they paid, what that is worth
 * now. Nothing here is a second opinion about the price; everything that
 * values the company is the rest of the page.
 *
 * It asks nothing. There is deliberately no box for a written reason and
 * no score for how sure they are: the app does not ask a reader to grade
 * their own conviction, and a panel that did would be the one place left
 * doing it.
 */
export function YourHolding({
  ticker,
  rows,
  price,
  code,
}: {
  ticker: string;
  rows: OwnedRow[];
  /** The live price where the room has one; without it there is no value. */
  price: number | null;
  code: CurrencyCode;
}) {
  const shares = rows.reduce((s, r) => s + r.shares, 0);
  const cost = rows.reduce((s, r) => s + r.shares * r.buyPrice, 0);
  const paid = shares > 0 ? cost / shares : null;
  const value = price != null && price > 0 ? shares * price : null;
  const gain =
    paid != null && paid > 0 && price != null && price > 0
      ? (price - paid) / paid
      : null;
  const portfolios = Array.from(new Set(rows.map((r) => r.portfolio))).filter(
    Boolean
  );

  return (
    <Panel>
      <PanelHeader
        title="What you own"
        subtitle={
          portfolios.length > 1
            ? `Across ${portfolios.length} portfolios: ${portfolios.join(", ")}.`
            : portfolios[0]
              ? `In ${portfolios[0]}.`
              : undefined
        }
        icon={<Wallet className="h-4 w-4" />}
      />

      <Scoreboard cols={4} mobileCols={2}>
        <Score
          label={isCoinSymbol(ticker) ? "Units" : "Shares"}
          value={shareCount(shares)}
        />
        <Score
          label="Paid each"
          value={paid != null ? currency(paid, 2, code) : NO_VALUE}
        />
        <Score
          label="Worth today"
          value={value != null ? currency(value, 0, code) : NO_VALUE}
        />
        <Score
          label="Against what you paid"
          value={gain != null ? percent(gain) : NO_VALUE}
          valueClassName={
            gain == null
              ? undefined
              : cn(gain >= 0 ? "text-gain" : "text-loss")
          }
        />
      </Scoreboard>
    </Panel>
  );
}
