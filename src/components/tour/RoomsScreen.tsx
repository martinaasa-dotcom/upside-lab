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
  home: "Where you land. Today in a few sentences, then every portfolio you own.",
  holdings:
    "One portfolio in full. Add a company, change a share count, fix what you paid.",
  pulse:
    "Reads the day on every company you own and says what actually happened.",
  lab: "Closer looks at the same portfolio: what you are concentrated in, and how each company usually behaves.",
  compound:
    "Arithmetic on what you have, if you keep adding. Not a prediction, and it says so.",
  circle:
    "The people you choose to share a portfolio with. Invite only, and nothing is shared until you share it.",
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
        Two things are not on the bar: your account, in the top corner, and
        Margus, who floats over every room.
      </p>
    </div>
  );
}
