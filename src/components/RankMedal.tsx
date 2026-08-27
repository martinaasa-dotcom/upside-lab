"use client";

import { useId } from "react";
import { TONES } from "@/lib/brand/mark";

export type RankPlace = 1 | 2 | 3;

type Metal = {
  lit: string;
  face: string;
  edge: string;
  deep: string;
};

/*
  Lucide's Medal is a line drawing with a "1" in the path, so every place
  looked like first. These are filled metals instead.

  Gold is the mark's own ramp, so first place is the same gold as the A.
  Silver is grey on purpose (real silver, not a faded yellow). Bronze is
  copper: darker and redder than gold, and at about half the chroma of
  `--warning`, so third place cannot read as an alert.
*/
const METALS: Record<RankPlace, Metal> = {
  1: {
    lit: TONES.lit.from,
    face: TONES.face.from,
    edge: TONES.edge.to,
    deep: TONES.deep.to,
  },
  2: {
    lit: "#f3f3f6",
    face: "#c5c5cc",
    edge: "#7a7a84",
    deep: "#4c4c54",
  },
  3: {
    lit: "#e8c196",
    face: "#c1864c",
    edge: "#875226",
    deep: "#573216",
  },
};

export function RankMedal({
  place,
  className = "size-6",
}: {
  place: RankPlace;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const disc = `rank-medal-${uid}-disc`;
  const rib = `rank-medal-${uid}-rib`;
  const m = METALS[place];

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <radialGradient id={disc} cx="0.62" cy="0.28" r="0.82">
          <stop offset="0" stopColor={m.lit} />
          <stop offset="0.42" stopColor={m.face} />
          <stop offset="1" stopColor={m.deep} />
        </radialGradient>
        <linearGradient id={rib} x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor={m.face} />
          <stop offset="1" stopColor={m.edge} />
        </linearGradient>
      </defs>
      <path d="M7.1 1.5 12 10.2 4.8 3.6Z" fill={`url(#${rib})`} />
      <path d="M16.9 1.5 12 10.2 19.2 3.6Z" fill={`url(#${rib})`} />
      <circle cx="12" cy="15.5" r="7.2" fill={`url(#${disc})`} />
      <circle
        cx="12"
        cy="15.5"
        r="7.2"
        fill="none"
        stroke={m.edge}
        strokeWidth="0.7"
      />
      <circle
        cx="12"
        cy="15.5"
        r="4.8"
        fill="none"
        stroke={m.lit}
        strokeWidth="0.5"
        opacity="0.7"
      />
      <ellipse
        cx="14.4"
        cy="12.6"
        rx="2.2"
        ry="1.25"
        fill="var(--foreground)"
        opacity="0.28"
      />
      <text
        x="12"
        y="15.55"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--background)"
        fontFamily="var(--font-mono), ui-monospace, monospace"
        fontSize="8"
        fontWeight="700"
      >
        {place}
      </text>
    </svg>
  );
}
