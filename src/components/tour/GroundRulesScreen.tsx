"use client";

import { Button } from "@/components/ui/button";
import { TourAsk } from "@/components/tour/TourRow";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { cn } from "@/lib/format";
import { Check, X } from "lucide-react";
import { useState } from "react";

/*
  The ground rules, sorted rather than read.

  These are the six facts that stop somebody being disappointed a week
  later, and as a list of six cards they were six cards nobody read. The
  two that matter most are the two people arrive with the opposite belief
  about: that this connects to their broker, and that it will tell them
  what to do. Being told either one is a sentence you skim. Guessing wrong
  about it, out loud, and being corrected in one line is the version that
  sticks, and it takes about ten seconds a claim.

  Nothing is scored and nothing is required. There is no total at the end,
  because this is not a quiz about the reader, it is six facts about the
  app that happen to arrive through their own hands.
*/

type Rule = {
  claim: string;
  /** True when the honest answer is "it does". */
  truth: boolean;
  answer: string;
};

const RULES: Rule[] = [
  {
    claim: "It connects to your broker and pulls your holdings in.",
    truth: false,
    answer:
      "It does not, and nothing here ever asks for a password to anything. You type what you own, or paste a screenshot of your broker screen and let it read the numbers off. That is the deal: a minute of setup, and then it works the same whichever broker you use.",
  },
  {
    claim: "It tells you what to buy and what to sell.",
    truth: false,
    answer: `It does not. ${ADVICE_DISCLAIMER_SHORT} No screen here will tell you to add to something or get out of it, however loud a day gets. It tells you what happened. What to do about it is yours.`,
  },
  {
    claim:
      "It says whether today's fall was your company or the whole market.",
    truth: true,
    answer:
      "It does, on every company you own, every day. Prices here are free ones and a few minutes behind, which is plenty for that and not enough to trade on. You cannot trade here anyway.",
  },
  {
    claim: "It draws a chart starting on the day you bought.",
    truth: false,
    answer:
      "It does not. Your return is measured against the average price you paid rather than a dated list of every trade, so there are no buy dates to draw from. If you want that chart, your broker already has it.",
  },
  {
    claim: "Other people can see your portfolio unless you stop them.",
    truth: false,
    answer:
      "They cannot. A portfolio is yours. A circle is invite-only and private, you are never added to one by signing in, and nothing is shared until you share it. People you share with see how the day went and never what you paid.",
  },
  {
    claim: "You can take everything with you, or delete the lot.",
    truth: true,
    answer:
      "You can, from Account, whenever you like. Export gives you the whole thing as a file. Deleting means deleting.",
  },
];

export function GroundRulesScreen() {
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<boolean | null>(null);
  const rule = RULES[Math.min(at, RULES.length - 1)]!;
  const answered = picked !== null;
  const right = answered && picked === rule.truth;
  const last = at >= RULES.length - 1;

  function pick(value: boolean) {
    setPicked(value);
  }

  function onward() {
    setPicked(null);
    setAt((i) => Math.min(i + 1, RULES.length - 1));
  }

  return (
    <div className="flex flex-col gap-4">
      <TourAsk>Say whether each one is true.</TourAsk>

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
            onClick={() => pick(true)}
          >
            It does
          </Button>
          <Button
            type="button"
            variant={picked === false ? "default" : "outline"}
            className="flex-1"
            aria-pressed={picked === false}
            onClick={() => pick(false)}
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
            <p
              className={cn(
                "text-sm leading-relaxed text-muted-foreground"
              )}
            >
              {rule.answer}
            </p>
          </div>
        )}

        {answered && !last && (
          <Button type="button" variant="outline" onClick={onward}>
            Next one
          </Button>
        )}
        {answered && last && (
          <p className="text-sm text-muted-foreground">
            That is all six. Every one of them is somewhere in Account, in
            plain words, whenever you want to check.
          </p>
        )}
      </div>
    </div>
  );
}
