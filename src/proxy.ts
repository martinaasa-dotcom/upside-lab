import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildContentSecurityPolicy } from "@/lib/security-headers";
import { limitMutationRequest, limitPublicMarketRequest } from "@/lib/rate-limit";
import { isMutatingRequest, isSameOriginMutation } from "@/lib/same-origin";
import {
  isLegacyHost,
  isLocalHost,
  isVercelPreviewHost,
  redirectTarget,
} from "@/lib/site-url";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Legacy host redirects, mutation rate limits, CSP, and Supabase
 * session refresh.
 *
 * Document navigations to a known legacy host 301 to the canonical host,
 * path and query intact. `/api/*` stays on the incoming host so cron jobs
 * and signed webhooks do not drop a body on a redirect.
 */
export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const target = redirectTarget();
  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api/");
  const csp = buildContentSecurityPolicy();

  if (
    target &&
    !isLocalHost(host) &&
    host.split(":")[0].toLowerCase() !== target &&
    !isApi &&
    (isLegacyHost(host) || !isVercelPreviewHost(host))
  ) {
    const url = request.nextUrl.clone();
    url.host = target;
    url.protocol = "https";
    url.port = "";
    const redirect = NextResponse.redirect(url, 301);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  /*
    Second line behind the session cookie's `SameSite=Lax`. Refused only
    when a browser says out loud that the mutation came from another site; a
    caller with no browser behind it (Stripe's signed webhook, Gmail's
    one-click unsubscribe post, any server to server post) is not a forgery
    risk and passes through. See `same-origin.ts` for why each header is
    read in that order.

    Every mutation, not only `/api/*`. `/auth/email/complete` is a POST on a
    page path that mints a session, and it was the one mutating route in the
    app this gate did not cover. `SameSite=Lax` does not help there either:
    the danger is not the victim's cookie being sent, it is a forged post
    setting one, so a stranger's sign-in token could be posted through a
    victim's browser and land them inside the stranger's account.
  */
  if (isMutatingRequest(request.method) && !isSameOriginMutation(request)) {
    const denied = isApi
      ? NextResponse.json(
          { error: "That request did not come from this site." },
          { status: 403 }
        )
      : new NextResponse("That request did not come from this site.", {
          status: 403,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
    denied.headers.set("Content-Security-Policy", csp);
    return denied;
  }

  if (isApi) {
    const limited =
      limitMutationRequest(request) ?? limitPublicMarketRequest(request);
    if (limited && !limited.ok) {
      const blocked = NextResponse.json(
        { error: "Too many requests. Try again in a minute." },
        {
          status: 429,
          headers: { "Retry-After": String(limited.retryAfterSec ?? 60) },
        }
      );
      blocked.headers.set("Content-Security-Policy", csp);
      return blocked;
    }
  }

  const requestHeaders = new Headers(request.headers);

  const continueRequest = () => {
    const next = NextResponse.next({
      request: { headers: requestHeaders },
    });
    next.headers.set("Content-Security-Policy", csp);
    return next;
  };

  let response = continueRequest();

  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = continueRequest();
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });
    await supabase.auth.getUser();
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
