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
import { CompanyFinancials } from "@/components/company/CompanyFinancials";
import { CompanyNumbers } from "@/components/company/CompanyNumbers";
import { CompanyPath } from "@/components/company/CompanyPath";
import { CompanySearch } from "@/components/company/CompanySearch";
import { CompanySources } from "@/components/company/CompanySources";
import { FairValueCard } from "@/components/company/FairValueCard";
import { FundInside } from "@/components/company/FundInside";
import { ValueGlance } from "@/components/company/ValueGlance";
import { PositionFitCard } from "@/components/company/PositionFitCard";
import { useAuth } from "@/components/AuthProvider";
import { readBookCache } from "@/lib/book-cache";
import { loadCachedQuotes } from "@/lib/quote-cache";
import { fairValueRead } from "@/lib/company/fair-value";
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
import { useCallback, useEffect, useMemo, useState } from "react";

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
    const yearOne = FORECAST_YEARS[0];
    const modelYearOne =
      yearOne != null ? page?.brief?.path?.[yearOne] ?? null : null;
    return fairValueRead(facts, { modelYearOne });
  }, [facts, page?.brief]);

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
                        {currency(facts.price, 2, code)}
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

              {fair && fair.estimate.price !== null && (
                <WidgetErrorBoundary name="At a glance">
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

              {fair && (
                <WidgetErrorBoundary name="Fair value">
                  <FairValueCard
                    ticker={ticker}
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
                  history={facts.history}
                  currency={code}
                  at={facts.fetchedAt}
                />
              </WidgetErrorBoundary>

              {!isFundLike(facts) && !isCryptoLike(facts) && (
                <WidgetErrorBoundary name="Quarterly financials">
                  <CompanyFinancials
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
