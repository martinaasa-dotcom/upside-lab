"use client";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/format";
import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileSpreadsheet,
  ImageUp,
  LineChart,
  Mail,
  Users,
} from "lucide-react";
import {
  PRODUCT_SENTENCE,
  PRODUCT_SUPPORT_EMAIL,
  SIGNIN_PRICE,
  SIGNIN_PRICE_NOTE,
  SIGNIN_TRUST,
  SIGNIN_WHO,
} from "@/lib/product";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

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
 * Fades a section in the first time it is scrolled to.
 *
 * `data-reveal` is only ever set from script, so before hydration and in
 * any browser without an IntersectionObserver the element carries no
 * attribute and is plain visible. The observer disconnects on the first
 * intersection: this is an arrival, not a scrubbed animation, and a section
 * that faded out again when scrolled past would be a toy.
 */
function Reveal({
  children,
  className,
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"none" | "out" | "in">("none");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setState("in");
      return;
    }
    setState("out");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setState("in");
          io.disconnect();
        }
      },
      // Fire a little before the section reaches the bottom edge, so it has
      // finished arriving by the time it is actually being read.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-reveal={state === "none" ? undefined : state}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
      className={className}
    >
      {children}
    </div>
  );
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
     * 56px, 80px from `sm`. Not the 80/112 this started at.
     *
     * Generous spacing is what makes a product page feel calm, but these
     * sections are short: an eyebrow, a line, and a row of three cards.
     * At the larger step the gap between one section's last card and the
     * next section's eyebrow measured about 235px of unbroken black, which
     * does not read as room to breathe. It reads as a page that has run
     * out. The rule is that the space between sections should be smaller
     * than the sections themselves, and at 112 it was not.
     */
    <section className={cn("px-6 py-14 sm:py-20", className)}>
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

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-0.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function SignInButton({
  busy,
  onSignIn,
  className,
}: {
  busy: boolean;
  onSignIn: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      size="lg"
      disabled={busy}
      onClick={onSignIn}
      className={cn(
        "h-11 w-full gap-2.5 rounded-full text-base md:w-auto md:min-w-[17rem]",
        className
      )}
    >
      {busy ? <Spinner data-icon="inline-start" /> : <GoogleMark />}
      {busy ? "Redirecting …" : "Continue with Google"}
    </Button>
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
      . Not financial advice. Help:{" "}
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

/**
 * Sized so the next section's top edge is visible on a laptop.
 *
 * `min-h` on the content rather than `h-dvh` on the section: a hero that is
 * exactly one viewport tall reads as the whole page, and the single most
 * common way a landing page loses a reader is by looking finished. Leaving
 * roughly a section's shoulder showing under the fold is what a scroll
 * indicator is really for; the chevron underneath only names it.
 */
function Hero({ busy, err, onSignIn, notice }: HeroProps) {
  return (
    <section className="px-6 pb-16 pt-[max(3rem,env(safe-area-inset-top))] sm:pb-20">
      <div className="mx-auto w-full min-w-0 max-w-5xl">
        <div className="signin-rise grid items-center gap-10 md:grid-cols-[minmax(0,30rem)_minmax(0,22rem)] md:gap-12 lg:gap-16">
          <div className="flex flex-col items-center text-center md:items-start md:text-left">
            <UpsideLogo variant="icon" className="signin-rise-1 text-lg" />

            {notice}

            <div className="flex flex-col signin-rise-2 mt-9 gap-5">
              <h1>
                {/*
                  * The one place in the app that gets a display size. It is
                  * the first sentence anybody reads and it has to carry the
                  * page on its own, so it steps up from the `text-2xl` the
                  * scale gives every other h1. On a child span, per the
                  * heading-scale rule.
                  */}
                <span className="block max-w-lg text-balance font-heading text-3xl font-semibold leading-[1.12] tracking-[-0.035em] text-foreground sm:text-4xl">
                  {PRODUCT_SENTENCE}
                </span>
              </h1>
              <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
                {SIGNIN_WHO}
              </p>
            </div>

            <div className="signin-rise-3 mt-9 flex w-full flex-col items-center gap-4 md:items-start">
              <SignInButton busy={busy} onSignIn={onSignIn} />
              <p className="text-sm text-muted-foreground">
                {SIGNIN_PRICE}
              </p>
            </div>

            {err && (
              <p className="mt-4 text-sm text-loss" role="alert">
                {err}
              </p>
            )}
          </div>

          <BookStill />
        </div>

        {/*
          * A hint, not a control. It is `aria-hidden` and not focusable
          * because it does nothing a scroll wheel or a Tab key does not
          * already do, and a button that only scrolls is a keyboard trap
          * with extra steps.
          */}
        <div
          className="signin-rise-4 mt-14 flex justify-center sm:mt-16"
          aria-hidden
        >
          <span className="flex flex-col items-center gap-1.5 text-muted-foreground">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
              What it does
            </span>
            <ChevronDown className="size-4 landing-nudge" />
          </span>
        </div>
      </div>
    </section>
  );
}

/** Compact sample of a day that moved. Not a full-size Home panel. */
function BookStill() {
  return (
    <div className="relative md:-rotate-1 md:transition-transform md:duration-700 md:hover:rotate-0">
      <div
        className="pointer-events-none absolute -inset-2 -z-10 rounded-[2.5rem] bg-gradient-to-br from-primary/12 to-transparent opacity-70 blur-2xl"
        aria-hidden
      />
      <Panel
        className="signin-rise-3 h-auto gap-4 p-4 relative overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-primary/15"
        aria-hidden
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className="signin-live-dot" aria-hidden />
            <MicroLabel>Today&apos;s briefing</MicroLabel>
          </span>
          <Pill tone="neutral">Sample</Pill>
        </div>

        <div>
          <MicroLabel>Portfolio</MicroLabel>
          <p className="mt-1 font-sans text-2xl font-bold tabular-nums text-foreground">
            $91,400
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
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
            <div key={row.ticker} className="flex h-10 items-center gap-3 px-3">
              <span className="flex-1 font-heading text-sm font-semibold text-foreground">
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

        <Reading nested label="Worth noticing">
          <InsightText text="$RKLB rose 6.8% today while Amazon and Microsoft barely moved. When one name climbs on its own, the question is whether something changed at the company, or whether the price just ran ahead of itself." />
        </Reading>
      </Panel>
    </div>
  );
}

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
      <Reveal>
        <SectionHead
          eyebrow="Getting started"
          title="It starts with what you already own."
          detail="No brokerage login, no read-only keys, no waiting on a connection to sync. Three ways in, and the fastest one is typing."
        />
      </Reveal>
      <Reveal delayMs={80}>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
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

/**
 * Copy on one side, the real interface on the other, alternating.
 *
 * `flip` swaps the columns from `md` up. Below that both stack with the
 * copy first, always, because on a phone the picture explains nothing
 * until the sentence above it has said what it is.
 */
function Feature({
  eyebrow,
  title,
  detail,
  visual,
  flip = false,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  visual: ReactNode;
  flip?: boolean;
}) {
  return (
    <Section>
      <div className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
        <Reveal className={cn(flip && "md:order-2")}>
          <SectionHead eyebrow={eyebrow} title={title} detail={detail} />
        </Reveal>
        <Reveal delayMs={80} className={cn(flip && "md:order-1")}>
          {visual}
        </Reveal>
      </div>
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
          <Badge variant="secondary">Up ≥5%</Badge>
          <span className="font-mono text-sm font-medium tabular-nums text-gain">
            +6.8%
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill>Hold</Pill>
          <Pill tone="good">
            <CheckCircle2 className="size-3.5 text-gain" />
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
          <Badge variant="secondary">Down ≥3%</Badge>
          <span className="font-mono text-sm font-medium tabular-nums text-loss">
            -3.4%
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill>Look</Pill>
          <Pill tone="warn">Thesis watch</Pill>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Guidance for next year came in under what the market expected.
          Worth reading before you decide anything.
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
      "One email a week. What moved, what is worth a second look, and the reasoning in full sentences.",
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
      </Reveal>
      <Reveal delayMs={80}>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
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
    <Section className="pb-[max(6rem,env(safe-area-inset-bottom))]">
      <Reveal>
        <div className="flex flex-col items-center gap-6 text-center">
          <h2>
            <span className="block max-w-xl text-balance font-heading text-2xl font-semibold leading-[1.15] tracking-[-0.03em] text-foreground sm:text-3xl">
              Paste what you own. See what it has been doing.
            </span>
          </h2>
          <SignInButton busy={busy} onSignIn={onSignIn} />
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-muted-foreground">{SIGNIN_PRICE}</p>
            <LegalLine minAge={minAge} />
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

/* -------------------------------------------------- alternate hero shapes */

/**
 * B: headline first, then the product underneath at full column width.
 *
 * The split hero gives the sample card about 22rem and asks it to compete
 * with a headline for the same eye. This gives the sentence the whole
 * width, then hands the product the whole width under it, which is the
 * shape used when the interface is the argument.
 */
function HeroCentered({ busy, err, onSignIn, notice }: HeroProps) {
  return (
    <section className="px-6 pb-16 pt-[max(3rem,env(safe-area-inset-top))] sm:pb-20">
      <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col items-center text-center">
        <UpsideLogo variant="icon" className="signin-rise-1 text-lg" />
        {notice}
        <h1 className="signin-rise-2 mt-10">
          <span className="block text-balance font-heading text-3xl font-semibold leading-[1.12] tracking-[-0.035em] text-foreground sm:text-5xl">
            {PRODUCT_SENTENCE}
          </span>
        </h1>
        <p className="signin-rise-2 mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
          {SIGNIN_WHO}
        </p>
        <div className="signin-rise-3 mt-9 flex flex-col items-center gap-4">
          <SignInButton busy={busy} onSignIn={onSignIn} />
          <p className="text-sm text-muted-foreground">{SIGNIN_PRICE}</p>
        </div>
        {err && (
          <p className="mt-4 text-sm text-loss" role="alert">
            {err}
          </p>
        )}
      </div>

      <div className="signin-rise-3 mx-auto mt-14 w-full min-w-0 max-w-3xl sm:mt-16">
        <BookWide />
      </div>
    </section>
  );
}

/**
 * C: says the problem before it says the product.
 *
 * The other two open by naming the thing. This opens by naming what is
 * wrong, in the plain voice the app itself uses, and lets the product
 * arrive as the answer to it. It is the most distinctive of the three and
 * the most dependent on the sentence being right.
 */
function HeroEditorial({ busy, err, onSignIn, notice }: HeroProps) {
  return (
    <section className="px-6 pb-16 pt-[max(3rem,env(safe-area-inset-top))] sm:pb-20">
      <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col items-center text-center">
        <UpsideLogo variant="icon" className="signin-rise-1 text-lg" />
        {notice}
        <h1 className="signin-rise-2 mt-12">
          <span className="block text-balance font-heading text-2xl font-semibold leading-[1.25] tracking-[-0.03em] text-foreground sm:text-4xl sm:leading-[1.2]">
            Your broker tells you what you own.
            <span className="block text-muted-foreground">
              It never tells you whether the reason you bought it still holds.
            </span>
          </span>
        </h1>
        <p className="signin-rise-3 mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Upside Lab is the second half. Paste what you own, and it watches
          the names, explains the moves in plain words, and writes to you
          once a week about what actually changed.
        </p>
        <div className="signin-rise-3 mt-9 flex flex-col items-center gap-4">
          <SignInButton busy={busy} onSignIn={onSignIn} />
          <p className="text-sm text-muted-foreground">{SIGNIN_PRICE}</p>
        </div>
        {err && (
          <p className="mt-4 text-sm text-loss" role="alert">
            {err}
          </p>
        )}
        <div
          className="signin-rise-4 mt-16 flex justify-center text-muted-foreground"
          aria-hidden
        >
          <ChevronDown className="size-4 landing-nudge" />
        </div>
      </div>
    </section>
  );
}

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
 * The card is deliberately allowed to run past the bottom of the window.
 * That is the scroll affordance doing the real work: a page whose content
 * is visibly cut off by the fold is one nobody mistakes for finished, and
 * it beats any arrow. The arrow is still there under it, because on a short
 * laptop window the cut alone can be ambiguous.
 */
function HeroHybrid({ busy, err, onSignIn, notice }: HeroProps) {
  return (
    <section className="px-6 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))] sm:pb-14">
      <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col items-center text-center">
        <UpsideLogo variant="icon" className="signin-rise-1 text-lg" />
        {notice}
        <h1 className="signin-rise-2 mt-10">
          <span className="block text-balance font-heading text-3xl font-semibold leading-[1.14] tracking-[-0.035em] text-foreground sm:text-[2.75rem]">
            Your broker tells you what you own.
            <span className="mt-1.5 block text-muted-foreground">
              It never tells you whether the reason you bought it still holds.
            </span>
          </span>
        </h1>
        <p className="signin-rise-3 mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Upside Lab is the second half. Paste what you own, and it watches
          the names, explains the moves in plain words, and writes to you
          once a week about what actually changed.
        </p>
        <div className="signin-rise-3 mt-8 flex flex-col items-center gap-3.5">
          <SignInButton busy={busy} onSignIn={onSignIn} />
          <p className="text-sm text-muted-foreground">{SIGNIN_PRICE}</p>
        </div>
        {err && (
          <p className="mt-4 text-sm text-loss" role="alert">
            {err}
          </p>
        )}
      </div>

      <div className="signin-rise-3 mx-auto mt-12 w-full min-w-0 max-w-3xl sm:mt-14">
        <BookWide />
      </div>

      <div
        className="signin-rise-4 mt-10 flex justify-center sm:mt-12"
        aria-hidden
      >
        <span className="flex flex-col items-center gap-1.5 text-muted-foreground">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
            What it does
          </span>
          <ChevronDown className="size-4 landing-nudge" />
        </span>
      </div>
    </section>
  );
}

/** The briefing at full column width, for the centred hero. */
function BookWide() {
  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute -inset-4 -z-10 rounded-[3rem] bg-gradient-to-br from-primary/12 to-transparent opacity-70 blur-3xl"
        aria-hidden
      />
      <Panel
        className="h-auto gap-5 p-5 shadow-2xl shadow-black/60 ring-1 ring-primary/15"
        aria-hidden
      >
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
          <InsightText text="$RKLB rose 6.8% today while Amazon and Microsoft barely moved. When one name climbs on its own, the question is whether something changed at the company, or whether the price just ran ahead of itself." />
        </Reading>
      </Panel>
    </div>
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
      </Reveal>
      <Reveal delayMs={80}>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <PulseStill />
          <MargusStill />
        </div>
      </Reveal>
    </Section>
  );
}

/* ------------------------------------------------------------------ page */

export type LandingVariant = "hybrid" | "tour" | "product" | "editorial";

export function SignedOutLanding({
  variant = "hybrid",
  ...props
}: HeroProps & { variant?: LandingVariant }) {
  const closing = (
    <Closing
      busy={props.busy}
      minAge={props.minAge}
      onSignIn={props.onSignIn}
    />
  );

  if (variant === "hybrid") {
    return (
      <main id="main" className="relative z-10 flex flex-1 flex-col">
        <HeroHybrid {...props} />
        <TrioShowcase />
        <WaysIn />
        <More />
        <PriceAndTrust />
        {closing}
      </main>
    );
  }

  if (variant === "product") {
    return (
      <main id="main" className="relative z-10 flex flex-1 flex-col">
        <HeroCentered {...props} />
        <TrioShowcase />
        <WaysIn />
        <More />
        <PriceAndTrust />
        {closing}
      </main>
    );
  }

  if (variant === "editorial") {
    return (
      <main id="main" className="relative z-10 flex flex-1 flex-col">
        <HeroEditorial {...props} />
        <Feature
          eyebrow="Pulse"
          title="A price moved. That is not the same as something changing."
          detail="Pulse watches the names you hold and, when one of them jumps, says whether the reason you bought it moved with the price or stayed exactly where it was. Three verdicts, in plain words: intact, worth watching, or broken."
          visual={<PulseStill />}
        />
        <Feature
          eyebrow="Margus"
          flip
          title="An assistant that has already read your portfolio."
          detail="Ask why something moved, what a result means, or whether you are leaning too hard on one name. It answers about what you actually hold, in sentences anybody can follow."
          visual={<MargusStill />}
        />
        <WaysIn />
        <More />
        <PriceAndTrust />
        {closing}
      </main>
    );
  }

  return (
    <main id="main" className="relative z-10 flex flex-1 flex-col">
      <Hero {...props} />
      <WaysIn />
      <Feature
        eyebrow="Pulse"
        title="A price moved. That is not the same as something changing."
        detail="Pulse watches the names you hold and, when one of them jumps, says whether the reason you bought it moved with the price or stayed exactly where it was. Three verdicts, in plain words: intact, worth watching, or broken."
        visual={<PulseStill />}
      />
      <Feature
        eyebrow="Margus"
        flip
        title="An assistant that has already read your portfolio."
        detail="Ask why something moved, what a result means, or whether you are leaning too hard on one name. It answers about what you actually hold, in sentences anybody can follow, and it never pretends a scenario is a recommendation."
        visual={<MargusStill />}
      />
      <More />
      <PriceAndTrust />
      {closing}
    </main>
  );
}
