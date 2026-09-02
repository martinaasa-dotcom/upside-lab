"use client";

import { currency, percent } from "@/lib/format";
import { isSafePositiveMoney } from "@/lib/input-guard";
import { startNavFromYtdPct } from "@/lib/market/assumed-nav";
import type { YtdAnchor } from "@/lib/market/ytd-anchor";
import { blockWheelChange, parseDecimal } from "@/lib/number-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  liveNav: number;
  initialStartNav?: number | null;
  onClose: () => void;
  onSave: (anchor: YtdAnchor) => void;
};

function parseStart(raw: string): number | null {
  const n = parseDecimal(raw.replace(/\$/g, ""));
  return isSafePositiveMoney(n) ? n : null;
}

function parseYtdPct(raw: string): number | null {
  const cleaned = raw.replace(/%/g, "").trim();
  if (!cleaned) return null;
  const n = parseDecimal(cleaned);
  if (!Number.isFinite(n)) return null;
  return n / 100;
}

export function YtdAnchorModal({
  open,
  liveNav,
  initialStartNav,
  onClose,
  onSave,
}: Props) {
  const [start, setStart] = useState("");
  const [ytd, setYtd] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStart(
      initialStartNav != null && initialStartNav > 0
        ? String(Math.round(initialStartNav))
        : ""
    );
    setYtd("");
    setBusy(false);
  }, [open, initialStartNav]);

  if (!open) return null;

  const typedStart = parseStart(start);
  const typedPct = parseYtdPct(ytd);
  const startNav =
    typedStart ??
    (typedPct != null && liveNav > 0
      ? startNavFromYtdPct(liveNav, typedPct)
      : null);
  const impliedPct =
    startNav != null && liveNav > 0 ? (liveNav - startNav) / startNav : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || startNav == null || !isSafePositiveMoney(startNav)) return;
    setBusy(true);
    try {
      onSave({
        v: 1,
        source: "manual",
        startNav,
        ytdPct: impliedPct ?? undefined,
      });
    } finally {
      setBusy(false);
    }
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
            <h3 className="text-base font-semibold text-foreground">
              Your real year
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              The chart still draws its shape from what you hold today. This
              number sets how big the year actually was.
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

        <label className="grid gap-1 text-sm text-muted-foreground">
          Total on January 1
          <Input
            autoFocus
            type="text"
            inputMode="decimal"
            value={start}
            onChange={(e) =>
              setStart(
                e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "")
              )
            }
            onWheel={blockWheelChange}
            placeholder={
              liveNav > 0
                ? String(Math.round((liveNav * 0.9) / 100) * 100)
                : "10000"
            }
            className="tabular-nums"
          />
        </label>

        <p className="mt-3 text-sm text-muted-foreground">or</p>

        <label className="mt-3 grid gap-1 text-sm text-muted-foreground">
          What your broker says you are up or down this year (%)
          <Input
            type="text"
            inputMode="decimal"
            value={ytd}
            onChange={(e) =>
              setYtd(
                e.target.value.replace(/,/g, ".").replace(/[^\d.+%-]/g, "")
              )
            }
            onWheel={blockWheelChange}
            placeholder="+18.4"
            className="tabular-nums"
          />
        </label>

        {impliedPct != null && startNav != null && (
          <p className="mt-3 text-sm tabular-nums text-muted-foreground">
            That makes this year {impliedPct >= 0 ? "+" : ""}
            {percent(impliedPct)}, from {currency(startNav, 0)} to{" "}
            {currency(liveNav, 0)}.
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || startNav == null}>
            {busy ? "Saving…" : "Use this number"}
          </Button>
        </div>
      </form>
    </ViewportOverlay>
  );
}
