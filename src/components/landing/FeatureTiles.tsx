"use client";

import { barFillPct, cn, currency, signedCurrency, signedPercent } from "@/lib/format";
import { FILM_MARKET_NAME, filmWeek, filmWeekAnswer } from "@/lib/landing-film";
import { SUNDAY_EMAIL_LINE } from "@/lib/product";
import { Mail } from "lucide-react";
import { useId, type ReactNode } from "react";

/*
  Five things the app explains, each as a small picture that moves.

  The page used to say these things in sentences: a bordered card per
  feature, a heading and a paragraph, which is the part of a product page
  everybody's eye slides off. A picture of the thing working is read in the
  time a heading is, so each tile is mostly picture, with one line under it.

  The loops are CSS (landing.css), transform and opacity only, and they
  start from a finished frame, so a tile scrolled to at any moment shows a
  whole picture rather than one that is still arriving. Under reduced
  motion every one of them is simply the finished picture.

  Every figure in them comes from `landing-film.ts`, the same made-up week
  the hero plays, so the letter and the conversation are about the week a
  reader has just watched rather than about a second, different sample.
*/

function Tile({
  title,
  line,
  children,
  className,
}: {
  title: string;
  line: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "card-sheen glass lift flex w-[84%] min-w-0 shrink-0 snap-start flex-col overflow-hidden rounded-2xl ring-1 ring-foreground/20 xs:w-[70%] md:w-auto",
        className
      )}
    >
      <div className="relative h-52 border-b border-border/60 sm:h-56" aria-hidden>
        {children}
      </div>
      <div className="flex flex-col gap-2 px-5 pt-5 pb-6 sm:px-6">
        <h3 className="text-foreground">
          <span className="block text-balance text-xl tracking-[-0.02em]">
            {title}
          </span>
        </h3>
        <p className="text-base leading-snug text-muted-foreground">{line}</p>
      </div>
    </article>
  );
}

/* --------------------------------------------------- what it looks worth */

/*
  The fair value zones, which is what the app calls the picture. A price
  pin walks from below what a company looks worth, to close to it, to
  above it, and the zone it stands in lights as it arrives. The words are
  the bands' own names in the app, which describe a price and never say
  what to do about it.
*/
const ZONES = [
  { id: "below", label: "Below", read: "A little below what it looks worth", wash: "fv-zone-cool" },
  { id: "around", label: "Fair value", read: "Close to fair value", wash: "fv-zone-mid" },
  { id: "above", label: "Above", read: "A little above what it looks worth", wash: "fv-zone-warm" },
] as const;

function FairValueLoop() {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-4 px-6 sm:px-8">
      <div className="relative h-24">
        {/* The read-out that follows the pin. */}
        <div className="relative h-5">
          {ZONES.map((z, i) => (
            <span
              key={z.id}
              className={cn(
                "fv-read absolute inset-x-0 top-0 text-center font-mono text-xs uppercase tracking-[0.12em] text-foreground",
                `fv-read-${i}`
              )}
            >
              {z.read}
            </span>
          ))}
        </div>
        {/* The band. */}
        <div className="absolute inset-x-0 bottom-0 flex h-12 overflow-hidden rounded-xl ring-1 ring-foreground/15">
          {ZONES.map((z, i) => (
            <span
              key={z.id}
              className={cn(
                "relative h-full",
                i === 1 ? "basis-[30%]" : "basis-[35%]",
                i > 0 && "border-l border-foreground/10"
              )}
            >
              <span className={cn("fv-zone absolute inset-0", z.wash, `fv-zone-${i}`)} />
            </span>
          ))}
          {/* What each way of valuing it says: three ticks, one span. */}
          {[0.42, 0.5, 0.57].map((x) => (
            <span
              key={x}
              className="absolute top-2 bottom-2 w-px bg-foreground/45"
              style={{ left: `${x * 100}%` }}
            />
          ))}
        </div>
        {/* The price, travelling. */}
        <div className="fv-pin pointer-events-none absolute inset-x-0 bottom-0 h-[4.75rem]">
          <span className="absolute left-0 flex -translate-x-1/2 flex-col items-center">
            <span className="rounded-full bg-primary px-2.5 py-0.5 font-mono text-xs font-medium text-primary-foreground shadow-[0_6px_20px_-6px_oklch(0.8_0.09_90/60%)]">
              Price
            </span>
            <span className="h-[3.25rem] w-0.5 rounded-full bg-primary" />
          </span>
        </div>
      </div>
      <div className="flex text-xs text-muted-foreground">
        {ZONES.map((z, i) => (
          <span
            key={z.id}
            className={cn("truncate text-center", i === 1 ? "basis-[30%]" : "basis-[35%]")}
          >
            {z.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- margus */

function MargusLoop() {
  const qa = filmWeekAnswer();
  return (
    <div className="absolute inset-0 flex flex-col justify-end gap-2.5 overflow-hidden px-5 pb-5">
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm leading-snug text-primary-foreground">
          {qa.question}
        </p>
      </div>
      <div className="card-sheen glass-well relative max-w-[94%] rounded-2xl rounded-bl-sm px-3.5 py-2.5">
        <span className="chat-typing absolute left-3.5 top-3 flex gap-1" aria-hidden>
          <span className="size-1.5 rounded-full bg-muted-foreground" />
          <span className="size-1.5 rounded-full bg-muted-foreground" />
          <span className="size-1.5 rounded-full bg-muted-foreground" />
        </span>
        <p className="text-sm leading-snug text-muted-foreground">
          {qa.answer.map((line, i) => (
            <span key={line} className={cn("chat-line", `chat-line-${Math.min(i, 2)}`)}>
              {i === 0 ? <span className="text-foreground">{line}</span> : line}{" "}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- the letter */

function LetterLoop() {
  const week = filmWeek();
  const bars = [
    { name: "You", pct: week.pct, you: true },
    { name: FILM_MARKET_NAME, pct: week.marketPct, you: false },
  ];
  const top = Math.max(...bars.map((b) => Math.abs(b.pct)));
  return (
    <div className="absolute inset-0 flex items-center justify-center px-5">
      <div className="letter-card card-sheen glass-well w-full max-w-[19rem] rounded-xl px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
            Sunday
          </span>
          <Mail className="size-4 text-primary" />
        </div>
        <p className="mt-3 font-heading text-lg font-semibold tracking-tight text-foreground">
          Your week{" "}
          <span className="font-mono text-base font-medium tabular-nums text-gain">
            {signedCurrency(week.dollars, 0)}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Worth {currency(week.close, 0)}. A made-up week.
        </p>
        <div className="mt-4 flex flex-col gap-2.5">
          {bars.map((b, i) => (
            <div key={b.name} className="flex items-center gap-3">
              <span className="w-16 shrink-0 truncate text-xs text-muted-foreground">
                {b.name}
              </span>
              <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-foreground/[0.07]">
                <span
                  className={cn(
                    "letter-bar absolute inset-y-0 left-0 rounded-full",
                    b.you ? "bg-gain" : "bg-foreground/40"
                  )}
                  style={{
                    width: `${barFillPct((Math.abs(b.pct) / top) * 100, 2, 100)}%`,
                    ["--bar" as string]: i,
                  }}
                />
              </span>
              <span
                className={cn(
                  "w-12 shrink-0 text-right font-mono text-xs tabular-nums",
                  b.you ? "text-gain" : "text-muted-foreground"
                )}
              >
                {signedPercent(b.pct)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------- when could I stop */

/*
  A life's savings as one line: climbing while you work, then drawn down
  slowly after you stop. Illustration, not a plan, and labelled so; the
  real one is worked out from a reader's own figures.
*/
const LIFE = (() => {
  const W = 300;
  const H = 120;
  const pts: [number, number][] = [];
  const start = 30;
  const stop = 58;
  const end = 95;
  for (let age = start; age <= end; age += 1) {
    const x = ((age - start) / (end - start)) * W;
    const v =
      age <= stop
        ? Math.pow((age - start) / (stop - start), 1.9)
        : 1 - Math.pow((age - stop) / (end - stop), 1.35) * 0.82;
    pts.push([x, H - 8 - v * (H - 26)]);
  }
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const peakX = ((stop - start) / (end - start)) * W;
  return { W, H, line, area, peakX, start, stop, end };
})();

function LifeLoop() {
  const { W, H, line, area, peakX, start, stop, end } = LIFE;
  /* Per instance, never a literal: two copies would share one paint server. */
  const fill = `life-fill-${useId().replace(/:/g, "")}`;
  return (
    <div className="absolute inset-0 flex flex-col justify-end px-5 pb-4">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="life-reveal block h-auto w-full">
          <defs>
            <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g>
            <path d={area} fill={`url(#${fill})`} />
            <path
              d={line}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </svg>
        <span className="absolute inset-x-0 bottom-0 h-px bg-foreground/20" />
        {/* The flag at the age the savings can take over. */}
        <span
          className="life-flag absolute bottom-0 flex flex-col items-center"
          style={{ left: `${(peakX / W) * 100}%`, transform: "translateX(-50%)" }}
        >
          <span className="rounded-md bg-primary px-2 py-0.5 font-mono text-xs font-medium whitespace-nowrap text-primary-foreground">
            Stop at {stop}
          </span>
          <span className="h-24 w-px bg-primary/70" />
        </span>
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-xs tabular-nums text-muted-foreground">
        <span>{start}</span>
        <span>Example</span>
        <span>{end}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ plain english */

/*
  The glossary's own shape, shown working: a plain phrase in the sentence,
  and the market's word for it only inside the definition somebody opened.
  That is the one place AGENTS.md lets a word like this appear, and the
  tile is a picture of exactly that rule.
*/
function WordsLoop() {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-3 px-6">
      <p className="font-heading text-lg leading-snug tracking-tight text-foreground">
        This company usually{" "}
        <span className="words-term underline decoration-dotted decoration-primary/80 underline-offset-[5px]">
          moves about 2% in a day
        </span>
        .
      </p>
      <div className="words-pop card-sheen glass-well rounded-xl px-4 py-3">
        <p className="text-sm leading-snug text-foreground">
          How far its price usually travels from one day to the next.
        </p>
        <p className="mt-1 text-sm leading-snug text-muted-foreground">
          You will see this called volatility.
        </p>
      </div>
    </div>
  );
}

/*
  A row you swipe on a phone, a grid from `md` up.

  Stacked on a phone the five tiles measured about 1,800px, two whole
  screens of pictures before the page said who it was for. As a row with
  the next tile peeking in at the right edge, they cost one tile's height,
  and the peek is what says there is more. The row bleeds to the screen's
  edges so a tile slides out from under the page gutter rather than being
  cut by it, and it snaps so a flick always lands on a whole tile.
*/
export function FeatureTiles() {
  return (
    <div className="-mx-6 mt-8 flex snap-x snap-mandatory scroll-px-6 gap-3 overflow-x-auto px-6 py-1 scrollbar-none md:mx-0 md:grid md:snap-none md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 md:py-0">
      <Tile
        className="md:col-span-2"
        title="What it looks worth"
        line="Every price set against a range of estimates of what the company is worth, with the working for each one."
      >
        <FairValueLoop />
      </Tile>
      <Tile
        title="Ask Margus"
        line="It has read your portfolio. Ask it anything, in your own words."
      >
        <MargusLoop />
      </Tile>
      <Tile title="Your week, every Sunday" line={SUNDAY_EMAIL_LINE}>
        <LetterLoop />
      </Tile>
      <Tile
        title="When could you stop working?"
        line="Your savings across your whole life, and the earliest age they could carry you."
      >
        <LifeLoop />
      </Tile>
      <Tile
        title="Every word explained"
        line="Plain words first. Tap anything you do not know and it explains itself."
      >
        <WordsLoop />
      </Tile>
    </div>
  );
}
