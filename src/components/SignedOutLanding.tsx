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
} from "@/components/ui/Panel";
import { SignInMethods } from "@/components/SignInMethods";
import { cn } from "@/lib/format";
import {
  CheckCircle2,
  ClipboardList,
  Eye,
  FileSpreadsheet,
  ImageUp,
  LayoutGrid,
  LineChart,
  Mail,
  MessagesSquare,
  ShieldCheck,
  MinusCircle,
  TrendingDown,
  Users,
} from "lucide-react";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import {
  BROKER_ALREADY_DOES,
  BROKER_ANSWER,
  PRODUCT_SUPPORT_EMAIL,
  SIGNIN_PRICE,
  SIGNIN_PRICE_NOTE,
  SIGNIN_TRUST,
  THIS_DOES_INSTEAD,
} from "@/lib/product";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The page a stranger lands on.
 *
 * This used to be a sign-in card with a band of feature boxes bolted under
 * it, which is a different thing wearing the same URL: the boxes sat below
 * a screen that looked finished, so the only people who ever saw them were
 * the ones who scrolled a page that gave them no reason to. Everything here
 * is arranged the other way round, the way a product page is: the hero says
 * one thing and visibly continues, each section afterwards makes a single
 * point with the real interface next to it, and the ask is repeated at the
 * bottom so nobody has to scroll back up to act on it.
 *
 * It lives in its own file because `SignInGate` is about authentication and
 * this is about persuasion, and the two were starting to argue inside one
 * component.
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
  notice?: ReactNode;
};

/**
 * Groups a heading with the cards it heads, so they stay one block in the
 * markup. It used to fade the block in as it approached the fold, and that
 * is exactly the pop-in this page cannot have: script would hide a section
 * that HTML had already painted, then show it again on scroll. Older
 * WebKit also skipped painting a translated layer until it scrolled
 * on-screen. Everything here is drawn in the first HTML, finished.
 */
function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}

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
     * smaller than the sections it separates. These sections are short, an
     * eyebrow and a line and a row of three cards, roughly 250px tall. At
     * 224px of gap the page was very nearly half emptiness and every
     * measured void between two rows of cards read as the page having run
     * out rather than breathing.
     *
     * 128px was still the tallest empty band on the page, measured, and it
     * is the band a reader lands in when one flick of a wheel happens to
     * stop on a boundary. A void that fills a seventh of the window with
     * nothing is the second half of why this page read as finished when it
     * was not. Against sections of 435px to 642px, 96px is comfortably the
     * smaller number and the ratio the note above is about still holds.
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
        <span className="block text-balance font-heading text-2xl font-semibold leading-[1.15] tracking-[-0.03em] text-foreground sm:text-3xl">
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

/** Age, terms and the advice disclaimer, in one sentence. */
function LegalLine({ minAge }: { minAge: number }) {
  return (
    <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
      By continuing you confirm you are {minAge} or older and agree to the{" "}
      <Link href="/terms" className="underline hover:text-foreground">
        Terms
      </Link>{" "}
      and{" "}
      <Link href="/privacy" className="underline hover:text-foreground">
        Privacy policy
      </Link>
      . {ADVICE_DISCLAIMER_SHORT} Help:{" "}
      <a
        href={`mailto:${PRODUCT_SUPPORT_EMAIL}`}
        className="underline hover:text-foreground"
      >
        {PRODUCT_SUPPORT_EMAIL}
      </a>
      .
    </p>
  );
}

/* ------------------------------------------------------------------ hero */



/*
  A bad day, on purpose.

  This used to be a green day: three risers and a portfolio up $4,180. It
  was the wrong day to show. The headline above it is about the evening
  your portfolio falls and you want to know whether that means anything,
  and a card full of gains underneath it is a card demonstrating nothing.
  Anybody can hand you a good day. The whole claim of this product is what
  it says to you on a bad one, so the sample is a bad one and the sentence
  above the numbers is the answer.
*/
const SAMPLE_MOVERS = [
  { ticker: "RKLB", pct: "-4.1%", dollar: "-$1,540", up: false },
  { ticker: "NVDA", pct: "-3.6%", dollar: "-$2,180", up: false },
  { ticker: "AMZN", pct: "+0.2%", dollar: "+$90", up: true },
] as const;

/* -------------------------------------------------------------- sections */

const WAYS_IN = [
  {
    icon: ClipboardList,
    title: "Paste it",
    detail: "One line per holding: ticker, shares, what you paid.",
  },
  {
    icon: FileSpreadsheet,
    title: "Upload a CSV",
    detail: "The file almost every broker will already export for you.",
  },
  {
    icon: ImageUp,
    title: "Drop in a screenshot",
    detail: "A picture of your holdings page. It reads the rows out of it.",
  },
] as const;

function WaysIn() {
  return (
    <Section>
      {/*
        * One `Reveal` around the whole section, heading and cards together.
        *
        * They used to be two, the cards on an 80ms delay. A row of cards is
        * what a heading is a heading *of*, and splitting them meant the
        * commonest thing a reader saw at a boundary was a title with a hole
        * under it where the row had not arrived yet. Anything that has to
        * be read as one thing is marked as one thing.
        */}
      <Reveal>
        <SectionHead
          eyebrow="Getting started"
          title="It starts with what you already own."
          detail="There is no broker login and nothing to connect. You put in what you own yourself, in whichever of these three ways is quickest."
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {WAYS_IN.map((w) => (
            <div
              key={w.title}
              className={cn(BOX, NESTED_PAD, "flex flex-col gap-3")}
            >
              <span
                className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15"
                aria-hidden
              >
                <w.icon className="size-4" />
              </span>
              <h3 className="text-foreground">{w.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {w.detail}
              </p>
            </div>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}


/** A Pulse verdict, drawn the way the real one is. */
function PulseStill() {
  return (
    <Panel className="h-auto gap-4 p-4" aria-hidden>
      <div className="flex items-center justify-between gap-3">
        <MicroLabel>Pulse</MicroLabel>
        <Pill tone="neutral">Sample</Pill>
      </div>

      <div className={cn(CARD, "flex flex-col gap-3 p-3")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-heading text-sm font-semibold text-foreground">
            $RKLB
          </span>
          <span className="inline-flex items-center gap-1 font-medium tabular-nums text-loss">
            <TrendingDown className="size-3.5" />
            -4.1%
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill>Inside recent range</Pill>
          <Pill tone="good">
            <CheckCircle2 data-icon="inline-start" />
            Thesis intact
          </Pill>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          There was no news about the company today, and the price is still
          inside the range it has traded in for months. Every similar
          business fell about as much.
        </p>
      </div>

      <div className={cn(CARD, "flex flex-col gap-3 p-3")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-heading text-sm font-semibold text-foreground">
            $MSFT
          </span>
          <span className="inline-flex items-center gap-1 font-medium tabular-nums text-loss">
            <TrendingDown className="size-3.5" />
            -3.4%
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill>Inside recent range</Pill>
          <Pill tone="warn">
            <Eye data-icon="inline-start" />
            Thesis watch
          </Pill>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          This one is different. The company told investors to expect less
          next year than they had been counting on. That is worth reading
          about rather than ignoring.
        </p>
      </div>
    </Panel>
  );
}

/** Two turns of a conversation. Enough to show the voice. */
function MargusStill() {
  return (
    <Panel className="h-auto gap-4 p-4" aria-hidden>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className="signin-live-dot" aria-hidden />
          <MicroLabel>Margus</MicroLabel>
        </span>
        <Pill tone="neutral">Sample</Pill>
      </div>

      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground">
          Everything is red today. Should I be worried?
        </p>
      </div>

      <div className="flex justify-start">
        <div
          className={cn(
            CARD,
            "max-w-[92%] rounded-2xl rounded-bl-sm px-3.5 py-2.5"
          )}
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            Seven of your eight companies are down, and there was no news
            about any of them today, so this looks like the whole market
            rather than something at your companies. You are down $3,630, which is 4% of what you hold, and
            you have had eleven days like it since you started.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground">
          Which one did put out news?
        </p>
      </div>

      <div className="flex justify-start">
        <div
          className={cn(
            CARD,
            "max-w-[92%] rounded-2xl rounded-bl-sm px-3.5 py-2.5"
          )}
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            $MSFT. It told investors to expect less next year than they had
            been counting on. It is 9% of what you hold, and it is the one
            name here worth reading about tonight.
          </p>
        </div>
      </div>

      {/*
        * Two exchanges, not one.
        *
        * With a single question this card was about half the height of the
        * Pulse card beside it and the bottom of its pane was empty, which
        * on a two-column row reads as a panel that failed to load rather
        * than as a short conversation. The second turn is also the more
        * useful half of the demonstration: the first answer says the fall
        * was the market, and this one says which single name it was not.
        */}
      <div className="flex flex-wrap gap-2">
        <Pill>Has this happened before?</Pill>
        <Pill>How much of my portfolio is that?</Pill>
      </div>
    </Panel>
  );
}

const MORE = [
  {
    icon: LineChart,
    title: "Forecast",
    detail:
      "A yearly price path for every holding out to 2030, reasoned name by name. Scenarios to think with, never a promise.",
  },
  {
    icon: Mail,
    title: "A letter on Sunday",
    detail:
      "One email a week. What moved, and the reasoning in full sentences.",
  },
  {
    icon: LayoutGrid,
    title: "Lab",
    detail:
      "What you are actually concentrated in, what a bad month would do to it, and how the last few weeks have gone.",
  },
] as const;

function More() {
  return (
    <Section>
      <Reveal>
        <SectionHead
          eyebrow="And the rest"
          title="Three more parts of the app, once you are in."
          detail="None of them tell you what to do. They put the facts in front of you, so the decision stays yours."
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {MORE.map((m) => (
            <div
              key={m.title}
              className={cn(BOX, NESTED_PAD, "flex flex-col gap-3")}
            >
              <span
                className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15"
                aria-hidden
              >
                <m.icon className="size-4" />
              </span>
              <h3 className="text-foreground">{m.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {m.detail}
              </p>
            </div>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}

/*
  The three facts that stop somebody being disappointed later.

  A reader who already used a broker app arrived expecting this to be a
  better version of it, went looking for the connection to their account,
  and could not find the thing this app does not do, because nothing had
  told them. Their whole session read as "more work for less information",
  which is exactly what this is if you thought it would sync your broker.
  Every one of these is checkable from the app itself.

  They used to be the right-hand column of a separate "what this is for,
  and what it is not" section, which was two problems at once: it asked the
  same question the broker comparison asks, so a reader got the answer
  twice, and it was drawn as the same pair of bordered columns, so the page
  carried two near-identical panels saying overlapping things.
*/
const WILL_NOT = [
  "Connect to your bank or broker. You add what you own once, and from then on the prices update on their own.",
  "Know the day you bought. Gains are measured against your average price, so there is no chart that starts on the day you bought.",
  "Buy or sell anything, or tell you to. Prices are free and delayed by a few minutes.",
] as const;

/**
 * The question the page exists to answer, asked in the reader's own words
 * and answered before any feature is named.
 *
 * Nearly everybody who tried this asked some version of "what is it for"
 * and "how is this different from the app I already have". Those are the
 * same question. A landing page that answers it three sections down, by
 * implication, in a feature list, has not answered it: the reader has
 * already decided they own something like this and left.
 *
 * The left column is deliberately generous about the tool they already
 * use, and every line in it is true. A comparison that opens by running
 * down something the reader likes is one they stop reading, and it is also
 * the wrong claim: a broker really is better at being a broker than this
 * will ever be. The point is that the two columns are not the same job.
 */
function NotYourBroker() {
  return (
    <Section>
      <Reveal>
        <SectionHead
          eyebrow="Why another one of these"
          title={BROKER_ANSWER}
          detail="It is a fair thing to ask, so here it is first. Your broker holds your money and adds it up, and it is good at that. Working out why the number moved is usually left to you, and that is the part this helps with."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className={cn(BOX, NESTED_PAD, "flex flex-col gap-4")}>
            <MicroLabel>What your broker already does well</MicroLabel>
            <ul className="flex flex-col gap-3">
              {BROKER_ALREADY_DOES.map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground"
                >
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Keep using it. Nothing here replaces it, and nothing here can
              buy or sell anything for you.
            </p>
          </div>

          <div className={cn(BOX, NESTED_PAD, "flex flex-col gap-4")}>
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
            <p className="text-sm leading-relaxed text-muted-foreground">
              You still decide everything. It never tells you to buy, sell,
              or hold.
            </p>
          </div>
        </div>

        {/*
          * The limits, in the same breath as the comparison rather than in
          * a section of their own three screens down. This is where
          * somebody weighing one tool against another is actually looking.
          *
          * A plain row under a hairline rather than more cards: it is the
          * fine print and should read like it, and a third bordered panel
          * is what made the lower half of this page monotonous.
          */}
        <div className="mt-8 border-t border-border pt-6">
          <MicroLabel>What it will not do</MicroLabel>
          <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-3">
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
      </Reveal>
    </Section>
  );
}

/**
 * A circle's board, drawn the way the real one is.
 *
 * Circle used to be three cards of prose here, while Pulse and Margus each
 * had a picture of themselves. That is the section arguing that seeing
 * other people's week is worth more than being told about it, making its
 * case in words alone, and it read as the least real thing on the page.
 *
 * Everyone in the sample is down, because that is the point being made:
 * the reassurance is not a sentence somebody wrote, it is four names in a
 * column all having the same day. Percentages only. A circle shows how a
 * member's day went and never what anything is worth, which is the whole
 * reason people are willing to be in one.
 */
/*
  Ordinary given names, and deliberately not the ones in AGENTS.md.

  The first draft of this board used Martin's own household, because those
  names were to hand. They are real people who never agreed to appear on a
  public marketing page, and a sample is not a place to spend somebody
  else's privacy. Anything generic makes the same point.
*/
const CIRCLE_BOARD = [
  { name: "You", pct: "-4.0%" },
  { name: "Anna", pct: "-3.6%" },
  { name: "Mark", pct: "-4.4%" },
  { name: "Priya", pct: "-2.9%" },
] as const;

function CircleStill() {
  return (
    <Panel className="h-auto gap-4 p-4" aria-hidden>
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
                row.pct.startsWith("-") ? "text-loss" : "text-gain"
              )}
            >
              {row.pct}
            </span>
          </div>
        ))}
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Everybody had the same day. Nobody in here can see what anybody paid,
        or what anything is worth.
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
      "Invite a partner or a parent and you both own it. One portfolio with two people on it, not a copy: you both add holdings and you both see all of it, what each of you paid included.",
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
      "A circle is invite-only and private by default. Signing in never puts you in one, and nothing you own is shared until you share it.",
  },
] as const;

/**
 * Circle, given a section of its own rather than a card in the "and the
 * rest" row it used to share with two emails.
 *
 * It was filed as a nice extra, which is the wrong weight. The hardest
 * part of a market falling is not knowing what happened, which the rest of
 * this page is about. It is sitting on your own at eleven at night with
 * the number in front of you. Everybody who has held anything for more
 * than a year knows this, and no product built around a single reader can
 * do anything about it. So it goes next to the features rather than after
 * them, and it gets a picture like they do.
 */
function CircleSection() {
  return (
    <Section>
      <Reveal>
        <SectionHead
          eyebrow="Circle"
          title="A bad week is easier with someone you know."
          detail="It helps to hear that nothing really changed. It helps more when it comes from someone you know who is looking at the same week."
        />
        <div className="mt-8 grid items-start gap-4 md:grid-cols-2">
          <CircleStill />
          <div className="grid gap-4">
            {CIRCLE_POINTS.map((c) => (
              <div
                key={c.title}
                className={cn(BOX, NESTED_PAD, "flex flex-col gap-3")}
              >
                <span
                  className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15"
                  aria-hidden
                >
                  <c.icon className="size-4" />
                </span>
                <h3 className="text-foreground">{c.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {c.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

/**
 * Price and safety together, because they are one question asked twice:
 * what is this going to cost me, in money and in risk.
 */
function PriceAndTrust() {
  return (
    <Section>
      <Reveal>
        <div className="grid gap-4 md:grid-cols-2">
          <div className={cn(BOX, NESTED_PAD, "flex flex-col gap-4")}>
            <MicroLabel className="text-primary">What it costs</MicroLabel>
            <p className="text-balance font-heading text-xl font-semibold leading-snug tracking-[-0.02em] text-foreground">
              {SIGNIN_PRICE}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {SIGNIN_PRICE_NOTE}
            </p>
          </div>

          <div className={cn(BOX, NESTED_PAD, "flex flex-col gap-4")}>
            <MicroLabel className="text-primary">
              Your holdings stay yours
            </MicroLabel>
            <ul className="flex flex-col gap-3">
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
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

/** The ask again, so nobody has to scroll back up to act on it. */
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
     * Barely any top padding, and the section above keeps its own.
     *
     * Two full section pads met here and added up to about 160px of empty
     * black between the last card and this headline, which stranded the
     * closing ask out on its own rather than letting it land as the end of
     * something. A coda sits close to what it concludes. The bottom pad
     * stays generous, because that space is the page ending rather than a
     * gap between two things.
     */
    <Section className="pt-2 pb-[max(6rem,env(safe-area-inset-bottom))] sm:pt-4">
      <Reveal>
        <div className="flex flex-col items-center gap-6 text-center">
          <h2>
            <span className="block max-w-xl text-balance font-heading text-2xl font-semibold leading-[1.15] tracking-[-0.03em] text-foreground sm:text-3xl">
              Paste what you own. The next red evening will make a lot more
              sense.
            </span>
          </h2>
          <SignInMethods googleBusy={busy} onGoogle={onSignIn} />
          {/*
            * The price is not repeated here. It is already stated under the
            * hero button and again on its own card two sections up, and a
            * third time in the same breath as the terms reads as insisting.
            * Say it well, twice, and stop.
            */}
          <LegalLine minAge={minAge} />
        </div>
      </Reveal>
    </Section>
  );
}

/* -------------------------------------------------- alternate hero shapes */



/**
 * The one that ships: the editorial opening on the product-first layout.
 *
 * The problem is named before the product is, because that sentence is the
 * sharpest thing on the page, and then the interface arrives directly under
 * it as the answer rather than three screens later. The two heroes it is
 * made from each gave up something: the centred one opened by naming the
 * product to somebody who had no reason to care yet, and the editorial one
 * put its best sentence on a screen with nothing to look at.
 *
 * The card is deliberately allowed to run past the bottom of the window,
 * because a page whose content is visibly cut off by the fold is one nobody
 * mistakes for finished, and on every phone and most laptops that is what
 * happens. On a taller window there is no cut, so the height floor below
 * keeps the next section in view instead. Between those two, on a window
 * where the card clears the fold whole and nothing after it has started,
 * `ScrollCue` says it in words. Which of the three a reader gets is measured
 * on the real page rather than guessed at, and the cue is laid out inside
 * this section so that it scrolls with the page rather than hovering over
 * it.
 */
function HeroHybrid({ busy, err, onSignIn, notice }: HeroProps) {
  return (
    /*
     * At least one screen tall, less 9rem.
     *
     * `min-h` only bites when the hero is shorter than the window, which is
     * exactly the case this whole affordance exists for: on a large display
     * the opening screen ended well above the fold, so nothing was cut and
     * the page read as finished. Given the floor, the hero fills the window
     * bar 9rem, so the next section's eyebrow and the top of its heading
     * are always in view: what a reader sees at rest is a section
     * beginning, not a page ending. On a shorter window the hero is taller
     * than this and the sample card is cut instead, which says the same
     * thing more loudly.
     *
     * 9rem and not less, because what has to be in view is a heading rather
     * than a section's own top padding: 48px of that peek is the pad, which
     * leaves 96px of the heading showing. That is also what makes
     * `ScrollCue` stand down on a tall window, since the page is already
     * saying it.
     *
     * `svh` rather than `dvh`, so a phone that later retracts its address
     * bar does not find the hero taller than the window it was sized
     * against.
     *
     * `relative`, because the cue is laid out against the top of this
     * section, which is the top of the document.
     */
    <section className="relative min-h-[calc(100svh-9rem)] px-6 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))] sm:pb-14 landing-hero">
      <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col items-center text-center">
        <UpsideLogo variant="icon" className="text-lg" />
        {notice}
        {/*
          * Two type steps, not two headlines.
          *
          * On a phone this ran to five lines, which pushed the button and
          * the product down far enough that the fold stopped doing its job.
          * The obvious fix is a shorter sentence on small screens, and it
          * is the wrong one: the sentence is the entire hook, and keeping
          * two versions of a hook in sync is a promise nobody keeps. So the
          * copy is fixed and the type moves. 26px with tighter leading and
          * tracking lands it in four lines on a 390px screen while staying
          * comfortably the largest thing on the page; the desktop step is
          * untouched.
          */}
        <h1 className="mt-10">
          <span className="block text-balance font-heading text-[1.625rem] font-semibold leading-[1.12] tracking-[-0.04em] text-foreground sm:text-[2.75rem] sm:leading-[1.14] sm:tracking-[-0.035em]">
            Everyone shows you the number.
            <span className="mt-1.5 block text-muted-foreground">
              Nobody tells you what happened.
            </span>
          </span>
        </h1>
        {/*
          * Cut from 32 words to 18. The old one restated the headline
          * before adding anything, and a lede that has to be read twice to
          * find the new information is a lede that is too long. This says
          * only what the headline does not: what you do, and what comes
          * back.
          */}
        {/*
          * The headline names the hole. This names the thing that fills it.
          * The old lede was the start mechanic, paste what you own, which
          * is how you get in and not why you would. A friend looking at a
          * screenshot asked, fairly, what this gives that a broker does
          * not. Paste is three sections down. The first screen has to
          * answer that question or the rest of the page is a feature list
          * for a product they have already decided against.
          */}
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Upside Lab looks at everything you own, every day. On the days when
          your whole portfolio is red, it tells you which of your companies
          actually had news, and which ones simply fell along with everything
          else.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3.5">
          <SignInMethods googleBusy={busy} onGoogle={onSignIn} />
          <p className="text-sm text-muted-foreground">{SIGNIN_PRICE}</p>
        </div>
        {err && (
          <p className="mt-4 text-sm text-loss" role="alert">
            {err}
          </p>
        )}
      </div>

      {/*
        * On a phone and on most laptops the card runs past the bottom of
        * the window, and that cut is the strongest continuation cue there
        * is. It is not, on its own, a scroll affordance: the cut only
        * exists while the hero is taller than the window.
        *
        * Marked, because `ScrollCue` measures this card against the fold. A
        * card the fold cuts needs no words under it, and a card that clears
        * the fold whole leaves nothing else on the screen saying the page
        * continues.
        */}
      <div
        data-scroll-cue-still
        className="landing-still mx-auto mt-12 w-full min-w-0 max-w-3xl sm:mt-14"
      >
        <BookWide />
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

/** The briefing at full column width, for the centred hero. */
function BookWide() {
  return (
    <Panel className="h-auto gap-5 p-5" aria-hidden>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className="signin-live-dot" aria-hidden />
          <MicroLabel>Pulse on $RKLB, down 4.1%</MicroLabel>
        </span>
        <Pill tone="neutral">Sample</Pill>
      </div>

      {/*
        * Pulse first, dollars second.
        *
        * The fold on a phone used to cut this card at the movers, so the
        * first screen a stranger actually saw was a portfolio total and
        * three percents, which is the first screen of every broker app.
        * The sentence that is the product sat under the cut. A friend
        * looking at that screenshot asked what this gives that the app
        * they already have does not. So the thesis read is the thing that
        * has to be on the first screen, and the numbers can be the part
        * that continues below the fold.
        */}
      <Reading nested label="What actually happened" className="text-left">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Pill>Inside recent range</Pill>
          <Pill tone="good">
            <CheckCircle2 data-icon="inline-start" />
            Thesis intact
          </Pill>
        </div>
        <InsightText text="There was no news about the company today. Every similar business fell about the same amount, so this is the market having a bad day rather than anything to do with what you own." />
      </Reading>

      <div className="grid items-start gap-5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="text-left">
          <MicroLabel>Portfolio</MicroLabel>
          <p className="mt-1 font-sans text-3xl font-bold tabular-nums text-foreground">
            $87,770
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-loss/15 px-2 py-1 text-sm font-semibold tabular-nums text-loss">
              Today -$3,630
            </span>
            <span className="rounded-md bg-muted px-2 py-1 text-sm font-semibold tabular-nums text-gain">
              All time +18%
            </span>
          </div>
        </div>

          <div className={cn(CARD, "divide-y divide-border overflow-hidden")}>
          {SAMPLE_MOVERS.map((row) => (
            <div
              key={row.ticker}
              className="flex h-10 items-center gap-3 px-3"
            >
              <span className="flex-1 text-left font-heading text-sm font-semibold text-foreground">
                ${row.ticker}
              </span>
              <span
                className={cn(
                  "w-14 text-right font-mono text-sm font-medium tabular-nums",
                  row.up ? "text-gain" : "text-loss"
                )}
              >
                {row.pct}
              </span>
              <span className="w-16 text-right font-mono text-sm tabular-nums text-muted-foreground">
                {row.dollar}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/** B's tighter middle: three rooms across, each with its own small still. */
function TrioShowcase() {
  return (
    <Section>
      <Reveal>
        <SectionHead
          eyebrow="The whole point"
          title="A fall and real news look exactly the same in a list of red numbers."
          detail="One of them is worth your evening and the other is not. Telling you which one you are looking at is what Upside Lab is for."
        />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <PulseStill />
          <MargusStill />
        </div>
      </Reveal>
    </Section>
  );
}

/* ------------------------------------------------------------------ page */

export function SignedOutLanding(props: HeroProps) {
  return (
    <main id="main" className="relative z-10 flex flex-1 flex-col">
      <HeroHybrid {...props} />
      <NotYourBroker />
      <TrioShowcase />
      <CircleSection />
      <WaysIn />
      <More />
      <PriceAndTrust />
      <Closing
        busy={props.busy}
        minAge={props.minAge}
        onSignIn={props.onSignIn}
      />
    </main>
  );
}
