/**
 * Where to go and check, which is the section that makes the rest of the
 * room safe to read.
 *
 * Everything else on this page is either a figure out of a feed or a
 * sentence a model wrote, and a reader has no way to audit either from
 * inside the app. So the page carries the door out: the articles it was
 * given, with the publisher and the date on each, and the standing places
 * anybody can go to read the company's own filings rather than anybody's
 * summary of them.
 *
 * Two rules, and the first one is a refusal.
 *
 * **This app does not certify anybody as trustworthy.** There is no
 * allowlist of respectable publishers and no ranking of one against
 * another, because that judgement would be an editorial position handed to
 * every reader in the product, made by whoever last edited a list in a
 * file. What the reader gets instead is the publisher's name and the
 * article's date, always, in the same size as the headline: the two facts
 * you need to decide for yourself whether to take a piece seriously. A
 * reader who has never heard of the publisher has learned something
 * important about that headline.
 *
 * **A link either works or is not shown.** Every destination here is built
 * from public URL shapes that have been stable for years, and each one is
 * checked through `safeHttpUrl` before it can reach an anchor. A dead link
 * in the section whose whole job is "go and verify" is worse than the
 * section not existing.
 */
import { safeHttpUrl } from "@/lib/safe-url";
import type { PulseHeadline } from "@/lib/thesis-pulse";

export type CompanyArticle = {
  title: string;
  publisher: string;
  href: string;
  publishedAt: string;
};

export type CompanySource = {
  id: string;
  /** What the reader will find there, in their own words. */
  label: string;
  /** One line on what kind of thing it is and who wrote it. */
  detail: string;
  href: string;
  /** Filed by the company itself, or written about it by somebody else. */
  kind: "primary" | "market" | "coverage";
};

/**
 * Headlines the app already fetched, cleaned up for display.
 *
 * A headline with no working link is dropped rather than rendered as plain
 * text: an unlinked headline in a section that promises you can go and
 * check is the app quoting something and withholding the receipt.
 */
export function companyArticles(
  news: PulseHeadline[] | undefined,
  limit = 6
): CompanyArticle[] {
  if (!Array.isArray(news)) return [];
  const seen = new Set<string>();
  const out: CompanyArticle[] = [];
  for (const item of news) {
    const href = safeHttpUrl((item?.link ?? "").trim());
    const title = (item?.title ?? "").trim();
    if (!href || !title) continue;
    const dedupe = title.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      title,
      publisher: (item.publisher ?? "").trim() || "Unnamed publisher",
      href,
      publishedAt: item.publishedAt,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** A US-listed symbol, which is the only kind EDGAR can be asked about. */
function looksUsListed(ticker: string): boolean {
  return /^[A-Z]{1,5}$/.test(ticker.trim().toUpperCase());
}

/**
 * The standing places, in the order a sceptic should read them: what the
 * company had to file under oath first, then what the market is paying,
 * then what other people are saying about it.
 */
export function companySources(input: {
  ticker: string;
  listedSymbol?: string | null;
  website?: string | null;
  name?: string | null;
}): CompanySource[] {
  const ticker = input.ticker.trim().toUpperCase();
  const symbol = (input.listedSymbol || ticker).trim().toUpperCase();
  const out: CompanySource[] = [];

  if (looksUsListed(ticker)) {
    const edgar = safeHttpUrl(
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${encodeURIComponent(ticker)}&type=10-K&dateb=&owner=include&count=40`
    );
    if (edgar) {
      out.push({
        id: "edgar",
        label: "The company's own filings",
        detail:
          "What they are legally required to tell the regulator, including the risks they list themselves. Dry, long, and the only thing on this page nobody is allowed to spin.",
        href: edgar,
        kind: "primary",
      });
    }
  }

  const site = safeHttpUrl((input.website ?? "").trim());
  if (site) {
    out.push({
      id: "website",
      label: "The company's own site",
      detail:
        "Their side of the story, written by them. Useful for working out what they actually sell, and not a neutral source about anything else.",
      href: site,
      kind: "primary",
    });
  }

  const yahoo = safeHttpUrl(
    `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`
  );
  if (yahoo) {
    out.push({
      id: "yahoo",
      label: "The figures, at the source",
      detail:
        "The same feed every number on this page was read from. Open it and the figures should match; if one does not, ours is the one that is wrong.",
      href: yahoo,
      kind: "market",
    });
  }

  const analysis = safeHttpUrl(
    `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/analysis`
  );
  if (analysis) {
    out.push({
      id: "analysts",
      label: "What the analysts published",
      detail:
        "The individual forecasts behind the average used above, including how far apart they are, which an average always hides.",
      href: analysis,
      kind: "market",
    });
  }

  const search = safeHttpUrl(
    `https://news.google.com/search?q=${encodeURIComponent(`${input.name || ticker} stock`)}`
  );
  if (search) {
    out.push({
      id: "coverage",
      label: "Everything else being written",
      detail:
        "Wider coverage than the handful of headlines above, including the people who disagree with it. Nobody here has vetted any of it.",
      href: search,
      kind: "coverage",
    });
  }

  return out;
}
