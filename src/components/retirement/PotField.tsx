"use client";

/**
 * THE ONE CONTROL THAT SETS THE PLAN'S STARTING POT, drawn wherever the
 * plan asks for it.
 *
 * `QuickStart`'s essentials card and `PlanInputs`'s deeper "What you have"
 * panel both show this figure, because the essentials always carry it and
 * the deeper levels show every input in one flow. Two hand-rolled copies
 * of the same field is exactly the shape that stops agreeing: one used to
 * offer a picker and the other only a stale "press to use" note pointing
 * at the reader's combined total, with no way to name one portfolio out of
 * several and no way to notice a selection made on the other copy. One
 * component now, so a change to how the pot is chosen cannot land on only
 * one of the two places it is shown.
 *
 * WHICH REAL PORTFOLIO IT TRACKS IS `potSource` (`pot-source.ts`), owned by
 * `RetirementSheet` and threaded down here rather than kept locally, so a
 * selection made from either copy of the field, or by pressing a
 * different template, is the same selection everywhere the plan reads it.
 */

import { useId, type ReactNode } from "react";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Field } from "@/components/retirement/fields";
import { currency as formatCurrency } from "@/lib/format";
import type { CurrencyCode } from "@/lib/format-live-input";
import {
  POT_SOURCE_BOOK,
  POT_SOURCE_CUSTOM,
  type PortfolioPotOption,
} from "@/lib/retirement/pot-source";

const EMPTY_SHEETS: PortfolioPotOption[] = [];

export function PotField({
  label = "Invested for this now",
  note = "A house you live in is not part of it.",
  value,
  currency,
  onChange,
  portfolioValue,
  sheets = EMPTY_SHEETS,
  potSource = POT_SOURCE_BOOK,
  onPotSourceChange = () => {},
}: {
  label?: ReactNode;
  note?: ReactNode;
  value: number;
  currency: CurrencyCode;
  onChange: (n: number) => void;
  /** What the reader's portfolios are worth, combined. */
  portfolioValue: number | null;
  /** One portfolio each, for a reader who wants to pick rather than combine. */
  sheets?: PortfolioPotOption[];
  /** Which real portfolio, or `custom`, this figure currently tracks. */
  potSource?: string;
  onPotSourceChange?: (source: string) => void;
}) {
  const id = useId();
  const hasPortfolioValue = portfolioValue != null && portfolioValue > 0;
  /*
    The picker only earns its place when there is something real to pick
    between. An account with no holdings gets the field and nothing else.
  */
  const hasPotOptions = hasPortfolioValue || sheets.length > 0;

  return (
    <Field label={label} htmlFor={id} note={note}>
      <FormattedNumberInput
        id={id}
        kind="money"
        currency={currency}
        value={value}
        onChange={(n) => {
          /*
            Typing over the figure is the reader stating their own number,
            so the source stops naming a portfolio, exactly as picking
            "Type your own figure" below does.
          */
          onPotSourceChange(POT_SOURCE_CUSTOM);
          onChange(n);
        }}
        className="font-mono tabular-nums"
      />
      {hasPotOptions ? (
        <NativeSelect
          value={potSource}
          onChange={(e) => onPotSourceChange(e.target.value)}
          aria-label="Which portfolio this figure comes from"
          className="w-full min-w-0 max-w-full"
        >
          {hasPortfolioValue ? (
            <NativeSelectOption value={POT_SOURCE_BOOK}>
              All your portfolios ({formatCurrency(portfolioValue as number, 0, "USD")})
            </NativeSelectOption>
          ) : null}
          {sheets.map((s) => (
            <NativeSelectOption key={s.id} value={s.id}>
              {s.name} ({formatCurrency(s.value, 0, "USD")})
            </NativeSelectOption>
          ))}
          <NativeSelectOption value={POT_SOURCE_CUSTOM}>
            Type your own figure
          </NativeSelectOption>
        </NativeSelect>
      ) : null}
    </Field>
  );
}
