"use client";

import { YtdAnchorModal } from "@/components/YtdAnchorModal";
import { Button } from "@/components/ui/button";
import { ChartXRail, ChartYAxis } from "@/components/ui/ChartAxis";
import { currency, percent, signedCurrency, signedTone } from "@/lib/format";
import { PALETTE } from "@/lib/palette";
import { safeDiv } from "@/lib/money";
import { paintBookNavSeries, usableNavPoints } from "@/lib/market/assumed-nav";
import {
  clearYtdAnchor,
  readYtdAnchor,
  writeYtdAnchor,
  type YtdAnchor,
} from "@/lib/market/ytd-anchor";
import { useHydratedCache } from "@/lib/use-hydrated-cache";
import { isAbortError } from "@/lib/abort";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export type NavPoint = { date: string; nav: number };

export type AssumedPosition = { ticker: string; shares: number };

const ASSUMED_PREF_KEY = "portfell-nav-assumed-ytd";
const NAV_CACHE_KEY = "portfell-nav-history-v1";

type NavCacheV1 = {
  v: 1;
  posKey: string;
  assumed: boolean;
  cash: number;
  points: NavPoint[];
  serverAssumed: boolean;
  firstRealDate: string | null;
};

type NavCacheV2 = {
  v: 2;
  entries: NavCacheV1[];
};

const MAX_NAV_CACHE = 8;

function fingerprintPositions(positions: AssumedPosition[]): string {
  return positions
    .map((p) => `${p.ticker.toUpperCase()}:${p.shares}`)
    .sort()
    .join("|");
}

function readNavCacheList(): NavCacheV1[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(NAV_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as NavCacheV1 | NavCacheV2;
    if (parsed?.v === 2 && Array.isArray(parsed.entries)) {
      return parsed.entries.filter(
        (e) => e?.v === 1 && Array.isArray(e.points) && e.points.length >= 1
      );
    }
    if (parsed?.v === 1 && Array.isArray(parsed.points) && parsed.points.length >= 1) {
      return [parsed];
    }
    return [];
  } catch {
    return [];
  }
}

function writeNavCache(entry: NavCacheV1) {
  try {
    const key = memoryKey(entry.posKey, entry.assumed, entry.cash);
    const rest = readNavCacheList().filter(
      (e) => memoryKey(e.posKey, e.assumed, e.cash) !== key
    );
    const payload: NavCacheV2 = {
      v: 2,
      entries: [entry, ...rest].slice(0, MAX_NAV_CACHE),
    };
    window.localStorage.setItem(NAV_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

const navMemory = new Map<string, NavCacheV1>();

function memoryKey(posKey: string, assumed: boolean, cash: number): string {
  return `${assumed ? "1" : "0"}:${Math.round(cash)}:${posKey}`;
}

function rememberNav(entry: NavCacheV1) {
  navMemory.set(memoryKey(entry.posKey, entry.assumed, entry.cash), entry);
  writeNavCache(entry);
}

function lookupNav(
  posKey: string,
  assumed: boolean,
  cash: number
): NavCacheV1 | null {
  const mem = navMemory.get(memoryKey(posKey, assumed, cash));
  if (mem && cacheMatches(mem, posKey, assumed, cash)) return mem;
  for (const disk of readNavCacheList()) {
    if (cacheMatches(disk, posKey, assumed, cash)) {
      navMemory.set(memoryKey(posKey, assumed, cash), disk);
      return disk;
    }
  }
  return null;
}

function cacheMatches(
  c: NavCacheV1,
  posKey: string,
  assumed: boolean,
  cash: number
): boolean {
  return (
    c.posKey === posKey &&
    c.assumed === assumed &&
    Math.abs(c.cash - cash) < 0.5 &&
    c.points.length >= 1
  );
}

function loadAssumedPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(ASSUMED_PREF_KEY) !== "0";
  } catch {
    return true;
  }
}

function saveAssumedPref(on: boolean) {
  try {
    localStorage.setItem(ASSUMED_PREF_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function useBookNavHistory(input: {
  liveNav: number;
  cash: number;
  positions: AssumedPosition[];
}): {
  points: NavPoint[];
  assumed: boolean;
  anchored: boolean;
  anchor: YtdAnchor | null;
  firstRealDate: string | null;
  loading: boolean;
  discardAssumed: () => void;
  restoreAssumed: () => void;
  applyAnchor: (next: YtdAnchor) => void;
  clearAnchor: () => void;
} {
  const posKey = fingerprintPositions(input.positions);
  const [assumed, setAssumed] = useHydratedCache(loadAssumedPref, true);
  const paintKey = memoryKey(posKey, assumed, input.cash);
  const [hist, setHist] = useState<NavPoint[]>([]);
  const [histKey, setHistKey] = useState<string | null>(null);
  const histKeyRef = useRef<string | null>(null);
  histKeyRef.current = histKey;
  const [serverAssumed, setServerAssumed] = useState(false);
  const [firstRealDate, setFirstRealDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [anchor, setAnchor] = useState<YtdAnchor | null>(null);

  function applyCached(nextPosKey: string, nextAssumed: boolean, cash: number) {
    const nextPaintKey = memoryKey(nextPosKey, nextAssumed, cash);
    const cached = lookupNav(nextPosKey, nextAssumed, cash);
    if (cached) {
      setHist(cached.points);
      setHistKey(nextPaintKey);
      setServerAssumed(cached.serverAssumed);
      setFirstRealDate(cached.firstRealDate);
      setLoading(false);
      return true;
    }
    if (histKeyRef.current === nextPaintKey) return false;
    setHistKey(null);
    setLoading(true);
    return false;
  }

  useLayoutEffect(() => {
    setAnchor(readYtdAnchor());
  }, []);

  useLayoutEffect(() => {
    applyCached(posKey, assumed, input.cash);
  }, [assumed, posKey, input.cash]);

  useEffect(() => {
    const ctrl = new AbortController();
    const havePaint = lookupNav(posKey, assumed, input.cash) != null;
    if (!havePaint) setLoading(true);
    const body = assumed
      ? {
          assumed: true,
          cash: input.cash,
          positions: input.positions,
        }
      : { assumed: false };
    void fetch("/api/book/nav-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            points?: NavPoint[];
            assumed?: boolean;
            firstRealDate?: string | null;
          } | null
        ) => {
          if (ctrl.signal.aborted) return;
          const raw = data?.points;
          const next = Array.isArray(raw) ? usableNavPoints(raw) : [];
          const nextAssumed = Boolean(data?.assumed);
          const nextFirst = data?.firstRealDate ?? null;
          // Always pin histKey so loading can't sit on "Working out…" after
          // "Start from 15 Aug" when recorded nights are one point, empty,
          // or the request failed. An empty series is a finished empty chart.
          setHist(next);
          setHistKey(paintKey);
          setServerAssumed(nextAssumed);
          setFirstRealDate(nextFirst);
          setLoading(false);
          if (next.length >= 1) {
            rememberNav({
              v: 1,
              posKey,
              assumed,
              cash: input.cash,
              points: next,
              serverAssumed: nextAssumed,
              firstRealDate: nextFirst,
            });
          }
        }
      )
      .catch((err) => {
        if (isAbortError(err) || ctrl.signal.aborted) return;
        setHist([]);
        setHistKey(paintKey);
        setServerAssumed(false);
        setLoading(false);
      });
    return () => {
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- posKey fingerprints holdings
  }, [assumed, posKey, input.cash]);

  const histReady = histKey === paintKey;
  const points = useMemo(
    () =>
      paintBookNavSeries({
        hist,
        histBelongsToBook: histReady,
        liveNav: input.liveNav,
        assumed,
        startNav: anchor?.startNav ?? null,
      }),
    [hist, histReady, input.liveNav, assumed, anchor]
  );

  return {
    points,
    assumed: assumed && serverAssumed,
    anchored: Boolean(assumed && anchor),
    anchor,
    firstRealDate,
    loading: !histReady || loading,
    discardAssumed: () => {
      saveAssumedPref(false);
      setAssumed(false);
      setServerAssumed(false);
      setLoading(true);
    },
    restoreAssumed: () => {
      saveAssumedPref(true);
      setAssumed(true);
    },
    applyAnchor: (next) => {
      writeYtdAnchor(next);
      setAnchor(next);
      saveAssumedPref(true);
      setAssumed(true);
    },
    clearAnchor: () => {
      clearYtdAnchor();
      setAnchor(null);
    },
  };
}

export function compactAxis(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    const whole = Math.abs(m - Math.round(m)) < 0.05;
    return `${sign}${whole ? String(Math.round(m)) : m.toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    const whole = Math.abs(k - Math.round(k)) < 0.05;
    return `${sign}${whole ? String(Math.round(k)) : k.toFixed(1)}K`;
  }
  return `${sign}${Math.round(abs)}`;
}

export function niceScale(
  lo: number,
  hi: number,
  target = 5
): { min: number; max: number; ticks: number[] } {
  if (!(hi > lo)) {
    const pad = Math.max(Math.abs(hi) * 0.04, 1);
    lo -= pad;
    hi += pad;
  }
  const span = hi - lo;
  const raw = span / Math.max(target - 1, 1);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const err = raw / pow;
  let step =
    err >= 7.5 ? 10 * pow : err >= 3 ? 5 * pow : err >= 1.5 ? 2 * pow : pow;
  let min = Math.floor(lo / step) * step;
  let max = Math.ceil(hi / step) * step;
  let n = Math.round((max - min) / step);
  let guard = 0;
  while (n > target && guard++ < 8) {
    step *= 2;
    min = Math.floor(lo / step) * step;
    max = Math.ceil(hi / step) * step;
    n = Math.round((max - min) / step);
  }
  const ticks: number[] = [];
  for (let i = 0; i <= n; i++) ticks.push(min + i * step);
  return { min, max, ticks };
}

function parsePointDate(raw: string): Date | null {
  if (raw === "Live") return new Date();
  const d = new Date(`${raw}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDay(raw: string): string {
  const d = parsePointDate(raw);
  if (!d) return raw === "Live" ? "Now" : raw;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function monthTicks(
  points: { date: string }[]
): { i: number; label: string }[] {
  const out: { i: number; label: string }[] = [];
  let lastMonth = -1;
  points.forEach((p, i) => {
    if (p.date === "Live") return;
    const d = parsePointDate(p.date);
    if (!d) return;
    const m = d.getMonth();
    if (m === lastMonth) return;
    lastMonth = m;
    out.push({
      i,
      label: d.toLocaleDateString("en-GB", { month: "short" }),
    });
  });
  const lastI = points.length - 1;
  if (out.length === 0 || out[out.length - 1]!.i !== lastI) {
    out.push({ i: lastI, label: "Now" });
  } else {
    out[out.length - 1] = { i: lastI, label: "Now" };
  }
  return out;
}

/**
 * Book NAV as a brand-colored line, same language as Forecast's path chart.
 * Axis copy lives in HTML so it stays text-xs instead of scaling with the SVG.
 */
export function MobileBookNavChart({
  points,
  assumedAll = false,
  assumedUntil = null,
  className,
}: {
  points: NavPoint[];
  /** Nothing was recorded, so the whole path is worked out. */
  assumedAll?: boolean;
  /**
   * The first day Upside Lab actually recorded, when the stretch before it
   * is worked out rather than remembered. Everything up to it draws dashed
   * and half lit, so a reader cannot mistake an estimate for their history.
   */
  assumedUntil?: string | null;
  className?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const width = 640;
  const height = 224;
  const padL = 8;
  const padR = 12;
  const padT = 16;
  const padB = 14;
  const usable = useMemo(() => usableNavPoints(points), [points]);

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
    const vals = usable.map((p) => p.nav);
    const dataMin = Math.min(...vals);
    const dataMax = Math.max(...vals);
    const scale = niceScale(dataMin, dataMax, 4);
    const span = scale.max - scale.min || 1;
    // Empty plot above the peak so the line never kisses the top tick
    // or the day chip in the reserved lane above the SVG.
    const plotMax = scale.max + span * 0.18;
    const axisSpan = plotMax - scale.min;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    const lastIdx = usable.length - 1;
    const xAt = (i: number) =>
      padL + (lastIdx === 0 ? innerW / 2 : (i / lastIdx) * innerW);
    const yAt = (v: number) => padT + (1 - (v - scale.min) / axisSpan) * innerH;
    const line = usable
      .map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.nav).toFixed(1)}`)
      .join(" ");
    const area = `${xAt(0).toFixed(1)},${(padT + innerH).toFixed(1)} ${line} ${xAt(lastIdx).toFixed(1)},${(padT + innerH).toFixed(1)}`;
    /*
     * Two polylines, not one, when part of the year is worked out.
     *
     * The split index is the first recorded day, and it belongs to BOTH
     * halves so the estimate and the record meet rather than leaving a gap
     * of one day between them.
     */
    const splitAt =
      assumedUntil == null
        ? -1
        : usable.findIndex((p) => p.date >= assumedUntil);
    const hasSplit = splitAt > 0 && splitAt < lastIdx;
    const pointsFor = (from: number, to: number) =>
      usable
        .slice(from, to + 1)
        .map((p, k) => `${xAt(from + k).toFixed(1)},${yAt(p.nav).toFixed(1)}`)
        .join(" ");
    // Nothing recorded at all is the whole path dashed, with no second half
    // to compare it against and no legend to draw.
    const estimated = assumedAll
      ? line
      : hasSplit
        ? pointsFor(0, splitAt)
        : null;
    const recordedLine =
      assumedAll || !hasSplit ? null : pointsFor(splitAt, lastIdx);
    return {
      ...scale,
      innerW,
      innerH,
      lastIdx,
      xAt,
      yAt,
      line,
      area,
      estimated,
      recordedLine,
    };
  }, [usable, assumedAll, assumedUntil]);

  if (!geometry) {
    return (
      <p
        className={
          className
            ? `py-12 text-center text-sm text-muted-foreground ${className}`
            : "py-12 text-center text-sm text-muted-foreground"
        }
      >
        History builds up night by night.
      </p>
    );
  }

  const {
    ticks,
    innerW,
    innerH,
    lastIdx,
    xAt,
    yAt,
    line,
    area,
    estimated,
    recordedLine,
  } = geometry;
  const startNav = usable[0]!.nav;
  const xLabels = monthTicks(usable);
  const hover =
    active != null && active >= 0 && active <= lastIdx ? active : null;
  const hoverPoint = hover != null ? usable[hover] : null;
  const ytdRoi =
    hoverPoint && startNav > 0
      ? safeDiv(hoverPoint.nav - startNav, startNav)
      : null;
  const ytdDollar =
    hoverPoint && startNav > 0 ? hoverPoint.nav - startNav : null;

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

  const xMarks = xLabels
    .map((tick) => ({
      ...tick,
      left: ((xAt(tick.i) - padL) / innerW) * 100,
    }))
    .reduce<{ i: number; label: string; left: number }[]>((kept, tick) => {
      const prev = kept[kept.length - 1];
      if (prev && tick.left - prev.left < 16) {
        if (tick.label === "Now") {
          kept.pop();
          kept.push(tick);
        }
        return kept;
      }
      kept.push(tick);
      return kept;
    }, []);

  return (
    <div className={className}>
      <div>
        <div className="flex min-h-9 items-end justify-center px-10 pb-1">
          {hoverPoint ? (
            <p className="pointer-events-none max-w-full truncate rounded-lg border border-border bg-muted/95 px-2.5 py-1 text-sm tabular-nums shadow-sm">
              <span className="text-muted-foreground">{formatDay(hoverPoint.date)}</span>
              <span className="mx-1.5 font-semibold text-foreground">
                {currency(hoverPoint.nav, 0)}
              </span>
              {ytdRoi != null && ytdDollar != null ? (
                <span className={signedTone(ytdRoi)}>
                  {ytdRoi > 0 ? "+" : ""}
                  {percent(ytdRoi)}
                  <span className="text-muted-foreground">
                    {" "}
                    · {signedCurrency(ytdDollar, 0)}
                  </span>
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        {/*
          * The value labels sit in a gutter, not on the plot.
          *
          * Drawn as an overlay they were painted inside the plot area at
          * the left edge, and on a phone "20K" sat directly on top of the
          * gold path. A halo behind the glyphs kept them readable and did
          * nothing about a number with a line through it. 36px is enough
          * for the widest label this axis prints.
          */}
        <div className="relative flex">
          <ChartYAxis
            ticks={ticks}
            yAt={yAt}
            height={height}
            format={compactAxis}
            className="w-9 pr-1.5"
          />
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="h-64 w-full min-w-0 cursor-crosshair touch-none select-none outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50 sm:h-80"
            role="slider"
            tabIndex={0}
            aria-label="Portfolio value over the year. Drag across to read a day."
            aria-valuemin={0}
            aria-valuemax={lastIdx}
            aria-valuenow={hover ?? lastIdx}
            aria-valuetext={
              hoverPoint
                ? `${formatDay(hoverPoint.date)}, ${currency(hoverPoint.nav, 0)}${
                    ytdRoi != null
                      ? `, YTD ${percent(ytdRoi)}`
                      : ""
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
            {estimated ? (
              <>
                <polyline
                  fill="none"
                  stroke={PALETTE.brand}
                  strokeOpacity={0.5}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={estimated}
                />
                {recordedLine ? (
                  <polyline
                    fill="none"
                    stroke={PALETTE.brand}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={recordedLine}
                  />
                ) : null}
              </>
            ) : (
              <polyline
                fill="none"
                stroke={PALETTE.brand}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={line}
              />
            )}
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
                  cy={yAt(hoverPoint.nav)}
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
      {/* Same 36px gutter as the value axis, so the months line up. */}
      <ChartXRail className="mt-3" railClassName="w-9">
          {xMarks.map((tick, i) => {
            const isFirst = i === 0;
            const isLast = i === xMarks.length - 1;
            return (
              <span
                key={`${tick.i}-${tick.label}`}
                className="absolute top-0"
                style={{
                  left: `${tick.left}%`,
                  transform: isFirst
                    ? "translateX(0)"
                    : isLast
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
                }}
              >
                {tick.label}
              </span>
            );
          })}
      </ChartXRail>
      {estimated && recordedLine ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-9 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <svg width="18" height="2" aria-hidden className="shrink-0">
              <line
                x1="0"
                y1="1"
                x2="18"
                y2="1"
                stroke={PALETTE.brand}
                strokeOpacity={0.5}
                strokeWidth={2}
                strokeDasharray="4 4"
              />
            </svg>
            Worked out
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="18" height="2" aria-hidden className="shrink-0">
              <line
                x1="0"
                y1="1"
                x2="18"
                y2="1"
                stroke={PALETTE.brand}
                strokeWidth={2}
              />
            </svg>
            Recorded
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function BookNavChart({
  points,
  assumed,
  anchored,
  anchor,
  liveNav,
  loading,
  firstRealDate,
  onDiscardAssumed,
  onRestoreAssumed,
  onApplyAnchor,
  onClearAnchor,
  className,
}: {
  points: NavPoint[];
  assumed: boolean;
  anchored?: boolean;
  anchor?: YtdAnchor | null;
  liveNav?: number;
  loading?: boolean;
  firstRealDate?: string | null;
  onDiscardAssumed?: () => void;
  onRestoreAssumed?: () => void;
  onApplyAnchor?: (next: YtdAnchor) => void;
  onClearAnchor?: () => void;
  className?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const readAbortRef = useRef<AbortController | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [fixOpen, setFixOpen] = useState(false);

  useEffect(() => {
    return () => readAbortRef.current?.abort();
  }, []);
  const usable = usableNavPoints(points);
  const hasChart = usable.length >= 2;
  const recorded =
    firstRealDate &&
    (() => {
      const d = new Date(`${firstRealDate}T12:00:00`);
      if (Number.isNaN(d.getTime())) return firstRealDate;
      return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      });
    })();

  async function onPickFile(file: File | undefined) {
    if (!file || !onApplyAnchor) return;
    readAbortRef.current?.abort();
    const ctrl = new AbortController();
    readAbortRef.current = ctrl;
    setReading(true);
    setReadError(null);
    try {
      const body = new FormData();
      body.set("image", file);
      if (liveNav != null) body.set("liveNav", String(liveNav));
      const res = await fetch("/api/book/ytd-from-image", {
        method: "POST",
        body,
        signal: ctrl.signal,
      });
      const data = (await res.json().catch(() => ({}))) as {
        startNav?: number;
        ytdPct?: number | null;
        error?: string;
      };
      if (ctrl.signal.aborted) return;
      if (!res.ok || !(data.startNav != null && data.startNav > 0)) {
        setReadError(
          data.error || "Couldn't read a year-to-date from that. Type it in instead."
        );
        setFixOpen(true);
        return;
      }
      onApplyAnchor({
        v: 1,
        source: "screenshot",
        startNav: data.startNav,
        ytdPct: data.ytdPct ?? undefined,
      });
    } catch (err) {
      if (isAbortError(err) || ctrl.signal.aborted) return;
      setReadError("Couldn't read that screenshot. Type it in instead.");
    } finally {
      if (!ctrl.signal.aborted) setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className={className}>
      {loading && !hasChart ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Working out this year’s path …
        </p>
      ) : (
        <MobileBookNavChart
          points={points}
          assumedAll={assumed && !firstRealDate}
          assumedUntil={assumed ? firstRealDate : null}
        />
      )}
      {assumed && hasChart && (
        <div className="flex flex-col mt-4 gap-3">
          {/*
            * The estimate says it is one, in the caption and in the line
            * itself. "Fix the year" implied something was broken, and
            * "Only recorded nights" is the nightly snapshot, a phrase no
            * reader has met.
            */}
          <p className="text-sm text-muted-foreground">
            {anchored
              ? "Using the value you gave us for 1 January."
              : "An estimate. It assumes you held these same companies since January."}
          </p>
          {readError && <p className="text-sm text-loss">{readError}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {onApplyAnchor && !anchored && (
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  setReadError(null);
                  setFixOpen((open) => !open);
                }}
              >
                {fixOpen ? "Hide" : "Know what it was worth on 1 January? Enter it"}
              </Button>
            )}
            {fixOpen && onApplyAnchor && !anchored && (
              <>
                <Button
                  type="button"
                  variant="link"
                  disabled={reading}
                  onClick={() => fileRef.current?.click()}
                >
                  {reading ? "Reading screenshot …" : "Upload a screenshot of it"}
                </Button>
                <Button
                  type="button"
                  variant="link"
                  onClick={() => {
                    setReadError(null);
                    setManualOpen(true);
                  }}
                >
                  Type it in
                </Button>
              </>
            )}
            {anchored && onApplyAnchor && (
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  setReadError(null);
                  setManualOpen(true);
                }}
              >
                Change the number
              </Button>
            )}
            {anchored && onClearAnchor && (
              <Button
                type="button"
                variant="link"
                onClick={onClearAnchor}
              >
                Go back to the estimate
              </Button>
            )}
            {onDiscardAssumed && (
              <Button
                type="button"
                variant="link"
                onClick={onDiscardAssumed}
              >
                {recorded
                  ? `Show only days Upside Lab recorded, from ${recorded}`
                  : "Show only days Upside Lab recorded"}
              </Button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onPickFile(e.target.files?.[0])}
          />
        </div>
      )}
      {!assumed && onRestoreAssumed && (
        <div className="mt-4 flex justify-end">
          {/*
            * A real Button, not a bare underlined link. Every other action
            * on this page is a pill; this one was the only thing styled
            * like body text with an underline on hover, which is what made
            * it read as broken rather than quiet.
            */}
          <Button variant="ghost" size="sm" onClick={onRestoreAssumed}>
            Fill in an assumed year
          </Button>
        </div>
      )}
      {onApplyAnchor && (
        <YtdAnchorModal
          open={manualOpen}
          liveNav={liveNav ?? 0}
          initialStartNav={anchor?.startNav}
          onClose={() => setManualOpen(false)}
          onSave={(next) => {
            onApplyAnchor(next);
            setManualOpen(false);
          }}
        />
      )}
    </div>
  );
}
