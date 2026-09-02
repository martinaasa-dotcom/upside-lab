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
 *
 * This deliberately does not match the landing page's own headline, which
 * is "Everyone shows you the number. Nobody tells you what happened." Do
 * not "fix" the two to agree: they are read in different places. That one
 * is a hook with a whole page underneath it to make good on it. This one
 * is read cold, in a Slack paste or a browser tab, by somebody with
 * nothing else to go on, so it says what the product is rather than
 * setting up a question. The claim underneath both is the same.
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
  "When a price falls, it says whether there was news about the company or the whole market moved together.",
  "Margus has read your portfolio. Ask why your week went the way it did.",
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
/**
 * What the Sunday email is, in one sentence, for every surface that has to
 * say it.
 *
 * Three places used to describe it and all three said something different:
 * the landing offered "what moved, and the reasoning in full sentences",
 * Account said "nothing else lands in your inbox", and the walkthrough
 * promised "what to think about for the week ahead", which no section of
 * `weekly-letter.ts` writes. A reader who reads two of them has been told
 * two things, and one of them was a feature that is not there.
 *
 * So it is one string and every surface prints it. What each surface may
 * add is its own second sentence about its own context (the switch, the
 * one reminder mail an empty portfolio gets); the description itself does
 * not vary.
 */
export const SUNDAY_EMAIL_LINE =
  "One email a week: how the week went, which of your holdings moved, and any note Pulse already showed you.";

/*
  What the broker already does well used to be a three-line list drawn as
  its own column beside `THIS_DOES_INSTEAD`. It went when the comparison
  section was cut back to one screen: a reader who has just watched the
  product separate a market day from a news day does not need two columns
  of argument, and the generous sentence about their own broker now opens
  the section instead, where everybody reads it rather than only the people
  who read lists.
*/

export const THIS_DOES_INSTEAD = [
  "Tells you what happened at each company you own today.",
  "Tells you whether the whole market had a bad week, or something happened at a company you own.",
  "Answers questions about your portfolio, and every Sunday emails you how the week went.",
] as const;

/**
 * The sentence that heads that pair. Keep it short enough to be a title.
 *
 * Not "the part it was never trying to do". A broker a reader chose and
 * trusts is not something to be smug about, and plenty of them do show
 * news. Saying they never have is both unkind and easy to disprove, which
 * is a poor way to open the section where you ask somebody to trust you.
 */
export const BROKER_ANSWER =
  "Keep your broker. This is for a different question.";

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
 *
 * The price used to open "Free while it is in early access. Every feature,
 * no paid tiers." and then the very next line named a twelve euro a month
 * subscription, which on first pass reads as a contradiction. "While"
 * promised a price was coming and said nothing about what happens to
 * somebody's holdings when it does, which is the question a cautious
 * person actually has. Nothing about the deal is changing, so the word is
 * gone rather than hedged.
 */
export const SIGNIN_PRICE = "Free. Every feature, nothing held back.";

export const SIGNIN_PRICE_NOTE =
  "There is an optional supporter plan at €12 a month, and it adds nothing: the app is the same either way. It just helps pay for building this.";

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
  "Everything you enter is stored in the European Union.",
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

/** The city in `LEGAL_ADDRESS`, on its own, for a footer that has no room
 *  for a registry code and a VAT number. */
export const LEGAL_CITY = "Tallinn";

export const LEGAL_REGISTRY_CODE = "16683946";

export const LEGAL_ADDRESS =
  "Aiandi tn 8/2-28, Mustamäe linnaosa, 12915 Tallinn, Harju maakond";

export const LEGAL_VAT_ID = "EE102590654";
