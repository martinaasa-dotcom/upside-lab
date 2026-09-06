"use client";

import { AppHeader } from "@/components/AppHeader";
import { MobileDock } from "@/components/mobile/MobileDock";
import { SignInGate } from "@/components/SignInGate";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EmptyState,
  LoadError,
  MicroLabel,
  Panel,
  PanelHeader,
  Reading,
  SPLIT_ACTIONS,
  SPLIT_COPY,
  SPLIT_ROW,
} from "@/components/ui/Panel";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { CompanyCases } from "@/components/company/CompanyCases";
import { BusinessPanel } from "@/components/company/BusinessPanel";
import { CompanyNumbers } from "@/components/company/CompanyNumbers";
import { CompanyPath } from "@/components/company/CompanyPath";
import { CompanySearch } from "@/components/company/CompanySearch";
import { CompanySources } from "@/components/company/CompanySources";
import { FundInside } from "@/components/company/FundInside";
import { ValueGlance } from "@/components/company/ValueGlance";
import { FourQuestions } from "@/components/company/FourQuestions";
import { PlanLadderPanel } from "@/components/company/PlanLadder";
import { PositionFitCard } from "@/components/company/PositionFitCard";
import { useAuth } from "@/components/AuthProvider";
import { readBookCache } from "@/lib/book-cache";
import { loadCachedQuotes } from "@/lib/quote-cache";
import { fairValueRead } from "@/lib/company/fair-value";
import { fourQuestions } from "@/lib/company/four-questions";
import { anchorForCompany } from "@/lib/company/ladder-anchor";
import {
  buildPlanLadder,
  bandById,
  type LadderBandId,
  type LadderOverrides,
} from "@/lib/company/plan-ladder";
import {
  loadLocalLadders,
  pushLadders,
  saveLocalLadders,
  withEdge,
  withoutLadder,
} from "@/lib/company/ladder-store";
import { fetchLabBundle } from "@/lib/lab-sync-client";
import { quotePollMs, quotesUrl } from "@/lib/market/session";
import {
  isCryptoLike,
  isFundLike,
  shortDescription,
} from "@/lib/company/facts";
import type { FitHolding } from "@/lib/company/position-fit";
import {
  companyHref,
  companyTickerFromPath,
  fetchCompanyPage,
  loadRecentCompanies,
  rememberCompany,
  type CompanyPage,
} from "@/lib/company/client";
import { isAbortError } from "@/lib/abort";
import { FORECAST_YEARS } from "@/lib/forecast";
import {
  NO_VALUE,
  cashtag,
  cn,
  currency,
  signedPercent,
  signedTone,
} from "@/lib/format";
import { PAGE_FRAME_CLASS, PAGE_MAIN_CLASS } from "@/lib/page-shell";
import { onWorkspaceRefresh } from "@/lib/workspace-rooms";
import { formatDateTime } from "@/lib/timezone";
import type { CurrencyCode } from "@/lib/format-live-input";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * One company, read by somebody who does not own it yet.
 *
 * The room is ordered the way a person actually asks: what is this, what
 * do the finances look like, what is it worth, what would I be buying,
 * what do people say about it, and where do I go to check. The two hardest
 * things about it are both about restraint. It must never add up to a
 * recommendation, so nothing here scores the company or prints a word like
 * cheap. And it must never state anything the reader cannot follow to a
 * source, so every block carries its own mark and the page ends on the
 * links out.
 *
 * A block whose data did not arrive is absent rather than empty. A page
 * with four honest sections is better than eight, half of them apologising.
 */

const REFRESH_ROOM_PREFIX = "stock:";

function HeroSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <Skeleton className="h-40" />
      <Skeleton className="h-64" />
      <Skeleton className="h-48" />
    </div>
  );
}

/**
 * The reader's own holdings, valued from what this browser already has.
 *
 * `hasBook` is the load-bearing part. A reader who opened a company page
 * from a link, in a browser that has not loaded their portfolio yet, has
 * no cache here, and treating that as an empty portfolio is not a small
 * error: every share works out against a total of zero, so the card
 * announces that this company would be a hundred per cent of everything
 * they own. That is a confident false statement about somebody's own
 * money, which is the one thing this room may never make.
 */
function useOwnBook(): {
  holdings: FitHolding[];
  cash: number;
  ready: boolean;
  hasBook: boolean;
} {
  const { user } = useAuth();
  const [state, setState] = useState<{
    holdings: FitHolding[];
    cash: number;
    ready: boolean;
    hasBook: boolean;
  }>({ holdings: [], cash: 0, ready: false, hasBook: false });

  useEffect(() => {
    const cached = readBookCache(user?.id ?? null);
    if (!cached) {
      setState({ holdings: [], cash: 0, ready: true, hasBook: false });
      return;
    }
    const { quotes } = loadCachedQuotes();
    const holdings: FitHolding[] = cached.holdings.map((h) => {
      /*
        The live price where this browser has one, and what the reader paid
        where it does not. Both are real numbers rather than an estimate,
        and the difference between them cannot move a share of the
        portfolio by enough to change what this card is for.
      */
      const price = quotes?.[h.ticker]?.price ?? h.buy_price;
      return { ticker: h.ticker, value: h.shares * price };
    });
    const cash = cached.portfolios.reduce(
      (sum, p) => sum + (p.cash_balance ?? 0),
      0
    );
    setState({
      holdings,
      cash,
      ready: true,
      // An account with nothing in it is a real answer and the card is
      // still worth showing; a browser that has not read the portfolio is
      // not, and the two are only distinguishable here.
      hasBook: true,
    });
  }, [user?.id]);

  return state;
}


/**
 * Today's price, kept live while the room is open.
 *
 * The page itself is expensive: it is the feed's whole record of a
 * company, the headlines, and a written brief, and it is refetched on the
 * pull and when the room is shown. The price is not, and the price is the
 * one number on this page that means something different every minute,
 * because it is what decides which band of the reader's own plan they are
 * looking at. So it polls on the same curve the rest of the app does
 * (`quotePollMs`: tight at the bell, slack overnight), and the page's own
 * figure stands until the first live one lands.
 *
 * The page is refetched, not just the price, when the price has moved far
 * enough that the writing around it is stale: past that distance the
 * estimates were reasoned against a different price and the headlines
 * that moved it are the ones the reader came for. It is the same rule the
 * shared brief cache applies on the server, checked here so a reader who
 * leaves the room open through a results day is not reading yesterday's
 * argument under today's price.
 */
const PRICE_DRIFT_REFETCH = 0.05;

function useLivePrice(
  ticker: string,
  fromPage: number | null,
  onDrift: () => void
): { price: number | null; at: number | null } {
  const [live, setLive] = useState<{ price: number; at: number } | null>(null);

  // The page's own figure is the starting point, and a new page resets it,
  // or a stale live price from the last company would outlive its room.
  useEffect(() => {
    setLive(null);
  }, [ticker]);

  const driftRef = useRef(onDrift);
  driftRef.current = onDrift;
  const baseRef = useRef(fromPage);
  baseRef.current = fromPage;

  useEffect(() => {
    if (!ticker) return;
    let stop = false;
    let timer: number | undefined;

    const tick = async () => {
      const ctrl = new AbortController();
      try {
        const res = await fetch(quotesUrl([ticker]), {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          quotes?: Record<string, { price?: number }>;
        };
        const quotes = data.quotes ?? {};
        const found =
          quotes[ticker]?.price ?? Object.values(quotes)[0]?.price ?? null;
        if (stop || typeof found !== "number" || !(found > 0)) return;
        setLive({ price: found, at: Date.now() });
        const base = baseRef.current;
        if (base && base > 0 && Math.abs(found - base) / base > PRICE_DRIFT_REFETCH) {
          driftRef.current();
        }
      } catch {
        /* a missed poll is the next poll's problem */
      } finally {
        if (!stop) {
          timer = window.setTimeout(() => void tick(), quotePollMs());
        }
      }
    };

    timer = window.setTimeout(() => void tick(), quotePollMs());
    return () => {
      stop = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [ticker]);

  return { price: live?.price ?? fromPage, at: live?.at ?? null };
}

/**
 * The reader's own price plans, read from the account and mirrored here.
 *
 * The local copy is shown first so a plan is on screen before the round
 * trip lands, and the account's copy wins when it arrives, because a plan
 * belongs to a person rather than to a browser.
 */
function usePlanLadders(): {
  ladders: LadderOverrides;
  setLadders: (next: LadderOverrides) => void;
} {
  const [ladders, setState] = useState<LadderOverrides>({});

  useEffect(() => {
    setState(loadLocalLadders());
    const ctrl = new AbortController();
    void fetchLabBundle(ctrl.signal).then((r) => {
      if (ctrl.signal.aborted || r.source !== "supabase") return;
      setState(r.bundle.ladders ?? {});
    });
    return () => ctrl.abort();
  }, []);

  const setLadders = useCallback((next: LadderOverrides) => {
    setState(next);
    saveLocalLadders(next);
    void pushLadders(next);
  }, []);

  return { ladders, setLadders };
}

export function StockRoom({ ticker: fromProps }: { ticker?: string }) {
  const pathname = usePathname();
  const ticker = (fromProps || companyTickerFromPath(pathname) || "").toUpperCase();
  const [page, setPage] = useState<CompanyPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recents, setRecents] = useState<string[]>([]);
  const book = useOwnBook();

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!ticker) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchCompanyPage(ticker, signal);
        if (signal?.aborted) return;
        setPage(data);
        rememberCompany(ticker);
        setRecents(loadRecentCompanies());
      } catch (err) {
        if (isAbortError(err) || signal?.aborted) return;
        setPage(null);
        setError(
          err instanceof Error
            ? err.message
            : "Could not load that company. Try again in a moment."
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [ticker]
  );

  useEffect(() => {
    setPage(null);
    setRecents(loadRecentCompanies());
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // The pull only reaches the room the finger is in, so the id has to be
  // the same one `workspaceRoomId` gives this path.
  useEffect(() => {
    if (!ticker) return;
    return onWorkspaceRefresh(`${REFRESH_ROOM_PREFIX}${ticker}`, () => load());
  }, [ticker, load]);

  const facts = page?.facts ?? null;
  const code = (facts?.currency ?? "USD") as CurrencyCode;

  const fair = useMemo(() => {
    if (!facts) return null;
    /*
      Both of the first two points, because neither of them is twelve
      months away and the panel promises a twelve month figure. The path
      prices calendar year ends, so read in September the first point is
      under four months out; `fairValueRead` interpolates between the two.
    */
    const yearOne = FORECAST_YEARS[0];
    const yearTwo = FORECAST_YEARS[1];
    const path = page?.brief?.path;
    const modelYearOne = yearOne != null ? path?.[yearOne] ?? null : null;
    const modelYearTwo = yearTwo != null ? path?.[yearTwo] ?? null : null;
    return fairValueRead(facts, { modelYearOne, modelYearTwo });
  }, [facts, page?.brief]);

  /*
    The live price, and the room's own reason to refetch. The page carries
    a price from the moment it was built; this one is minutes old at
    worst, and it is what decides which band of the plan the reader is in.
  */
  const live = useLivePrice(ticker, facts?.price ?? null, () => void load());
  const { ladders, setLadders } = usePlanLadders();

  /*
    The ladder, and every number on it, against the live price rather than
    the page's. `anchorForCompany` chooses what it hangs off and says so;
    with nothing to hang it off there is no ladder at all, because a
    ladder centred on today's price would be this app saying today's price
    is right.
  */
  const ladder = useMemo(() => {
    if (!facts) return null;
    const anchor = anchorForCompany(facts, fair);
    if (!anchor) return null;
    return buildPlanLadder({
      ticker,
      anchor: anchor.price,
      anchorKind: anchor.kind,
      anchorSaid: anchor.said,
      spot: live.price,
      high: facts.fiftyTwoWeekHigh,
      low: facts.fiftyTwoWeekLow,
      override: ladders[ticker] ?? null,
    });
  }, [facts, fair, ticker, live.price, ladders]);

  const questions = useMemo(() => {
    if (!facts || !fair) return [];
    return fourQuestions({
      facts: { ...facts, price: live.price ?? facts.price },
      read: fair,
      nextEarnings: page?.nextEarnings ?? null,
      exitLevel: ladder ? bandById(ladder, "exit")?.to ?? null : null,
      againstPoint: page?.brief?.caseAgainst?.[0]?.point ?? null,
    });
  }, [facts, fair, live.price, page?.nextEarnings, page?.brief, ladder]);

  const setEdge = useCallback(
    (id: LadderBandId, price: number | null) => {
      if (!ladder) return;
      // Stored as a multiple of the anchor rather than a price, so a level
      // set today still means the same thing when the estimates move.
      setLadders(
        withEdge(
          ladders,
          ticker,
          id,
          price === null ? null : price / ladder.anchor
        )
      );
    },
    [ladder, ladders, setLadders, ticker]
  );

  const title = facts?.name || (ticker ? cashtag(ticker) : "Research");

  return (
    <SignInGate>
      <div className={PAGE_FRAME_CLASS}>
        <MobileDock active={null} />
        <AppHeader title={title} mobileTitle={ticker ? cashtag(ticker) : ""} />
        <main id="main" className={PAGE_MAIN_CLASS}>
          <div className="flex flex-col gap-4">
            <div className={SPLIT_ROW}>
              <div className={SPLIT_COPY}>
                <h1 className="text-2xl font-semibold text-foreground">
                  Research
                </h1>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  What it does, what the accounts say, what the price is
                  assuming, and both sides of the argument. Every figure is
                  the real one, named properly, with a plain sentence under
                  it and a link back to where it came from.
                </p>
              </div>
              <div className={SPLIT_ACTIONS}>
                <div className="w-full sm:w-72">
                  <CompanySearch />
                </div>
              </div>
            </div>
            {recents.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <MicroLabel className="shrink-0">Recently looked at</MicroLabel>
                {recents
                  .filter((t) => t !== ticker)
                  .slice(0, 6)
                  .map((t) => (
                    <Link
                      key={t}
                      href={companyHref(t)}
                      className="rounded-md border border-border px-2 py-1 font-mono text-xs tabular-nums text-muted-foreground transition hover:bg-hover hover:text-foreground"
                    >
                      {cashtag(t)}
                    </Link>
                  ))}
              </div>
            )}
          </div>

          {!ticker ? (
            <EmptyState
              title="Pick a company"
              detail="Type a name or a ticker above. You do not have to own it, and looking one up changes nothing in your portfolio."
            />
          ) : error ? (
            <LoadError message={error} onRetry={() => void load()} />
          ) : loading && !page ? (
            <HeroSkeleton />
          ) : page && facts ? (
            <>
              <Panel>
                <PanelHeader
                  hero
                  title={facts.name || cashtag(ticker)}
                  subtitle={
                    page.brief?.inOneLine ||
                    (facts.industry
                      ? `${facts.industry}${facts.country ? `, based in ${facts.country}` : ""}.`
                      : undefined)
                  }
                  icon={<Building2 className="h-4 w-4" />}
                  actions={
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-mono text-2xl font-bold tabular-nums text-foreground">
                        {currency(live.price ?? facts.price, 2, code)}
                      </span>
                      {facts.changePercent !== null && (
                        <span
                          className={cn(
                            "font-mono text-sm tabular-nums",
                            signedTone(facts.changePercent)
                          )}
                        >
                          {signedPercent(facts.changePercent)} today
                        </span>
                      )}
                    </div>
                  }
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono">
                    {cashtag(ticker)}
                  </Badge>
                  {/*
                    A fund's own category is the more useful label and the
                    two would otherwise sit side by side saying roughly the
                    same thing.
                  */}
                  {isFundLike(facts) && facts.fundCategory ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      {facts.fundCategory}
                    </Badge>
                  ) : facts.sector ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      {facts.sector}
                    </Badge>
                  ) : null}
                  {facts.employees !== null && (
                    <Badge variant="outline" className="text-muted-foreground">
                      {new Intl.NumberFormat("en-US").format(facts.employees)}{" "}
                      people
                    </Badge>
                  )}
                  {page.nextEarnings && (
                    <Badge variant="outline" className="text-muted-foreground">
                      Next results{" "}
                      {formatDateTime(page.nextEarnings, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                      {page.nextEarningsIsEstimate ? " (expected)" : ""}
                    </Badge>
                  )}
                </div>
                {page.brief ? (
                  <Reading nested label="What the company does">
                    <p className="text-sm leading-relaxed text-foreground">
                      {page.brief.whatTheyDo}
                    </p>
                    {page.brief.howTheyMakeMoney && (
                      <p className="mt-3 text-sm leading-relaxed text-foreground">
                        {page.brief.howTheyMakeMoney}
                      </p>
                    )}
                  </Reading>
                ) : facts.about ? (
                  <Reading nested label="What the company says it does">
                    <p className="text-sm leading-relaxed text-foreground">
                      {shortDescription(facts.about)}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                      Their own words, unedited, so some of it will be
                      jargon. Nothing rewrote it into plainer English this
                      time.
                    </p>
                  </Reading>
                ) : null}
              </Panel>

              {/*
                A `Panel`, not a loose `Card`. A card is a well that lives
                inside a panel; one sitting straight on the field reads as
                a box that lost its heading, and the room's rhythm is one
                panel per idea all the way down.
              */}
              {page.thin && (
                <Panel tone="warn">
                  <p className="text-sm leading-relaxed text-foreground">
                    The feed carries very little about this one. What is
                    below is everything it had, and the parts that are
                    missing are shown as {NO_VALUE} rather than filled in
                    with anything.
                  </p>
                </Panel>
              )}

              {/*
                The plan comes first, under the summary of what the
                company is, because a reader arriving at a company page is
                deciding what to do about a price and everything below is
                the working behind that. It is theirs and it says so; the
                estimate it hangs off is in the valuation panel further
                down, where its methods and their assumptions are.
              */}
              {ladder && (
                <WidgetErrorBoundary name="Your price plan">
                  <PlanLadderPanel
                    ticker={ticker}
                    ladder={ladder}
                    code={code}
                    at={facts.fetchedAt}
                    onSetEdge={setEdge}
                    onReset={() => setLadders(withoutLadder(ladders, ticker))}
                  />
                </WidgetErrorBoundary>
              )}

              {questions.length > 0 && (
                <WidgetErrorBoundary name="The four questions">
                  <FourQuestions
                    ticker={ticker}
                    answers={questions}
                    usesModel={Boolean(page.brief?.caseAgainst?.length)}
                    model={page.model}
                    at={page.briefAt ?? facts.fetchedAt}
                  />
                </WidgetErrorBoundary>
              )}

              {fair && fair.estimate.price !== null && (
                <WidgetErrorBoundary name="Valuation">
                  <ValueGlance
                    ticker={ticker}
                    facts={facts}
                    read={fair}
                    code={code}
                    at={page.briefAt ?? facts.fetchedAt}
                    model={page.model}
                  />
                </WidgetErrorBoundary>
              )}

              {isCryptoLike(facts) && (
                <Panel tone="warn">
                  <p className="text-sm leading-relaxed text-foreground">
                    There is no company behind this one. It files no
                    accounts, earns no revenue and owns nothing, so most of
                    what this page does for a company cannot be done here:
                    there is nothing to value it against except what
                    somebody else will pay. The price and the range below
                    are real; everything else on a company page would be
                    invented.
                  </p>
                </Panel>
              )}

              <WidgetErrorBoundary name="Company numbers">
                <CompanyNumbers
                  ticker={ticker}
                  readings={page.readings}
                  at={facts.fetchedAt}
                />
              </WidgetErrorBoundary>

              {!isFundLike(facts) && !isCryptoLike(facts) && (
                <WidgetErrorBoundary name="The business">
                  <BusinessPanel
                    ticker={ticker}
                    facts={facts}
                    code={code}
                  />
                </WidgetErrorBoundary>
              )}

              {isFundLike(facts) && (
                <WidgetErrorBoundary name="Inside the fund">
                  <FundInside
                    facts={facts}
                    owned={book.holdings.map((h) => h.ticker)}
                  />
                </WidgetErrorBoundary>
              )}

              {page.brief && (
                <WidgetErrorBoundary name="Both sides">
                  <CompanyCases
                    ticker={ticker}
                    brief={page.brief}
                    articles={page.articles}
                    at={page.briefAt}
                    model={page.model}
                    shared={page.briefShared}
                  />
                </WidgetErrorBoundary>
              )}

              {page.brief && (
                <WidgetErrorBoundary name="Five-year path">
                  <CompanyPath
                    ticker={ticker}
                    path={page.brief.path}
                    reason={page.brief.pathReason}
                    spot={facts.price}
                    code={code}
                    at={page.briefAt}
                    model={page.model}
                    sector={facts.sector}
                    shared={page.briefShared}
                  />
                </WidgetErrorBoundary>
              )}


              {book.ready && book.hasBook && (
                <WidgetErrorBoundary name="How it would fit">
                  <PositionFitCard
                    ticker={ticker}
                    holdings={book.holdings}
                    cash={book.cash}
                    /*
                      The reader's own money, not the listing's. A company
                      quoted in euros sitting in a portfolio kept in
                      dollars would otherwise have every figure on this
                      card labelled in the wrong currency, which is a
                      hundred-per-cent error on a number somebody is
                      about to act on.
                    */
                    code="USD"
                    price={facts.price}
                    listingCode={code}
                  />
                </WidgetErrorBoundary>
              )}

              {book.ready && !book.hasBook && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  This page can also work out what buying this would do to
                  your own portfolio. It needs your holdings loaded first,
                  which happens the moment you open Home.
                </p>
              )}

              <WidgetErrorBoundary name="Sources">
                <CompanySources
                  articles={page.articles}
                  sources={page.sources}
                />
              </WidgetErrorBoundary>

              {!page.brief && !page.thin && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  The written half of this page could not be produced this
                  time, so you have the figures and the links and none of
                  the argument. Pull the page down to try again.
                </p>
              )}

              <p className="text-sm leading-relaxed text-muted-foreground">
                Upside Lab is not an adviser and none of this is a
                recommendation. Every number above came from a public feed
                and can be checked at the links above. What you do about it
                is yours.
              </p>
            </>
          ) : null}
          {loading && page && (
            <p className="text-sm text-muted-foreground">Refreshing.</p>
          )}
        </main>
      </div>
    </SignInGate>
  );
}
