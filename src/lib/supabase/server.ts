import { createClient } from "@supabase/supabase-js";
import type { AppSupabaseClient } from "@/lib/supabase/client-types";
import type { Database } from "@/lib/supabase/database.types";
import { supabaseFetch } from "@/lib/supabase/http";
import { createSupabaseServerAuth } from "@/lib/supabase/server-auth";
import {
  supabaseAnonKey,
  supabaseServiceRoleKey,
  supabaseUrl,
} from "@/lib/supabase/env";

export type { AppSupabaseClient };

let cached: { url: string; key: string; client: AppSupabaseClient } | null =
  null;

/**
 * A test run must never reach a real database, and on 2 September 2026 it
 * did, three times, and mailed a human about it.
 *
 * `critical-path.test.ts` hands `applyPortfolioCashDelta` a stub whose RPC
 * answers `{ error: { message: "boom" } }`, which is exactly the right way
 * to test the failure path. What nothing in that test can see is that the
 * failure path calls `logError`, which does not take a client: it builds
 * its own from `process.env`. On a developer's machine, in this repo's own
 * agent containers, and anywhere else `SUPABASE_SERVICE_ROLE_KEY` is set
 * for the app to run, that is the production project. So every `npx vitest
 * run` inserted three rows reading "portfell_apply_cash_delta failed: boom"
 * into the live `portfell_error_log`, the daily digest saw a class it had
 * not seen the day before, and Martin got an alert about a test fixture.
 *
 * The insert is best-effort and swallows its own failures, so this was
 * silent in both directions: nothing in the test run said a write had
 * happened, and nothing in production said the row was not real.
 *
 * The general shape is worse than the instance. Any function that builds
 * its own client from the environment is a live write hiding inside a pure
 * looking call, and a test cannot mock what it is not passed. So the guard
 * is here, at the one place a client is made, rather than in `logError`:
 * under a test runner there is no client, which is the same answer this
 * function already gives on a machine with no credentials, and every caller
 * handles it because that case has always existed. A test that wants a
 * client passes one in, as they all already do.
 */
function underTest(): boolean {
  return (
    Boolean(process.env.VITEST) ||
    Boolean(process.env.UPSIDE_TEST_RUNNER) ||
    process.env.NODE_ENV === "test"
  );
}

/**
 * Server Supabase client. Prefer service role so RLS can deny anon writes;
 * fall back to anon for read-only / legacy setups.
 *
 * One client per isolate. supabase-js talks HTTP to PostgREST, which already
 * uses the transaction-mode pooler. Reusing the client keeps fetch sockets
 * pooled across Fluid Compute invocations; a timeout on every call means a
 * hung request cannot pin a pooler slot.
 */
export function getSupabaseServer(): AppSupabaseClient | null {
  if (underTest()) return null;
  const url = supabaseUrl();
  const serviceKey = supabaseServiceRoleKey();
  const anonKey = supabaseAnonKey();
  const key = serviceKey || anonKey;
  if (!url || !key) return null;
  if (cached && cached.url === url && cached.key === key) return cached.client;
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: supabaseFetch },
  });
  cached = { url, key, client };
  return client;
}

export function supabaseUsesServiceRole(): boolean {
  return Boolean(supabaseServiceRoleKey());
}

/**
 * Data client for API routes: service role when configured, otherwise the
 * signed-in user's cookie session (so RLS + owner_id filters both work).
 */
export async function getSupabaseDataClient(): Promise<AppSupabaseClient | null> {
  if (supabaseUsesServiceRole()) return getSupabaseServer();
  return createSupabaseServerAuth();
}
