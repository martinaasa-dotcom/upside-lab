import { cn } from "@/lib/format";
import { Input } from "@/components/ui/input";
import type { CurrencyCode } from "@/lib/format-live-input";
import {
  caretIndexPreferDot,
  digitCountBefore,
  formatLiveMoney,
  formatLivePercent,
  formatMoneyFromRaw,
  formatPercentFromRaw,
} from "@/lib/format-live-input";
import { blockWheelChange } from "@/lib/number-input";
import { useEffect, useRef, useState, type ChangeEvent, type FocusEvent } from "react";

type MoneyProps = {
  kind: "money";
  value: number;
  currency: CurrencyCode;
  /** Fraction digits (default 0). */
  digits?: number;
  onChange: (n: number) => void;
  className?: string;
  id?: string;
};

type PercentProps = {
  kind: "percent";
  value: number;
  /** Max fraction digits (default 2). */
  digits?: number;
  onChange: (n: number) => void;
  className?: string;
  id?: string;
};

export type FormattedNumberInputProps = MoneyProps | PercentProps;

function blurFormat(props: FormattedNumberInputProps, n: number): string {
  if (props.kind === "money") {
    return formatLiveMoney(n, props.currency, props.digits ?? 0);
  }
  return formatLivePercent(n, props.digits ?? 2);
}

/**
 * Money / percent input that keeps real formatting ($1,000 / 7.5%) while typing.
 */
export function FormattedNumberInput(props: FormattedNumberInputProps) {
  const { value, onChange, className, id } = props;
  const digits = props.digits ?? (props.kind === "money" ? 0 : 2);
  const focused = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => blurFormat(props, value));

  const currencyKey = props.kind === "money" ? props.currency : "pct";
  useEffect(() => {
    if (!focused.current) setText(blurFormat(props, value));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- format from props.kind/currency/digits
  }, [value, props.kind, currencyKey, digits]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const raw = el.value;
    const caret = el.selectionStart ?? raw.length;
    const digitsBefore = digitCountBefore(raw, caret);
    const stripped = raw.replace(/[^\d.]/g, "");
    const preferDot = /\.$/.test(stripped);

    if (!stripped) {
      setText("");
      onChange(0);
      return;
    }

    const next =
      props.kind === "money"
        ? formatMoneyFromRaw(raw, props.currency, digits)
        : formatPercentFromRaw(raw, digits);

    setText(next.display);
    onChange(next.value);

    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;
      const pos = caretIndexPreferDot(node.value, digitsBefore, preferDot);
      node.setSelectionRange(pos, pos);
    });
  }

  function handleFocus(e: FocusEvent<HTMLInputElement>) {
    focused.current = true;
    // Select what's already there, so typing replaces it rather than
    // inserting at wherever the caret happened to land.
    e.target.select();
  }

  function handleBlur() {
    focused.current = false;
    const parsed =
      props.kind === "money"
        ? formatMoneyFromRaw(text, props.currency, digits).value
        : formatPercentFromRaw(text, digits).value;
    onChange(parsed);
    setText(blurFormat(props, parsed));
  }

  return (
    <Input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onWheel={blockWheelChange}
      className={cn("tabular-nums", className)}
    />
  );
}
