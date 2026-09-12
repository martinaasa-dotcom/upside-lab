/**
 * HOW MUCH OF THIS ROOM IS ON SCREEN, WHICH IS A SETTING BECAUSE THE ANSWER
 * IS DIFFERENT FOR TWO DIFFERENT READERS AND NEITHER OF THEM IS WRONG.
 *
 * The module underneath is the most complete retirement arithmetic in this
 * app and everything in it earns its place. Shown all at once it is also
 * the surest way to lose somebody: forty inputs, eight panels, and a reader
 * who wanted to know when they could stop working being asked to pick an
 * equity glide path first. The whole of the withholding argument in this
 * repository says the answer to that is to explain rather than to hide, and
 * that argument is about ROOMS, not about the order things arrive in. A
 * room nobody can get into has been withheld. A panel one press below the
 * answer has not.
 *
 * So nothing here is ever unreachable. The control is on the first card,
 * beside the essentials, it says out loud what each level adds, and the
 * level is remembered, so a reader who wanted every dial keeps it and one
 * who wanted an answer is never asked the question twice.
 *
 * SIMPLE IS THE DEFAULT AND IT IS NOT A LESSER PAGE. It withholds INPUTS
 * and keeps every OUTPUT: the number, the ladder of milestones, the
 * earliest age, the survival curve, the grid of other lives, the spending
 * layers. That split is the whole design. What overwhelms a newcomer is
 * being asked things, not being shown things, and a page that answered with
 * less would have nothing to dig into.
 */

export type RetirementDetail = "simple" | "more" | "everything";

export const RETIREMENT_DETAILS: readonly RetirementDetail[] = [
  "simple",
  "more",
  "everything",
];

export const DETAIL_LABEL: Record<RetirementDetail, string> = {
  simple: "Simple",
  more: "More",
  everything: "Everything",
};

/** What pressing this level actually puts on the page, in one line. */
export const DETAIL_BLURB: Record<RetirementDetail, string> = {
  simple:
    "The figures on this card, and every answer this page can give. Nothing else to fill in.",
  more:
    "Adds your home, your children, a car, pensions, and how long the money has to last.",
  everything:
    "Adds what the money earns, the mix of shares and bonds by age, and the withdrawal rate itself.",
};

const RANK: Record<RetirementDetail, number> = {
  simple: 0,
  more: 1,
  everything: 2,
};

/** True when the page is at `level` or deeper. The one test every panel runs. */
export function atLeast(
  detail: RetirementDetail,
  level: RetirementDetail
): boolean {
  return RANK[detail] >= RANK[level];
}

export const RETIREMENT_DETAIL_KEY = "upside-retirement-detail-v1";

export function sanitizeDetail(raw: unknown): RetirementDetail {
  return RETIREMENT_DETAILS.includes(raw as RetirementDetail)
    ? (raw as RetirementDetail)
    : "simple";
}

export function loadRetirementDetail(): RetirementDetail {
  if (typeof window === "undefined") return "simple";
  try {
    return sanitizeDetail(window.localStorage.getItem(RETIREMENT_DETAIL_KEY));
  } catch {
    return "simple";
  }
}

export function saveRetirementDetail(detail: RetirementDetail): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RETIREMENT_DETAIL_KEY, detail);
  } catch {
    /* A full or blocked store is not worth breaking the page over. */
  }
}
