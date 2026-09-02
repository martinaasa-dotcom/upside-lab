/**
 * How many days in a row a price has gone up, said as a sentence.
 *
 * It used to answer "5d green run" and "3d up days": the first is desk
 * slang, the second is not grammatical, and both were set in large mono
 * beside a figure, so an explanation read as a statistic. This is a fact
 * about the last few days, so it is written as one.
 */

export type StreakInfo = {
  greenDays: number;
  label: string;
};

export function estimateGreenStreak(
  sparkline: number[] | undefined
): StreakInfo {
  if (!sparkline || sparkline.length < 3) {
    return { greenDays: 0, label: "No streak yet" };
  }
  let streak = 0;
  for (let i = sparkline.length - 1; i > 0; i--) {
    if (sparkline[i]! >= sparkline[i - 1]!) streak += 1;
    else break;
  }
  if (streak >= 2) {
    return { greenDays: streak, label: `Up ${streak} days in a row` };
  }
  return { greenDays: streak, label: streak ? "Up today" : "Not on a run" };
}
