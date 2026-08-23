"use client";

import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { NO_VALUE, cashtag, cn, currency, percent, signedPercent } from "@/lib/format";
import {
  Metric,
  MicroLabel,
  Pill,
  Score,
  Scoreboard,
  Segmented,
  SPLIT_COPY,
  SPLIT_ROW,
} from "@/components/ui/Panel";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ConvictionEntry, ConvictionLevel } from "@/lib/conviction";
import { estimateGreenStreak } from "@/lib/streaks";
import { forecastThemeForTicker } from "@/lib/forecast-conviction";
import { THEME_LABEL } from "@/lib/portfolio-personality";
import { getShockProfile } from "@/lib/book-shock";
import {
  FORECAST_YEARS,
  resolveTickerForecastPath,
  type ForecastYear,
} from "@/lib/forecast";
import type { PortfolioEoyOverrides } from "@/lib/forecast-overrides";
import type { CoveredCallRow } from "@/lib/types";
import { isSafePositiveMoney } from "@/lib/input-guard";
import { Bot, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const CONVICTION_LABELS: Record<ConvictionLevel, string> = {
  1: "Weak, watching the reason",
  2: "Below average, the size may be big",
  3: "Neutral, holding as-is",
  4: "Strong, still believe the reason",
  5: "Max, you're sure why you own it",
};

const HORIZONS = [
  { id: "3y" as const, label: "3 years", title: "End of 2028" },
  { id: "5y" as const, label: "5 years", title: "End of 2030" },
];

type Props = {
  open: boolean;
  ticker: string | null;
  spot: number | null;
  shares: number | null;
  buyPrice: number | null;
  sparkline?: number[];
  todayChangePct?: number | null;
  conviction?: ConvictionEntry | null;
  overrides?: PortfolioEoyOverrides;
  coveredCallRow?: CoveredCallRow | null;
  onSetEoyPrice?: (ticker: string, year: ForecastYear, price: number) => void;
  onConviction: (level: ConvictionLevel, thesis: string) => void;
  onClose: () => void;
  onAskMargus?: () => void;
};

export function TickerDrawer({
  open,
  ticker,
  spot,
  shares,
  buyPrice,
  sparkline,
  todayChangePct,
  conviction,
  overrides,
  coveredCallRow,
  onSetEoyPrice,
  onConviction,
  onClose,
  onAskMargus,
}: Props) {
  const [horizon, setHorizon] = useState<"3y" | "5y">("3y");
  const [editingYear, setEditingYear] = useState<ForecastYear | null>(null);
  const [yearDraftPrice, setYearDraftPrice] = useState<string>("");
  const [thesisDraft, setThesisDraft] = useState(conviction?.thesis ?? "");

  // Reset when the drawer target changes, not on every remote save, or
  // the textarea fights you mid-sentence.
  useEffect(() => {
    setThesisDraft(conviction?.thesis ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ticker/open only
  }, [ticker, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const liveSpot = spot ?? buyPrice ?? 50;

  // Resolves the exact forecast path matching the Forecast table
  const forecastSummary = useMemo(() => {
    if (!ticker) return null;
    return resolveTickerForecastPath(ticker, liveSpot, overrides);
  }, [ticker, liveSpot, overrides]);

  if (!open || !ticker || !forecastSummary) return null;

  const streak = estimateGreenStreak(sparkline);
  const roi =
    spot != null && buyPrice != null && buyPrice > 0
      ? (() => {
          const v = (spot - buyPrice) / buyPrice;
          return Number.isFinite(v) ? v : null;
        })()
      : null;
  const level = conviction?.level ?? 3;
  const theme = forecastThemeForTicker(ticker);
  const shockProfile = getShockProfile(ticker);

  const targetPrice =
    horizon === "3y"
      ? forecastSummary.threeYearPrice
      : forecastSummary.fiveYearPrice;
  const targetGainPct =
    horizon === "3y"
      ? forecastSummary.threeYearGainPct
      : forecastSummary.fiveYearGainPct;
  const targetCagrPct =
    horizon === "3y"
      ? forecastSummary.threeYearCagrPct
      : forecastSummary.fiveYearCagrPct;
  const targetYear: ForecastYear = horizon === "3y" ? 2028 : 2030;

  function handleYearEditCommit(year: ForecastYear) {
    const parsed = Number.parseFloat(yearDraftPrice.replace(/,/g, "."));
    if (isSafePositiveMoney(parsed) && onSetEoyPrice) {
      onSetEoyPrice(ticker!, year, Math.round(parsed * 100) / 100);
    }
    setEditingYear(null);
  }

  return (
    <ViewportOverlay className="z-[80] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full max-w-none flex-col border-l border-border/80 bg-background sm:max-w-md">
        <div className="flex items-start justify-between gap-2 border-b border-border px-6 py-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">
                {cashtag(ticker)}
              </h2>
              <Pill tone="neutral">{THEME_LABEL[theme] ?? "other businesses"}</Pill>
            </div>
            <p className="mt-1 text-sm tabular-nums text-muted-foreground">
              {spot != null ? currency(spot) : NO_VALUE}
              {todayChangePct != null && (
                <span
                  className={cn(
                    "ml-1 font-medium tabular-nums",
                    todayChangePct >= 0 ? "text-gain" : "text-loss"
                  )}
                >
                  ({signedPercent(todayChangePct)})
                </span>
              )}
              {shares != null ? ` · ${shares.toLocaleString("en-US")} shares` : ""}
              {roi != null ? ` · ${percent(roi)} vs cost` : ""}
            </p>
          </div>
          <Button
            type="button"
            onClick={onClose}
            variant="ghost"
            size="icon"
            aria-label="Close"
            className="touch-target shrink-0"
          >
            <X />
          </Button>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <Field>
            <FieldLabel htmlFor="ticker-thesis">Thesis</FieldLabel>
            <Textarea
              id="ticker-thesis"
              value={thesisDraft}
              rows={2}
              onChange={(e) => setThesisDraft(e.target.value)}
              onBlur={() => onConviction(level, thesisDraft)}
              placeholder="Two sentences. What has to stay true for you to keep holding?"
              className="min-h-16 leading-relaxed"
            />
            <FieldDescription>
              Pulse reads this first. Leave it blank and it still works from headlines and today&apos;s prices.
            </FieldDescription>
            {conviction?.stamps && conviction.stamps.length > 0 ? (
              <ul className="flex flex-col gap-1.5 border-t border-border pt-3">
                {conviction.stamps.slice(0, 3).map((s) => (
                  <li key={s.at} className="text-sm text-muted-foreground">
                    <span className="text-foreground">{s.verdict}</span>
                    {" · "}
                    {s.line}
                    <span className="ml-1">
                      {new Date(s.at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Field>

          <section className="flex flex-col gap-4">
            <div className={SPLIT_ROW}>
              <div className={SPLIT_COPY}>
                <h3 className="text-base text-foreground">
                  Price path
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  A modeled scenario, not a target. Same numbers as Forecast.
                </p>
              </div>
              <Segmented
                options={HORIZONS}
                value={horizon}
                onChange={setHorizon}
                ariaLabel="Forecast horizon"
              />
            </div>

            <Scoreboard cols={1}>
              <Score
                label={`If it plays out by ${targetYear}`}
                value={currency(targetPrice, 2)}
                sub={
                  <>
                    Works out to about{" "}
                    <span className="font-medium tabular-nums text-gain">
                      {Number.isFinite(targetCagrPct)
                        ? `${targetCagrPct >= 0 ? "+" : ""}${targetCagrPct.toFixed(1)}%`
                        : NO_VALUE}
                    </span>{" "}
                    a year.{" "}
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        targetGainPct >= 0 ? "text-gain" : "text-loss"
                      )}
                    >
                      {targetGainPct >= 0 ? "+" : ""}
                      {percent(targetGainPct)}
                    </span>{" "}
                    from today&apos;s price.
                  </>
                }
              />
            </Scoreboard>

            <div>
              <MicroLabel className="mb-2">
                Year by year. Tap to change.
              </MicroLabel>
              {/*
                * Tighter cells on a phone, not fewer of them. At the desktop
                * gap and padding a cell has 38px of content on a 360px screen
                * and a four-figure price needs 44, so `$1,058` rendered as
                * `$1,05`. The gap, the cell padding and the price each drop a
                * step below `sm`, which keeps all five years rather than
                * trading two of them for a swipe.
                */}
              <div className="grid grid-cols-5 gap-1 sm:gap-2">
                {FORECAST_YEARS.map((yr) => {
                  const p = forecastSummary.eoyPrices[yr];
                  const g = forecastSummary.eoyGains[yr];
                  const isCurrentHorizon = yr === targetYear;

                  if (editingYear === yr) {
                    return (
                      <div
                        key={yr}
                        className="flex flex-col items-stretch gap-0.5 rounded-lg border border-input bg-background px-1 py-2 sm:px-2"
                      >
                        <p className="text-xs font-medium text-muted-foreground">
                          &apos;{String(yr).slice(2)}
                        </p>
                        <Input
                          type="text"
                          inputMode="decimal"
                          autoFocus
                          value={yearDraftPrice}
                          onChange={(e) => setYearDraftPrice(e.target.value)}
                          onBlur={() => handleYearEditCommit(yr)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleYearEditCommit(yr);
                            if (e.key === "Escape") setEditingYear(null);
                          }}
                          aria-label={`Price at end of ${yr}`}
                          className="h-7 px-1 text-center text-sm font-semibold tabular-nums"
                        />
                      </div>
                    );
                  }

                  return (
                    <Button
                      key={yr}
                      type="button"
                      variant={isCurrentHorizon ? "secondary" : "outline"}
                      onClick={() => {
                        setEditingYear(yr);
                        setYearDraftPrice(p.toFixed(2));
                      }}
                      title={`Change the end-of-${yr} price`}
                      className="h-auto flex-col items-stretch gap-0.5 px-1 py-2 sm:px-2"
                    >
                      <span className="text-xs font-medium text-muted-foreground">
                        &apos;{String(yr).slice(2)}
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-foreground sm:text-sm">
                        ${Math.round(p)}
                      </span>
                      <span
                        className={cn(
                          "text-xs tabular-nums",
                          g >= 0 ? "text-gain" : "text-loss"
                        )}
                      >
                        {g >= 0 ? "+" : ""}
                        {(g * 100).toFixed(0)}%
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>
          </section>

          <div className="grid grid-cols-2 gap-4">
            <Metric label="Recent run">{streak.label}</Metric>
            <Metric label="Moves with">{shockProfile.label}</Metric>
          </div>

          {coveredCallRow && coveredCallRow.nextStrike != null ? (
            <FieldGroup>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Your call plan
                </p>
                {coveredCallRow.yield2w != null ? (
                  <span className="text-sm font-medium tabular-nums text-foreground">
                    {percent(coveredCallRow.yield2w)} for two weeks
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Metric label="Strike">
                  {currency(coveredCallRow.nextStrike)}
                </Metric>
                <Metric label="Room above">
                  {coveredCallRow.targetDistance != null
                    ? percent(coveredCallRow.targetDistance)
                    : NO_VALUE}
                </Metric>
                <Metric label="Contracts">{coveredCallRow.contracts}</Metric>
              </div>
            </FieldGroup>
          ) : null}

          <Field>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <FieldLabel>How sure are you?</FieldLabel>
              <span className="text-sm font-medium text-muted-foreground">
                {level} of 5
              </span>
            </div>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              value={String(level)}
              onValueChange={(v) => {
                if (!v) return;
                onConviction(Number(v) as ConvictionLevel, thesisDraft);
              }}
              className="w-full"
              aria-label="How sure are you"
            >
              {([1, 2, 3, 4, 5] as ConvictionLevel[]).map((n) => (
                <ToggleGroupItem
                  key={n}
                  value={String(n)}
                  title={CONVICTION_LABELS[n]}
                  className="h-10 flex-1"
                >
                  {n}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription>{CONVICTION_LABELS[level]}</FieldDescription>
          </Field>

          {onAskMargus ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                onClose();
                onAskMargus();
              }}
            >
              <Bot data-icon="inline-start" />
              Ask Margus about {cashtag(ticker)}
            </Button>
          ) : null}
        </div>
      </div>
    </ViewportOverlay>
  );
}
