/** US presidential terms — used to bucket calendar-year returns. */

export type PresidencyTerm = {
  id: string;
  president: string;
  party: "D" | "R";
  /** Inauguration day (inclusive). */
  start: string;
  /** Next inauguration (exclusive), or null if current. */
  end: string | null;
};

export const US_PRESIDENCIES: PresidencyTerm[] = [
  {
    id: "clinton",
    president: "Clinton",
    party: "D",
    start: "1993-01-20",
    end: "2001-01-20",
  },
  {
    id: "bush43",
    president: "G.W. Bush",
    party: "R",
    start: "2001-01-20",
    end: "2009-01-20",
  },
  {
    id: "obama",
    president: "Obama",
    party: "D",
    start: "2009-01-20",
    end: "2017-01-20",
  },
  {
    id: "trump1",
    president: "Trump",
    party: "R",
    start: "2017-01-20",
    end: "2021-01-20",
  },
  {
    id: "biden",
    president: "Biden",
    party: "D",
    start: "2021-01-20",
    end: "2025-01-20",
  },
  {
    id: "trump2",
    president: "Trump",
    party: "R",
    start: "2025-01-20",
    end: null,
  },
];

export type PresidentialCyclePhase =
  | "post_election"
  | "midterm"
  | "pre_election"
  | "election";

const CYCLE_LABELS: Record<PresidentialCyclePhase, string> = {
  post_election: "Post-election",
  midterm: "Midterm",
  pre_election: "Pre-election",
  election: "Election",
};

export function cyclePhaseForYear(year: number): PresidentialCyclePhase {
  const r = year % 4;
  if (r === 0) return "election";
  if (r === 1) return "post_election";
  if (r === 2) return "midterm";
  return "pre_election";
}

export function cyclePhaseLabel(phase: PresidentialCyclePhase): string {
  return CYCLE_LABELS[phase];
}
