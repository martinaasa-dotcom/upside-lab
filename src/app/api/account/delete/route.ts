import { dbError } from "@/lib/db-error";
import { createSupabaseServerAuth, requireAuthUser } from "@/lib/supabase/server-auth";
import {
  getSupabaseServer,
  supabaseUsesServiceRole,
} from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { revokeAllUserSessions } from "@/lib/auth/revoke-sessions";
import { getStripe } from "@/lib/stripe";
import { ACTIVE_STATUSES } from "@/lib/billing-status";
import { NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { logEvent } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

/**
 * Self-service account deletion.
 *
 * 1. Revoke every refresh token so other devices cannot mint a new JWT.
 * 2. If this profile has a Stripe subscription on file, cancel it in Stripe
 *    before the row is gone. Without this, someone who deletes their account
 *    while subscribed keeps getting charged every month forever -- the app
 *    row that pointed at the subscription is deleted, but Stripe was never
 *    told to stop, and there is no more /account page to reach "Manage
 *    billing" from afterward. Best-effort: a Stripe failure here is logged
 *    but never blocks the data deletion the person asked for.
 * 3. Calls the security-definer RPC (self-scoped to auth.uid() at the DB
 *    layer) which deletes sheets this user solely owns, steps them off
 *    shared sheets, and removes their profile/lab state/community rows via
 *    cascade. Must run before step 4 — it needs the profile row to still
 *    exist to decide sole-owned vs. shared sheets; auth.users cascading
 *    straight to portfell_profiles would skip that logic and orphan
 *    sole-owned sheets instead of actually deleting them. A BEFORE DELETE
 *    trigger on profiles now also runs the same purge, so a dashboard
 *    deleteUser still scrubs snapshots, cash events, and error-log PII.
 * 4. If SUPABASE_SERVICE_ROLE_KEY is configured, also deletes the
 *    auth.users row itself via the admin API — the sign-in credential is
 *    gone, not just the app data. Without a service-role key this step is
 *    skipped (graceful, not fatal): app data is already fully wiped, the
 *    client signs the session out, and signing back in with the same
 *    Google account just creates a brand-new user with none of this data.
 */
async function handlePOST() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await createSupabaseServerAuth();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const jwt = sessionData.session?.access_token;
  if (jwt && supabaseUsesServiceRole()) {
    const admin = getSupabaseServer();
    if (admin) {
      await admin.auth.admin.signOut(jwt, "global");
    }
  }
  await revokeAllUserSessions(auth.user.id);

  const stripe = getStripe();
  if (stripe) {
    const { data: billingProfile } = await supabase
      .from(PORTFELL_TABLES.profiles)
      .select("stripe_subscription_id, stripe_customer_id")
      .eq("id", auth.user.id)
      .maybeSingle();

    /*
     * Cancel what Stripe says this customer has, not only what our own row
     * remembers.
     *
     * `stripe_subscription_id` is a mirror maintained by the webhook, and a
     * mirror can be wrong -- a webhook that never landed leaves it null
     * while Stripe happily goes on charging. Reading it alone means the
     * one case where our data is stale is also the case where someone is
     * deleted and billed forever, which is the worst possible pairing.
     *
     * So ask Stripe directly for anything still live on this customer, and
     * keep the stored id as a fallback for a profile that has one but no
     * customer id. The aim is "no further charges", and only Stripe knows
     * what would produce one.
     */
    const toCancel = new Set<string>();
    const customerId = billingProfile?.stripe_customer_id;
    if (customerId) {
      try {
        const live = await Promise.all(
          ACTIVE_STATUSES.map((status) =>
            stripe.subscriptions.list({ customer: customerId, status, limit: 100 })
          )
        );
        for (const page of live) {
          for (const s of page.data) toCancel.add(s.id);
        }
      } catch (err) {
        logEvent(
          "account_delete_stripe_list_failed",
          {
            userId: auth.user.id,
            message: err instanceof Error ? err.message : String(err),
          },
          "error"
        );
      }
    }
    if (billingProfile?.stripe_subscription_id) {
      toCancel.add(billingProfile.stripe_subscription_id);
    }

    for (const subscriptionId of toCancel) {
      try {
        await stripe.subscriptions.cancel(subscriptionId);
      } catch (err) {
        // Already canceled, already past_due-and-auto-canceled, etc. are
        // fine -- the goal (no further charges) is already met. Log
        // anything else so a genuine failure (bad API key, network) doesn't
        // vanish silently while the account still gets deleted.
        logEvent(
          "account_delete_stripe_cancel_failed",
          {
            userId: auth.user.id,
            subscriptionId,
            message: err instanceof Error ? err.message : String(err),
          },
          "error"
        );
      }
    }
  }

  const { data, error } = await supabase.rpc("portfell_delete_my_account");
  if (error) {
    return NextResponse.json({ error: dbError(error, "/api/account/delete") }, { status: 500 });
  }

  let authDeleted = false;
  let authDeleteError: string | null = null;
  if (supabaseUsesServiceRole()) {
    const admin = getSupabaseServer();
    const { error: adminError } = admin
      ? await admin.auth.admin.deleteUser(auth.user.id)
      : { error: { message: "Service-role client unavailable" } };
    if (adminError) {
      authDeleteError = adminError.message;
    } else {
      authDeleted = true;
    }
  }

  return NextResponse.json({
    ok: true,
    summary: data,
    authDeleted,
    ...(authDeleteError ? { authDeleteError } : {}),
  });
}

export const POST = observeRoute(handlePOST, "/api/account/delete");
