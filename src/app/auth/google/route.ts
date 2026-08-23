import { NextResponse } from "next/server";
import {
  GOOGLE_AUTH_PATH,
  GOOGLE_OAUTH_COOKIE,
  buildGoogleAuthorizeUrl,
  encodeGoogleOAuthCookie,
  googleCallbackUrl,
  googleClientId,
  googleOAuthCookieOptions,
  googleRedirectOrigin,
  randomOAuthValue,
  readGoogleIntent,
  shouldUseOwnGoogleOAuth,
} from "@/lib/auth/google-oauth";
import { isCanonicalAppHost, isLocalHost, safeInternalPath, siteUrl } from "@/lib/site-url";
import { createSupabaseServerAuth } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeInternalPath(url.searchParams.get("next"));
  /*
    Written down here, before the browser leaves, because nothing coming back
    from Google can say what the trip was for. See google-oauth.ts.
  */
  const intent = readGoogleIntent(url.searchParams.get("intent"));
  const hostname = url.hostname;

  if (
    shouldUseOwnGoogleOAuth(hostname) &&
    isCanonicalAppHost(hostname) &&
    !isLocalHost(hostname) &&
    hostname !== new URL(siteUrl()).hostname
  ) {
    const dest = new URL(GOOGLE_AUTH_PATH, siteUrl());
    dest.searchParams.set("next", next);
    if (intent === "link") dest.searchParams.set("intent", intent);
    return NextResponse.redirect(dest);
  }

  if (shouldUseOwnGoogleOAuth(hostname)) {
    const clientId = googleClientId();
    if (!clientId) {
      return NextResponse.redirect(new URL("/login?signin=failed", url.origin));
    }
    const origin = googleRedirectOrigin(hostname, url.origin);
    const state = randomOAuthValue();
    const redirectUri = googleCallbackUrl(origin);
    const authorize = buildGoogleAuthorizeUrl({
      clientId,
      redirectUri,
      state,
    });
    const res = NextResponse.redirect(authorize);
    res.cookies.set(
      GOOGLE_OAUTH_COOKIE,
      encodeGoogleOAuthCookie({ state, next, origin, intent }),
      googleOAuthCookieOptions(!isLocalHost(hostname))
    );
    return res;
  }

  /*
    Preview deploys fall back to Supabase's own hosted handshake, which comes
    back through /auth/callback with a session and no id token of ours to read
    an address out of. Connecting a second Google account cannot be done that
    way, so it says so rather than quietly signing the reader into the other
    account and swapping which one they are looking at.
  */
  if (intent === "link") {
    return NextResponse.redirect(new URL("/account?address=not-configured", url.origin));
  }

  const supabase = await createSupabaseServerAuth();
  if (!supabase) {
    return NextResponse.redirect(new URL("/login?signin=failed", url.origin));
  }
  const origin = isLocalHost(hostname) ? url.origin : siteUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) {
    console.error("google oauth fallback failed", error?.message);
    return NextResponse.redirect(new URL("/login?signin=failed", origin));
  }
  return NextResponse.redirect(data.url);
}
