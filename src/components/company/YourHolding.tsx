"use client";

import { Panel, PanelHeader, Score, Scoreboard } from "@/components/ui/Panel";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CONVICTION_THESIS_MAX_CHARS,
  type ConvictionEntry,
  type ConvictionLevel,
} from "@/lib/conviction";
import { NO_VALUE, cn, currency, percent } from "@/lib/format";
import type { CurrencyCode } from "@/lib/format-live-input";
import { shareCount } from "@/lib/share-count";
import { isCoinSymbol } from "@/lib/coins";
import { formatDateTime } from "@/lib/timezone";
import { Wallet } from "lucide-react";
import { useEffect, useState } from "react";

const CONVICTION_LABELS: Record<ConvictionLevel, string> = {
  1: "Weak, and I am watching whether the reason holds",
  2: "Below average, and this may be more than I want to own",
  3: "Neutral, holding it as it is",
  4: "Strong, and I still believe the reason",
  5: "Highest, and I am sure why I own it",
};

export type OwnedRow = {
  shares: number;
  buyPrice: number;
  portfolio: string;
};

/**
 * What this reader owns of the company they are reading about, and why.
 *
 * The room is written for somebody who does not own the company yet, and
 * for the reader who does it is also the one place the reason for owning
 * it is written down. Pulse reads that reason first, so it has to live
 * where a person goes to think about the company rather than behind a
 * panel of its own somewhere else.
 *
 * Nothing here is a second opinion about the price: the figures are the
 * reader's own arithmetic, shares and what they paid, and everything that
 * values the company is the rest of the page.
 */
export function YourHolding({
  ticker,
  rows,
  price,
  code,
  conviction,
  onConviction,
}: {
  ticker: string;
  rows: OwnedRow[];
  /** The live price where the room has one; without it there is no value. */
  price: number | null;
  code: CurrencyCode;
  conviction: ConvictionEntry | null;
  onConviction: (level: ConvictionLevel, thesis: string) => void;
}) {
  const [thesisDraft, setThesisDraft] = useState(conviction?.thesis ?? "");

  // Reset when the company changes, not on every remote save, or the box
  // fights the reader mid-sentence.
  useEffect(() => {
    setThesisDraft(conviction?.thesis ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ticker only
  }, [ticker]);

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

  // Nothing chosen is nothing chosen. Lighting cell 3 and printing
  // "Neutral, holding it as it is" puts an opinion in somebody's mouth on
  // every holding they have never answered for.
  const level = conviction?.level ?? null;

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

      <Field>
        <FieldLabel htmlFor="your-thesis">Why you own it</FieldLabel>
        <Textarea
          id="your-thesis"
          value={thesisDraft}
          rows={2}
          maxLength={CONVICTION_THESIS_MAX_CHARS}
          onChange={(e) => setThesisDraft(e.target.value)}
          onBlur={() => {
            // Only on a real change, so simply looking at the box does not
            // create an entry that then claims a stance nobody set.
            if (thesisDraft !== (conviction?.thesis ?? "")) {
              onConviction(level ?? 3, thesisDraft);
            }
          }}
          placeholder="Two sentences. What has to stay true for you to keep holding this?"
          className="min-h-16 leading-relaxed"
        />
        <FieldDescription>
          Pulse reads this first. Leave it blank and it still works from
          headlines and today&apos;s prices.
        </FieldDescription>
        {conviction?.stamps && conviction.stamps.length > 0 ? (
          <ul className="flex flex-col gap-1.5 border-t border-border pt-3">
            {conviction.stamps.slice(0, 3).map((s) => (
              <li key={s.at} className="text-sm text-muted-foreground">
                <span className="text-foreground">{s.verdict}</span>
                {" · "}
                {s.line}
                <span className="ml-1">
                  {formatDateTime(s.at, { day: "numeric", month: "short" })}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Field>

      <Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FieldLabel>How sure are you?</FieldLabel>
          <span className="text-sm font-medium text-muted-foreground">
            {level != null ? `${level} of 5` : "Not answered yet"}
          </span>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={level != null ? String(level) : ""}
          onValueChange={(v) => {
            if (!v) return;
            onConviction(Number(v) as ConvictionLevel, thesisDraft);
          }}
          className="w-full"
          aria-label="How sure are you"
        >
          {([1, 2, 3, 4, 5] as ConvictionLevel[]).map((n) => (
            <ToggleGroupItem
              key={n}
              value={String(n)}
              title={CONVICTION_LABELS[n]}
              className="h-10 flex-1"
            >
              {n}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldDescription>
          {level != null
            ? CONVICTION_LABELS[level]
            : "Tap a number when you have made up your mind. Nothing is chosen until you do."}
        </FieldDescription>
      </Field>
    </Panel>
  );
}
