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
  LineChart,
  Mail,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import {
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
    <div className={cn("flex flex-col gap-4", className)}>
      <MicroLabel className="text-primary">{eyebrow}</MicroLabel>
      <h2>
        <span className="block text-balance font-heading text-2xl font-semibold leading-[1.15] tracking-[-0.03em] text-foreground sm:text-3xl">
          {title}
        </span>
      </h2>
      {detail ? (
        <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
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



const SAMPLE_MOVERS = [
  { ticker: "RKLB", pct: "+6.8%", dollar: "+$3,640", up: true },
  { ticker: "AMZN", pct: "+1.4%", dollar: "+$720", up: true },
  { ticker: "MSFT", pct: "-0.6%", dollar: "-$180", up: false },
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
          detail="No brokerage login, no read-only keys, no waiting on a connection to sync. Three ways in, and the fastest one is typing."
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
          <Pill tone="good">Up ≥5%</Pill>
          <span className="inline-flex items-center gap-1 font-medium tabular-nums text-gain">
            <TrendingUp className="size-3.5" />
            +6.8%
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
          Nothing came out of the company today. The move was the whole
          sector, so the reason you own this has not changed.
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
          Guidance for next year came in under what the market expected.
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
          Why is my portfolio down this week when the market is up?
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
            Almost all of it is one name. $BMNR is down 11% since Monday and
            it is a fifth of what you hold, so it outweighs the six names
            that went up. The rest of your portfolio is up 0.9% on the week.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Pill>What changed at the company?</Pill>
        <Pill>Is that too much in one name?</Pill>
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
    icon: Users,
    title: "Circle",
    detail:
      "Share a portfolio with people you invite. They see today's prices and never what you paid for anything.",
  },
] as const;

function More() {
  return (
    <Section>
      <Reveal>
        <SectionHead
          eyebrow="And the rest"
          title="Three more rooms, once you are in."
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
              Paste what you own. See what it has been doing.
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
            Your broker tells you what you own.
            <span className="mt-1.5 block text-muted-foreground">
              It never tells you whether the reason you bought it still holds.
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
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
          Paste what you own. Upside Lab watches the names, explains the
          moves in plain words, and writes to you on Sunday.
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
    <Panel className="sample-still h-auto gap-5 p-5 ring-0" aria-hidden>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className="signin-live-dot" aria-hidden />
          <MicroLabel>Today&apos;s briefing</MicroLabel>
        </span>
        <Pill tone="neutral">Sample</Pill>
      </div>

      <div className="grid gap-5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="text-left">
          <MicroLabel>Portfolio</MicroLabel>
          <p className="mt-1 font-sans text-3xl font-bold tabular-nums text-foreground">
            $91,400
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-gain/15 px-2 py-1 text-sm font-semibold tabular-nums text-gain">
              Today +$4,180
            </span>
            <span className="rounded-md bg-muted px-2 py-1 text-sm font-semibold tabular-nums text-gain">
              All time +18%
            </span>
          </div>
        </div>

        <div className="divide-y divide-border/60 overflow-hidden rounded-lg glass-well">
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

      <Reading nested label="Worth noticing" className="text-left">
        <InsightText text="$RKLB rose 6.8% today while Amazon and Microsoft barely moved. When one name climbs on its own, the question is whether something changed at the company, or only the price." />
      </Reading>
    </Panel>
  );
}

/** B's tighter middle: three rooms across, each with its own small still. */
function TrioShowcase() {
  return (
    <Section>
      <Reveal>
        <SectionHead
          eyebrow="What it does"
          title="Watches the names. Explains the moves. Writes on Sunday."
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
      <TrioShowcase />
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
