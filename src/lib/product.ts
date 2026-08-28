/**
 * The one sentence every room should agree with. Sign-in, empty book,
 * metadata, and README all import this so the story cannot drift.
 *
 * Upside Fund is a room you can visit and is not the product. Circle is
 * different and was under-sold for a long time: doing nothing on a bad day
 * is far easier with people you know looking at the same week, so it sits
 * beside Pulse and Margus in this file rather than in a footnote after
 * them.
 */

export const PRODUCT_NAME = "Upside Lab";

export const PRODUCT_DOMAIN = "upsidelab.app";

export const PRODUCT_ORIGIN = `https://${PRODUCT_DOMAIN}`;

/**
 * The two lines on the social card, and the one sentence everywhere else.
 *
 * Split here so the PNG cannot drift from the metadata. The card paints
 * these as two lines; join them for titles and descriptions.
 *
 * This used to be "See what your portfolio did. Ask Margus if the thesis
 * still holds." Both halves were a problem and the second one was the
 * bigger. "Thesis" is a word an ordinary person does not use about their
 * own money, so the sentence that was supposed to say what this is for
 * asked the reader to learn a term first. Worse, it made one feature the
 * whole product: people who tried it kept asking what the point was and
 * how it differed from the broker app they already had, which is the
 * question a headline exists to answer.
 *
 * What it is for is plainer than that and bigger. You get your whole
 * portfolio said back to you in ordinary sentences, and on the day it
 * falls you find out whether anything actually happened at the companies
 * you own. Pulse is how that gets answered. It is not the reason.
 */
export const PRODUCT_HEADLINE = [
  "Your whole portfolio, in plain words.",
  "And when it falls, what actually changed.",
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
  "Most falls are the whole market having a bad week. This tells you when it is something else.";

/** Name used when a first-run import creates the sheet for you. */
export const FIRST_SHEET_NAME = "My portfolio";

/** Sign-in page: the one line under the headline. */
export const SIGNIN_WHO =
  "Your broker shows you the number. This shows you what happened at the companies behind it, and whether anything really changed.";

export const SIGNIN_POINTS = [
  "When a price falls, it says whether news came out of the company or the whole market moved together.",
  "Margus has read your portfolio. Ask why your week went the way it did, in ordinary words.",
  "A circle is the people you already talk to about this. Share a portfolio and see how everyone's day went.",
] as const;

/**
 * The question every visitor actually arrives with, answered in one place
 * so the landing page, the walkthrough and the in-app help cannot give
 * three different answers to it.
 *
 * People kept asking what this is for and how it differs from the broker
 * app or the tracker they already use. The honest answer is that it is not
 * competing with either: a broker holds the money and a tracker adds the
 * prices up, and both of those are done well already. Neither of them will
 * tell you what happened, and "what happened" is the only thing anybody
 * wants at nine in the evening on a day their portfolio fell 6%.
 *
 * Say what the other thing does well before saying what this does. A
 * comparison that opens by running down a tool the reader likes is a
 * comparison they stop reading.
 */
export const BROKER_ALREADY_DOES = [
  "Holds your money and puts your orders through.",
  "Shows what everything is worth right now, to the cent.",
  "Draws the line going up or down since you started.",
] as const;

export const THIS_DOES_INSTEAD = [
  "Says what happened at each company you own today, in a sentence.",
  "Separates a whole market having a bad week from real news about one of your names.",
  "Answers questions about your portfolio, and puts the week in one email on Sunday.",
] as const;

/** The sentence that heads that pair. Keep it short enough to be a title. */
export const BROKER_ANSWER =
  "Keep your broker. This is the part it was never trying to do.";

/**
 * The rest of the product, for somebody who arrived from a link and has
 * never heard of any of this.
 *
 * The points above are the hook and stay the hook. But they name three of
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
      "When a price moves, it reads the day's news on that company and says whether anything really changed.",
  },
  {
    title: "Margus",
    detail:
      "Has read your portfolio. Ask why something moved, in plain words.",
  },
  {
    title: "Circle",
    detail:
      "Share a portfolio with a partner, your family or friends. They see today's prices, never what you paid.",
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
