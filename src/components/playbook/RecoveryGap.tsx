"use client";

import { Card, MicroLabel } from "@/components/ui/Panel";
import { Slider } from "@/components/ui/slider";
import { barFillPct, cn, percent } from "@/lib/format";
import { riseToRecover } from "@/lib/market-temperature";
import { useState } from "react";

/*
  THE TWO BARS SHARE ONE SCALE, WHICH IS THE ENTIRE LESSON.

  A fall and the rise that undoes it are the same event described from two
  ends, and everybody knows that and almost nobody has the size of it. Told
  in words it sounds like a technicality. Drawn as two bars measured
  against the same ruler it is unmissable: at a tenth they are near enough
  the same length, and by the time the fall reaches three quarters the bar
  underneath it is four times longer and still growing. The reader does the
  discovering by dragging, which is worth more than any sentence this file
  could put under it.

  The slider stops at 90% because the rise needed runs to infinity as the
  fall approaches everything, and a bar that cannot be drawn teaches
  nothing. The copy says what happens past the end rather than pretending
  the scale continues.
*/

const MIN_FALL = 5;
const MAX_FALL = 90;

const ANCHORS = [10, 25, 50, 75, 90] as const;

function Bars({ fall, rise }: { fall: number; rise: number }) {
  const scale = Math.max(fall, rise, 1);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <MicroLabel>The fall</MicroLabel>
          <span className="font-mono text-sm font-medium tabular-nums text-loss">
            {percent(fall / 100, 0)}
          </span>
        </div>
        <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-loss"
            style={{ width: `${barFillPct((fall / scale) * 100, 1)}%` }}
          />
        </div>
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <MicroLabel>The rise needed to get level</MicroLabel>
          <span className="font-mono text-sm font-medium tabular-nums text-gain">
            {percent(rise / 100, 0)}
          </span>
        </div>
        <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-gain"
            style={{ width: `${barFillPct((rise / scale) * 100, 1)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function RecoveryGap() {
  const [fall, setFall] = useState(40);
  const rise = (riseToRecover(fall / 100) ?? 0) * 100;

  return (
    <div className="flex flex-col gap-6">

      <Card tone="default" className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <MicroLabel>If a holding falls by</MicroLabel>
            <span className="font-mono text-xl font-bold tabular-nums text-foreground sm:text-2xl">
              {percent(fall / 100, 0)}
            </span>
          </div>
          <Slider
            value={[fall]}
            min={MIN_FALL}
            max={MAX_FALL}
            step={1}
            onValueChange={(next) => setFall(next[0] ?? MIN_FALL)}
            aria-label="How far the holding falls"
          />
        </div>

        <Bars fall={fall} rise={rise} />

        <p className="text-sm leading-relaxed text-foreground">
          A fall of {percent(fall / 100, 0)} needs a rise of{" "}
          <span className="font-mono font-medium tabular-nums">
            {percent(rise / 100, 0)}
          </span>{" "}
          to get back to where it started. Every dollar of the {percent(fall / 100, 0)}{" "}
          that went has to be earned back by what is left, and there is less of
          it than there was.
        </p>
      </Card>

      {/*
        The short table was five bordered cards repeating what the slider
        above already draws. The same five falls are presets for it now:
        one press sets the slider, and each still reads as a figure.
      */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {ANCHORS.map((f) => {
            const r = (riseToRecover(f / 100) ?? 0) * 100;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFall(f)}
                aria-pressed={fall === f}
                className={cn(
                  "rounded-full border border-border px-3 py-1.5 font-mono text-xs tabular-nums transition hover:bg-hover",
                  fall === f ? "bg-foreground/10 text-foreground" : "text-muted-foreground"
                )}
              >
                -{f}% needs{" "}
                <span className={cn(r >= 100 ? "text-warning" : "text-foreground")}>
                  +{Math.round(r)}%
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Past {MAX_FALL}% it runs away: down 99% needs a rise of 9,900%.
        </p>
      </div>
    </div>
  );
}
