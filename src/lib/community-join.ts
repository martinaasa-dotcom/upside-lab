import { provisionClassroomSheet } from "@/lib/classroom";
import { shareOwnedSheetsIntoCommunity } from "@/lib/community-share";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import type { SupabaseClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any -- the routes hand us
   their own already-typed client; this file only names tables on it. */
type Db = SupabaseClient<any, any, any>;

/**
 * Let somebody into a community: the member row, the class portfolio if
 * this is a class, whatever they chose to share, and the request stamped
 * decided.
 *
 * It lives here because two callers do exactly this and they must not
 * drift: an admin pressing Approve, and a public circle whose admin has
 * said arrivals need no approval. The second is the one worth being
 * careful about, so the rule is written where both can see it: **the
 * member row is only ever written from an approval**, whether a person
 * made it just now or the circle's own setting made it in advance. There
 * is still no path that joins anybody who did not ask.
 */
export async function admitToCommunity(
  supabase: Db,
  {
    communityId,
    userId,
    sharePortfolioIds,
    decidedBy,
  }: {
    communityId: string;
    userId: string;
    sharePortfolioIds: string[] | null;
    decidedBy: string;
  }
): Promise<{ error: unknown } | { error: null }> {
  const { error: memberErr } = await supabase
    .from(PORTFELL_TABLES.communityMembers)
    .insert({ community_id: communityId, user_id: userId, role: "member" });
  if (memberErr) return { error: memberErr };

  await provisionClassroomSheet(supabase, { communityId, userId });
  await shareOwnedSheetsIntoCommunity(supabase, {
    communityId,
    userId,
    portfolioIds: sharePortfolioIds,
  });

  const { error } = await supabase
    .from(PORTFELL_TABLES.communityJoinRequests)
    .update({
      status: "approved",
      decided_at: new Date().toISOString(),
      decided_by: decidedBy,
    })
    .eq("community_id", communityId)
    .eq("user_id", userId);
  if (error) return { error };
  return { error: null };
}
