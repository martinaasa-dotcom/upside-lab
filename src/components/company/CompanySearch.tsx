"use client";

import { Input } from "@/components/ui/input";
import { SUGGEST_MENU } from "@/components/ui/Panel";
import { cashtag, cn } from "@/lib/format";

import { useTickerSearch } from "@/lib/use-ticker-search";
import {
  localTickerSuggestions,
  mergeAndRankTickerSuggestions,
  type TickerSuggestion,
} from "@/lib/market/ticker-search";
import { aimOnPress } from "@/lib/route-aim";
import { companyHref } from "@/lib/company/client";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Type a name, get a company page.
 *
 * The same ranking every other ticker field in the app uses, so a short
 * coin alias resolves the way it resolves everywhere else, and the same
 * press-time aim the dock uses, because opening a company replaces the
 * room this field is sitting in and a browser will not always turn that
 * press into a click.
 */
/** Stable identities, so the memo below is not rebuilt on every keystroke. */
const EMPTY_CATALOG: string[] = [];
const EMPTY_EXCLUDE = new Set<string>();

export function CompanySearch({
  autoFocus = false,
  placeholder = "Type a company or a ticker",
}: {
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const remote = useTickerSearch(query);

  const results = useMemo(
    () =>
      mergeAndRankTickerSuggestions(
        query,
        localTickerSuggestions(query, EMPTY_CATALOG, EMPTY_EXCLUDE),
        remote,
        EMPTY_EXCLUDE,
        8
      ),
    [query, remote]
  );

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  function go(ticker: string) {
    const key = ticker.trim().toUpperCase();
    if (!key) return;
    setOpen(false);
    setQuery("");
    router.push(companyHref(key));
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            const pick = results[active];
            go(pick ? pick.symbol : query);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        aria-label="Search for a company"
        className="pl-9"
      />
      {open && results.length > 0 && (
        <ul className={SUGGEST_MENU} role="listbox">
          {results.map((r: TickerSuggestion, i) => (
            <li key={r.symbol}>
              <a
                href={companyHref(r.symbol)}
                role="option"
                aria-selected={i === active}
                /*
                  The press aims and, if it turns out to be a tap, navigates
                  itself, because opening a company replaces the room this
                  field is standing in and a browser will not always turn
                  that press into a click.

                  `defaultPrevented` is what stops the room being entered
                  twice. `aimOnPress` attaches a native click listener that
                  calls `preventDefault` once it has already navigated, and
                  a native listener on the element runs before React's
                  delegated one, so by the time this handler sees the event
                  the flag is set and there is nothing left to do.
                */
                onPointerDown={(e) =>
                  aimOnPress(e.nativeEvent, companyHref(r.symbol), () =>
                    go(r.symbol)
                  )
                }
                onClick={(e) => {
                  if (e.defaultPrevented) return;
                  e.preventDefault();
                  go(r.symbol);
                }}
                className={cn(
                  "flex items-center justify-between gap-3 px-3 py-2 text-sm transition",
                  i === active ? "bg-hover text-foreground" : "text-muted-foreground hover:bg-hover"
                )}
              >
                <span className="min-w-0 truncate">{r.name || r.symbol}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {cashtag(r.symbol)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
