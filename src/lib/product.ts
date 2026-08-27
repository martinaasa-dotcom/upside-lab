/**
 * The one sentence every room should agree with. Sign-in, empty book,
 * metadata, and README all import this so the story cannot drift.
 *
 * Fund and Communities are rooms you can visit. They are not the product.
 */

export const PRODUCT_NAME = "Upside Lab";

export const PRODUCT_DOMAIN = "upsidelab.app";

export const PRODUCT_ORIGIN = `https://${PRODUCT_DOMAIN}`;

/**
 * The two lines on the social card, and the one sentence everywhere else.
 *
 * Split here so the PNG cannot drift from the metadata. The card paints
 * these as two lines; join them for titles and descriptions.
 */
export const PRODUCT_HEADLINE = [
  "See what your portfolio did.",
  "Ask Margus if the thesis still holds.",
] as const;

export const PRODUCT_SENTENCE = PRODUCT_HEADLINE.join(" ");

/**
 * The small line under the headline on the social card.
 *
 * Periods, never a dash. This is the first sentence a stranger reads when
 * the link is pasted into Slack or a browser tab, so it has to sound like
 * a person wrote it.
 */
export const OG_CARD_LINE =
  `${PRODUCT_NAME}. Educational scenarios. Never financial advice.`;

export const PRODUCT_BLURB =
  "When a name you own moves, it asks whether the reason still holds.";

/** Name used when a first-run import creates the sheet for you. */
export const FIRST_SHEET_NAME = "My portfolio";

/** Sign-in page: the one line under the headline. */
export const SIGNIN_WHO =
  "Your broker has the prices. This asks whether the reason still holds.";

export const SIGNIN_POINTS = [
  "Pulse watches a name when the price jumps, and whether the thesis moved with it.",
  "Margus can read your portfolio and talk it through with you.",
] as const;

/**
 * The rest of the product, for somebody who arrived from a link and has
 * never heard of any of this.
 *
 * The two points above are the hook and stay the hook. But they name two of
 * the eight things the app does, so a stranger was deciding whether to hand
 * over their holdings on a quarter of the picture. Everything here is a
 * room that exists and works today. Nothing aspirational goes in this list:
 * it is read by people who will click straight through and check.
 */
export const SIGNIN_FEATURES = [
  {
    title: "Start in a minute",
    detail:
      "Paste what you own, upload a CSV, or drop in a screenshot of your broker page.",
  },
  {
    title: "Pulse",
    detail:
      "When a price moves, it says whether the reason you own the name moved with it.",
  },
  {
    title: "Margus",
    detail:
      "Has read your portfolio. Ask why something moved, in plain words.",
  },
  {
    title: "Forecast",
    detail:
      "A yearly price path for each holding out to 2030. Scenarios to think with, not advice.",
  },
  {
    title: "A letter on Sunday",
    detail:
      "One email a week: what moved, what is worth a second look, and why.",
  },
  {
    title: "Circle",
    detail:
      "Share a portfolio with people you invite. They see today's prices, never what you paid.",
  },
] as const;

/**
 * Answered on the page rather than after signing up.
 *
 * "What does it cost" is the second question every visitor has and the old
 * screen answered it nowhere, which reads as something to find out later.
 *
 * The supporter line is stated here rather than buried, and it is stated as
 * the Account page states it: the subscription genuinely unlocks nothing.
 * Saying so up front costs nothing and is worth something, because the one
 * thing a stranger from a forum is scanning for is the catch. Keep this in
 * step with the Billing panel in `AccountPage`; two different accounts of
 * the same twelve euros is worse than either.
 */
export const SIGNIN_PRICE = "Free while it is in early access. Every feature, no paid tiers.";

export const SIGNIN_PRICE_NOTE =
  "There is a supporter subscription at €12 a month. It unlocks nothing at all. It just helps pay for building this.";

/**
 * Why it is safe to put real holdings in.
 *
 * Every line is a fact about the product, checkable from the app itself:
 * sign-in is Google or a link we send to your email, a portfolio really is
 * private until an invite is accepted, and Account really does have both an
 * export and a delete. Do not add a line here that the app cannot back up.
 */
export const SIGNIN_TRUST = [
  "Sign in with Google, or a link we send to your email. There is no password to lose.",
  "Your portfolio is private until you invite someone into it.",
  "Export everything, or delete all of it, from your account page.",
] as const;

/** Live inbox. Named on /terms and /privacy. */
export const PRODUCT_CONTACT_EMAIL = "privacy@upthink.ee";

/** Product help. Named on Account, sign-in, /terms, and /privacy. */
export const PRODUCT_SUPPORT_EMAIL = "app.support@upthink.ee";

/** Public X account for the paper fund. Cron posts weekday notes here. */
export const FUND_X_HANDLE = "UpsideFund";
export const FUND_X_URL = `https://x.com/${FUND_X_HANDLE}`;

/** Named on /terms and /privacy. From the Estonian business register. */
export const LEGAL_OPERATOR = "Upthink Solutions OÜ";

export const LEGAL_COUNTRY = "Estonia";

export const LEGAL_REGISTRY_CODE = "16683946";

export const LEGAL_ADDRESS =
  "Aiandi tn 8/2-28, Mustamäe linnaosa, 12915 Tallinn, Harju maakond";

export const LEGAL_VAT_ID = "EE102590654";
