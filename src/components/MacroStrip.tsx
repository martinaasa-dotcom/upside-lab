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

  /*
   * The labels are spelled out, because the glosses were hover-only.
   *
   * "F&G 45 VIX 16.34 EURUSD 1.1596 BTC 77,255 10Y 4.80%" is five
   * abbreviations a beginner cannot read, and their explanations lived in
   * `title` attributes, which a phone never shows. There is nothing to
   * abbreviate for on a laptop: the row hugs the right of a wide bar.
   */
  const items = [
    fearGreed
      ? {
          label: "Fear & Greed",
          value: String(fearGreed.score),
          title: `CNN Fear & Greed: ${fearGreed.rating}`,
          tone: fearGreedTone(fearGreed.score),
        }
      : null,
    {
      label: "VIX",
      value: fmt(macro.vix, 2),
      title: "How big a swing the market expects over the next month",
      tone: null,
    },
    {
      label: "EUR/USD",
      value: fmt(macro.eurusd, 4),
      title: "Dollars for one euro",
      tone: null,
    },
    {
      label: "Bitcoin",
      value: macro.btc != null ? `$${fmt(macro.btc, 0)}` : NO_VALUE,
      title: "Bitcoin, in dollars",
      tone: null,
    },
    {
      label: "US 10-year",
      value: macro.tenYear != null ? `${fmt(macro.tenYear, 2)}%` : NO_VALUE,
      title: "What the US government pays to borrow for ten years",
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
     * Not on a phone at all.
     *
     * At 390 this was a masked, sideways-scrolling row of five
     * abbreviations about things the reader does not own, sitting above a
     * Market reading card that says the same two numbers in words with an
     * explanation beside each. What the strip is for on a phone is the one
     * line to its left: how old the prices are. From `sm` up there is room
     * for the numbers and they are spelled out.
     */
    <div
      className="ml-auto hidden w-fit min-w-0 sm:block"
      role="group"
      aria-label="Market snapshot"
    >
      <div className="flex w-fit items-center gap-3 whitespace-nowrap rounded-md border border-border bg-muted/50 px-3 py-1 font-mono text-xs tabular-nums">
        {itemNodes}
      </div>
    </div>
  );
}
