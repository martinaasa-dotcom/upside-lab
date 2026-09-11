"use client";

import { Button } from "@/components/ui/button";
import { TourAsk } from "@/components/tour/TourRow";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { Check, X } from "lucide-react";

/*
  The ground rules, sorted rather than read.

  These are the facts that stop somebody being disappointed a week later,
  and as a list of cards they were cards nobody read. The two that matter
  most are the two people arrive with the opposite belief about: that this
  connects to their broker, and that it will tell them what to do. Being
  told either one is a sentence you skim. Guessing wrong about it, out
  loud, and being corrected in one line is the version that sticks.

  Nothing is scored and nothing is required. There is no total at the end,
  because this is not a quiz about the reader, it is a handful of facts
  about the app that happen to arrive through their own hands.

  ## One forward button, and it is the shell's

  This screen used to keep its own claim index and draw its own "Next one"
  button inside the card, while the walkthrough's pinned footer carried a
  "Next" that advanced the whole stage. Two forward affordances, one of
  them the big one under the thumb, and pressing that one after the first
  claim silently threw away every claim after it -- which is exactly what
  happened to the first person who read it. The count lives in the shell
  now (`WelcomeTour`), and its footer steps through the claims before it
  leaves the screen, so there is one way forward and it cannot skip.

  ## Four, not six

  It was six, and two of them were housekeeping: no chart from the day you
  bought, and export/delete. Neither is a belief anybody arrives with, and
  a reader who has been asked six questions on the way in has been asked
  too many. Export and delete are worth saying, so they are said inside
  the privacy answer, where somebody worried about their data is already
  reading.
*/

type Rule = {
  claim: string;
  /** True when the honest answer is "it does". */
  truth: boolean;
  answer: string;
};

export const RULES: Rule[] = [
  {
    claim: "It connects to your broker and pulls your holdings in.",
    truth: false,
    answer:
      "It does not, and nothing here ever asks for a password. You type what you own, or paste a screenshot of your broker screen and let it read the numbers off.",
  },
  {
    claim: "It tells you what to buy and what to sell.",
    truth: false,
    answer: `It does not. ${ADVICE_DISCLAIMER_SHORT} It tells you what happened. What to do about it stays yours.`,
  },
  {
    claim:
      "It says whether today's fall was your company or the whole market.",
    truth: true,
    answer:
      "It does, on every company you own, every day. That one question is what the rest of this is built around.",
  },
  {
    claim: "Other people can see your portfolio unless you stop them.",
    truth: false,
    answer:
      "They cannot. A portfolio is private until you invite somebody into it, and signing in never puts you in a circle. Export it all, or delete it all, from Account whenever you like.",
  },
];

type Props = {
  /** Which claim is on screen. Owned by the shell, so its footer can step it. */
  at: number;
  picked: boolean | null;
  onPick: (value: boolean) => void;
};

export function GroundRulesScreen({ at, picked, onPick }: Props) {
  const rule = RULES[Math.min(at, RULES.length - 1)]!;
  const answered = picked !== null;
  const right = answered && picked === rule.truth;

  return (
    <div className="flex flex-col gap-4">
      <TourAsk>True or not?</TourAsk>

      <div className="card-sheen glass flex flex-col gap-4 rounded-lg p-4">
        <span className="text-xs tabular-nums text-muted-foreground">
          {at + 1} of {RULES.length}
        </span>
        <p className="text-base leading-relaxed text-foreground">
          {rule.claim}
        </p>

        {/*
          The reader's own pick is the filled one, and neither button is
          disabled. A disabled button drops to half opacity, which turned
          the right answer into the faintest thing on the card and left
          somebody reading a greyed-out yellow as though they had got it
          wrong. Which answer is true is said in words instead, in the
          first three of the sentence underneath.
        */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant={picked === true ? "default" : "outline"}
            className="flex-1"
            aria-pressed={picked === true}
            onClick={() => onPick(true)}
          >
            It does
          </Button>
          <Button
            type="button"
            variant={picked === false ? "default" : "outline"}
            className="flex-1"
            aria-pressed={picked === false}
            onClick={() => onPick(false)}
          >
            It does not
          </Button>
        </div>

        {answered && (
          <div className="flex items-start gap-3" aria-live="polite">
            {right ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-gain" aria-hidden />
            ) : (
              <X className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            )}
            <p className="text-sm leading-relaxed text-muted-foreground">
              {rule.answer}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
