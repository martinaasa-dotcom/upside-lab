import { PRODUCT_NAME } from "@/lib/product";

/**
 * Which walkthrough is current, and therefore who is owed one.
 *
 * Raise this by one and every reader in the database is behind it again, so
 * everybody — including someone who signed in yesterday and has owned things
 * here for months — gets the new walkthrough on their next visit, once. That
 * is the whole mechanism: there is no "reset onboarding" script to run and no
 * flag to clear anywhere.
 *
 * Raise it only when the walkthrough says something materially different.
 * Fixing a typo in it and re-interrupting everybody is a worse trade than the
 * typo.
 *
 * 1 — the first walkthrough that actually explains the app (2026-08-23). What
 *     it replaces asked two questions about the reader and said four
 *     sentences about the product, and had been switched off since
 *     2026-08-18 besides.
 * 2 — same screens, deliberately re-shown (2026-08-23). This one is the
 *     exception to the rule above and it is worth writing down why, because
 *     the diff on its own looks like exactly the mistake that rule forbids:
 *     the walkthrough text did not change at all.
 *
 *     It was raised on Martin's explicit call, alongside the release that
 *     rebuilt the signed-out page into a real landing page. The reasoning is
 *     that the product a returning reader met on their first visit is not
 *     the product now, so they are owed the tour again even though the tour
 *     itself reads the same. He weighed the interruption against the size of
 *     the active user base and judged it worth it.
 *
 *     That reasoning does not generalise. Do not take this entry as licence
 *     to bump the number whenever something ships: the next raise still
 *     needs the walkthrough to say something new.
 * 3 - the walkthrough stops opening on a feature and opens on what the app
 *     is for (2026-08-28). Martin kept being asked, by people who had
 *     already signed up, what the point of this was and how it differed
 *     from the broker app they had. Screen one used to answer that with
 *     "is the reason you bought this still true", which is one feature
 *     wearing the whole product's clothes and uses a word nobody says
 *     about their own money. It now says the plain thing: your portfolio
 *     in ordinary sentences, and on the day it falls, whether anything
 *     actually happened. A "why this and not your broker" screen is new,
 *     Circle is named on the way in rather than as a footnote, and the
 *     ground rules say out loud that no screen here will tell you to buy
 *     or sell. That is materially different copy, which is the bar this
 *     number is meant to clear.
 * 4 - the walkthrough stops being a document and starts being the app
 *     (2026-09-02). Eleven screens of prose became seven screens that each
 *     want a tap before they want a read, which is a different thing
 *     rather than the same thing reworded, and it is the bar this number
 *     exists for.
 *
 *     Screen one is a made-up portfolio having a bad day with one company
 *     in it that had news, and the reader is asked which. That question
 *     IS the product, and being told the answer in a sentence had never
 *     worked: people signed up, read "Pulse tells you whether it was the
 *     company or the market", and still could not say what the app was
 *     for. The ground rules are sorted rather than listed, the bar along
 *     the bottom is a working miniature you press, and the two experience
 *     questions sit beside a small Home that visibly loses the Lab glyph
 *     and the covered calls row as the answers change, so a promise about
 *     what the app will look like is shown instead of made.
 *
 *     Several things it used to say were also not true, and a reader could
 *     find that out on their own. It pointed at a plus button the phone
 *     bar does not have; it promised "no come back email" while a cron
 *     mailed an empty portfolio a reminder every week; it told the reader
 *     to "skip this" on a screen whose only skip button leaves the whole
 *     walkthrough; and it described the Sunday email three different ways
 *     across three surfaces. Those are fixed, and the email is now one
 *     sentence that the landing page and Account print word for word.
 */
export const WELCOME_TOUR_VERSION = 4;

export type Stage =
  | "day"
  | "rules"
  | "rooms"
  | "you"
  | "holdings"
  | "watchlist"
  | "week";

/** The dot label under the progress bar. Short: it shares a line with a count. */
export const STAGE_LABEL: Record<Stage, string> = {
  day: "A red day",
  rules: "Ground rules",
  rooms: "The bar",
  you: "About you",
  holdings: "What you own",
  watchlist: "Watching",
  week: "Your first week",
};

/** The one element `aria-labelledby` points at, on every screen. */
export const HEADING_ID = "welcome-tour-title";

/*
  The heading and the sentence under it, for every screen, in one place.

  They used to live inside each stage's own block, which meant ten headings,
  ten slightly different wrappers, and — the actual bug — one `id` on the
  first of them. `aria-labelledby` pointed at an element that existed on
  screen one and nowhere else, so nine of the ten screens were an unlabelled
  dialog. Hoisting the pair fixes that by construction and makes every screen
  the same shape.
*/
export function screenCopy(
  stage: Stage,
  tierLabel: string | null
): { title: string; lede: string } {
  switch (stage) {
    case "day":
      return {
        title: `A bad day, in ${PRODUCT_NAME}`,
        lede:
          "Everything below is made up: a portfolio nobody owns, on a day that never happened. Seven of these eight companies fell because the whole market fell. One fell because of something that happened at the company. In a list of red numbers those look exactly the same, which is the problem this app exists for.",
      };
    case "rules":
      return {
        title: "What this does and does not do",
        lede:
          "Six things people believe about this app before they use it. Two of them are true. Better to find out which now than after you have typed everything in.",
      };
    case "rooms":
      return {
        title: "Where everything is",
        lede:
          "The bar along the bottom of the screen is how you move around, and your own portfolio sits in it too.",
      };
    case "you":
      return {
        title: "Two questions about you",
        lede:
          "These only change how much is shown at once. Nothing is locked away, both are changeable in Account whenever you like, and you can watch the app change underneath as you answer.",
      };
    case "holdings":
      return {
        title: "Add what you own",
        lede:
          "The ticker or the coin, how many you hold, and roughly what you paid. One company is enough to make Home worth opening, and there are four ways in so you can use whichever is least work.",
      };
    case "watchlist":
      return {
        title: "Anything you are watching?",
        lede:
          "Companies you do not own but are curious about. Pulse keeps an eye on them too, and the Sunday email can bring them up. Press Next if you have none in mind.",
      };
    case "week":
      return {
        title: tierLabel
          ? `That is the whole app. It is set to "${tierLabel}"`
          : "That is the whole app",
        lede:
          "Home is where you land, the bar along the bottom is everything else, and Account holds every switch this walkthrough set. The day the market falls and you want to know what it means, this is the app to open.",
      };
  }
}

/**
 * Which screens this reader gets, in order.
 *
 * One of them is conditional, for the reason a screen is ever conditional:
 * a screen that asks for something the reader has already given, or that
 * their account cannot act on, reads as an app that has not looked at them.
 * Somebody who already owns things is not asked to type them in, and a
 * paper-class account is not asked either, because their portfolio comes
 * from the teacher.
 *
 * Whether the walkthrough shows at all is a different question entirely, and
 * holdings have nothing to do with it. See `tourIsDue`.
 */
export function tourStages(input: {
  hasHoldings: boolean;
  classroomOnly: boolean;
}): Stage[] {
  const askForHoldings = !input.hasHoldings && !input.classroomOnly;
  return [
    "day",
    "rules",
    "rooms",
    "you",
    ...(askForHoldings ? (["holdings"] as Stage[]) : []),
    "watchlist",
    "week",
  ];
}

/*
  The one picture the walkthrough takes and cannot read itself.

  Reading a broker screenshot is Margus's job: it is a vision model call
  with a tool at the end of it, and Margus lives in the app rather than in
  this overlay. So the walkthrough holds the file, and hands it over the
  moment it closes, which is when the app underneath is there to take it.
  `Dashboard` listens for the event and runs the same import the empty
  Overview screen runs.

  A module-level box rather than storage, because a `File` is a handle to
  something on the reader's device and does not survive being written down.
  It is dropped on the way out, so a picture can only ever be imported once.
*/
export const TOUR_SCREENSHOT_EVENT = "upside:tour-screenshot";

let stashedScreenshot: File[] = [];

export function stashTourScreenshot(files: File[]) {
  stashedScreenshot = files.slice(0, 1);
}

export function takeTourScreenshot(): File[] {
  const files = stashedScreenshot;
  stashedScreenshot = [];
  return files;
}

/** Called once the walkthrough is closing, so the app can read the picture. */
export function handOverTourScreenshot() {
  if (typeof window === "undefined") return;
  if (stashedScreenshot.length === 0) return;
  window.dispatchEvent(new Event(TOUR_SCREENSHOT_EVENT));
}


const STORAGE_KEY = "portfell-welcome-tour";

/**
 * The browser's copy of the server's number.
 *
 * Only ever an optimisation: the server row is the truth, and the gate does
 * not decide anything from this alone. It exists so a reader who has just
 * finished the walkthrough does not see it flicker back on the next
 * navigation while the profile fetch is still in flight.
 */
export function loadSeenTourVersion(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const n = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function saveSeenTourVersion(version: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(version));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Asking for it again from Account. Zero is "has never seen one". */
export function clearSeenTourVersion() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Fired when Account asks for a replay, so the gate re-opens without a reload. */
export const WELCOME_TOUR_EVENT = "upside:welcome-tour";

export function requestWelcomeTour() {
  if (typeof window === "undefined") return;
  clearSeenTourVersion();
  window.dispatchEvent(new Event(WELCOME_TOUR_EVENT));
}

export function tourIsDue(seenVersion: number | null | undefined): boolean {
  return (seenVersion ?? 0) < WELCOME_TOUR_VERSION;
}
