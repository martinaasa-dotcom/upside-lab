import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { readAll } from "@/lib/supabase/read-all";
import { NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";

/*
  One count per community, a few at a time.

  `head: true` asks the database for the number and sends no rows back, so
  each of these is cheap; what would not be cheap is firing one per public
  community at once, so they go in small waves. If the public list ever
  grows past browsing size, the answer is a grouped aggregate behind an
  RPC rather than a wider wave here.
*/
const COUNT_WAVE = 8;

async function countMembers(
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseDataClient>>>,
  ids: string[]
): Promise<[string, number][]> {
  const out: [string, number][] = [];
  for (let i = 0; i < ids.length; i += COUNT_WAVE) {
    const wave = await Promise.all(
      ids.slice(i, i + COUNT_WAVE).map(async (id) => {
        const { count } = await supabase
          .from(PORTFELL_TABLES.communityMembers)
          .select("community_id", { count: "exact", head: true })
          .eq("community_id", id);
        return [id, count ?? 0] as [string, number];
      })
    );
    out.push(...wave);
  }
  return out;
}

/** Public communities the caller hasn't joined yet, for a "discover" list —
 * plus their own pending/rejected request state on each, if any. Private
 * communities never appear here; they stay invite-only. */
async function handleGET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ communities: [] });
  }

  /*
    Both paged. The caller's own memberships decide which communities are
    filtered out of the list, so a short read offers somebody a community
    they are already in; the public list is the list itself, and
    PostgREST stops at db-max-rows without saying so.
  */
  const [memberships, publicCommunities] = await Promise.all([
    readAll<{ community_id: string }>(() =>
      supabase
        .from(PORTFELL_TABLES.communityMembers)
        .select("community_id")
        .eq("user_id", auth.user.id)
    ),
    readAll<{
      id: string;
      name: string;
      house_note: string | null;
      created_at: string;
    }>(() =>
      supabase
        .from(PORTFELL_TABLES.communities)
        .select("id, name, house_note, created_at")
        .eq("visibility", "public")
        .order("name")
    ),
  ]);

  const memberOf = new Set(memberships.map((m) => m.community_id));
  const candidates = publicCommunities.filter((c) => !memberOf.has(c.id));

  if (candidates.length === 0) {
    return NextResponse.json({ communities: [] });
  }

  const candidateIds = candidates.map((c) => c.id);

  /*
    The member counts are counted by the database, not by fetching every
    member row and adding them up in JavaScript. Counting by fetching is
    wrong twice over: the number it produces is capped by db-max-rows, so
    a community past the cap reports fewer members than it has, and it
    drags every member row of every public community across the wire to
    render one integer each. `head: true` sends no rows at all.
  */
  const [{ data: requests }, counted] = await Promise.all([
    supabase
      .from(PORTFELL_TABLES.communityJoinRequests)
      .select("community_id, status")
      .eq("user_id", auth.user.id)
      .in("community_id", candidateIds),
    countMembers(supabase, candidateIds),
  ]);

  const requestStatusByCommunity = new Map(
    ((requests ?? []) as { community_id: string; status: string }[]).map(
      (r) => [r.community_id, r.status]
    )
  );
  const memberCountByCommunity = new Map<string, number>(counted);

  return NextResponse.json({
    communities: candidates.map((c) => ({
      id: c.id,
      name: c.name,
      houseNote: c.house_note,
      memberCount: memberCountByCommunity.get(c.id) ?? 0,
      requestStatus: requestStatusByCommunity.get(c.id) ?? null,
    })),
  });
}

export const GET = observeRoute(handleGET, '/api/communities/discover');
