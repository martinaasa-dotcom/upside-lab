"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { cn } from "@/lib/format";
import {
  MONTHLY_STEPS,
  NO_ANSWER,
  emptyMonthlyAnswers,
  monthlyHasAnswer,
  stepAnswerText,
  stepIsAnswered,
  type MonthlyBlockedId,
  type MonthlyChangeId,
  type MonthlyFeedbackAnswers,
  type MonthlyFeelId,
  type MonthlyHelpedId,
  type MonthlyStep,
} from "@/lib/feedback";
import { plainError } from "@/lib/plain-error";
import { postJsonOrQueue } from "@/lib/offline/queued-fetch";
import { useTimeout } from "@/lib/use-timeout";
import { Check, X } from "lucide-react";
import { useState } from "react";

export type FeedbackMode = "monthly" | "manual";

type Props = {
  mode: FeedbackMode;
  onClose: () => void;
  onSent: () => void;
};

const LAST_STEP = MONTHLY_STEPS.length - 1;

function Option({
  selected,
  showCheck,
  onClick,
  children,
}: {
  selected: boolean;
  showCheck: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <Button
      type="button"
      variant={selected ? "default" : "outline"}
      aria-pressed={selected}
      onClick={onClick}
      className="h-auto w-full justify-start py-2.5 text-left whitespace-normal"
    >
      {showCheck && (
        <Check data-icon="inline-start" className={selected ? "" : "opacity-0"} />
      )}
      {children}
    </Button>
  );
}

/** One filled bar per question answered so far, current question lit. */
function StepBar({
  index,
  answers,
}: {
  index: number;
  answers: MonthlyFeedbackAnswers;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="flex gap-1.5">
        {MONTHLY_STEPS.map((step, i) => (
          <div
            key={step.id}
            className={cn(
              "h-1 min-w-0 flex-1 rounded-full",
              i === index || stepIsAnswered(step, answers)
                ? "bg-primary"
                : "bg-muted"
            )}
          />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Question {index + 1} of {MONTHLY_STEPS.length}
      </p>
    </div>
  );
}

/**
 * The four questions at a glance with what is picked so far. Doubles as
 * the way back to any of them, so nobody has to scroll a wall of chips to
 * change one answer.
 */
function AnswerTable({
  index,
  answers,
  onJump,
}: {
  index: number;
  answers: MonthlyFeedbackAnswers;
  onJump: (i: number) => void;
}) {
  return (
    <div className="shrink-0 rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="h-8 px-3 text-xs font-normal text-muted-foreground">
              Question
            </TableHead>
            <TableHead className="h-8 px-3 text-right text-xs font-normal text-muted-foreground">
              Your answer
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MONTHLY_STEPS.map((step, i) => {
            const answer = stepAnswerText(step, answers);
            const here = i === index;
            return (
              <TableRow
                key={step.id}
                data-state={here ? "selected" : undefined}
                className="last:border-0"
              >
                <TableCell className="h-10 p-0">
                  <button
                    type="button"
                    onClick={() => onJump(i)}
                    aria-current={here ? "step" : undefined}
                    className={cn(
                      "h-10 w-full px-3 text-left text-sm",
                      here ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {step.short}
                    <span className="sr-only">: {step.question}</span>
                  </button>
                </TableCell>
                <TableCell
                  title={answer === NO_ANSWER ? undefined : answer}
                  className={cn(
                    "h-10 w-full max-w-0 truncate px-3 text-right text-sm",
                    answer === NO_ANSWER
                      ? "text-muted-foreground"
                      : "text-foreground"
                  )}
                >
                  {answer}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function toggleId<T extends string>(list: T[], id: T): T[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function FeedbackModal({ mode, onClose, onSent }: Props) {
  const later = useTimeout();
  const [answers, setAnswers] = useState<MonthlyFeedbackAnswers>(
    emptyMonthlyAnswers
  );
  const [step, setStep] = useState(0);
  const [topic, setTopic] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const current: MonthlyStep = MONTHLY_STEPS[step] ?? MONTHLY_STEPS[0]!;

  function pickSingle(step: MonthlyStep, id: string, atIndex: number) {
    const cleared = answers[step.id] === id;
    if (step.id === "feel") {
      setAnswers((prev) => ({
        ...prev,
        feel: cleared ? null : (id as MonthlyFeelId),
      }));
    } else {
      setAnswers((prev) => ({
        ...prev,
        change: cleared ? null : (id as MonthlyChangeId),
        changeNote: cleared ? "" : prev.changeNote,
      }));
    }
    // Picking an answer to a one-answer question moves on, the way the
    // onboarding questions do. Clearing one stays put.
    if (!cleared && atIndex < LAST_STEP) setStep(atIndex + 1);
  }

  function pickMulti(step: MonthlyStep, id: string) {
    setAnswers((prev) =>
      step.id === "helped"
        ? { ...prev, helped: toggleId(prev.helped, id as MonthlyHelpedId) }
        : { ...prev, blocked: toggleId(prev.blocked, id as MonthlyBlockedId) }
    );
  }

  function isSelected(step: MonthlyStep, id: string): boolean {
    const value = answers[step.id];
    return Array.isArray(value)
      ? (value as readonly string[]).includes(id)
      : value === id;
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const payload =
        mode === "monthly"
          ? { kind: "monthly" as const, ...answers }
          : { kind: "manual" as const, topic, body };
      const res = await postJsonOrQueue("/api/feedback", payload, "draft");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(plainError(data.error, "Couldn't send that."));
      }
      setSent(true);
      onSent();
      later(onClose, 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send that.");
    } finally {
      setBusy(false);
    }
  }

  const canSend =
    mode === "monthly"
      ? monthlyHasAnswer(answers)
      : topic.trim() && body.trim().length >= 8;
  const onLastStep = step >= LAST_STEP;

  return (
    <ViewportOverlay
      className="z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClose={onClose}
      ariaLabelledBy="feedback-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
        disabled={busy}
      />
      <div className="relative flex max-h-full w-full flex-col overflow-hidden rounded-t-xl bg-popover p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] ring-1 ring-foreground/20 sm:max-w-lg sm:rounded-xl sm:pb-6">
        <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
          <h3
            id="feedback-title"
            className="text-base font-semibold text-foreground"
          >
            {mode === "monthly" ? "How was this month?" : "Tell Upside"}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            title="Close"
            className="touch-target sm:size-7"
          >
            <X />
          </Button>
        </div>

        {sent ? (
          <p className="text-sm leading-relaxed text-foreground">
            Got it. Upside reads these.
          </p>
        ) : mode === "monthly" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {/* Said once, on the way in. After that the bar and the table
                say where you are, and the screen stays short. */}
            {step === 0 && (
              <p className="shrink-0 text-sm leading-relaxed text-muted-foreground">
                Four short questions about your last month in Upside Lab, one
                at a time. Skip any that don&apos;t fit.
              </p>
            )}

            <StepBar index={step} answers={answers} />

            <div className="scroll-host -mx-6 px-6 min-h-0 flex-1 overflow-y-auto">
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium text-foreground">
                  {current.question}
                </legend>
                {current.hint && (
                  <p className="text-sm text-muted-foreground">{current.hint}</p>
                )}
                <div className="grid gap-2 pt-1">
                  {current.options.map((opt) => (
                    <Option
                      key={opt.id}
                      selected={isSelected(current, opt.id)}
                      showCheck={current.multi}
                      onClick={() =>
                        current.multi
                          ? pickMulti(current, opt.id)
                          : pickSingle(current, opt.id, step)
                      }
                    >
                      {opt.label}
                    </Option>
                  ))}
                </div>
                {current.id === "change" && answers.change && (
                  <label className="flex flex-col gap-1 pt-2">
                    <span className="text-sm text-muted-foreground">
                      In one sentence, what should be different?
                    </span>
                    <Input
                      value={answers.changeNote}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          changeNote: e.target.value,
                        }))
                      }
                      maxLength={400}
                      placeholder="Name the screen or the moment."
                    />
                  </label>
                )}
              </fieldset>
            </div>

            <AnswerTable index={step} answers={answers} onJump={setStep} />
          </div>
        ) : (
          <div className="scroll-host -mx-6 px-6 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            <p className="text-sm leading-relaxed text-muted-foreground">
              What is this about, then dump the rest. A bug, a missing thing, or
              a rant. Upside reads these.
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">What is this about?</span>
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={120}
                placeholder="A bug, a missing thing, a rant"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Say it</span>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={8000}
                rows={8}
                placeholder="Word vomit is fine. What happened, what you wanted, what would be better."
                className="min-h-40 resize-y"
              />
            </label>
          </div>
        )}

        {error && <p className="mt-3 shrink-0 text-sm text-loss">{error}</p>}

        {!sent && (
          <div className="mt-4 flex shrink-0 items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={busy}
            >
              {mode === "monthly" ? "Not this month" : "Cancel"}
            </Button>
            <div className="flex gap-2">
              {mode === "monthly" && step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep((i) => Math.max(0, i - 1))}
                  disabled={busy}
                >
                  Back
                </Button>
              )}
              {mode === "monthly" && !onLastStep ? (
                <Button
                  type="button"
                  onClick={() => setStep((i) => Math.min(LAST_STEP, i + 1))}
                  disabled={busy}
                >
                  Next
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => void submit()}
                  disabled={busy || !canSend}
                >
                  {busy
                    ? "Sending…"
                    : mode === "monthly"
                      ? "Send this month"
                      : "Send it"}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </ViewportOverlay>
  );
}
