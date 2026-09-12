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
  formatPlainNumber,
} from "@/lib/format-live-input";
import { blockWheelChange } from "@/lib/number-input";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

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
 * While the field is focused, the currency symbol and the percent sign are
 * not part of the text. A reader who wants to replace "$1,000" or "7.5%"
 * has nothing in the box but its digits, so typing over the whole thing
 * needs no deleting first. The symbol comes back the moment the field is
 * no longer being edited.
 */
function editFormat(props: FormattedNumberInputProps, n: number): string {
  const digits = props.digits ?? (props.kind === "money" ? 0 : 2);
  return formatPlainNumber(n, digits);
}

function parseEditRaw(
  props: FormattedNumberInputProps,
  raw: string,
  digits: number
): { display: string; value: number } {
  return props.kind === "money"
    ? formatMoneyFromRaw(raw, props.currency, digits, { plain: true })
    : formatPercentFromRaw(raw, digits, { plain: true });
}

/**
 * Money / percent input. Shows real formatting ($1,000 / 7.5%) at rest, and
 * the bare, comma-grouped number while focused, selected in full, so a tap
 * lands ready to type over rather than needing anything deleted first.
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

    const next = parseEditRaw(props, raw, digits);

    setText(next.display);
    onChange(next.value);

    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;
      const pos = caretIndexPreferDot(node.value, digitsBefore, preferDot);
      node.setSelectionRange(pos, pos);
    });
  }

  function handleFocus() {
    focused.current = true;
    setText(editFormat(props, value));
    const node = inputRef.current;
    if (node) {
      requestAnimationFrame(() => {
        node.select();
      });
    }
  }

  function handleBlur() {
    focused.current = false;
    const parsed = parseEditRaw(props, text, digits).value;
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
