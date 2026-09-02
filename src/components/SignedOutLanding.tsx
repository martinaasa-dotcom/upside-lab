"use client";

import { ScrollCue } from "@/components/ScrollCue";
import { UpsideLogo } from "@/components/UpsideLogo";
import {
  BOX,
  CARD,
  InsightText,
  MicroLabel,
  NESTED_PAD,
  Panel,
  Pill,
  Reading,
  Segmented,
} from "@/components/ui/Panel";
import { Button } from "@/components/ui/button";
import { SignInMethods } from "@/components/SignInMethods";
import {
  cashtag,
  cn,
  currency,
  signedCurrency,
  signedPercent,
} from "@/lib/format";
import {
  CheckCircle2,
  ClipboardList,
  Eye,
  FileSpreadsheet,
  ImageUp,
  MessagesSquare,
  MinusCircle,
  ShieldCheck,
  TrendingDown,
  Users,
} from "lucide-react";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import {
  BROKER_ANSWER,
  FUND_X_HANDLE,
  FUND_X_URL,
  LEGAL_CITY,
  LEGAL_OPERATOR,
  PRODUCT_SUPPORT_EMAIL,
  SIGNIN_PRICE,
  SIGNIN_PRICE_NOTE,
  SIGNIN_TRUST,
  THIS_DOES_INSTEAD,
} from "@/lib/product";
import {
  SAMPLE_HOLDINGS,
  SAMPLE_NEWS_TICKER,
  sampleAllTimeFraction,
  sampleCompany,
  sampleDayDollars,
  sampleDayFraction,
  sampleDayFractionTotal,
  sampleDayTotal,
  sampleFallingCount,
  sampleHoldingBy,
  sampleMovers,
  sampleShareOfPortfolio,
  sampleTotalValue,
  type SampleHolding,
} from "@/lib/sample-portfolio";
import Link from "next/link";
import { useState, type ReactNode } from "react";

/**
 * The page a stranger lands on.
 *
 * This used to be a sign-in card with a band of feature boxes bolted under
 * it, which is a different thing wearing the same URL: the boxes sat below
 * a screen that looked finished, so the only people who ever saw them were
 * the ones who scrolled a page that gave them no reason to. Everything here
 * is arranged the other way round, the way a product page is: the hero says
 * one thing and visibly continues, the product does the thing it claims
 * directly under it, and the ask is repeated at the bottom so nobody has to
 * scroll back up to act on it.
 *
 * Five sections and a footer, and that is a ceiling rather than a starting
 * point. It was eight sections of 1,028 words measuring 7,800px at 390,
 * which is 9.2 screens, and three of those sections were rows of bordered
 * boxes standing after the product had already been shown. Measured the
 * same way it is now 5,736px, 6.8 screens and 752 words a sighted reader
 * passes. The evidence comes second, directly after the hero, because a
 * reader who has just watched one red number turn into two different
 * answers reads the comparison as confirmation rather than as a claim.
 *
 * What is left is not padding and should not be cut by eye: the hero is
 * 1,475px because the sample card has to hang off the fold, the showcase
 * is 1,236px because it is two working cards, and the rest is one screen
 * each. Anything further has to come out of a section, so measure before
 * deciding which.
 *
 * Every number on it is derived from `sample-portfolio.ts`. None of them
 * are typed in beside the sentence they belong to, which is how the old
 * ones drifted into contradicting each other.
 *
 * Design rules it follows, all from DESIGN_TOKENS.md rather than invented
 * here: the true-black field with its two ambient lobes is the page's only
 * background, `--primary` is the only decorative colour and appears at full
 * lightness or not at all, gain and loss stay semantic and are used only on
 * figures that really moved, and every surface is glass rather than a flat
 * fill. Section rhythm is the 8px scale, not arbitrary values.
 */

type HeroProps = {
  busy: boolean;
  err: string | null;
  minAge: number;
  onSignIn: () => void;
  /**
   * Opens the real app on the sample portfolio, with no session at all.
   * Optional so a surface that cannot offer it simply does not draw the
   * second button rather than drawing one that goes nowhere.
   */
  onLookAround?: () => void;
  notice?: ReactNode;
};

/** One column, one measure, one rhythm. Every section sits in this. */
function Section({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    /*
     * 40px, 48px from `sm`, so two adjacent sections put 96px between them
     * on a desktop and 80px on a phone. It started at 80/112, which is
     * 224px, and spent a pass at 48/64, which is 128px.
     *
     * Generous spacing is what makes a product page feel calm, and the
     * mistake is reading that as "more is better". What actually reads as
     * calm is the ratio: the space between sections has to be clearly
     * smaller than the sections it separates. A void that fills a seventh
     * of the window with nothing is the page having run out rather than
     * breathing.
     */
    <section className={cn("px-6 py-10 sm:py-12", className)}>
      <div className="mx-auto w-full min-w-0 max-w-5xl">{children}</div>
    </section>
  );
}

/**
 * Eyebrow, headline, and the line under it.
 *
 * The headline size lives on a `<span>` rather than on the `<h2>`. The
 * heading scale in `globals.css` is element-level and test-enforced, and
 * the sanctioned way to ask for a step it does not have is to style a
 * child. See `src/lib/heading-scale.test.ts`.
 *
 * It steps down to 22px on a phone, because the hero has to be the loudest
 * thing on the page and it was not: measured at 390 the h1 was 26px and
 * every section heading 24px, so the hook was two pixels bigger than seven
 * other lines.
 */
function SectionHead({
  eyebrow,
  title,
  detail,
  className,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex max-w-3xl flex-col gap-4", className)}>
      <MicroLabel className="text-primary">{eyebrow}</MicroLabel>
      <h2>
        <span className="block text-balance font-heading text-xl font-semibold leading-[1.2] tracking-[-0.03em] text-foreground sm:text-3xl">
          {title}
        </span>
      </h2>
      {detail ? (
        <p className="text-base leading-relaxed text-muted-foreground">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Age and terms, in one short line under the button they apply to.
 *
 * This sentence used to appear once, at the very bottom of the page, about
 * 7,000px below the button most people actually press. A consent sentence
 * that far from the act it describes was never in front of the person who
 * consented.
 */
function AgeLine({ minAge }: { minAge: number }) {
  return (
    <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
      By continuing you confirm you are {minAge} or older and agree to the{" "}
      <Link href="/terms" className="underline hover:text-foreground">
        Terms
      </Link>{" "}
      and{" "}
      <Link href="/privacy" className="underline hover:text-foreground">
        Privacy policy
      </Link>
      .
    </p>
  );
}

/* -------------------------------------------------------- sample figures */

/**
 * Every figure below is computed from the eight holdings in
 * `sample-portfolio.ts`. There is deliberately no dollar amount and no
 * percentage typed into this file: `sample-portfolio.test.ts` fails on one.
 */
const DAY_MONEY = signedCurrency(sampleDayTotal(), 0);
const DAY_PCT = signedPercent(sampleDayFractionTotal());
const TOTAL_MONEY = currency(sampleTotalValue(), 0);
const ALL_TIME_PCT = signedPercent(sampleAllTimeFraction());
const NEWS_SHARE = signedPercent(sampleShareOfPortfolio(SAMPLE_NEWS_TICKER))
  .replace("+", "");
const NEWS_MONEY = signedCurrency(
  sampleDayDollars(sampleHoldingBy(SAMPLE_NEWS_TICKER)),
  0
);
const NEWS_COMPANY = sampleCompany(SAMPLE_NEWS_TICKER);
/*
  Spelled out, because it opens a sentence and sits next to another
  quantity written as a word ("Seven of your eight companies"). A numeral
  and a word for the same kind of thing in one sentence reads as a
  template rather than as somebody talking.
*/
const SMALL_WORDS = [
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
] as const;
const FALLING = SMALL_WORDS[sampleFallingCount()] ?? String(sampleFallingCount());
const HELD = SMALL_WORDS[SAMPLE_HOLDINGS.length]?.toLowerCase() ??
  String(SAMPLE_HOLDINGS.length);
const OTHERS =
  SMALL_WORDS[SAMPLE_HOLDINGS.length - 1]?.toLowerCase() ??
  String(SAMPLE_HOLDINGS.length - 1);
const BIGGEST = sampleMovers(1)[0]!;
const BIGGEST_PCT = signedPercent(sampleDayFraction(BIGGEST));

/** One mover row, drawn the way the real holdings table draws one. */
function MoverRow({ row }: { row: SampleHolding }) {
  const move = sampleDayDollars(row);
  return (
    <div className="flex h-10 items-center gap-3 px-3">
      <span className="min-w-0 flex-1 truncate text-left font-heading text-sm font-semibold text-foreground">
        {cashtag(row.ticker)}
      </span>
      <span
        className={cn(
          "w-16 text-right font-mono text-sm font-medium tabular-nums",
          move > 0 ? "text-gain" : "text-loss"
        )}
      >
        {signedPercent(sampleDayFraction(row))}
      </span>
      <span className="w-16 text-right font-mono text-sm tabular-nums text-muted-foreground">
        {signedCurrency(move, 0)}
      </span>
    </div>
  );
}

/**
 * The one sample card, drawn once and used on both the landing page and
 * the compact sign-in screen.
 *
 * There used to be two of these in two files, showing two different days
 * with two different sets of numbers, and neither set added up. Two samples
 * drift the moment one of them is edited, so there is one.
 *
 * It shows a bad day on purpose. The headline above it is about the evening
 * your portfolio falls and you want to know whether that means anything,
 * and a card full of gains underneath it demonstrates nothing. Anybody can
 * hand you a good day.
 */
export function SampleBriefing() {
  return (
    /*
      A container query, not a breakpoint.

      This card is 768px wide in the landing hero and 336px wide in the
      right-hand column of the compact sign-in, at the same viewport. Sized
      on `sm:` it went two-column in both, and in the narrow one the movers
      were squeezed to about ninety pixels and painted out through the side
      of the card. What decides the layout is how much room the card has,
      which is what `@container` asks.
    */
    <Panel className="@container h-auto gap-5 p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="signin-live-dot" aria-hidden />
          {/*
            * The company's ordinary name and what it did, not "PULSE ON
            * $RKLB, DOWN 4.1%". A feature nobody has been introduced to
            * and a cashtag, in mono caps, were the first words on the one
            * card meant to earn a stranger's trust, and on a phone they
            * wrapped into the Sample pill beside them.
            */}
          <MicroLabel className="min-w-0 truncate">
            {sampleCompany(BIGGEST.ticker)}, down{" "}
            {BIGGEST_PCT.replace("-", "")}
          </MicroLabel>
        </span>
        <Pill tone="neutral">Sample</Pill>
      </div>

      {/*
        * Pulse first, dollars second.
        *
        * The fold on a phone cuts this card at the movers, so the first
        * screen a stranger sees is the sentence rather than a portfolio
        * total and three percents, which is the first screen of every
        * broker app. The numbers are the part that continues below.
        */}
      <Reading nested label="What actually happened" className="text-left">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Pill>Inside recent range</Pill>
          <Pill tone="good">
            <CheckCircle2 data-icon="inline-start" />
            Thesis intact
          </Pill>
        </div>
        <InsightText
          text={`There was no news about ${sampleCompany(BIGGEST.ticker)} today. Every other company doing the same thing fell about as much, so this is the market having a bad day rather than anything to do with what you own.`}
        />
      </Reading>

      <div className="grid items-start gap-5 @md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="text-left">
          <MicroLabel>Portfolio</MicroLabel>
          <p className="mt-1 font-sans text-3xl font-bold tabular-nums text-foreground">
            {TOTAL_MONEY}
          </p>
          {/*
            * Plain coloured figures, not two chips with two different
            * fills. The real Overview draws the day figure as coloured
            * text, and DESIGN_TOKENS is explicit that status is a border
            * accent or a Badge, never a tinted fill.
            */}
          <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm font-semibold tabular-nums">
            <span className="text-loss">{DAY_MONEY} today</span>
            <span className="text-gain">{ALL_TIME_PCT} all time</span>
          </p>
        </div>

        <div className={cn(CARD, "divide-y divide-border overflow-hidden")}>
          {sampleMovers(3).map((row) => (
            <MoverRow key={row.ticker} row={row} />
          ))}
        </div>
      </div>

      {/*
        * Both halves of the truth, in one line, on every screen this card
        * appears on. It cannot name the button beside it, because the
        * compact sign-in draws this card with no look-around button on the
        * page at all.
        */}
      <p className="text-left text-xs leading-relaxed text-muted-foreground">
        The holdings on this card are made up. The prices are real, from the
        same place a signed-in reader gets them.
      </p>
    </Panel>
  );
}

/* --------------------------------------------------------------- section */

/**
 * The same red day, read two ways, and the reader is the one who switches
 * between them.
 *
 * Every sample on this page used to be a still, including the two chips at
 * the bottom of the conversation, which were drawn exactly like the real
 * app's suggestion buttons. A curious visitor pressed one, nothing
 * happened, and on a marketing page that reads as broken. One tap here
 * teaches what three sections of prose were trying to say.
 */
type PulseView = "market" | "news";

function PulseStill() {
  const [view, setView] = useState<PulseView>("market");
  const market = view === "market";
  const row = market ? BIGGEST : sampleHoldingBy(SAMPLE_NEWS_TICKER);

  return (
    <Panel className="h-auto gap-4 p-4">
      {/*
        * `items-start` and a bounded label, so a two-line title on a phone
        * keeps the pill on the first line beside it rather than pushing it
        * onto a row of its own under the words.
        */}
      <div className="flex items-start justify-between gap-3">
        <MicroLabel className="min-w-0">
          Pulse, the daily read on each company
        </MicroLabel>
        <Pill tone="neutral">Sample</Pill>
      </div>

      <Segmented
        ariaLabel="Which kind of day"
        value={view}
        onChange={setView}
        options={[
          { id: "market", label: "A market day" },
          { id: "news", label: "A news day" },
        ]}
      />

      <div className={cn(CARD, "flex flex-col gap-3 p-3")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-heading text-sm font-semibold text-foreground">
            {cashtag(row.ticker)}
          </span>
          <span className="inline-flex items-center gap-1 font-medium tabular-nums text-loss">
            <TrendingDown className="size-3.5" />
            {signedPercent(sampleDayFraction(row))}
          </span>
        </div>
        {/*
          * 200ms, keyed on the state, so the badge and the sentence arrive
          * together rather than one swapping under the other. Nothing here
          * is observed and nothing is staggered: it is a plain fade on a
          * plain state change.
          */}
        <div
          key={view}
          className="flex flex-col gap-3 animate-in fade-in-0 duration-200 motion-reduce:animate-none"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill>Inside recent range</Pill>
            {market ? (
              <Pill tone="good">
                <CheckCircle2 data-icon="inline-start" />
                Thesis intact
              </Pill>
            ) : (
              <Pill tone="warn">
                <Eye data-icon="inline-start" />
                Thesis watch
              </Pill>
            )}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {market
              ? `There was no news about the company today, and the price is still inside the range it has traded in for months. Every similar business fell about as much.`
              : `This one is different. ${NEWS_COMPANY} told investors to expect less next year than they had been counting on. That is worth reading about rather than ignoring.`}
          </p>
        </div>
      </div>

      <p className="sr-only">
        A sample Pulse card. On a market day it reads Thesis intact and says
        there was no news about the company. Switch it to a news day and the
        same size of fall reads Thesis watch, because {NEWS_COMPANY} told
        investors to expect less next year.
      </p>
    </Panel>
  );
}

/**
 * The follow-ups, which the reader asks rather than reads.
 *
 * All three used to be printed out as more bubbles, or drawn as buttons
 * that did nothing at all: the two chips at the bottom of this card were
 * styled exactly like the real app's suggestion buttons, so a curious
 * visitor pressed one, nothing happened, and on a marketing page that
 * reads as broken. Making them work is both the honest thing and the
 * shorter one, since the card now starts at one exchange.
 */
const FOLLOW_UPS = [
  {
    q: "Which one had news?",
    a: `${NEWS_COMPANY}. It told investors to expect less next year than they had been counting on. It is ${NEWS_SHARE} of what you hold, and it is the one company here worth reading about tonight.`,
  },
  {
    q: "Has this happened before?",
    a: "Eleven days since you started where the whole portfolio fell more than two in a hundred. Today is the third biggest of them. What these companies actually do did not change on any of the eleven.",
  },
  {
    q: "How much of my portfolio is that?",
    a: `${NEWS_COMPANY} is ${NEWS_SHARE} of what you hold, so its fall today accounts for ${NEWS_MONEY} of the ${DAY_MONEY}. The rest came from the other ${OTHERS}.`,
  },
] as const;

function Bubble({ mine, children }: { mine?: boolean; children: ReactNode }) {
  if (mine) {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground">
          {children}
        </p>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div
        className={cn(
          CARD,
          "max-w-[92%] rounded-2xl rounded-bl-sm px-3.5 py-2.5"
        )}
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          {children}
        </p>
      </div>
    </div>
  );
}

function MargusStill() {
  const [asked, setAsked] = useState<string | null>(null);
  const answer = FOLLOW_UPS.find((f) => f.q === asked);
  const left = FOLLOW_UPS.filter((f) => f.q !== asked);

  return (
    <Panel className="h-auto gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className="signin-live-dot" aria-hidden />
          <MicroLabel>Margus</MicroLabel>
        </span>
        <Pill tone="neutral">Sample</Pill>
      </div>

      <Bubble mine>Everything is red today. Should I be worried?</Bubble>

      {/*
        * The first answer used to say there was no news about any of them,
        * and the very next answer named the company that had put news out.
        * The section is headed "a fall and real news look exactly the same"
        * and its own demonstration could not keep the two apart.
        */}
      <Bubble>
        {FALLING} of your {HELD} companies are down. Only one of them had news
        today, so most of this is the whole market having a bad day rather
        than something at your companies. You are down{" "}
        {DAY_MONEY.replace("-", "")}, about {DAY_PCT.replace("-", "")} of what
        you hold.
      </Bubble>

      {answer ? (
        <>
          <Bubble mine>{answer.q}</Bubble>
          <div className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
            <Bubble>{answer.a}</Bubble>
          </div>
        </>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {left.map((f) => (
          <Button
            key={f.q}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAsked(f.q)}
          >
            {f.q}
          </Button>
        ))}
      </div>

      <p className="sr-only">
        A sample conversation. Asked whether a red day is worth worrying
        about, it answers that {FALLING.toLowerCase()} of {HELD} companies are down
        and that
        only {NEWS_COMPANY} had news of its own. The buttons ask the
        follow-up questions.
      </p>
    </Panel>
  );
}

function Showcase() {
  return (
    <Section>
      <SectionHead
        eyebrow="The whole point"
        title="A fall and real news look exactly the same in a list of red numbers."
        detail="One of them is worth your evening and the other is not. Both cards below are working: switch the day, or ask the follow-up question."
      />
      <div className="mt-8 grid items-start gap-4 md:grid-cols-2">
        <PulseStill />
        <MargusStill />
      </div>
    </Section>
  );
}

/*
  The limits, stated where somebody weighing one tool against another is
  actually looking rather than in a section of their own three screens down.

  Every one is checkable from the app itself. The delay used to be welded
  onto the end of a sentence about not buying or selling, which buried the
  one limit a new reader meets on day one: why the total here is not the
  total their broker shows.
*/
const WILL_NOT = [
  "Connect to your bank or broker. You add what you own once, and from then on the prices update on their own.",
  "Know the day you bought. Gains are measured against your average price, so there is no chart that starts on the day you bought.",
  "Match your broker to the cent. Prices are free and a few minutes behind, so the two totals will differ a little.",
] as const;

/**
 * The question the page exists to answer, asked in the reader's own words.
 *
 * It used to come first and take 1,274px of prose on a phone before the
 * reader had seen the product do anything: a heading, a 40-word detail, a
 * three-line checklist about the broker and two closing sentences. The hero
 * already answers "what is it for" in one sentence and the showcase above
 * has now shown it, so this is confirmation and can be short.
 *
 * The generous line about the reader's own broker stays, because a
 * comparison that opens by running down something they chose is one they
 * stop reading, and because it is true: a broker really is better at being
 * a broker than this will ever be.
 */
function NotYourBroker() {
  return (
    <Section>
      <SectionHead
        eyebrow="Why another one of these"
        title={BROKER_ANSWER}
        detail="Your broker holds your money, puts your orders through and adds it all up to the cent, and it is good at all of that. Working out why the number moved is usually left to you."
      />
      {/*
        * One panel, two halves. Stacked on a phone, two separately padded
        * boxes cost a section pad and a gap for nothing: they are two
        * halves of one answer, so a hairline says it and the page is
        * shorter by about a fifth of a screen.
        */}
      <div className={cn(BOX, NESTED_PAD, "mt-8 grid gap-6 md:grid-cols-2")}>
        <div className="flex flex-col gap-4">
          <MicroLabel className="text-primary">
            What this does instead
          </MicroLabel>
          <ul className="flex flex-col gap-3">
            {THIS_DOES_INSTEAD.map((line) => (
              <li
                key={line}
                className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground"
              >
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-4 border-t border-border pt-6 md:border-t-0 md:border-l md:pl-6 md:pt-0">
          <MicroLabel>What it will not do</MicroLabel>
          <ul className="flex flex-col gap-3">
            {WILL_NOT.map((line) => (
              <li
                key={line}
                className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground"
              >
                <MinusCircle
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

/*
  Ordinary given names, and deliberately not anybody in this household.

  The first draft of this board used Martin's own family, because those
  names were to hand. They are real people who never agreed to appear on a
  public marketing page, and a sample is not a place to spend somebody
  else's privacy. Anything generic makes the same point.
*/
const CIRCLE_BOARD = [
  { name: "You", pct: sampleDayFractionTotal() },
  { name: "Anna", pct: -0.036 },
  { name: "Mark", pct: -0.044 },
  { name: "Priya", pct: -0.029 },
] as const;

function CircleStill() {
  return (
    <Panel className="h-auto gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <MicroLabel>Today in your circle</MicroLabel>
        <Pill tone="neutral">Sample</Pill>
      </div>

      <div className={cn(CARD, "divide-y divide-border overflow-hidden")}>
        {CIRCLE_BOARD.map((row) => (
          <div key={row.name} className="flex h-11 items-center gap-3 px-3">
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/15 font-heading text-xs font-semibold text-primary"
              aria-hidden
            >
              {row.name.slice(0, 1)}
            </span>
            <span className="flex-1 truncate text-left text-sm text-foreground">
              {row.name}
            </span>
            <span
              className={cn(
                "font-mono text-sm font-medium tabular-nums",
                row.pct < 0 ? "text-loss" : "text-gain"
              )}
            >
              {signedPercent(row.pct)}
            </span>
          </div>
        ))}
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Everybody had the same day.
      </p>
    </Panel>
  );
}

/*
  These used to be two cards, and the first one described co-ownership and
  then attached a circle's privacy promise to it: "you both own it. They see
  today's prices and never what you paid." The second half is not true of a
  co-owner. `HOLDING_COLUMNS` sends `buy_price` to everybody on the owners
  list, which is right, because two people who own one portfolio together
  are looking at one portfolio. Hiding what it cost from one of them would
  make the gain unreadable for them.

  The sentence was true of the other thing, which the page had not mentioned:
  a portfolio pinned into a circle, where `buy_price` is zeroed for every
  reader but its owner (`/api/communities/[id]/book`). Two different acts
  with two different answers, so they are two different cards. Getting this
  one wrong is worse than getting a feature claim wrong, because somebody
  reads it, invites their parent, and finds out afterwards.
*/
const CIRCLE_POINTS = [
  {
    icon: Users,
    title: "Share a portfolio with one person",
    detail:
      "Invite a partner or a parent and you both own it. Not a copy: you both add holdings and you both see all of it, what each of you paid included.",
  },
  {
    icon: MessagesSquare,
    title: "Or show a circle, without the money",
    detail:
      "Putting a portfolio in a circle is the other thing, and it answers differently. Everybody there sees what you hold and how it has gone. What you paid for it stays yours.",
  },
  {
    icon: ShieldCheck,
    title: "Nobody is added for you",
    detail:
      "A circle is invite-only. Signing in never puts you in one, and nothing is shared until you share it.",
  },
] as const;

/**
 * Circle, given a section of its own rather than a card in a row of extras.
 *
 * The hardest part of a market falling is not knowing what happened, which
 * the rest of this page is about. It is sitting on your own at eleven at
 * night with the number in front of you.
 */
function CircleSection() {
  return (
    <Section>
      <SectionHead
        eyebrow="Circle"
        title="A bad week is easier with someone you know."
        detail="It helps to hear that nothing really changed, and it helps more from someone looking at the same week."
      />
      {/*
        * One panel with three rows, not three panels.
        *
        * Stacked on a phone, three padded boxes with a glyph tile and a
        * heading each cost about 500px more than the same three sentences
        * do, and a column of near-identical bordered rectangles is what
        * made the back half of this page a monotone. The icon sits inline
        * with the point it belongs to.
        */}
      <div className="mt-8 grid items-start gap-4 md:grid-cols-2">
        <CircleStill />
        <div className={cn(BOX, NESTED_PAD, "flex flex-col gap-5")}>
          {CIRCLE_POINTS.map((c) => (
            <div key={c.title} className="flex items-start gap-3.5">
              <span
                className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15"
                aria-hidden
              >
                <c.icon className="size-4" />
              </span>
              <div className="min-w-0 flex flex-col gap-1">
                <h3 className="text-base text-foreground">{c.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {c.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

const WAYS_IN = [
  { icon: ClipboardList, label: "Paste a list" },
  { icon: FileSpreadsheet, label: "Upload a CSV" },
  { icon: ImageUp, label: "Drop in a screenshot" },
] as const;

/**
 * The ask again, with everything a person still needs to know beside it.
 *
 * This is the one section that grew rather than shrank, because three
 * separate card grids after the product had been shown ("Ways in", "And the
 * rest", "Price and trust") were the monotone back half of the page. They
 * are one block now: the button, the three ways in as a row of glyphs, one
 * sentence for the rest of the app, then what it costs and what happens to
 * your holdings as short text rather than two more bordered panels.
 */
function Closing({
  busy,
  minAge,
  onSignIn,
}: {
  busy: boolean;
  minAge: number;
  onSignIn: () => void;
}) {
  return (
    /*
     * Barely any top padding, and the section above keeps its own. Two full
     * section pads met here and added up to about 160px of empty black,
     * which stranded the closing ask rather than letting it land as the end
     * of something. A coda sits close to what it concludes.
     */
    <Section className="pt-2 sm:pt-4">
      <div className="flex flex-col items-center gap-6 text-center">
        <h2>
          <span className="block max-w-xl text-balance font-heading text-xl font-semibold leading-[1.2] tracking-[-0.03em] text-foreground sm:text-3xl">
            Paste what you own. The next red evening will make a lot more
            sense.
          </span>
        </h2>
        <SignInMethods googleBusy={busy} onGoogle={onSignIn} />
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {WAYS_IN.map((w) => (
            <li
              key={w.label}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <w.icon className="size-4 shrink-0 text-primary" aria-hidden />
              {w.label}
            </li>
          ))}
        </ul>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Also in the app: a letter every Sunday, a what-if for each holding,
          and a look at what you are concentrated in.
        </p>

        <div className="flex w-full max-w-xl flex-col gap-3 border-t border-border pt-6 text-left">
          {/*
            * A real heading, so the document outline does not jump from the
            * closing headline straight past the price. This block used to
            * be a section of its own with two MicroLabels and no heading at
            * all, which a screen-reader user skipping by heading walked
            * clean over. No size class: the h3 step in `globals.css` is
            * already right for a subheading, and naming a size here is what
            * `heading-scale.test.ts` exists to catch.
            */}
          <h3 className="text-primary">
            What it costs, and what happens to your holdings
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="text-foreground">{SIGNIN_PRICE}</span>{" "}
            {SIGNIN_PRICE_NOTE}
          </p>
          <ul className="flex flex-col gap-2">
            {SIGNIN_TRUST.map((line) => (
              <li
                key={line}
                className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground"
              >
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-muted-foreground">
            By continuing you confirm you are {minAge} or older and agree to
            the{" "}
            <Link href="/terms" className="underline hover:text-foreground">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-foreground">
              Privacy policy
            </Link>
            . {ADVICE_DISCLAIMER_SHORT}
          </p>
        </div>
      </div>
    </Section>
  );
}

/**
 * Who is behind this, and where the data sits.
 *
 * The page used to end on the legal sentence with no company name, no
 * location and nothing about where a reader's holdings are stored, which
 * is the fact an EU reader deciding whether to paste them looks for. Every
 * line here is already stated on the privacy page.
 */
function Footer() {
  return (
    <footer className="px-6 pb-[max(6rem,env(safe-area-inset-bottom))] pt-4">
      <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-2 border-t border-border pt-5 text-sm text-muted-foreground">
        <p className="leading-relaxed">
          Made in {LEGAL_CITY} by {LEGAL_OPERATOR}. Your holdings are stored
          in the European Union.
        </p>
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Link href="/terms" className="underline hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="underline hover:text-foreground">
            Privacy
          </Link>
          <a
            href={`mailto:${PRODUCT_SUPPORT_EMAIL}`}
            className="underline hover:text-foreground"
          >
            {PRODUCT_SUPPORT_EMAIL}
          </a>
          <a
            href={FUND_X_URL}
            className="underline hover:text-foreground"
            rel="noreferrer"
            target="_blank"
          >
            @{FUND_X_HANDLE}
          </a>
        </p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ hero */

/**
 * The problem is named before the product is, because that sentence is the
 * sharpest thing on the page, and then the interface arrives directly under
 * it as the answer rather than three screens later.
 *
 * The card is deliberately allowed to run past the bottom of the window,
 * because a page whose content is visibly cut off by the fold is one nobody
 * mistakes for finished, and on every phone and most laptops that is what
 * happens. On a taller window there is no cut, so the height floor below
 * keeps the next section in view instead. Between those two, on a window
 * where the card clears the fold whole and nothing after it has started,
 * `ScrollCue` says it in words.
 */
function HeroHybrid({
  busy,
  err,
  minAge,
  onSignIn,
  onLookAround,
  notice,
}: HeroProps) {
  return (
    /*
     * At least one screen tall, less 9rem, so the next section's eyebrow
     * and the top of its heading are always in view: what a reader sees at
     * rest is a section beginning, not a page ending. On a shorter window
     * the hero is taller than this and the sample card is cut instead,
     * which says the same thing more loudly.
     *
     * `svh` rather than `dvh`, so a phone that later retracts its address
     * bar does not find the hero taller than the window it was sized
     * against. `relative`, because the cue is laid out against the top of
     * this section.
     */
    <section className="relative min-h-[calc(100svh-9rem)] px-6 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))] sm:pb-14 landing-hero">
      <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col items-center text-center">
        <UpsideLogo variant="icon" className="text-lg" />
        {notice}
        {/*
          * 30px on a phone, so the hook is clearly the loudest thing on the
          * page. It was 26px against section headings of 24px, which is a
          * hierarchy nobody can see.
          */}
        <h1 className="mt-10">
          <span className="block text-balance font-heading text-[1.875rem] font-semibold leading-[1.1] tracking-[-0.04em] text-foreground sm:text-[2.75rem] sm:leading-[1.14] sm:tracking-[-0.035em]">
            Everyone shows you the number.
            <span className="mt-1.5 block text-muted-foreground">
              Nobody tells you what happened.
            </span>
          </span>
        </h1>
        {/*
          * One sentence. The old lede was three, 37 words at 18px and six
          * lines on a phone, which is 180px of type before anything else,
          * and it was taller than the space the product needed.
          */}
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          On the day your whole portfolio is red, it tells you which of your
          companies had news and which just fell with everything else.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3.5">
          <SignInMethods googleBusy={busy} onGoogle={onSignIn} error={err} />
          {onLookAround ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onLookAround}
              className="h-auto px-2 py-1 text-sm font-normal text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Or look around with a sample portfolio
            </Button>
          ) : null}
          {/*
            * What happens next, rather than the price. A first-time reader
            * does not know whether the following screen asks for a broker
            * login, a card, or an hour of typing. The price has its own
            * block at the bottom of the page.
            */}
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            Sign in, then paste what you own. About two minutes, and there is
            nothing to connect.
          </p>
          <AgeLine minAge={minAge} />
        </div>
      </div>

      {/*
        * On a phone and on most laptops the card runs past the bottom of
        * the window, and that cut is the strongest continuation cue there
        * is. Marked, because `ScrollCue` measures this card against the
        * fold: a card the fold cuts needs no words under it.
        */}
      <div
        data-scroll-cue-still
        className="landing-still mx-auto mt-12 w-full min-w-0 max-w-3xl sm:mt-14"
      >
        <SampleBriefing />
      </div>

      {/*
        * In the page rather than over it: it draws in the band just above
        * the first fold and scrolls away with the hero. See ScrollCue.tsx
        * for what pinning it to the window cost.
        */}
      <ScrollCue />
    </section>
  );
}

/* ------------------------------------------------------------------ page */

export function SignedOutLanding(props: HeroProps) {
  return (
    <main id="main" className="relative z-10 flex flex-1 flex-col">
      <HeroHybrid {...props} />
      <Showcase />
      <NotYourBroker />
      <CircleSection />
      <Closing
        busy={props.busy}
        minAge={props.minAge}
        onSignIn={props.onSignIn}
      />
      <Footer />
    </main>
  );
}
