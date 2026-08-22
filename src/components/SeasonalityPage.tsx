"use client";

import { cn, cashtag } from "@/lib/format";
import { plainError } from "@/lib/plain-error";
import {
  MONTH_NAMES,
  MONTH_SHORT,
  type ActionSignal,
  type ActionStance,
  type CycleDayRow,
  type CycleMonthlyRow,
  type SeasonalityModel,
} from "@/lib/market/seasonality";
import {
  NESTED_PAD,
  Panel,
  PanelHeader,
  Score,
  Scoreboard,
  SPLIT_ACTIONS,
  SPLIT_COPY,
  SPLIT_ROW,
} from "@/components/ui/Panel";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { isAbortError } from "@/lib/abort";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { loadSeasonalityPaint, saveSeasonalityPaint } from "@/lib/paint-cache";

const DEFAULT_TICKERS = ["SPY", "^GSPC", "QQQ", "IWM", "DIA"];

type Props = {
  /** Book tickers appended to the benchmark dropdown so you can check your
   * own names, not just the index. */
  bookTickers?: string[];
};

function fmtPct(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function retText(v: number): string {
  if (v > 0.05) return "text-gain";
  if (v < -0.05) return "text-loss";
  return "text-muted-foreground";
}

function retBarColor(v: number): string {
  if (v > 0.05) return "bg-gain";
  if (v < -0.05) return "bg-loss";
  return "bg-muted";
}

function retWash(v: number): string {
  if (v > 0.05) return "bg-gain/15";
  if (v < -0.05) return "bg-loss/15";
  return "bg-accent/60";
}

function retTone(v: number): "up" | "down" | undefined {
  if (v > 0.05) return "up";
  if (v < -0.05) return "down";
  return undefined;
}

function stanceStyles(stance: ActionStance): string {
  if (stance === "deploy") return "border-gain/30 bg-gain/[0.08]";
  if (stance === "raise_cash") return "border-loss/30 bg-loss/[0.08]";
  return "border-border bg-card";
}

function stanceLabel(stance: ActionStance): string {
  if (stance === "deploy") return "Historically strong months";
  if (stance === "raise_cash") return "Historically soft months";
  return "Mixed / no seasonal edge";
}

function CycleMonthlyChart({
  rows,
  selectedMonth,
  currentMonth,
  onSelectMonth,
}: {
  rows: CycleMonthlyRow[];
  /** The bar the user actually clicked — this is what should visibly glow. */
  selectedMonth: number;
  /** Today's real calendar month — a subtler ring when it isn't selected. */
  currentMonth: number;
  onSelectMonth: (m: number) => void;
}) {
  const maxAbs = Math.max(
    ...rows.map((r) => Math.abs(r.avgMonthReturnPct)),
    0.5
  );

  return (
    <div className="hidden items-end gap-1 md:flex">
      {rows.map((row) => {
        const v = row.avgMonthReturnPct;
        const h = Math.max(6, (Math.abs(v) / maxAbs) * 100);
        const isSelected = row.month === selectedMonth;
        const isCurrent = row.month === currentMonth;
        return (
          <button
            key={row.month}
            type="button"
            onClick={() => onSelectMonth(row.month)}
            aria-pressed={isSelected}
            className={cn(
              "group flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md px-0.5 py-1 transition",
              isSelected
                ? "bg-accent ring-2 ring-primary"
                : isCurrent
                  ? "ring-1 ring-ring/40 hover:bg-hover"
                  : "hover:bg-hover"
            )}
            title={`${row.label}: avg ${fmtPct(v)} (${row.samples} prior ${row.label}s)`}
          >
            <div className="flex h-28 w-full items-end justify-center">
              <div
                className={cn(
                  "w-full max-w-[2.25rem] rounded-t transition group-hover:opacity-90",
                  retBarColor(v)
                )}
                style={{ height: `${h}%` }}
              />
            </div>
            <span
              className={cn(
                "text-sm",
                isSelected
                  ? "font-bold text-foreground"
                  : isCurrent
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground"
              )}
            >
              {row.label}
            </span>
            <span className={cn("text-sm tabular-nums", retText(v))}>
              {fmtPct(v)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Phone layout: 3×4 month tiles instead of 12 skinny bars. */
function CycleMonthlyTiles({
  rows,
  selectedMonth,
  currentMonth,
  onSelectMonth,
}: {
  rows: CycleMonthlyRow[];
  selectedMonth: number;
  currentMonth: number;
  onSelectMonth: (m: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 md:hidden">
      {rows.map((row) => {
        const v = row.avgMonthReturnPct;
        const isSelected = row.month === selectedMonth;
        const isCurrent = row.month === currentMonth;
        return (
          <button
            key={row.month}
            type="button"
            onClick={() => onSelectMonth(row.month)}
            aria-pressed={isSelected}
            className={cn(
              "touch-target flex min-h-14 flex-col items-center justify-center rounded-xl px-1.5 py-2 transition",
              retWash(v),
              isSelected
                ? "ring-2 ring-primary"
                : isCurrent
                  ? "ring-1 ring-ring/40"
                  : "hover:brightness-110"
            )}
          >
            <span
              className={cn(
                "text-sm",
                isSelected || isCurrent
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {row.label}
            </span>
            <span className={cn("mt-0.5 text-sm font-semibold tabular-nums", retText(v))}>
              {fmtPct(v)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function historyMedian(returns: number[]): number {
  const s = [...returns].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function CycleHistoryBars({
  history,
  highlightYear,
}: {
  history: Array<{ year: number; returnPct: number }>;
  highlightYear?: number;
}) {
  if (history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No prior data in this cycle phase.</p>
    );
  }

  const sorted = [...history].sort((a, b) => a.year - b.year);
  const maxAbs = Math.max(...sorted.map((h) => Math.abs(h.returnPct)), 0.5);

  return (
    <div className="grid gap-0.5 md:h-52 md:overflow-y-auto md:overscroll-contain">
      {sorted.map((h) => {
        const barW = (Math.abs(h.returnPct) / maxAbs) * 50;
        const isHighlight = highlightYear === h.year;
        return (
          <div
            key={h.year}
            className={cn(
              "grid grid-cols-[3.25rem_minmax(0,1fr)_4.25rem] items-center gap-2 rounded-lg px-1 py-1.5",
              isHighlight && "bg-accent ring-1 ring-foreground/20"
            )}
            title={`${h.year}: ${fmtPct(h.returnPct, 2)}`}
          >
            <span
              className={cn(
                "text-sm tabular-nums",
                isHighlight ? "font-semibold text-foreground" : "text-muted-foreground"
              )}
            >
              {h.year}
            </span>
            <div className="relative h-3 overflow-hidden rounded-sm bg-accent/70">
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-px bg-border" />
              <div
                className={cn(
                  "absolute inset-y-0 rounded-sm opacity-90",
                  retBarColor(h.returnPct)
                )}
                style={
                  h.returnPct >= 0
                    ? { left: "50%", width: `${barW}%` }
                    : { right: "50%", width: `${barW}%` }
                }
              />
            </div>
            <span
              className={cn(
                "text-right text-sm font-medium tabular-nums",
                retText(h.returnPct)
              )}
            >
              {fmtPct(h.returnPct)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SelectedHistory({
  heading,
  avgPct,
  winRate,
  samples,
  digits = 1,
  history,
  highlightYear,
}: {
  heading: string;
  avgPct: number;
  winRate: number;
  samples: number;
  digits?: number;
  history: Array<{ year: number; returnPct: number }>;
  highlightYear?: number;
}) {
  const best = [...history].sort((a, b) => b.returnPct - a.returnPct)[0];
  const worst = [...history].sort((a, b) => a.returnPct - b.returnPct)[0];
  const median =
    history.length > 0 ? historyMedian(history.map((h) => h.returnPct)) : 0;
  const wins = history.filter((h) => h.returnPct > 0).length;

  return (
    <div className="flex flex-col mt-4 gap-4">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{heading}</p>
        <p className={cn("mt-1 text-lg font-semibold tabular-nums", retText(avgPct))}>
          {fmtPct(avgPct, digits)} average
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {Math.round(winRate)}% of years were up · {samples}{" "}
          {samples === 1 ? "year" : "years"}
        </p>
      </div>

      {history.length > 0 && best && worst ? (
        <Scoreboard cols={4}>
          <Score
            label="Best"
            value={fmtPct(best.returnPct)}
            sub={String(best.year)}
            tone={retTone(best.returnPct)}
          />
          <Score
            label="Worst"
            value={fmtPct(worst.returnPct)}
            sub={String(worst.year)}
            tone={retTone(worst.returnPct)}
          />
          <Score
            label="Median"
            value={fmtPct(median)}
            tone={retTone(median)}
          />
          <Score label="Up years" value={`${wins} of ${history.length}`} />
        </Scoreboard>
      ) : null}

      <CycleHistoryBars history={history} highlightYear={highlightYear} />
    </div>
  );
}

function dayCellBg(v: number, mag: number, empty: boolean): string {
  if (empty) return "bg-accent/40";
  if (v > 0.05) {
    if (mag > 0.66) return "bg-gain/40";
    if (mag > 0.33) return "bg-gain/25";
    return "bg-gain/15";
  }
  if (v < -0.05) {
    if (mag > 0.66) return "bg-loss/40";
    if (mag > 0.33) return "bg-loss/25";
    return "bg-loss/15";
  }
  return "bg-accent/50";
}

function DayOfMonthChart({
  rows,
  monthLabel,
  selectedDay,
  todayDay,
  onSelectDay,
}: {
  rows: CycleDayRow[];
  monthLabel: string;
  selectedDay: number;
  todayDay: number | null;
  onSelectDay: (day: number) => void;
}) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.avgReturnPct)), 0.05);
  const cells = Array.from({ length: 31 }, (_, i) => {
    const day = i + 1;
    return rows.find((r) => r.day === day) ?? null;
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-7 gap-1.5 md:grid-cols-11 md:gap-1">
        {cells.map((row, i) => {
          const day = i + 1;
          if (!row) {
            return (
              <div
                key={day}
                aria-hidden
                className="min-h-11 rounded-lg bg-accent/30 md:min-h-11"
              />
            );
          }
          const v = row.avgReturnPct;
          const mag = Number.isFinite(v) ? Math.min(1, Math.abs(v) / maxAbs) : 0;
          const empty = row.samples === 0 || !Number.isFinite(v);
          const isSelected = selectedDay === day;
          const isToday = todayDay === day;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              aria-pressed={isSelected}
              title={`Day ${day}: ${fmtPct(v, 3)} avg · ${row.winRate}% up · n=${row.samples}`}
              className={cn(
                "flex min-h-11 w-full flex-col items-center justify-center rounded-lg px-0.5 py-1.5 transition",
                dayCellBg(v, mag, empty),
                isSelected
                  ? "ring-2 ring-primary"
                  : isToday
                    ? "ring-1 ring-ring/50 hover:brightness-110"
                    : "hover:brightness-110"
              )}
            >
              <span
                className={cn(
                  "text-sm tabular-nums",
                  isSelected || isToday
                    ? "font-bold text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {row.day}
              </span>
              <span
                className={cn(
                  "mt-0.5 hidden font-semibold tabular-nums md:block",
                  empty ? "text-muted-foreground" : retText(v)
                )}
              >
                {empty ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}`}
              </span>
            </button>
          );
        })}
      </div>
      <p className="hidden text-sm text-muted-foreground md:block">
        Average session return on that calendar day in {monthLabel}. Pick a
        day for the years behind it.
      </p>
    </div>
  );
}

function ActionCards({ signals }: { signals: ActionSignal[] }) {
  if (signals.length === 0) return null;
  const s = signals[0]!;
  return (
    <div
      className={cn(
        SPLIT_ROW,
        NESTED_PAD,
        "rounded-xl border",
        stanceStyles(s.stance)
      )}
    >
      <div className={SPLIT_COPY}>
        <p className="text-sm font-medium text-muted-foreground">
          {stanceLabel(s.stance)} - this month
        </p>
        <p className="mt-1.5 text-base font-semibold text-foreground">{s.headline}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.detail}</p>
      </div>
      {typeof s.figurePct === "number" ? (
        <div className={cn(SPLIT_ACTIONS, "sm:justify-end")}>
          <div className="sm:text-right">
          <p
            className={cn(
              "text-lg font-semibold tabular-nums",
              retText(s.figurePct)
            )}
          >
            {fmtPct(s.figurePct, 2)}
          </p>
          <p className="text-sm text-muted-foreground">
            {s.winRate}% of years up · {s.samples}{" "}
            {s.samples === 1 ? "year" : "years"}
          </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function todayInMarketTz(): { month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  return {
    month: Number(parts.find((p) => p.type === "month")?.value ?? 1),
    day: Number(parts.find((p) => p.type === "day")?.value ?? 1),
  };
}

/**
 * Seasonality — presidential-cycle-aware historical timing patterns.
 * Deliberately doesn't repeat anything from Overview (current state) or Lab
 * (scenario tools). This page's one job is the historical calendar shape.
 * It does not tell you to add or trim.
 */
export function SeasonalityPage({ bookTickers = [] }: Props) {
  const tickers = useMemo(() => {
    const merged = [...DEFAULT_TICKERS];
    for (const t of bookTickers) {
      const u = t.toUpperCase();
      if (!merged.includes(u)) merged.push(u);
    }
    return merged;
  }, [bookTickers]);

  const marketToday = useMemo(() => todayInMarketTz(), []);

  const [ticker, setTicker] = useState("SPY");
  const [model, setModel] = useHydratedCache<SeasonalityModel | null>(
    () => loadSeasonalityPaint("SPY"),
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Monthly history panel — independent from day drill-down. */
  const [playbookMonth, setPlaybookMonth] = useState(marketToday.month);
  /** Day drill-down defaults to today and stays put unless you navigate. */
  const [viewMonth, setViewMonth] = useState(marketToday.month);
  const [selectedDay, setSelectedDay] = useState(marketToday.day);
  const loadCtrlRef = useRef<AbortController | null>(null);

  const load = useCallback(async (sym: string, force = false) => {
    loadCtrlRef.current?.abort();
    const ctrl = new AbortController();
    loadCtrlRef.current = ctrl;
    const cached = loadSeasonalityPaint(sym);
    if (cached && !force) {
      setModel(cached);
      setLoading(false);
    } else if (!cached) {
      setLoading(true);
    }
    setError(null);
    try {
      const qs = new URLSearchParams({ ticker: sym });
      if (force) qs.set("force", "1");
      const res = await fetch(`/api/market/seasonality?${qs}`, {
        cache: force ? "no-store" : "default",
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(plainError(body.error, "Couldn't load those charts."));
      }
      const next = (await res.json()) as SeasonalityModel;
      if (ctrl.signal.aborted) return;
      setModel(next);
      saveSeasonalityPaint(next);
    } catch (e) {
      if (isAbortError(e) || ctrl.signal.aborted) return;
      if (loadSeasonalityPaint(sym)) return;
      setModel(null);
      setError(e instanceof Error ? e.message : "Couldn't load those charts.");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [setModel]);

  useEffect(() => {
    if (!tickers.includes(ticker)) {
      setTicker(tickers[0] ?? "SPY");
    }
  }, [tickers, ticker]);

  useLayoutEffect(() => {
    const cached = loadSeasonalityPaint(ticker);
    if (cached) setModel(cached);
  }, [ticker, setModel]);

  useEffect(() => {
    void load(ticker);
    return () => loadCtrlRef.current?.abort();
  }, [ticker, load]);

  const playbookMonthRow = model?.cycleMonthly[playbookMonth - 1];
  const dayRows = model?.cycleDaysByMonth[String(viewMonth)] ?? [];
  const viewMonthName = MONTH_NAMES[viewMonth - 1] ?? "Month";
  const selectedDayRow = dayRows.find((r) => r.day === selectedDay);
  const selectedDayLabel = `${viewMonthName} ${selectedDay}`;

  function goToMonth(next: number) {
    const month = next < 1 ? 12 : next > 12 ? 1 : next;
    const lastDay = new Date(2024, month, 0).getDate();
    setViewMonth(month);
    setSelectedDay((d) => Math.min(d, lastDay));
  }

  function shiftViewMonth(delta: number) {
    goToMonth(viewMonth + delta);
  }

  function goToToday() {
    setViewMonth(marketToday.month);
    setSelectedDay(marketToday.day);
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <div className={SPLIT_ROW}>
          <div className={SPLIT_COPY}>
            {model ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {model.asOfYear} · {model.currentCycleLabel} year ·{" "}
                {cashtag(model.ticker)} since {model.from.slice(0, 4)}. Months
                and days that have historically been kind, and those that
                have not. Only prior {model.currentCycleLabel.toLowerCase()}{" "}
                years. Nothing about your own holdings.
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Which months and days have historically been kind to the
                market, and which have not. Patterns from the past, nothing
                about your own holdings and no claim about what happens next.
              </p>
            )}
          </div>
          <div className={SPLIT_ACTIONS}>
            <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground sm:flex-none">
              <span className="shrink-0">Benchmark</span>
              <NativeSelect
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                className="min-w-0 flex-1 sm:flex-none"
              >
                {tickers.map((t) => (
                  <NativeSelectOption key={t} value={t}>
                    {t}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => void load(ticker, true)}
              disabled={loading}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>
      </Panel>

      {error && (
        <div className="rounded-xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
          {error}
        </div>
      )}

      {loading && !model ? (
        <div className="card-sheen glass-well rounded-lg px-4 py-12 text-center text-sm text-muted-foreground">
          Loading seasonality for {cashtag(ticker)}…
        </div>
      ) : null}

      {model && (
        <>
          <ActionCards signals={model.signals} />

          <Panel>
            <PanelHeader title="What this month usually does" />
            <div className="mt-4">
              <CycleMonthlyTiles
                rows={model.cycleMonthly}
                selectedMonth={playbookMonth}
                currentMonth={model.asOfMonth}
                onSelectMonth={setPlaybookMonth}
              />
              <CycleMonthlyChart
                rows={model.cycleMonthly}
                selectedMonth={playbookMonth}
                currentMonth={model.asOfMonth}
                onSelectMonth={setPlaybookMonth}
              />
              {playbookMonthRow ? (
                <SelectedHistory
                  heading={`${MONTH_NAMES[playbookMonth - 1]} in years like this`}
                  avgPct={playbookMonthRow.avgMonthReturnPct}
                  winRate={playbookMonthRow.winRate}
                  samples={playbookMonthRow.samples}
                  history={playbookMonthRow.history}
                  highlightYear={model.asOfYear}
                />
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  No prior sessions for this month.
                </p>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Daily rhythm within the month" />
            <div className="mt-4">
              <div className="mb-4 flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => shiftViewMonth(-1)}
                >
                  <ChevronLeft data-icon="inline-start" />
                  <span className="hidden sm:inline">Prev</span>
                </Button>
                <div className="min-h-10 text-center">
                  <p className="text-sm font-semibold text-foreground">
                    {viewMonthName} {selectedDay}
                  </p>
                  {viewMonth === marketToday.month &&
                  selectedDay === marketToday.day ? (
                    <p className="text-sm text-muted-foreground">Today</p>
                  ) : (
                    <button
                      type="button"
                      onClick={goToToday}
                      className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      Jump to today
                    </button>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => shiftViewMonth(1)}
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight data-icon="inline-end" />
                </Button>
              </div>
              <div className="mb-4 grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-12">
                {MONTH_SHORT.map((label, idx) => {
                  const m = idx + 1;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => goToMonth(m)}
                      className={cn(
                        "touch-target rounded-lg px-1 text-center text-sm font-medium transition md:min-h-0 md:py-1.5",
                        viewMonth === m
                          ? "bg-primary text-primary-foreground"
                          : m === marketToday.month
                            ? "text-foreground ring-1 ring-ring/40 hover:bg-hover"
                            : "text-muted-foreground hover:bg-hover hover:text-foreground"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <DayOfMonthChart
                rows={dayRows}
                monthLabel={viewMonthName}
                selectedDay={selectedDay}
                todayDay={
                  viewMonth === marketToday.month ? marketToday.day : null
                }
                onSelectDay={setSelectedDay}
              />
              {selectedDayRow ? (
                <SelectedHistory
                  heading={`${selectedDayLabel}, prior sessions`}
                  avgPct={selectedDayRow.avgReturnPct}
                  winRate={selectedDayRow.winRate}
                  samples={selectedDayRow.samples}
                  digits={2}
                  history={selectedDayRow.history}
                  highlightYear={model.asOfYear}
                />
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  No prior sessions for this day.
                </p>
              )}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
