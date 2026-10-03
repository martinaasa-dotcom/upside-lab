"use client";

import { useMemo } from "react";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { FourQuestions } from "@/components/company/FourQuestions";
import { PlanLadderPanel } from "@/components/company/PlanLadder";
import { ValueGlance } from "@/components/company/ValueGlance";
import { AppLink } from "@/components/research/AppLink";
import { useLivePrice } from "@/components/research/LivePrice";
import type { CompanyPage } from "@/lib/company/client";
import { fairValueRead, withSpot } from "@/lib/company/fair-value";
import { fourQuestions } from "@/lib/company/four-questions";
import { anchorForCompany } from "@/lib/company/ladder-anchor";
import { bandById, buildPlanLadder } from "@/lib/company/plan-ladder";
import { FORECAST_YEARS } from "@/lib/forecast";
import { cashtag } from "@/lib/format";
import { useHouseForecastDefaults } from "@/lib/use-house-forecast-defaults";

/**
 * The three parts of a public research page that answer "where does
 * today's price sit", drawn against the live price.
 *
 * THE FAIR VALUE IS THE PAGE'S AND THE PRICE IS THE BROWSER'S, AND THAT
 * SPLIT IS THE WHOLE DESIGN.
 *
 * Everything the estimate rests on, the figures, the methods, the written
 * argument, was built once and is cached for hours, and for weeks in the
 * argument's case. The price moves every minute. So the estimate is worked
 * out from the page's own figures exactly as the server would, once, and
 * only the price is swapped for the live one as it lands (`withSpot`): the
 * marker moves through the zones and the gap updates, and the fair value
 * under them stays put, as it should on a day when nothing has happened to
 * the company but the price.
 *
 * The zones are the same ones a signed-in reader gets for this company
 * before setting any of their own, built by the same function from the
 * same anchor (`anchorForCompany`) with the same house default where the
 * house account set one, so the public page and the room inside the app
 * cannot file one price in two different zones. They are read-only, they
 * say whose they are, and the one way to have your own is an ordinary
 * link under them.
 */
export function ResearchLiveSections({ page }: { page: CompanyPage }) {
  const facts = page.facts;
  const ticker = facts.ticker;
  const code = facts.currency ?? "USD";
  const { price: livePrice } = useLivePrice(facts.price);
  const house = useHouseForecastDefaults();

  /*
    Both of the first two points, because neither of them is twelve months
    away and the panel promises a twelve month figure. The path prices
    calendar year ends, so read in September the first point is under four
    months out; `fairValueRead` interpolates between the two.
  */
  const fair = useMemo(() => {
    const yearOne = FORECAST_YEARS[0];
    const yearTwo = FORECAST_YEARS[1];
    const path = page.brief?.path;
    return fairValueRead(facts, {
      modelYearOne: yearOne != null ? path?.[yearOne] ?? null : null,
      modelYearTwo: yearTwo != null ? path?.[yearTwo] ?? null : null,
    });
  }, [facts, page.brief]);

  const liveRead = useMemo(() => withSpot(fair, livePrice), [fair, livePrice]);

  const ladder = useMemo(() => {
    const anchor = anchorForCompany(facts, fair);
    if (!anchor) return null;
    return buildPlanLadder({
      ticker,
      anchor: anchor.price,
      anchorKind: anchor.kind,
      anchorSaid: anchor.said,
      spot: livePrice,
      high: facts.fiftyTwoWeekHigh,
      low: facts.fiftyTwoWeekLow,
      override: null,
      houseOverride: house.ladders[ticker] ?? null,
      estimateSpread: anchor.spread ?? null,
    });
  }, [facts, fair, ticker, livePrice, house]);

  const questions = useMemo(
    () =>
      fourQuestions({
        facts: { ...facts, price: livePrice ?? facts.price },
        read: fair,
        nextEarnings: page.nextEarnings,
        /*
          The bottom of the zones where there are zones, which is the same
          level a signed-in reader is shown before setting their own, and
          the lowest the share has traded in a year where there are none.
          Never named as the reader's: a stranger has set nothing.
        */
        exitLevel: ladder ? bandById(ladder, "exit")?.to ?? facts.fiftyTwoWeekLow : facts.fiftyTwoWeekLow,
        exitFromYear: ladder ? ladder.floorFromYear : true,
        exitIsPersonal: false,
        againstPoint: page.brief?.caseAgainst?.[0]?.point ?? null,
      }),
    [facts, fair, livePrice, page.nextEarnings, page.brief, ladder]
  );

  return (
    <>
      {ladder && (
        <WidgetErrorBoundary name="Fair value zones">
          <PlanLadderPanel
            ticker={ticker}
            ladder={ladder}
            code={code}
            at={facts.fetchedAt}
            onSetEdge={null}
            onReset={null}
            shared
            foot={
              <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  With a free account you can set levels of your own for{" "}
                  {cashtag(ticker)} and see it next to everything you own.
                </p>
                <AppLink
                  ticker={ticker}
                  variant="outline"
                  size="sm"
                  className="shrink-0 self-start sm:self-auto"
                  signedIn="Set your own levels"
                >
                  Set your own levels
                </AppLink>
              </div>
            }
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

      {fair.estimate.price !== null && (
        <WidgetErrorBoundary name="Valuation">
          <ValueGlance
            ticker={ticker}
            facts={facts}
            read={liveRead}
            code={code}
            at={page.briefAt ?? facts.fetchedAt}
            model={page.model}
          />
        </WidgetErrorBoundary>
      )}
    </>
  );
}
