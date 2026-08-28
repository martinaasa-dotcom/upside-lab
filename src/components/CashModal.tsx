"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/Panel";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { isSafeSignedMoney } from "@/lib/input-guard";
import { blockWheelChange, parseDecimal } from "@/lib/number-input";
import { roundMoney } from "@/lib/money";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  portfolioName: string;
  initialCash: number;
  /** Classroom sheets spend and refill this on every buy and sell. */
  paperCash?: boolean;
  onClose: () => void;
  onSave: (cash: number) => void;
};

type Sign = "have" | "owe";

const SIGN_OPTIONS = [
  { id: "have" as const, label: "Money there" },
  { id: "owe" as const, label: "Money borrowed" },
];

/**
 * The sign is a toggle rather than a minus you type, because on a phone
 * there is no minus to type: `inputMode="decimal"` opens the number pad,
 * and on iOS that pad is digits and a dot. Anybody holding borrowed money
 * could see it named on the Cash card and still had no way to enter it.
 * A pasted "-7000" is honoured too, by flipping the toggle.
 */
export function CashModal({
  open,
  portfolioName,
  initialCash,
  paperCash = false,
  onClose,
  onSave,
}: Props) {
  const [amount, setAmount] = useState(() => String(Math.abs(initialCash)));
  const [sign, setSign] = useState<Sign>(initialCash < 0 ? "owe" : "have");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(String(Math.abs(initialCash)));
    setSign(initialCash < 0 ? "owe" : "have");
    setError(null);
    setBusy(false);
  }, [open, initialCash]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const typed = parseDecimal(amount);
    const n = sign === "owe" && typed !== 0 ? -typed : typed;
    if (!isSafeSignedMoney(n)) {
      setError("That has to be a real dollar amount, and not an impossible one.");
      return;
    }
    setBusy(true);
    onSave(roundMoney(n));
  }

  return (
    <ViewportOverlay
      className="z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClose={onClose}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="scroll-host relative max-h-full w-full max-w-md overflow-y-auto rounded-t-xl bg-popover ring-1 ring-foreground/20 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:rounded-xl sm:pb-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Edit cash</h3>
            <p className="text-sm text-muted-foreground">{portfolioName}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            className="touch-target sm:size-7"
          >
            <X />
          </Button>
        </div>

        <Segmented
          options={SIGN_OPTIONS}
          value={sign}
          onChange={(next) => {
            setSign(next);
            setError(null);
          }}
          columns={2}
          ariaLabel="Is this money you have or money you borrowed?"
        />

        <label className="mt-4 grid gap-1 text-sm text-muted-foreground">
          {sign === "owe"
            ? "Money your broker lent you. It counts against your total."
            : paperCash
              ? "This is paper money. Buying spends it, and selling adds it back."
              : "Money sitting ready, not yet in a stock."}
          <Input
            autoFocus
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              const raw = e.target.value.replace(/,/g, ".");
              if (raw.includes("-")) setSign((s) => (s === "owe" ? "have" : "owe"));
              setAmount(raw.replace(/[^\d.]/g, ""));
              setError(null);
            }}
            onWheel={blockWheelChange}
            className="tabular-nums"
            required
          />
        </label>

        {error && <p className="mt-3 text-sm text-loss">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </ViewportOverlay>
  );
}
