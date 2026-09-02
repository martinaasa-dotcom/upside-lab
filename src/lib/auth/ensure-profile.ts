import { householdEmailsFor, SEED_EMAIL_SLUGS } from "@/lib/auth/identity";
import { createSupabaseServerAuth } from "@/lib/supabase/server-auth";
import {
  getSupabaseServer,
  supabaseUsesServiceRole,
  type AppSupabaseClient,
} from "@/lib/supabase/server";
import { PORTFELL_TABLES, UPSIDE_CIRCLE_ID } from "@/lib/supabase/tables";
import { safeAvatarUrl } from "@/lib/avatar-url";
import type { User } from "@supabase/supabase-js";

/** Seed slugs from code, plus optional Vercel extras for Karud/Lap. */
function envSeedSlugs(email: string): string[] {
  const e = email.toLowerCase();
  const out = [...(SEED_EMAIL_SLUGS[e] ?? [])];
  const karud = process.env.UPSIDE_SEED_KARUD_EMAIL?.trim().toLowerCase();
  const lap = process.env.UPSIDE_SEED_LAP_EMAIL?.trim().toLowerCase();
  if (karud && karud === e && !out.includes("karud")) out.push("karud");
  if (lap && lap === e && !out.includes("lap")) out.push("lap");
  return out;
}

/**
 * Upsert profile, claim seed portfolios by email (co-owner rows),
 * ensure Upside Circle membership.
 */
export async function ensureProfileAndClaims(user: User): Promise<{
  claimedSlugs: string[];
}> {
  if (supabaseUsesServiceRole()) {
    return claimWithServiceRole(user);
  }
  return claimWithRpc(user);
}

async function claimWithRpc(user: User): Promise<{ claimedSlugs: string[] }> {
  const authClient = await createSupabaseServerAuth();
  if (!authClient) return { claimedSlugs: [] };

  // Prefer an explicit session on this client (post-OAuth exchange) so
  // auth.uid() is present inside the security-definer claim RPC.
  const { data: sessionData } = await authClient.auth.getSession();
  if (!sessionData.session) {
    console.error("portfell_claim_seed_for_me skipped, no server session");
    return { claimedSlugs: [] };
  }

  const { data, error } = await authClient.rpc("portfell_claim_seed_for_me");
  if (error) {
    console.error("portfell_claim_seed_for_me failed", error.message);
    return { claimedSlugs: [] };
  }
  const { error: syncErr } = await authClient.rpc(
    "portfell_sync_household_community_memberships"
  );
  if (syncErr) {
    console.error(
      "portfell_sync_household_community_memberships failed",
      syncErr.message
    );
  }
  const claimed = Array.isArray((data as { claimed?: unknown })?.claimed)
    ? ((data as { claimed: string[] }).claimed ?? [])
    : [];
  void user;
  return { claimedSlugs: claimed };
}

/** Every slug waiting on this address: the claims table plus the env extras. */
async function seedSlugsFor(
  admin: AppSupabaseClient,
  email: string
): Promise<string[]> {
  const { data, error } = await admin
    .from(PORTFELL_TABLES.seedClaims)
    .select("portfolio_slug")
    .eq("email", email);

  if (error) {
    console.error("seed claims lookup failed", error.message);
  }

  return [
    ...new Set([
      ...((data ?? []) as { portfolio_slug: string }[]).map(
        (c) => c.portfolio_slug
      ),
      ...envSeedSlugs(email),
    ]),
  ];
}

/**
 * Add this account as a co-owner of every seed portfolio waiting on it.
 *
 * One select for the whole list and one upsert for the whole list, rather
 * than a pair of round trips per slug: a seed household has several each,
 * and this runs while somebody is watching a blank screen.
 */
async function claimSeedPortfolios(
  admin: AppSupabaseClient,
  userId: string,
  slugs: string[],
  now: string
): Promise<string[]> {
  if (!slugs.length) return [];

  const { data: sheets, error: readErr } = await admin
    .from(PORTFELL_TABLES.portfolios)
    .select("id, slug, owner_id")
    .in("slug", slugs);

  if (readErr) {
    console.error("seed portfolio lookup failed", readErr.message);
    return [];
  }

  const rows = (sheets ?? []) as {
    id: string;
    slug: string;
    owner_id: string | null;
  }[];
  if (!rows.length) return [];

  const unowned = rows.filter((r) => !r.owner_id).map((r) => r.id);

  const [{ error }] = await Promise.all([
    admin.from(PORTFELL_TABLES.portfolioOwners).upsert(
      rows.map((r) => ({ portfolio_id: r.id, user_id: userId })),
      { onConflict: "portfolio_id,user_id" }
    ),
    // Keep the first claimant as the primary owner_id. The `is null` is the
    // question the per-slug read used to ask, asked of the database instead,
    // so a second claimant landing between that read and this write cannot
    // take an owner the first one had just been given.
    unowned.length
      ? admin
          .from(PORTFELL_TABLES.portfolios)
          .update({ owner_id: userId, updated_at: now })
          .in("id", unowned)
          .is("owner_id", null)
      : Promise.resolve({ error: null }),
  ]);

  if (error) {
    console.error(
      "portfolio owner upsert failed",
      slugs.join(", "),
      error.message
    );
    return [];
  }

  // Answered in the order the slugs were claimed in, which is the claims
  // table and then the env extras, never the order the rows came back in.
  const found = new Set(rows.map((r) => r.slug));
  return slugs.filter((slug) => found.has(slug));
}

async function syncHouseholdCommunities(
  admin: AppSupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await admin.rpc(
    "portfell_sync_household_community_memberships",
    { p_user_id: userId }
  );
  if (error) {
    console.error(
      "portfell_sync_household_community_memberships failed",
      error.message
    );
  }
}

async function claimWithServiceRole(user: User): Promise<{
  claimedSlugs: string[];
}> {
  const admin = getSupabaseServer();
  if (!admin) return { claimedSlugs: [] };

  const email = (user.email ?? "").trim().toLowerCase();
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const displayName =
    (typeof meta?.full_name === "string" && meta.full_name) ||
    (typeof meta?.name === "string" && meta.name) ||
    email.split("@")[0] ||
    "Investor";
  const avatarUrl =
    typeof meta?.avatar_url === "string"
      ? meta.avatar_url
      : typeof meta?.picture === "string"
        ? meta.picture
        : null;
  const now = new Date().toISOString();

  /*
    Three requests with nothing to say to each other, so they go out
    together rather than one after the next: the profile row, the claims
    that name the seed portfolios waiting on this address, and the lab
    state row. This step runs where a session begins, which is somebody
    waiting on a blank screen, so the round trips are the whole of its cost.

    The lab row is an upsert that ignores duplicates, which is an insert
    that does nothing on a conflict: an existing row keeps its conviction
    notes and its watchlist, exactly as the read and then write it replaces
    did, in one request instead of two.
  */
  const [, slugs] = await Promise.all([
    admin.from(PORTFELL_TABLES.profiles).upsert(
      {
        id: user.id,
        email: email || null,
        display_name: displayName,
        // The same short list of hosts a person may type in Account. Google
        // hands back its own photo host, so this is not a filter on Google;
        // it is one place deciding where a profile photo may come from.
        avatar_url: avatarUrl ? safeAvatarUrl(avatarUrl) : null,
        updated_at: now,
      },
      { onConflict: "id" }
    ),
    email ? seedSlugsFor(admin, email) : Promise.resolve<string[]>([]),
    admin.from(PORTFELL_TABLES.labState).upsert(
      {
        id: user.id,
        owner_id: user.id,
        conviction: {},
        updated_at: now,
      },
      { onConflict: "id", ignoreDuplicates: true }
    ),
  ]);

  const isMartin =
    email === "martin.aasa@upthink.ee" || email === "aasamartinaasa@gmail.com";

  /*
    Deliberately no auto-join to any community (including Upside Circle)
    here. Community membership is opt-in only, via an invite link (private
    communities) or a request an admin approves (public communities). See
    /api/communities/[id]/join-request. Signing in must never silently
    expose a stranger's book to an existing community or vice versa.
    Household pairs (Martin/Amanda, Rasmus/Karoliine) are the exception:
    if a partner is already in a circle, copy that membership so both
    logins see the same groups. Never creates a new stranger join.

    The second wave, for the same reason as the first: the claim's own
    read, that household sync and the circle's created_by have nothing to
    say to one another either. The sync waits for the wave above rather
    than joining it, because it reads this account's profile row to find
    the address it syncs on.
  */
  const [claimedSlugs] = await Promise.all([
    claimSeedPortfolios(admin, user.id, slugs, now),
    householdEmailsFor(email).length > 1
      ? syncHouseholdCommunities(admin, user.id)
      : null,
    isMartin
      ? admin
          .from(PORTFELL_TABLES.communities)
          .update({ created_by: user.id, updated_at: now })
          .eq("id", UPSIDE_CIRCLE_ID)
          .is("created_by", null)
      : null,
  ]);

  return { claimedSlugs };
}
