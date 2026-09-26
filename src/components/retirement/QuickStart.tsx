"use client";

/**
 * THE SECOND CARD: EVERYTHING ELSE THE PLAN COUNTS, EACH ALREADY SAYING
 * WHAT IT ASSUMES.
 *
 * The figures only the reader knows moved into the sentence at the top of
 * the room (`AnswerPanel`), which is where a person expects to describe
 * their own life. What is left here is the part with a defensible default:
 * a home, children, a car, pensions, returns, how long it lasts. Each is a
 * chip carrying the plan's current assumption, so the whole plan is
 * readable without opening anything, and ticking one opens that editor and
 * nothing else.
 *
 * THE EXAMPLE LIVES ARE ONE PRESS AWAY, NOT A ROW OF EIGHT CARDS. The room
 * already opens on one of them, so a reader never has to choose a life to
 * get an answer. Eight cards side by side was the loudest block on the page
 * for a choice most people never need to make; behind a single button they
 * are still there for the reader who wants to see a different shape of
 * life in one press.
 */

import { AdjustChips } from "@/components/retirement/AdjustChips";
import { CARD, Panel, PanelHeader } from "@/components/ui/Panel";
import { cn, currency } from "@/lib/format";
import type { AdjustTopic } from "@/lib/retirement/adjust";
import type { RetirementInputs } from "@/lib/retirement/plan";
import { regionById } from "@/lib/retirement/regions";
import {
  RETIREMENT_TEMPLATES,
  templateById,
  templateFacts,
  type RetirementTemplateId,
} from "@/lib/retirement/templates";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

export function QuickStart({
  inputs,
  open,
  onToggle,
  planningAge,
  swrPct,
  templateId,
  onTemplate,
  defaultShowLives = false,
}: {
  inputs: RetirementInputs;
  /** Which editors are open under the card. */
  open: readonly AdjustTopic[];
  onToggle: (topic: AdjustTopic) => void;
  planningAge: number;
  swrPct: number;
  templateId: RetirementTemplateId | null;
  /**
   * A press names a whole new life. It is handed the id rather than a
   * built plan because applying it also has to decide the pot, and that
   * decision needs the reader's real portfolios, which this card does not
   * own.
   */
  onTemplate: (id: RetirementTemplateId) => void;
  /** Open the example lives on the first render; for tests. */
  defaultShowLives?: boolean;
}) {
  const region = regionById(inputs.regionId);
  const chosen = templateById(templateId);
  const [showLives, setShowLives] = useState(defaultShowLives);

  return (
    <Panel>
      <PanelHeader
        icon={<SlidersHorizontal className="h-4 w-4" />}
        title="Fine-tune the plan"
        subtitle="What else it counts, and what it assumes for each. Tap one to change it."
      />

      <AdjustChips
        inputs={inputs}
        open={open}
        onToggle={onToggle}
        money={(n) => currency(n, 0, region.currency)}
        planningAge={planningAge}
        swrPct={swrPct}
      />

      <div className="flex flex-col gap-3">
        <button
          type="button"
          aria-expanded={showLives}
          onClick={() => setShowLives((v) => !v)}
          className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-foreground hover:text-muted-foreground"
        >
          {chosen
            ? `Started from "${chosen.label}". Try another example life`
            : "Start again from an example life"}
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform motion-reduce:transition-none",
              showLives && "rotate-180"
            )}
            aria-hidden
          />
        </button>
        {showLives ? (
          <>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {RETIREMENT_TEMPLATES.map((template) => {
                const on = template.id === templateId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onTemplate(template.id)}
                    className={cn(
                      CARD,
                      /*
                        A real `border`, never a ring or an outline: `ring-*`
                        is a box-shadow and `.glass-well` sets `box-shadow`
                        itself, so a ring loses; an outline is not clipped
                        to the card's radius and bulges on the corners.
                      */
                      "veil-hover flex min-w-0 flex-col gap-1 border-2 px-3.5 py-3 text-left transition-colors",
                      on ? "border-primary" : "border-transparent hover:border-border"
                    )}
                  >
                    <span className="text-sm font-semibold text-foreground">
                      {template.label}
                    </span>
                    <span className="flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-xs leading-snug tabular-nums text-muted-foreground/80">
                      {templateFacts(template).map((f) => (
                        <span key={f} className="whitespace-nowrap">
                          {f}
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {chosen ? (
                <>
                  <span className="text-foreground">{chosen.label}</span>:{" "}
                  {chosen.blurb} Every figure starts from this life until you
                  change it.
                </>
              ) : (
                "Pressing one replaces the whole plan with that life. Where you have real savings, they are kept."
              )}
            </p>
          </>
        ) : null}
      </div>
    </Panel>
  );
}
