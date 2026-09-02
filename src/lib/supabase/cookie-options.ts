import { isLocalHost } from "@/lib/site-url";

/**
 * The attributes on every session cookie this app writes, in one place so
 * the three Supabase clients (the request-scoped server one, the proxy's
 * refresh, and the browser's) cannot disagree.
 *
 * `@supabase/ssr` fills in `path`, `sameSite` and `httpOnly` on its own and
 * says nothing about `secure`, so with no options passed the session cookie
 * went out without the Secure attribute: a browser would send it over plain
 * http to this host, which is exactly the leg HSTS exists to close and the
 * one a first visit before HSTS is cached still has open.
 *
 * `httpOnly` stays false on purpose. The browser client reads the session
 * out of `document.cookie` (`AuthProvider` asks it who is signed in and
 * listens for the session changing), so an HttpOnly cookie would sign the
 * page out while the server still had a session. The defence for this
 * cookie against a script on the page is the CSP in `proxy.ts`, not this
 * flag.
 *
 * Secure everywhere but a local development server, which is plain http.
 * Chrome and Firefox accept a Secure cookie on localhost and Safari does
 * not, so the exception is decided on the host rather than on NODE_ENV,
 * and an unknown host is treated as the public one.
 */
export function sessionCookieOptions(hostname: string | null | undefined) {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: false,
    secure: !hostname || !isLocalHost(hostname),
  };
}
