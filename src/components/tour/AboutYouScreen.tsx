"use client";

import { MiniDock } from "@/components/tour/MiniDock";
import { TourAsk } from "@/components/tour/TourRow";
import { DOCK_TABS } from "@/components/mobile/MobileTabBar";
import { ROW_GLASS } from "@/components/tour/TourRow";
import { cn } from "@/lib/format";
import {
  shouldHideOptions,
  TIER_HIDDEN_LAB_TABS,
  TIER_HIDDEN_META_TABS,
  type ExperienceTier,
} from "@/lib/experience-tier";
import { Check, GraduationCap, Sparkles, TrendingUp } from "lucide-react";

/*
  The two questions, asked beside the app they change.

  These are the only two things the walkthrough asks about the reader
  rather than about their money, and both used to be a screen of radio
  buttons whose promises the reader had to take on trust: "fewer panels",
  "options stay hidden". So the answer is shown instead. A miniature Home
  sits under the questions, and as the answers change its bar loses the Lab
  glyph and its panel loses the covered calls row, in front of them, before
  they commit to anything.

  WHAT IT SHOWS IS READ FROM THE REAL GATES. `TIER_HIDDEN_META_TABS`,
  `TIER_HIDDEN_LAB_TABS` and `shouldHideOptions` are the same three the app
  itself asks, so a preview that disagrees with the app is not possible
  without changing what the app does.

  The options question carries a one-line gloss of what an option is,
  because a reader who has never heard the word cannot answer a question
  made of it, and that reader is exactly who the question exists to
  protect. For the same reason the "no" answer is never explained in the
  terms they have just said they do not know.
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
    label: "New to this, still learning the basics",
    detail: "Fewer panels at once. Lab waits until you ask for it.",
    icon: GraduationCap,
  },
  {
    id: "comfortable",
    label: "Comfortable. I understand stocks and portfolios",
    detail: "The middle setting. Most of the app, at a normal pace.",
    icon: TrendingUp,
  },
  {
    id: "active",
    label: "Very experienced. I follow markets closely",
    detail: "Everything on, nothing simplified away.",
    icon: Sparkles,
  },
];

export const Q2_OPTIONS: { id: Q2Answer; label: string; detail: string }[] = [
  {
    id: "never",
    label: "No, not familiar with them",
    detail:
      "Everything about options stays out of your way. You can switch it on later in Account.",
  },
  {
    id: "know",
    label: "I understand them but rarely use them",
    detail: "They stay visible. Ignore them and nothing changes.",
  },
  {
    id: "regularly",
    label: "Yes, regularly",
    detail: "Covered-call tools stay on, including in Margus.",
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

/** Lab's own sub-views, in the order Lab draws them. */
const LAB_VIEWS: { id: string; label: string }[] = [
  { id: "alloc", label: "Allocation" },
  { id: "risk", label: "Risk" },
  { id: "trends", label: "Trends" },
  { id: "seasonality", label: "Seasonality" },
];

function Choice({
  on,
  label,
  detail,
  icon: Icon,
  onPick,
}: {
  on: boolean;
  label: string;
  detail: string;
  icon?: typeof GraduationCap;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className={cn(
        ROW_GLASS,
        "veil-hover flex w-full items-start gap-3 p-4 text-left",
        on && "ring-1 ring-primary/40"
      )}
    >
      {Icon ? (
        <Icon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            on ? "text-primary" : "text-muted-foreground"
          )}
          aria-hidden
        />
      ) : null}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            "text-sm font-medium",
            on ? "text-primary" : "text-foreground"
          )}
        >
          {label}
        </span>
        <span className="text-sm text-muted-foreground">{detail}</span>
      </span>
      {on && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}

/** Home, small, with exactly the parts these two answers decide. */
function MiniHome({
  tier,
  hideOptions,
}: {
  tier: ExperienceTier | null;
  hideOptions: boolean;
}) {
  const hiddenMeta = tier ? TIER_HIDDEN_META_TABS[tier] : [];
  const hiddenLab = tier ? TIER_HIDDEN_LAB_TABS[tier] : [];
  const tabs = DOCK_TABS.filter(
    (t) => !t.metaId || !hiddenMeta.includes(t.metaId)
  );
  const labViews = LAB_VIEWS.filter((v) => !hiddenLab.includes(v.id));
  const showsLab = tabs.some((t) => t.id === "lab");

  return (
    <div className="card-sheen glass flex flex-col gap-3 rounded-lg p-4">
      <p className="text-xs text-muted-foreground">
        Your app, as these two answers leave it
      </p>
      <ul className="flex flex-col gap-2">
        <li className="card-sheen glass-well rounded-md px-3 py-2 text-sm text-muted-foreground">
          Today, and what each company you own did
        </li>
        <li className="card-sheen glass-well rounded-md px-3 py-2 text-sm text-muted-foreground">
          Your holdings, one row each
        </li>
        {!hideOptions && (
          <li className="card-sheen glass-well rounded-md px-3 py-2 text-sm text-muted-foreground">
            Covered calls, with a target price per holding
            {/*
              Read from the same rule Home uses, so this cannot drift: the
              covered-call panel starts open for everybody except somebody
              who has said they are new, and it is a tap away either way.
              This is what the first answer still decides now that no room
              is hidden from anybody. See TIER_HIDDEN_META_TABS.
            */}
            {tier === "novice" ? (
              <span className="text-muted-foreground/70">
                , folded away until you want it
              </span>
            ) : null}
          </li>
        )}
      </ul>
      <MiniDock tabs={tabs} activeId="home" say={false} />
      <p className="text-xs leading-relaxed text-muted-foreground">
        {showsLab
          ? `Lab is on the bar, showing ${labViews
              .map((v) => v.label)
              .join(", ")}.`
          : "Lab is off the bar for now. Every one of its views is still there the day you want it."}
      </p>
    </div>
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
  const tier = q1 && q2 ? blendTier(q1, q2) : q1 ? Q1_TIER[q1] : null;
  const hideOptions = shouldHideOptions(q2 ? q2 === "regularly" : null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <TourAsk>How would you describe yourself?</TourAsk>
        {Q1_OPTIONS.map((opt) => (
          <Choice
            key={opt.id}
            on={q1 === opt.id}
            label={opt.label}
            detail={opt.detail}
            icon={opt.icon}
            onPick={() => onQ1(opt.id)}
          />
        ))}
      </div>

      {/*
        Between the two questions rather than under both. The panel is a
        scroller and the whole screen is taller than a phone, so wherever
        this sits, one of the two answers changes something off screen. Here
        it is directly under Q1's options and directly above Q2's, which is
        the one placement where both taps are likely to have it in view.
      */}
      <MiniHome tier={tier} hideOptions={hideOptions} />

      <div className="flex flex-col gap-3">
        <TourAsk>Have you ever used options, such as covered calls?</TourAsk>
        <p className="text-sm leading-relaxed text-muted-foreground">
          An option is a side agreement on a share, like agreeing today to
          sell it at a set price later. This is a separate question from the
          last one: plenty of very experienced investors have never touched
          one.
        </p>
        {Q2_OPTIONS.map((opt) => (
          <Choice
            key={opt.id}
            on={q2 === opt.id}
            label={opt.label}
            detail={opt.detail}
            onPick={() => onQ2(opt.id)}
          />
        ))}
      </div>
    </div>
  );
}
