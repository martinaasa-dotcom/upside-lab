"use client";

import { Card, MicroLabel, Panel, PanelHeader, Score, Scoreboard } from "@/components/ui/Panel";
import { Button } from "@/components/ui/button";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { WhyThis } from "@/components/ui/WhyThis";
import { cashtag, cn, currency, percent } from "@/lib/format";
import { positionFitProvenance } from "@/lib/provenance";
import {
  SHOCK_FALL,
  concentrationNote,
  fitPresets,
  positionFit,
  type FitHolding,
} from "@/lib/company/position-fit";
import type { CurrencyCode } from "@/lib/format-live-input";
import { Calculator } from "lucide-react";
import { useMemo, useState } from "react";

/**
 * What buying this would do to the portfolio you already have.
 *
 * This is the only place in the app that answers any part of "should I buy
 * this", and it answers only the part that is not an opinion. Nobody can
 * tell somebody whether a company is good. Anybody can tell them that
 * $2,000 of it would be a fifth of everything they own, that it would make
 * their biggest group of companies bigger still, and that a rough month
 * would cost them $500. Almost nowhere does, and it is the single most
 * useful thing a person deciding this can be told.
 *
 * Nothing is bought and nothing is written. The amount box is a way of
 * finding out what a decision would feel like before making it, which is
 * the cheapest research there is.
 */

export function PositionFitCard({
  ticker,
  holdings,
  cash,
  code,
  price,
  listingCode,
}: {
  ticker: string;
  holdings: FitHolding[];
  cash: number;
  /** The reader's own portfolio currency, never the listing's. */
  code: CurrencyCode;
  price: number | null;
  /** What the share itself is quoted in, for the share-count line only. */
  listingCode?: string;
}) {
  const portfolioValue = useMemo(
    () => holdings.reduce((sum, h) => sum + h.value, 0) + cash,
    [holdings, cash]
  );
  const presets = useMemo(() => fitPresets(portfolioValue), [portfolioValue]);
  const [amount, setAmount] = useState<number>(() => presets[1] ?? 1000);

  const fit = useMemo(
    () => positionFit({ ticker, amount, holdings, cash }),
    [ticker, amount, holdings, cash]
  );

  if (!fit) return null;

  const tag = cashtag(ticker);
  /*
    Two decimal places on a share count is false precision on anything but
    a handful of shares, and the sentence is about picturing the size.
  */
  const rawShares = price && price > 0 ? amount / price : null;
  const shares =
    rawShares === null
      ? null
      : rawShares >= 10
        ? Math.round(rawShares)
        : Math.round(rawShares * 100) / 100;
  const note = concentrationNote(fit);
  const sectorMoved =
    fit.sector && fit.sectorBefore !== null && fit.sectorAfter !== null;

  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            How it would sit in your portfolio
            <WhyThis
              provenance={positionFitProvenance({
                ticker,
                amount: currency(amount, 0, code),
              })}
            />
          </span>
        }
        subtitle="Nobody can tell you whether this company is a good one. This is the part that is not an opinion: what the numbers become if you put money in. Nothing is bought."
        icon={<Calculator className="h-4 w-4" />}
      />

      <div className="flex flex-col gap-3">
        <MicroLabel>If you put in</MicroLabel>
        <div className="flex flex-wrap items-center gap-2">
          <FormattedNumberInput
            kind="money"
            value={amount}
            currency={code}
            onChange={setAmount}
            className="w-40"
            id="position-fit-amount"
          />
          {presets.map((p) => (
            <Button
              key={p}
              type="button"
              variant={p === amount ? "default" : "outline"}
              size="sm"
              onClick={() => setAmount(p)}
            >
              {currency(p, 0, code)}
            </Button>
          ))}
        </div>
        {shares !== null && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            At today&apos;s price that is about {shares} shares of {tag}
            {listingCode && listingCode !== code
              ? `, whose price is quoted in ${listingCode} rather than ${code}, so the share count is a rough one`
              : ""}
            .
          </p>
        )}
      </div>

      <Scoreboard cols={2} mobileCols={1}>
        <Score
          label={`${tag} would be`}
          value={percent(fit.weight, 1)}
          sub={
            fit.weightBefore !== null
              ? `of everything you own, up from ${percent(fit.weightBefore, 1)} today. It would be your ${ordinal(fit.rank)} biggest holding of ${fit.holdingCount}.`
              : `of everything you own, and it would arrive as your ${ordinal(fit.rank)} biggest holding of ${fit.holdingCount}.`
          }
        />
        <Score
          label={`If it fell ${percent(SHOCK_FALL, 0)}`}
          value={`-${currency(fit.shockDollar, 0, code)}`}
          valueClassName="text-loss"
          sub={`That is ${percent(fit.shockOfPortfolio, 1)} of your whole portfolio, assuming everything else stood still. A quarter off one company in a year is ordinary, not a disaster scenario.`}
        />
        {sectorMoved ? (
          /*
            The label is generic and the group's own name goes in the
            sentence. This app's sector names are plain phrases rather than
            nouns ("Makes computer chips"), so pasting one in front of
            "would be" produced "Makes computer chips would be", which is
            not a sentence anybody wrote.
          */
          <Score
            label="Companies like it would be"
            value={percent(fit.sectorAfter ?? 0, 0)}
            sub={`of your stocks, up from ${percent(fit.sectorBefore ?? 0, 0)}. That counts every company you own in the same group as this one, ${lowerFirst(fit.sector ?? "")}, and a group tends to have its good and bad years together.`}
          />
        ) : (
          <Score
            label="Your biggest three"
            value={percent(fit.topThreeAfter, 0)}
            sub={`of your stocks, against ${percent(fit.topThreeBefore, 0)} today. The lower this is, the less any single company decides how your year goes.`}
          />
        )}
        <Score
          label="Your portfolio would be"
          value={currency(fit.portfolioAfter, 0, code)}
          sub={`up from ${currency(fit.portfolioBefore, 0, code)}, treating the amount above as new money going in rather than a sale of something else.`}
        />
      </Scoreboard>

      {note && (
        <Card tone="default" className={cn("flex flex-col gap-2")}>
          <p className="text-sm leading-relaxed text-warning">{note}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            That is an observation about size, not a reason to do or not do
            anything. Plenty of people hold one company at that weight on
            purpose, and they know they are doing it.
          </p>
        </Card>
      )}
    </Panel>
  );
}

/** "Makes computer chips" reads as part of a sentence once it is lowered. */
function lowerFirst(text: string): string {
  const t = text.trim();
  if (!t) return t;
  return t.charAt(0).toLowerCase() + t.slice(1);
}

function ordinal(n: number): string {
  const rules = new Intl.PluralRules("en-US", { type: "ordinal" });
  const suffix = { one: "st", two: "nd", few: "rd", other: "th" }[
    rules.select(n) as "one" | "two" | "few" | "other"
  ];
  return `${n}${suffix ?? "th"}`;
}
