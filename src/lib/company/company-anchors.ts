/**
 * ONE COMPANY, ONE FAIR VALUE, WHEREVER IT IS DRAWN.
 *
 * A price ladder is the anchor times a set of multiples, so the anchor is
 * the whole claim, and until now this app answered it three different
 * ways for one company. The Research room anchored a name a reader does
 * not own on the blended twelve-month estimate from its own valuation
 * panel. The holdings map anchored a name they DO own on that holding's
 * end-of-year forecast target. The Circle, which has no member's targets
 * to read, anchored it on the middle of the range the share has traded
 * in. So one company sat in "a long way below" on one screen and "close
 * to fair value" on the next, and the two pictures a reader was meant to
 * compare could not be compared at all.
 *
 * What a company looks worth is not a fact about who is holding it, so
 * there is one answer here and every surface reads it: the blended
 * estimate `anchorForCompany` already publishes, built from the same
 * figures, by the same function, on the server, once per company rather
 * than once per reader. `holdingLadders` takes it, the Circle takes it,
 * Home and the alerts take it through the same builder, and the Research
 * room computes the identical figure from the page it already has.
 *
 * A reader who wants their own number still has one: the ladder's own
 * `anchor` edit (`LadderOverride.anchor`), which is theirs, is stored as
 * their own, and is the one figure allowed to outrank this. An
 * end-of-year forecast target is deliberately NOT that lever any more.
 * It is a claim about where the price is going, this app writes one for
 * every holding whether or not anybody chose it, and a target grown from
 * today's price puts every name the same distance from its own anchor,
 * which orders a reader's holdings by how fast this app expects them to
 * compound while looking like it ordered them by how cheap they are.
 */
import { anchorForCompany, type LadderAnchor } from "@/lib/company/ladder-anchor";
import {
  MAX_ANCHOR_TICKERS,
  type CompanyAnchors,
} from "@/lib/company/company-anchor-types";
import { isReusableBrief, type StoredBrief } from "@/lib/company/brief-store";
import type { CompanyBrief } from "@/lib/ai/company-brief";
import { companyFactsKey } from "@/lib/company/facts";
import { fairValueRead } from "@/lib/company/fair-value";
import { FORECAST_YEARS } from "@/lib/forecast";
import { fetchCompanyFacts } from "@/lib/market/fundamentals";
import { getSupabaseServer } from "@/lib/supabase/server";


/**
 * The model's own path for each name, read in one query rather than one
 * per ticker.
 *
 * This is the third method in the blend, and it is read under exactly the
 * rules the Research room reads it under (`isReusableBrief`: the age, the
 * facts key and the price it was written against), so a brief too old or
 * written before the company reported drops out of the blend here the
 * same way it drops out there. Reading it any other way would be a second
 * answer to the one question this file exists to answer once.
 */
async function pathsFor(
  tickers: string[],
  spots: Map<string, number | null>,
  factsKeys: Map<string, string>
): Promise<Map<string, Partial<Record<number, number>>>> {
  const out = new Map<string, Partial<Record<number, number>>>();
  const db = getSupabaseServer();
  if (!db || tickers.length === 0) return out;
  try {
    const { data, error } = await db
      .from("portfell_company_briefs")
      .select("ticker, brief, facts_key, anchor_price, generated_at")
      .in("ticker", tickers);
    if (error || !data) return out;
    type Row = {
      ticker: string;
      brief: unknown;
      facts_key: string | null;
      anchor_price: number | null;
      generated_at: string;
    };
    for (const raw of data as unknown as Row[]) {
      const ticker = String(raw.ticker).toUpperCase();
      const row: StoredBrief = {
        brief: raw.brief as unknown as CompanyBrief,
        generatedAt: raw.generated_at,
        factsKey: raw.facts_key ?? "",
        anchorPrice: raw.anchor_price ?? null,
      };
      const reusable = isReusableBrief(row, {
        spot: spots.get(ticker) ?? null,
        factsKey: factsKeys.get(ticker) ?? "",
      });
      if (!reusable) continue;
      const path = row.brief?.path;
      if (path) out.set(ticker, path);
    }
  } catch {
    /* a missing path only drops one method from the blend */
  }
  return out;
}

/**
 * The anchor for each of these companies, or nothing for one the feed
 * could not answer about.
 *
 * A name with no entry is not an error and is not a zero: the caller
 * falls back to the same trading-range reading it always had, which is a
 * checkable fact about the price and says so.
 */
export async function loadCompanyAnchors(
  rawTickers: string[]
): Promise<CompanyAnchors> {
  const tickers = [
    ...new Set(
      rawTickers
        .map((t) => t.trim().toUpperCase())
        .filter((t) => t.length > 0)
    ),
  ].slice(0, MAX_ANCHOR_TICKERS);
  if (tickers.length === 0) return {};

  const facts = await Promise.all(
    tickers.map((t) => fetchCompanyFacts(t).catch(() => null))
  );

  const spots = new Map<string, number | null>();
  const factsKeys = new Map<string, string>();
  tickers.forEach((t, i) => {
    const f = facts[i];
    if (!f) return;
    spots.set(t, typeof f.price === "number" ? f.price : null);
    factsKeys.set(t, companyFactsKey(f));
  });

  const paths = await pathsFor([...factsKeys.keys()], spots, factsKeys);

  const yearOne = FORECAST_YEARS[0];
  const yearTwo = FORECAST_YEARS[1];
  const out: CompanyAnchors = {};
  tickers.forEach((ticker, i) => {
    const f = facts[i];
    if (!f) return;
    const path = paths.get(ticker);
    const read = fairValueRead(f, {
      modelYearOne: yearOne != null ? (path?.[yearOne] ?? null) : null,
      modelYearTwo: yearTwo != null ? (path?.[yearTwo] ?? null) : null,
    });
    const anchor: LadderAnchor = anchorForCompany(f, read);
    if (!anchor) return;
    // `anchorForCompany` answers with one of these two and nothing else;
    // the wider `LadderAnchorKind` covers edits made in the browser.
    if (anchor.kind !== "estimate" && anchor.kind !== "history") return;
    const high = f.fiftyTwoWeekHigh;
    const low = f.fiftyTwoWeekLow;
    out[ticker] = {
      price: anchor.price,
      kind: anchor.kind,
      said: anchor.said,
      high: typeof high === "number" && high > 0 ? high : null,
      low: typeof low === "number" && low > 0 ? low : null,
    };
  });
  return out;
}
