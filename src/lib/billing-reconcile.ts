import { getStripe, stripeSubscriptionFields, CLEARED_BILLING_PATCH } from "@/lib/stripe";
import { ACTIVE_STATUSES, isActiveSubscription } from "@/lib/billing-status";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { readAll } from "@/lib/supabase/read-all";
import { logError } from "@/lib/error-log";
import { logEvent } from "@/lib/telemetry";

export type BillingReconcileResult = {
  status?: number;
  checked: number;
  corrected: number;
  error?: string;
};

/**
 * Self-healing backstop for the Stripe webhook. The webhook is the only
 * writer of these columns in normal operation, but Stripe does not
 * guarantee delivery -- an endpoint outage, a Vercel deploy mid-event, or a
 * dropped retry can leave `portfell_profiles.subscription_status` stale.
 * Nothing gates on that value today (Pro unlocks nothing), so drift is
 * silent rather than user-visible, which is exactly the condition under
 * which it can go unnoticed for a long time. This walks every profile that
 * has a Stripe customer and re-derives its status from Stripe directly,
 * the same source of truth the webhook itself trusts.
 */
export async function reconcileBillingSubscriptions(): Promise<BillingReconcileResult> {
  const stripe = getStripe();
  if (!stripe) {
    return { status: 400, checked: 0, corrected: 0, error: "Stripe not configured" };
  }
  const supabase = getSupabaseServer();
  if (!supabase) {
    return { status: 500, checked: 0, corrected: 0, error: "Supabase not configured" };
  }

  /*
    Every paying account, so it is paged.

    A reconcile that silently sees the first thousand customers leaves the
    rest on whatever status the last webhook happened to set: somebody who
    cancelled keeps Pro, somebody whose payment recovered stays locked out,
    and the run reports a clean pass either way. `"throw"` rather than
    `"stop"`, because reconciling part of the list and calling it done is
    worse than saying the read failed.
  */
  let profiles: unknown[];
  try {
    profiles = await readAll<unknown>(
      () =>
        supabase
          .from(PORTFELL_TABLES.profiles)
          .select(
            "id, stripe_customer_id, stripe_subscription_id, subscription_status"
          )
          .not("stripe_customer_id", "is", null)
          .order("id"),
      "throw"
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "read failed";
    // The whole backstop did nothing this run; that is a row, not a line.
    await logError({
      source: "server",
      message: `Billing reconcile could not read the subscribed profiles: ${message}`,
      path: "/api/cron/billing-reconcile",
      event: "billing_reconcile_query_failed",
    });
    return { status: 500, checked: 0, corrected: 0, error: message };
  }

  const rows = profiles as {
    id: string;
    stripe_customer_id: string;
    stripe_subscription_id: string | null;
    subscription_status: string | null;
  }[];

  let corrected = 0;

  for (const row of rows) {
    try {
      /*
       * Ask for the statuses that mean "Stripe is still charging this
       * person" first, and only fall back to the newest of any status when
       * there is genuinely no live subscription.
       *
       * Taking the single newest subscription of *any* status -- which is
       * what this did -- is wrong in a way that costs a real customer their
       * plan. Stripe lists newest first and `status: "all"` includes
       * `incomplete` and `incomplete_expired`. A first-time subscriber who
       * opens Upgrade in two tabs completes one and abandons the other; the
       * abandoned session leaves a subscription that expires unpaid, created
       * *after* the one they actually paid for. This backstop would then
       * find the failed one, decide the profile had drifted, and overwrite a
       * genuinely active subscription with `incomplete_expired`.
       *
       * That is worse than the drift it exists to repair: the webhook had
       * recorded the truth and the repair job replaced it with a lie.
       *
       * The checkout route already learned this lesson -- see its comment
       * about not taking "the 5 most recent of any status" -- and queries
       * ACTIVE_STATUSES explicitly. This now matches it, so the two cannot
       * disagree about what counts as a live subscription.
       */
      const live = await Promise.all(
        ACTIVE_STATUSES.map((status) =>
          stripe.subscriptions.list({
            customer: row.stripe_customer_id,
            status,
            limit: 1,
          })
        )
      );
      let subscription = live
        .flatMap((page) => page.data)
        .find((s) => isActiveSubscription(s.status));

      if (!subscription) {
        // No live subscription. Now the newest of any status is the right
        // answer -- it describes how this customer's billing actually ended.
        const recent = await stripe.subscriptions.list({
          customer: row.stripe_customer_id,
          status: "all",
          limit: 1,
        });
        subscription = recent.data[0];
      }

      if (!subscription) {
        // Customer exists in Stripe but has never had (or no longer has any
        // record of) a subscription. Only clear local state if we actually
        // thought there was one -- an empty list here is also what a
        // customer created but never checked out looks like.
        if (row.subscription_status != null) {
          const { error: clearErr } = await supabase
            .from(PORTFELL_TABLES.profiles)
            .update(CLEARED_BILLING_PATCH)
            .eq("id", row.id);
          if (clearErr) {
            // The reconcile is the backstop behind the webhook; a failure
            // here has nothing behind it, so it goes to the error log
            // (/admin and the daily digest), not only the log stream. The
            // profile id rides in context, never the user_id column, so
            // the row survives an account deletion while there may still
            // be a live subscription to chase.
            await logError({
              source: "server",
              message: "Billing reconcile could not clear a stale subscription state.",
              path: "/api/cron/billing-reconcile",
              event: "billing_reconcile_write_failed",
              context: { profileId: row.id, detail: clearErr.message },
            });
            continue;
          }
          corrected += 1;
          logEvent("billing_reconcile_corrected", {
            profileId: row.id,
            from: row.subscription_status,
            to: null,
          });
        }
        continue;
      }

      const fields = stripeSubscriptionFields(subscription);
      const drifted =
        row.subscription_status !== fields.subscription_status ||
        row.stripe_subscription_id !== fields.stripe_subscription_id;

      if (drifted) {
        const { error: writeErr } = await supabase
          .from(PORTFELL_TABLES.profiles)
          .update(fields)
          .eq("id", row.id);
        if (writeErr) {
          await logError({
            source: "server",
            message: "Billing reconcile could not write a drifted subscription state.",
            path: "/api/cron/billing-reconcile",
            event: "billing_reconcile_write_failed",
            context: { profileId: row.id, detail: writeErr.message },
          });
          continue;
        }
        corrected += 1;
        logEvent("billing_reconcile_corrected", {
          profileId: row.id,
          from: row.subscription_status,
          to: fields.subscription_status,
        });
      }
    } catch (err) {
      await logError({
        source: "server",
        message: "Billing reconcile could not ask Stripe about a subscribed profile.",
        path: "/api/cron/billing-reconcile",
        event: "billing_reconcile_stripe_error",
        context: {
          profileId: row.id,
          detail: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  return { checked: rows.length, corrected };
}
