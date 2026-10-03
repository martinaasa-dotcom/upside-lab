"use client";

import { Card, MicroLabel } from "@/components/ui/Panel";
import type { BriefState } from "@/lib/company/brief-store";
import { briefStatusCopy } from "@/lib/company/brief-status-copy";
import { cn } from "@/lib/format";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";

/**
 * One line, above the written argument, saying how current it is.
 *
 * See `brief-status-copy.ts` for why this exists at all: a page that keeps
 * its argument until something happens to the company has to say when it
 * was written and what, if anything, has happened since. Quiet when the
 * argument stands, a warning rule on the left when it does not, and a
 * spinner while a new one is being written for the reader in front of it.
 * Never a fill: status is a border accent in this app, not a wash.
 */
export function BriefStatus({
  state,
  ticker,
  briefAt,
  code,
  rewriting = false,
  failed = false,
}: {
  state: BriefState;
  ticker: string;
  briefAt: string | null;
  code?: string;
  rewriting?: boolean;
  failed?: boolean;
}) {
  const copy = briefStatusCopy({ state, ticker, briefAt, code, rewriting, failed });
  if (!copy) return null;
  const Icon = rewriting && !failed ? Loader2 : copy.changed ? Clock : CheckCircle2;
  return (
    <Card
      className={cn(
        "flex items-start gap-3",
        copy.changed && "border-l-2 border-l-warning"
      )}
      role="status"
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          copy.changed ? "text-warning" : "text-muted-foreground",
          rewriting && !failed && "animate-spin motion-reduce:animate-none"
        )}
        aria-hidden
      />
      <div className="flex min-w-0 flex-col gap-1">
        <MicroLabel>{copy.label}</MicroLabel>
        <p className="text-sm leading-relaxed text-muted-foreground">{copy.text}</p>
      </div>
    </Card>
  );
}
