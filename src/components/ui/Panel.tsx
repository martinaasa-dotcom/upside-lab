"use client";

import { TickerSymbol } from "@/components/TickerSymbol";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card as SurfaceCard,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { listingCurrenciesAreMixed } from "@/lib/listing-currency";
import { filledCardColumns, filledGridColumns } from "@/lib/filled-grid";
import { cn, signedPercent, splitMoveTint } from "@/lib/format";
import {
  ChevronRight,
  Info,
  Minus,
  RotateCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Children,
  Fragment,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * The Upside Lab design system, in one file. The rules, so a new surface
 * cannot drift back into its own dialect:
 *
 *   Radius     shell rounded-xl · nested muted rounded-lg · control rounded-lg
 *   Stack      the field is bg-background (true black; the ambient glow
 *              lives on it). A box on the field is `.glass` — translucent
 *              bg-card plus blur, so the glow reads through the pane.
 *              Never a flat opaque bg-card there; that punches a hole in
 *              the field. Nested is `.glass-well`, never a card inside a
 *              card. Floating menus are bg-popover, never muted (muted is
 *              hover).
 *   Card       ring-1 ring-foreground/20. Nested wells carry their own
 *              inset hairline, so no second ring. Static facts are not
 *              nested pills — use Item, Table or SwatchLegend; a filled
 *              rounded box reads as a button.
 *   Type scale, the only sizes a person should see. Down a block they go
 *   largest to smallest, never a 24px word between a caption and a
 *   paragraph:
 *   text-2xl   24  page titles, and scoreboard figures that are money or a
 *                  percent (text-xl on a phone). Not a status word.
 *   text-lg    18  panel titles, status words on a reading tile
 *   text-base  16  card titles, tickers
 *   text-sm    14  body, chrome, labels, inputs, buttons, nav, tables
 *   text-xs    12  chart ticks, Badge, kbd shortcuts, listing chips
 *              Chart ticks are HTML (ChartYAxis), never SVG <text>, which
 *              scales with the viewBox and blows up on a wide screen.
 *              No text-[Npx]. No text-4xl. The logo lockup is the exception.
 *   Headings   sentence case. Tracking is a scale, not a constant — bigger
 *              type needs more negative tracking for the same optical
 *              rhythm. The scale itself is in globals.css.
 *   Type       Geist for titles, body and labels. Geist Mono for money.
 *   Micro      MicroLabel is the scaffolding voice, the same one every
 *              table header uses: mono caps read as structure rather than
 *              as something to read. It sits above a figure, never above a
 *              paragraph. NoteRows is that voice one tier up, for a label
 *              beside prose. Caps are those two plus the logo, and nothing
 *              else — never a sentence, a button or a heading.
 *   Metrics    A row of numbers is separate cards (Scoreboard/Score) with
 *              air between them; Stat is the same cell used alone. A Score
 *              with bullets is a reading tile — do not use the figure style
 *              on a word like "Weakening", do not park a paragraph in the
 *              sub line, and do not leave unlabeled numbers on the far
 *              right of a row.
 *   Reading    a bordered card with a one-step-up label so the heading does
 *              not blend into its own body copy.
 *   Floor      reading copy is text-sm. text-xs is ticks, Badge, kbd.
 *   Air        padding and gaps do the explaining. Do not stack a subtitle,
 *              a blurb and a hint that all say the same thing.
 *   Measure    copy inside a panel fills the panel. Pinching it to a
 *              reading column leaves a dead strip and wraps for no reason.
 *   Split      title/copy + controls use SPLIT_ROW / SPLIT_COPY /
 *              SPLIT_ACTIONS. Never `flex-wrap` + `min-w-0 flex-1` next to
 *              shrink-0 chrome: on a phone that leftover strip is ~80px and
 *              the sentence wraps one word per line.
 *   Inset      PANEL_PAD / NESTED_PAD / SCORE_CELL, which step down on a
 *              phone (see AGENTS.md). Do not invent a second pad. Label to
 *              figure is mt-2, and InfoTip must not stretch that row.
 *   Hairline   gap-px + bg-border grids paint every track, so the last row
 *              must be full — snap columns with filledGridColumns /
 *              filledCardColumns, never a hand-rolled grid-cols-N.
 *              Scoreboard is a card grid, not a hairline bar.
 *
 * Sentence case is not cosmetic. "Year-by-Year Target Roadmap" reads like a
 * consultant's slide; "Price path" reads like a person wrote it.
 */

/** Page-level box. shadcn Card shell: ring, not a gold hairline. Glass:
 * translucent + blurred so the ambient page glow shows through. */
export const BOX =
  "card-sheen glass rounded-xl text-sm text-card-foreground ring-1 ring-foreground/20";
/** Nested well inside a box. Not a second card, and not for static facts. */
export const CARD = "glass-well rounded-lg";
/**
 * Panel padding. One step down on a phone.
 *
 * 24px on every side was the same number on a 1440px desktop and a 390px
 * phone. On the phone that is 48px of the width gone before any content
 * starts, on top of the page gutter — and a panel is usually the full
 * column, so it compounds: a two-up score cell inside one had about 118px
 * to set a figure in. That is what pushed "23.0% a year" out through the
 * side of its own card. 16px on a phone gives each of those cells another
 * 24px and costs a desktop nothing.
 */
export const PANEL_PAD = "p-4 sm:p-6";
/** Nested card / score-cell padding. Same step as the panel. */
export const NESTED_PAD = "p-4 sm:p-6";
/** A Scoreboard cell. Separate card on the field, not a hairline slice. */
/*
 * `flex flex-col` so the note under the figure can bottom-align — see the
 * note in `Score`. Grid stretches every cell in a row to the tallest, and
 * without this the third line of each cell started wherever its own figure
 * happened to end.
 */
export const SCORE_CELL =
  "card-sheen glass flex min-w-0 flex-col rounded-xl p-4 ring-1 ring-foreground/20 sm:p-6";
/** Member / row list on the field. */
export const LIST =
  "glass divide-y divide-border overflow-hidden rounded-xl ring-1 ring-foreground/20";
/** Anchored ticker/search menu. Popover fill plus a real edge on black. */
export const SUGGEST_MENU =
  "absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/20";

const SHELL_TONES = {
  default: "card-sheen glass ring-foreground/20",
  plain: "card-sheen glass ring-foreground/20",
  brand: "card-sheen glass ring-primary/20",
  warn: "card-sheen glass ring-warning/35",
  danger: "card-sheen glass ring-destructive/30",
} as const;

/*
 * One size step down on a phone, for both figure styles below.
 *
 * 24px mono is about 14px a character, and a two-up score cell inside a
 * panel on a 390px screen has ~123px of content — nine characters.
 * `$1,822,306` is ten. So an ordinary six-figure balance was hitting the
 * wrap below and breaking *inside the number*, which is worse than a long
 * line: `$19,556,` on one row and `216` on the next reads as two figures.
 * 20px buys three more characters and still sets these as the largest
 * thing on the card by a clear step.
 */
const FIGURE =
  "mt-2 min-w-0 font-mono text-xl font-bold tabular-nums break-words sm:text-2xl";
/*
 * `break-words`, and no `whitespace-nowrap`.
 *
 * A figure that cannot fit its cell has to do something, and the two
 * options are wrap or overflow. `whitespace-nowrap` picked overflow, and
 * because a Score cell is `overflow: visible` the text simply carried on
 * out through the side of the card and past the edge of the page — on
 * Circle's "Modeled year" it read as `23.0% a ye` with the rest gone.
 * Wrapping is the honest answer at a width you cannot control.
 *
 * Most values here have no spaces in them (`$629,907`, `42%`, `4.8`), so
 * they are unaffected either way; it is the handful carrying a unit —
 * "23.0% a year", "8y 4m" — that gain a second line instead of an escape
 * route. `break-words` is the backstop under that for a number long
 * enough to beat the cell on its own.
 *
 * `leading-tight` rather than `leading-none`, because a two-line figure at
 * `leading-none` sets its own lines touching.
 */
const DISPLAY =
  "mt-2 min-w-0 font-mono text-xl font-bold leading-tight tracking-tight tabular-nums break-words sm:text-2xl";
/** Status word on a reading tile. Not the 24px figure style. */
const STATUS =
  "mt-1.5 min-w-0 font-heading text-lg font-semibold tracking-tight";

export type PanelTone = keyof typeof SHELL_TONES;

/**
 * Copy on the left, chrome on the right. Stacks on a phone so the sentence
 * gets the full card; sits on one row from `sm` up.
 */
export const SPLIT_ROW =
  "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between";
/** The text side of a SPLIT_ROW. Full width in the column; grows on `sm`. */
export const SPLIT_COPY = "min-w-0 w-full sm:w-auto sm:min-w-[12rem] sm:flex-1";
/** Buttons, selects, figures. Never shrink the copy to make room. */
export const SPLIT_ACTIONS =
  "flex w-full max-w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto";

/** A top-level section. One per idea, never nested inside another Panel. */
export function Panel({
  tone = "default",
  padded = true,
  className,
  children,
  ...rest
}: {
  tone?: PanelTone;
  /** Off for panels whose own children own the edges (tables, lists). */
  padded?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">) {
  return (
    <section
      className={cn(
        "h-full min-w-0 max-w-full rounded-xl text-sm text-card-foreground ring-1",
        SHELL_TONES[tone],
        padded && "flex flex-col gap-5 p-4 sm:gap-6 sm:p-6",
        className
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

/**
 * Title and controls on the right. A subtitle only when the title is not
 * enough on its own. Most panels should skip it.
 */
export function PanelHeader({
  title,
  subtitle,
  icon,
  iconTone = "brand",
  hero = false,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  iconTone?: "brand" | "emerald" | "zinc";
  /** Slightly larger, for the one panel that opens a page. */
  hero?: boolean;
  actions?: ReactNode;
  className?: string;
}) {
  const iconTones = {
    brand: "bg-muted text-muted-foreground",
    emerald: "bg-gain/15 text-gain",
    zinc: "bg-muted text-muted-foreground",
  } as const;

  return (
    <div
      className={cn(
        SPLIT_ROW,
        !subtitle && "sm:items-center",
        className
      )}
    >
      <div
        className={cn(
          SPLIT_COPY,
          "flex gap-3",
          subtitle ? "items-start" : "items-center"
        )}
      >
        {icon && (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              subtitle ? "mt-0.5" : undefined,
              iconTones[iconTone]
            )}
            aria-hidden
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2
            className={cn(
              /* Tracking is optical, so it tightens as the size grows —
               * the fit that reads right at 18px reads loose at 24px.
               *
               * These two pairs are the h1 and h2 steps of the scale in
               * `globals.css`, written out because this is an `<h2>` that
               * sometimes wants to be h1-sized. Until 2026-08-22 neither
               * pair did anything: the heading element rules sat outside
               * `@layer base` and outranked every utility, so `hero`
               * rendered identically to the default and the prop was
               * decorative. The non-hero pair is byte-for-byte the h2
               * default, so only `hero` moved — two call sites, both
               * panels that open a page. */
              "font-heading font-semibold text-balance text-foreground",
              hero ? "text-2xl tracking-[-0.035em]" : "text-lg tracking-[-0.028em]"
            )}
          >
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {actions && <div className={SPLIT_ACTIONS}>{actions}</div>}
    </div>
  );
}

const CARD_TONES = {
  default: "card-sheen glass-well",
  raised: "card-sheen glass-well",
  brand: "card-sheen glass-well ring-1 ring-primary/20",
  good: "bg-gain/10",
  warn: "bg-warning/10",
  bad: "bg-destructive/10",
  info: "bg-accent",
} as const;

export type CardTone = keyof typeof CARD_TONES;

/** A card inside a Panel. Interactive ones get the hover/press treatment. */
export function Card({
  tone = "default",
  interactive = false,
  className,
  children,
  ...rest
}: {
  tone?: CardTone;
  interactive?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  return (
    <div
      className={cn(
        "rounded-lg",
        NESTED_PAD,
        CARD_TONES[tone],
        interactive &&
          "transition hover:scale-[1.01] hover:bg-hover active:scale-[0.995]",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Quiet label above a value. Sentence case. Chrome floor is text-sm. */
/**
 * The one micro-label voice: mono, caps, letter-spaced, muted.
 *
 * Every place this is already used had decided a label belonged there —
 * over a figure in `Metric`, over a list in `ScanList`, "In the news",
 * "Price now", "Watching". They were sentence-case sans at the same size
 * and weight as the muted prose beside them, so they read as another line
 * of copy rather than as the scaffolding they are.
 *
 * Mono caps at 12px does the separating: it is unmistakably not prose, so
 * the eye skips it when reading and finds it when scanning. Tracking is
 * `0.1em` because caps set at normal tracking close up — the letterfit of
 * a face is drawn for mixed case.
 *
 * Deliberately `--muted-foreground`, not the accent. This lands on eight-plus
 * surfaces including four abreast in the dashboard's figure row, and an
 * accent on all of them would spend the app's one brand colour on
 * scaffolding. `NoteRows` is the tier that gets the accent, because there
 * the label is doing real work — telling two paragraphs apart.
 */
export function MicroLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    /*
     * Inline flow, not a flex row.
     *
     * As `flex items-center gap-1.5` the label text and its InfoTip were
     * two flex items sharing one line, so the moment the words needed a
     * second line the text blockified into a narrow column on the left
     * and the icon parked itself at the far right of the cell, centred
     * against both lines. "Of that, growth" on Growth did exactly that:
     * two stacked words hard left, an info dot floating off on the right
     * edge with nothing beside it.
     *
     * Inline, the icon is simply the thing after the last word, so it
     * follows the text onto whichever line the text ends on and the label
     * reads as one phrase at any width. `align-text-bottom` on the
     * trigger keeps it sitting on the caps rather than on the baseline.
     */
    <p
      className={cn(
        "min-w-0 font-mono text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground [&>[data-slot=info-tip]]:ml-1.5 [&>[data-slot=why-this]]:ml-1.5",
        className
      )}
    >
      {children}
    </p>
  );
}

const READING_LABEL_TONES = {
  /** Default. An observation, not a flag. */
  neutral: "text-foreground",
  /** A gap or risk worth acting on — same orange as every other caution use. */
  warn: "text-warning",
  /** A read that's working in your favor. */
  good: "text-gain",
} as const;

export type ReadingTone = keyof typeof READING_LABEL_TONES;

/**
 * Long sentences a person actually reads. A dark card that lifts off
 * the field, quiet label, warm type. Not a cream slab, and not loose
 * type sitting on the page.
 *
 * The label is one step up from body copy (text-base, not text-sm) so it
 * reads as a heading over the sentence below it instead of blending into
 * it — this is the one heading style for every "label + sentence" card in
 * the app (Thesis, Sell if, Worth noticing, What's missing, and so on).
 * `tone`/`icon` let two Reading tiles sitting side by side (an upside and
 * a downside, say) read as visibly different kinds of note, not just
 * different words.
 */
export function Reading({
  label,
  children,
  className,
  nested = false,
  tone = "neutral",
  icon,
  note,
}: {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Inside a Panel. No second card ring. */
  nested?: boolean;
  tone?: ReadingTone;
  icon?: ReactNode;
  /**
   * Where the sentence came from, when that is not the obvious answer.
   *
   * It sits opposite the label as a byline rather than under the sentence
   * as a second paragraph, which is the shape it wants: a reader looking
   * for it finds it on the same line that already says what kind of card
   * this is, and a reader who is not looking reads the sentence and stops.
   * Two or three words, in the mono caps label voice. Anything needing a
   * full sentence belongs in the body.
   */
  note?: ReactNode;
}) {
  const hasLabel = label != null && label !== "";
  const hasNote = note != null && note !== "";
  return (
    <div
      className={cn(
        nested
          ? "glass-well rounded-lg text-foreground"
          : "card-sheen glass rounded-xl text-foreground ring-1 ring-foreground/20",
        "p-6",
        className
      )}
    >
      {hasLabel || hasNote ? (
        <div className="flex items-center justify-between gap-3">
          {hasLabel ? (
            <div
              className={cn(
                "flex min-w-0 items-center gap-2 font-heading text-base font-semibold tracking-tight",
                READING_LABEL_TONES[tone]
              )}
            >
              {icon ? (
                <span
                  className="flex size-4 shrink-0 [&>svg]:size-4"
                  aria-hidden
                >
                  {icon}
                </span>
              ) : null}
              {label}
            </div>
          ) : null}
          {hasNote ? (
            typeof note === "string" ? (
              <MicroLabel className="shrink-0 text-muted-foreground/70">
                {note}
              </MicroLabel>
            ) : (
              <span className="shrink-0">{note}</span>
            )
          ) : null}
        </div>
      ) : null}
      <div
        className={cn(
          (hasLabel || hasNote) && "mt-2.5",
          "text-sm leading-relaxed text-foreground"
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Cashtags stay white. Up and down take gain and loss. */
export function InsightText({ text }: { text: string }) {
  const chunks = text.split(/(\$[A-Z][A-Z0-9.]{0,11})/g);
  return (
    <>
      {chunks.map((chunk, i) => {
        if (/^\$[A-Z][A-Z0-9.]{0,11}$/.test(chunk)) {
          return (
            <span key={i} className="font-semibold text-foreground">
              {chunk}
            </span>
          );
        }
        return <MoveTint key={i} text={chunk} />;
      })}
    </>
  );
}

function MoveTint({ text }: { text: string }) {
  return (
    <>
      {splitMoveTint(text).map((span, i) =>
        span.tone ? (
          <span
            key={i}
            className={span.tone === "up" ? "text-gain" : "text-loss"}
          >
            {span.text}
          </span>
        ) : (
          span.text
        )
      )}
    </>
  );
}

/** Ticker + line. Card header + Item (media, title, description, actions). */
export function ScanList({
  label,
  rows,
  onOpen,
  nested = false,
  className,
}: {
  label?: ReactNode;
  rows: { ticker: string; text: string; movePct?: number | null }[];
  onOpen?: (ticker: string) => void;
  /** Inside a Panel. No second card ring. */
  nested?: boolean;
  className?: string;
}) {
  const mixedListings = listingCurrenciesAreMixed(rows);
  const list = (
    <ItemGroup className={onOpen ? undefined : "gap-0"}>
      {rows.map((row, i) => (
        <Fragment key={row.ticker}>
          {!onOpen && i > 0 ? <ItemSeparator /> : null}
          <ScanRow
            ticker={row.ticker}
            text={row.text}
            movePct={row.movePct}
            mixedListings={mixedListings}
            onOpen={onOpen}
          />
        </Fragment>
      ))}
    </ItemGroup>
  );

  if (nested) {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        {label != null && label !== "" ? (
          <p className="text-sm font-semibold tracking-tight text-foreground">
            {label}
          </p>
        ) : null}
        {list}
      </div>
    );
  }

  return (
    <SurfaceCard className={className}>
      {label != null && label !== "" ? (
        <CardHeader>
          <CardTitle>{label}</CardTitle>
          <CardAction>
            <Badge variant="secondary">{rows.length}</Badge>
          </CardAction>
        </CardHeader>
      ) : null}
      <CardContent>{list}</CardContent>
    </SurfaceCard>
  );
}

function ScanMoveIcon({ movePct }: { movePct?: number | null }) {
  if (movePct != null && movePct < 0) return <TrendingDown />;
  if (movePct != null && movePct > 0) return <TrendingUp />;
  return <Minus />;
}

function ScanRow({
  ticker,
  text,
  movePct,
  mixedListings,
  onOpen,
}: {
  ticker: string;
  text: string;
  movePct?: number | null;
  mixedListings: boolean;
  onOpen?: (ticker: string) => void;
}) {
  const hasPct = movePct != null && Number.isFinite(movePct);
  const showMove = hasPct && movePct !== 0;
  const body = (
    <>
      {hasPct ? (
        <ItemMedia
          variant="icon"
          className={cn(
            "size-8 card-sheen glass-well rounded-lg",
            movePct < 0 && "text-loss",
            movePct > 0 && "text-gain"
          )}
        >
          <ScanMoveIcon movePct={movePct} />
        </ItemMedia>
      ) : null}
      <ItemContent>
        <ItemTitle>
          <TickerSymbol ticker={ticker} showCurrency={mixedListings} />
        </ItemTitle>
        <ItemDescription className="line-clamp-none">{text}</ItemDescription>
      </ItemContent>
      {(showMove || onOpen) ? (
        <ItemActions>
          {showMove ? (
            <Pill tone={movePct < 0 ? "bad" : "good"} className="font-mono">
              {signedPercent(movePct)}
            </Pill>
          ) : null}
          {onOpen ? (
            <ChevronRight
              className="size-4 text-muted-foreground transition-transform group-hover/scanrow:translate-x-0.5"
              aria-hidden
            />
          ) : null}
        </ItemActions>
      ) : null}
    </>
  );

  if (onOpen) {
    return (
      <Item
        variant="outline"
        asChild
        className="group/scanrow transition hover:scale-[1.01] hover:bg-muted active:scale-[0.99]"
      >
        <button
          type="button"
          onClick={() => onOpen(ticker)}
          className="cursor-pointer text-left"
        >
          {body}
        </button>
      </Item>
    );
  }

  return <Item className="px-0 py-2.5">{body}</Item>;
}

/** Label over a figure. Use in a grid inside a card, never as a lonely right-edge stack. */
export function Metric({
  label,
  children,
  hint,
  className,
  valueClassName,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <MicroLabel>{label}</MicroLabel>
      <p
        className={cn(FIGURE, "text-foreground", valueClassName)}
      >
        {children}
      </p>
      {hint != null && hint !== "" ? (
        <p className="mt-1 truncate text-sm tabular-nums text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Tap-to-open explainer. Portaled so a parent `overflow-hidden` cannot
 * clip it, and Radix keeps it inside the viewport.
 */
export function InfoTip({ text, label }: { text: string; label?: string }) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        data-slot="info-tip"
        aria-label={label ?? "What does this mean?"}
        className="relative inline-flex size-4 shrink-0 items-center justify-center align-text-bottom text-muted-foreground transition hover:text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="absolute -inset-3.5 lg:-inset-2.5" aria-hidden />
        <Info className="relative h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="center"
        className="w-64 max-w-[min(16rem,calc(100vw-1.5rem))] text-sm font-normal normal-case leading-relaxed tracking-normal"
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}

const HAIRLINE_TRACKS =
  "grid-cols-[repeat(var(--sg-m),minmax(0,1fr))] sm:grid-cols-[repeat(var(--sg-d),minmax(0,1fr))]";

function hairlineVars(
  mobile: number,
  desk: number,
  lg?: number
): CSSProperties {
  return {
    "--sg-m": String(mobile),
    "--sg-d": String(desk),
    ...(lg != null ? { "--sg-lg": String(lg) } : {}),
  } as CSSProperties;
}

/**
 * Equal cells, hairline gaps. Column count always divides the children,
 * so the last row never shows an empty box.
 */
export function HairlineGrid({
  children,
  className,
  preferred = 3,
  mobilePreferred,
  lgPreferred,
  fit = "fill",
  role,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  preferred?: number;
  mobilePreferred?: number;
  lgPreferred?: number;
  /** fill = chips (prefer a full row). cards = number tiles (prefer stacking). */
  fit?: "fill" | "cards";
  role?: string;
  ariaLabel?: string;
}) {
  const n = Children.count(children);
  const snap = fit === "cards" ? filledCardColumns : filledGridColumns;
  const mobile = snap(n, mobilePreferred ?? preferred);
  const desk = snap(n, preferred);
  const lg = lgPreferred != null ? snap(n, lgPreferred) : undefined;
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      className={cn(
        "grid gap-px overflow-hidden rounded-lg bg-border",
        HAIRLINE_TRACKS,
        lg != null && "lg:grid-cols-[repeat(var(--sg-lg),minmax(0,1fr))]",
        className
      )}
      style={hairlineVars(mobile, desk, lg)}
    >
      {children}
    </div>
  );
}

/**
 * Chart / theme legend. Swatch, label, value. No filled chips, so it
 * does not read as a row of buttons.
 *
 * No margin of its own. It carried an `mt-3`, and every call site added
 * another `mt-4` on top of that because three of the four containers it
 * lands in are already gapped columns — so the legend sat 40px under its
 * bar instead of 16. Outer spacing is the container's job: inside a
 * `Panel` the panel gap does it, and inside a hand-spaced section the call
 * site says `mt-4` and means it.
 */
export function SwatchLegend({
  items,
  className,
}: {
  items: {
    key: string;
    label: string;
    color: string;
    value: ReactNode;
  }[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-4", className)}>
      {items.map((item) => (
        <li key={item.key}>
          <Badge variant="outline" className="gap-2 font-normal">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-mono text-xs tabular-nums text-foreground">
              {item.value}
            </span>
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/** Separate cards with air between them. Use this for any 2–5 number row. */
export function Scoreboard({
  cols = 4,
  mobileCols,
  className,
  children,
}: {
  cols?: 1 | 2 | 3 | 4 | 5;
  /**
   * Force the phone count. The default pairs two-up, which is right for a
   * bare figure ("$629,907", "42%") and wrong the moment a cell carries a
   * sentence under it — two 123px columns turn one line of explanation
   * into eight. Pass 1 for those.
   */
  mobileCols?: 1 | 2;
  className?: string;
  children: ReactNode;
}) {
  const n = Children.count(children);
  const desk = filledCardColumns(n, cols);
  const mobilePreferred =
    mobileCols ?? (cols <= 1 ? 1 : cols === 3 ? 1 : Math.min(2, cols));
  const mobile = filledCardColumns(n, mobilePreferred);
  return (
    <div
      className={cn(
        "grid gap-4",
        HAIRLINE_TRACKS,
        className
      )}
      style={hairlineVars(mobile, desk)}
    >
      {children}
    </div>
  );
}

type ScoreProps = {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  /** Short scan lines under the figure. Prefer this over a paragraph `sub`. */
  bullets?: string[];
  explain?: string;
  tone?: "up" | "down";
  valueClassName?: string;
  subClassName?: string;
  bulletsClassName?: string;
  className?: string;
};

function scoreTone(tone?: "up" | "down") {
  if (tone === "up") return "text-gain";
  if (tone === "down") return "text-loss";
  return "text-foreground";
}

/** A cell inside Scoreboard. Same type as Stat. No extra box. */
export function Score({
  label,
  value,
  sub,
  bullets,
  explain,
  tone,
  valueClassName,
  subClassName,
  bulletsClassName,
  className,
}: ScoreProps) {
  const reading = Boolean(bullets && bullets.length > 0);
  /*
   * `mt-auto` — the note sits on the cell's floor, not under its figure.
   *
   * A `Scoreboard` row stretches every cell to the tallest, so the third
   * line of each one started wherever that cell's own figure happened to
   * end: a one-line figure put its note higher than a wrapped one, and a
   * `Pill` in the slot (28px) sat lower than a line of text (20px) beside
   * it. Across a four-cell row that reads as four different baselines for
   * what is one row of the same thing — the "things can't start from a
   * different row" complaint the Circle scores had.
   *
   * `pt-*` rather than `mt-*` for the gap, because `mt-auto` is the
   * margin-top and would swallow it.
   */
  const noteClass = cn(
    "mt-auto",
    reading ? "pt-3 text-sm leading-relaxed" : "pt-2 text-sm leading-snug",
    subClassName ?? "text-muted-foreground"
  );
  return (
    <div className={cn(SCORE_CELL, className)}>
      {/*
        * Inline, for the same reason `MicroLabel` is — see the note there.
        * A flex row parked the info dot on the far right of the cell as
        * soon as the label needed two lines.
        */}
      {reading ? (
        <p className="min-w-0 text-sm font-semibold tracking-tight text-foreground [&>[data-slot=info-tip]]:ml-1.5 [&>[data-slot=why-this]]:ml-1.5">
          {label}
          {explain && <InfoTip text={explain} />}
        </p>
      ) : (
        <MicroLabel>
          {label}
          {explain && <InfoTip text={explain} />}
        </MicroLabel>
      )}
      <p
        className={cn(
          reading ? STATUS : DISPLAY,
          valueClassName ?? scoreTone(tone)
        )}
      >
        {value}
      </p>
      {reading && bullets ? (
        <ul className={cn(noteClass, "flex flex-col gap-1", bulletsClassName)}>
          {bullets.map((line, i) => (
            <li key={`${i}:${line}`} className="flex gap-1.5">
              <span
                aria-hidden
                className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-current opacity-50"
              />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : (
        sub != null && <p className={noteClass}>{sub}</p>
      )}
    </div>
  );
}

/** One boxed number, when it is not part of a row. */
export function Stat(props: ScoreProps) {
  return (
    <Scoreboard cols={1} className={props.className}>
      <Score {...props} className={undefined} />
    </Scoreboard>
  );
}

/**
 * The item inside a `Segmented`. Off = quiet type on the track. Hover =
 * brighter type plus a faint wash. On = the filled `--primary` pill, the
 * same "you are here" the dock's active cell paints. No border — an
 * outlined item inside a bordered track stacks two strokes.
 *
 * It was the `--selected` white veil with `--primary` text, and it read
 * flat for a reason worth keeping written down: **the warm accent cannot
 * be expressed as a dark tint.** Yellow only reads as yellow while it is
 * light; at 26% white over a near-black field the pill lands on mid-grey,
 * the ambient warm lobe pushes it to khaki, and dim yellow type on khaki
 * is barely a contrast step at all. Rendered side by side, a warm veil at
 * 18%, 30% and 45% were all muddier than the original, and a neutral veil
 * with white type was clean but colourless. The accent either arrives at
 * full lightness or it stays out of the fill.
 *
 * Filled primary is loud enough that it belongs to state, not decoration:
 * a segmented item is framed by its own track, so it reads as the chosen
 * one of a set rather than as a loose button. `WorkspaceSwitcher` is the
 * one "selected" that deliberately does NOT fill — it sits in the header
 * bar beside the page's real CTA, and two solid yellow controls there
 * both shout "press me". See the note on it.
 */
const SEGMENTED_ITEM =
  "rounded-md border border-transparent text-muted-foreground shadow-none group-data-[spacing=0]/toggle-group:rounded-md group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-md group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-md hover:bg-hover hover:text-foreground data-[state=on]:card-sheen data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground";

/**
 * The one segmented toggle. Overview's today/lifetime, the drawer's 3y/5y,
 * and the scenario picker used to be four hand-rolled copies with three
 * different active states. Labels always paint in full: compact pills size
 * to the words, filled grids wrap instead of ellipsizing.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  ariaLabel,
  className,
  columns,
  look = "grid",
}: {
  options: readonly { id: T; label: string; title?: string }[];
  value: T | null;
  onChange: (id: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  /**
   * Equal cells that fill the width. The count is snapped so the last
   * row is always full. Omit for a compact inline toggle.
   */
  columns?: number;
  /** grid = hairline table. buttons = separate rounded controls. */
  look?: "grid" | "buttons";
}) {
  const fill = columns != null && columns > 0;
  if (!fill) {
    return (
      <ToggleGroup
        type="single"
        value={value ?? undefined}
        onValueChange={(next) => {
          if (next) onChange(next as T);
        }}
        spacing={0}
        disabled={disabled}
        aria-label={ariaLabel}
        className={cn(
          "card-sheen glass-well max-w-full min-w-0 p-[3px]",
          className
        )}
      >
        {options.map((o) => (
          <ToggleGroupItem
            key={o.id}
            value={o.id}
            title={o.title}
            className={cn(
              "min-w-0 flex-1 px-1.5",
              SEGMENTED_ITEM,
              "touch-target md:min-h-0 md:min-w-0"
            )}
          >
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    );
  }
  const cols = filledGridColumns(options.length, columns);
  const buttons = look === "buttons";
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "grid w-full min-w-0 max-w-full",
        buttons
          ? "gap-2"
          : "gap-px overflow-hidden rounded-lg bg-border",
        className
      )}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            disabled={disabled}
            title={o.title}
            onClick={() => onChange(o.id)}
            className={cn(
              "flex min-w-0 items-center justify-center px-2 text-sm font-medium transition-all disabled:opacity-40",
              buttons
                ? "touch-target min-h-9 rounded-lg border"
                : "touch-target py-2.5 md:min-h-0 md:min-w-0",
              /*
               * Same filled pill as the compact look — see `SEGMENTED_ITEM`
               * for why the accent has to arrive at full lightness rather
               * than as a veil. Before that it was `bg-background` — pure
               * black — sitting between grey cells, so on a black page the
               * chosen option looked like a gap punched through the
               * control.
               *
               * `border-transparent`, not `border-input`: the border box
               * still paints the fill under a transparent border, so the
               * cell keeps the unselected cells' 1px and does not shift,
               * while a grey stroke around a yellow fill would read as a
               * dropped shadow of the old outline.
               */
              on
                ? buttons
                  ? "card-sheen border-transparent bg-primary text-primary-foreground shadow-sm"
                  : "card-sheen bg-primary text-primary-foreground"
                : buttons
                  ? "glass border-input text-muted-foreground hover:text-foreground"
                  : "veil-hover glass text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="block max-w-full text-center leading-snug break-words">
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const PILL_TONES = {
  neutral: "border-border bg-muted/50 text-muted-foreground",
  brand: "border-transparent bg-primary text-primary-foreground",
  good: "border-gain/40 bg-gain/20 text-gain",
  warn: "border-caution/50 bg-caution/20 text-caution",
  bad: "border-destructive/40 bg-destructive/20 text-destructive",
  info: "border-border bg-muted text-foreground",
} as const;

export type PillTone = keyof typeof PILL_TONES;

/**
 * Status chip. Same size as Button sm (h-7, text-sm), not the tiny
 * shadcn Badge default (h-5, text-xs). That size is for table metadata.
 * These sit in card headers and have to read at a glance.
 */
export function Pill({
  tone = "neutral",
  title,
  className,
  children,
}: {
  tone?: PillTone;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  const variant =
    tone === "bad" ? "destructive" : tone === "brand" ? "default" : "outline";
  return (
    <Badge
      title={title}
      variant={variant}
      className={cn(
        "h-7 rounded-lg px-2.5 text-sm font-medium [&>svg]:size-3.5!",
        PILL_TONES[tone],
        className
      )}
    >
      {children}
    </Badge>
  );
}

/** What a panel shows when it has nothing to show. Says what to do next. */
export function EmptyState({
  title,
  detail,
  action,
  className,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Empty
      className={cn(
        "glass flex-none border border-dashed border-border px-8 py-8",
        className
      )}
    >
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {detail ? <EmptyDescription>{detail}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

/**
 * What a room shows when the thing it exists to show would not load.
 *
 * Every room used to render a failed load as `<p class="text-sm
 * text-loss">{error}</p>` and nothing else. On a page whose entire content
 * is that one fetch — the Fund room, most of all — the result was a black
 * screen with a short red phrase in the top-left corner and no way
 * forward. That is indistinguishable from a crash, and the most common
 * cause is the most recoverable one: a session that lapsed while the tab
 * sat open.
 *
 * So this states the problem in the same voice as the rest of the app and
 * always carries the action, because a dead end is the one thing a reader
 * cannot be asked to solve. `EmptyState` rather than a new shape: a room
 * with nothing in it and a room that could not load are the same silhouette
 * to a reader, and the dashed border already reads as "not your data".
 *
 * `message` is expected to have been through `plainError`, which is what
 * keeps a Postgres constraint or a bare "Sign in required" out of here.
 */
export function LoadError({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <EmptyState
      className={className}
      title="That didn't load"
      detail={message}
      action={
        onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RotateCw data-icon="inline-start" />
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}

/**
 * A short label in mono caps, and the prose it introduces.
 *
 * For the case where a card stacks several paragraphs that mean different
 * things. Left to themselves they render as a wall of identical grey text
 * and the reader has to work out which sentence is the suggestion, which is
 * their own note, and which is the condition that would change the answer.
 * A label in the gutter answers that before the sentence is read.
 *
 * Rules that keep this from becoming decoration:
 *
 * - **Only where the label says something the prose does not.** If the
 *   sentence already opens with "Breaks if", the label is the sentence
 *   repeated and one of the two should go.
 * - **Two or more rows, or none.** A single labelled paragraph on a card is
 *   a label with nothing to distinguish itself from; the pattern earns its
 *   place by letting a reader tell rows apart.
 * - The label is `aria-hidden` and the row is a `<dt>`/`<dd>` pair, so a
 *   screen reader gets the association from the markup rather than hearing
 *   a stray fragment of caps.
 *
 * Labels are plain language, never market slang — "BREAKS IF", not "INVALIDATION".
 */
export function NoteRows({
  rows,
  className,
}: {
  rows: Array<{ label: string; body: ReactNode }>;
  className?: string;
}) {
  const shown = rows.filter((r) => r.body != null && r.body !== "");
  if (shown.length < 2) {
    // One row is not a list. Render it as the plain paragraph it is.
    const only = shown[0];
    return only ? (
      <p className={cn("text-sm leading-relaxed text-muted-foreground", className)}>
        {only.body}
      </p>
    ) : null;
  }
  return (
    <dl className={cn("flex flex-col gap-2.5", className)}>
      {shown.map((r) => (
        <div
          key={r.label}
          className="grid gap-x-6 gap-y-0.5 sm:grid-cols-[7rem_minmax(0,1fr)]"
        >
          <dt
            className="font-mono text-[11px] font-medium uppercase leading-[1.7] tracking-[0.1em] text-primary"
            aria-hidden
          >
            {r.label}
          </dt>
          <dd className="m-0 text-sm leading-relaxed text-muted-foreground">
            {r.body}
          </dd>
        </div>
      ))}
    </dl>
  );
}
