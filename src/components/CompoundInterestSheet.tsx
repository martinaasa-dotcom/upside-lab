"use client";

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
import { htmlCell, htmlTable } from "@/components/FluidTable";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import {
  ArrowUpRight,
  Calculator,
  CheckCircle2,
  ChevronRight,
  Copy,
  Share2,
  Target,
  Zap,
} from "lucide-react";
import { Fragment, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from "react";
import { useTimeout } from "@/lib/use-timeout";
import {
  MicroLabel,
  Panel,
  PanelHeader,
  Pill,
  Score,
  Scoreboard,
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

type CurrencyCode = DisplayCurrency;

const CURRENCIES: { code: CurrencyCode; label: string }[] = [
  { code: "USD", label: "USD" },
  { code: "EUR", label: "EUR" },
];

const FIELD_CLASS = "w-full min-w-0 max-w-full font-semibold tabular-nums";
const FIELD_STACK = "flex flex-col gap-5";

const SHEET_PANEL = "h-auto min-w-0 max-w-full lg:h-full";

const YEAR_PRESETS = [5, 10, 20, 30] as const;

/*
 * Every one of these is an assumption, and the page compounds whichever one
 * is chosen for up to fifty years, so each says what it is rather than
 * standing there as a bare number. The broad market comes first and is where
 * the page opens: the rate a mix of holdings has usually managed is offered
 * beside it, clearly labelled, rather than being the number a reader finds
 * already in the box.
 */
const RATE_PRESETS = [
  { id: "spy", label: "10%", title: "The whole US market's long run average" },
  { id: "book", label: "Your mix", title: "What this mix has usually done" },
  { id: "15", label: "15%", title: "A very good stretch for the whole market" },
  { id: "25", label: "25%", title: "What only a handful of years look like" },
] as const;

/** The sentence printed under the rate box for whichever preset is on. */
function rateCaveat(preset: string | null, mixPct: number): string {
  if (preset === "spy") {
    return `${BROAD_MARKET_ANNUAL_PCT}% a year is the historical average for the whole US market, before inflation is taken off. Nobody gets it every year.`;
  }
  if (preset === "book") {
    return `What this mix has usually done: about ${mixPct}% a year, from a table of typical rates per kind of business written into this app. Holding a rate like that for decades is a big assumption.`;
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
        <svg
          ref={svgRef}
          viewBox={`0 0 ${w} ${h}`}
          className="h-[350px] w-full min-w-0 flex-1 touch-pan-y"
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
              strokeDasharray="2 3"
              opacity="0.7"
            />
            {paths.map((p) => (
              <circle
                key={p.id}
                cx={xAt(hoverIdx)}
                cy={yAt(p.series[hoverIdx] ?? 0)}
                r={p.thick ? 4 : 3.25}
                fill={p.color}
                stroke={PALETTE.card}
                strokeWidth="1.5"
              />
            ))}
          </g>
        )}
      </svg>
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
      <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-4">
        {paths.map((p) => (
          <li key={p.id} className="inline-flex min-w-0 items-center gap-1.5">
            <span
              className="inline-block w-3.5"
              style={{
                borderTop: p.dashed
                  ? `1.5px dashed ${p.color}`
                  : `2px solid ${p.color}`,
              }}
              aria-hidden
            />
            <span style={{ color: p.color }}>{p.label}</span>
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
      <p className="mt-3 leading-relaxed text-foreground" aria-live="polite">
        {readout}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {crossIdx > 0
          ? `The two lines cross in ${startYear + crossIdx}. From then on, more of the pot is growth than money you have put in altogether.`
          : "Growth does not catch everything you have put in over this many years. Set a longer stretch and watch the green line close on the blue one."}
      </p>
    </div>
  );
}

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
   * What a mix like this one has usually managed, blended from a table of
   * typical rates per kind of business. It is offered as a preset and named
   * on screen. It is deliberately NOT what the page opens on: for a portfolio
   * heavy in one theme this lands near 30% a year, and opening on that
   * compounds a very optimistic guess for thirty years with the caveat hidden
   * behind a click.
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
    appliedDefaultRateRef.current = true;
    if (!(bookValue > 0)) return;
    const stored = loadStored();
    if (stored.principal !== 5000) return;
    setDraft((prev) => ({ ...prev, principal: Math.round(bookValue) }));
    setPrincipalSource("book");
  }, [hydrated, bookValue]);

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

  useEffect(() => {
    if (principalSource === "custom" || principalSource === "book") return;
    if (!sheets.some((s) => s.id === principalSource)) {
      setPrincipalSource("custom");
    }
  }, [principalSource, sheets]);
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
  const upcomingMilestones = milestones.filter((m) => !milestoneDone(m));

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
   * The broad market reading wins a tie. A portfolio whose blended rate lands
   * on 10% would otherwise light "Your mix" and print the mix caveat over a
   * number that is simply the market average.
   */
  const ratePreset =
    annualRateInput === BROAD_MARKET_ANNUAL_PCT
      ? "spy"
      : isRateMatchedToPortfolio
        ? "book"
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
    <div className="grid w-full min-w-0 max-w-full items-start gap-4 overflow-x-clip lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
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
      <div className="min-h-0 min-w-0 w-full max-w-full">
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
            * Printed, never behind the eye. The eye answers "where did this
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
            <Input
              id="compound-duration-input"
              type="number"
              min={1}
              max={50}
              value={draft.years || ""}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                patchDraft("years", Number.isNaN(val) ? 1 : Math.min(50, Math.max(1, val)));
              }}
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
      <section className="flex flex-col min-w-0 w-full max-w-full gap-4">
        {/* Hero KPI Summary */}
        <Panel className={SHEET_PANEL}>
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
            <p className="mt-1 text-2xl font-bold tabular-nums text-gain">
              {show(result.futureValue)}
            </p>
          </div>
          <Scoreboard cols={2}>
            <Score
              label="Of that, growth"
              value={show(result.totalInterest)}
              explain="What growth at this rate would add on top of everything you put in. A projection, not money you have."
              valueClassName="text-gain"
            />
            <Score
              label="You put in"
              value={show(result.totalDeposited)}
              valueClassName="text-primary"
            />
          </Scoreboard>

          <p className="text-sm leading-relaxed text-muted-foreground">
            You would put in {show(result.totalDeposited)} and end with{" "}
            {show(result.futureValue)}, so growth would do{" "}
            {show(result.totalInterest)} of the work
            {result.futureValue > 0
              ? `, which is ${percent(safeDiv(result.totalInterest, result.futureValue), 0)} of the final number`
              : ""}
            .
          </p>

          <div>
            <MicroLabel>Where that money would come from</MicroLabel>
            <p className="mt-1 text-sm text-muted-foreground">
              Drag across the years to read any single one of them.
            </p>
            <div className="mt-4">
              <GrowthPathChart
                result={result}
                show={show}
                startYear={new Date().getFullYear()}
              />
            </div>
          </div>

          <Scoreboard cols={2}>
            <Score
              label="Total return"
              value={
                <span className="inline-flex items-center gap-1">
                  {(result.allTimeRoR * 100).toFixed(1)}%
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              }
              explain="How much bigger the pot would be than everything you put into it."
              valueClassName="text-gain"
            />
            <Score
              label="Doubles in"
              value={
                Number.isFinite(result.doubleYears)
                  ? spanText(result.doubleYears, result.doubleMonths)
                  : NO_VALUE
              }
              valueClassName="whitespace-normal leading-snug"
            />
          </Scoreboard>
          <Scoreboard cols={1}>
            <Score
              label="When growth takes over"
              value={
                tipping != null ? `Year ${tipping}` : "Not on this plan"
              }
              sub={
                tipping != null
                  ? "From this year, growth adds more than you pay in."
                  : "You still pay in more than growth adds."
              }
              explain="The year growth starts adding more than you pay in yourself. After this, time matters more than saving harder."
              valueClassName="whitespace-normal leading-snug"
            />
          </Scoreboard>
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
        <BelowFold reserve={560}>
        <Panel className={cn(SHEET_PANEL, "defer-paint")}>
          <PanelHeader
            title="Same money, four paths"
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
            {clearedMilestones.length > 0 ? (
              <details
                className={cn(
                  "card-sheen glass-well rounded-lg",
                  upcomingMilestones.length > 0 && "mt-3"
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
          />
          <Segmented
            ariaLabel="Year to read"
            columns={storyOpts.length}
            look="buttons"
            options={storyOpts.map((y) => ({
              id: String(y),
              label: `Year ${y}`,
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
            <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3 md:hidden">
              {result.yearly.map((row, i) => {
                const isLast = i === result.yearly.length - 1;
                const principalShown = row.balance - row.accruedInterest;
                return (
                  <div
                    key={row.index}
                    className={cn(
                      "rounded-lg border border-border bg-card px-3 py-3",
                      isLast && "ring-1 ring-ring/30"
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">
                      {row.label}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Your money in</p>
                        <p className="tabular-nums text-muted-foreground">
                          {show(principalShown)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Growth that year</p>
                        <p className="tabular-nums text-gain">
                          {show(row.interest)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Growth by then</p>
                        <p className="tabular-nums text-gain">
                          {show(row.accruedInterest)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Pot at year end</p>
                        <p className="tabular-nums font-semibold text-gain">
                          {show(row.balance)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 hidden min-w-0 max-w-full overflow-x-auto border-t border-border pt-3 md:block">
              <table className={cn(htmlTable, "min-w-[32rem]")}>
                <thead>
                  <tr className="border-b border-border text-sm text-muted-foreground">
                    <th className={cn(htmlCell, "font-medium")}>Year</th>
                    <th className={cn(htmlCell, "font-medium")}>Your money in</th>
                    <th className={cn(htmlCell, "font-medium")}>Growth that year</th>
                    <th className={cn(htmlCell, "bg-gain/15 font-medium text-gain")}>
                      Growth by then
                    </th>
                    <th className={cn(htmlCell, "bg-gain/10 font-medium text-gain")}>
                      Pot at year end
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
                          "border-b border-border transition hover:bg-hover/30",
                          isLast && "bg-accent/20 font-semibold text-foreground"
                        )}
                      >
                        <td className={cn(htmlCell, "text-muted-foreground")}>{row.label}</td>
                        <td className={cn(htmlCell, "tabular-nums text-muted-foreground")}>
                          {show(principalShown)}
                        </td>
                        <td className={cn(htmlCell, "tabular-nums text-gain")}>
                          {show(row.interest)}
                        </td>
                        <td className={cn(htmlCell, "bg-gain/10 tabular-nums text-gain")}>
                          {show(row.accruedInterest)}
                        </td>
                        <td className={cn(htmlCell, "bg-gain/5 tabular-nums font-semibold text-gain")}>
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
          <PanelHeader
            icon={<Zap className="h-4 w-4" />}
            title="The same money, invested differently"
          />
          <Scoreboard cols={2} className="max-sm:grid-cols-1">
            {compare.map((s) => {
              const dashed = s.id === "mattress";
              return (
                <Score
                  key={s.id}
                  className="min-w-0"
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block w-3.5 shrink-0"
                        style={{
                          borderTop: dashed
                            ? `1.5px dashed ${s.color}`
                            : `2px solid ${s.color}`,
                        }}
                        aria-hidden
                      />
                      {s.label}
                    </span>
                  }
                  value={
                    <span style={{ color: s.color }}>
                      {show(s.result.futureValue)}
                    </span>
                  }
                  sub={
                    <>
                      <span
                        className={cn(
                          "tabular-nums",
                          s.result.totalInterest < 0 && "text-loss"
                        )}
                      >
                        {show(s.result.totalInterest)} growth
                      </span>
                      <span className="mt-1 block">{s.tagline}</span>
                    </>
                  }
                />
              );
            })}
          </Scoreboard>
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
