/**
 * The one limit on reaching a company page without an account, decided at
 * the edge. Pure apart from the shared bucket, so it is tested apart from
 * the request.
 *
 * `/stock/<ticker>` is public: anybody can open it with no account, and it
 * is the address the app shares and the address search engines index. A
 * company on the published list is served from the CDN and costs nothing
 * to open. A company off it has a page too (see `isOpenResearchTicker`),
 * because a reader shares whatever they were reading, and each one of
 * those is a provider call the first time anybody opens it in a six hour
 * window. That is fine for a link somebody was sent and not fine for a
 * script trying every symbol in the alphabet, so those pages, and only
 * those, are capped per caller.
 */
import {
  checkRateLimit,
  clientBucket,
  type RateLimitResult,
} from "@/lib/rate-limit";
import { isResearchTicker } from "@/lib/research/universe";

const COMPANY_PATH = /^\/stock\/([^/]+)(?:\/opengraph-image)?\/?$/;

/** Company pages off the published list one caller may open a minute. */
export const OPEN_RESEARCH_PER_MINUTE = 30;

/**
 * The cap on company pages off the published list, or null when this
 * request is not one of them.
 */
export function limitOpenResearchRequest(req: Request): RateLimitResult | null {
  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;
  let pathname = "/";
  try {
    pathname = new URL(req.url).pathname;
  } catch {
    return null;
  }
  const match = COMPANY_PATH.exec(pathname);
  if (!match?.[1]) return null;
  if (isResearchTicker(match[1])) return null;
  return checkRateLimit(
    `research-open:${clientBucket(req)}`,
    OPEN_RESEARCH_PER_MINUTE,
    60_000
  );
}
