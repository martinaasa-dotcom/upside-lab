import {
  checkRateLimit,
  markRateLimited,
  type RateLimitResult,
} from "@/lib/rate-limit";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { isRecord, readFiniteNumber } from "@/lib/unknown";

/**
 * In-memory first (cheap), then the Postgres bucket so two warm instances
 * cannot each serve a full LLM quota. If the RPC is missing or down, the
 * memory result stands. Never fail closed on infra.
 */
export async function takeDurableRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const mem = checkRateLimit(key, limit, windowMs);
  if (!mem.ok) return mem;
  if (!supabaseUsesServiceRole()) return mem;
  const admin = getSupabaseServer();
  if (!admin) return mem;
  try {
    const { data, error } = await admin.rpc("portfell_rate_take", {
      p_key: key,
      p_limit: limit,
      p_window_ms: windowMs,
    });
    if (error || data == null) return mem;
    if (!isRecord(data) || data.ok !== false) return mem;
    const retry = readFiniteNumber(data.retryAfterSec);
    const retryAfterSec = retry != null && retry > 0 ? Math.ceil(retry) : 60;
    // Remember the shared verdict, the same way the weighted sibling does.
    // Without it an instance that has never personally refused this caller
    // pays a database round trip on every one of their requests to be told
    // the same no, and the callers this path guards (Margus, forecast,
    // Pulse, the full export) are exactly the ones a script hammers.
    markRateLimited(key, retryAfterSec);
    return { ok: false, retryAfterSec };
  } catch {
    return mem;
  }
}

/**
 * The same shared bucket, charged by what a call actually costs.
 *
 * `takeDurableRateLimit` counts calls, which is right when every call costs
 * the same. It is wrong for the market endpoints: a quote request's cost is
 * per ticker, and an unresolvable ticker costs ~52 upstream provider calls
 * on its own. Counting requests cannot distinguish a phone refreshing one
 * holding from a script inventing a hundred symbols.
 *
 * Two differences from the unweighted version, both deliberate:
 *
 * - **The memory bucket is charged the same weight**, so a single instance
 *   still refuses locally without a round trip once a caller has spent its
 *   budget here.
 * - **A refusal from Postgres is written back into memory.** The durable
 *   bucket is shared across instances but the memory one is not, so without
 *   this an instance that has never personally refused a caller would keep
 *   paying for a database round trip to be told the same no. With it, each
 *   instance learns once.
 *
 * Fails open on infra trouble, exactly like its sibling: a limiter that
 * takes the site down when the database hiccups is worse than the abuse it
 * prevents.
 *
 * @param cost Units to consume. 0 peeks without charging.
 */
export async function takeDurableRateLimitWeighted(
  key: string,
  limit: number,
  windowMs: number,
  cost: number
): Promise<RateLimitResult> {
  const mem = checkRateLimit(key, limit, windowMs, cost);
  if (!mem.ok) return mem;
  if (!supabaseUsesServiceRole()) return mem;
  const admin = getSupabaseServer();
  if (!admin) return mem;
  try {
    const { data, error } = await admin.rpc("portfell_rate_take_weighted", {
      p_key: key,
      p_limit: limit,
      p_window_ms: windowMs,
      p_cost: cost,
    });
    if (error || data == null) return mem;
    if (!isRecord(data) || data.ok !== false) return mem;
    const retry = readFiniteNumber(data.retryAfterSec);
    const retryAfterSec = retry != null && retry > 0 ? Math.ceil(retry) : 60;
    // Remember the shared verdict so this instance stops asking.
    markRateLimited(key, retryAfterSec);
    return { ok: false, retryAfterSec };
  } catch {
    return mem;
  }
}
