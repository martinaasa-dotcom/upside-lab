import { householdEmailsFor, SEED_EMAIL_SLUGS } from "@/lib/auth/identity";
import { createSupabaseServerAuth } from "@/lib/supabase/server-auth";
import {
  getSupabaseServer,
  supabaseUsesServiceRole,
} from "@/lib/supabase/server";
import { PORTFELL_TABLES, UPSIDE_CIRCLE_ID } from "@/lib/supabase/tables";
import { safeHttpUrl } from "@/lib/safe-url";
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

  await admin.from(PORTFELL_TABLES.profiles).upsert(
    {
      id: user.id,
      email: email || null,
      display_name: displayName,
      avatar_url: avatarUrl
        ? safeHttpUrl(avatarUrl, { httpsOnly: true })
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  const claimedSlugs: string[] = [];
  if (email) {
    const { data: claims, error: claimsErr } = await admin
      .from(PORTFELL_TABLES.seedClaims)
      .select("portfolio_slug")
      .eq("email", email);

    if (claimsErr) {
      console.error("seed claims lookup failed", claimsErr.message);
    }

    const slugs = new Set<string>([
      ...((claims ?? []) as { portfolio_slug: string }[]).map(
        (c) => c.portfolio_slug
      ),
      ...envSeedSlugs(email),
    ]);

    for (const slug of slugs) {
      const { data: sheet } = await admin
        .from(PORTFELL_TABLES.portfolios)
        .select("id, owner_id")
        .eq("slug", slug)
        .maybeSingle();
      if (!sheet) continue;

      const portfolioId = (sheet as { id: string; owner_id?: string | null }).id;

      // Keep first claimant as primary owner_id; always add junction row.
      if (!(sheet as { owner_id?: string | null }).owner_id) {
        await admin
          .from(PORTFELL_TABLES.portfolios)
          .update({
            owner_id: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", portfolioId);
      }

      const { error } = await admin.from(PORTFELL_TABLES.portfolioOwners).upsert(
        { portfolio_id: portfolioId, user_id: user.id },
        { onConflict: "portfolio_id,user_id" }
      );
      if (error) {
        console.error("portfolio owner upsert failed", slug, error.message);
      } else if (!claimedSlugs.includes(slug)) {
        claimedSlugs.push(slug);
      }
    }
  }

  const { data: lab } = await admin
    .from(PORTFELL_TABLES.labState)
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!lab) {
    await admin.from(PORTFELL_TABLES.labState).upsert(
      {
        id: user.id,
        owner_id: user.id,
        conviction: {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
  }

  // Deliberately no auto-join to any community (including Upside Circle)
  // here. Community membership is opt-in only, via an invite link (private
  // communities) or a request an admin approves (public communities). See
  // /api/communities/[id]/join-request. Signing in must never silently
  // expose a stranger's book to an existing community or vice versa.
  // Household pairs (Martin/Amanda, Rasmus/Karoliine) are the exception:
  // if a partner is already in a circle, copy that membership so both
  // logins see the same groups. Never creates a new stranger join.
  if (householdEmailsFor(email).length > 1) {
    const { error: syncErr } = await admin.rpc(
      "portfell_sync_household_community_memberships",
      { p_user_id: user.id }
    );
    if (syncErr) {
      console.error(
        "portfell_sync_household_community_memberships failed",
        syncErr.message
      );
    }
  }

  const isMartin =
    email === "martin.aasa@upthink.ee" || email === "aasamartinaasa@gmail.com";
  if (isMartin) {
    await admin
      .from(PORTFELL_TABLES.communities)
      .update({ created_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", UPSIDE_CIRCLE_ID)
      .is("created_by", null);
  }

  return { claimedSlugs };
}
