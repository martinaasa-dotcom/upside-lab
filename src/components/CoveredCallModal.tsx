"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Segmented } from "@/components/ui/Panel";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { blockWheelChange, parseDecimal } from "@/lib/number-input";
import { cashtag } from "@/lib/format";
import {
  validateCallDraft,
  type TrackedCallDraft,
  type TrackedCallStatus,
} from "@/lib/options/tracked-calls";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type CallModalSeed = Partial<TrackedCallDraft> & {
  /** Present when editing an existing call. */
  id?: string;
};

type Props = {
  open: boolean;
  /** Holdings a call can be written on, with how many contracts each covers. */
  holdings: { ticker: string; contracts: number }[];
  seed: CallModalSeed | null;
  onClose: () => void;
  onSave: (draft: TrackedCallDraft, id?: string) => Promise<string | null>;
};

const STATUS_OPTIONS = [
  { id: "sold" as const, label: "I've sold it" },
  { id: "planned" as const, label: "I plan to" },
];

function todayKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function numText(n: number | null | undefined): string {
  return n != null && Number.isFinite(n) ? String(n) : "";
}

const cleanDecimal = (raw: string) => raw.replace(/,/g, ".").replace(/[^\d.]/g, "");

/**
 * Enter a covered call exactly as the broker shows it: which shares, the
 * strike, the expiry, how many contracts and the premium per share.
 *
 * "Sold" and "planned" are one form with one difference, which is what the
 * premium means: the price received, or the price wanted. A planned call's
 * premium is optional, since "whatever it pays" is a plan too.
 */
export function CoveredCallModal({ open, holdings, seed, onClose, onSave }: Props) {
  const [status, setStatus] = useState<TrackedCallStatus>("sold");
  const [ticker, setTicker] = useState("");
  const [strike, setStrike] = useState("");
  const [expiry, setExpiry] = useState("");
  const [contracts, setContracts] = useState("1");
  const [premium, setPremium] = useState("");
  const [openedOn, setOpenedOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const first = holdings[0];
    const t = seed?.ticker ?? first?.ticker ?? "";
    const cover = holdings.find((h) => h.ticker === t)?.contracts ?? 1;
    setStatus(seed?.status ?? "sold");
    setTicker(t);
    setStrike(numText(seed?.strike));
    setExpiry(seed?.expiry ?? "");
    setContracts(String(seed?.contracts ?? Math.max(1, cover)));
    setPremium(numText(seed?.premium));
    setOpenedOn(seed?.opened_on ?? (seed?.id ? "" : todayKey()));
    setError(null);
    setBusy(false);
  }, [open, seed, holdings]);

  if (!open || typeof document === "undefined") return null;

  const editing = Boolean(seed?.id);
  const cover = holdings.find((h) => h.ticker === ticker)?.contracts ?? null;
  const tooMany = cover != null && Number(contracts) > cover;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const verdict = validateCallDraft({
      ticker,
      status,
      strike: parseDecimal(strike),
      expiry,
      contracts: Number(contracts),
      premium: premium.trim() ? parseDecimal(premium) : null,
      opened_on: status === "sold" && openedOn ? openedOn : null,
    });
    if (!verdict.ok) {
      setError(verdict.error);
      return;
    }
    setBusy(true);
    const failed = await onSave(verdict.draft, seed?.id);
    if (failed) {
      setError(failed);
      setBusy(false);
      return;
    }
    onClose();
  }

  /*
    Portalled to the body: this is opened from inside the covered-call
    panel, whose glass carries a backdrop filter, and a filtered ancestor
    becomes the containing block of anything fixed inside it. Left in
    place the sheet was sized and clipped to the panel rather than the
    screen, cutting off its right edge on a phone.
  */
  return createPortal(
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
        className="scroll-host relative max-h-full w-full max-w-md overflow-y-auto rounded-t-xl bg-popover ring-1 ring-foreground/20 modal-pad sm:rounded-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2>{editing ? "Edit covered call" : "Track a covered call"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter it as your broker shows it. Its delta and what you have kept
              are read from the market from then on.
            </p>
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
          options={STATUS_OPTIONS}
          value={status}
          onChange={(next) => {
            setStatus(next);
            setError(null);
          }}
          columns={2}
          ariaLabel="Have you sold this call, or are you planning to?"
        />

        <div className="mt-4 grid grid-cols-2 items-end gap-3 [&>label]:min-w-0">
          <label className="col-span-2 grid gap-1 text-sm text-muted-foreground">
            On which shares
            <NativeSelect
              value={ticker}
              onChange={(e) => {
                setTicker(e.target.value);
                setError(null);
              }}
              className="w-full"
            >
              {holdings.map((h) => (
                <NativeSelectOption key={h.ticker} value={h.ticker}>
                  {cashtag(h.ticker)}
                  {h.contracts > 0
                    ? ` (covers ${h.contracts} contract${h.contracts === 1 ? "" : "s"})`
                    : " (under 100 shares)"}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>

          <label className="grid gap-1 text-sm text-muted-foreground">
            Strike
            <Input
              type="text"
              inputMode="decimal"
              value={strike}
              placeholder="250"
              onChange={(e) => {
                setStrike(cleanDecimal(e.target.value));
                setError(null);
              }}
              onWheel={blockWheelChange}
              className="min-w-0 tabular-nums"
              required
            />
          </label>

          <label className="grid gap-1 text-sm text-muted-foreground">
            Expires
            <Input
              type="date"
              value={expiry}
              onChange={(e) => {
                setExpiry(e.target.value);
                setError(null);
              }}
              className="min-w-0 tabular-nums"
              required
            />
          </label>

          <label className="grid gap-1 text-sm text-muted-foreground">
            Contracts
            <Input
              type="text"
              inputMode="numeric"
              value={contracts}
              onChange={(e) => {
                setContracts(e.target.value.replace(/[^\d]/g, ""));
                setError(null);
              }}
              onWheel={blockWheelChange}
              className="min-w-0 tabular-nums"
              required
            />
          </label>

          <label className="grid gap-1 text-sm text-muted-foreground">
            {status === "sold" ? "Premium per share" : "Wanted per share"}
            <Input
              type="text"
              inputMode="decimal"
              value={premium}
              placeholder={status === "sold" ? "1.20" : "Optional"}
              onChange={(e) => {
                setPremium(cleanDecimal(e.target.value));
                setError(null);
              }}
              onWheel={blockWheelChange}
              className="min-w-0 tabular-nums"
              required={status === "sold"}
            />
          </label>

          {status === "sold" ? (
            <label className="col-span-2 grid gap-1 text-sm text-muted-foreground">
              Date sold (optional)
              <Input
                type="date"
                value={openedOn}
                onChange={(e) => setOpenedOn(e.target.value)}
                className="min-w-0 tabular-nums"
              />
            </label>
          ) : null}
        </div>

        {tooMany ? (
          <p className="mt-3 text-sm text-caution">
            {cover === 0
              ? `${cashtag(ticker)} is under 100 shares in this portfolio, so a call on it is not covered by shares.`
              : `${cashtag(ticker)} covers ${cover} contract${cover === 1 ? "" : "s"} in this portfolio. Calls beyond that are not covered by shares.`}
          </p>
        ) : null}
        {error && <p className="mt-3 text-sm text-loss">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || holdings.length === 0}>
            {busy ? "Saving…" : editing ? "Save" : "Track it"}
          </Button>
        </div>
      </form>
    </ViewportOverlay>,
    document.body
  );
}
