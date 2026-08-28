import {
  DEFAULT_CLASS_ASSIGNMENT,
  DEFAULT_STARTING_CASH,
  MAX_STARTING_CASH,
  MIN_STARTING_CASH,
  type ClassPeriodKind,
} from "@/lib/classroom";

export type ClassTemplate = {
  id: string;
  title: string;
  blurb: string;
  cash: number;
  period: ClassPeriodKind;
  assignment: string;
};

/** Covers the usual high-school and uni paper class. Pick one, then tweak. */
export const CLASS_TEMPLATES: ClassTemplate[] = [
  {
    id: "first-picks",
    title: "First picks",
    blurb: "Buying week. Up to 5 companies. Write down why for each one.",
    cash: 100_000,
    period: "buy",
    assignment: DEFAULT_CLASS_ASSIGNMENT,
  },
  {
    id: "one-name",
    title: "One name",
    blurb: "Everyone defends a single pick.",
    cash: 25_000,
    period: "buy",
    assignment:
      "Pick one company. Write down why you own it. Hold it unless I say you can change.",
  },
  {
    id: "term-hold",
    title: "Hold for the term",
    blurb: "Buy now. Then we sit with what we picked.",
    cash: 100_000,
    period: "buy",
    assignment:
      "Buy this week. Then we hold until the last class. The Sunday note is how you keep the grade.",
  },
  {
    id: "open-trading",
    title: "Open trading",
    blurb: "Buy and sell whenever. Short note on every change.",
    cash: 100_000,
    period: "open",
    assignment:
      "Buy and sell as you like. Write a short note whenever you change the portfolio.",
  },
  {
    id: "same-group",
    title: "Same group of stocks",
    blurb: "I name the group. You pick inside it.",
    cash: 50_000,
    period: "buy",
    assignment:
      "Everyone picks from the group I name in class. Write down why that company, and not another one in the group.",
  },
  {
    id: "look-only",
    title: "Look only",
    blurb: "Exam week or a demo. Portfolios stay put.",
    cash: 100_000,
    period: "closed",
    assignment:
      "Portfolios stay as they are. Look and write. Do not buy or sell.",
  },
  {
    id: "midterm-move",
    title: "Sell and move",
    blurb: "Midterm tidy-up. No new companies yet.",
    cash: 100_000,
    period: "fix",
    assignment:
      "Sell what is not working and move the money. No new companies until I open buying again.",
  },
];

export const CLASS_CASH_PRESETS = [
  10_000, 25_000, 50_000, 100_000, 250_000, 1_000_000,
] as const;

export const DEFAULT_CLASS_TEMPLATE_ID = "first-picks";

export function classTemplateById(id: string): ClassTemplate {
  return (
    CLASS_TEMPLATES.find((t) => t.id === id) ?? CLASS_TEMPLATES[0]!
  );
}

export function formatCashDigits(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export function parseCashDigits(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function clampStartingCash(n: number): number {
  return Math.min(MAX_STARTING_CASH, Math.max(MIN_STARTING_CASH, Math.round(n)));
}

export function defaultClassSetup() {
  const t = classTemplateById(DEFAULT_CLASS_TEMPLATE_ID);
  return {
    templateId: t.id,
    cash: t.cash || DEFAULT_STARTING_CASH,
    period: t.period,
    assignment: t.assignment,
  };
}
