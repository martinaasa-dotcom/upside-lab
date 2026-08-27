"use client";

import { Eye } from "lucide-react";
import { MicroLabel } from "@/components/ui/Panel";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/format";
import { provenanceWhen, type Provenance } from "@/lib/provenance";

/**
 * The eye that sits beside any figure a model had a hand in.
 *
 * It is deliberately its own glyph rather than the `InfoTip` circle. Those
 * two are answering different questions: an info dot explains what a word
 * means, and this says who made the number and what they could see when
 * they made it. Sharing one icon would mean a reader could not tell, at a
 * glance down a page, which figures were reasoned and which were counted,
 * which is the whole point. So the eye appears on exactly the surfaces a
 * model touched and nowhere else, and its absence is information too.
 *
 * Content lives in `src/lib/provenance.ts`, not in the call site, so the
 * answer to the same question is the same answer everywhere.
 */
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
  const when = provenanceWhen(provenance.at);
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        data-slot="why-this"
        aria-label={`${provenance.title}. ${provenance.headline}`}
        title={provenance.title}
        className={cn(
          "relative inline-flex size-4 shrink-0 items-center justify-center align-text-bottom text-muted-foreground outline-none transition hover:text-foreground focus-visible:text-foreground",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Coarse pointers get a real target without the icon growing. */}
        <span className="absolute -inset-3.5 lg:-inset-2.5" aria-hidden />
        <Eye className="relative size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className="w-[20rem] max-w-[min(20rem,calc(100vw-1.5rem))] gap-0 p-0 font-normal normal-case tracking-normal"
      >
        <div className="scroll-host max-h-[min(26rem,70svh)] p-4">
          <MicroLabel>
            {provenance.maker === "model" ? "Written by a model" : "Worked out"}
          </MicroLabel>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {provenance.headline}
          </p>

          {provenance.inputs.length > 0 ? (
            <>
              <MicroLabel className="mt-5">What went in</MicroLabel>
              <ul className="mt-2 flex flex-col gap-2">
                {provenance.inputs.map((input) => (
                  <li
                    key={input.what}
                    className="text-sm leading-relaxed text-foreground"
                  >
                    <span className="mr-1.5 inline-block size-1 shrink-0 -translate-y-0.5 rounded-full bg-primary align-middle" />
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

          {provenance.blindSpots.length > 0 ? (
            <>
              <MicroLabel className="mt-5">What it cannot know</MicroLabel>
              <ul className="mt-2 flex flex-col gap-2">
                {provenance.blindSpots.map((spot) => (
                  <li
                    key={spot}
                    className="text-sm leading-relaxed text-muted-foreground"
                  >
                    <span className="mr-1.5 inline-block size-1 shrink-0 -translate-y-0.5 rounded-full bg-muted-foreground/50 align-middle" />
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
