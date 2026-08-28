"use client";

import {
  SHOCKS,
  analyzePortfolioShock,
  type ShockId,
} from "@/lib/book-shock";
import { FluidRow, FluidTable, cellBase, cellTicker, tableCols } from "@/components/FluidTable";
import { TickerSymbol } from "@/components/TickerSymbol";
import { listingCurrenciesAreMixed } from "@/lib/listing-currency";
import { NO_VALUE, cashtag, cn, currency, percent, signedCurrency, signedPercent, signedTone } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CARD, Card, EmptyState, Panel, PanelHeader, Pill, Score, Scoreboard, SPLIT_COPY, SPLIT_ROW, Stat } from "@/components/ui/Panel";
import { WhyThis } from "@/components/ui/WhyThis";
import { scenarioProvenance } from "@/lib/provenance";
import {
  Activity,
  ChevronDown,
  Cpu,
  DollarSign,
  Flame,
  Layers,
  Shield,
  ShieldAlert,
  Snowflake,
  TrendingDown,
  TrendingUp,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

type Props = {
  holdings: {
    ticker: string;
    shares: number;
    price: number;
  }[];
  cash: number;
  scopeLabel: string;
};

type SortField = "delta" | "move" | "ticker";

const DRIVER_ICONS: Record<string, typeof Activity> = {
  Baseline: Activity,
  "Interest rates": TrendingUp,
  "Tech prices": Cpu,
  "Oil and energy": Flame,
  "AI computer builders": Sparkles,
  Crypto: Snowflake,
  "Everyone selling": TrendingDown,
  "The dollar": DollarSign,
  Factories: ShieldAlert,
  "People buying": Layers,
};

export function ScenarioSimulator({ holdings, cash }: Props) {
  const [selectedShock, setSelectedShock] = useState<ShockId>("ai_down20");
  const [sortField, setSortField] = useState<SortField>("delta");
  const [sortAsc, setSortAsc] = useState(true);

  const analysis = useMemo(() => {
    return analyzePortfolioShock(holdings, cash, selectedShock);
  }, [holdings, cash, selectedShock]);

  const sortedRows = useMemo(() => {
    const list = [...analysis.rows];
    list.sort((a, b) => {
      let diff = 0;
      if (sortField === "delta") diff = a.deltaVal - b.deltaVal;
      else if (sortField === "move") diff = a.movePct - b.movePct;
      else if (sortField === "ticker") diff = a.ticker.localeCompare(b.ticker);
      return sortAsc ? diff : -diff;
    });
    return list;
  }, [analysis.rows, sortField, sortAsc]);

  const mixedListings = listingCurrenciesAreMixed(
    holdings.map((h) => ({ ticker: h.ticker }))
  );
  const tickerCell = mixedListings ? cellTicker : cellBase;
  const template = tableCols(5, mixedListings);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === "delta" || field === "move");
    }
  };

  const activeScenario = analysis.scenario;
  const DriverIcon = DRIVER_ICONS[activeScenario.driver] ?? Activity;

  if (holdings.length === 0) {
    return (
      <EmptyState
        title="Nothing to test yet"
        detail="Add a holding and this shows what a rough day would do to your portfolio."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <PanelHeader
          icon={<Shield className="h-4 w-4" />}
          title={
            <span className="inline-flex items-center gap-2">
              What a bad day costs you
              <WhyThis provenance={scenarioProvenance()} />
            </span>
          }
        />

        <div className={cn(CARD, "overflow-hidden")}>
          <div
            role="group"
            aria-label="Market scenario"
            className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-5"
          >
            {SHOCKS.map((s) => {
              const Icon = DRIVER_ICONS[s.driver] ?? Activity;
              const isSelected = selectedShock === s.id;
              return (
                <Button
                  key={s.id}
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  size="lg"
                  aria-pressed={isSelected}
                  title={s.label}
                  onClick={() => setSelectedShock(s.id)}
                  className={cn(
                    "h-9 w-full min-w-0 touch-target overflow-hidden md:min-h-9",
                    !isSelected && "bg-background text-muted-foreground dark:bg-background"
                  )}
                >
                  <Icon data-icon="inline-start" aria-hidden />
                  <span className="min-w-0 truncate">{s.shortLabel}</span>
                </Button>
              );
            })}
          </div>
          <Separator />
          <div className="flex flex-col gap-2 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <DriverIcon className="h-4 w-4 shrink-0" aria-hidden />
                <h3 className="font-semibold text-foreground">
                  {activeScenario.label}
                </h3>
                <Pill tone="neutral">{activeScenario.driver}</Pill>
              </div>
              <span className="text-sm text-muted-foreground">
                Headline move{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {activeScenario.headlinePct > 0 ? "+" : ""}
                  {(activeScenario.headlinePct * 100).toFixed(0)}%
                </span>
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {activeScenario.mechanism}
            </p>
          </div>
        </div>
      </Panel>

      <Stat
        label="Portfolio after this"
        value={currency(analysis.shockedTotalVal, 0)}
        sub={
          <>
            <span
              className={cn(
                "font-semibold tabular-nums",
                signedTone(analysis.deltaVal)
              )}
            >
              {signedPercent(analysis.deltaPct)}
            </span>
            {` · ${signedCurrency(analysis.deltaVal, 0)} from today's ${currency(analysis.liveTotalVal, 0)}`}
          </>
        }
      />
      {analysis.margin.isUsingMargin ? (
        <div className="flex flex-wrap items-center gap-2">
            {analysis.margin.marginCallRisk === "critical" ? (
              <Pill tone="bad">Broker could force a sale</Pill>
            ) : analysis.margin.marginCallRisk === "caution" ? (
              <Pill tone="warn">Getting tight</Pill>
            ) : (
              <Pill tone="good">Comfortable</Pill>
            )}
            <p className="text-sm text-muted-foreground">
              {analysis.margin.shockedLeverage.toFixed(2)}x borrowed. Room
              before a forced sale:{" "}
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  analysis.margin.shockedEquityCushion > 0
                    ? "text-foreground"
                    : "text-loss"
                )}
              >
                {currency(analysis.margin.shockedEquityCushion, 0)}
              </span>
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {analysis.cash > 0
              ? `Cash ${currency(analysis.cash, 0)} · ${analysis.margin.shockedCashPct.toFixed(1)}% of the portfolio after this.`
              : "There is no cash set aside as a cushion."}
          </p>
        )}

      <Scoreboard cols={2}>
          <Score
            label="Hurts most"
            value={
              analysis.topVulnerability
                ? cashtag(analysis.topVulnerability.ticker)
                : NO_VALUE
            }
            sub={
              analysis.topVulnerability
                ? `${signedCurrency(analysis.topVulnerability.deltaVal, 0)} · ${percent(analysis.topVulnerability.movePct)}`
                : "Nothing held here yet."
            }
            subClassName={
              analysis.topVulnerability
                ? signedTone(analysis.topVulnerability.deltaVal)
                : undefined
            }
          />
          <Score
            label="Holds up best"
            value={
              analysis.topShockAbsorber
                ? cashtag(analysis.topShockAbsorber.ticker)
                : NO_VALUE
            }
            sub={
              analysis.topShockAbsorber
                ? `${signedCurrency(analysis.topShockAbsorber.deltaVal, 0)} · ${percent(analysis.topShockAbsorber.movePct)}`
                : "Nothing held here yet."
            }
            subClassName={
              analysis.topShockAbsorber &&
              analysis.topShockAbsorber.deltaVal >= 0
                ? "text-gain"
                : "text-muted-foreground"
            }
          />
        </Scoreboard>

      {analysis.themeBreakdown.length > 1 && selectedShock !== "none" && (
        <Panel tone="plain">
          <h3 className="text-base font-semibold text-foreground">
            Where the damage lands
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Your holdings grouped by what they actually depend on.
          </p>
          <Table className="mt-3">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Theme</TableHead>
                <TableHead className="text-right">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analysis.themeBreakdown.map((t) => (
                <TableRow key={t.theme} className="hover:bg-transparent">
                  <TableCell className="whitespace-normal font-medium">
                    {t.theme}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      t.deltaVal >= 0 ? "text-gain" : "text-loss"
                    )}
                  >
                    {t.deltaVal >= 0 ? "+" : ""}
                    {currency(t.deltaVal, 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}

      <Panel tone="plain">
        <div className={SPLIT_ROW}>
          <div className={SPLIT_COPY}>
            <h3 className="text-base font-semibold text-foreground">
              Every position
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Sorted by the biggest dollar change. Tap a column to re-sort.
            </p>
          </div>
          <span className="text-sm text-muted-foreground">
            {sortedRows.length}{" "}
            {sortedRows.length === 1 ? "position" : "positions"}
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-3 md:hidden">
          {sortedRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nothing held here yet.
            </p>
          ) : (
            sortedRows.map((r) => (
              <Card key={r.ticker}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-base font-semibold text-foreground">
                    <TickerSymbol
                      ticker={r.ticker}
                      showCurrency={mixedListings}
                    />
                  </p>
                  <p
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      r.deltaVal === 0
                        ? "text-muted-foreground"
                        : r.deltaVal > 0
                          ? "text-gain"
                          : "text-loss"
                    )}
                  >
                    {r.deltaVal > 0 ? "+" : ""}
                    {currency(r.deltaVal, 0)}
                  </p>
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {r.label}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Move</p>
                    <p
                      className={cn(
                        "font-medium tabular-nums",
                        r.movePct === 0
                          ? "text-muted-foreground"
                          : r.movePct > 0
                            ? "text-gain"
                            : "text-loss"
                      )}
                    >
                      {r.movePct > 0 ? "+" : ""}
                      {percent(r.movePct)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">After</p>
                    <p className="tabular-nums text-foreground">
                      {currency(r.shockVal, 0)}
                    </p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        <div className="mt-3 hidden md:block">
          {sortedRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nothing held here yet.
            </p>
          ) : (
            <FluidTable template={template}>
              <FluidRow className="text-sm font-medium text-muted-foreground">
                <button
                  type="button"
                  onClick={() => handleSort("ticker")}
                  className={cn(
                    tickerCell,
                    "hover:text-foreground",
                    sortField === "ticker" && "text-foreground"
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    Ticker
                    {sortField === "ticker" && (
                      <ChevronDown className="h-3 w-3" aria-hidden />
                    )}
                  </span>
                </button>
                <div className={cellBase}>Bet</div>
                <button
                  type="button"
                  onClick={() => handleSort("move")}
                  className={cn(
                    cellBase,
                    "hover:text-foreground",
                    sortField === "move" && "text-foreground"
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    Move
                    {sortField === "move" && (
                      <ChevronDown className="h-3 w-3" aria-hidden />
                    )}
                  </span>
                </button>
                <div className={cellBase}>After</div>
                <button
                  type="button"
                  onClick={() => handleSort("delta")}
                  className={cn(
                    cellBase,
                    "hover:text-foreground",
                    sortField === "delta" && "text-foreground"
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    Change
                    {sortField === "delta" && (
                      <ChevronDown className="h-3 w-3" aria-hidden />
                    )}
                  </span>
                </button>
              </FluidRow>
              {sortedRows.map((r) => (
                <FluidRow key={r.ticker}>
                  <div
                    className={cn(
                      tickerCell,
                      "font-semibold tracking-wide text-foreground"
                    )}
                  >
                    <TickerSymbol
                      ticker={r.ticker}
                      showCurrency={mixedListings}
                    />
                  </div>
                  <div className={cn(cellBase, "min-w-0")}>
                    <span className="min-w-0 truncate text-muted-foreground">
                      {r.label}
                    </span>
                  </div>
                  <div
                    className={cn(
                      cellBase,
                      "font-medium tabular-nums",
                      r.movePct === 0
                        ? "text-muted-foreground"
                        : r.movePct > 0
                          ? "text-gain"
                          : "text-loss"
                    )}
                  >
                    {r.movePct > 0 ? "+" : ""}
                    {percent(r.movePct)}
                  </div>
                  <div className={cn(cellBase, "tabular-nums text-muted-foreground")}>
                    {currency(r.shockVal, 0)}
                  </div>
                  <div
                    className={cn(
                      cellBase,
                      "font-semibold tabular-nums",
                      r.deltaVal === 0
                        ? "text-muted-foreground"
                        : r.deltaVal > 0
                          ? "text-gain"
                          : "text-loss"
                    )}
                  >
                    {r.deltaVal > 0 ? "+" : ""}
                    {currency(r.deltaVal, 0)}
                  </div>
                </FluidRow>
              ))}
            </FluidTable>
          )}
        </div>
      </Panel>
    </div>
  );
}
