import { NextResponse, type NextRequest } from "next/server";

import { maskAddress } from "@/lib/auth/account-addresses";
import {
  CONTINUE_COOKIE,
  continueCookieOptions,
  openContinue,
} from "@/lib/auth/continue-session";
import { consumeEmailLogin } from "@/lib/auth/email-login";
import { ensureProfileAndClaims } from "@/lib/auth/ensure-profile";
import { magicTokenFor } from "@/lib/auth/linked-addresses";
import { PRODUCT_NAME } from "@/lib/product";
import { isLocalHost, siteUrl } from "@/lib/site-url";
import { createSupabaseAuthForResponse } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

/*
  The one question this app asks between proving a mailbox and opening an
  account with it.

  An address that somebody added to their account opens that account. That is
  the whole feature, and it is also the one way it can go wrong without anybody
  noticing: the person at the keyboard proved they hold one mailbox, and the
  session they were handed belonged to an account named by a different one.
  Nothing said so. They tapped Continue with Google and landed in a set of
  portfolios that were not theirs, or, read the other way round, somebody who
  had talked a stranger into confirming a link now had that stranger's future
  sign-ins landing in their own account.

  So when the account about to be opened signs in with an address other than
  the one just proved, the session is not minted quietly. This page names the
  account, masked because it is read before any session exists, and waits.

  GET asks and changes nothing. POST is the only method that mints anything,
  and the forged-request gate in `src/proxy.ts` stands in front of it as it
  does in front of every mutation on every path.
*/

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain and self-contained: read in a tab with none of the app around it. */
function page(title: string, body: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<meta name="robots" content="noindex">` +
      `<title>${title}</title>` +
      `<style>body{margin:0;min-height:100dvh;display:flex;align-items:center;` +
      `justify-content:center;padding:24px;background:#0a0a0a;color:#fafafa;` +
      `font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}` +
      `main{max-width:28rem;width:100%}h1{font-size:1.125rem;margin:0 0 8px}` +
      `p{font-size:.875rem;line-height:1.6;color:#b5b5b5;margin:0 0 20px}` +
      `button{appearance:none;border:none;border-radius:.5rem;padding:.5rem 1rem;` +
      `font:inherit;font-size:.875rem;font-weight:500;cursor:pointer;` +
      `background:#e8c37a;color:#1a1206}` +
      `a{color:#b5b5b5;font-size:.875rem;margin-left:16px}</style></head>` +
      `<body><main><h1>${title}</h1><p>${body}</p>` +
      `<form method="post" action="/auth/continue">` +
      `<button type="submit">Continue</button>` +
      `<a href="/login">Not now</a></form></main></body></html>`,
    {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    }
  );
}

function originOf(request: NextRequest): string {
  const url = new URL(request.url);
  return isLocalHost(url.hostname) ? url.origin : siteUrl();
}

function giveUp(origin: string): NextResponse {
  const res = NextResponse.redirect(new URL("/login?signin=failed", origin));
  res.cookies.set(CONTINUE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export async function GET(request: NextRequest) {
  const origin = originOf(request);
  const pass = openContinue(request.cookies.get(CONTINUE_COOKIE)?.value);

  if (!pass) return giveUp(origin);

  const primary = escapeText(maskAddress(pass.primaryEmail.toLowerCase()));
  const address = escapeText(pass.address);

  return page(
    `Open the ${PRODUCT_NAME} account for ${primary}?`,
    `You signed in with ${address}, and that address was added to the account ${primary} signs in with. Continue and you land in that account, with its portfolios and its circles. If ${primary} is not you, close this page: nothing is signed in until you press the button.`
  );
}

export async function POST(request: NextRequest) {
  const origin = originOf(request);
  const pass = openContinue(request.cookies.get(CONTINUE_COOKIE)?.value);

  if (!pass) return giveUp(origin);

  const res = NextResponse.redirect(new URL(pass.next, origin));
  res.cookies.set(CONTINUE_COOKIE, "", { ...continueCookieOptions(!isLocalHost(new URL(request.url).hostname)), maxAge: 0 });

  const supabase = await createSupabaseAuthForResponse(res);
  if (!supabase) return giveUp(origin);

  /*
    The email road still has a token to spend and the Google road does not.
    Spending it here rather than before the question is what lets somebody who
    says no keep a link that still works.
  */
  let hashedToken: string | null;

  if (pass.loginToken) {
    const spent = await consumeEmailLogin(pass.loginToken);
    if (spent.kind === "fail") return giveUp(origin);
    hashedToken = spent.hashedToken;
  } else {
    hashedToken = await magicTokenFor(pass.primaryEmail);
  }

  if (!hashedToken) return giveUp(origin);

  const { data, error } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashedToken,
  });

  if (error || !data.user) {
    console.error("continuing into a linked account failed", error?.message);
    return giveUp(origin);
  }

  try {
    await ensureProfileAndClaims(data.user);
  } catch (err) {
    console.error(
      "linked account claim failed",
      err instanceof Error ? err.message : err
    );
  }

  return res;
}
