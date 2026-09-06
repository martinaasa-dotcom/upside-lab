"use client";

import { Card, MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import { WhyThis } from "@/components/ui/WhyThis";
import { cashtag, cn } from "@/lib/format";
import { NO_VALUE } from "@/lib/format";
import { researchQuestionsProvenance } from "@/lib/provenance";
import type { FourQuestionAnswer } from "@/lib/company/four-questions";
import type { ModelRun } from "@/lib/ai/model-label";
import { HelpCircle } from "lucide-react";

/**
 * The four questions, at the top, because they are the research.
 *
 * Everything under this panel is the working behind one of them. The one
 * rule the layout has to carry is the module's own: a question the feed
 * could not answer looks unanswered rather than looking answered. So a
 * thin answer keeps its card, prints `n/a` where the figure would be and
 * loses the accent rule the others carry, which is a difference a reader
 * sees before they read a word.
 */
export function FourQuestions({
  ticker,
  answers,
  usesModel,
  model,
  at,
}: {
  ticker: string;
  answers: FourQuestionAnswer[];
  usesModel?: boolean;
  model?: ModelRun | null;
  at?: string | null;
}) {
  if (answers.length === 0) return null;
  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            The four questions
            <WhyThis
              provenance={researchQuestionsProvenance({
                ticker,
                usesModel,
                model,
                at,
              })}
            />
          </span>
        }
        subtitle={`The four a person has to answer before putting their own money into ${cashtag(ticker)}, answered in its own figures. Everything further down this page is the working behind one of them.`}
        icon={<HelpCircle className="h-4 w-4" />}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {answers.map((a, i) => (
          <Card
            key={a.id}
            tone="default"
            className={cn(
              "flex flex-col gap-3 p-5",
              // The accent rule is a reading, not decoration: it is on the
              // answers that have a figure behind them and off the ones
              // that do not.
              a.thin ? "opacity-80" : "border-l-2 border-l-primary/60"
            )}
          >
            <div className="flex items-start gap-3">
              <span className="font-mono text-xs font-semibold tabular-nums text-primary">
                #{i + 1}
              </span>
              <p className="min-w-0 text-sm font-semibold leading-snug text-foreground">
                {a.question}
              </p>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className={cn(
                  "font-mono text-2xl font-bold tabular-nums",
                  a.figure === NO_VALUE ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {a.figure}
              </span>
              <MicroLabel>{a.figureLabel}</MicroLabel>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {a.answer}
            </p>
            {a.against && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Measured against {a.against}.
              </p>
            )}
          </Card>
        ))}
      </div>
    </Panel>
  );
}
