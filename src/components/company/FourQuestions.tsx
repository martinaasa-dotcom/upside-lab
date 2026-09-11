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
        subtitle={`Four questions to answer before putting money into ${cashtag(ticker)}, in its own figures. Everything below is the working behind one of them.`}
        icon={<HelpCircle className="h-4 w-4" />}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {answers.map((a, i) => (
          <Card
            key={a.id}
            tone="default"
            className={cn(
              "flex flex-col gap-2.5 p-5",
              // The accent rule is a reading, not decoration: it is on the
              // answers that have a figure behind them and off the ones
              // that do not.
              a.thin ? "opacity-80" : "border-l-2 border-l-primary/60"
            )}
          >
            <p className="text-sm font-semibold leading-snug text-foreground">
              <span className="mr-1.5 font-mono text-xs font-semibold tabular-nums text-primary">
                #{i + 1}
              </span>
              {a.question}
            </p>
            {/*
              Label above the figure, never beside it — the same order
              `Score` uses everywhere else in this room (CompanyNumbers,
              PositionFitCard, YourHolding). A label sharing the figure's
              own line had to compete with it for width and was the thing
              that wrapped first on a phone; on its own line above, it has
              the whole card to read across before the figure even starts.
              The two are one unit and sit closer to each other than to the
              question above or the answer below.
            */}
            <div className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                <MicroLabel>{a.figureLabel}</MicroLabel>
                {a.against && (
                  <span className="text-xs text-muted-foreground">
                    vs. {a.against}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "font-mono text-2xl font-bold tabular-nums",
                  a.figure === NO_VALUE ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {a.figure}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {a.answer}
            </p>
          </Card>
        ))}
      </div>
    </Panel>
  );
}
