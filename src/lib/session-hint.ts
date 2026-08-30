/**
 * WHAT THE PAGE PAINTS BEFORE ANY OF OUR CODE HAS RUN.
 *
 * Every gated route in this app is statically rendered, and `SignInGate`
 * renders with no user on the server, so the HTML sitting in Vercel's
 * cache for `/`, `/pulse`, `/portfolio/<slug>`, `/account` and the rest is
 * the signed-out marketing landing, hero and all. Measured against
 * production on 2026-08-30: the document served for `/` contains
 * `landing-hero`, the sample briefing card and "Continue with Google".
 *
 * `AuthProvider` puts the last session back in a `useLayoutEffect`, which
 * is before the *hydrated* paint and long after the *first* one. So a
 * signed-in reader refreshing has always been shown the landing until the
 * bundle arrived, parsed and hydrated: a few milliseconds with everything
 * warm, which is why this looked fine, and plainly visible after a while
 * away, when the JS is no longer in the browser's memory cache or a deploy
 * has changed its URL. What they see is the page for people who do not
 * have an account, advertising the product they are already inside.
 *
 * The fix cannot be "render the app on the server instead": that means
 * reading the session cookie in the root layout, which makes every route
 * in the product dynamic to answer a question the browser already knows
 * the answer to. So the browser answers it, in a blocking inline script
 * before the body is parsed, exactly the way a theme is kept from
 * flashing. The mark goes on the root element and CSS does the rest:
 * `html[data-session="in"]` hides the signed-out view and shows the same
 * loading shell the reader is about to get from `Dashboard` anyway, so
 * hydration swaps content in underneath a logo and a line that never
 * moved.
 *
 * The hint is a *hint*, never an authority: it says what this browser last
 * knew, and `saveLastUser` corrects it the moment the real answer lands,
 * so an expired session falls back to the landing rather than a shell that
 * waits forever.
 */

/** Where the last signed-in user is kept. Read by the script below. */
export const LAST_USER_KEY = "upside-last-user-v1";

export const SESSION_HINT_ATTR = "data-session";

/**
 * Runs before anything paints, so it is deliberately tiny, synchronous and
 * wrapped in its own try: private mode throws on `localStorage`, and a
 * blank page would be a far worse failure than a landing flash.
 *
 * Built from `LAST_USER_KEY` rather than repeating the string, because the
 * script and the module that writes that key cannot be allowed to drift.
 */
export const SESSION_HINT_SCRIPT =
  `try{var v=window.localStorage.getItem("${LAST_USER_KEY}");` +
  `if(v&&JSON.parse(v).id){` +
  `document.documentElement.setAttribute("${SESSION_HINT_ATTR}","in")}}catch(e){}`;

/**
 * Correct the hint once the session is actually known.
 *
 * Called from `saveLastUser`, which is the one place that writes the key
 * the script reads: a resolved session, a resolved absence, a sign-out and
 * an account switch all go through it, so the attribute cannot say "in"
 * while the app is showing the landing.
 */
export function markSessionHint(signedIn: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(
    SESSION_HINT_ATTR,
    signedIn ? "in" : "out",
  );
}
