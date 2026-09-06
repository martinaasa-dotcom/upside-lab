"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Landmark,
  PieChart,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Explain } from "@/components/ui/Explain";
import { MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import {
  alertDestination,
  alertSinceLine,
  type AlertKind,
  type UpsideAlert,
} from "@/lib/alerts";
import { cashtag, cn } from "@/lib/format";
import type { MarginToneName } from "@/lib/margin-health";

/**
 * The one card every one of these four facts is drawn as.
 *
 * Status is a ring, never a tinted fill, and a card that is red whatever
 * the arithmetic says is a card the reader learns to swipe past. See
 * `margin-health.ts` for where the tone comes from on the borrowed-money
 * one, and AGENTS.md on card washes for why none of these is a wash.
 */
export const TONE_RING: Record<MarginToneName, string> = {
  neutral: "ring-foreground/20",
  warning: "ring-warning/35",
  loss: "ring-destructive/30",
};

export const TONE_GLYPH: Record<MarginToneName, string> = {
  neutral: "bg-muted text-muted-foreground",
  warning: "bg-warning/15 text-warning",
  loss: "bg-loss/15 text-loss",
};

/**
 * A glyph per kind, so a page of these can be read down the left edge.
 *
 * The alarm triangle is reserved for borrowed money that has reached a
 * tier where the word "margin call" is in the copy. A results date and a
 * large holding are calm facts and get calm glyphs.
 */
export const KIND_GLYPH: Record<AlertKind, typeof Landmark> = {
  results: CalendarDays,
  strike: Target,
  margin: Landmark,
  concentration: PieChart,
  ladder: Target,
};

/**
 * What the one navigational button on a card says.
 *
 * The borrowed-money card says "Edit cash" rather than anything promising
 * more detail, because this card already *is* the detail: the size, the
 * distance to the broker's floor and the floor it assumed are all on it.
 * On Home the card is a summary and its tap opens that detail instead;
 * here there is nothing further to open, and a button that leads to a form
 * should say it leads to a form.
 *
 * A price-plan card says Research rather than the bare ticker, because
 * that is where the level it is repeating can be changed.
 */
export function alertOpenLabel(alert: UpsideAlert): string {
  const where = alertDestination(alert);
  if (where === "research")
    return `Open Research on ${cashtag(alert.ticker as string)}`;
  if (where === "pulse") return `Open ${alert.ticker}`;
  if (where === "cash") return "Edit cash";
  return "Open Overview";
}

export function AlertCard({
  alert,
  firstSeen,
  onOpen,
  onDismiss,
  className,
}: {
  alert: UpsideAlert;
  /** When this condition was first true, from `alert-dismiss.ts`. */
  firstSeen?: number | null;
  onOpen: () => void;
  onDismiss: () => void;
  className?: string;
}) {
  const tone: MarginToneName = alert.tone ?? "neutral";
  const Glyph =
    tone === "neutral" ? (KIND_GLYPH[alert.kind] ?? Landmark) : AlertTriangle;
  const since = alertSinceLine(firstSeen);

  return (
    <article
      className={cn(
        "card-sheen glass w-full rounded-xl p-4 ring-1 sm:p-5",
        /*
          A card arrives where it is going to live rather than only as a
          toast that leaves. `motion-safe` alone, because an alert sliding
          into place is decoration and a reader who asked for less motion
          should simply find it already there.
        */
        "motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-300",
        TONE_RING[tone],
        className
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            TONE_GLYPH[tone]
          )}
        >
          <Glyph className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {alert.title}
            {alert.term ? (
              <>
                {" "}
                <Explain term={alert.term} {...(alert.explain ?? {})} />
              </>
            ) : null}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {alert.detail}
          </p>
          {alert.learn ? (
            <p className="card-sheen glass-well mt-3 rounded-lg p-3 text-sm leading-relaxed text-foreground">
              {alert.learn}
            </p>
          ) : null}
          {since ? (
            <p className="mt-3 text-xs text-muted-foreground">{since}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <Button size="sm" variant="ghost" onClick={onOpen}>
          {alertOpenLabel(alert)}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      </div>
    </article>
  );
}

/**
 * The stack, and the reason it is a component rather than a `map`.
 *
 * A dismissed card used to disappear in one frame, which reads as the app
 * losing the card rather than the reader putting it away. Here the row
 * collapses its own height over `LEAVE_MS` and the rest of the stack
 * settles into the gap. The row owns the spacing (`pb-4` inside the
 * collapsing box) rather than a `gap` on the list, because a gap belongs to
 * the container and would be left behind by a row that has gone to nothing.
 */
const LEAVE_MS = 200;

export function AlertStack({
  alerts,
  firstSeen,
  onOpen,
  onDismiss,
}: {
  alerts: UpsideAlert[];
  firstSeen: Record<string, { first: number; last: number }>;
  onOpen: (alert: UpsideAlert) => void;
  onDismiss: (id: string) => void;
}) {
  const [leaving, setLeaving] = useState<string[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) window.clearTimeout(id);
    };
  }, []);

  const dismiss = (id: string) => {
    setLeaving((prev) => (prev.includes(id) ? prev : [...prev, id]));
    const handle = window.setTimeout(() => {
      onDismiss(id);
      setLeaving((prev) => prev.filter((x) => x !== id));
    }, LEAVE_MS);
    timers.current.push(handle);
  };

  /*
    Capped, because these cards are prose rather than a table. At 1280 a
    full-width card runs the borrowed-money paragraph to about 1,080px,
    which is roughly 160 characters a line and past the point where a
    reader loses the start of the next one. Every other room here fills the
    width because it is showing figures in columns.
  */
  return (
    <div className="flex max-w-3xl flex-col">
      {alerts.map((a) => (
        <div
          key={a.id}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:duration-0",
            leaving.includes(a.id)
              ? "grid-rows-[0fr] opacity-0"
              : "grid-rows-[1fr] opacity-100"
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="pb-4">
              <AlertCard
                alert={a}
                firstSeen={firstSeen[a.id]?.first ?? null}
                onOpen={() => onOpen(a)}
                onDismiss={() => dismiss(a.id)}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * What the room says before it knows.
 *
 * It used to say "Nothing needs your attention right now." on the first
 * paint, while the holdings, the prices and the results dates were all
 * still on their way, and then contradict itself with a toast two seconds
 * later. Saying nothing yet is the honest answer and it is also the short
 * one, so it is two grey lines rather than a spinner.
 */
export function AlertsChecking() {
  return (
    <Panel className="max-w-3xl">
      <PanelHeader
        title="Worth a look"
        subtitle="Checking what you own against today's prices."
      />
      <div className="flex flex-col gap-3" aria-hidden>
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    </Panel>
  );
}

/** The resting state, once all three inputs have actually answered. */
export function AlertsQuiet({
  onOpenPulse,
  onOpenHome,
}: {
  onOpenPulse?: () => void;
  onOpenHome: () => void;
}) {
  return (
    <Panel className="max-w-3xl">
      <PanelHeader
        title="Nothing to look at today"
        subtitle="This page fills up on its own. Nothing here means nothing has changed enough to be worth your morning."
      />
      <div>
        <MicroLabel>What this page watches</MicroLabel>
        <ul className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
          <li>A company you own about to share its quarterly results.</li>
          <li>A share reaching a price you wrote down for it.</li>
          <li>Borrowed money growing large next to what you own.</li>
          <li>One holding becoming most of your portfolio.</li>
        </ul>
      </div>
      <div className="flex flex-wrap gap-2">
        {onOpenPulse ? (
          <Button variant="outline" size="sm" onClick={onOpenPulse}>
            Open Pulse
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onOpenHome}>
          Back to Home
        </Button>
      </div>
    </Panel>
  );
}
