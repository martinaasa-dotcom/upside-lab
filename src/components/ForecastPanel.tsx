"use client";

import { track } from "@vercel/analytics";
import { FluidRow, FluidTable, cellBase, cellTicker, tableCols } from "@/components/FluidTable";
import { TickerSymbol } from "@/components/TickerSymbol";
import {
  Card,
  EmptyState,
  InsightText,
  MicroLabel,
  NESTED_PAD,
  PanelHeader,
  Reading,
  ScanList,
  Segmented,
  SPLIT_COPY,
  SPLIT_ROW,
} from "@/components/ui/Panel";
import { Button } from "@/components/ui/button";
import { FORECAST_DISCLAIMER } from "@/lib/disclaimer";
import { listingCurrenciesAreMixed } from "@/lib/listing-currency";
import { PALETTE } from "@/lib/palette";
import { formatDateTime } from "@/lib/timezone";
import { isAbortError } from "@/lib/abort";
import {
  NO_VALUE,
  cn,
  currency,
  percent,
  signedCurrency,
  signedPercent,
  signedTone,
} from "@/lib/format";
import { compactAxis, niceScale } from "@/components/mobile/BookNavChart";
import { ChartXRail, ChartYAxis } from "@/components/ui/ChartAxis";
import type { ForecastModel, ForecastRow, ForecastYear } from "@/lib/forecast";
import {
  ensureCompleteEoyTargets,
  DEFAULT_FORECAST_STANCE,
  buildFallbackForecastPlan,
  loadForecastPlan,
  loadPreviousForecastPlan,
  planEoyPaths,
  saveForecastPlan,
  shouldAutoRefreshForecast,
  isFallbackForecastPlan,
  forecastHoldingsKey,
  bookConvictionKey,
  cachedEoyPathsFor,
  cachedTickersFor,
  type ForecastPlan,
} from "@/lib/forecast-plan";
import type { ConvictionMap } from "@/lib/conviction";
import { readJsonOrThrow } from "@/lib/http";
import { countOverrides } from "@/lib/forecast-overrides";
import type { PortfolioEoyOverrides } from "@/lib/forecast-overrides";
import { isForecastFullyCovered } from "@/lib/forecast";
import { playbookBullets, type PlaybookBullet } from "@/lib/forecast-playbook";
import { isSafePositiveMoney } from "@/lib/input-guard";
import { blockWheelChange } from "@/lib/number-input";
import { ChevronDown, Loader2, RotateCcw, Sparkles } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

type Props = {
  model: ForecastModel;
  portfolioId: string;
  portfolioName: string;
  cashBalance: number;
  overrides: PortfolioEoyOverrides;
  onSetEoyPrice: (ticker: string, year: ForecastYear, price: number) => void;
  onApplyMargusPaths: (
    paths: { ticker: string; prices: Partial<Record<ForecastYear, number>> }[]
  ) => void;
  onClearOverrides: () => void;
  /** Owner's per-ticker conviction, passed to Margus so a written thesis
   * actually influences the path instead of being ignored. */
  convictions?: ConvictionMap;
  /** False until Lab conviction has loaded. Auto-run waits so a late
   * hydrate cannot look like a missing cache and fire the model. */
  labReady?: boolean;
};

function calibratedPaths(plan: ForecastPlan, model: ForecastModel) {
  const eoyTargets = ensureCompleteEoyTargets(model, plan.eoyTargets ?? []);
  return {
    eoyTargets,
    paths: planEoyPaths({
      ...plan,
      eoyTargets,
      stance: DEFAULT_FORECAST_STANCE,
    }),
  };
}

/** "EOY 2028" assumed the reader already knew the abbreviation. */
function yearLabel(year: number) {
  return `End ${year}`;
}

/** Current calendar year is still an EOY column (Dec 31), not "now". */
function isCurrentYear(year: number) {
  return year === new Date().getFullYear();
}

function YearColHeader({ year }: { year: number }) {
  return yearLabel(year);
}

function mergeEoyPaths(
  ...lists: { ticker: string; prices: Partial<Record<ForecastYear, number>> }[][]
) {
  const map = new Map<
    string,
    { ticker: string; prices: Partial<Record<ForecastYear, number>> }
  >();
  for (const list of lists) {
    for (const p of list) {
      map.set(p.ticker.toUpperCase(), p);
    }
  }
  return [...map.values()];
}

function horizonTabLabel(label: string): string {
  const q = label.match(/Q([1-4])/i);
  if (/quarter/i.test(label) && q) return `Q${q[1]}`;
  const range = label.match(/(\d{4})\s*[–-]\s*(\d{2,4})/);
  if (range?.[1] && range[2]) {
    const end = range[2].length === 4 ? range[2].slice(2) : range[2];
    return `${range[1].slice(2)}-${end}`;
  }
  const y = label.match(/(20\d{2})/);
  return y?.[1] ?? label;
}

function PlaybookList({
  text,
  empty,
  tone,
}: {
  text: string | undefined;
  empty: string;
  tone: "add" | "trim";
}) {
  const items = playbookBullets(text);
  if (items.length === 0) {
    return <p className="mt-1.5 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="flex flex-col mt-1.5 gap-2.5">
      {items.map((item, i) => (
        <PlaybookItem key={`${item.head}-${i}`} item={item} tone={tone} />
      ))}
    </ul>
  );
}

function PlaybookItem({
  item,
  tone,
}: {
  item: PlaybookBullet;
  tone: "add" | "trim";
}) {
  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden
        className={cn(
          "mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full",
          tone === "add" ? "bg-gain" : "bg-loss"
        )}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug text-foreground">
          {item.head}
        </p>
        {item.detail && (
          <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
            {item.detail}
          </p>
        )}
      </div>
    </li>
  );
}

export function ForecastOffStub({ onShow }: { onShow: () => void }) {
  return (
    <div className={cn(SPLIT_ROW, NESTED_PAD, "card-sheen glass-well sm:items-center rounded-lg")}>
      <div className={SPLIT_COPY}>
        <p className="text-sm font-medium text-foreground">Forecast is off</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Margus&apos;s year-by-year path for this portfolio. Same idea as Pulse,
          sitting under the table.
        </p>
      </div>
      <Button
        type="button"
        onClick={onShow}
      >
        Show
      </Button>
    </div>
  );
}

function formatGeneratedAt(iso: string) {
  return (
    formatDateTime(iso, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) || iso
  );
}

function EoyPriceInput({
  value,
  targeted,
  fill = false,
  onCommit,
}: {
  value: number;
  targeted: boolean;
  /** Fills its row and takes a real touch height. The table variant cannot:
   * holdings rows are a fixed `h-10`, which is why `.inline-edit` is left out
   * of the coarse-pointer rule in `globals.css`. A phone rail has the room,
   * so it asks for the 44px back rather than leaving a 5.5rem target. */
  fill?: boolean;
  onCommit: (n: number) => void;
}) {
  const display = Number.isFinite(value) ? value.toFixed(2) : "";
  const [draft, setDraft] = useState(display);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(display);
  }, [display]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      title={targeted ? "Edit EOY target" : "Awaiting Margus path, or type a price"}
      onChange={(e) => {
        setDraft(e.target.value.replace(/,/g, ".").replace(/[^\d.-]/g, ""));
      }}
      onFocus={() => {
        focused.current = true;
      }}
      onWheel={blockWheelChange}
      onBlur={() => {
        focused.current = false;
        const n = Number.parseFloat(draft);
        if (isSafePositiveMoney(n)) {
          onCommit(Math.round(n * 100) / 100);
        } else {
          setDraft(display);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(display);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(
        "inline-edit no-spinner max-w-full rounded-t px-1 tabular-nums outline-none hover:bg-hover focus:bg-muted focus:ring-1 focus:ring-ring/50",
        // Bounded, not `w-full`. The cue is a dashed bottom border on the
        // element itself, so a full-width field draws a rule across the row
        // and reads as a separator rather than as digits you can tap.
        fill
          ? "ml-auto block w-24 py-1 text-right"
          : "mx-auto w-[5.5rem] py-0.5 text-center",
        targeted ? "text-foreground" : "text-muted-foreground"
      )}
    />
  );
}

type SheetPathPoint = { label: string; value: number };

function SheetPathChart({ points }: { points: SheetPathPoint[] }) {
  const gid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const width = 640;
  const height = 176;
  const padL = 8;
  const padR = 12;
  const padT = 12;
  const padB = 8;
  const usable = useMemo(
    () => points.filter((p) => Number.isFinite(p.value) && p.value > 0),
    [points]
  );

  useEffect(() => {
    if (!pinned) return;
    function onDoc(e: Event) {
      if (svgRef.current?.contains(e.target as Node)) return;
      setPinned(false);
      setActive(null);
    }
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [pinned]);

  const geometry = useMemo(() => {
    if (usable.length < 2) return null;
    const vals = usable.map((p) => p.value);
    const scale = niceScale(Math.min(...vals), Math.max(...vals), 4);
    const axisSpan = scale.max - scale.min || 1;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    const lastIdx = usable.length - 1;
    const xAt = (i: number) =>
      padL + (lastIdx === 0 ? innerW / 2 : (i / lastIdx) * innerW);
    const yAt = (v: number) => padT + (1 - (v - scale.min) / axisSpan) * innerH;
    const line = usable
      .map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.value).toFixed(1)}`)
      .join(" ");
    const area = `${xAt(0).toFixed(1)},${(padT + innerH).toFixed(1)} ${line} ${xAt(lastIdx).toFixed(1)},${(padT + innerH).toFixed(1)}`;
    return { ...scale, innerW, innerH, lastIdx, xAt, yAt, line, area };
  }, [usable]);

  if (!geometry) return null;

  const { ticks, innerW, innerH, lastIdx, xAt, yAt, line, area } = geometry;
  const start = usable[0]!.value;
  const hover =
    active != null && active >= 0 && active <= lastIdx ? active : null;
  const hoverPoint = hover != null ? usable[hover] : null;
  const vsNowPct =
    hoverPoint && start > 0 ? (hoverPoint.value - start) / start : null;
  const vsNowDollar =
    hoverPoint && start > 0 ? hoverPoint.value - start : null;

  function indexFromClientX(clientX: number, target: SVGSVGElement) {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || lastIdx <= 0) return 0;
    const x = ((clientX - rect.left) / rect.width) * width;
    const t = (x - padL) / innerW;
    return Math.max(0, Math.min(lastIdx, Math.round(t * lastIdx)));
  }

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(indexFromClientX(e.clientX, e.currentTarget));
    if (e.pointerType !== "mouse") setPinned(true);
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const dragging = e.currentTarget.hasPointerCapture(e.pointerId);
    if (e.pointerType === "mouse" || dragging) {
      setActive(indexFromClientX(e.clientX, e.currentTarget));
    }
  }

  function onPointerLeave(e: PointerEvent<SVGSVGElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) return;
    if (!pinned) setActive(null);
  }

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setPinned(true);
    setActive((prev) => {
      const cur = prev ?? lastIdx;
      return e.key === "ArrowLeft"
        ? Math.max(0, cur - 1)
        : Math.min(lastIdx, cur + 1);
    });
  }

  return (
    <div>
      <div className="relative">
        {hoverPoint ? (
          <div className="pointer-events-none absolute inset-x-0 top-1 z-10 flex justify-center px-10">
            <p className="max-w-full truncate rounded-lg border border-border bg-muted/95 px-2.5 py-1 text-sm tabular-nums shadow-sm">
              <span className="text-muted-foreground">{hoverPoint.label}</span>
              <span className="mx-1.5 font-semibold text-foreground">
                {currency(hoverPoint.value, 0)}
              </span>
              {vsNowPct != null && vsNowDollar != null ? (
                <span className={signedTone(vsNowPct)}>
                  {vsNowPct > 0 ? "+" : ""}
                  {percent(vsNowPct)}
                  <span className="text-muted-foreground">
                    {" "}
                    · {signedCurrency(vsNowDollar, 0)}
                  </span>
                </span>
              ) : null}
            </p>
          </div>
        ) : null}

        <div className="relative">
          <ChartYAxis
            overlay
            ticks={ticks}
            yAt={yAt}
            height={height}
            format={compactAxis}
          />
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="h-56 w-full min-w-0 cursor-crosshair touch-none select-none outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50 sm:h-72"
            role="slider"
            tabIndex={0}
            aria-label="Drag across to read a year. Modeled portfolio value through the last forecast year."
            aria-valuemin={0}
            aria-valuemax={lastIdx}
            aria-valuenow={hover ?? lastIdx}
            aria-valuetext={
              hoverPoint
                ? `${hoverPoint.label}, ${currency(hoverPoint.value, 0)}${
                    vsNowPct != null ? `, vs now ${percent(vsNowPct)}` : ""
                  }`
                : undefined
            }
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
            onKeyDown={onKeyDown}
          >
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={PALETTE.brand} stopOpacity="0.22" />
                <stop offset="1" stopColor={PALETTE.brand} stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <line
                key={t}
                x1={padL}
                x2={width - padR}
                y1={yAt(t)}
                y2={yAt(t)}
                stroke="currentColor"
                strokeOpacity={0.08}
              />
            ))}
            <polygon points={area} fill={`url(#${gid})`} />
            <polyline
              fill="none"
              stroke={PALETTE.brand}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={line}
            />
            {usable.map((p, i) => (
              <circle
                key={p.label}
                cx={xAt(i)}
                cy={yAt(p.value)}
                r={2.5}
                fill={PALETTE.card}
                stroke={PALETTE.cream}
                strokeWidth={1.5}
              />
            ))}
            {hover != null && hoverPoint && (
              <g pointerEvents="none">
                <line
                  x1={xAt(hover)}
                  x2={xAt(hover)}
                  y1={padT}
                  y2={padT + innerH}
                  stroke={PALETTE.cream}
                  strokeOpacity={0.45}
                />
                <circle
                  cx={xAt(hover)}
                  cy={yAt(hoverPoint.value)}
                  r={4.5}
                  fill={PALETTE.cream}
                  stroke={PALETTE.card}
                  strokeWidth={1.5}
                />
              </g>
            )}
          </svg>
        </div>
      </div>
      <ChartXRail inset>
          {usable.map((p, i) => {
            const isFirst = i === 0;
            const isLast = i === lastIdx;
            return (
              <span
                key={p.label}
                className="absolute top-0"
                style={{
                  left: `${((xAt(i) - padL) / innerW) * 100}%`,
                  transform: isFirst
                    ? "translateX(0)"
                    : isLast
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
                }}
              >
                {p.label}
              </span>
            );
          })}
      </ChartXRail>
    </div>
  );
}

function SheetPath({
  now,
  years,
  totals,
}: {
  now: number;
  years: readonly ForecastYear[];
  totals: Record<ForecastYear, number>;
}) {
  const points: SheetPathPoint[] = [
    { label: "Now", value: now },
    ...years.map((y) => ({ label: String(y), value: totals[y] })),
  ];

  return (
    <div className="mt-4 border-t border-border pt-4">
      <SheetPathChart points={points} />
    </div>
  );
}

/**
 * A holding's whole path in one glance: today on the left, the last
 * forecast year on the right, and a dashed rule at today's price so above
 * and below read without a number being involved.
 *
 * Deliberately not `SheetPathChart`. That one belongs to the portfolio and
 * carries an axis, a drag readout and 224px of height; five of them stacked
 * would be taller than the grid this replaced. This draws the shape and
 * nothing else, so a card stays short enough that three fit on a phone and
 * two holdings can finally be compared without scrolling between them.
 */
function TickerSpark({ values }: { values: number[] }) {
  const gid = useId().replace(/:/g, "");
  const geometry = useMemo(() => {
    const usable = values.filter((v) => Number.isFinite(v) && v > 0);
    if (usable.length < 2) return null;
    const width = 240;
    const height = 56;
    const padL = 2;
    const padR = 8;
    const padT = 6;
    const padB = 6;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    const min = Math.min(...usable);
    const max = Math.max(...usable);
    const span = max - min;
    const lastIdx = usable.length - 1;
    const xAt = (i: number) => padL + (i / lastIdx) * innerW;
    // A path with no movement in it has no top or bottom to scale to, so
    // it is drawn down the middle rather than pinned to one edge.
    const yAt = (v: number) =>
      span === 0 ? padT + innerH / 2 : padT + (1 - (v - min) / span) * innerH;
    const line = usable
      .map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`)
      .join(" ");
    const floor = (padT + innerH).toFixed(1);
    return {
      width,
      height,
      padL,
      padR,
      line,
      area: `${xAt(0).toFixed(1)},${floor} ${line} ${xAt(lastIdx).toFixed(1)},${floor}`,
      baseY: yAt(usable[0]!),
      // The dot is HTML, not a `<circle>`, because the viewBox is stretched
      // to the card width and a circle under a non-uniform scale is an egg.
      dotLeft: (xAt(lastIdx) / width) * 100,
      dotTop: (yAt(usable[lastIdx]!) / height) * 100,
    };
  }, [values]);

  if (!geometry) return null;
  const { width, height, padL, padR, line, area, baseY, dotLeft, dotTop } =
    geometry;

  return (
    <div className="relative mt-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-14 w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={PALETTE.brand} stopOpacity="0.22" />
            <stop offset="1" stopColor={PALETTE.brand} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line
          x1={padL}
          x2={width - padR}
          y1={baseY}
          y2={baseY}
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
        <polygon points={area} fill={`url(#${gid})`} />
        <polyline
          fill="none"
          stroke={PALETTE.brand}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={line}
        />
      </svg>
      <span
        aria-hidden
        className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background"
        style={{ left: `${dotLeft}%`, top: `${dotTop}%` }}
      />
    </div>
  );
}

/**
 * Years read down the card, one per row, in the order they happen.
 *
 * The grid this replaced was two columns, so the sequence ran 2026 top
 * right, 2027 bottom left: time going rightwards and then back. Down the
 * page there is only one direction to read.
 */
function YearRail({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex flex-col">{children}</div>;
}

/**
 * The note cell is always drawn, empty or not, so the figures in it line up
 * with the figures above and below rather than each row sizing itself.
 */
function YearRailRow({
  label,
  current,
  value,
  note,
}: {
  label: string;
  current?: boolean;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center gap-3 border-t border-border/60 py-1 first:border-t-0">
      <MicroLabel className="w-20 shrink-0">
        <span className={cn(current && "text-foreground")}>{label}</span>
      </MicroLabel>
      <div className="min-w-0 flex-1 text-right">{value}</div>
      <div className="w-16 shrink-0 text-right">{note}</div>
    </div>
  );
}

/**
 * One holding on a phone: the shape first, the numbers on a tap.
 *
 * The card used to be a two-column grid of five editable prices with
 * today's price sitting in it as a sixth peer, and it dropped the last
 * forecast year to make the columns divide evenly — while the percentage in
 * its own corner was measured to that dropped year, so the card could never
 * add up to its own headline. Here the path runs to the last year, the
 * summary names it, and the rail lists every one of them.
 */
function MobileForecastCard({
  row,
  years,
  mixedListings,
  onSetEoyPrice,
}: {
  row: ForecastRow;
  years: readonly ForecastYear[];
  mixedListings: boolean;
  onSetEoyPrice: (ticker: string, year: ForecastYear, price: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const railId = useId();
  const lastYear = years[years.length - 1]!;
  const values = useMemo(
    () => [row.currentPrice, ...years.map((y) => row.eoyPrices[y])],
    [row, years]
  );
  const gainAt = (price: number) =>
    row.currentPrice > 0 ? (price - row.currentPrice) / row.currentPrice : null;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={railId}
        className="block w-full text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50"
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="block">
            <span className="block text-base font-semibold text-foreground">
              <TickerSymbol ticker={row.ticker} showCurrency={mixedListings} />
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {row.shares.toLocaleString("en-US")} shares
              {!row.hasTargets && " - Margus is working on it"}
            </span>
          </span>
          <span
            className={cn(
              "text-sm font-medium tabular-nums",
              row.gainPct != null
                ? signedTone(row.gainPct)
                : "text-muted-foreground"
            )}
          >
            {row.gainPct != null ? percent(row.gainPct) : NO_VALUE}
          </span>
        </span>

        <TickerSpark values={values} />

        {!open && (
          <span className="mt-3 flex items-end justify-between gap-3">
            <span className="block">
              <MicroLabel>Now</MicroLabel>
              <span className="mt-1 block text-base font-semibold tabular-nums text-foreground">
                {currency(row.currentPrice)}
              </span>
            </span>
            <span className="block text-right">
              <MicroLabel>{yearLabel(lastYear)}</MicroLabel>
              <span className="mt-1 block text-base font-semibold tabular-nums text-foreground">
                {currency(row.eoyPrices[lastYear])}
              </span>
            </span>
          </span>
        )}

        <span className="mt-3 flex items-center justify-center gap-1 text-sm text-muted-foreground">
          {open ? "Show less" : "Show every year"}
          <ChevronDown
            aria-hidden
            className={cn("size-4 transition-transform", open && "rotate-180")}
          />
        </span>
      </button>

      {open && (
        <div id={railId}>
          <YearRail>
            <YearRailRow
              label="Now"
              value={
                <span className="block px-1 py-1 text-sm tabular-nums text-foreground">
                  {currency(row.currentPrice)}
                </span>
              }
            />
            {years.map((y) => {
              const gain = gainAt(row.eoyPrices[y]);
              return (
                <YearRailRow
                  key={y}
                  label={yearLabel(y)}
                  current={isCurrentYear(y)}
                  value={
                    <EoyPriceInput
                      fill
                      value={row.eoyPrices[y]}
                      targeted={row.targetedYears[y]}
                      onCommit={(n) => onSetEoyPrice(row.ticker, y, n)}
                    />
                  }
                  note={
                    <span
                      className={cn("text-sm tabular-nums", signedTone(gain))}
                    >
                      {gain != null ? signedPercent(gain) : NO_VALUE}
                    </span>
                  }
                />
              );
            })}
          </YearRail>
        </div>
      )}
    </Card>
  );
}

export const ForecastPanel = memo(function ForecastPanel({
  model,
  portfolioId,
  portfolioName,
  cashBalance,
  overrides,
  onSetEoyPrice,
  onApplyMargusPaths,
  onClearOverrides,
  convictions,
  labReady = true,
}: Props) {
  const yearCols = model.years;
  const mixedListings = listingCurrenciesAreMixed(
    model.rows.map((r) => ({ ticker: r.ticker }))
  );
  const tickerCell = mixedListings ? cellTicker : cellBase;
  // Ticker | Price now | End-year cols | Change. Numbers only in the grid.
  // Rationale lives under the table so a sentence cannot blow a row open.
  const template = tableCols(yearCols.length + 3, mixedListings);

  const [plan, setPlan] = useState<ForecastPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedFlash, setAppliedFlash] = useState(false);
  const [planHydrated, setPlanHydrated] = useState(false);
  const overrideCount = countOverrides(overrides);
  const flatCount = model.rows.filter((r) => !r.hasTargets).length;
  const rowTickers = useMemo(
    () => model.rows.map((r) => r.ticker),
    [model.rows]
  );
  const holdingsKey = forecastHoldingsKey(rowTickers);
  const convictionKey = bookConvictionKey(rowTickers, convictions);
  // Memoized on the stable keys rather than recomputed inline: this feeds a
  // useMemo below, and a fresh array every render made that memo recompute
  // every render, which is the same as not having it.
  const cachedTickers = useMemo(
    () => (planHydrated ? cachedTickersFor(rowTickers, convictions) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- convictionKey stands in for `convictions`
    [planHydrated, rowTickers, convictionKey]
  );
  const fullyCovered = isForecastFullyCovered(rowTickers, overrides);
  const autoKeyRef = useRef<string>("");
  const reappliedRef = useRef<string>("");
  const calibrateKeyRef = useRef<string>("");
  const seededKeyRef = useRef<string>("");
  const pendingModelRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryAfterRef = useRef(0);
  const askInFlight = useRef(false);
  const askAbortRef = useRef<AbortController | null>(null);
  const askGenRef = useRef(0);
  const planRef = useRef<ForecastPlan | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  planRef.current = plan;
  const MAX_AUTO_TRIES = 6;
  useEffect(() => {
    return () => {
      askAbortRef.current?.abort();
      askGenRef.current += 1;
    };
  }, []);
  const [prevPlan, setPrevPlan] = useState<ForecastPlan | null>(null);
  const [horizon, setHorizon] = useState(0);
  const planAt = plan?.generatedAt ?? "";
  useEffect(() => {
    if (!planHydrated) {
      setPrevPlan(null);
      return;
    }
    setPrevPlan(loadPreviousForecastPlan(portfolioId));
  }, [planHydrated, portfolioId, planAt]);

  useEffect(() => {
    setHorizon(0);
  }, [planAt]);

  useLayoutEffect(() => {
    askAbortRef.current?.abort();
    askGenRef.current += 1;
    askInFlight.current = false;
    setBusy(false);
    setPlanHydrated(false);
    const loaded = loadForecastPlan(portfolioId);
    setPlan(loaded);
    setError(null);
    setAppliedFlash(false);
    autoKeyRef.current = "";
    reappliedRef.current = "";
    calibrateKeyRef.current = "";
    seededKeyRef.current = "";
    pendingModelRef.current = false;
    retryCountRef.current = 0;
    retryAfterRef.current = 0;
    setPlanHydrated(true);
  }, [portfolioId]);

  useEffect(() => {
    retryCountRef.current = 0;
    retryAfterRef.current = 0;
  }, [holdingsKey]);

  function seedFallbackIfNeeded() {
    const key = `${portfolioId}:${holdingsKey}`;
    if (seededKeyRef.current === key) return;
    if (model.rows.length === 0) return;
    if (model.rows.every((r) => r.hasTargets)) return;
    seededKeyRef.current = key;
    const fallback = buildFallbackForecastPlan({
      forecast: model,
      portfolioId,
      portfolioName,
    });
    const paths = planEoyPaths(fallback);
    if (paths.length > 0) onApplyMargusPaths(paths);
  }

  async function askMargus(opts?: {
    silent?: boolean;
  }): Promise<"ok" | "fail" | "abort"> {
    askAbortRef.current?.abort();
    const ctrl = new AbortController();
    askAbortRef.current = ctrl;
    const gen = ++askGenRef.current;
    askInFlight.current = true;
    if (!opts?.silent) track("forecast_plan_requested");
    setBusy(true);
    setError(null);
    setAppliedFlash(false);
    seedFallbackIfNeeded();
    try {
      const res = await fetch("/api/forecast/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId,
          portfolioName,
          cashBalance,
          forecast: model,
          convictions,
        }),
        signal: ctrl.signal,
      });
      const data = await readJsonOrThrow<{
        plan?: ForecastPlan;
        fallback?: boolean;
      }>(res, "Couldn't build a forecast. Try again.");
      if (askGenRef.current !== gen || ctrl.signal.aborted) return "abort";
      if (!data.plan) {
        throw new Error("Couldn't build a forecast. Try again.");
      }
      if (data.fallback || isFallbackForecastPlan(data.plan)) {
        const shaped = calibratedPaths(
          { ...data.plan, fallback: true, stance: DEFAULT_FORECAST_STANCE },
          model
        );
        if (shaped.paths.length > 0) onApplyMargusPaths(shaped.paths);
        pendingModelRef.current = true;
        if (!opts?.silent) {
          setError(
            "Margus couldn't finish this run. Starting prices are on the grid. Tap Ask Margus to try again."
          );
        }
        return "fail";
      }
      const convictionKey = bookConvictionKey(
        model.rows.map((r) => r.ticker),
        convictions
      );
      const next: ForecastPlan = {
        ...data.plan,
        holdingsKey,
        convictionKey,
        stance: DEFAULT_FORECAST_STANCE,
      };
      const { eoyTargets, paths } = calibratedPaths(next, model);
      const calibrated: ForecastPlan = {
        ...next,
        eoyTargets,
        stance: DEFAULT_FORECAST_STANCE,
      };
      saveForecastPlan(calibrated, convictions, {
        shareTickerPaths: !data.fallback,
      });
      setPlan(calibrated);

      if (paths.length > 0) {
        onApplyMargusPaths(paths);
        setAppliedFlash(true);
      }
      autoKeyRef.current = `${portfolioId}:${holdingsKey}:${calibrated.generatedAt}`;
      reappliedRef.current = `${portfolioId}:${holdingsKey}:reapply`;
      calibrateKeyRef.current = `${portfolioId}:${holdingsKey}`;
      pendingModelRef.current = false;
      retryCountRef.current = 0;
      return "ok";
    } catch (err) {
      if (isAbortError(err) || askGenRef.current !== gen) return "abort";
      seedFallbackIfNeeded();
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Couldn't build a forecast. Try again.";
      if (!opts?.silent) setError(message);
      return "fail";
    } finally {
      if (askGenRef.current === gen) {
        askInFlight.current = false;
        setBusy(false);
      }
    }
  }

  // Upgrade cached timid plans (e.g. NBIS 182) to spreadsheet BASE without waiting for LLM.
  useEffect(() => {
    if (model.rows.length === 0) return;
    if (!plan || (plan.eoyTargets?.length ?? 0) === 0) return;
    const key = `${portfolioId}:${holdingsKey}`;
    if (calibrateKeyRef.current === key) return;
    calibrateKeyRef.current = key;

    const { eoyTargets, paths } = calibratedPaths(plan, model);
    const before = JSON.stringify(plan.eoyTargets ?? []);
    const after = JSON.stringify(eoyTargets);
    if (before === after) {
      if (flatCount > 0 && paths.length > 0) {
        onApplyMargusPaths(paths);
        reappliedRef.current = `${portfolioId}:${holdingsKey}:reapply`;
      }
      return;
    }
    const next: ForecastPlan = { ...plan, eoyTargets, holdingsKey };
    saveForecastPlan(next, convictions);
    setPlan(next);
    if (paths.length > 0) {
      onApplyMargusPaths(paths);
      reappliedRef.current = `${portfolioId}:${holdingsKey}:reapply`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one calibrate pass per sheet/holdings
  }, [portfolioId, holdingsKey, plan, model.rows.length, flatCount]);

  // Restore saved Margus prices into the grid without calling the model.
  // Shared ticker cache fills another sheet's empty cells (Anu gets Aasad's
  // NBIS path) so opening a second book does not fire a new run.
  useEffect(() => {
    if (model.rows.length === 0) return;
    if (flatCount === 0) return;
    const key = `${portfolioId}:${holdingsKey}:reapply`;
    if (reappliedRef.current === key) return;
    reappliedRef.current = key;
    const planPaths = plan
      ? calibratedPaths(plan, model).paths
      : [];
    const cachePaths = cachedEoyPathsFor(
      model.rows.map((r) => r.ticker),
      convictions
    );
    const merged = mergeEoyPaths(cachePaths, planPaths);
    if (merged.length > 0) onApplyMargusPaths(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once per sheet/holdings
  }, [portfolioId, holdingsKey, flatCount, plan]);

  // Auto: first run with nothing cached, or a new ticker with no shared path.
  // Cached reasoning is reused across sheets. Convictions loading in later
  // is not a reason to call the model again.
  //
  // First-run is a person waiting on this sheet, not a skippable background
  // job. Seed a shaped path immediately so the grid is never today's price
  // pasted across 2030, then keep asking until a plan lands or we give up.
  useEffect(() => {
    if (!labReady || !planHydrated || model.rows.length === 0) return;
    if (askInFlight.current || busy) return;
    const decision = shouldAutoRefreshForecast({
      plan,
      tickers: model.rows.map((r) => r.ticker),
      fullyCovered,
      cachedTickers,
    });
    if (plan && !decision.run) {
      pendingModelRef.current = false;
      return;
    }
    if (decision.run) pendingModelRef.current = true;
    if (!pendingModelRef.current) return;

    seedFallbackIfNeeded();

    if (retryCountRef.current >= MAX_AUTO_TRIES) return;
    const wait = retryAfterRef.current - Date.now();
    if (wait > 0) {
      const t = window.setTimeout(() => setRetryTick((n) => n + 1), wait);
      return () => window.clearTimeout(t);
    }

    void askMargus({ silent: true }).then((result) => {
      if (result === "abort" || result === "ok") return;
      retryCountRef.current += 1;
      if (retryCountRef.current >= MAX_AUTO_TRIES) {
        setError(
          "Couldn't reach Margus after several tries. Starting prices are on your portfolio. Tap Ask Margus when you want him to try again."
        );
        return;
      }
      retryAfterRef.current =
        Date.now() + Math.min(4000 * 2 ** (retryCountRef.current - 1), 20_000);
      setRetryTick((n) => n + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gated auto refresh
  }, [labReady, planHydrated, portfolioId, holdingsKey, plan, fullyCovered, model.rows.length, busy, cachedTickers.join("|"), retryTick]);

  // If a sold ticker is still named in the playbook, say so. The model
  // does not auto-rerun for that; use "Work it out again" when you want
  // the writeup to drop the old name.
  const soldTickersInPlan = useMemo(() => {
    if (!plan) return [];
    const planKey =
      plan.holdingsKey ??
      forecastHoldingsKey((plan.eoyTargets ?? []).map((t) => t.ticker));
    if (!planKey) return [];
    const planTickers = planKey.split("|").filter(Boolean);
    const current = new Set(model.rows.map((r) => r.ticker.toUpperCase()));
    return planTickers.filter((t) => !current.has(t));
  }, [plan, model.rows]);

  const lastPlanDiffs = useMemo(() => {
    if (!plan || !prevPlan?.eoyTargets?.length) return [];
    const lastYear = yearCols[yearCols.length - 1];
    if (lastYear == null) return [];
    const out: { ticker: string; from: number; to: number }[] = [];
    for (const t of plan.eoyTargets) {
      const old = prevPlan.eoyTargets.find(
        (p) => p.ticker.toUpperCase() === t.ticker.toUpperCase()
      );
      if (!old) continue;
      const nextP = t.prices?.[lastYear];
      const oldP = old.prices?.[lastYear];
      if (
        typeof nextP !== "number" ||
        typeof oldP !== "number" ||
        Math.abs(nextP - oldP) < 0.5
      ) {
        continue;
      }
      out.push({ ticker: t.ticker, from: oldP, to: nextP });
    }
    return out;
  }, [plan, prevPlan, yearCols]);

  const activePeriod =
    plan && plan.periods.length > 0
      ? plan.periods[Math.min(horizon, plan.periods.length - 1)]
      : null;

  const whyRows = useMemo(() => {
    if (!plan?.eoyTargets) return [];
    return plan.eoyTargets
      .map((t) => ({
        ticker: t.ticker,
        text:
          t.rationale?.trim() ||
          convictions?.[t.ticker]?.thesis?.trim() ||
          "",
      }))
      .filter((row) => row.text);
  }, [plan, convictions]);

  const statusHint = useMemo(() => {
    if (!labReady || !planHydrated || model.rows.length === 0 || busy) return null;
    const decision = shouldAutoRefreshForecast({
      plan,
      tickers: model.rows.map((r) => r.ticker),
      fullyCovered,
      cachedTickers,
    });
    if (retryCountRef.current >= MAX_AUTO_TRIES && retryTick >= 0) return null;
    if (decision.run && decision.reason === "first-run") {
      return "First time on this portfolio, Margus is working out the prices …";
    }
    if (decision.run && decision.reason === "new-holding") {
      return "New holding, Margus is working out a path …";
    }
    if (pendingModelRef.current && !plan) {
      return "Starting prices are on your portfolio. Margus is still writing the why …";
    }
    return null;
  }, [labReady, planHydrated, model.rows, plan, fullyCovered, busy, cachedTickers, retryTick]);

  return (
    <section className="overflow-hidden rounded-xl glass ring-1 ring-foreground/20">
      <header className="border-b border-border p-6">
        <PanelHeader
          title="Forecast"
          subtitle={`A yearly price for each holding, to 2030. ${FORECAST_DISCLAIMER}`}
          actions={
            <>
              {overrideCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClearOverrides}
                  title="Throw away every price you or Margus changed on this portfolio"
                >
                  <RotateCcw data-icon="inline-start" aria-hidden />
                  Undo my changes ({overrideCount})
                </Button>
              )}
              <Button
                type="button"
                disabled={busy || model.rows.length === 0}
                onClick={() => void askMargus()}
                title="Work the whole forecast out again from scratch"
              >
                {busy ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
                ) : (
                  <Sparkles data-icon="inline-start" aria-hidden />
                )}
                {busy ? "Thinking …" : plan ? "Work it out again" : "Ask Margus"}
              </Button>
            </>
          }
        />
        {statusHint && (
          <p className="mt-4 text-sm text-muted-foreground">{statusHint}</p>
        )}
        {busy && (
          <p className="mt-2 text-sm text-muted-foreground">
            Margus is updating the forecast …
          </p>
        )}
        {error && (
          <p className="mt-2 text-sm text-loss">{error}</p>
        )}
        {model.rows.length > 0 && (
          <SheetPath
            now={model.currentTotal}
            years={yearCols}
            totals={model.eoyTotals}
          />
        )}
      </header>

      {model.rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          Add a holding and Margus will work out where it could go.
        </div>
      ) : (
        <>
          {/* Mobile */}
          <div className="flex flex-col gap-3 p-4 md:hidden">
            {model.rows.map((r) => (
              <MobileForecastCard
                key={r.ticker}
                row={r}
                years={yearCols}
                mixedListings={mixedListings}
                onSetEoyPrice={onSetEoyPrice}
              />
            ))}

            <div className={cn("card-sheen glass-well rounded-lg", NESTED_PAD)}>
              <p className="text-sm font-medium text-muted-foreground">
                Whole portfolio
              </p>
              <p className="mt-1.5 font-sans text-lg font-semibold leading-none tabular-nums text-foreground">
                {currency(model.currentTotal)}
              </p>
              <YearRail>
                {yearCols.map((y) => {
                  const gain =
                    model.currentTotal > 0
                      ? (model.eoyTotals[y] - model.currentTotal) /
                        model.currentTotal
                      : null;
                  return (
                    <YearRailRow
                      key={y}
                      label={yearLabel(y)}
                      current={isCurrentYear(y)}
                      value={
                        <span className="text-sm tabular-nums text-foreground">
                          {currency(model.eoyTotals[y], 0)}
                        </span>
                      }
                      note={
                        <span
                          className={cn(
                            "text-sm tabular-nums",
                            signedTone(gain)
                          )}
                        >
                          {gain != null ? signedPercent(gain) : NO_VALUE}
                        </span>
                      }
                    />
                  );
                })}
              </YearRail>
            </div>
          </div>

          {/* Desktop */}
          <div className="hidden md:block">
            <FluidTable template={template}>
              <FluidRow className="text-sm font-medium text-muted-foreground">
                <div className={tickerCell}>Ticker</div>
                <div className={cn(cellBase, "tabular-nums")}>Price now</div>
                {yearCols.map((y) => (
                  <div
                    key={y}
                    className={cn(
                      cellBase,
                      "tabular-nums",
                      isCurrentYear(y) && "text-foreground"
                    )}
                    title={isCurrentYear(y) ? "Year-end, not today's price" : undefined}
                  >
                    <YearColHeader year={y} />
                  </div>
                ))}
                <div className={cn(cellBase, "tabular-nums")}>Change</div>
              </FluidRow>

              {model.rows.map((r) => (
                <FluidRow key={r.ticker} className="hover:bg-muted/50">
                  <div
                    className={cn(
                      tickerCell,
                      "font-semibold tracking-wide text-foreground"
                    )}
                    title={!r.hasTargets ? "Margus is still working out this path" : undefined}
                  >
                    <TickerSymbol
                      ticker={r.ticker}
                      showCurrency={mixedListings}
                    />
                  </div>
                  <div className={cn(cellBase, "tabular-nums text-foreground")}>
                    {currency(r.currentPrice)}
                  </div>
                  {yearCols.map((y) => (
                    <div key={y} className={cn(cellBase, "tabular-nums")}>
                      <EoyPriceInput
                        value={r.eoyPrices[y]}
                        targeted={r.targetedYears[y]}
                        onCommit={(n) => onSetEoyPrice(r.ticker, y, n)}
                      />
                    </div>
                  ))}
                  <div
                    className={cn(
                      cellBase,
                      "font-medium",
                      r.gainPct != null
                        ? signedTone(r.gainPct)
                        : "text-muted-foreground"
                    )}
                  >
                    {r.gainPct != null ? percent(r.gainPct) : NO_VALUE}
                  </div>
                </FluidRow>
              ))}

              <FluidRow footer className="border-t border-border font-semibold">
                <div className={cn(tickerCell, "text-foreground")}>
                  Portfolio
                </div>
                <div className={cn(cellBase, "tabular-nums text-foreground")}>
                  {currency(model.currentTotal)}
                </div>
                {yearCols.map((y) => (
                  <div key={y} className={cn(cellBase, "tabular-nums text-foreground")}>
                    {currency(model.eoyTotals[y])}
                  </div>
                ))}
                <div
                  className={cn(
                    cellBase,
                    model.gainPct != null
                      ? signedTone(model.gainPct)
                      : "text-muted-foreground"
                  )}
                >
                  {model.gainPct != null ? percent(model.gainPct) : NO_VALUE}
                </div>
              </FluidRow>
            </FluidTable>
          </div>
        </>
      )}

      <div className="border-t border-border p-6">
        <div>
          <h3 className="font-semibold text-foreground">
            What Margus makes of it
          </h3>
          {plan?.generatedAt && (
            <p className="mt-1.5 text-sm text-muted-foreground">
              Worked out {formatGeneratedAt(plan.generatedAt)}
              {appliedFlash ? " - prices updated" : ""}
            </p>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-sm text-loss">
            {error}
          </p>
        )}

        {!plan && !busy && !error && (
          <EmptyState
            className="mt-3"
            title="Margus is still working on this one"
            detail="Starting prices may already be on the grid above. He writes the why here as soon as a run lands."
            action={
              <Button
                type="button"
                disabled={busy || model.rows.length === 0}
                onClick={() => void askMargus()}
              >
                <Sparkles data-icon="inline-start" aria-hidden />
                Ask Margus
              </Button>
            }
          />
        )}

        {busy && !plan && (
          <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-border bg-accent px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Working through every holding in this portfolio …
          </div>
        )}
        {plan && !isFallbackForecastPlan(plan) && (
          <div className="flex flex-col mt-4 gap-4">
            {(plan.generalAdvice || plan.sectorRotation) && (
              <Reading nested>
                {plan.generalAdvice && (
                  <p>
                    <InsightText text={plan.generalAdvice} />
                  </p>
                )}
                {plan.sectorRotation && (
                  <p className={plan.generalAdvice ? "mt-3 text-muted-foreground" : undefined}>
                    <InsightText text={plan.sectorRotation} />
                  </p>
                )}
              </Reading>
            )}

            {whyRows.length > 0 && (
              <ScanList nested label="Why each number" rows={whyRows} />
            )}

            {lastPlanDiffs.length > 0 && (
              <Card className="overflow-hidden p-0">
                <div className="border-b border-border/50 px-4 py-3">
                  <p className="text-sm font-medium text-muted-foreground">Vs last plan</p>
                </div>
                <ul>
                  {lastPlanDiffs.map((d) => (
                    <li
                      key={d.ticker}
                      className="flex gap-3 border-t border-border/50 px-4 py-3.5 first:border-t-0"
                    >
                      <span
                        className={cn(
                          "flex shrink-0 whitespace-nowrap font-semibold text-foreground",
                          mixedListings ? "w-max justify-start" : "w-[7.5rem] justify-end"
                        )}
                      >
                        <TickerSymbol
                          ticker={d.ticker}
                          showCurrency={mixedListings}
                        />
                      </span>
                      <span className="min-w-0 text-sm text-muted-foreground">
                        {`End ${yearCols[yearCols.length - 1]}: ${currency(d.from, 0)} to ${currency(d.to, 0)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {soldTickersInPlan.length > 0 && (
              <Card
                className={cn(SPLIT_ROW, "sm:items-center text-sm text-foreground")}
              >
                <span className={SPLIT_COPY}>
                  This still mentions {soldTickersInPlan.join(", ")}, which you
                  no longer hold here.
                  {busy ? " Updating …" : ""}
                </span>
                {!busy && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void askMargus()}
                  >
                    Update it
                  </Button>
                )}
              </Card>
            )}

            {activePeriod && (
              <div className="flex flex-col gap-4">
                <div>
                  <MicroLabel>Modeled mix for this stretch</MicroLabel>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {activePeriod.theme}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {activePeriod.label}
                  </p>
                </div>
                {plan.periods.length > 1 && (
                  <Segmented
                    options={plan.periods.map((p, i) => ({
                      id: String(i),
                      label: horizonTabLabel(p.label),
                      title: p.label,
                    }))}
                    value={String(
                      Math.min(horizon, plan.periods.length - 1)
                    )}
                    onChange={(id) => setHorizon(Number(id))}
                    ariaLabel="Forecast horizon"
                    columns={plan.periods.length}
                  />
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Card>
                    <MicroLabel>Modeled mix: larger share</MicroLabel>
                    <PlaybookList
                      text={activePeriod.add}
                      empty="Unchanged in this stretch"
                      tone="add"
                    />
                  </Card>
                  <Card>
                    <MicroLabel className="text-loss">
                      Modeled mix: smaller share
                    </MicroLabel>
                    <PlaybookList
                      text={activePeriod.trim}
                      empty="Unchanged in this stretch"
                      tone="trim"
                    />
                  </Card>
                </div>
                {activePeriod.notes?.trim() && (
                  <Reading nested label="Net effect">
                    <InsightText text={activePeriod.notes} />
                  </Reading>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
});
