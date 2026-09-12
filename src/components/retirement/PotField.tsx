"use client";

/**
 * THE ONE CONTROL THAT SETS THE PLAN'S STARTING POT.
 *
 * `QuickStart`'s essentials card is the only place this is asked: it is
 * one of the figures the first card always carries, and `PlanInputs`'s
 * deeper panels deliberately do not repeat anything the essentials already
 * asked (see that file's own note). A picker over a plain money field
 * earns its own component because it is more than a `MoneyField` — a
 * reader with more than one portfolio can name one rather than always
 * being handed the combined total, and a template press has to be able to
 * write into the same figure without duplicating that logic.
 *
 * WHICH REAL PORTFOLIO IT TRACKS IS `potSource` (`pot-source.ts`), owned by
 * `RetirementSheet` and threaded down here rather than kept locally, so a
 * selection made from the field, or by pressing a different template, is
 * the same selection everywhere the plan reads it.
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
