"use client";

import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { cn } from "@/lib/format";
import { Lock, Unplug, Compass } from "lucide-react";

/*
  Three promises, read at a glance.

  This replaced the ground rules, which were four claims played one at a
  time as a true-or-not quiz with a paragraph of answer under each. The
  idea was sound (the two beliefs people arrive with are the two that are
  wrong: that it connects to their broker, and that it will tell them what
  to buy) and the delivery was four screens of reading inside one. What a
  reader needs from this moment is the three facts, said so they can be
  seen in one look: a large mark, a short line, and one quieter line under
  it.

  Every line is something the app can be checked against. Nothing here asks
  for a password; no screen says buy or sell, and the legal line is the
  product's own; a portfolio is private until an invite is accepted, and
  signing in never puts anybody in a circle.
*/

const PROMISES = [
  {
    icon: Unplug,
    title: "Nothing to connect",
    line: "No passwords. You type what you own, paste it, or send a picture.",
  },
  {
    icon: Compass,
    title: "It never tells you what to buy",
    line: ADVICE_DISCLAIMER_SHORT,
  },
  {
    icon: Lock,
    title: "Private until you share it",
    line: "Nobody sees your portfolio unless you invite them, and signing in never puts you in a circle.",
  },
] as const;

export function PromisesScreen() {
  return (
    <ul className="flex flex-col gap-3">
      {PROMISES.map((p, i) => (
        <li
          key={p.title}
          className={cn(
            "tour-rise card-sheen glass flex items-start gap-4 rounded-2xl p-4 ring-1 ring-foreground/15"
          )}
          style={{ ["--rise" as string]: i }}
        >
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"
            aria-hidden
          >
            <p.icon className="size-5" strokeWidth={2.2} />
          </span>
          <span className="flex min-w-0 flex-col gap-1 pt-0.5">
            <span className="font-heading text-base font-semibold tracking-tight text-foreground">
              {p.title}
            </span>
            <span className="text-sm leading-snug text-muted-foreground">
              {p.line}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
