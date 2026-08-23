"use client";

import { useEffect } from "react";
import { isAbortError } from "@/lib/abort";
import type { FearGreedSnapshot } from "@/lib/market/fear-greed";
import { fearGreedTone } from "@/lib/market/fear-greed";
import { NO_VALUE, cn } from "@/lib/format";
import { quotePollMs, quotesUrl } from "@/lib/market/session";
import { macroFromQuotesPayload } from "@/lib/market/macro-numbers";
import {
  loadMacroPaint,
  saveMacroPaint,
  type MacroNumbers,
} from "@/lib/paint-cache";
import { useHydratedCache } from "@/lib/use-hydrated-cache";

type Macro = MacroNumbers;
type MacroPayload = Parameters<typeof macroFromQuotesPayload>[0];

const EMPTY_MACRO: Macro = {
  vix: null,
  eurusd: null,
  btc: null,
  tenYear: null,
};

const MACRO_TICKERS = ["^VIX", "EURUSD=X", "BTC-USD", "^TNX"] as const;
const MACRO_QUOTES_URL = quotesUrl(MACRO_TICKERS);

function readCachedMacro(): Macro {
  return loadMacroPaint()?.macro ?? EMPTY_MACRO;
}

async function fetchMacroPayload(signal?: AbortSignal): Promise<MacroPayload> {
  const res = await fetch(MACRO_QUOTES_URL, { signal });
  if (!res.ok) throw new Error("macro failed");
  return (await res.json()) as MacroPayload;
}

async function fetchFearGreed(signal?: AbortSignal): Promise<FearGreedSnapshot | null> {
  try {
    const res = await fetch("/api/market/fear-greed", { signal });
    if (!res.ok) return null;
    return (await res.json()) as FearGreedSnapshot;
  } catch (err) {
    if (isAbortError(err)) throw err;
    return null;
  }
}

function fmt(n: number | null, digits = 2) {
  if (n == null || !Number.isFinite(n)) return NO_VALUE;
  return n.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function MacroStrip() {
  const [macro, setMacro] = useHydratedCache<Macro>(readCachedMacro, EMPTY_MACRO);
  const [fearGreed, setFearGreed] = useHydratedCache<FearGreedSnapshot | null>(
    () => loadMacroPaint()?.fearGreed ?? null,
    null
  );

  useEffect(() => {
    const ctrl = new AbortController();
    const applyMacro = (payload: MacroPayload) => {
      if (ctrl.signal.aborted) return;
      setMacro((prev) => {
        const next = macroFromQuotesPayload(payload, prev);
        saveMacroPaint({
          macro: next,
          fearGreed: loadMacroPaint()?.fearGreed ?? null,
        });
        return next;
      });
    };
    const applyFear = (fg: FearGreedSnapshot | null) => {
      if (ctrl.signal.aborted || !fg) return;
      setFearGreed(fg);
      saveMacroPaint({
        macro: loadMacroPaint()?.macro ?? readCachedMacro(),
        fearGreed: fg,
      });
    };
    void fetchMacroPayload(ctrl.signal).then(applyMacro).catch((err) => {
      if (isAbortError(err)) return;
    });
    if (!loadMacroPaint()?.fearGreed) {
      void fetchFearGreed(ctrl.signal).then(applyFear).catch((err) => {
        if (isAbortError(err)) return;
      });
    }
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          if (!document.hidden && !ctrl.signal.aborted) {
            void fetchMacroPayload(ctrl.signal).then(applyMacro).catch((err) => {
              if (isAbortError(err)) return;
            });
            void fetchFearGreed(ctrl.signal).then(applyFear).catch((err) => {
              if (isAbortError(err)) return;
            });
          }
          if (!ctrl.signal.aborted) schedule();
        },
        quotePollMs()
      );
    };
    schedule();

    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [setFearGreed, setMacro]);

  const items = [
    fearGreed
      ? {
          label: "F&G",
          value: String(fearGreed.score),
          title: `CNN Fear & Greed: ${fearGreed.rating}`,
          tone: fearGreedTone(fearGreed.score),
        }
      : null,
    { label: "VIX", value: fmt(macro.vix, 2), title: "VIX", tone: null },
    { label: "EURUSD", value: fmt(macro.eurusd, 4), title: "EURUSD", tone: null },
    { label: "BTC", value: fmt(macro.btc, 0), title: "Bitcoin", tone: null },
    {
      label: "10Y",
      value: macro.tenYear != null ? `${fmt(macro.tenYear, 2)}%` : NO_VALUE,
      title: "US 10-year yield",
      tone: null,
    },
  ].filter(Boolean) as Array<{
    label: string;
    value: string;
    title: string;
    tone: "fear" | "neutral" | "greed" | null;
  }>;

  const itemNodes = items.map((i) => (
    <span key={i.label} className="shrink-0" title={i.title}>
      <span className="text-muted-foreground">{i.label}</span>{" "}
      <span
        className={cn(
          "font-mono tabular-nums text-foreground",
          i.tone === "fear" && "text-primary",
          i.tone === "greed" && "text-caution"
        )}
      >
        {i.value}
      </span>
    </span>
  ));

  return (
    /*
     * On a phone this row is wider than the screen and scrolls, so a short
     * mask fades its last number instead of hard-cutting it. The pill chrome
     * goes with it below `sm`: boxed and filled, four market numbers looked
     * like a control you could press, inside a chrome row that is already a
     * bounded band of its own.
     */
    <div
      className="scrollbar-none min-w-0 flex-1 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] sm:ml-auto sm:w-fit sm:flex-none sm:[mask-image:none]"
      role="group"
      aria-label="Market snapshot"
    >
      <div className="flex w-fit items-center gap-3 whitespace-nowrap rounded-md px-0 py-1 font-mono text-xs tabular-nums sm:border sm:border-border sm:bg-muted/50 sm:px-3">
        {itemNodes}
      </div>
    </div>
  );
}
