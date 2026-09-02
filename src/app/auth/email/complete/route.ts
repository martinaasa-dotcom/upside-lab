import { NextResponse } from "next/server";

import { normalizeAddress } from "@/lib/auth/email-address";
import {
  CONTINUE_COOKIE,
  continueCookieOptions,
  sealContinue,
} from "@/lib/auth/continue-session";
import { consumeEmailLogin, emailLoginTarget } from "@/lib/auth/email-login";
import { ensureProfileAndClaims } from "@/lib/auth/ensure-profile";
import { observeRoute } from "@/lib/observe-route";
import { clientIp } from "@/lib/rate-limit";
import { takeDurableRateLimit } from "@/lib/rate-limit-durable";
import { isLocalHost, siteUrl } from "@/lib/site-url";
import {
  createSupabaseAuthForResponse,
  getAuthUser,
} from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

/*
  The button on /auth/email.

  GET is not handled here. Opening this URL without a POST must not spend
  the token, because that is what a mail scanner does.
*/

/*
  A failure carries the token back with it whenever there is still something
  the reader can do about it, because the page it lands on needs the token to
  offer the button again. A spent or expired one is not carried: there is
  nothing left to press.
*/
function fail(origin: string, problem: string, token?: string) {
  const done = new URL("/auth/email", origin);
  done.searchParams.set("problem", problem);
  if (token) done.searchParams.set("token", token);
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
  // Not "something went wrong at our end": nothing did, and that message
  // sends them off to ask for another link, which is the one thing that
  // cannot help.
  if (!limit.ok) return fail(origin, "busy");

  const form = await request.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  const switching = String(form?.get("switch") ?? "") === "1";

  /*
    Read before anything is spent, so the two questions below can be asked
    while the link in the mailbox still works. Somebody who answers no to
    either of them should be able to press the button again later. A token
    this cannot find falls through to the spend, which has nothing to take
    and says exactly why in its own words.
  */
  const target = await emailLoginTarget(token);

  if (target) {
    /*
      A session already in this browser, belonging to somebody else.

      This used to write fresh cookies over it without a word, so a link
      opened on a shared laptop, or forwarded by somebody being helpful,
      silently swapped whose account was open. The next thing that person
      typed went into an account they had not chosen. Replacing a session is a
      decision, so it is made on screen and not by whoever last posted a form.
    */
    const me = await getAuthUser();
    if (me && me.id !== target.account?.userId && !switching) {
      return fail(origin, "other-session", token);
    }

    /*
      And the address that opens somebody else's account. See /auth/continue
      for why this stops rather than minting: the reader proved one mailbox
      and the account it opens is named by another, which is the one thing
      nothing on this road ever said out loud.
    */
    if (
      target.account &&
      normalizeAddress(target.account.primaryEmail) !== normalizeAddress(target.email)
    ) {
      const sealed = sealContinue({
        address: target.email,
        primaryEmail: target.account.primaryEmail,
        next: target.next,
        loginToken: token,
      });

      if (!sealed) return fail(origin, "failed");

      const ask = NextResponse.redirect(new URL("/auth/continue", origin));
      ask.cookies.set(
        CONTINUE_COOKIE,
        sealed,
        continueCookieOptions(!isLocalHost(url.hostname))
      );
      return ask;
    }
  }

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
