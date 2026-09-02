"use client";

import { MiniDock } from "@/components/tour/MiniDock";
import { TourAsk } from "@/components/tour/TourRow";
import { DOCK_TABS } from "@/components/mobile/MobileTabBar";
import { useState } from "react";

/*
  Where everything is, pressed rather than listed.

  The room tour used to be six cards of prose, which is the shape of thing
  a reader scrolls past and then cannot find the app in. What they need is
  not six descriptions, it is the muscle memory of the bar along the bottom
  of their own screen, so the bar is here, it works, and pressing a glyph
  does exactly what pressing it will do tomorrow: the marker slides, the
  room's name rises above the bar, and one sentence says what that room is
  for.

  The cells come from `DOCK_TABS`, which is the table the real bar draws
  itself from, so this screen cannot end up teaching a bar that no longer
  exists.

  THE PHONE BAR HAS NO PLUS. The old copy said "the + button makes another
  portfolio if you ever need one", and it is not there: only the laptop
  dock draws an add cell, and most people arrive on a phone. It also said
  the only thing not on the bar is your account, which left out Margus.
*/

const WHAT_IT_IS: Record<string, string> = {
  home: "Where you land. Today in a few sentences, then every portfolio you own with one row per holding: what it cost, what it is worth, what it did today.",
  holdings:
    "The whole table for one portfolio, with room for the numbers. This is where you add a company, change a share count, or fix what you paid.",
  pulse:
    "Reads the day on every company you own and says whether something really happened there or the price just moved with everything else.",
  lab: "Closer looks at the same portfolio: what you are most concentrated in, how the last few weeks went, and how each company has usually behaved at this time of year. It arrives once you say you are comfortable, and a Risk view once you say very experienced.",
  compound:
    "Arithmetic on what you have. What this becomes if you keep adding at some rate for some years. Not a prediction, and it says so.",
  circle:
    "The people you choose to share a portfolio with, like a partner, your family or a class. Optional, invite only, and nothing is shared until you share it.",
};

export function RoomsScreen() {
  const [room, setRoom] = useState("home");
  const said = WHAT_IT_IS[room] ?? WHAT_IT_IS.home!;

  return (
    <div className="flex flex-col gap-4">
      <TourAsk>Press one and see what it is for.</TourAsk>

      <div className="pt-8">
        <MiniDock tabs={DOCK_TABS} activeId={room} onPress={setRoom} />
      </div>

      <div className="card-sheen glass min-h-28 rounded-lg p-4">
        <p className="text-sm font-medium text-foreground">
          {DOCK_TABS.find((t) => t.id === room)?.shortLabel ?? "Home"}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground" aria-live="polite">
          {said}
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        Two things are not on the bar. Your account is the picture in the top
        corner, and Margus floats over every room, so you can ask a question
        without leaving what you are looking at.
      </p>
    </div>
  );
}
