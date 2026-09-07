/**
 * Which crawlers are welcome, which are refused, and where each answer is
 * enforced.
 *
 * The public research pages exist to be found, so this is deliberately not
 * a wall. A search crawler that indexes a page and then sends a person to
 * it is the entire point of publishing them, and blocking one to save a
 * few kilobytes would be turning off the reason the pages were written.
 *
 * What is refused is the other kind: bulk harvesters that read every page
 * on the site, send nobody back, and in several documented cases crawl an
 * order of magnitude harder than any search engine. They are pure cost.
 * The largest models' training crawlers are in that set, and so are the
 * commercial link-graph scrapers, which nobody outside a marketing tool
 * ever benefits from.
 *
 * **Two lists, because there are two different mechanisms and confusing
 * them breaks the site.**
 *
 * `ROBOTS_ONLY_AI_TOKENS` are names that exist **only inside robots.txt**.
 * Google-Extended and Applebot-Extended are the important ones: neither is
 * a user agent, and no request ever arrives calling itself either. They
 * are opt-out switches that Google and Apple read out of robots.txt to
 * decide whether a page already crawled by the ordinary Googlebot or
 * Applebot may be used to train a model. Refusing a request on one of
 * those strings would do nothing at best, and matching loosely on
 * "Applebot" would refuse Apple's actual search crawler.
 *
 * `BLOCKED_USER_AGENTS` are real agents that really turn up, so those are
 * refused twice: asked politely in robots.txt, and refused at the edge for
 * the ones that do not read it. The edge check is a **substring match on a
 * header the caller controls**, which means it is a cost control and never
 * a security boundary: anything can call itself Chrome. That is fine. The
 * well-behaved half identifies itself honestly and stops, and the half
 * that lies was never going to be stopped by a list of names anyway. It
 * must therefore never be the thing standing between anybody and their
 * data, and it is not: it refuses a document request and nothing else.
 *
 * The user-initiated fetchers are the interesting case and they are
 * **allowed on purpose**. When somebody pastes a link into an assistant
 * and it fetches that one page, that is a person reading the page through
 * a different window, and it is one request rather than a hundred
 * thousand. The same goes for the link preview bots: a card in a chat is
 * the "shareable" half of what these pages are for.
 */

/**
 * Names that only ever appear in robots.txt. Never matched against a
 * request, because no request carries them.
 */
export const ROBOTS_ONLY_AI_TOKENS: readonly string[] = [
  // Google's model training opt-out. The ordinary Googlebot is welcome and
  // is what puts these pages in front of people.
  "Google-Extended",
  // Apple's, with exactly the same split against Applebot.
  "Applebot-Extended",
] as const;

/**
 * Agents refused in robots.txt and at the edge.
 *
 * Written the way each one spells itself, because this list is published
 * verbatim in robots.txt and a public file full of lowercased names reads
 * as carelessness. Matching is case-insensitive on both sides: the robots
 * standard says user agent names are matched without regard to case, and
 * `isBlockedCrawler` folds the header before comparing.
 *
 * Each one is here for the same reason: it reads a lot and sends nobody.
 */
export const BLOCKED_USER_AGENTS: readonly string[] = [
  // Model training crawlers.
  "GPTBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "CCBot",
  "cohere-ai",
  "cohere-training-data-crawler",
  "meta-externalagent",
  "meta-externalfetcher",
  "FacebookBot",
  "Applebot-Extended",
  "Google-Extended",
  "Bytespider",
  "PetalBot",
  "Amazonbot",
  "YouBot",
  "img2dataset",
  "ImagesiftBot",
  "Omgilibot",
  "Omgili",
  "Webzio-Extended",
  "Timpibot",
  "Diffbot",
  "Scrapy",
  "python-requests",
  // Commercial link-graph and keyword scrapers. They crawl a whole site to
  // resell the map of it, which costs this app real requests and returns
  // nothing to the person paying for them.
  "AhrefsBot",
  "SemrushBot",
  "MJ12bot",
  "DotBot",
  "BLEXBot",
  "DataForSeoBot",
  "SEOkicks",
  "serpstatbot",
  "MegaIndex",
  "ZoominfoBot",
] as const;

/**
 * Agents named in robots.txt with an explicit allow, so a change to the
 * catch-all rules can never quietly shut the front door.
 *
 * The search crawlers are why these pages exist. `OAI-SearchBot` and the
 * two user-initiated fetchers below it are here because each of them ends
 * with a person reading the page, which is the test this whole file
 * applies. The preview bots are what draw the card when somebody pastes a
 * link into a chat.
 */
export const WELCOME_USER_AGENTS: readonly string[] = [
  "Googlebot",
  "Googlebot-Image",
  "Bingbot",
  "Applebot",
  "DuckDuckBot",
  "Slurp",
  "YandexBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "Perplexity-User",
  "Twitterbot",
  "facebookexternalhit",
  "LinkedInBot",
  "Slackbot-LinkExpanding",
  "Discordbot",
  "TelegramBot",
  "WhatsApp",
] as const;

/**
 * Is this a bulk harvester that has said so in its own user agent?
 *
 * Answered from the header alone. A caller that lies passes, which is
 * accepted and is why nothing but a public document is decided by this.
 */
const BLOCKED_LOWER = BLOCKED_USER_AGENTS.map((n) => n.toLowerCase());

export function isBlockedCrawler(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  for (const name of BLOCKED_LOWER) {
    if (ua.includes(name)) return true;
  }
  return false;
}

/**
 * The header that says a page may be indexed and may not be harvested for
 * a model.
 *
 * `noai` and `noimageai` are not a standard anybody has to honour, and
 * they are cheap: they cost one header and are read by a growing number of
 * the crawlers that do respect an opt-out. They deliberately sit apart
 * from the index directives, which each page states in its own metadata,
 * so the two cannot end up contradicting each other in different files.
 */
export const NO_AI_TRAINING_HEADER = {
  key: "X-Robots-Tag",
  value: "noai, noimageai",
} as const;
