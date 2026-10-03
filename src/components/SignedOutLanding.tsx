"use client";

import { ScrollCue } from "@/components/ScrollCue";
import { UpsideLogo } from "@/components/UpsideLogo";
import { FeatureTiles } from "@/components/landing/FeatureTiles";
import { PulseFilm } from "@/components/landing/PulseFilm";
import {
  BOX,
  CARD,
  MicroLabel,
  NESTED_PAD,
  Panel,
  Pill,
} from "@/components/ui/Panel";
import { Button } from "@/components/ui/button";
import { SignInMethods } from "@/components/SignInMethods";
import { barFillPct, cn, signedPercent } from "@/lib/format";
import { ArrowRight, MessagesSquare, ShieldCheck, Users } from "lucide-react";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { FILM_DAYS } from "@/lib/landing-film";
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
 * one thing and visibly continues, the product does the thing it claims
 * directly under it, and the ask is repeated at the bottom so nobody has to
 * scroll back up to act on it.
 *
 * Five sections and a footer, and that is a ceiling rather than a starting
 * point. It was eight sections of 1,028 words measuring 7,800px at 390;
 * a pass took it to 5,736px. The redesign that took the red day off it
 * (2026-10-02) added five moving feature tiles, which stacked on a phone
 * cost 1,800px on their own, so on a phone they are a row you swipe and
 * the page measures about 6,200px at 390, 7.3 screens. Measure before
 * adding anything, and take it out of a section rather than out of the air
 * between them.
 *
 * WHAT IT SELLS. Understanding your money, on every day: the hero says
 * "Every move, explained." beside a made-up week played as a picture, and
 * nothing on the first screen is a loss. It used to open "Everything is
 * red", which taught the right idea by selling the wrong thing.
 *
 * Every number on it is derived from `landing-film.ts`, which is built on
 * `sample-portfolio.ts`. None of them are typed in beside the sentence they
 * belong to, which is how the old ones drifted into contradicting each
 * other.
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
 * The compact sign-in's sample: the same made-up week the landing plays,
 * at the size of a column.
 *
 * It used to be a card about one red day, "Nvidia, down 2.1%", above a
 * paragraph explaining that the fall was nothing. True, and the wrong first
 * impression: the screen a failed sign-in lands on opened on a loss. The
 * name stays so the gate that draws it does not have to change.
 */
export function SampleBriefing() {
  return <PulseFilm compact />;
}

/* --------------------------------------------------------------- section */

/**
 * What else it explains, as pictures.
 *
 * This section used to be two working cards about a red day, a Pulse card
 * you switched between "a market day" and "a news day" and a conversation
 * that opened "Everything is red today. Should I be worried?" The hero
 * plays that idea now, without the red, so what is left to show is the
 * rest of the app, and each part of it is a picture that moves rather
 * than a heading over a paragraph.
 */
function WhatItDoes() {
  return (
    <Section>
      <SectionHead
        index="01"
        eyebrow="What it does"
        title="Everything you own, in plain English."
        detail="Why it moved is where it starts. Here is the rest."
      />
      <FeatureTiles />
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
        index="02"
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
        No tips, no day trading, no buy button. There never will be one.
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
    what: "The market, or the company's own news",
    cells: ["Not said", "Not said", "Every company, every day"],
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
        detail="Your broker counts the money to the cent. Why it moved is left to you."
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
              <tr key={row.what} className="border-b border-border/60 transition-colors last:border-0 hover:bg-foreground/[0.035]">
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
/*
  "You" is the made-up Monday the hero opens on, so the board is about the
  same day a reader has just watched. The three friends are invented.
*/
const CIRCLE_BOARD = [
  { name: "You", pct: FILM_DAYS[0]!.pct },
  { name: "Anna", pct: 0.012 },
  { name: "Mark", pct: 0.027 },
  { name: "Priya", pct: 0.008 },
] as const;

const CIRCLE_BOARD_MAX = Math.max(...CIRCLE_BOARD.map((row) => Math.abs(row.pct)));

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
            <span className="w-12 shrink-0 truncate text-left text-sm text-foreground">
              {row.name}
            </span>
            {/*
              The same picture the real Today board draws: a zero line in
              the middle and each day growing out of it, so four red
              figures read at a glance as four people having one day.
            */}
            <span className="relative block h-1.5 flex-1 rounded-full bg-foreground/[0.06]" aria-hidden>
              <span className="absolute inset-y-[-3px] left-1/2 w-px bg-foreground/20" />
              <span
                className={cn(
                  "overview-bar absolute inset-y-0 rounded-full",
                  row.pct < 0 ? "right-1/2 bg-loss/75" : "left-1/2 bg-gain/75"
                )}
                style={{
                  width: `${barFillPct((Math.abs(row.pct) / CIRCLE_BOARD_MAX) * 50, 1, 50)}%`,
                  transformOrigin: row.pct < 0 ? "right center" : "left center",
                }}
              />
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
        Everybody&apos;s day, side by side.
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
      "Invite a partner or a parent. You both see all of it, what each of you paid included.",
  },
  {
    icon: MessagesSquare,
    title: "Or show a circle, without what you paid",
    detail:
      "Everybody sees what you hold. What you paid for it, and so your gain, stays yours.",
  },
  {
    icon: ShieldCheck,
    title: "Nobody is added for you",
    detail:
      "Invite only. Signing in never puts you in one.",
  },
] as const;

/**
 * Circle, given a section of its own rather than a card in a row of extras.
 *
 * It used to be sold on the bad week ("easier with someone you know"),
 * which is true and is the same red-day pitch the rest of the page has
 * moved away from. What a circle is, on an ordinary day, is the people you
 * already talk to about this, with everybody's day on one board.
 */
function CircleSection() {
  return (
    <Section>
      <SectionHead
        index="04"
        eyebrow="Circle"
        title="Better with people you know."
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
        </div>
      </div>
    </Section>
  );
}

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

/*
  THE HERO SAYS WHAT THE APP IS FOR, AND THE PICTURE BESIDE IT DOES IT.

  It used to open "Everything is red. Was it you, or the market?" over
  eight red tiles, with a card underneath asking the reader to find the
  one company that had news. The lesson was right and the sale was wrong:
  the first word on the page was "red", every figure on the first screen
  was a loss, and a product about understanding your money introduced
  itself as a product about losing it (Martin's call, 2026-10-02).

  What it says now is the promise itself, and the film beside it keeps it
  three times over in a few seconds: a day one company made on its own
  news, a day nothing happened, and a day the market fell and a company of
  yours rose anyway. The question at the heart of the app, the market or
  the company, is the same. It is simply asked on more than the bad days.

  The film is allowed to run past the bottom of the window, because a
  picture visibly cut by the fold is the strongest sign there is that the
  page continues. On a window tall enough to show it whole, `ScrollCue`
  says it in words.
*/
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

        <div className="mt-8 grid items-center gap-10 sm:mt-14 sm:gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14 xl:gap-20">
          <div className="flex min-w-0 flex-col items-start text-left">
            <p className="flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
              <span className="relative flex size-2" aria-hidden>
                <span className="live-ping absolute inset-0 rounded-full bg-primary" />
                <span className="relative size-2 rounded-full bg-primary" />
              </span>
              Your portfolio, read every day
            </p>
            <h1 className="mt-4 sm:mt-5">
              <span className="block text-balance font-heading text-[3rem] font-semibold leading-[0.95] tracking-[-0.045em] text-foreground sm:text-[4.5rem] xl:text-[5.25rem]">
                Every move,
                <span className="block text-primary">explained.</span>
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-lg leading-snug text-muted-foreground sm:mt-7 sm:text-xl">
              Every day, Upside Lab tells you in plain English what moved
              each company you own: the whole market, or its own news.
            </p>
            <div className="mt-7 w-full max-w-sm sm:mt-9">
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

          <div data-scroll-cue-still className="landing-still w-full min-w-0">
            <PulseFilm
              figureClassName="text-[2rem] leading-none sm:text-[2.5rem]"
              footer={
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-4">
                  <p className="min-w-[13rem] flex-1 text-xs leading-relaxed text-muted-foreground">
                    Press a company to read about it.{" "}
                    The holdings are made up and the prices are real.
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
              }
            />
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
      <WhatItDoes />
      <WhoItsFor />
      <Compare />
      <CircleSection />
      <Closing busy={props.busy} err={props.err} onSignIn={props.onSignIn} />
      <Footer minAge={props.minAge} />
    </main>
  );
}
