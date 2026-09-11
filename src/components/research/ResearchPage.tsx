import { Badge } from "@/components/ui/badge";
import {
  MicroLabel,
  Panel,
  PanelHeader,
  Reading,
} from "@/components/ui/Panel";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import { BusinessPanel } from "@/components/company/BusinessPanel";
import { CompanyCases } from "@/components/company/CompanyCases";
import { CompanyNumbers } from "@/components/company/CompanyNumbers";
import { CompanyPath } from "@/components/company/CompanyPath";
import { CompanySources } from "@/components/company/CompanySources";
import { FourQuestions } from "@/components/company/FourQuestions";
import { FundInside } from "@/components/company/FundInside";
import { ValueGlance } from "@/components/company/ValueGlance";
import { ResearchChrome } from "@/components/research/ResearchChrome";
import { ResearchPrice } from "@/components/research/ResearchPrice";
import { Button } from "@/components/ui/button";
import type { CompanyPage } from "@/lib/company/client";
import { companyHref } from "@/lib/company/client";
import { isCryptoLike, isFundLike, shortDescription } from "@/lib/company/facts";
import { fairValueRead } from "@/lib/company/fair-value";
import { fourQuestions } from "@/lib/company/four-questions";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { FORECAST_YEARS } from "@/lib/forecast";
import { NO_VALUE, cashtag } from "@/lib/format";
import { PRODUCT_NAME } from "@/lib/product";
import {
  plainCompanyName,
  researchLede,
  researchQuestions,
  researchTitle,
} from "@/lib/research/seo-copy";
import {
  researchJsonLd,
  serializeJsonLd,
} from "@/lib/research/structured-data";
import {
  researchGroupFor,
  researchHref,
  researchNeighbours,
} from "@/lib/research/universe";
import { formatDateTime } from "@/lib/timezone";
import { Building2, HelpCircle } from "lucide-react";
import Link from "next/link";

/**
 * One company, read by somebody who has never heard of this product.
 *
 * It is the Research room with the reader's own half taken out, and that
 * subtraction is the whole design. What a signed-in reader gets that a
 * stranger does not is everything that needs a portfolio behind it: what
 * they own of it, what buying it would do to their mix, and their own
 * price ladder. None of those can be honestly drawn for somebody with no
 * portfolio loaded, and the app's own rule about that is emphatic: a
 * browser with no portfolio in it is not an empty portfolio, and a card
 * that treats the two the same makes a confident false statement about
 * somebody's money.
 *
 * What is left is the half that was always public anyway: a provider's
 * figures, public headlines, arithmetic on both, and a written argument
 * every point of which cites one of them. That is a page worth putting a
 * stranger's name to, and it is why these can be published at all.
 *
 * The order is the room's order, deliberately unchanged. What is added is
 * at the ends: the question block, which is the plain-English index into
 * the panels above it, and one panel at the foot saying what this app is,
 * which has been earned by then rather than demanded up front.
 */
export function ResearchPage({ page }: { page: CompanyPage }) {
  const facts = page.facts;
  const ticker = facts.ticker;
  const code = facts.currency ?? "USD";
  const name = plainCompanyName(facts);
  const tag = cashtag(ticker);

  /*
    Both of the first two points, because neither of them is twelve months
    away and the panel promises a twelve month figure. The path prices
    calendar year ends, so read in September the first point is under four
    months out; `fairValueRead` interpolates between the two.
  */
  const yearOne = FORECAST_YEARS[0];
  const yearTwo = FORECAST_YEARS[1];
  const path = page.brief?.path;
  const fair = fairValueRead(facts, {
    modelYearOne: yearOne != null ? path?.[yearOne] ?? null : null,
    modelYearTwo: yearTwo != null ? path?.[yearTwo] ?? null : null,
  });

  const questions = fourQuestions({
    facts,
    read: fair,
    nextEarnings: page.nextEarnings,
    /*
      No exit level and no ladder. A price ladder belongs to the reader who
      set it, and a stranger has not set one. The answer says so rather
      than inventing a level nobody chose.
    */
    exitLevel: null,
    againstPoint: page.brief?.caseAgainst?.[0]?.point ?? null,
  });

  const asked = researchQuestions({ facts, read: fair });
  const group = researchGroupFor(ticker);
  const neighbours = researchNeighbours(ticker);
  const title = researchTitle(facts);

  return (
    <ResearchChrome>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            researchJsonLd({
              facts,
              title,
              description: page.brief?.inOneLine ?? researchLede(facts),
              questions: asked,
              modifiedAt: page.briefAt ?? facts.fetchedAt,
            })
          ),
        }}
      />

      {/*
        The breadcrumb is a real trail, not a decoration: it is the only
        way up from a page a person landed on cold, and the same three
        steps are in the structured data above.
      */}
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <li>
            <Link href="/" className="hover:text-foreground">
              {PRODUCT_NAME}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href="/research" className="hover:text-foreground">
              Research
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="font-mono text-foreground">{ticker}</li>
        </ol>
      </nav>

      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold tracking-[-0.035em] text-balance text-foreground">
          {title}
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {researchLede(facts)}
        </p>
      </div>

      <Panel>
        <PanelHeader
          hero
          title={facts.name || tag}
          subtitle={
            page.brief?.inOneLine ||
            (facts.industry
              ? `${facts.industry}${facts.country ? `, based in ${facts.country}` : ""}.`
              : undefined)
          }
          icon={<Building2 className="h-4 w-4" />}
          actions={
            <ResearchPrice
              ticker={ticker}
              price={facts.price}
              changePercent={facts.changePercent}
              code={code}
              at={facts.fetchedAt}
            />
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono">
            {tag}
          </Badge>
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
              {new Intl.NumberFormat("en-US").format(facts.employees)} people
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
              Their own words, unedited, so some of it will be jargon.
              Nothing rewrote it into plainer English this time.
            </p>
          </Reading>
        ) : null}
      </Panel>

      {page.thin && (
        <Panel tone="warn">
          <p className="text-sm leading-relaxed text-foreground">
            The feed carries very little about this one. What is below is
            everything it had, and the parts that are missing are shown as{" "}
            {NO_VALUE} rather than filled in with anything.
          </p>
        </Panel>
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
            There is no company behind this one. It files no accounts,
            earns no revenue and owns nothing, so most of what this page
            does for a company cannot be done here: there is nothing to
            value it against except what somebody else will pay. The price
            and the range below are real; everything else on a company page
            would be invented.
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
          <BusinessPanel ticker={ticker} facts={facts} code={code} />
        </WidgetErrorBoundary>
      )}

      {isFundLike(facts) && (
        <WidgetErrorBoundary name="Inside the fund">
          {/*
            No overlap line: that answer needs the reader's own holdings,
            and a stranger has none. `FundInside` reads an empty list as
            an honest "nothing to compare", which is what it is here.
          */}
          <FundInside facts={facts} owned={[]} />
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

      {/*
        THE QUESTIONS, IN THE READER'S OWN WORDS, AT THE FOOT.

        Every one of them is answered by a panel above, which is why this
        sits here rather than at the top: a block that restated the page
        before the page had made its case would be the summary of an
        argument nobody had read yet. Down here it is the plain sentence
        for somebody who scrolled and wants it said once more without the
        tables, and it is the block a search engine reads as the page's
        answer to the question that brought them.
      */}
      {asked.length > 0 && (
        <Panel>
          <PanelHeader
            title={`Questions people ask about ${ticker}`}
            subtitle="Each of these is answered by one of the panels above. This is the same answer in one paragraph."
            icon={<HelpCircle className="h-4 w-4" />}
          />
          <div className="flex flex-col gap-6">
            {asked.map((q) => (
              <div key={q.id} className="flex flex-col gap-2">
                <h3 className="font-heading text-base font-semibold tracking-[-0.02em] text-foreground">
                  {q.question}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {q.answer}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <WidgetErrorBoundary name="Sources">
        <CompanySources articles={page.articles} sources={page.sources} />
      </WidgetErrorBoundary>

      {neighbours.length > 0 && group && (
        <Panel>
          <PanelHeader
            title={group.title}
            subtitle={group.blurb}
          />
          <div className="flex flex-wrap items-center gap-2">
            {neighbours.map((t) => (
              <Link
                key={t}
                href={researchHref(t)}
                className="rounded-md border border-border px-3 py-1.5 font-mono text-sm tabular-nums text-muted-foreground transition hover:bg-hover hover:text-foreground"
              >
                {cashtag(t)}
              </Link>
            ))}
            <Link
              href="/research"
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground underline transition hover:text-foreground"
            >
              Every company we cover
            </Link>
          </div>
        </Panel>
      )}

      {/*
        The one panel that sells anything, and it comes after the page has
        already done the reader a favour. What it promises is what the app
        actually does with the company they were just reading about, and
        the link is to the app rather than to a pricing page.
      */}
      <Panel>
        <PanelHeader
          title={`Put ${ticker} next to what you already own`}
          subtitle={`This page is one company. ${PRODUCT_NAME} is the same reading of your whole portfolio: on the day it falls, whether the market had a bad week or something actually happened at a company you own.`}
        />
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
            <li>
              What buying {ticker} would do to your mix, in your own money,
              before you buy it.
            </li>
            <li>
              A price ladder you set yourself, and a note when the price
              reaches one of your own levels.
            </li>
            <li>
              One email a week saying how the week went and which of your
              holdings moved.
            </li>
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild>
              <Link href="/login">Open {PRODUCT_NAME}</Link>
            </Button>
            {/*
              Somebody who already has an account and followed a link into
              this page wants the room with their own holdings in it, and
              the app answers `/stock/<ticker>` for exactly that.
            */}
            <Link
              href={companyHref(ticker)}
              className="text-sm text-muted-foreground underline hover:text-foreground"
            >
              Already signed in? Open {ticker} with your holdings
            </Link>
          </div>
          <MicroLabel>{ADVICE_DISCLAIMER_SHORT}</MicroLabel>
        </div>
      </Panel>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Every number above came from a public feed and can be checked at the
        links in Sources. {name} did not write this page and has nothing to
        do with it. {PRODUCT_NAME} is not an adviser and none of this is a
        recommendation. What you do about it is yours.
      </p>
    </ResearchChrome>
  );
}
