import { supabaseFetch } from "@/lib/supabase/http";
import { revokeAllUserSessions } from "@/lib/auth/revoke-sessions";
import { supabaseServiceRoleKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Revoke every refresh token for every Auth user.
 *
 * The one honest caveat, and it is the same one `revokeAllUserSessions`
 * carries: **this does not sign anybody out on the spot.** Supabase access
 * tokens are stateless JWTs, so a session already holding one keeps working
 * until it expires (an hour by default) and only then fails to refresh. A
 * run of this lands unevenly across the following hour rather than all at
 * once. Anything promising an instant global logout would need a
 * revocation check on every request, which this app does not have.
 *
 * Deliberately paginated and sequential-ish rather than one big fan-out:
 * this is a loop of admin writes against the Auth server, and firing
 * hundreds at once is how you get rate-limited into a partial run that is
 * worse than no run, because you cannot tell which half it got.
 */

/** Admin list endpoint caps at 1000; 200 keeps each round trip small. */
const PAGE_SIZE = 200;
/** How many logout calls are in flight at once. Politeness, not speed. */
const BATCH = 10;

export type SignOutEveryoneResult = {
  /** Users seen while walking the admin list. */
  scanned: number;
  /** Users whose refresh tokens were revoked without an error. */
  revoked: number;
  /** Users the Auth server refused or errored on. */
  failed: number;
  /** True if the walk stopped early because a page request failed. */
  incomplete: boolean;
};

type AdminUser = { id?: unknown };

/**
 * Pull the user ids out of an admin-list page.
 *
 * Exported for the test rather than for a second caller. This is the one
 * place a silent wrong answer is possible: a payload shape that does not
 * match yields an empty list, the walk stops, and the run reports a clean
 * zero. "Signed out nobody, successfully" and "there was nobody to sign
 * out" look identical from the outside, and only one of them is fine.
 */
export function idsFrom(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const users = (payload as { users?: unknown }).users;
  if (!Array.isArray(users)) return [];
  return users
    .map((u) => (u as AdminUser)?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

export async function signOutEveryone(): Promise<SignOutEveryoneResult> {
  const url = supabaseUrl();
  const key = supabaseServiceRoleKey();
  const result: SignOutEveryoneResult = {
    scanned: 0,
    revoked: 0,
    failed: 0,
    incomplete: false,
  };
  if (!url || !key) {
    result.incomplete = true;
    return result;
  }

  for (let page = 1; ; page += 1) {
    let ids: string[];
    try {
      const res = await supabaseFetch(
        `${url}/auth/v1/admin/users?page=${page}&per_page=${PAGE_SIZE}`,
        { headers: { Authorization: `Bearer ${key}`, apikey: key } }
      );
      if (!res.ok) {
        result.incomplete = true;
        break;
      }
      ids = idsFrom(await res.json().catch(() => null));
    } catch {
      result.incomplete = true;
      break;
    }

    if (ids.length === 0) break;
    result.scanned += ids.length;

    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH);
      const outcomes = await Promise.allSettled(
        slice.map((id) => revokeAllUserSessions(id))
      );
      for (const o of outcomes) {
        // `revokeAllUserSessions` swallows its own errors by design (it is
        // best-effort ahead of a delete), so a rejection here is the
        // unexpected case rather than the normal failure path.
        if (o.status === "fulfilled") result.revoked += 1;
        else result.failed += 1;
      }
    }

    // A short page means the list is exhausted.
    if (ids.length < PAGE_SIZE) break;
  }

  return result;
}
