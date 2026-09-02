import { keepingRealBooks } from "@/lib/fund-copy";

export type FundWatchItem = {
  ticker: string;
  waitFor: string;
};

/** Drop held names, junk tickers, and empties so the public list stays honest. */
export function sanitizeFundWatchlist(
  items: unknown[] | null | undefined,
  heldTickers: string[]
): FundWatchItem[] {
  const held = new Set(
    heldTickers.map((t) => t.trim().toUpperCase()).filter(Boolean)
  );
  const seen = new Set<string>();
  const out: FundWatchItem[] = [];
  for (const raw of items ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as { ticker?: unknown; waitFor?: unknown };
    const ticker = String(item.ticker ?? "")
      .trim()
      .toUpperCase()
      .replace(/^\$/, "");
    if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(ticker)) continue;
    if (held.has(ticker) || seen.has(ticker)) continue;
    /*
      This line is printed straight onto the page under a company's name,
      and it is a sentence a model wrote. Everything else the fund writes
      goes through the same pass before a reader sees it, so an em dash or a
      piece of market slang cannot arrive here just because this one string
      is short.
    */
    const waitFor = keepingRealBooks(
      String(item.waitFor ?? "").replace(/\s+/g, " ").trim()
    ).trim();
    if (!waitFor) continue;
    seen.add(ticker);
    out.push({ ticker, waitFor });
    if (out.length >= 4) break;
  }
  return out;
}
