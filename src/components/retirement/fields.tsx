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
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

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

/**
 * What a finished count field commits on blur: digits only, clamped to
 * `[min, max]`, empty text falling back to `min`. Pulled out of the
 * component so the clamp — the exact thing that went wrong before — is a
 * plain function a test can call without a DOM.
 */
export function clampCountDraft(raw: string, min: number, max: number): number {
  const digits = raw.replace(/[^\d]/g, "");
  const n = digits ? Number(digits) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

/**
 * `type="number"` LOOKS RIGHT AND CANNOT BE SELECTED.
 *
 * The spec's selection API only applies to `text`, `search`, `url`, `tel`
 * and `password` — a `number` input is not on that list, so `.select()`
 * on one is a defined no-op with no error and no visible effect. This
 * field used to be `type="number"` with a `.select()` on focus that
 * therefore never selected anything: clicking in still left the reader
 * having to delete the old age or year by hand, which is the exact
 * complaint this component exists to answer. It is `text` with
 * `inputMode="numeric"` now, the same pairing `CoveredCallPanel` and
 * `StartingCashField` already use elsewhere in this app for the same
 * reason.
 *
 * THE OLD CLAMP FOUGHT EVERY KEYSTROKE, WHICH SELECT-ALL MAKES FATAL.
 * Clamping to `[min, max]` on every change meant typing a fresh value
 * over a selection could not work whenever an intermediate digit fell
 * outside that range: replacing "16" with "45" by typing "4" then "5"
 * committed "4" clamped up to the 16 minimum after the first keystroke,
 * so the second keystroke appended to "16" instead of "4" and the field
 * settled on the wrong number. A draft is kept while focused and the
 * bound is only enforced on blur, which is what every other field on
 * this page already does with its own `MAX_SAFE_MONEY` / percent ceiling.
 */
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
  const inputRef = useRef<HTMLInputElement>(null);
  const focused = useRef(false);
  const [draft, setDraft] = useState(() =>
    Number.isFinite(value) ? String(value) : ""
  );

  useEffect(() => {
    if (!focused.current) setDraft(Number.isFinite(value) ? String(value) : "");
  }, [value]);

  return (
    <Field label={label} note={note} htmlFor={id}>
      <div className="flex min-w-0 items-center gap-2">
        <Input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          value={draft}
          onWheel={blockWheelChange}
          onFocus={() => {
            focused.current = true;
            const node = inputRef.current;
            if (node) requestAnimationFrame(() => node.select());
          }}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, "");
            setDraft(digits);
            /*
              Live and unclamped, like every money and percent field on
              this page: a reader typing "45" over a 16-minimum age must
              be free to pass through "4" without it snapping back to 16
              before the "5" ever arrives. The bound is real, it is just
              enforced once the number is finished rather than mid-digit.
            */
            if (digits) {
              const n = Number(digits);
              if (Number.isFinite(n)) onChange(n);
            }
          }}
          onBlur={() => {
            focused.current = false;
            const clamped = clampCountDraft(draft, min, max);
            onChange(clamped);
            setDraft(String(clamped));
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
  ariaLabel,
}: {
  label: ReactNode;
  note?: ReactNode;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  format: (n: number) => string;
  /** Needed when `label` is not a plain string. See the note below. */
  ariaLabel?: string;
}) {
  /*
    A slider has no `<label for>` to attach to, so the visible heading
    above it is decoration as far as a screen reader is concerned and the
    control announces itself as an unnamed slider. The label here is a
    fragment carrying the reading as well as the name, so it cannot be
    used as the accessible name directly.
  */
  const name = ariaLabel ?? (typeof label === "string" ? label : undefined);
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
        aria-label={name}
        aria-valuetext={format(value)}
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
