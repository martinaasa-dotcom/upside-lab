"use client";

import { TermTip } from "@/components/ui/TermTip";
import { BelowFold } from "@/components/BelowFold";
import {
  COMPOUND_STORAGE_KEY,
  DEFAULT_COMPOUND_INPUTS,
  calculateCompound,
  type CompoundInputs,
  type CompoundResult,
  type ContributionFrequency,
  type ContributionMode,
} from "@/lib/compound-interest";
import {
  BROAD_MARKET_ANNUAL_PCT,
  buildCompareScenarios,
  buildCompoundMilestones,
  buildMilestoneTakeaway,
  buildNarrative,
  buildYearStories,
  COMPOUND_CASH_YIELD_ANNUAL_PCT,
  findTippingYear,
  formatMilestoneDate,
  loadMilestoneActuals,
  saveMilestoneActuals,
  storyYears,
  type CompareScenario,
  type CompoundMilestone,
  type MilestoneActuals,
} from "@/lib/compound-play";
import { blendedExpectedAnnualReturn } from "@/lib/forecast-conviction";
import { WhyThis } from "@/components/ui/WhyThis";
import { growthRateProvenance } from "@/lib/provenance";
import { NO_VALUE, cn, percent } from "@/lib/format";
import { persistCompoundSnapshot } from "@/lib/offline/snapshots";
import { PALETTE } from "@/lib/palette";
import { safeDiv } from "@/lib/money";
import {
  displayToUsd,
  formatEurUsdHint,
  loadCompoundCurrency,
  saveCompoundCurrency,
  usdToDisplay,
  type DisplayCurrency,
  type EurUsdQuote,
} from "@/lib/display-currency";
import { htmlCell, htmlCellText, htmlHeadRow, htmlTable } from "@/components/FluidTable";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import {
  Calculator,
  CheckCircle2,
  ChevronRight,
  Copy,
  Share2,
  Target,
} from "lucide-react";
import { Fragment, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from "react";
import { useTimeout } from "@/lib/use-timeout";
import {
  MicroLabel,
  PANEL_STACK,
  PANEL_STACK_GAP,
  Panel,
  PanelHeader,
  InfoTip,
  Pill,
  Segmented,
} from "@/components/ui/Panel";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { ChartXRail, ChartYAxis } from "@/components/ui/ChartAxis";
import { Button } from "@/components/ui/button";
import { StatStrip } from "@/components/ui/StatStrip";

type CurrencyCode = DisplayCurrency;

const CURRENCIES: { code: CurrencyCode; label: string }[] = [
  { code: "USD", label: "USD" },
  { code: "EUR", label: "EUR" },
];

const FIELD_CLASS = "w-full min-w-0 max-w-full font-semibold tabular-nums";
const FIELD_STACK = "flex flex-col gap-5";

const SHEET_PANEL = "h-auto min-w-0 max-w-full lg:h-full";

const YEAR_PRESETS = [5, 10, 20, 30] as const;
const DURATION_MIN_YEARS = 1;
const DURATION_MAX_YEARS = 50;

/**
 * The years field, typed over rather than appended to.
 *
 * Clamping on every keystroke used to mean typing a two-digit number one
 * character at a time could never land: the field held onto whatever was
 * already there, so the first new digit landed beside it rather than
 * replacing it, and a value that ran past 50 got thrown all the way back
 * down. This only reflects the committed value while the reader is not
 * typing, and only clamps once they are done, on blur, the way every field
 * with a `min`/`max` on this page should but not all of them did.
 *
 * `type="text"` rather than `type="number"`: `.select()` on a native
 * number input is not reliable across browsers (Firefox has long refused
 * `selectionStart`/`selectionEnd` on it) and the control mangles what is
 * typed in its own ways (a leading zero vanishes, `1e2` is a legal
 * partial value). Every other editable number in this app already stays
 * on `type="text"` with `inputMode` steering the keyboard instead.
 */
function DurationYearsInput({
  id,
  value,
  onChange,
  className,
}: {
  id?: string;
  value: number;
  onChange: (years: number) => void;
  className?: string;
}) {
  const focused = useRef(false);
  const [text, setText] = useState(() => (Number.isFinite(value) ? String(value) : ""));

  useEffect(() => {
    if (!focused.current) setText(Number.isFinite(value) ? String(value) : "");
  }, [value]);

  // See the matching comment on `CountField` in retirement/fields.tsx:
  // `value` has already moved by the time Escape is pressed (every valid
  // keystroke calls `onChange` live), and `.blur()` called from a keydown
  // handler runs `onBlur` synchronously before React applies this same
  // handler's own state update — so both need to be tracked explicitly
  // rather than trusted to still hold what they held a moment ago.
  const beforeEdit = useRef(value);
  const skipNextBlurCommit = useRef(false);

  function commit(raw: string) {
    focused.current = false;
    const trimmed = raw.trim();
    const parsed = trimmed === "" ? Number.NaN : Number(trimmed);
    const base = Number.isFinite(parsed) ? parsed : Number.isFinite(value) ? value : DURATION_MIN_YEARS;
    const clamped = Math.min(DURATION_MAX_YEARS, Math.max(DURATION_MIN_YEARS, base));
    setText(String(clamped));
    onChange(clamped);
  }

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      value={text}
      onFocus={(e) => {
        focused.current = true;
        beforeEdit.current = Number.isFinite(value) ? value : DURATION_MIN_YEARS;
        e.target.select();
      }}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "");
        setText(digits);
        if (digits === "") return;
        const next = Number(digits);
        if (Number.isFinite(next)) onChange(next);
      }}
      onBlur={(e) => {
        if (skipNextBlurCommit.current) {
          skipNextBlurCommit.current = false;
          focused.current = false;
          return;
        }
        commit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          skipNextBlurCommit.current = true;
          focused.current = false;
          setText(String(beforeEdit.current));
          onChange(beforeEdit.current);
          e.currentTarget.blur();
        }
      }}
      className={className}
    />
  );
}

/*
 * Every one of these is an assumption, and the page compounds whichever one
 * is chosen for up to fifty years, so each says what it is rather than
 * standing there as a bare number. The reader's own mix comes first and is
 * where the page opens once there are holdings to blend (Martin's call,
 * 2026-09-25): a calculator about your money starts on your money, and the
 * caption under the box says plainly what that rate is and is not.
 */
const RATE_PRESETS = [
  { id: "book", label: "Yours", title: "This app's outlook for what you hold" },
  { id: "spy", label: "10%", title: "The whole US market's long run average" },
  { id: "15", label: "15%", title: "A very good stretch for the whole market" },
  { id: "25", label: "25%", title: "What only a handful of years look like" },
] as const;

/** The sentence printed under the rate box for whichever preset is on. */
function rateCaveat(preset: string | null, mixPct: number): string {
  if (preset === "spy") {
    return `${BROAD_MARKET_ANNUAL_PCT}% a year is the historical average for the whole US market, before inflation is taken off. Nobody gets it every year.`;
  }
  if (preset === "book") {
    return `This app's growth outlook for what you hold: about ${mixPct}% a year before inflation. A view of the next few years, not a record, and a big assumption over decades.`;
  }
  if (preset === "15") {
    return "15% a year is a very good stretch for the whole market, half as much again as its long run average.";
  }
  if (preset === "25") {
    return "25% a year is what only a handful of years look like. Very little holds that for decades.";
  }
  return "This is the rate you typed. Nothing on this page knows whether it is realistic.";
}

/** "7 years", "7 years and 3 months". Never "7y 3m". */
function spanText(years: number, months: number): string {
  const y = `${years} ${years === 1 ? "year" : "years"}`;
  if (!(months > 0)) return y;
  return `${y} and ${months} ${months === 1 ? "month" : "months"}`;
}

function milestoneDone(row: CompoundMilestone): boolean {
  return row.hit || Boolean(row.actualDate);
}

function milestoneWhen(row: CompoundMilestone): string {
  if (row.actualDate) {
    const [y, m, d] = row.actualDate.split("-").map(Number);
    if (y && m && d) return formatMilestoneDate(new Date(y, m - 1, d));
  }
  if (row.hit) return "Already past it";
  if (row.targetDate) return formatMilestoneDate(row.targetDate);
  return "50+ years out";
}

function milestoneWait(row: CompoundMilestone): string | null {
  if (milestoneDone(row) || row.yearsUntil == null) return null;
  if (!Number.isFinite(row.yearsUntil)) return null;
  return `${row.yearsUntil.toFixed(1)} years`;
}

function MilestoneLadderRow({
  row,
  amount,
  isNext = false,
  onSetActual,
}: {
  row: CompoundMilestone;
  amount: string;
  isNext?: boolean;
  onSetActual: (goal: number, iso: string) => void;
}) {
  const [logOpen, setLogOpen] = useState(false);
  const done = milestoneDone(row);
  const wait = milestoneWait(row);
  return (
    <li className={cn(isNext && "bg-primary/[0.08]")}>
      <button
        type="button"
        aria-expanded={logOpen}
        onClick={() => setLogOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left"
      >
        {done ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-gain" aria-hidden />
        ) : (
          <span
            className="inline-block h-3.5 w-3.5 shrink-0 rounded border border-input bg-transparent"
            aria-hidden
          />
        )}
        <span
          className={cn(
            "min-w-0 flex-1 tabular-nums font-medium",
            done ? "font-semibold text-gain" : "text-foreground"
          )}
        >
          {amount}
        </span>
        <span className="max-w-[11rem] shrink-0 text-right text-sm leading-snug">
          <span
            className={cn(
              "tabular-nums",
              done ? "font-semibold text-gain" : "text-muted-foreground"
            )}
          >
            {milestoneWhen(row)}
          </span>
          {wait ? (
            <span className="mt-0.5 block text-muted-foreground">{wait}</span>
          ) : null}
        </span>
      </button>
      {logOpen ? (
        <label className="block px-3 pb-3">
          <span className="text-sm text-muted-foreground">Got there on</span>
          <Input
            type="date"
            aria-label={`Date you reached ${amount}`}
            value={row.actualDate ?? ""}
            onChange={(e) => onSetActual(row.goal, e.target.value)}
            className={cn(
              "mt-1 tabular-nums",
              done ? "border-gain/40 text-gain" : "text-muted-foreground"
            )}
          />
        </label>
      ) : null}
    </li>
  );
}

export type CompoundSheetOption = {
  id: string;
  name: string;
  value: number;
};

const EMPTY_TICKER_VALUES: Array<{ ticker: string; value: number }> = [];

type Props = {
  /** Book value in USD */
  bookValue: number;
  /** Sheet values in USD */
  sheets: CompoundSheetOption[];
  /** Per-ticker book-wide value in USD to derive default interest rate from holdings */
  tickerValues?: Array<{ ticker: string; value: number }>;
  /** Book-wide cash in USD for the blended rate calculation */
  bookCash?: number;
  /** USD per 1 EUR (Yahoo EURUSD) */
  eurUsd?: number | null;
  eurUsdDetail?: EurUsdQuote | null;
};

function loadStored(): CompoundInputs {
  if (typeof window === "undefined") return DEFAULT_COMPOUND_INPUTS;
  try {
    const raw = localStorage.getItem(COMPOUND_STORAGE_KEY);
    if (!raw) return DEFAULT_COMPOUND_INPUTS;
    return {
      ...DEFAULT_COMPOUND_INPUTS,
      ...JSON.parse(raw),
      compound: "monthly",
    };
  } catch {
    return DEFAULT_COMPOUND_INPUTS;
  }
}

function money(
  amountUsd: number,
  currency: CurrencyCode,
  eurUsd: number | null,
  digits = 0
): string {
  const shown = usdToDisplay(amountUsd, currency, eurUsd);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(shown);
}

function ComparePathsChart({
  scenarios,
  currency,
  eurUsd,
  tippingYear,
}: {
  scenarios: CompareScenario[];
  currency: CurrencyCode;
  eurUsd: number | null;
  tippingYear: number | null;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const paths = scenarios.map((s) => ({
    id: s.id,
    label: s.label,
    color: s.color,
    series: s.result.yearly.map((y) => y.balance),
    dashed: s.id === "mattress",
    thick: s.id === "upside",
    tagline: s.tagline,
    end: s.result.futureValue,
    growth: s.result.totalInterest,
  }));
  const lastIdx = Math.max(1, ...paths.map((p) => p.series.length - 1));
  const max = Math.max(1, ...paths.flatMap((p) => p.series));
  const w = 640;
  const h = 360;
  const padL = 8;
  const padR = 12;
  const padT = 16;
  const padB = 8;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const xAt = (i: number) => padL + (i / lastIdx) * plotW;
  const yAt = (v: number) => padT + plotH - (v / max) * plotH;

  function updateHoverFromClientX(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * w;
    const idx = Math.round(((relX - padL) / plotW) * lastIdx);
    setHoverIdx(Math.max(0, Math.min(lastIdx, idx)));
  }

  const toPoints = (series: number[]) =>
    series.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");

  const gridSteps = [0, 0.25, 0.5, 0.75, 1];
  const compact = (n: number) => {
    const shown = usdToDisplay(n, currency, eurUsd);
    const sign = currency === "EUR" ? "€" : "$";
    const abs = Math.abs(shown);
    if (abs >= 1_000_000_000) return `${sign}${(shown / 1_000_000_000).toFixed(1)}B`;
    if (abs >= 1_000_000) return `${sign}${(shown / 1_000_000).toFixed(1)}M`;
    if (abs >= 10_000) return `${sign}${(shown / 1_000).toFixed(0)}k`;
    return money(n, currency, eurUsd, 0);
  };

  const yearTickEvery = Math.max(1, Math.round(lastIdx / 5));
  const yearTicks = Array.from(
    { length: Math.floor(lastIdx / yearTickEvery) + 1 },
    (_, k) => k * yearTickEvery
  );
  if (yearTicks[yearTicks.length - 1] !== lastIdx) yearTicks.push(lastIdx);

  const labels = paths.map((p) => p.label).join(", ");

  const yTicks = gridSteps.map((s) => max * s);

  return (
    <div className="relative min-w-0 max-w-full">
      <div className="flex min-w-0 items-stretch gap-2 sm:gap-3">
        <ChartYAxis
          ticks={yTicks}
          yAt={yAt}
          height={h}
          format={compact}
          className="w-10 sm:w-16"
        />
        {/*
          The drawing stretches to its box. With the default aspect fit a
          640 by 360 drawing in a 350px tall box on a phone was scaled to
          about 146px and centred, while the dollar labels beside it were
          spread over the full 350, so every label pointed at the wrong
          value. Strokes keep their width and the hover dots are HTML, so
          nothing distorts.
        */}
        <div className="relative min-w-0 flex-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          className="h-[350px] w-full min-w-0 touch-pan-y"
          role="img"
          aria-label={`Same money four ways: ${labels}`}
          onMouseMove={(e) => updateHoverFromClientX(e.clientX)}
          onMouseLeave={() => setHoverIdx(null)}
          onTouchStart={(e) => {
            const t = e.touches[0];
            if (t) updateHoverFromClientX(t.clientX);
          }}
          onTouchMove={(e) => {
            const t = e.touches[0];
            if (t) updateHoverFromClientX(t.clientX);
          }}
          onTouchEnd={() => setHoverIdx(null)}
        >
        {gridSteps.map((s) => {
          const y = padT + plotH - s * plotH;
          return (
            <line
              key={s}
              x1={padL}
              x2={w - padR}
              y1={y}
              y2={y}
              stroke={PALETTE.well}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {tippingYear != null && tippingYear <= lastIdx && (
          <line
            x1={xAt(tippingYear)}
            x2={xAt(tippingYear)}
            y1={padT}
            y2={padT + plotH}
            stroke={PALETTE.gain}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            strokeDasharray="3 3"
            opacity="0.6"
          />
        )}

        {paths.map((p) => (
          <polyline
            key={p.id}
            points={toPoints(p.series)}
            fill="none"
            stroke={p.color}
            strokeWidth={p.thick ? 2.5 : 2}
            vectorEffect="non-scaling-stroke"
            strokeDasharray={p.dashed ? "6 4" : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {hoverIdx != null && (
          <g pointerEvents="none">
            <line
              x1={xAt(hoverIdx)}
              x2={xAt(hoverIdx)}
              y1={padT}
              y2={padT + plotH}
              stroke={PALETTE.muted}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              strokeDasharray="2 3"
              opacity="0.7"
            />
          </g>
        )}
      </svg>
      {hoverIdx != null
        ? paths.map((p) => (
            <span
              key={p.id}
              aria-hidden
              className={cn(
                "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-[1.5px] ring-card",
                p.thick ? "size-2" : "size-1.5"
              )}
              style={{
                left: `${(xAt(hoverIdx) / w) * 100}%`,
                top: `${(yAt(p.series[hoverIdx] ?? 0) / h) * 100}%`,
                background: p.color,
              }}
            />
          ))
        : null}
      </div>
      </div>
      <ChartXRail railClassName="w-10 sm:w-16">
        {yearTicks.map((i) => {
          const isFirst = i === 0;
          const isLast = i === lastIdx;
          return (
            <span
              key={i}
              className="absolute top-0"
              style={{
                left: `${((xAt(i) - padL) / plotW) * 100}%`,
                transform: isFirst
                  ? "translateX(0)"
                  : isLast
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
              }}
            >
              Y{i}
            </span>
          );
        })}
      </ChartXRail>
      {/*
        The legend is the comparison. It used to name the four lines here
        and then a second panel repeated them as four tall cards with the
        end figure in each; the figures are on the legend now, the
        assumption behind each line is one press away on its name, and the
        second panel is gone.
      */}
      <ul className="mt-5 flex flex-col divide-y divide-border border-y border-border text-sm">
        {paths.map((p) => (
          <li key={p.id} className="flex min-w-0 items-center justify-between gap-3 py-2.5">
            <span className="inline-flex min-w-0 items-center gap-2">
              <span
                className="inline-block w-3.5 shrink-0"
                style={{
                  borderTop: p.dashed
                    ? `1.5px dashed ${p.color}`
                    : `2px solid ${p.color}`,
                }}
                aria-hidden
              />
              <InfoTip text={p.tagline}>
                <span className="text-foreground">{p.label}</span>
              </InfoTip>
            </span>
            <span className="flex shrink-0 flex-col items-end">
              <span className="font-mono font-semibold tabular-nums" style={{ color: p.color }}>
                {money(p.end, currency, eurUsd, 0)}
              </span>
              <span className={cn("font-mono text-xs tabular-nums", p.growth < 0 ? "text-loss" : "text-muted-foreground")}>
                {`${money(p.growth, currency, eurUsd, 0)} growth`}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {hoverIdx != null && (
        <div
          className="pointer-events-none absolute top-2 max-w-[min(16rem,calc(100%-0.75rem))] rounded-md border border-border bg-card px-2.5 py-1.5 text-sm shadow-lg backdrop-blur"
          style={{
            left: `${Math.min(
              82,
              Math.max(18, ((xAt(hoverIdx) - padL) / plotW) * 100)
            )}%`,
            transform: "translateX(-50%)",
          }}
        >
          <p className="font-semibold text-foreground">Year {hoverIdx}</p>
          {paths.map((p) => (
            <p
              key={p.id}
              className="tabular-nums"
              style={{ color: p.color }}
            >
              {p.label}: {money(p.series[hoverIdx] ?? 0, currency, eurUsd, 0)}
            </p>
          ))}
          {tippingYear === hoverIdx && (
            <p className="mt-0.5 text-sm font-semibold text-gain">
              Tipping year
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The one chart that teaches the idea rather than comparing four of them:
 * the money you pay in, and what growth adds on top, as two lines that cross.
 *
 * It draws itself once, on the first render, along its own stroke rather than
 * by moving anything, and it does not draw itself at all for a reader who has
 * asked for less motion. Dragging along it reads any single year back in one
 * sentence, which is the whole point: a reader who drags is asking "what
 * about the year I retire", and the answer should be a sentence, not a table.
 */
function GrowthPathChart({
  result,
  show,
  startYear,
}: {
  result: CompoundResult;
  show: (usd: number, digits?: number) => string;
  startYear: number;
}) {
  const rows = result.yearly;
  const lastIdx = Math.max(1, rows.length - 1);
  const paidIn = rows.map((r) => r.balance - r.accruedInterest);
  const growth = rows.map((r) => Math.max(0, r.accruedInterest));
  const max = Math.max(1, ...paidIn, ...growth);
  const crossIdx = rows.findIndex(
    (r, i) => i > 0 && growth[i]! >= paidIn[i]!
  );

  const [sel, setSel] = useState<number | null>(null);
  const shown = sel ?? lastIdx;
  const svgRef = useRef<SVGSVGElement>(null);
  const paidRef = useRef<SVGPolylineElement>(null);
  const growthRef = useRef<SVGPolylineElement>(null);
  const drawn = useRef(false);

  /*
   * No fixed pixel height, and the viewBox aspect is the drawing's aspect.
   * An `h-[180px] w-full` box letterboxes: `preserveAspectRatio` scales the
   * drawing uniformly and centres it, so at 1280 the chart sat 66px inside
   * each edge of its own box while the year labels under it ran the full
   * width, and the first year looked like a gap. Letting the height follow
   * the width keeps the drawing and its rail on the same scale.
   */
  const w = 640;
  const h = 220;
  const padL = 6;
  const padR = 6;
  const padT = 10;
  const padB = 6;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const xAt = (i: number) => padL + (i / lastIdx) * plotW;
  const yAt = (v: number) => padT + plotH - (v / max) * plotH;
  const points = (series: number[]) =>
    series.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");

  useEffect(() => {
    if (drawn.current) return;
    drawn.current = true;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    for (const [i, node] of [paidRef.current, growthRef.current].entries()) {
      if (!node || typeof node.animate !== "function") continue;
      node.animate(
        [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
        { duration: 1100, delay: i * 180, easing: "ease-out", fill: "backwards" }
      );
    }
  }, []);

  function selectFromClientX(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * w;
    const idx = Math.round(((relX - padL) / plotW) * lastIdx);
    setSel(Math.max(0, Math.min(lastIdx, idx)));
  }

  const shownYear = startYear + shown;
  const shownPaid = paidIn[shown] ?? 0;
  const shownGrowth = growth[shown] ?? 0;
  const readout =
    shown === 0
      ? `This is where you start: ${show(shownPaid)} in, and nothing added by growth yet.`
      : `By ${shownYear} you would have put in ${show(shownPaid)} and growth would have added ${show(shownGrowth)}.`;

  return (
    <div className="min-w-0 max-w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="w-full min-w-0 touch-pan-y"
        role="slider"
        tabIndex={0}
        aria-label="Year to read"
        aria-valuemin={startYear}
        aria-valuemax={startYear + lastIdx}
        aria-valuenow={shownYear}
        aria-valuetext={readout}
        onMouseMove={(e) => selectFromClientX(e.clientX)}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (t) selectFromClientX(t.clientX);
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          if (t) selectFromClientX(t.clientX);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            setSel(Math.max(0, shown - 1));
          } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            setSel(Math.min(lastIdx, shown + 1));
          }
        }}
      >
        <line
          x1={padL}
          x2={w - padR}
          y1={padT + plotH}
          y2={padT + plotH}
          stroke={PALETTE.well}
          strokeWidth="1"
        />
        {crossIdx > 0 && (
          <line
            x1={xAt(crossIdx)}
            x2={xAt(crossIdx)}
            y1={padT}
            y2={padT + plotH}
            stroke={PALETTE.gain}
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.55"
          />
        )}
        <polyline
          ref={paidRef}
          points={points(paidIn)}
          fill="none"
          stroke={PALETTE.steel}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1"
        />
        <polyline
          ref={growthRef}
          points={points(growth)}
          fill="none"
          stroke={PALETTE.gain}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1"
        />
        <g pointerEvents="none">
          <line
            x1={xAt(shown)}
            x2={xAt(shown)}
            y1={padT}
            y2={padT + plotH}
            stroke={PALETTE.muted}
            strokeWidth="1"
            strokeDasharray="2 3"
            opacity="0.7"
          />
          <circle
            cx={xAt(shown)}
            cy={yAt(shownPaid)}
            r="3.5"
            fill={PALETTE.steel}
            stroke={PALETTE.card}
            strokeWidth="1.5"
          />
          <circle
            cx={xAt(shown)}
            cy={yAt(shownGrowth)}
            r="4"
            fill={PALETTE.gain}
            stroke={PALETTE.card}
            strokeWidth="1.5"
          />
        </g>
      </svg>
      <ChartXRail inset>
        <span className="absolute top-0 left-0">{startYear}</span>
        <span className="absolute top-0 right-0">{startYear + lastIdx}</span>
      </ChartXRail>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <li className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-3.5"
            style={{ borderTop: `2px solid ${PALETTE.steel}` }}
            aria-hidden
          />
          <span style={{ color: PALETTE.steel }}>Money you put in</span>
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-3.5"
            style={{ borderTop: `2px solid ${PALETTE.gain}` }}
            aria-hidden
          />
          <span style={{ color: PALETTE.gain }}>What growth adds</span>
        </li>
      </ul>
      {/*
        * The per-year readout is drawn only once a reader has actually
        * dragged, because at rest `shown` is the last year and that is the
        * hero figure again.
        *
        * `sel` starts null and the chart falls back to the final year, which
        * is right for the mark and wrong for the sentence: untouched, this
        * line read "By 2036 you would have put in X and growth would have
        * added Y", which is the third printing of the same two numbers on
        * one screen. Left at rest the caption is now the crossing year
        * alone, which is the one thing the chart says that the figures above
        * it do not. `aria-valuetext` still carries `readout` at every
        * moment, so the slider keeps describing its own value whether or not
        * anything is drawn.
        */}
      {sel !== null ? (
        <p className="mt-3 leading-relaxed text-foreground" aria-live="polite">
          {readout}
        </p>
      ) : null}
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {crossIdx > 0
          ? `From ${startYear + crossIdx}, more of the pot is growth than money you put in.`
          : "Growth does not catch what you put in over this many years. A longer stretch closes the gap."}
      </p>
    </div>
  );
}

/**
 * The fewest rungs the ladder shows however short the reader's stretch is.
 * Three is enough for the next one to have somewhere to point.
 */
const MIN_UPCOMING_MILESTONES = 3;

export const CompoundInterestSheet = memo(function CompoundInterestSheet({
  bookValue,
  sheets,
  tickerValues = EMPTY_TICKER_VALUES,
  bookCash = 0,
  eurUsd = null,
  eurUsdDetail = null,
}: Props) {
  const [draft, setDraft] = useState<CompoundInputs>(DEFAULT_COMPOUND_INPUTS);
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [principalSource, setPrincipalSource] = useState<string>("custom");
  const [hydrated, setHydrated] = useState(false);
  const [milestoneActuals, setMilestoneActuals] = useState<MilestoneActuals>(
    {}
  );
  const [storyIdx, setStoryIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const appliedDefaultRateRef = useRef(false);
  const later = useTimeout();

  /*
   * This app's growth outlook for what the reader holds, blended from the
   * per-name rates in `forecast-growth.ts`. Since 2026-09-25 it is what the
   * page opens on once there are holdings (Martin's call, reversing the
   * rule that kept it a preset). For a portfolio heavy in one theme it lands
   * near 30% a year, which is why the caveat is printed under the box rather
   * than hidden behind a click.
   */
  const portfolioExpectedRatePct = useMemo(() => {
    if (tickerValues.length === 0 && bookCash === 0) {
      return BROAD_MARKET_ANNUAL_PCT;
    }
    const blended = blendedExpectedAnnualReturn(tickerValues, {
      balance: bookCash,
      annualReturnPct: COMPOUND_CASH_YIELD_ANNUAL_PCT,
    });
    const pct = Math.round(blended * 1000) / 10;
    return pct > 0 ? pct : BROAD_MARKET_ANNUAL_PCT;
  }, [tickerValues, bookCash]);

  const hasMix = tickerValues.length > 0;

  useLayoutEffect(() => {
    const stored = loadStored();
    setDraft(stored);
    setCurrency(loadCompoundCurrency());
    setMilestoneActuals(loadMilestoneActuals());
    setHydrated(true);
  }, []);

  /*
   * A first visit starts on this portfolio's own value. The rate it starts on
   * is the broad market average and comes from `DEFAULT_COMPOUND_INPUTS`, so
   * there is no frame where one number is on screen and another replaces it.
   *
   * This used to reach for the blended theme rate instead, which is the
   * single most flattering number this page can produce, and it wrote that
   * over a stored rate too, so a reader who changed nothing was reading a
   * thirty year projection built on it. A rate already saved is now left
   * exactly as it was: it is the reader's, not ours.
   */
  useEffect(() => {
    if (!hydrated || appliedDefaultRateRef.current) return;
    /*
     * Not spent on an empty reading: the portfolio's value lands after
     * the page does, and marking this done on a zero meant a first visit
     * never started on the portfolio at all.
     */
    if (!(bookValue > 0)) return;
    appliedDefaultRateRef.current = true;
    const stored = loadStored();
    if (stored.principal !== 5000) return;
    setDraft((prev) => ({ ...prev, principal: Math.round(bookValue) }));
    setPrincipalSource("book");
  }, [hydrated, bookValue]);

  /*
   * THE RATE STARTS ON THE READER'S OWN MIX, once there is one. Only while
   * the saved rate is still the untouched default, so a figure somebody
   * typed or a preset they pressed is never overwritten, and only once
   * holdings have actually arrived, which can be a tick after the page.
   */
  const appliedMixRateRef = useRef(false);
  useEffect(() => {
    if (!hydrated || appliedMixRateRef.current || !hasMix) return;
    appliedMixRateRef.current = true;
    const stored = loadStored();
    if (
      stored.ratePercent !== DEFAULT_COMPOUND_INPUTS.ratePercent ||
      stored.ratePeriod !== DEFAULT_COMPOUND_INPUTS.ratePeriod
    )
      return;
    setDraft((prev) => ({ ...prev, ratePercent: portfolioExpectedRatePct, ratePeriod: "annual" }));
  }, [hydrated, hasMix, portfolioExpectedRatePct]);

  useEffect(() => {
    if (!hydrated) return;
    saveCompoundCurrency(currency);
  }, [currency, hydrated]);

  const fxHint = formatEurUsdHint(eurUsd, eurUsdDetail);

  function show(amountUsd: number, digits = 0) {
    return money(amountUsd, currency, eurUsd, digits);
  }

  function setCurrencySafe(next: CurrencyCode) {
    setCurrency(next);
  }

  function onMoneyUsdChange(
    displayAmount: number,
    apply: (usd: number) => void
  ) {
    apply(Math.round(displayToUsd(displayAmount, currency, eurUsd) * 100) / 100);
  }

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(COMPOUND_STORAGE_KEY, JSON.stringify(draft));
      persistCompoundSnapshot(draft);
    } catch {
      /* ignore */
    }
  }, [draft, hydrated]);

  const deferredDraft = useDeferredValue(draft);
  const liveInputs: CompoundInputs = useMemo(
    () => ({ ...deferredDraft, compound: "monthly" }),
    [deferredDraft]
  );

  const result = useMemo(
    () => calculateCompound(liveInputs),
    [liveInputs]
  );

  const tipping = useMemo(
    () => findTippingYear(result.yearly),
    [result.yearly]
  );

  const compare = useMemo(() => buildCompareScenarios(liveInputs), [liveInputs]);
  /*
   * Every sentence these write is handed the same formatter the figures
   * above them use, so a calculator switched to euros cannot describe its own
   * pot in dollars one line further down.
   */
  const narrative = useMemo(
    () => buildNarrative(result, (n) => money(n, currency, eurUsd, 0)),
    [result, currency, eurUsd]
  );

  const storyOpts = useMemo(
    () => storyYears(Math.max(liveInputs.years, 1)),
    [liveInputs.years]
  );

  const safeStoryIdx = Math.min(storyIdx, Math.max(storyOpts.length - 1, 0));
  const storyYear = storyOpts[safeStoryIdx] ?? 1;

  useEffect(() => {
    if (storyIdx !== safeStoryIdx) setStoryIdx(safeStoryIdx);
  }, [storyIdx, safeStoryIdx]);

  /*
   * A source that is a portfolio follows that portfolio. It used to be
   * copied once, at whatever the value was the moment it was picked, and
   * the value is still arriving then: measured on the sample, the picker
   * read "This portfolio ($28,501)" over a field holding $17,574, which
   * is the portfolio with half its prices missing.
   */
  useEffect(() => {
    if (principalSource === "custom") return;
    const live =
      principalSource === "book"
        ? bookValue
        : sheets.find((s) => s.id === principalSource)?.value;
    if (live == null) {
      setPrincipalSource("custom");
      return;
    }
    if (!(live > 0)) return;
    const next = Math.round(live * 100) / 100;
    setDraft((prev) => (prev.principal === next ? prev : { ...prev, principal: next }));
  }, [principalSource, sheets, bookValue]);
  const storyRow =
    result.yearly.find((y) => y.index === storyYear) ??
    result.yearly[result.yearly.length - 1];

  const yearStories = useMemo(
    () =>
      buildYearStories(result, storyOpts, tipping, (n) =>
        money(n, currency, eurUsd, 0)
      ),
    [result, storyOpts, tipping, currency, eurUsd]
  );

  const annualRatePct =
    liveInputs.ratePeriod === "annual"
      ? liveInputs.ratePercent
      : liveInputs.ratePercent * 12;

  const milestones = useMemo(
    () =>
      buildCompoundMilestones({
        inputs: liveInputs,
        annualRatePct,
        actuals: milestoneActuals,
      }),
    [liveInputs, annualRatePct, milestoneActuals]
  );
  const milestoneTakeaway = useMemo(
    () => buildMilestoneTakeaway(milestones, (n) => money(n, currency, eurUsd, 0)),
    [milestones, currency, eurUsd]
  );
  const clearedMilestones = milestones.filter(milestoneDone);
  const allUpcoming = milestones.filter((m) => !milestoneDone(m));
  /*
   * The ladder answers the question the reader asked, and folds away the
   * rungs past it.
   *
   * The goals are a fixed list ending at $10,000,000, so a reader starting
   * from an ordinary balance met every rung they had not crossed: measured
   * on the sample, nineteen rows running out to December 2072, which is
   * 46.3 years away and dated to the day. That is the fault this repo
   * already records against re-pricing a thirty year plan every fifteen
   * seconds, drawn as a list: a date that far out, read off one typed
   * growth rate, is precision the situation does not have, and nineteen of
   * them bury the two rungs somebody could actually plan around.
   *
   * The horizon is the stretch the reader themselves set, because that is
   * the question this panel is inside: rungs they reach within their own
   * "for how long" are part of the answer, and everything past it is
   * extrapolation beyond what they asked. `MIN_UPCOMING` is the floor, so
   * a short stretch that clears no rung still shows the next few rather
   * than an empty panel with a disclosure under it; the rest goes behind
   * the same kind of summary the crossed rungs already use, so nothing is
   * removed from the page, only from the way in.
   */
  const upcomingMilestones = useMemo(() => {
    const within = allUpcoming.filter(
      (m) => m.yearsUntil != null && m.yearsUntil <= liveInputs.years
    );
    return within.length >= MIN_UPCOMING_MILESTONES
      ? within
      : allUpcoming.slice(0, MIN_UPCOMING_MILESTONES);
  }, [allUpcoming, liveInputs.years]);
  const laterMilestones = allUpcoming.filter(
    (m) => !upcomingMilestones.includes(m)
  );

  function setMilestoneActual(goal: number, iso: string) {
    setMilestoneActuals((prev) => {
      const next = { ...prev };
      if (!iso) delete next[String(goal)];
      else next[String(goal)] = iso;
      saveMilestoneActuals(next);
      return next;
    });
  }

  function patchDraft<K extends keyof CompoundInputs>(
    key: K,
    value: CompoundInputs[K]
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function applyPrincipal(source: string) {
    setPrincipalSource(source);
    if (source === "book") {
      patchDraft("principal", Math.round(bookValue * 100) / 100);
      return;
    }
    if (source === "custom") return;
    const sheet = sheets.find((s) => s.id === source);
    if (sheet) patchDraft("principal", Math.round(sheet.value * 100) / 100);
  }

  function syncToPortfolioRate() {
    patchDraft("ratePercent", portfolioExpectedRatePct);
    patchDraft("ratePeriod", "annual");
  }

  async function copyPostcard() {
    /*
      * Somebody pastes this into a chat, so it is read by people who have
      * never opened the app. It used to be five abbreviations in three
      * lines (RoR, YoY, /mo, 20y, an arrow), which is a note to yourself
      * rather than a message to anybody else. Full sentences now.
      */
    const yearWord = liveInputs.years === 1 ? "year" : "years";
    const text = [
      `Upside Lab compound postcard`,
      `${show(result.principal)} grows to ${show(result.futureValue)} over ${liveInputs.years} ${yearWord}.`,
      `Growth adds ${show(result.totalInterest)}, which is ${(result.allTimeRoR * 100).toFixed(0)}% on top of what went in.`,
      liveInputs.depositAmount > 0
        ? `Paying in ${show(liveInputs.depositAmount)} a month, rising ${liveInputs.annualIncrease}% each year.`
        : `Nothing paid in along the way, just growth on what is already there.`,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      later(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  const durationLabel = spanText(liveInputs.years, liveInputs.months);

  const isRateMatchedToPortfolio = Math.abs(draft.ratePercent - portfolioExpectedRatePct) < 0.05;
  const annualRateInput =
    draft.ratePeriod === "annual" ? draft.ratePercent : draft.ratePercent * 12;
  /*
   * The reader's own mix wins a tie now that it is the default, but only
   * when there is a mix: with nothing held, "Yours" falls back to the
   * market figure and lighting it would claim a portfolio that is not there.
   */
  const ratePreset =
    hasMix && isRateMatchedToPortfolio
      ? "book"
      : annualRateInput === BROAD_MARKET_ANNUAL_PCT
        ? "spy"
        : annualRateInput === 15
          ? "15"
          : annualRateInput === 25
            ? "25"
            : null;
  const yearPreset = YEAR_PRESETS.includes(
    draft.years as (typeof YEAR_PRESETS)[number]
  )
    ? String(draft.years)
    : null;
  const payIn =
    draft.contributionMode === "deposits" ||
    draft.contributionMode === "both";
  const takeOut =
    draft.contributionMode === "withdrawals" ||
    draft.contributionMode === "both";

  function applyRatePreset(id: (typeof RATE_PRESETS)[number]["id"]) {
    if (id === "book") {
      syncToPortfolioRate();
      return;
    }
    patchDraft("ratePeriod", "annual");
    if (id === "spy") patchDraft("ratePercent", BROAD_MARKET_ANNUAL_PCT);
    else if (id === "15") patchDraft("ratePercent", 15);
    else patchDraft("ratePercent", 25);
  }

  return (
    /*
      * The shared rhythm here too, not a gap of this layout's own.
      *
      * On a phone this grid is one column, so its gap is the distance
      * between the calculator and the first answer, and it was 16px while
      * the answer panels below it sat 32 apart. The tightest seam on the
      * screen was the one between the question and its answer, and the
      * same screen then used two different distances for the same kind of
      * break. At `lg` it is the gutter between the two columns, where the
      * same number reads correctly.
      */
    <div className={cn(PANEL_STACK_GAP, "grid w-full min-w-0 max-w-full items-start overflow-x-clip lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]")}>
      {/* min-h-0 / min-w-0: grid items default to min-content, which lets
          wide tables below blow the calculator off a phone screen.

          Deliberately NOT a pinned column. This used to be `lg:sticky
          lg:top-24` with `lg:max-h-[calc(100dvh-6rem-var(--dock-pad))]`
          and its own `lg:overflow-y-auto`, which cut the calculator off
          mid-form: `--dock-pad` is the page's bottom clearance for the
          fixed book dock (11.5rem on desktop, or the dock's measured
          height once `useDockPad` runs), so the clamp came to roughly
          `100dvh - 17.5rem` -- about 620px on a 900px window, and less
          on a laptop or at browser zoom. "Adding along the way", the
          last section of the form, fell below that line and was
          reachable only by scrolling inside a container with no visible
          scrollbar and a hard-cut bottom edge where the panel's own
          border should be.

          Pinning cannot be fixed by widening the clamp, either: a
          sticky element taller than the viewport pins its top and puts
          its bottom permanently off-screen. A form is scrolled through
          and filled in, not consulted while reading something else --
          so it scrolls with the page like every other panel in the app
          (this was the only sticky sidebar in the codebase). */}
      {/*
        ON A PHONE THE ANSWER COMES FIRST. The columns stack there, and the
        form is about 1,200px tall, so a reader met a screen and a half of
        fields before any result. Below `lg` the results section becomes
        `contents` and its first panel is ordered ahead of the form, the
        rest after it; the laptop's two columns are unchanged.
      */}
      <div className="min-h-0 min-w-0 w-full max-w-full max-lg:order-2">
        <Panel className={SHEET_PANEL}>
        <PanelHeader
          icon={<Calculator className="h-4 w-4" />}
          title="Growth calculator"
          actions={
            <Segmented
              ariaLabel="Show amounts in"
              options={CURRENCIES.map((c) => ({
                id: c.code,
                label: c.label,
                title: c.code === "EUR" ? fxHint : "Your portfolio is kept in USD",
              }))}
              value={currency}
              onChange={setCurrencySafe}
            />
          }
        />

        <div className="divide-y divide-border">
        <section className={cn(FIELD_STACK, "pb-4")}>
          <label htmlFor="compound-principal-input" className="text-sm font-semibold text-foreground">
            Starting from
          </label>
          <FormattedNumberInput
            id="compound-principal-input"
            kind="money"
            currency={currency}
            value={usdToDisplay(draft.principal, currency, eurUsd)}
            onChange={(n) => {
              setPrincipalSource("custom");
              onMoneyUsdChange(n, (usd) => patchDraft("principal", usd));
            }}
            className={FIELD_CLASS}
          />
          <NativeSelect
            value={principalSource}
            onChange={(e) => applyPrincipal(e.target.value)}
            aria-label="Where the starting amount comes from"
            className="w-full min-w-0 max-w-full"
          >
            {bookValue > 0 && (
              <NativeSelectOption value="book">
                This portfolio ({show(bookValue, 0)})
              </NativeSelectOption>
            )}
            {sheets.map((s) => (
              <NativeSelectOption key={s.id} value={s.id}>
                {s.name} ({show(s.value, 0)})
              </NativeSelectOption>
            ))}
            <NativeSelectOption value="custom">Type an amount</NativeSelectOption>
          </NativeSelect>
        </section>

        <section className={cn(FIELD_STACK, "py-4")}>
          <label
            htmlFor="compound-rate-input"
            className="inline-flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            Growing at
            {/*
              Every figure on this page is this one number compounded for
              decades, and where it comes from is not guessable from the
              screen. It is not a model, but it is very much an assumption,
              so it answers the same question in the same place as the rest.
            */}
            <WhyThis
              provenance={growthRateProvenance({
                ratePct: annualRateInput,
                source:
                  ratePreset === "spy"
                    ? "baseline"
                    : ratePreset === "book"
                      ? "mix"
                      : "typed",
              })}
              align="start"
            />
          </label>
          <div className="relative">
            <FormattedNumberInput
              id="compound-rate-input"
              kind="percent"
              value={annualRateInput}
              onChange={(n) => {
                patchDraft("ratePercent", Math.min(2000, Math.max(0, n)));
                patchDraft("ratePeriod", "annual");
              }}
              className={cn(FIELD_CLASS, "pr-16")}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              a year
            </span>
          </div>
          <Segmented
            ariaLabel="Growth rate preset"
            columns={4}
            look="buttons"
            options={RATE_PRESETS}
            value={ratePreset}
            onChange={applyRatePreset}
          />
          {/*
            * Printed, never behind the mark. The mark answers "where did this
            * come from" for a reader who goes looking; this is the line that
            * reaches the reader who does not.
            */}
          <p className="text-sm leading-relaxed text-muted-foreground">
            {rateCaveat(ratePreset, portfolioExpectedRatePct)}
          </p>
        </section>

        <section className={cn(FIELD_STACK, "py-4")}>
          <label htmlFor="compound-duration-input" className="text-sm font-semibold text-foreground">
            For how long
          </label>
          <div className="relative">
            <DurationYearsInput
              id="compound-duration-input"
              value={draft.years}
              onChange={(years) => patchDraft("years", years)}
              className={cn(FIELD_CLASS, "no-spinner pr-16")}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              years
            </span>
          </div>
          <Segmented
            ariaLabel="How many years"
            columns={4}
            look="buttons"
            /*
              The number alone on the cell: the field directly above ends
              in the word "years", and "10 years" in a four-cell row broke
              over two lines on a 390px phone, which made the row twice
              as tall as every other preset row on the page. `title`
              keeps the full phrase for a pointer.
            */
            options={YEAR_PRESETS.map((yr) => ({
              id: String(yr),
              label: String(yr),
              title: `${yr} years`,
            }))}
            value={yearPreset}
            onChange={(id) => patchDraft("years", Number(id))}
          />
        </section>

        <section className={cn(FIELD_STACK, "py-4")}>
          <span className="text-sm font-semibold text-foreground">
            Adding along the way
          </span>
          <Segmented
            ariaLabel="Deposits or withdrawals"
            columns={4}
            look="buttons"
            options={[
              { id: "none", label: "None" },
              { id: "deposits", label: "In", title: "Paying in" },
              { id: "withdrawals", label: "Out", title: "Taking out" },
              { id: "both", label: "Both" },
            ]}
            value={draft.contributionMode}
            onChange={(id) =>
              patchDraft("contributionMode", id as ContributionMode)
            }
          />

          <fieldset
            disabled={!payIn}
            className={cn(FIELD_STACK, !payIn && "opacity-40")}
          >
            <legend className="sr-only">Paying in</legend>
            <FormattedNumberInput
              id="compound-deposit-input"
              kind="money"
              currency={currency}
              value={usdToDisplay(draft.depositAmount, currency, eurUsd)}
              onChange={(n) =>
                onMoneyUsdChange(n, (usd) => patchDraft("depositAmount", usd))
              }
              className={FIELD_CLASS}
            />
            <Segmented
              ariaLabel="How often you pay in"
              columns={2}
              look="buttons"
              options={[
                { id: "monthly", label: "Month" },
                { id: "annually", label: "Year" },
              ]}
              value={draft.depositFrequency}
              onChange={(id) =>
                patchDraft("depositFrequency", id as ContributionFrequency)
              }
              disabled={!payIn}
            />
            <label className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              Raise it each year
              <FormattedNumberInput
                kind="percent"
                value={draft.annualIncrease}
                onChange={(n) => patchDraft("annualIncrease", n)}
                className="w-24 font-semibold"
              />
            </label>
          </fieldset>
          <fieldset
            disabled={!takeOut}
            className={cn(!takeOut && "opacity-40")}
          >
            <legend className="mb-5 block text-sm text-muted-foreground">
              Taking out each month
            </legend>
            <FormattedNumberInput
              id="compound-withdrawal-input"
              kind="money"
              currency={currency}
              value={usdToDisplay(draft.withdrawalAmount, currency, eurUsd)}
              onChange={(n) =>
                onMoneyUsdChange(n, (usd) =>
                  patchDraft("withdrawalAmount", usd)
                )
              }
              className={FIELD_CLASS}
            />
          </fieldset>
        </section>
        </div>
        </Panel>
      </div>

      {/*
        Results & Projections, and it is `defer-paint` rather than
        `BelowFold` for a reason worth writing down. Measured on a 390x800
        phone this section starts at 1,218px with the fold at about 917:
        it is below the fold but **less than one screen below it**, and
        `BelowFold` fires a whole screen early, so wrapping it mounted the
        section immediately and saved exactly nothing. Verified -- 619
        elements still rendered.

        What it is is 3,687px tall, so most of it is off screen even once
        mounted, which is the case `content-visibility` is for. The rule
        goes on the panels inside rather than the section, since a
        contained ancestor would trap anything sticky within it.
      */}
      <section className={cn(PANEL_STACK, "min-w-0 w-full max-w-full max-lg:contents")}>
        {/* Hero KPI Summary */}
        <Panel className={cn(SHEET_PANEL, "max-lg:order-1")}>
          <PanelHeader
            hero
            title={`Where ${durationLabel} of this gets you`}
            actions={
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyPostcard()}
                className="w-full sm:w-auto"
              >
                {copied ? (
                  <Copy className="text-gain" data-icon="inline-start" />
                ) : (
                  <Share2 data-icon="inline-start" />
                )}
                {copied ? "Copied" : "Copy summary"}
              </Button>
            }
          />

          {/* Three numbers, and the sentence that ties them together. Anything
            * more here and the first thing a person sees is a wall. */}
          <div>
            <MicroLabel>Ends up at</MicroLabel>
            <p className="figure-hero mt-3 text-gain">
              {show(result.futureValue)}
            </p>
          </div>
          {/*
            Four figures in one strip, never five cards. The hero panel was
            a big number, then two bordered cards, the chart, then three
            more, and the page read as a wall of boxes around one answer.
            Each figure here is one line under its label with a hairline
            between them, and the year growth takes over lives on the
            four-paths chart's own chip rather than in a card of its own.
          */}
          <StatStrip
            items={[
              {
                label: <TermTip term="compounding">Growth</TermTip>,
                value: show(result.totalInterest),
                sub:
                  result.futureValue > 0
                    ? `${percent(safeDiv(result.totalInterest, result.futureValue), 0)} of it`
                    : undefined,
                tone: "text-gain",
              },
              { label: "You put in", value: show(result.totalDeposited) },
              {
                label: <TermTip term="total-return">Total return</TermTip>,
                value: `${(result.allTimeRoR * 100).toFixed(1)}%`,
                tone: "text-gain",
              },
              {
                label: "Doubles every",
                value: Number.isFinite(result.doubleYears)
                  ? spanText(result.doubleYears, result.doubleMonths)
                  : NO_VALUE,
              },
            ]}
          />

          <div>
            <MicroLabel>Where it comes from, year by year</MicroLabel>
            <div className="mt-4">
              <GrowthPathChart
                result={result}
                show={show}
                startYear={new Date().getFullYear()}
              />
            </div>
          </div>

        </Panel>

        {/* Dual Path Chart */}
        {/*
          EVERYTHING AFTER THE HERO PANEL, AND THE OFFSETS ARE WHY.
          Measured at 390x800: the hero starts at 1,218px, which is inside
          the one screen of lead `BelowFold` gives (the fold is 800, so its
          reach is 1,600) and cannot be deferred. Every panel after it
          starts at 1,907px or lower and together they are 555 of this
          section's 618 elements. `defer-paint` on each of them skips the
          style, layout and paint; this skips building them at all until
          the reader comes near.
        */}
        <BelowFold reserve={560} className={cn(PANEL_STACK, "max-lg:order-3")}>
        <Panel className={cn(SHEET_PANEL, "defer-paint")}>
          <PanelHeader
            title={`Same money, ${compare.length === 3 ? "three" : "four"} paths`}
            actions={
              tipping != null ? (
                <Pill tone="good" title="From here on, growth adds more each year than you do">
                  Growth takes over in year {tipping}
                </Pill>
              ) : undefined
            }
          />
          <div>
            <ComparePathsChart
              scenarios={compare}
              currency={currency}
              eurUsd={eurUsd}
              tippingYear={tipping}
            />
          </div>
        </Panel>

        {/* Milestone Tracker */}
        <Panel className={cn(SHEET_PANEL, "defer-paint")}>
          <PanelHeader
            icon={<Target className="h-4 w-4" />}
            title="When you cross each round number"
          />
          {milestoneTakeaway && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {milestoneTakeaway}
            </p>
          )}
          {/*
            * One ladder at every width. The phone list and the desktop table
            * disagreed about what the panel is for: the phone showed what is
            * still ahead with the next one highlighted and the rest folded
            * away, the desktop showed all twenty-odd rows in a scroller and
            * auto-scrolled you into the middle of them. The phone reading is
            * the better one and is now the only one.
            */}
          <div>
            {upcomingMilestones.length > 0 ? (
              <ul className="card-sheen glass-well divide-y divide-border overflow-hidden rounded-lg">
                {upcomingMilestones.map((row, i) => (
                  <MilestoneLadderRow
                    key={row.goal}
                    row={row}
                    amount={show(row.goal)}
                    isNext={i === 0}
                    onSetActual={setMilestoneActual}
                  />
                ))}
              </ul>
            ) : null}
            {laterMilestones.length > 0 ? (
              <details
                className={cn(
                  "card-sheen glass-well rounded-lg",
                  upcomingMilestones.length > 0 && "mt-3"
                )}
              >
                <summary className="cursor-pointer px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition hover:text-foreground">
                  {laterMilestones.length} further out
                </summary>
                <ul className="divide-y divide-border border-t border-border">
                  {laterMilestones.map((row) => (
                    <MilestoneLadderRow
                      key={row.goal}
                      row={row}
                      amount={show(row.goal)}
                      onSetActual={setMilestoneActual}
                    />
                  ))}
                </ul>
              </details>
            ) : null}
            {clearedMilestones.length > 0 ? (
              <details
                className={cn(
                  "card-sheen glass-well rounded-lg",
                  (upcomingMilestones.length > 0 || laterMilestones.length > 0) &&
                    "mt-3"
                )}
                {...(upcomingMilestones.length === 0 ? { open: true } : {})}
              >
                <summary className="cursor-pointer px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition hover:text-foreground">
                  {clearedMilestones.length} already crossed
                </summary>
                <ul className="divide-y divide-border border-t border-border">
                  {clearedMilestones.map((row) => (
                    <MilestoneLadderRow
                      key={row.goal}
                      row={row}
                      amount={show(row.goal)}
                      onSetActual={setMilestoneActual}
                    />
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        </Panel>

        <Panel className={cn(SHEET_PANEL, "defer-paint")}>
          <PanelHeader
            title="Any single year, in words"
            subtitle="Pick a year."
          />
          {/*
            * The cells carry the number alone and the word "Year" is in the
            * subtitle above them.
            *
            * A compact `Segmented` prices every cell at its longest label, so
            * "Year 10" set the width of all of them: measured at 390px the
            * row wrapped each cell onto two lines, reading "Year" over "1",
            * and a control whose every cell is broken in half reads as a
            * fault rather than as a picker. This is the same arithmetic this
            * repo already records against the Playbook's "10 days" cells and
            * against the circle's "Members · 15" tab, and it has the same
            * answer: the unit belongs on the label above, not repeated inside
            * each cell. `title` keeps the full wording for a pointer.
            */}
          <Segmented
            ariaLabel="Year to read"
            columns={storyOpts.length}
            look="buttons"
            options={storyOpts.map((y) => ({
              id: String(y),
              label: String(y),
              title:
                tipping === y
                  ? `Year ${y}, growth takes over`
                  : `Year ${y}`,
            }))}
            value={String(storyYear)}
            onChange={(id) => {
              const i = storyOpts.indexOf(Number(id));
              if (i >= 0) setStoryIdx(i);
            }}
          />
          {storyRow ? (
            <div>
              <MicroLabel>After year {storyRow.index}</MicroLabel>
              <p className="mt-2 font-heading text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                {show(storyRow.balance)}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {yearStories.get(storyRow.index) ??
                  `Growth would add ${show(storyRow.interest)} that year, ${show(storyRow.accruedInterest)} in total by then.`}
              </p>
            </div>
          ) : null}

          {/* The full grid used to be its own panel below. Same numbers, so it
            * lives here folded up instead of as a seventh thing to scroll past. */}
          <details className="group">
            <summary className="touch-target flex cursor-pointer list-none items-center gap-2 rounded-md py-1 text-sm text-muted-foreground transition hover:text-foreground hover:underline focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" />
              Show every year as a table
            </summary>
            {/*
              One table at every width. A phone used to get a card per year,
              four labelled figures each, so thirty years was thirty cards
              and a reader could not compare year five with year twenty
              without scrolling between them, which is the one thing this
              table is for. The phone drops the running total of growth,
              which is the pot less the money in and so is on the row
              already, and keeps the other three as columns.

              No coloured column washes: green in this app means money
              made, and the growth figures already carry it. The pot is the
              answer, so it is the one column set in the foreground.
            */}
            <div className="mt-3 min-w-0 max-w-full overflow-x-auto border-t border-border pt-3">
              <table className={htmlTable}>
                <thead>
                  <tr className={htmlHeadRow}>
                    <th className={htmlCellText}>Year</th>
                    <th className={htmlCell}>
                      <span className="hidden sm:inline">Your money in</span>
                      <span className="sm:hidden">Money in</span>
                    </th>
                    <th className={htmlCell}>
                      <span className="hidden sm:inline">Growth that year</span>
                      <span className="sm:hidden">Growth</span>
                    </th>
                    <th className={cn(htmlCell, "hidden md:table-cell")}>
                      Growth by then
                    </th>
                    <th className={htmlCell}>
                      <span className="hidden sm:inline">Pot at year end</span>
                      <span className="sm:hidden">Pot</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.yearly.map((row, i) => {
                    const isLast = i === result.yearly.length - 1;
                    const principalShown = row.balance - row.accruedInterest;
                    return (
                      <tr
                        key={row.index}
                        className={cn(
                          "border-b border-border/50 transition hover:bg-hover last:border-0",
                          isLast && "font-semibold"
                        )}
                      >
                        <td className={cn(htmlCellText, "text-muted-foreground")}>
                          {row.label}
                        </td>
                        <td className={cn(htmlCell, "text-muted-foreground")}>
                          {show(principalShown)}
                        </td>
                        <td className={cn(htmlCell, "text-gain")}>
                          {show(row.interest)}
                        </td>
                        <td className={cn(htmlCell, "hidden text-gain md:table-cell")}>
                          {show(row.accruedInterest)}
                        </td>
                        <td className={cn(htmlCell, "font-semibold text-foreground")}>
                          {show(row.balance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </Panel>

        <Panel className={cn(SHEET_PANEL, "defer-paint")}>
          <PanelHeader title="What this actually tells you" />
          <ItemGroup>
            {narrative.map((beat, i) => (
              <Fragment key={beat.label}>
                {i > 0 ? <ItemSeparator /> : null}
                <Item className="px-0">
                  <ItemContent>
                    <ItemTitle className="font-semibold tracking-tight">
                      {beat.label}
                    </ItemTitle>
                    <ItemDescription className="line-clamp-none leading-relaxed">
                      {beat.body}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              </Fragment>
            ))}
          </ItemGroup>
        </Panel>

        </BelowFold>
      </section>
    </div>
  );
});

