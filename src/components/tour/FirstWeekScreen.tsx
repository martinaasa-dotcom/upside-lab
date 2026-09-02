"use client";

import { Switch } from "@/components/ui/switch";
import { FieldLabel } from "@/components/ui/field";
import { TourAsk } from "@/components/tour/TourRow";
import { cn } from "@/lib/format";
import { SUNDAY_EMAIL_LINE } from "@/lib/product";
import { Check, Circle } from "lucide-react";

/*
  The last screen, and the only one that looks forward.

  It used to be a card saying "that is the whole app" over three rows about
  where things are, which is a summary of a walkthrough the reader has just
  finished and does not need again. What somebody actually leaves with is
  the first thing to do next, so this is a short list with the first line
  already ticked: something was learned, and here are the three small
  things that turn one visit into a habit.

  The Sunday email sits on its own line rather than as a screen of its own,
  because it is one switch and a sentence, and a whole screen for a switch
  is a screen somebody presses Next on.

  Two promises are exact here. The description of the email is
  `SUNDAY_EMAIL_LINE`, which is the same sentence the landing page and
  Account print, so nobody is told two different things about one mail.
  And the one other mail this app can send is admitted out loud: a reader
  whose portfolio is still empty a week from now gets a single reminder,
  which the old copy denied in as many words while a cron sent it daily at
  14:00.
*/

type Step = { done: boolean; text: string };

const STEPS: Step[] = [
  {
    done: true,
    text: "You have been round the app once, which is the part most people never do.",
  },
  {
    done: false,
    text: "One evening after the market shuts, open Pulse on a day something moved and see what it says happened.",
  },
  {
    done: false,
    text: "Ask Margus one question about a company you own. Your portfolio is already in the conversation, and the answers come in plain words.",
  },
  {
    done: false,
    text: "Add the next company from the same Add holding button on Home, however many you end up with. A second portfolio is a different thing, and one more company never needs one.",
  },
];

export function FirstWeekScreen({
  noteSunday,
  onNoteSunday,
}: {
  noteSunday: boolean;
  onNoteSunday: (next: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <TourAsk>Four small things, and the first one is done.</TourAsk>

      <ul className="flex flex-col gap-2">
        {STEPS.map((step) => (
          <li
            key={step.text}
            className="card-sheen glass flex items-start gap-3 rounded-lg p-4"
          >
            {step.done ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            ) : (
              <Circle
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            )}
            <span
              className={cn(
                "text-sm leading-relaxed",
                step.done ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {step.text}
            </span>
          </li>
        ))}
      </ul>

      <div className="card-sheen glass flex flex-col gap-2 rounded-lg p-4">
        <div className="flex items-center justify-between gap-3">
          <FieldLabel
            htmlFor="welcome-note-sunday"
            className="min-w-0 flex-1 text-sm font-medium text-foreground"
          >
            Send me the Sunday email
          </FieldLabel>
          <Switch
            id="welcome-note-sunday"
            checked={noteSunday}
            onCheckedChange={onNoteSunday}
          />
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {SUNDAY_EMAIL_LINE} There is no daily note and no alert, with one
          exception: if your portfolio is still empty a week from now, you
          get a single reminder. The Sunday one starts once there are
          companies in a portfolio, and it is one switch in Account either
          way.
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        Account &rsaquo; Help has a button that replays this walkthrough, any
        time you want it again.
      </p>
    </div>
  );
}
