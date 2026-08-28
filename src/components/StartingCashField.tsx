"use client";

import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/Panel";
import { CLASS_CASH_PRESETS, formatCashDigits, parseCashDigits } from "@/lib/class-templates";
import { MAX_STARTING_CASH, MIN_STARTING_CASH } from "@/lib/classroom";
import { useEffect, useState } from "react";

export function StartingCashField({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(`$${formatCashDigits(value)}`);

  useEffect(() => {
    setText(`$${formatCashDigits(value)}`);
  }, [value]);

  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">Starting cash</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Every student gets this on a paper portfolio. Same number for the whole
        class.
      </p>
      {/*
        The app's one segmented control rather than a hand-rolled row of
        `bg-muted` cells. These are the same thing the forecast horizon
        picker is, a choice with one answer showing, and a flat grey fill
        reads as a hole beside the glass around it.
      */}
      <Segmented
        className="mt-4"
        ariaLabel="Starting cash preset"
        columns={3}
        disabled={disabled}
        options={CLASS_CASH_PRESETS.map((n) => ({
          id: String(n),
          label: `$${formatCashDigits(n)}`,
        }))}
        value={
          CLASS_CASH_PRESETS.some((n) => n === value) ? String(value) : null
        }
        onChange={(id) => onChange(Number(id))}
      />
      <label className="mt-4 block">
        <span className="text-sm font-medium text-muted-foreground">Or type another amount</span>
        <Input
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          value={text}
          aria-label="Starting cash"
          onChange={(e) => {
            const parsed = parseCashDigits(e.target.value);
            if (parsed == null) {
              setText("");
              return;
            }
            const next = Math.min(MAX_STARTING_CASH, parsed);
            setText(`$${formatCashDigits(next)}`);
            if (next >= MIN_STARTING_CASH) onChange(next);
          }}
          className="mt-2 max-w-xs tabular-nums"
        />
      </label>
    </div>
  );
}
