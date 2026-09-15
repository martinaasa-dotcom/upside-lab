/**
 * What the browser holds about a company page: the payload's shape, the
 * fetch, and the short list of companies this reader has looked at.
 *
 * The recents list is deliberately local and deliberately small. It is a
 * convenience for getting back to a page you were reading, not a record of
 * what somebody has been researching: that would be a list of things a
 * person is thinking about buying, which is about as private as this app
 * gets, and it has no business on a server.
 */
import type { CompanyBrief } from "@/lib/ai/company-brief";
import type { CompanyFacts } from "@/lib/company/facts";
import type { CompanyReading } from "@/lib/company/readings";
import type { CompanyArticle, CompanySource } from "@/lib/company/sources";
import type { ModelRun } from "@/lib/ai/model-label";

export type CompanyPage = {
  facts: CompanyFacts;
  readings: CompanyReading[];
  articles: CompanyArticle[];
  sources: CompanySource[];
  /** The feed covered this company so thinly that no page was written. */
  thin: boolean;
  nextEarnings: string | null;
  nextEarningsIsEstimate: boolean;
  brief: CompanyBrief | null;
  briefAt: string | null;
  /** The page was written for whoever looked this company up first. */
  briefShared?: boolean;
  model: ModelRun | null;
};

/*
  A little past the route's own worst case (`LLM_BUDGET_MS` plus the rest
  of the build), so a legitimately slow-but-working run still finishes
  first. Every await inside `buildCompanyPage` is already bounded on the
  server, but a reader's own room has no business trusting that from the
  other end of a network connection: a request that never gets a response
  at all (a dropped connection, a proxy that swallows the close) would
  otherwise leave the skeleton on screen forever with nothing to retry.
*/
export const FETCH_TIMEOUT_MS = 100_000;

export async function fetchCompanyPage(
  ticker: string,
  signal?: AbortSignal,
  /** Exposed only so a test can use a real, short timeout instead of waiting. */
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<CompanyPage> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await fetch(`/api/company/${encodeURIComponent(ticker)}`, {
      cache: "no-store",
      signal: combined,
    });
  } catch (err) {
    if (timeout.aborted && !signal?.aborted) {
      throw new Error("That took too long to load. Try again in a moment.");
    }
    throw err;
  }
  const data = (await res.json()) as CompanyPage & { error?: string };
  if (!res.ok) {
    throw new Error(
      data?.error || "Could not load that company. Try again in a moment."
    );
  }
  return data;
}

const RECENT_KEY = "upside-company-recents-v1";
const RECENT_MAX = 8;

export function loadRecentCompanies(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.toUpperCase())
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function rememberCompany(ticker: string) {
  if (typeof window === "undefined") return;
  const key = ticker.trim().toUpperCase();
  if (!key) return;
  try {
    const next = [key, ...loadRecentCompanies().filter((t) => t !== key)].slice(
      0,
      RECENT_MAX
    );
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}

export function forgetRecentCompanies() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RECENT_KEY);
  } catch {
    /* quota / private mode */
  }
}

/** `/stock/NVDA`. One place builds it so a link and its reader agree. */
export function companyHref(ticker: string): string {
  return `/stock/${encodeURIComponent(ticker.trim().toUpperCase())}`;
}

/** The ticker in a `/stock/<ticker>` path, or null. */
export function companyTickerFromPath(pathname: string): string | null {
  const path = (pathname.split("?")[0] ?? "").replace(/\/+$/, "");
  const match = /^\/stock\/(.+)$/.exec(path);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim().toUpperCase() || null;
  } catch {
    return match[1].trim().toUpperCase() || null;
  }
}
