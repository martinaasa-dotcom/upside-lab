import { dbError } from "@/lib/db-error";
import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";

/** Subscription state for the signed-in user, mirrored from Stripe by the webhook. */
async function handleGET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ subscriptionStatus: null });
  }

  const { data, error } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("subscription_status, plan, current_period_end")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: dbError(error, "/api/billing/status") }, { status: 500 });
  return NextResponse.json({
    subscriptionStatus: data?.subscription_status ?? null,
    plan: data?.plan ?? null,
    currentPeriodEnd: data?.current_period_end ?? null,
  });
}

export const GET = observeRoute(handleGET, "/api/billing/status");
