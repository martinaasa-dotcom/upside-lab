import { NextResponse } from "next/server";

import { consumeEmailLogin } from "@/lib/auth/email-login";
import { ensureProfileAndClaims } from "@/lib/auth/ensure-profile";
import { observeRoute } from "@/lib/observe-route";
import { clientIp } from "@/lib/rate-limit";
import { takeDurableRateLimit } from "@/lib/rate-limit-durable";
import { isLocalHost, siteUrl } from "@/lib/site-url";
import { createSupabaseAuthForResponse } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

/*
  The button on /auth/email.

  GET is not handled here. Opening this URL without a POST must not spend
  the token, because that is what a mail scanner does.
*/

function fail(origin: string, problem: string) {
  const done = new URL("/auth/email", origin);
  done.searchParams.set("problem", problem);
  return NextResponse.redirect(done);
}

async function handlePOST(request: Request) {
  const url = new URL(request.url);
  const origin = isLocalHost(url.hostname) ? url.origin : siteUrl();

  const ip = clientIp(request);
  const limit = await takeDurableRateLimit(
    `email-login-complete:${ip}`,
    30,
    60 * 60_000
  );
  if (!limit.ok) return fail(origin, "failed");

  const form = await request.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");

  const spent = await consumeEmailLogin(token);
  if (spent.kind === "fail") return fail(origin, spent.reason);

  const res = NextResponse.redirect(new URL(spent.next, origin));
  const supabase = await createSupabaseAuthForResponse(res);
  if (!supabase) return fail(origin, "not-configured");

  const { data, error } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: spent.hashedToken,
  });

  if (error || !data.user) {
    console.error("email sign-in failed", error?.message);
    return fail(origin, "failed");
  }

  try {
    await ensureProfileAndClaims(data.user);
  } catch (err) {
    console.error(
      "email sign-in claim failed",
      err instanceof Error ? err.message : err
    );
  }

  return res;
}

export const POST = observeRoute(handlePOST, "/auth/email/complete");
