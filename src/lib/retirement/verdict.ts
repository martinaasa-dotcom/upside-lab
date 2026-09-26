/**
 * THE ANSWER IN ONE BREATH: CAN I STOP WHEN I WANT TO, AND IF NOT, WHAT
 * WOULD GET ME THERE.
 *
 * Every figure this room computes is right, and a reader who arrives
 * wanting to know when they can stop working does not want most of them.
 * They want a yes or a not yet, how far along they are, and the one or two
 * changes that would turn a not yet into a yes. That is all this returns,
 * and every part of it is read off numbers the plan already has
 * (`projectedPot`, `required.target`, `monthlyToClose`, the solved earliest
 * age), so nothing here can disagree with the panels below it.
 *
 * THE FIXES ARE ARITHMETIC, NEVER ADVICE. "Stopping at 68 is enough" and
 * "adding 310 a month is enough" are facts about this plan that anybody can
 * check by pressing them; neither says the reader ought to do it, and no
 * string here begins "you should". A fix is offered as a press because the
 * fastest way to understand a lever is to pull it and watch the answer move.
 */

export type VerdictStatus = "covered" | "ready" | "short" | "never";

export type Fix =
  | { kind: "later"; age: number; text: string; press: string }
  | { kind: "save"; monthly: number; text: string; press: string };

export type Verdict = {
  status: VerdictStatus;
  /** The one line a reader reads first. */
  headline: string;
  /** The line under it, with both figures in it. */
  detail: string;
  /** Saved against needed, 0 to 1, for the bar. */
  progress: number;
  /** One or two presses that would turn a not yet into a yes. */
  fixes: Fix[];
  /** Said only when it is news: the plan works sooner than asked. */
  sooner: string | null;
};

export function buildVerdict(input: {
  retirementAge: number;
  /** What the pot would be on the day of stopping. */
  have: number;
  /** What stopping then needs, on the plan's own basis. */
  need: number;
  /** The first age the plan works at, or null on this saving. */
  earliestAge: number | null;
  /** The flat monthly top-up that closes the gap, from `buildPlan`. */
  monthlyToClose: number;
  money: (n: number) => string;
}): Verdict {
  const { money } = input;
  const age = Math.round(input.retirementAge);
  const have = Math.max(0, input.have);
  const need = Math.max(0, input.need);
  const earliest = input.earliestAge == null ? null : Math.round(input.earliestAge);

  if (need <= 0.5) {
    return {
      status: "covered",
      headline: `Yes. You could stop at ${age}.`,
      detail:
        "The pensions in this plan already pay for the life you picked, so the pot does not have to fund any of it.",
      progress: 1,
      fixes: [],
      sooner: null,
    };
  }

  const progress = Math.min(1, have / need);
  const pct = Math.floor(progress * 100);

  if (have >= need) {
    const extra = have - need;
    return {
      status: "ready",
      headline: `Yes. You could stop at ${age}.`,
      detail:
        extra >= need * 0.02
          ? `You would have ${money(have)}, which is ${money(extra)} more than the ${money(need)} it needs.`
          : `You would have ${money(have)}, just about the ${money(need)} it needs.`,
      progress,
      fixes: [],
      sooner:
        earliest != null && earliest < age
          ? `On this saving the earliest you could stop is ${earliest}.`
          : null,
    };
  }

  const fixes: Fix[] = [];
  if (earliest != null && earliest > age) {
    fixes.push({
      kind: "later",
      age: earliest,
      text: `Stopping at ${earliest} is enough.`,
      press: `Try ${earliest}`,
    });
  }
  const monthly = Math.ceil(input.monthlyToClose / 10) * 10;
  if (monthly > 0) {
    fixes.push({
      kind: "save",
      monthly,
      text: `Adding ${money(monthly)} a month is enough.`,
      press: `Try ${money(monthly)} more`,
    });
  }

  return {
    status: earliest == null ? "never" : "short",
    headline: `Not yet at ${age}.`,
    detail: `You would have ${money(have)} of the ${money(need)} it needs, ${pct}% of the way there.`,
    progress,
    fixes,
    sooner: null,
  };
}
