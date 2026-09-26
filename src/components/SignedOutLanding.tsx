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
  ArrowRight,
  CheckCircle2,
  Eye,
  MessagesSquare,
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
} from "@/lib/product";
import {
  SAMPLE_HOLDINGS,
  SAMPLE_NEWS_TICKER,
  sampleAllTimeFraction,
  sampleBiggestMarketMover,
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
      <div className="mx-auto w-full min-w-0 max-w-6xl">{children}</div>
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
  index,
  eyebrow,
  title,
  detail,
  className,
}: {
  /** Two digits, so the page reads as a numbered argument rather than a stack of banners. */
  index: string;
  eyebrow: string;
  title: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex max-w-3xl flex-col gap-5", className)}>
      <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
        <span className="text-primary">{index}</span>
        <span className="h-px w-8 bg-border" aria-hidden />
        {eyebrow}
      </p>
      <h2>
        <span className="block text-balance font-heading text-[2rem] font-semibold leading-[1.04] tracking-[-0.036em] text-foreground sm:text-5xl">
          {title}
        </span>
      </h2>
      {detail ? (
        <p className="max-w-xl text-balance text-lg leading-snug text-muted-foreground sm:text-xl">
          {detail}
        </p>
      ) : null}
    </div>
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
/*
  "Eight of your eight" reads as a template. When every company fell, which
  is the made-up day's shape, the sentence says all of them.
*/
const FALLING_LINE =
  sampleFallingCount() === SAMPLE_HOLDINGS.length
    ? `All ${HELD} of your companies are down`
    : `${FALLING} of your ${HELD} companies are down`;
const BIGGEST = sampleBiggestMarketMover();
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
export function SampleBriefing({
  onLookAround,
}: {
  onLookAround?: () => void;
} = {}) {
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
      {/*
        * The invitation sits on the thing it opens, and on the card's own
        * footnote row rather than in its header.
        *
        * It was a text link under the sign-in buttons, a third row of small
        * type in a stack that already had two. In the header it cost the
        * company's own name, which truncated at 360 and 390. Down here the
        * row already ran the full width, so the action is free and still
        * reads as an action rather than as more fine print.
        */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 text-left text-xs leading-relaxed text-muted-foreground">
          The holdings on this card are made up. The prices are real, from the
          same place a signed-in reader gets them.
        </p>
        {onLookAround ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onLookAround}
            className="h-8 shrink-0 gap-1.5 rounded-lg px-3 text-sm font-medium"
          >
            Look around
            <ArrowRight className="size-3.5" aria-hidden />
          </Button>
        ) : null}
      </div>
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
        there was no news about the company. Switch it to a news day and a
        fall of its own reads Thesis watch, because {NEWS_COMPANY} told
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
    a: "Eleven days since you started where the whole portfolio fell more than one in a hundred. Today is the third biggest of them. What these companies actually do did not change on any of the eleven.",
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
        {FALLING_LINE}. Only one of them had news
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
        about, it answers that {FALLING_LINE.toLowerCase()} and that
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
        index="02"
        eyebrow="What it does"
        title="A fall and real news look exactly the same in a list of red numbers."
        detail="One is worth your evening. Both cards below are live, so press them."
      />
      <div className="mt-8 grid items-start gap-4 md:grid-cols-2">
        <PulseStill />
        <MargusStill />
      </div>
    </Section>
  );
}

/*
  WHO IT IS FOR, SAID IN THE READER'S OWN WORDS RATHER THAN A PERSONA.

  The page used to explain what the product does for four screens before it
  said who it was for, and the answer decides whether anything else on the
  page is worth reading. Three sentences a reader recognises themselves in,
  and one saying plainly who should look elsewhere, which is the part that
  makes the other three believable.
*/
const FOR_YOU = [
  {
    lead: "You own a few companies,",
    rest: "maybe a fund, and you picked them for a reason.",
  },
  {
    lead: "You check the total",
    rest: "more often than you would admit.",
  },
  {
    lead: "You would rather understand it",
    rest: "than trade it, in plain words.",
  },
] as const;

function WhoItsFor() {
  return (
    <Section>
      <SectionHead
        index="01"
        eyebrow="Who it is for"
        title="For people who own shares. Not people who trade them."
      />
      <div className="card-sheen glass mt-8 flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border md:flex-row md:divide-x md:divide-y-0">
        {FOR_YOU.map((line, i) => (
          <div key={line.lead} className="flex flex-1 flex-col gap-6 p-6 sm:p-7">
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="text-balance text-xl leading-snug tracking-[-0.01em] text-muted-foreground">
              <span className="text-foreground">{line.lead}</span> {line.rest}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
        Not for day trading, tips or being told what to buy. There is no buy
        button and there never will be.
      </p>
    </Section>
  );
}

/*
  HOW IT COMPARES, WITH THE ROWS IT LOSES LEFT IN.

  A comparison table that this app wins on every row is an advert, and a
  reader can tell. Two rows here go the other way on purpose: it does not
  connect to your account, and free prices run a few minutes behind. Both
  are true, both are what somebody weighing this against their broker
  actually wants to know, and leaving them in is what makes the rows it does
  win worth believing.

  The two other columns are kinds of product, never named ones, and every
  claim about them is hedged to what is true of most of them ("rarely",
  "often"), because a claim about a named competitor is one somebody else
  gets to argue with.
*/
const COMPARE_COLUMNS = ["Your broker's app", "A portfolio tracker", "Upside Lab"] as const;

const COMPARE_ROWS: readonly {
  what: string;
  cells: readonly [string, string, string];
  /** True where this app is plainly the better answer. */
  ours: boolean;
}[] = [
  {
    what: "Why each company moved today",
    cells: ["Rarely", "Rarely", "Every company, every day"],
    ours: true,
  },
  {
    what: "The market, or the company's own news",
    cells: ["Not said", "Not said", "One line each"],
    ours: true,
  },
  {
    what: "Plain English",
    cells: ["Rarely", "Sometimes", "Every word explained on tap"],
    ours: true,
  },
  {
    what: "A letter about your own week",
    cells: ["No", "Sometimes", "Every Sunday"],
    ours: true,
  },
  {
    what: "What your portfolio is worth",
    cells: ["To the cent", "Yes", "Prices a few minutes behind"],
    ours: false,
  },
  {
    what: "Connects to your account",
    cells: ["It is your account", "Often", "No. You add holdings once"],
    ours: false,
  },
  {
    what: "What it costs",
    cells: ["Free with the account", "Often a subscription", "Free, every feature"],
    ours: true,
  },
];

function Compare() {
  return (
    <Section>
      <SectionHead
        index="03"
        eyebrow="How it compares"
        title={BROKER_ANSWER}
        detail="Your broker holds the money and adds it up to the cent. Why the number moved is left to you."
      />
      <div className="card-sheen glass mt-8 overflow-hidden rounded-2xl border border-border">
        {/* Laptop: a real table, with this app's column lit. */}
        <table className="hidden w-full table-fixed border-collapse text-left md:table">
          <thead>
            <tr className="border-b border-border">
              <th className="w-[28%] px-5 py-4" aria-label="What it does" />
              {COMPARE_COLUMNS.map((col, i) => (
                <th
                  key={col}
                  scope="col"
                  className={cn(
                    "px-5 py-4 font-mono text-xs font-medium uppercase tracking-[0.12em]",
                    i === 2 ? "bg-foreground/[0.04] text-primary" : "text-muted-foreground"
                  )}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row) => (
              <tr key={row.what} className="border-b border-border/60 last:border-0">
                <th scope="row" className="px-5 py-4 text-base font-medium text-foreground">
                  {row.what}
                </th>
                {row.cells.map((cell, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-5 py-4 text-base",
                      i === 2
                        ? cn(
                            "bg-foreground/[0.04]",
                            row.ours ? "font-medium text-foreground" : "text-muted-foreground"
                          )
                        : "text-muted-foreground"
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/*
          Phone: one row per question, this app's answer first and loudest,
          the two others under it. Four columns do not fit a phone, and a
          table that scrolls sideways hides the column that matters.
        */}
        <ul className="divide-y divide-border md:hidden">
          {COMPARE_ROWS.map((row) => (
            <li key={row.what} className="flex flex-col gap-2 px-5 py-4">
              <p className="text-base font-medium text-foreground">{row.what}</p>
              <p className={cn("text-base", row.ours ? "text-primary" : "text-muted-foreground")}>
                {row.cells[2]}
              </p>
              <p className="text-sm text-muted-foreground">
                Broker: {row.cells[0]}. Tracker: {row.cells[1]}.
              </p>
            </li>
          ))}
        </ul>
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
      "Invite a partner or a parent. You both own it and see all of it, what each of you paid included.",
  },
  {
    icon: MessagesSquare,
    title: "Or show a circle, without what you paid",
    detail:
      "Everybody sees what you hold and how it has gone. What you paid for it, and so whether you are up or down, stays yours.",
  },
  {
    icon: ShieldCheck,
    title: "Nobody is added for you",
    detail:
      "Invite-only. Signing in never puts you in one, and nothing is shared until you share it.",
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
        index="04"
        eyebrow="Circle"
        title="A bad week is easier with someone you know."
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
              <c.icon className="mt-1 size-5 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0 flex flex-col gap-1">
                <h3 className="text-base text-foreground">{c.title}</h3>
                <p className="text-base leading-snug text-muted-foreground">
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

/**
 * What it costs and what happens to your holdings, as a section like every
 * other one on this page.
 *
 * It used to be a closing ask: the hero's own headline and sign-in buttons
 * again, the three ways in, and then the price and the trust list as loose
 * left-aligned text hanging under a hairline with the consent sentence at
 * the bottom of it. Two faults. The page asked twice for the same press,
 * which on a page this short is one screen of scrolling apart, and the one
 * block a reader who has decided still needs, what it costs and what
 * happens to what they paste in, was the only block on the page that was
 * not a section with an eyebrow, a headline and a panel. It read as fine
 * print because it was set as fine print.
 *
 * So it is `SectionHead` plus one panel with two halves, which is exactly
 * what `NotYourBroker` above it is, and the consent sentence moved to the
 * footer where a legal line belongs. The hero's sign-in is the only one.
 */
function Closing({ busy, err, onSignIn }: Pick<HeroProps, "busy" | "err" | "onSignIn">) {
  return (
    <Section>
      <SectionHead
        index="05"
        eyebrow="What it costs"
        title={SIGNIN_PRICE}
        detail={SIGNIN_PRICE_NOTE}
      />
      {/*
        The last thing on the page is the thing to do. It used to be two
        lists and no button, so a reader convinced by the end of the page
        had to scroll back up three screens to find a way in.
      */}
      <div className={cn(BOX, NESTED_PAD, "mt-8 grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
        <div className="flex flex-col gap-5">
          <p className="text-balance font-heading text-2xl font-semibold leading-tight tracking-[-0.03em] text-foreground">
            Start with what you already own.
          </p>
          <SignInMethods
            googleBusy={busy}
            onGoogle={onSignIn}
            error={err}
            align="start"
          />
        </div>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <MicroLabel>What happens to your holdings</MicroLabel>
            <ul className="flex flex-col gap-2.5">
              {SIGNIN_TRUST.map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-base leading-snug text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <MicroLabel>Also inside</MicroLabel>
            <p className="text-base leading-relaxed text-muted-foreground">
              {ALSO_INSIDE.join(". ")}.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}

/*
  The rest of the app, as three things rather than one sentence listing
  three things. It was the tail of the closing ask; it is the second half
  of the last panel now, which is the only place left that a reader who has
  read the page and not yet pressed anything is still looking.
*/
const ALSO_INSIDE = [
  "The Sunday letter, in plain English",
  "A what-if for every holding",
  "Where you are concentrated",
] as const;

/**
 * Who is behind this, where the data sits, and the legal line.
 *
 * The consent sentence lives here rather than under a button, because it
 * is the one block on the page nobody reads before acting and everybody
 * looks for afterwards. It stays off the first screen deliberately: the
 * hero is the invitation, and three lines of small type under the button
 * is what made the top of this page read as fine print once already.
 */
function Footer({ minAge }: { minAge: number }) {
  return (
    <footer className="px-6 pb-[max(6rem,env(safe-area-inset-bottom))] pt-4">
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-8 border-t border-border pt-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
          <div className="flex min-w-0 flex-col gap-3">
            <UpsideLogo variant="icon" className="text-base" />
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              Made in {LEGAL_CITY} by {LEGAL_OPERATOR}. Your holdings are stored
              in the European Union.
            </p>
          </div>
          {/*
            * A real `nav`, so the links are a landmark rather than a
            * paragraph that happens to contain anchors. No rule at rest
            * and the accent on hover: five underlined links in a row is a
            * band of broken hairlines across the quietest part of the page.
            */}
          <nav aria-label="Footer" className="min-w-0">
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground sm:justify-end">
              {/*
                The way into the public research pages, and the only link to
                them from the front door. A section reachable only from a
                sitemap is a section a crawler visits once a quarter; one
                linked from the home page is part of the site.
              */}
              <li>
                <Link href="/research" className={FOOTER_LINK}>
                  Research
                </Link>
              </li>
              <li>
                <Link href="/terms" className={FOOTER_LINK}>
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/privacy" className={FOOTER_LINK}>
                  Privacy
                </Link>
              </li>
              <li>
                <a href={`mailto:${PRODUCT_SUPPORT_EMAIL}`} className={FOOTER_LINK}>
                  {PRODUCT_SUPPORT_EMAIL}
                </a>
              </li>
              <li>
                <a
                  href={FUND_X_URL}
                  className={FOOTER_LINK}
                  rel="noreferrer"
                  target="_blank"
                >
                  @{FUND_X_HANDLE}
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <p className="border-t border-border pt-6 text-xs leading-relaxed text-muted-foreground">
          By continuing you confirm you are {minAge} or older and agree to the{" "}
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
    </footer>
  );
}

const FOOTER_LINK =
  "underline-offset-4 transition-colors hover:text-foreground hover:underline";

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
/*
  THE HERO IS A THING TO DO, NOT A THING TO READ.

  The product turns on one distinction nobody can be told: a screen of red
  numbers looks the same whether the whole market fell or something happened
  at a company you own. So the first screen hands a visitor eight red tiles
  and asks which one had news. Finding it takes a few seconds and is the
  whole pitch, arrived at by the reader rather than asserted at them.

  It is the same made-up day as every other card on this page (Pulse, the
  Margus conversation) and as the walkthrough's first screen, so a reader
  who does both gets one answer rather than two.
*/
const NEWS_VERDICT = `${NEWS_COMPANY} told investors to expect less next year than they had been counting on. It fell on its own news. Everything else fell with the market.`;

function RedDayBoard({ onLookAround }: { onLookAround?: () => void }) {
  const [open, setOpen] = useState<string[]>([]);
  const found = open.includes(SAMPLE_NEWS_TICKER);
  return (
    <Panel className="@container h-auto gap-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className="signin-live-dot" aria-hidden />
            <MicroLabel>A made-up portfolio, today</MicroLabel>
          </span>
          <span className="font-heading text-2xl font-semibold tracking-tight tabular-nums text-foreground">
            {TOTAL_MONEY}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
          <span className="font-mono text-base tabular-nums text-loss">
            {DAY_MONEY}
          </span>
          <span className="font-mono text-xs tabular-nums text-loss">
            {DAY_PCT}
          </span>
        </span>
      </div>

      <p className="text-lg font-medium leading-snug text-pretty text-foreground" aria-live="polite">
        {found
          ? "Found it. That one is worth your evening."
          : "One of these companies had real news today. Tap to find it."}
      </p>

      <ul className="grid grid-cols-2 gap-2 @md:grid-cols-4">
        {SAMPLE_HOLDINGS.map((h) => {
          const turned = open.includes(h.ticker);
          const news = h.ticker === SAMPLE_NEWS_TICKER;
          const move = sampleDayFraction(h);
          return (
            <li key={h.ticker}>
              <button
                type="button"
                aria-pressed={turned}
                onClick={() =>
                  setOpen((prev) =>
                    prev.includes(h.ticker)
                      ? prev.filter((t) => t !== h.ticker)
                      : [...prev, h.ticker]
                  )
                }
                className={cn(
                  "card-sheen glass-well flex h-[5.5rem] w-full flex-col justify-between rounded-xl border px-3 py-2.5 text-left transition-[transform,border-color] duration-200 active:scale-[0.97] motion-reduce:transition-none",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  turned
                    ? news
                      ? "border-warning/70"
                      : "border-border"
                    : "border-transparent hover:border-loss/40"
                )}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-heading text-sm font-semibold text-foreground">
                    {cashtag(h.ticker)}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-xs tabular-nums",
                      move < 0 ? "text-loss" : "text-gain"
                    )}
                  >
                    {signedPercent(move, 1)}
                  </span>
                </span>
                {turned ? (
                  <span
                    key="turned"
                    className={cn(
                      "animate-in fade-in-0 zoom-in-95 text-sm font-medium leading-tight duration-200 motion-reduce:animate-none",
                      news ? "text-warning" : "text-muted-foreground"
                    )}
                  >
                    {news ? "Its own news" : "Just the market"}
                  </span>
                ) : (
                  <span className="truncate text-xs text-muted-foreground">
                    {h.company}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {found ? (
        <p className="animate-in fade-in-0 text-sm leading-relaxed text-muted-foreground duration-300 motion-reduce:animate-none">
          {NEWS_VERDICT} Upside Lab does this for every company you own, every
          morning.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
        <p className="min-w-[13rem] flex-1 text-xs leading-relaxed text-muted-foreground">
          A made-up day. In the sample the holdings are made up and the prices
          are real.
        </p>
        {onLookAround ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onLookAround}
            className="h-8 shrink-0 gap-1.5 rounded-lg px-3 text-sm font-medium"
          >
            Look around
            <ArrowRight className="size-3.5" aria-hidden />
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}

function HeroHybrid({
  busy,
  err,
  onSignIn,
  onLookAround,
  notice,
}: HeroProps) {
  return (
    <section className="relative min-h-[calc(100svh-9rem)] px-6 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))] sm:pb-14 landing-hero">
      <div className="mx-auto w-full min-w-0 max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <UpsideLogo variant="icon" className="text-lg" />
          {onLookAround ? (
            <button
              type="button"
              onClick={onLookAround}
              className="touch-target inline-flex items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Look around first
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
        {notice}

        <div className="mt-10 grid items-center gap-10 sm:mt-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
          <div className="flex min-w-0 flex-col items-start text-left">
            <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
              <TrendingDown className="size-3.5 text-loss" aria-hidden />
              Your portfolio, on a red day
            </p>
            <h1 className="mt-5">
              <span className="block text-balance font-heading text-[2.75rem] font-semibold leading-[1] tracking-[-0.042em] text-foreground sm:text-[4rem] xl:text-[4.75rem]">
                Everything is red.
                <span className="block text-muted-foreground">
                  Was it you, or the market?
                </span>
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-lg leading-snug text-muted-foreground sm:text-xl">
              Upside Lab reads every company you own, every day, and tells you
              in plain English which falls were news and which were just the
              market.
            </p>
            <div className="mt-8 w-full max-w-sm">
              <SignInMethods
                googleBusy={busy}
                onGoogle={onSignIn}
                error={err}
                align="start"
              />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Free, every feature. Nothing to connect.
            </p>
          </div>

          <div
            data-scroll-cue-still
            className="landing-still w-full min-w-0"
          >
            <RedDayBoard onLookAround={onLookAround} />
          </div>
        </div>
      </div>

      <ScrollCue />
    </section>
  );
}

/* ------------------------------------------------------------------ page */

export function SignedOutLanding(props: HeroProps) {
  return (
    <main id="main" className="relative z-10 flex flex-1 flex-col">
      <HeroHybrid {...props} />
      <WhoItsFor />
      <Showcase />
      <Compare />
      <CircleSection />
      <Closing busy={props.busy} err={props.err} onSignIn={props.onSignIn} />
      <Footer minAge={props.minAge} />
    </main>
  );
}
