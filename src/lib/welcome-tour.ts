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
 */
export const WELCOME_TOUR_VERSION = 2;

export type Stage =
  | "what"
  | "map"
  | "helps"
  | "rules"
  | "q1"
  | "q2"
  | "holdings"
  | "watchlist"
  | "email"
  | "done";

/** The dot label under the progress bar. Short: it shares a line with a count. */
export const STAGE_LABEL: Record<Stage, string> = {
  what: "What this is",
  map: "Where things are",
  helps: "What it does",
  rules: "Ground rules",
  q1: "About you",
  q2: "Options",
  holdings: "What you own",
  watchlist: "Watching",
  email: "Sunday email",
  done: "Done",
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
    case "what":
      return {
        title: `This is ${PRODUCT_NAME}`,
        lede:
          "You tell it what you already own: the name, how many you hold, what you paid. From then on it tries to answer one question your broker will not answer. Is the reason you bought this still true?",
      };
    case "map":
      return {
        title: "Where everything is",
        lede:
          "The bar along the bottom of the screen is the navigation, and your portfolio sits in it too. The + cell makes another one if you ever need it. The only thing not on that bar is your account, which is the picture in the top corner.",
      };
    case "helps":
      return {
        title: "Pulse, Margus, and the Sunday letter",
        lede:
          "All three are about the names you already hold. None of them will tell you to buy, sell, or hold.",
      };
    case "rules":
      return {
        title: "What this does and does not do",
        lede:
          "The first two are the ones people wish they had known. Better to be disappointed now than after you have typed everything in.",
      };
    case "q1":
      return {
        title: "How would you describe yourself?",
        lede:
          "This only changes how much is shown at once. Nothing is locked away, and you can change it whenever you like in Account.",
      };
    case "q2":
      return {
        title: "Have you used covered calls or other options?",
        lede:
          "A separate question from the last one. Plenty of very experienced investors have never touched an option. Also changeable in Account.",
      };
    case "holdings":
      return {
        title: "Add what you own",
        lede:
          "The ticker or the coin, how many you hold, and roughly what you paid. One is enough to make Home worth opening. If you have a lot of them, skip this. Home has a CSV import that takes the whole lot at once.",
      };
    case "watchlist":
      return {
        title: "Names you are watching",
        lede:
          "Ones you do not own but are curious about. Pulse keeps an eye on them too, and the Sunday email can bring them up. Skip if you have none in mind.",
      };
    case "email":
      return {
        title: "Want the Sunday email?",
        lede:
          "One email a week and nothing else. There is no daily note, no alert, and no “come back”. It starts once there are names in a portfolio, and it is one switch in Account either way.",
      };
    case "done":
      return {
        title: tierLabel
          ? `That is the whole app. Showing you the ${tierLabel} view`
          : "That is the whole app",
        lede:
          "Home is where you land. The bar along the bottom is everything else, and Account holds every switch this walkthrough set.",
      };
  }
}

/**
 * Which screens this reader gets, in order.
 *
 * Two of them are conditional, and both for the same reason: a screen that
 * asks for something the reader has already given, or that their account
 * cannot act on, reads as an app that has not looked at them. Somebody who
 * already owns things is not asked to type them in, and a paper-class account
 * is not asked either — their portfolio comes from the teacher.
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
    "what",
    "map",
    "helps",
    "rules",
    "q1",
    "q2",
    ...(askForHoldings ? (["holdings"] as Stage[]) : []),
    "watchlist",
    "email",
    "done",
  ];
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
