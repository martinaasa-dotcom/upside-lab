"use client";

import { Switch } from "@/components/ui/switch";
import { FieldLabel } from "@/components/ui/field";
import { SUNDAY_EMAIL_LINE } from "@/lib/product";
import { Activity, MessageCircle, Plus } from "lucide-react";

/*
  The last screen, and the only one that looks forward.

  It used to be a checklist of four sentences with the first one already
  ticked, under a heading, over the email switch and its own paragraph.
  Every line was true and the screen was still a page of reading at the
  moment somebody wants to start. So it is three things to try, as a mark
  and a few words each, and the one switch.

  Two promises are exact here. The description of the email is
  `SUNDAY_EMAIL_LINE`, which is the same sentence the landing page and
  Account print, so nobody is told two different things about one mail.
  And the one other mail this app can send is admitted out loud: a reader
  whose portfolio is still empty a week from now gets a single reminder,
  which an old version of this screen denied in as many words while a cron
  sent it.
*/

const NEXT = [
  { icon: Activity, text: "Open Pulse after the market shuts" },
  { icon: MessageCircle, text: "Ask Margus about anything you own" },
  { icon: Plus, text: "Add the next company from Home" },
] as const;

export function FirstWeekScreen({
  noteSunday,
  onNoteSunday,
}: {
  noteSunday: boolean;
  onNoteSunday: (next: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-center py-1" aria-hidden>
        <svg viewBox="0 0 64 64" className="tour-done size-16">
          <circle
            cx="32"
            cy="32"
            r="29"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2.5"
            pathLength={1}
            className="tour-done-ring"
          />
          <path
            d="M20 33 l8 8 l16 -18"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            className="tour-done-tick"
          />
        </svg>
      </div>

      <ul className="flex flex-col gap-2">
        {NEXT.map((step, i) => (
          <li
            key={step.text}
            className="tour-rise card-sheen glass-well flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ ["--rise" as string]: i }}
          >
            <step.icon className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="text-sm text-foreground">{step.text}</span>
          </li>
        ))}
      </ul>

      <div className="card-sheen glass flex flex-col gap-2 rounded-2xl p-4 ring-1 ring-foreground/15">
        <div className="flex items-center justify-between gap-3">
          <FieldLabel
            htmlFor="welcome-note-sunday"
            className="min-w-0 flex-1 font-heading text-base font-semibold tracking-tight text-foreground"
          >
            The Sunday email
          </FieldLabel>
          <Switch
            id="welcome-note-sunday"
            checked={noteSunday}
            onCheckedChange={onNoteSunday}
          />
        </div>
        <p className="text-sm leading-snug text-muted-foreground">
          {SUNDAY_EMAIL_LINE} Plus one reminder if your portfolio is still
          empty in a week.
        </p>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Account &rsaquo; Help replays this any time.
      </p>
    </div>
  );
}
