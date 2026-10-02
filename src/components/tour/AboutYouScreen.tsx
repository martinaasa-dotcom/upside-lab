"use client";

import { cn } from "@/lib/format";
import { type ExperienceTier } from "@/lib/experience-tier";
import { GraduationCap, Sparkles, TrendingUp } from "lucide-react";

/*
  The two questions, as three taps each.

  These are the only things the walkthrough asks about the reader rather
  than about their money. They used to be two columns of radio cards, each
  with a sentence of its own, beside a miniature Home that redrew itself as
  the answers changed: careful, and a screen of reading for two taps. The
  answers are three short words each now, and the one consequence of the
  answer picked is said once, under the row, after it is picked.

  What the first answer decides is which panels start folded away and
  nothing else: no room is hidden from anybody on any tier
  (`TIER_HIDDEN_META_TABS` and `TIER_HIDDEN_LAB_TABS` are empty on purpose),
  and the copy here must never say otherwise. `welcome-tour.test.ts` fails
  if it does.

  The options question carries a one-line gloss of what an option is,
  because a reader who has never heard the word cannot answer a question
  made of it, and that reader is exactly who the question exists for.
*/

export type Q1Answer = "new" | "comfortable" | "active";
export type Q2Answer = "never" | "know" | "regularly";

export const Q1_OPTIONS: {
  id: Q1Answer;
  label: string;
  detail: string;
  icon: typeof GraduationCap;
}[] = [
  {
    id: "new",
    label: "Just starting",
    /*
      No room waits for anybody. `TIER_HIDDEN_META_TABS` and
      `TIER_HIDDEN_LAB_TABS` are empty on every tier, so a promise that Lab
      "waits until you ask for it" was the walkthrough describing a gate
      that does not exist. What the first answer really decides is which
      panels start folded away, and that is what it says now.
    */
    detail: "Fewer panels open at once. Every room is still there.",
    icon: GraduationCap,
  },
  {
    id: "comfortable",
    label: "Comfortable",
    detail: "The middle setting. Most of the app open, at a normal pace.",
    icon: TrendingUp,
  },
  {
    id: "active",
    label: "Very experienced",
    detail: "Everything on, nothing simplified away.",
    icon: Sparkles,
  },
];

export const Q2_OPTIONS: { id: Q2Answer; label: string; detail: string }[] = [
  {
    id: "never",
    label: "Never",
    detail:
      "Everything about options stays out of your way. Switch it on in Account any time.",
  },
  {
    id: "know",
    label: "I know them",
    detail: "They stay visible. Ignore them and nothing changes.",
  },
  {
    id: "regularly",
    label: "Regularly",
    detail: "Covered-call tools stay on, Margus included.",
  },
];

export const Q1_TIER: Record<Q1Answer, ExperienceTier> = {
  new: "novice",
  comfortable: "investor",
  active: "advanced",
};
const Q2_TIER: Record<Q2Answer, ExperienceTier> = {
  never: "novice",
  know: "investor",
  regularly: "advanced",
};
const TIER_RANK: Record<ExperienceTier, number> = {
  novice: 0,
  investor: 1,
  advanced: 2,
};
export const TIER_Q1: Record<ExperienceTier, Q1Answer> = {
  novice: "new",
  investor: "comfortable",
  advanced: "active",
};

export function blendTier(q1: Q1Answer, q2: Q2Answer): ExperienceTier {
  return TIER_RANK[Q2_TIER[q2]] > TIER_RANK[Q1_TIER[q1]]
    ? Q2_TIER[q2]
    : Q1_TIER[q1];
}


/** One of three answers in a row. The picked one fills with the accent. */
function Choice({
  on,
  label,
  icon: Icon,
  onPick,
}: {
  on: boolean;
  label: string;
  icon?: typeof GraduationCap;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-2 rounded-xl px-2 text-center transition-[background-color,color,box-shadow,transform] duration-200 active:scale-[0.97] motion-reduce:transition-none",
        Icon ? "min-h-24 py-3" : "min-h-12 py-2",
        on
          ? "bg-primary text-primary-foreground shadow-[0_8px_24px_-12px_oklch(0.8_0.09_90/70%)]"
          : "card-sheen glass-well text-foreground hover:bg-hover"
      )}
    >
      {Icon ? (
        <Icon
          className={cn("size-5", on ? "text-primary-foreground" : "text-primary")}
          aria-hidden
        />
      ) : null}
      <span className="text-sm font-medium leading-tight text-balance">{label}</span>
    </button>
  );
}

/** What the picked answer changes, said once and only once it is picked. */
function Consequence({ text }: { text: string | null }) {
  return (
    <p
      className="min-h-10 text-sm leading-snug text-muted-foreground"
      aria-live="polite"
    >
      {text ?? ""}
    </p>
  );
}

export function AboutYouScreen({
  q1,
  q2,
  onQ1,
  onQ2,
}: {
  q1: Q1Answer | null;
  q2: Q2Answer | null;
  onQ1: (value: Q1Answer) => void;
  onQ2: (value: Q2Answer) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="font-heading text-base font-semibold tracking-tight text-foreground">
          How would you describe yourself?
        </p>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="How would you describe yourself?">
          {Q1_OPTIONS.map((opt) => (
            <Choice
              key={opt.id}
              on={q1 === opt.id}
              label={opt.label}
              icon={opt.icon}
              onPick={() => onQ1(opt.id)}
            />
          ))}
        </div>
        <Consequence
          text={Q1_OPTIONS.find((o) => o.id === q1)?.detail ?? null}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-heading text-base font-semibold tracking-tight text-foreground">
            Ever used options, like covered calls?
          </p>
          <p className="text-sm leading-snug text-muted-foreground">
            An option is agreeing today to sell a share at a set price later.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Ever used options?">
          {Q2_OPTIONS.map((opt) => (
            <Choice
              key={opt.id}
              on={q2 === opt.id}
              label={opt.label}
              onPick={() => onQ2(opt.id)}
            />
          ))}
        </div>
        <Consequence
          text={Q2_OPTIONS.find((o) => o.id === q2)?.detail ?? null}
        />
      </div>
    </div>
  );
}
