import { NextRequest, NextResponse } from "next/server";

import { readEmail } from "@/lib/auth/email-address";
import { domainAcceptsMail } from "@/lib/auth/email-mx";
import { EMAIL_LOGIN_SENT, startEmailLogin } from "@/lib/auth/email-login";
import { emailLoginPostSchema } from "@/lib/api-schemas";
import { observeRoute } from "@/lib/observe-route";
import { parseJsonBody } from "@/lib/parse-json-body";
import { clientIp, rateLimitJson } from "@/lib/rate-limit";
import { takeDurableRateLimit } from "@/lib/rate-limit-durable";

export const dynamic = "force-dynamic";

/*
  Ask for a sign-in link.

  Unauthenticated on purpose: this is how somebody without a session gets
  one. What keeps it from being a mail cannon is the same pair the address
  form uses (a real mailbox, then a durable ration) plus a per-address
  cap, so one IP cannot spend the sending domain on a list of strangers.
*/

async function handlePOST(req: NextRequest) {
  const parsed = await parseJsonBody(req, emailLoginPostSchema);
  if (!parsed.ok) return parsed.response;

  const verdict = readEmail(parsed.data.email);

  if (verdict.kind === "unreachable") {
    return NextResponse.json(
      { error: verdict.message, typed: verdict.email },
      { status: 400 }
    );
  }

  if (verdict.kind === "check" && parsed.data.confirmed !== true) {
    return NextResponse.json({
      suggestion: verdict.suggestion,
      typed: verdict.email,
    });
  }

  const email = verdict.email;
  const domain = email.slice(email.lastIndexOf("@") + 1);

  /*
    Ration before the lookup, unlike /api/account/addresses, which counts
    after it because a signed-in reader is already known and it is the letter
    being rationed. Nobody is signed in here. The spelling rules above are
    pure and cost nothing, but the mail-server lookup leaves the building and
    waits up to 2.5s, and its cache cannot help against a caller feeding it a
    fresh domain every time. Behind the ration that is a handful of lookups
    an hour; in front of it, it is a stranger holding functions open for
    free.
  */
  const ip = clientIp(req);
  const [byIp, byAddr] = await Promise.all([
    takeDurableRateLimit(`email-login-ip:${ip}`, 8, 60 * 60_000),
    takeDurableRateLimit(`email-login-addr:${email}`, 4, 60 * 60_000),
  ]);

  if (!byIp.ok) {
    return rateLimitJson(
      byIp,
      "That is a lot of sign-in links from here. Give it a few minutes and try again."
    );
  }
  if (!byAddr.ok) {
    return rateLimitJson(
      byAddr,
      "That is a lot of sign-in links to that address. Give it a few minutes and try again."
    );
  }

  if (!(await domainAcceptsMail(domain))) {
    return NextResponse.json(
      {
        error: `We could not find a mail server for ${domain}, so a link sent there would not arrive. Check the spelling.`,
        typed: email,
      },
      { status: 400 }
    );
  }

  const result = await startEmailLogin({
    email,
    next: parsed.data.next,
  });

  if (result.kind === "error") {
    const message =
      result.code === "no-mail" || result.code === "not-configured"
        ? "Email sign-in is not switched on here yet. Use Google, or try again later."
        : "We could not send that. Try once more.";
    return NextResponse.json(
      { error: message, typed: email },
      { status: result.code === "failed" ? 500 : 400 }
    );
  }

  return NextResponse.json({ ok: true, sent: EMAIL_LOGIN_SENT });
}

export const POST = observeRoute(handlePOST, "/api/auth/email");
