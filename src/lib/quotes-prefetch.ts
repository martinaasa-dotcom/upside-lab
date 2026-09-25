/**
 * THE FIRST PRICES ARE ASKED FOR BEFORE ANY OF OUR CODE HAS RUN.
 *
 * Opening the app used to cost, in order: download the bundle, parse it,
 * hydrate, mount `Dashboard`, read the saved book out of storage, work
 * out the ticker list, and only then put `/api/quotes` on the wire. On a
 * cold phone that is most of a second of the reader looking at last
 * night's numbers before the request that corrects them has even left.
 * Nothing in that chain is needed to ask the question: the URL the book
 * polls is a pure function of the tickers it holds, and the browser had
 * it in storage from the last visit.
 *
 * So the last polled URL is remembered, and a blocking inline script in
 * the head (`QUOTES_PREFETCH_SCRIPT`, the same idiom as the session hint)
 * starts the fetch while the bundle is still downloading and parks the
 * promise on `window`. `Dashboard`'s first refresh takes that promise in
 * place of dialling out again, so the live answer lands about as early as
 * the network allows rather than as early as React does.
 *
 * It is a head start, never an authority: the promise is taken only when
 * the URL is exactly the one the book would have asked for now (holdings
 * can change between visits) and only while it is younger than the view
 * bar; anything else is dropped and the ordinary fetch runs. A rejected
 * prefetch has a catch attached so it can never surface as an unhandled
 * rejection on a page that never asked for it.
 */

import { quoteViewMaxAgeMs } from "@/lib/market/session";

/** Where the last polled quotes URL is kept. Read by the script below. */
export const QUOTES_PREFETCH_KEY = "upside-quotes-url-v1";

/** Where the head script parks the in-flight request. */
export const QUOTES_PREFETCH_GLOBAL = "__upsideQuotes";

type Parked = {
  url: string;
  at: number;
  res: Promise<Response>;
  /** The parsed answer, once it has landed. Set by the head script. */
  data?: unknown;
};

/**
 * Pages that never mount the book, so a head start there is a request
 * spent on nobody: the public research pages, the legal pages, the
 * sign-in handshake and the one-click unsubscribe. Prefix-matched.
 */
export const QUOTES_PREFETCH_SKIP_PREFIXES = [
  "/research/",
  "/privacy",
  "/terms",
  "/auth/",
  "/unsubscribe",
  "/admin",
] as const;

/**
 * Deliberately tiny and synchronous. Only a same-origin `/api/quotes?`
 * address is ever fetched, whatever storage holds, so a poisoned key
 * cannot make this page call out anywhere else.
 */
export const QUOTES_PREFETCH_SCRIPT =
  `try{var s=${JSON.stringify(QUOTES_PREFETCH_SKIP_PREFIXES)},` +
  `l=window.location.pathname,i;for(i=0;i<s.length;i++){if(l.indexOf(s[i])===0)throw 0}` +
  `var u=window.localStorage.getItem("${QUOTES_PREFETCH_KEY}");` +
  `if(u&&u.indexOf("/api/quotes?")===0&&typeof fetch==="function"){` +
  `var p=fetch(u),o={url:u,at:Date.now(),res:p};p.catch(function(){});` +
  `window.${QUOTES_PREFETCH_GLOBAL}=o;` +
  `p.then(function(r){return r.ok?r.clone().json():null})` +
  `.then(function(d){if(d&&typeof d==="object")o.data=d}).catch(function(){})}}catch(e){}`;

/** Remember the address the book polls, for the next first paint. */
export function rememberQuotesUrl(url: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!url) window.localStorage.removeItem(QUOTES_PREFETCH_KEY);
    else window.localStorage.setItem(QUOTES_PREFETCH_KEY, url);
  } catch {
    /* storage off: the next open simply starts cold */
  }
}

/**
 * The head start, if there is one for exactly this address and it is
 * still young. One use: the parked promise is cleared whether or not it
 * is taken, so a stale one cannot be handed to a later refresh.
 */
export function takeQuotesPrefetch(
  url: string,
  now: number = Date.now()
): Promise<Response> | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const parked = w[QUOTES_PREFETCH_GLOBAL] as Parked | undefined;
  if (!parked) return null;
  delete w[QUOTES_PREFETCH_GLOBAL];
  if (parked.url !== url) return null;
  if (typeof parked.at !== "number" || now - parked.at > quoteViewMaxAgeMs(new Date(now))) {
    return null;
  }
  if (!parked.res || typeof parked.res.then !== "function") return null;
  return parked.res;
}

/**
 * The early answer itself, if it has already landed, WITHOUT taking it.
 *
 * `takeQuotesPrefetch` only helps the first refresh, which runs after the
 * book has mounted and painted. Measured on a reload with prices saved
 * three hours earlier: the head's request had its answer back at about
 * 240ms, and the hero still painted grey at 1,130ms and went live at
 * 1,390ms, because the answer sat unread until React got round to asking
 * again. On a phone that gap is two seconds of an old figure drawn as
 * stale. The head script now parses the response too, and the book's
 * first layout effect reads it here, so the first frame a reader sees
 * carries the live prices. The response itself is left parked, so the
 * refresh that follows still takes it rather than asking a third time.
 *
 * Same guards as the take: only a young answer, and only the quotes map,
 * which is a price per symbol and true whatever the book now holds.
 */
export function peekQuotesPrefetchData(
  now: number = Date.now()
): { quotes: Record<string, unknown>; at: number } | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const parked = w[QUOTES_PREFETCH_GLOBAL] as Parked | undefined;
  if (!parked || typeof parked.at !== "number") return null;
  if (now - parked.at > quoteViewMaxAgeMs(new Date(now))) return null;
  const data = parked.data as { quotes?: unknown } | undefined;
  const quotes = data?.quotes;
  if (!quotes || typeof quotes !== "object" || Array.isArray(quotes)) return null;
  return { quotes: quotes as Record<string, unknown>, at: parked.at };
}
