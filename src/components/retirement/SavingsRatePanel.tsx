"use client";

/**
 * WHAT YOU KEEP OF WHAT YOU EARN.
 *
 * The answer card above says when this reader could stop. This panel says
 * why that age is where it is, and it does it with one idea rather than a
 * page of them: the share of pay that is kept decides the wait, and it does
 * so twice over, because money not spent both goes into the pot and never
 * has to come back out of it. So spending less is worth more than earning
 * the same amount more, and earning more and spending it makes the wait
 * longer. Everything here is the reader's own figures run through
 * `savings-rate.ts`; the panel draws and never calculates.
 *
 * THREE PICTURES, EACH ANSWERING ONE QUESTION. Where the pay goes (a bar
 * split three ways). What the wait looks like at every share kept (a bar
 * per five per cent, theirs lit, any of them pressable). The same amount a
 * month three ways, and one everyday cost priced over a working life.
 *
 * IT ASKS FOR ONE FIGURE BEFORE IT SAYS ANYTHING. Without take-home pay
 * there is no share to take, and a lesson drawn on a guessed income is a
 * statement about somebody else. The pension field is the second figure
 * because leaving it out is the commonest reason a real savings rate reads
 * far lower than it is.
 *
 * It states facts and never tells anybody what to cut. An everyday cost is
 * an example of how small amounts add up, priced in the reader's money,
 * with no suggestion that it ought to go.
 */

import { Field, FIELD_GRID, currencyCodeFor } from "@/components/retirement/fields";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { Button } from "@/components/ui/button";
import { CARD, InfoTip, MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import { barFillPct, cn, currency } from "@/lib/format";
import type { PlanResult, RetirementInputs } from "@/lib/retirement/plan";
import { regionById } from "@/lib/retirement/regions";
import {
  HABIT_PERIODS,
  HABITS,
  habitResult,
  levers,
  loadPay,
  localHabitPrice,
  ownYears,
  paySplit,
  rateCurve,
  roundStep,
  savePay,
  yearsSaid,
  type LessonContext,
  type StoredPay,
} from "@/lib/retirement/savings-rate";
import { ChevronDown, Scale } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

/** The tallest bar on the chart, in years. Anything longer is drawn to the top. */
const CHART_CAP_YEARS = 60;

const PENSION_FILL = "var(--cat-1)";
const INVEST_FILL = "var(--primary)";

export function SavingsRatePanel({
  inputs,
  plan,
  patch,
  initialPay,
}: {
  inputs: RetirementInputs;
  plan: PlanResult;
  patch: (next: Partial<RetirementInputs>) => void;
  /** For a render test: the pay a stored visit would have restored. */
  initialPay?: StoredPay;
}) {
  const region = regionById(inputs.regionId);
  const code = currencyCodeFor(region.currency);
  const money = (n: number, digits = 0) => currency(n, digits, code);

  const [pay, setPay] = useState<StoredPay>(
    initialPay ?? { takeHomeMonthly: 0, pensionMonthly: 0 }
  );
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!initialPay) setPay(loadPay());
    setLoaded(true);
    // Once, on arrival: `initialPay` is a starting value, not a live input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (loaded) savePay(pay);
  }, [pay, loaded]);

  const planMonthly = inputs.annualContribution / 12;
  const split = paySplit({ ...pay, planMonthly });

  const swrPct = plan.required.swr.ratePct;
  const multiple = swrPct > 0 ? 100 / swrPct : 25;
  const realReturnPct = plan.realReturnPct;
  const startPot = inputs.currentPot + inputs.otherSavings;
  const age = Math.round(inputs.currentAge);

  const lesson: LessonContext | null = split
    ? { split, startPot, realReturnPct, multiple }
    : null;

  const takeHomeId = useId();
  const pensionId = useId();

  return (
    <Panel>
      <PanelHeader
        icon={<Scale className="h-4 w-4" />}
        title="How much of your pay you keep"
        subtitle="Pension included, this decides when you could stop."
      />

      <div className={FIELD_GRID}>
        <Field
          label="Take-home pay a month"
          htmlFor={takeHomeId}
          note="After tax."
        >
          <FormattedNumberInput
            id={takeHomeId}
            kind="money"
            value={pay.takeHomeMonthly}
            currency={code}
            onChange={(n) => setPay((p) => ({ ...p, takeHomeMonthly: n }))}
            className="font-mono tabular-nums"
          />
        </Field>
        <Field
          label="Into a pension a month"
          htmlFor={pensionId}
          note="Yours and your employer's, before take-home."
        >
          <FormattedNumberInput
            id={pensionId}
            kind="money"
            value={pay.pensionMonthly}
            currency={code}
            onChange={(n) => setPay((p) => ({ ...p, pensionMonthly: n }))}
            className="font-mono tabular-nums"
          />
        </Field>
      </div>

      {split && lesson ? (
        <Lesson
          lesson={lesson}
          money={money}
          age={age}
          stopAge={Math.round(inputs.retirementAge)}
          swrPct={swrPct}
          planMonthly={planMonthly}
          onUsePension={() => patch({ annualContribution: split.pension * 12 })}
          region={region}
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Add what you take home to see what you keep.
          </p>
          <HabitBlock
            lesson={null}
            money={money}
            region={region}
            stopAge={Math.round(inputs.retirementAge)}
            yearsToStop={Math.max(0, inputs.retirementAge - inputs.currentAge)}
            realReturnPct={realReturnPct}
            multiple={multiple}
            swrPct={swrPct}
          />
        </>
      )}
    </Panel>
  );
}

function Lesson({
  lesson,
  money,
  age,
  stopAge,
  swrPct,
  planMonthly,
  onUsePension,
  region,
}: {
  lesson: LessonContext;
  money: (n: number, digits?: number) => string;
  age: number;
  stopAge: number;
  swrPct: number;
  planMonthly: number;
  onUsePension: () => void;
  region: ReturnType<typeof regionById>;
}) {
  const { split, multiple, realReturnPct } = lesson;
  const ratePct = Math.round(split.rate * 100);
  const years = ownYears(lesson);

  const curve = useMemo(
    () =>
      rateCurve({
        earned: split.earned,
        startPot: lesson.startPot,
        realReturnPct,
        multiple,
      }),
    [split.earned, lesson.startPot, realReturnPct, multiple]
  );
  const nearest = Math.min(95, Math.max(5, Math.round(ratePct / 5) * 5));
  const [picked, setPicked] = useState<number | null>(null);
  const shown = picked ?? nearest;
  /* Only once a bar is pressed: the reader's own figure is the line above. */
  const shownPoint = picked == null ? null : curve.find((p) => p.ratePct === picked);

  const step = Math.max(1, roundStep(split.earned * 0.05));
  const three = useMemo(() => levers(lesson, step), [lesson, step]);

  const parts = [
    { id: "pension", label: "Pension", value: split.pension, fill: PENSION_FILL },
    { id: "invested", label: "Invested", value: split.invested, fill: INVEST_FILL },
    { id: "spent", label: "Spent", value: split.spent, fill: "color-mix(in oklab, var(--foreground) 16%, transparent)" },
  ].filter((p) => p.value > 0.5);

  return (
    <>
      {/* WHERE THE PAY GOES. */}
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          You keep{" "}
          <span className="font-heading text-2xl font-semibold text-foreground tabular-nums">
            {ratePct}%
          </span>{" "}
          of the{" "}
          <span className="font-mono tabular-nums text-foreground">{money(split.earned)}</span>{" "}
          you earn a month.
        </p>
        <div
          className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
          role="img"
          aria-label={`Of ${money(split.earned)} a month: ${parts
            .map((p) => `${p.label.toLowerCase()} ${money(p.value)}`)
            .join(", ")}.`}
        >
          {parts.map((p) => (
            <div
              key={p.id}
              className="h-full first:rounded-l-full last:rounded-r-full motion-safe:transition-all motion-safe:duration-300"
              style={{ flexGrow: p.value, flexBasis: 0, background: p.fill }}
            />
          ))}
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          {parts.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.fill }} aria-hidden />
              <span className="text-muted-foreground">{p.label}</span>
              <span className="font-mono tabular-nums text-foreground">{money(p.value)}</span>
            </li>
          ))}
        </ul>
        {split.pensionExceedsPlan ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <p className="min-w-0">
              Your plan puts in{" "}
              <span className="font-mono tabular-nums text-foreground">{money(planMonthly)}</span>{" "}
              a month, less than your pension alone.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onUsePension}>
              Use {money(split.pension)} instead
            </Button>
          </div>
        ) : null}
      </div>

      {/* THE WAIT AT EVERY SHARE KEPT. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <MicroLabel>Years until savings alone cover your life</MicroLabel>
          <p className="text-sm text-muted-foreground">
            {years == null ? (
              <>At {ratePct}% it would take more than a hundred years.</>
            ) : years === 0 ? (
              <>What you have saved already covers a life like this one.</>
            ) : (
              <>
                At {ratePct}%:{" "}
                <span className="font-medium text-foreground">about {yearsSaid(years)}</span>, at{" "}
                {Math.round(age + years)}.
              </>
            )}
          </p>
        </div>
        <RateChart
          curve={curve}
          own={nearest}
          shown={shown}
          onPick={(r) => setPicked(r === nearest ? null : r)}
        />
        {shownPoint ? (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Keeping {shownPoint.ratePct}%, living on{" "}
            <span className="font-mono tabular-nums text-foreground">
              {money(split.earned * (1 - shownPoint.ratePct / 100))}
            </span>{" "}
            a month:{" "}
            <span className="font-medium text-foreground">
              {shownPoint.years == null
                ? "more than a hundred years"
                : shownPoint.years === 0
                  ? "already there"
                  : `about ${yearsSaid(shownPoint.years)}, at ${Math.round(age + shownPoint.years)}`}
            </span>
            .
          </p>
        ) : null}
        <p className="text-xs leading-relaxed text-muted-foreground">
          No pension counted, so it can differ from the answer.{" "}
          <InfoTip
            text={`Living as you do now, the day your savings reach ${Math.round(multiple)} times a year of your spending, enough to draw ${swrPct.toFixed(1)}% a year, growing ${realReturnPct.toFixed(1)}% a year after inflation. The answer also counts pensions and a retirement budget.`}
          >
            How it is worked out
          </InfoTip>
        </p>
      </div>

      {/* THE SAME AMOUNT, THREE WAYS. */}
      <LeverBlock base={three.base} levers={three.levers} step={step} money={money} />

      <HabitBlock
        lesson={lesson}
        money={money}
        region={region}
        stopAge={stopAge}
        yearsToStop={Math.max(0, stopAge - age)}
        realReturnPct={realReturnPct}
        multiple={multiple}
        swrPct={swrPct}
      />
    </>
  );
}

function RateChart({
  curve,
  own,
  shown,
  onPick,
}: {
  curve: ReturnType<typeof rateCurve>;
  own: number;
  shown: number;
  onPick: (ratePct: number) => void;
}) {
  const finite = curve.map((p) => p.years).filter((y): y is number => y != null);
  const top = Math.min(CHART_CAP_YEARS, Math.max(10, ...finite));
  const ticks = [0, 20, 40, 60].filter((t) => t <= top + 0.01);
  return (
    <div className="flex gap-2">
      <div className="relative h-40 w-6 shrink-0 font-mono text-xs text-muted-foreground tabular-nums" aria-hidden>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0" style={{ bottom: `${(t / top) * 100}%`, transform: "translateY(50%)" }}>
            {t}
          </span>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="relative h-40 border-b border-border">
          {ticks.slice(1).map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 border-t border-foreground/[0.06]"
              style={{ bottom: `${(t / top) * 100}%` }}
              aria-hidden
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]" role="group" aria-label="Years to wait at each share of pay kept">
            {curve.map((p) => {
              const y = p.years == null ? top : Math.min(top, p.years);
              const isOwn = p.ratePct === own;
              const isShown = p.ratePct === shown;
              return (
                <button
                  key={p.ratePct}
                  type="button"
                  onClick={() => onPick(p.ratePct)}
                  aria-pressed={isShown}
                  aria-label={`Keeping ${p.ratePct}%: ${
                    p.years == null ? "more than a hundred years" : `about ${yearsSaid(p.years) ?? ""}`
                  }`}
                  className="group flex h-full min-w-0 flex-1 items-end focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span
                    className={cn(
                      "block w-full rounded-t-[4px] motion-safe:transition-[height,background-color] motion-safe:duration-300",
                      isOwn
                        ? "bg-primary"
                        : isShown
                          ? "bg-foreground/40"
                          : "bg-foreground/15 group-hover:bg-foreground/25"
                    )}
                    style={{ height: `${Math.max(1.5, barFillPct((y / top) * 100))}%` }}
                  />
                </button>
              );
            })}
          </div>
        </div>
        <div className="relative h-4 font-mono text-xs text-muted-foreground tabular-nums" aria-hidden>
          {[20, 40, 60, 80].map((r) => (
            <span
              key={r}
              className="absolute -translate-x-1/2"
              style={{ left: `${(((r - 5) / 5 + 0.5) / 19) * 100}%` }}
            >
              {r}%
            </span>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">Share of pay kept. Yours is gold; press any bar.</p>
      </div>
    </div>
  );
}

const LEVER_LABEL = {
  "spend-less": "Spending it less",
  "earn-save": "Earning it more, and keeping it",
  "earn-spend": "Earning it more, and spending it",
} as const;

function LeverBlock({
  base,
  levers: rows,
  step,
  money,
}: {
  base: number | null;
  levers: ReturnType<typeof levers>["levers"];
  step: number;
  money: (n: number, digits?: number) => string;
}) {
  if (base == null || base === 0) return null;
  const biggest = Math.max(0.1, ...rows.map((r) => Math.abs(r.change ?? 0)));
  const spend = rows.find((r) => r.id === "spend-less")?.change;
  const earn = rows.find((r) => r.id === "earn-save")?.change;
  const ratio = spend != null && earn != null && earn < -0.05 ? spend / earn : null;
  return (
    <div className="flex flex-col gap-3">
      <MicroLabel>{`The same ${money(step)} a month, three ways`}</MicroLabel>
      <ul className={cn(CARD, "flex flex-col gap-3 p-4")}>
        {rows.map((r) => {
          const change = r.change;
          const sooner = change != null && change < 0;
          const said = change == null ? null : yearsSaid(change);
          return (
            <li key={r.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-sm text-foreground">{LEVER_LABEL[r.id]}</span>
                <span className="shrink-0 whitespace-nowrap font-mono text-sm tabular-nums text-foreground">
                  {said == null
                    ? "past a hundred years"
                    : Math.abs(change ?? 0) < 1 / 24
                      ? "no change"
                      : `${said} ${sooner ? "sooner" : "later"}`}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-foreground/[0.06]">
                <div
                  className={cn(
                    "h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300",
                    sooner ? "bg-primary" : "bg-foreground/35"
                  )}
                  style={{ width: `${barFillPct((Math.abs(change ?? 0) / biggest) * 100)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Spending less works twice: more goes in, and the pot has less to pay for.
        {ratio != null && ratio > 1.05 ? (
          <>
            {" "}
            Here it is{" "}
            <span className="font-medium text-foreground">{ratio.toFixed(1)} times</span> as
            strong.
          </>
        ) : null}
      </p>
    </div>
  );
}

function HabitBlock({
  lesson,
  money,
  region,
  stopAge,
  yearsToStop,
  realReturnPct,
  multiple,
  swrPct,
}: {
  lesson: LessonContext | null;
  money: (n: number, digits?: number) => string;
  region: ReturnType<typeof regionById>;
  stopAge: number;
  yearsToStop: number;
  realReturnPct: number;
  multiple: number;
  swrPct: number;
}) {
  const code = currencyCodeFor(region.currency);
  const [habitId, setHabitId] = useState(HABITS[0].id);
  const habit = HABITS.find((h) => h.id === habitId) ?? HABITS[0];
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const amount = amounts[habit.id] ?? localHabitPrice(region, habit.gbp);
  const amountId = useId();
  const result = habitResult(amount, habit.period, {
    yearsToStop,
    realReturnPct,
    multiple,
    lesson,
  });
  const word = HABIT_PERIODS[habit.period].word;
  /*
    Folded by default. It is the last of four pictures in a panel that
    already makes the same point with the reader's own pay, so it waits one
    press away rather than adding a fourth block to every visit.
  */
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-foreground hover:text-muted-foreground"
      >
        Small things, every day
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform motion-reduce:transition-none",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <>
          <div className="flex flex-wrap gap-2">
            {HABITS.map((h) => (
              <Button
                key={h.id}
                type="button"
                variant={h.id === habit.id ? "default" : "outline"}
                size="sm"
                aria-pressed={h.id === habit.id}
                onClick={() => setHabitId(h.id)}
              >
                {h.label}
              </Button>
            ))}
          </div>
          <Field label={`${habit.label}, ${word}`} htmlFor={amountId} className="max-w-[14rem]">
            <FormattedNumberInput
              id={amountId}
              kind="money"
              digits={2}
              value={amount}
              currency={code}
              onChange={(n) => setAmounts((a) => ({ ...a, [habit.id]: n }))}
              className="font-mono tabular-nums"
            />
          </Field>
          <div className={cn(CARD, "grid divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0")}>
            <Cell label="A year" value={money(result.yearly)} />
            <Cell
              label={yearsToStop > 0 ? `Invested until ${stopAge}` : "Invested"}
              value={yearsToStop > 0 ? money(result.invested) : money(result.yearly)}
            />
            <Cell label="Less your pot needs" value={money(result.targetLess)} />
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {yearsToStop > 0 ? (
              <>Invested at {realReturnPct.toFixed(1)}% a year after inflation. </>
            ) : null}
            Gone for good, it also shrinks the pot you need, at a{" "}
            {swrPct.toFixed(1)}% draw.
            {result.sooner != null && result.sooner >= 1 / 12 ? (
              <>
                {" "}
                That brings the day forward by{" "}
                <span className="font-medium text-foreground">{yearsSaid(result.sooner)}</span>.
              </>
            ) : null}
          </p>
        </>
      ) : null}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 px-4 py-3 sm:flex-col sm:items-start sm:gap-1 sm:py-4">
      <MicroLabel>{label}</MicroLabel>
      <span className="shrink-0 font-mono text-base tabular-nums text-foreground sm:text-lg">{value}</span>
    </div>
  );
}
