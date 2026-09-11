"use client";

/**
 * The controls the retirement plan is typed into.
 *
 * Every one of them carries a `note`, and that is the module's rule rather
 * than a nicety. A retirement calculator is a page of numbers a person has
 * never been asked for before, and the difference between a good plan and a
 * useless one is almost always that somebody guessed at an input without
 * knowing what it meant. So each field says what it is for, where its
 * default came from, and what would make a reader want to change it, in
 * one line, beside the box.
 */

import { cn } from "@/lib/format";
import type { CurrencyCode } from "@/lib/format-live-input";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/Panel";
import { Slider } from "@/components/ui/slider";
import { blockWheelChange } from "@/lib/number-input";
import { useId, type ReactNode } from "react";

/** Money the plan is in, from the region. Falls back rather than throwing. */
export function currencyCodeFor(iso: string): CurrencyCode {
  const known: CurrencyCode[] = [
    "USD",
    "EUR",
    "GBP",
    "CHF",
    "SEK",
    "NOK",
    "DKK",
    "PLN",
    "CZK",
    "CAD",
    "AUD",
  ];
  return known.includes(iso as CurrencyCode) ? (iso as CurrencyCode) : "USD";
}

/*
  The label tier, spelled out rather than borrowed from `MicroLabel`.

  `MicroLabel` renders a paragraph, and every control on this page needs a
  real `<label for>` so that tapping the words focuses the box, which on a
  phone is most of the target area a field has. Same voice, same tier, one
  different element.
*/
const LABEL_CLASS =
  "min-w-0 font-mono text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground";

export function Field({
  label,
  note,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  note?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className={LABEL_CLASS}>
        {label}
      </label>
      {children}
      {note ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>
      ) : null}
    </div>
  );
}

export function MoneyField({
  label,
  note,
  value,
  currency,
  onChange,
}: {
  label: ReactNode;
  note?: ReactNode;
  value: number;
  currency: CurrencyCode;
  onChange: (n: number) => void;
}) {
  const id = useId();
  return (
    <Field label={label} note={note} htmlFor={id}>
      <FormattedNumberInput
        id={id}
        kind="money"
        value={value}
        currency={currency}
        onChange={onChange}
        className="font-mono tabular-nums"
      />
    </Field>
  );
}

export function PercentField({
  label,
  note,
  value,
  onChange,
  digits = 2,
}: {
  label: ReactNode;
  note?: ReactNode;
  value: number;
  onChange: (n: number) => void;
  digits?: number;
}) {
  const id = useId();
  return (
    <Field label={label} note={note} htmlFor={id}>
      <FormattedNumberInput
        id={id}
        kind="percent"
        value={value}
        digits={digits}
        onChange={onChange}
        className="font-mono tabular-nums"
      />
    </Field>
  );
}

export function CountField({
  label,
  note,
  value,
  onChange,
  min = 0,
  max = 120,
  suffix,
}: {
  label: ReactNode;
  note?: ReactNode;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  const id = useId();
  return (
    <Field label={label} note={note} htmlFor={id}>
      <div className="flex min-w-0 items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          value={Number.isFinite(value) ? value : ""}
          min={min}
          max={max}
          onWheel={blockWheelChange}
          onChange={(e) => {
            const next = Number(e.target.value);
            onChange(Number.isFinite(next) ? Math.min(max, Math.max(min, next)) : min);
          }}
          className="min-w-0 font-mono tabular-nums"
        />
        {suffix ? (
          <span className="shrink-0 text-sm text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
    </Field>
  );
}

/**
 * A slider with its own reading printed above it.
 *
 * The reading goes above rather than at the end of the track, which is the
 * lesson the valuation panel already records: a figure at the far end of a
 * row has to be paired with the thing it names by eye, across the whole
 * width of the card, and on a phone that is most of the screen.
 */
export function SliderField({
  label,
  note,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
}: {
  label: ReactNode;
  note?: ReactNode;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  format: (n: number) => string;
}) {
  return (
    <Field
      label={
        <span className="flex w-full items-baseline justify-between gap-2">
          <span className="min-w-0">{label}</span>
          <span className="shrink-0 font-mono tabular-nums text-foreground">
            {format(value)}
          </span>
        </span>
      }
      note={note}
    >
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => {
          const n = next[0];
          if (Number.isFinite(n)) onChange(n);
        }}
        className="py-2"
      />
    </Field>
  );
}

export function ChoiceField<T extends string>({
  label,
  note,
  value,
  options,
  onChange,
  columns,
}: {
  label: ReactNode;
  note?: ReactNode;
  value: T;
  options: readonly { id: T; label: string; title?: string }[];
  onChange: (id: T) => void;
  columns?: number;
}) {
  return (
    <Field label={label} note={note}>
      <Segmented
        options={options}
        value={value}
        onChange={onChange}
        columns={columns ?? options.length}
        ariaLabel={typeof label === "string" ? label : undefined}
      />
    </Field>
  );
}

/** The grid every block of fields sits in. One column on a phone. */
export const FIELD_GRID = "grid gap-4 sm:grid-cols-2";
