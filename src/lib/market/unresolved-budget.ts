import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { takeDurableRateLimitWeighted } from "@/lib/rate-limit-durable";
import type { RateLimitResult } from "@/lib/rate-limit";

/**
 * A shared budget for the one market operation that is genuinely expensive:
 * looking up a symbol that resolves nowhere.
 *
 * ## Why not simply limit requests per IP
 *
 * There already is such a limit -- `limitPublicMarketRequest`, 120 requests
 * a minute. It has two problems, and only one of them is fixable by turning
 * the number down.
 *
 * The first is that it lives in memory, so on Vercel each warm instance
 * keeps its own count and the real allowance is 120 times however many
 * instances happen to be up. That is the fixable half, and this module
 * fixes it by putting the count in Postgres where every instance shares it.
 *
 * The second is that **requests are the wrong unit**. Pass 4 measured a
 * single unauthenticated GET costing 1,718 upstream Yahoo calls, because
 * cost is per ticker and an unresolvable ticker walks 16 European exchange
 * suffixes at two calls each. Under a request limiter that is one request
 * out of 120. Turning the limit down does not help: the same damage fits in
 * one request.
 *
 * ## Why the budget is not "tickers per IP"
 *
 * That was the obvious next idea and it is wrong for this product
 * specifically. A classroom is a first-class feature here, and a school
 * puts thirty students behind one NAT address. Thirty students with twenty
 * holdings each, refreshing, is thousands of perfectly legitimate ticker
 * lookups per minute from a single IP. A ticker budget would take the
 * classroom offline and leave the abuse case largely intact, since an
 * attacker can simply use more addresses.
 *
 * So the budget counts the thing the abuser does and the classroom does
 * not: **names that resolve nowhere and were not already known to be dead.**
 * Thirty students looking up real listings spend nothing from this budget.
 * A script inventing symbols spends all of it, because every invented
 * symbol is a fresh full-cost walk.
 *
 * Three properties follow, all of them wanted:
 *
 * - **Ordinary use never touches the database.** The charge only happens on
 *   requests carrying a name no cache can vouch for, which for real books
 *   is almost never: every holding somebody in the product has priced in
 *   the last week is in the shared quote cache. No round trip is added to
 *   the hot path.
 * - **Repeats are free, so honest mistakes are cheap.** A CSV with a typo
 *   in it costs its dead names once. Every later refresh finds them in the
 *   negative cache and is charged nothing, because it costs nothing.
 * - **The charge is settled before the walk, not after it.** It used to be
 *   levied against work already done, which is honest and useless: a
 *   request's whole walk happens at once, so a hundred and twenty invented
 *   symbols had already been paid for by the time the bill arrived, and
 *   the address only went over budget for the *next* request. What is
 *   charged now is the set of names about to cost a full walk apiece,
 *   which `namesThatWouldWalk` works out from the caches for nothing.
 */

/**
 * Dead names per address per window. Far above any honest accident -- a
 * whole import file of typos costs a fraction of this -- and far below the
 * volume that makes scraping worthwhile. At the ceiling an address can
 * provoke roughly `LIMIT * 52` upstream calls per window instead of an
 * unbounded number.
 */
export const UNRESOLVED_LIMIT = 40;
export const UNRESOLVED_WINDOW_MS = 10 * 60 * 1000;

function budgetKey(req: Request): string {
  return `mkt-dead:${clientIp(req)}`;
}

/**
 * How long an instance may reuse a shared "this address is fine" answer
 * before asking again.
 *
 * This is the whole trick. An authoritative check is a database round
 * trip; doing one per request would put Postgres in front of every quote
 * the product serves. But the answer barely changes minute to minute, and
 * the case that must never be stale -- a refusal -- does not depend on it
 * at all, because a refusal is written into memory and memory is consulted
 * first. So only the "yes, fine" answer is cached, and only briefly.
 *
 * Cost works out at one round trip per address per instance per minute,
 * instead of one per request. For a classroom of thirty students sharing
 * one NAT address that is a single query a minute, not thousands.
 */
const SHARED_OK_TTL_MS = 60_000;
const MAX_VERDICTS = 5_000;

/** address key -> epoch ms until which the shared bucket's "ok" stands. */
const sharedOkUntil = new Map<string, number>();

function rememberSharedOk(key: string, now: number) {
  if (sharedOkUntil.size >= MAX_VERDICTS) {
    for (const [k, until] of sharedOkUntil) {
      if (until <= now) sharedOkUntil.delete(k);
    }
    if (sharedOkUntil.size >= MAX_VERDICTS) {
      const oldest = sharedOkUntil.keys().next().value;
      if (oldest !== undefined) sharedOkUntil.delete(oldest);
    }
  }
  sharedOkUntil.set(key, now + SHARED_OK_TTL_MS);
}

/**
 * Is this address already over budget? Charges nothing.
 *
 * Three layers, cheapest first, and the order is what makes this both
 * correct and affordable:
 *
 * 1. **Local memory.** A refusal already known to this instance is
 *    returned immediately. Refusals are written here by
 *    `takeDurableRateLimitWeighted`, so this layer is never stale in the
 *    direction that matters.
 * 2. **A cached shared "ok"**, good for `SHARED_OK_TTL_MS`. This is what
 *    keeps the hot path free for honest callers.
 * 3. **The shared bucket in Postgres**, consulted only when neither of the
 *    above can answer -- an address this instance has not vouched for in
 *    the last minute.
 *
 * This closes the gap an earlier version of this module documented and
 * left open: back then the peek was memory-only, so a cold instance handed
 * an abusive caller one free request before learning anything, and an
 * attacker could farm one request per instance. Now a cold instance asks
 * the shared bucket before serving anyone it cannot vouch for, so that
 * per-instance freebie is gone.
 *
 * Notably this needed no Redis or KV. The reason the obvious version of
 * this was unaffordable was that it asked per *request*; asking per
 * *address per minute* is the same guarantee at a tiny fraction of the
 * cost, because the answer being cached is only ever the permissive one.
 */
export async function checkUnresolvedBudget(
  req: Request
): Promise<RateLimitResult> {
  const key = budgetKey(req);
  const now = Date.now();

  // 1. A refusal this instance already knows about. Free, and authoritative.
  const local = checkRateLimit(key, UNRESOLVED_LIMIT, UNRESOLVED_WINDOW_MS, 0);
  if (!local.ok) return local;

  // 2. A shared "ok" we are still entitled to reuse.
  const until = sharedOkUntil.get(key);
  if (until != null && now < until) return { ok: true };

  // 3. Ask the shared bucket. A refusal here is written into local memory
  //    by the durable helper, so step 1 answers for the rest of the window.
  const shared = await takeDurableRateLimitWeighted(
    key,
    UNRESOLVED_LIMIT,
    UNRESOLVED_WINDOW_MS,
    0
  );
  if (shared.ok) rememberSharedOk(key, now);
  return shared;
}

/** Test seam: forget every cached shared verdict. */
export function resetUnresolvedBudgetForTests() {
  sharedOkUntil.clear();
}

/**
 * Bill an address for the names its request is about to walk, and say
 * whether it may.
 *
 * No-op when there are none, which is the overwhelmingly common case and
 * the reason this costs nothing in normal use: a real portfolio's names are
 * all in the shared quote cache, so there is nothing to charge for and no
 * round trip to make. This is the only call in the pair that reaches
 * Postgres, and it reaches it precisely when something expensive is about
 * to happen.
 *
 * A refusal means the caller must stop before contacting a provider. The
 * bucket has still been charged, which is deliberate: an address that keeps
 * asking for the same expensive thing keeps paying for it.
 */
export async function chargeUnresolvedBudget(
  req: Request,
  names: readonly string[]
): Promise<RateLimitResult> {
  if (names.length === 0) return { ok: true };
  const key = budgetKey(req);
  const result = await takeDurableRateLimitWeighted(
    key,
    UNRESOLVED_LIMIT,
    UNRESOLVED_WINDOW_MS,
    names.length
  );
  if (!result.ok) {
    // Do not keep vouching for an address the shared bucket just refused.
    // `takeDurableRateLimitWeighted` has already written the refusal into
    // local memory, so this is belt and braces rather than the only guard
    // -- but it means the cache can never disagree with the bucket.
    sharedOkUntil.delete(key);
  }
  return result;
}
