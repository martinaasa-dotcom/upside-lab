"use client";

import { track } from "@vercel/analytics";
import { TickerSymbol } from "@/components/TickerSymbol";
import {
  Card,
  EmptyState,
  InsightText,
  MicroLabel,
  NESTED_PAD,
  Panel,
  PanelHeader,
  Reading,
  SCORE_CELL,
  Segmented,
  SPLIT_COPY,
  SPLIT_ROW,
} from "@/components/ui/Panel";
import { Button } from "@/components/ui/button";
import { WhyThis } from "@/components/ui/WhyThis";
import {
  forecastPathProvenance,
  forecastRoomProvenance,
  forecastTotalProvenance,
} from "@/lib/provenance";
import { listingCurrenciesAreMixed } from "@/lib/listing-currency";
import { formatDateTime } from "@/lib/timezone";
import { isAbortError } from "@/lib/abort";
import {
  NO_VALUE,
  cashtag,
  cn,
  currency,
  signedPercent,
  signedTone,
} from "@/lib/format";
import {
  SheetPathChart,
  type SheetPathPoint,
} from "@/components/ui/PathChart";
import type { ForecastModel, ForecastRow, ForecastYear } from "@/lib/forecast";
import {
  ensureCompleteEoyTargets,
  forecastPathWasAdjusted,
  type ForecastPathAdjustment,
  DEFAULT_FORECAST_STANCE,
  buildFallbackForecastPlan,
  loadForecastPlan,
  loadPreviousForecastPlan,
  planEoyPaths,
  saveForecastPlan,
  shouldAutoRefreshForecast,
  isFallbackForecastPlan,
  forecastHoldingsKey,
  cachedEoyPathsFor,
  cachedTickersFor,
  TICKER_SECTORS,
  type ForecastPlan,
} from "@/lib/forecast-plan";
import { beliefLines } from "@/lib/believe";
import { sharesLabel } from "@/lib/share-count";
import { readJsonOrThrow } from "@/lib/http";
import type { PortfolioEoyOverrides } from "@/lib/forecast-overrides";
import { isForecastFullyCovered } from "@/lib/forecast";
import { playbookBullets, type PlaybookBullet } from "@/lib/forecast-playbook";
import { isSafePositiveMoney } from "@/lib/input-guard";
import { blockWheelChange } from "@/lib/number-input";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
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
  /** False until Lab state has loaded. Auto-run waits so a late hydrate
   * cannot look like a missing cache and fire the model. */
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
      title={targeted ? "Edit the end of year target" : "Waiting for Margus to work this one out, or type a price yourself"}
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


function SheetPath({
  now,
  years,
  totals,
  placeholder = false,
}: {
  now: number;
  years: readonly ForecastYear[];
  totals: Record<ForecastYear, number>;
  placeholder?: boolean;
}) {
  const points: SheetPathPoint[] = [
    { label: "Now", value: now },
    ...years.map((y) => ({ label: String(y), value: totals[y] })),
  ];

  return (
    <div className="mt-4 border-t border-border pt-4">
      <SheetPathChart points={points} placeholder={placeholder} />
      {placeholder ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          A placeholder shape until Margus works this out. It is the usual
          rhythm for each kind of business rather than anything reasoned
          about your companies, which is why it is drawn as a dashed line.
        </p>
      ) : null}
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
 * One holding: today, the last forecast year, and why the path goes
 * there. Same card at every width. The portfolio chart above already
 * shows the shape; a second gold line per name added nothing a person
 * could not read from these two prices, and it crowded out the reason.
 */
function ForecastCard({
  row,
  years,
  mixedListings,
  why,
  provenance,
  placeholder = false,
  onSetEoyPrice,
}: {
  row: ForecastRow;
  years: readonly ForecastYear[];
  mixedListings: boolean;
  /**
   * Why this path, in Margus's own sentence. On the card rather than in a
   * list under the grid.
   */
  why?: string;
  provenance: ReturnType<typeof forecastPathProvenance>;
  /** No model has reasoned this one, so it is drawn as a placeholder. */
  placeholder?: boolean;
  onSetEoyPrice: (ticker: string, year: ForecastYear, price: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const railId = useId();
  const lastYear = years[years.length - 1]!;
  const gainAt = (price: number) =>
    row.currentPrice > 0 ? (price - row.currentPrice) / row.currentPrice : null;

  /*
   * What that last price is asking of the company, said as arithmetic.
   * A figure with two decimal places reads as a measurement whatever the
   * label above it says, so the answer is to restate it against things
   * this company has actually done.
   */
  const believe = beliefLines(
    {
      subject: cashtag(row.ticker),
      spot: row.currentPrice,
      target: row.eoyPrices[lastYear],
      months: (lastYear - new Date().getFullYear() + 1) * 12,
    },
    (n) => currency(n)
  );

  return (
    <div className={SCORE_CELL}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground">
            <TickerSymbol ticker={row.ticker} showCurrency={mixedListings} />
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {sharesLabel(row.shares)}
            {!row.hasTargets && ", and Margus is still working this one out"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <div className="flex items-center gap-1.5">
            <p
              className={cn(
                "text-sm font-medium tabular-nums",
                placeholder
                  ? "text-muted-foreground"
                  : row.gainPct != null
                    ? signedTone(row.gainPct)
                    : "text-muted-foreground"
              )}
            >
              {row.gainPct != null ? signedPercent(row.gainPct) : NO_VALUE}
            </p>
            <WhyThis provenance={provenance} />
          </div>
          <MicroLabel>by {lastYear}</MicroLabel>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <MicroLabel>Now</MicroLabel>
          <p className="mt-1 break-words font-mono text-base font-semibold tabular-nums text-foreground">
            {currency(row.currentPrice)}
          </p>
        </div>
        <div className="min-w-0 text-right">
          <MicroLabel>{yearLabel(lastYear)}</MicroLabel>
          <p className="mt-1 break-words font-mono text-base font-semibold tabular-nums text-foreground">
            {currency(row.eoyPrices[lastYear])}
          </p>
        </div>
      </div>

      {why ? (
        <p className="mt-4 text-sm leading-relaxed text-foreground">
          <InsightText text={why} />
        </p>
      ) : row.hasTargets ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No reason written for this one yet.
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Margus is still writing why this path looks like this.
        </p>
      )}

      {believe.length > 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {believe.join(" ")}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={railId}
        className="mt-4 flex w-full items-center justify-center gap-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50"
      >
        {open ? "Show less" : "Show every year"}
        <ChevronDown
          aria-hidden
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
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
                    <span className="inline-flex items-baseline justify-end gap-0.5">
                      {/*
                        The rail prints "393.19" beside a Now of "$324.95",
                        so the one figure a reader can type is the one that
                        does not say what it is. The sign lives outside the
                        field, exactly as the covered-call target does.
                      */}
                      <span className="text-sm text-muted-foreground">$</span>
                      <EoyPriceInput
                        fill
                        value={row.eoyPrices[y]}
                        targeted={row.targetedYears[y]}
                        onCommit={(n) => onSetEoyPrice(row.ticker, y, n)}
                      />
                    </span>
                  }
                  note={
                    <span
                      className={cn(
                        "text-sm tabular-nums",
                        placeholder
                          ? "text-muted-foreground"
                          : signedTone(gain)
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
      )}
    </div>
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
  labReady = true,
}: Props) {
  const yearCols = model.years;
  const mixedListings = listingCurrenciesAreMixed(
    model.rows.map((r) => ({ ticker: r.ticker }))
  );

  const [plan, setPlan] = useState<ForecastPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedFlash, setAppliedFlash] = useState(false);
  const [planHydrated, setPlanHydrated] = useState(false);
  const flatCount = model.rows.filter((r) => !r.hasTargets).length;
  const rowTickers = useMemo(
    () => model.rows.map((r) => r.ticker),
    [model.rows]
  );
  const holdingsKey = forecastHoldingsKey(rowTickers);
  // Memoized on the stable keys rather than recomputed inline: this feeds a
  // useMemo below, and a fresh array every render made that memo recompute
  // every render, which is the same as not having it.
  const cachedTickers = useMemo(
    () => (planHydrated ? cachedTickersFor(rowTickers) : []),
    [planHydrated, rowTickers]
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
            "Margus could not finish this one. The starting prices are already in the table. Tap Ask Margus to try again."
          );
        }
        return "fail";
      }
      const next: ForecastPlan = {
        ...data.plan,
        holdingsKey,
        stance: DEFAULT_FORECAST_STANCE,
      };
      const { eoyTargets, paths } = calibratedPaths(next, model);
      const calibrated: ForecastPlan = {
        ...next,
        eoyTargets,
        stance: DEFAULT_FORECAST_STANCE,
      };
      saveForecastPlan(calibrated, { shareTickerPaths: !data.fallback });
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
    saveForecastPlan(next);
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
    const cachePaths = cachedEoyPathsFor(model.rows.map((r) => r.ticker));
    const merged = mergeEoyPaths(cachePaths, planPaths);
    if (merged.length > 0) onApplyMargusPaths(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once per sheet/holdings
  }, [portfolioId, holdingsKey, flatCount, plan]);

  // Auto: first run with nothing cached, or a new ticker with no shared path.
  // Cached reasoning is reused across sheets.
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
          "Margus could not be reached after several tries. The starting prices are already on your portfolio. Tap Ask Margus whenever you want him to try again."
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

  /**
   * Why each path, keyed by ticker, for the card that path belongs to.
   *
   * This used to be its own labelled list under the grid, which meant the
   * reasoning sat a scroll away from the number making the claim.
   */
  const whyByTicker = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of plan?.eoyTargets ?? []) {
      const text = t.rationale?.trim() || "";
      if (text) map.set(t.ticker.toUpperCase(), text);
    }
    return map;
  }, [plan]);

  /*
   * What this app changed about each path after the model answered, worked
   * out by running the same calibration the grid runs and listening to what
   * it reports. Derived here rather than sent from the API on purpose: the
   * client re-calibrates a saved plan on every load, so this is what the
   * reader is actually looking at rather than what the last run produced.
   */
  const adjustByTicker = useMemo(() => {
    const map = new Map<string, ForecastPathAdjustment>();
    if (!plan) return map;
    ensureCompleteEoyTargets(model, plan.eoyTargets ?? [], (ticker, adjust) => {
      map.set(ticker, adjust);
    });
    return map;
  }, [plan, model]);

  const adjustedCount = useMemo(
    () =>
      [...adjustByTicker.values()].filter((a) => forecastPathWasAdjusted(a))
        .length,
    [adjustByTicker]
  );

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
      return "This is the first run on this portfolio, so Margus is working out the prices …";
    }
    if (decision.run && decision.reason === "new-holding") {
      return "There is a new holding here, so Margus is working out a path for it …";
    }
    if (pendingModelRef.current && !plan) {
      return "The starting prices are already on your portfolio. Margus is still writing the reasoning …";
    }
    return null;
  }, [labReady, planHydrated, model.rows, plan, fullyCovered, busy, cachedTickers, retryTick]);

  /*
   * No model has answered for this portfolio, so every price on the screen
   * came from the generic shaper. The numbers stay exactly as they are,
   * per the rule that nothing in this app moves the model's answer; what
   * changes is that they stop being drawn as though somebody reasoned
   * them.
   */
  const isPlaceholder = isFallbackForecastPlan(plan) || !plan;

  /*
   * An empty portfolio used to stack four empty panels, and this was two
   * of them: a "No holdings yet" card, and a line under it saying Margus
   * was still working out starting prices for holdings that do not exist.
   * The Holdings empty state is the one that says what to do next, so it
   * is the only one that renders.
   */
  if (model.rows.length === 0) return null;

  return (
    <Panel padded={false} className="overflow-hidden">
      <header className="border-b border-border p-6">
        <PanelHeader
          title={
            <span className="inline-flex items-center gap-2">
              Forecast
              <WhyThis
                provenance={forecastRoomProvenance({
                  at: plan?.generatedAt,
                  fallback: isPlaceholder,
                  model: plan?.writtenBy,
                  adjustedCount,
                  reusedCount: Object.keys(plan?.reused ?? {}).length,
                })}
              />
            </span>
          }
          subtitle={`A yearly price for each holding, to ${yearCols[yearCols.length - 1] ?? ""}. The chart is the whole portfolio. Each card says why that company's price is expected to go where it does.`}
          actions={
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
            placeholder={isPlaceholder}
          />
        )}
      </header>

      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {model.rows.map((r) => (
          <ForecastCard
            key={r.ticker}
            row={r}
            years={yearCols}
            mixedListings={mixedListings}
            why={whyByTicker.get(r.ticker.toUpperCase())}
            provenance={forecastPathProvenance({
              ticker: r.ticker,
              spot: r.currentPrice,
              sector:
                TICKER_SECTORS[r.ticker] ??
                TICKER_SECTORS[r.ticker.split(".")[0]!] ??
                null,
              fallback: isPlaceholder || !r.hasTargets,
              at: plan?.generatedAt,
              model: plan?.writtenBy,
              adjust: adjustByTicker.get(r.ticker.toUpperCase()),
              reusedAt: plan?.reused?.[r.ticker.toUpperCase()] ?? null,
              lastYear: yearCols[yearCols.length - 1],
            })}
            placeholder={isPlaceholder || !r.hasTargets}
            onSetEoyPrice={onSetEoyPrice}
          />
        ))}
      </div>

      <div className={cn("mx-4 mb-4 card-sheen glass-well rounded-lg", NESTED_PAD)}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">
            Whole portfolio
          </p>
          <WhyThis
            provenance={forecastTotalProvenance({
              at: plan?.generatedAt,
              fallback: isPlaceholder,
              model: plan?.writtenBy,
            })}
          />
        </div>
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
                      isPlaceholder
                        ? "text-muted-foreground"
                        : signedTone(gain)
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

      <div className="border-t border-border p-6">
        <div>
          <h3 className="font-semibold text-foreground">
            What Margus makes of it
          </h3>
          {plan?.generatedAt && (
            <p className="mt-1.5 text-sm text-muted-foreground">
              Worked out {formatGeneratedAt(plan.generatedAt)}
              {appliedFlash ? ". The prices have just been updated." : ""}
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
            detail="The starting prices may already be on the cards above. His reasoning appears here as soon as the run finishes."
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

            {lastPlanDiffs.length > 0 && (
              <Card className="overflow-hidden p-0">
                <div className="border-b border-border/50 px-4 py-3">
                  <p className="text-sm font-medium text-muted-foreground">
                    Since the last run
                  </p>
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
                  <MicroLabel>Modeled mix</MicroLabel>
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
                    <MicroLabel>Larger share</MicroLabel>
                    <PlaybookList
                      text={activePeriod.add}
                      empty="Same mix"
                      tone="add"
                    />
                  </Card>
                  <Card>
                    <MicroLabel className="text-loss">
                      Smaller share
                    </MicroLabel>
                    <PlaybookList
                      text={activePeriod.trim}
                      empty="Same mix"
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
    </Panel>
  );
});
