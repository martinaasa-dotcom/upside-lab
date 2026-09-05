"use client";

import { useSyncExternalStore } from "react";
import { ExternalLink, Info } from "lucide-react";
import { MicroLabel } from "@/components/ui/Panel";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/format";
import { describeModelRun } from "@/lib/ai/model-label";
import {
  MODEL_CALIBRATION,
  provenanceWhen,
  type Provenance,
  type ProvenanceMaker,
} from "@/lib/provenance";

/**
 * The information mark that sits beside any figure a model had a hand in.
 *
 * It was an eye for a long time, on the argument that a reader scanning a
 * page should be able to tell a figure that was reasoned from one that was
 * counted without opening anything. That cost more than it bought: an eye
 * is not what anybody has been taught to press for an explanation, so the
 * one control in the app that answers "where did this come from" was the
 * one control nobody recognised. It is the same circled `i` as `InfoTip`
 * and `Explain` now, at the same size and in the same muted colour, so
 * every "tell me more" in the product is one glyph. What separates them is
 * what opens, which is the half the reader actually reads.
 *
 * What is behind it is written for one particular reader: somebody who does
 * not trust generated text and is looking for the place this app oversells
 * itself. So it is ordered the way that person reads. Who made it, which
 * model, what it was handed, where each of those came from, what this app
 * did to the answer afterwards, what it cannot know, and when. The
 * uncomfortable parts are not at the bottom.
 *
 * Content lives in `src/lib/provenance.ts`, not in the call site, so the
 * answer to the same question is the same answer everywhere.
 */

const MADE_BY: Record<ProvenanceMaker, string> = {
  model: "Written by a model",
  arithmetic: "Worked out by arithmetic",
  market: "Straight from the market",
};

function Dot({ muted }: { muted?: boolean }) {
  return (
    <span
      className={cn(
        "mr-1.5 inline-block size-1 shrink-0 -translate-y-0.5 rounded-full align-middle",
        muted ? "bg-muted-foreground/50" : "bg-primary"
      )}
      aria-hidden
    />
  );
}

/**
 * Below `md`, which is the width at which a floating panel stops being the
 * right container for this.
 *
 * The full answer runs to about four screens on a phone, because the honest
 * answer to "where did this come from" is long and shortening it is the one
 * thing this surface must not do. In a popover pinned to a card that reads
 * as a paragraph cut off mid-sentence: measured at 390x844, 1710px of
 * content in a 448px window, with nothing on screen saying it continues. A
 * bottom sheet is the app's own answer to a long read on a phone, and it
 * comes with the height, the grabbable edge and the scroll the content
 * actually needs. Above `md` there is room for the popover, and a popover
 * beside the number it explains is better than a panel that covers it.
 */
const NARROW = "(max-width: 47.999rem)";

function useNarrow(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(NARROW);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(NARROW).matches,
    // The server has no width. It renders the popover, and the sheet takes
    // over on hydration, which is before anybody can have pressed the mark.
    () => false
  );
}

function WhyThisMark({ className }: { className?: string }) {
  return (
    <>
      {/* Coarse pointers get a real target without the icon growing. */}
      <span className="absolute -inset-3.5 lg:-inset-2.5" aria-hidden />
      <Info className={cn("relative size-3.5", className)} aria-hidden />
    </>
  );
}

const TRIGGER_CLASS =
  "relative inline-flex size-4 shrink-0 items-center justify-center align-text-bottom text-muted-foreground outline-none transition hover:text-foreground focus-visible:text-foreground";

function WhyThisBody({ provenance }: { provenance: Provenance }) {
  const when = provenanceWhen(provenance.at);
  const madeBy = MADE_BY[provenance.maker];
  /*
   * Null when the run never recorded a model, which happens on an older
   * saved answer and on anything a model did not write. Nothing is guessed
   * here: naming the model at the head of the chain when a different one
   * actually answered would make this panel the thing it exists to prevent.
   */
  const model =
    provenance.maker === "model" ? describeModelRun(provenance.model) : null;
  const sources = provenance.sources ?? [];
  const steps = provenance.steps ?? [];

  return (
    <>
      <MicroLabel>{madeBy}</MicroLabel>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {provenance.headline}
          </p>

          {model ? (
            <>
              <MicroLabel className="mt-5">Which model</MicroLabel>
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                {model}
                <span className="text-muted-foreground">
                  {". "}
                  {MODEL_CALIBRATION}
                </span>
              </p>
            </>
          ) : null}

          {provenance.inputs.length > 0 ? (
            <>
              <MicroLabel className="mt-5">What it was given</MicroLabel>
              <ul className="mt-2 flex flex-col gap-2">
                {provenance.inputs.map((input) => (
                  <li
                    key={input.what}
                    className="text-sm leading-relaxed text-foreground"
                  >
                    <Dot />
                    {input.what}
                    {input.detail ? (
                      <span className="text-muted-foreground">
                        {": "}
                        {input.detail}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {sources.length > 0 ? (
            <>
              <MicroLabel className="mt-5">Where those came from</MicroLabel>
              <ul className="mt-2 flex flex-col gap-2">
                {sources.map((source) => (
                  <li
                    key={`${source.name}-${source.what}`}
                    className="text-sm leading-relaxed text-foreground"
                  >
                    <Dot />
                    {source.href ? (
                      <a
                        href={source.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-baseline gap-1 underline decoration-border underline-offset-4 transition hover:decoration-foreground"
                      >
                        {source.name}
                        <ExternalLink className="size-3 shrink-0" aria-hidden />
                      </a>
                    ) : (
                      source.name
                    )}
                    <span className="text-muted-foreground">
                      {": "}
                      {source.what}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {steps.length > 0 ? (
            <>
              <MicroLabel className="mt-5">How the number was made</MicroLabel>
              <ol className="mt-2 flex flex-col gap-2">
                {steps.map((step, i) => (
                  <li
                    key={step}
                    className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
                  >
                    <span
                      className="shrink-0 font-mono text-xs leading-6 tabular-nums text-primary"
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : null}

          {provenance.blindSpots.length > 0 ? (
            <>
              <MicroLabel className="mt-5">What it cannot know</MicroLabel>
              <ul className="mt-2 flex flex-col gap-2">
                {provenance.blindSpots.map((spot) => (
                  <li
                    key={spot}
                    className="text-sm leading-relaxed text-muted-foreground"
                  >
                    <Dot muted />
                    {spot}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

      {when || provenance.yours ? (
        <p className="mt-5 border-t border-border pt-3 text-sm leading-relaxed text-muted-foreground">
          {when}
          {when && provenance.yours ? ". " : ""}
          {provenance.yours}
        </p>
      ) : null}
    </>
  );
}

export function WhyThis({
  provenance,
  className,
  side = "bottom",
  align = "end",
}: {
  provenance: Provenance;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}) {
  const narrow = useNarrow();
  /*
   * The label is the whole headline rather than the two-word title, because
   * a screen reader landing on a row of these needs to know which number
   * each one belongs to before deciding to open it.
   */
  const label = `${provenance.title}. ${provenance.headline}`;

  if (narrow) {
    return (
      <Sheet>
        <SheetTrigger
          type="button"
          data-slot="why-this"
          aria-label={label}
          title={provenance.title}
          className={cn(TRIGGER_CLASS, className)}
          onClick={(e) => e.stopPropagation()}
        >
          <WhyThisMark />
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="max-h-[88svh] gap-0 rounded-t-2xl p-0"
        >
          <SheetHeader className="gap-0 pb-0">
            <SheetTitle className="sr-only">{provenance.title}</SheetTitle>
          </SheetHeader>
          {/*
            Padded to the bottom of the safe area rather than to the dock:
            a sheet sits over the dock, so the only thing under the last
            line is the phone's own home indicator.
          */}
          <div className="scroll-host min-h-0 flex-1 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1">
            <WhyThisBody provenance={provenance} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        data-slot="why-this"
        aria-label={label}
        title={provenance.title}
        className={cn(TRIGGER_CLASS, className)}
        onClick={(e) => e.stopPropagation()}
      >
        <WhyThisMark />
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className="w-[21rem] max-w-[min(21rem,calc(100vw-1.5rem))] gap-0 overflow-y-hidden p-0 font-normal normal-case tracking-normal"
      >
        {/*
          Bounded by the room the placement actually found, not by the
          window: a popover the height of 72svh still hangs off the top of
          a short window, and the reader cannot scroll to a first paragraph
          that is above the screen. `PopoverContent` carries the same
          ceiling, so the scroller inside it exactly fills the panel and
          there is never a second scrollbar. The `svh` value is the
          fallback for the frame before Radix has measured.
        */}
        <div className="scroll-host max-h-[min(38rem,var(--radix-popover-content-available-height,72svh))] p-4">
          <WhyThisBody provenance={provenance} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
