# MVP audit, feature accuracy pass (sections 1 to 8)

Run on 2026-08-24, after the technical pass in
`MVP_AUDIT_TECHNICAL_PASS.md`. This is the block the audit puts first,
because "this tracks real money, so treat every calculation bug as a
trust-breaking incident, not a cosmetic one".

Five bugs, and every one of them showed a reader a number that was wrong
rather than merely imprecise. The rest of this page is what was checked and
found correct, with the working, because a checklist with no evidence is
worth re-running from scratch next time.

## The five

### 1. A split made every number on a row wrong

A holding is a share count and a buy price the reader typed. A split
changes the share count and not what the position is worth, and the price
arrives from the feed already adjusted while the stored shares do not.
Nvidia's 10 for 1 in June 2024 turned 200 shares at $1,096 into 2,000 at
$109.60; the app showed that position at a tenth of the truth, down 90%,
until the reader worked it out by hand. There was no corporate action
handling anywhere in the codebase.

Now: `events: "split"` on the chart call the sparkline already makes, a
notice on the holdings table with the arithmetic spelled out, one button
that patches through `/api/holdings`, and a Sunday letter that will not
mail a figure built on a pre-split share count. Only a row whose
`updated_at` predates the split is ever named, because nothing but a user
edit changes a share count and a row touched since cannot be judged from a
timestamp. Full reasoning in `src/lib/market/corporate-actions.ts`.

### 2. Daily compounding built the year out of 360 days

The growth planner walks month by month, and a month is not a whole number
of compound events: daily is 365/12 = 30.42 of them. The loop rounded that
to 30. So the balance was built from a 360-day year while `compoundsPerYear`
reports 365 and the effective annual rate printed beside the chart is
worked from 365.

$10,000 at 10% for 10 years, compounded daily:

| | |
| --- | --- |
| closed form | $27,179.10 |
| the app | $26,809.37 |

$369.73 short, 1.4% of the answer, growing with the horizon. The module had
no tests at all; it has 18 now, all against closed form rather than against
itself.

### 3. The diversification panel answered its own question backwards

"Do these move together?" correlated the price series. Two names that both
drifted up over ninety days score near +1 whatever their daily moves did,
because both series are dominated by the same trend, and in a rising market
that is every pair in the book. Measured on a pair rising 0.5% a step with
exactly opposite wobble, which is a perfect hedge:

| | |
| --- | --- |
| on price levels | +0.93 |
| on daily returns | -1.00 |

The copy under the panel reads "near +1 means they rise and fall as one, so
holding both spreads your money without spreading your risk". So a reader
holding a genuine hedge was told the opposite of the truth on the only
question the panel exists to answer. It correlates returns now.

### 4. Pasting a screenshot into Margus failed, and said only "too big"

The browser compressed an image to a data URL and only tried harder above
4,500,000 characters. The server refused any body over 1,000,000 bytes. An
ordinary broker screenshot lands between the two, so it was accepted by one
end and rejected by the other with "That request was too big." and no
guidance. `chat-limits.ts` is the one place that answers it now, with the
client's number deliberately the smaller.

The same change closed a cost hole: the chat limiter counted turns, which
cannot tell a one-line question from a megabyte of image, so 30 turns per 5
minutes allowed 90 MB of input at the model from one account in that
window. Turns are still counted and a second budget is charged in kilobytes
by what the turn weighs.

### 5. The seasonality card counted the month it was standing in

The card says "Across 6 prior Augusts in the same presidential-cycle year",
or "prior Augusts only", or "prior years only". It said one of those three
every time it rendered, and it was counting the August in progress: the
current year is always in the current cycle phase, by definition.

On the 24th that is three weeks of trading averaged in as a whole month,
and a cycle phase comes round every four years, so six or eight samples is
the whole history. A flat partial August beside three 10% ones moves the
average to 7.5% and the win rate from 100 to 75, which is the difference
between the card saying deploy and the card saying hold. Only the month in
progress is dropped, not the year: a January that has finished is a real
January however recent it is.

## One that looked like a bug and was not

`realizedVolAnnual` annualizes by the square root of 252, which is right
only if one step is one trading day. The sparkline sitting beside it is the
same closes downsampled to at most 32 points, about 2.9 days a step, and it
is already passed around as `price_history` through `/api/options/scan`.
Feeding that in would overstate volatility by 1.69x, measured, which is
enough to move a name across the 0.28 bucket boundary in
`callPctFromVolatility` with nothing on screen looking wrong.

It is not wired that way. The only caller is `pickCallPct`, reached only
from `buildWritePlan`, which fetches its own chart and passes the full
daily series. So no reader has ever seen a wrong Call % from this. The
period between points is a named argument now rather than an assumption, so
the obvious future simplification cannot make it wrong quietly, and the
function has tests.

## Section 2.1, portfolio

- Cost basis, value and today's move recomputed by hand and matched:
  `buyValue = shares x buy_price`, `roiPct = (price - buy_price) / buy_price`
  per share rather than on the position, and `todayDollarFor` derives
  yesterday's value as `currentValue / (1 + changePercent)` instead of
  trusting a change field, which is what makes it correct in an extended
  session.
- One lot per ticker per portfolio, enforced by a unique constraint on
  `(portfolio_id, ticker)`, so the model is average cost and the row is
  updated rather than duplicated. Two portfolios holding the same name
  aggregate correctly in `buildOverview`.
- Covered call math hand-checked: one contract per 100 shares
  (`contractsFromShares`), `premium = mid x 100 x contracts`, and
  `yield2w = mid / spot`, the premium as a fraction of the share price.
- Splits were the gap. Dividends, mergers, delistings and symbol changes
  are still unhandled, and of the four a split is the one that silently
  rewrites a position; the others show up as a missing or renamed name,
  which the `missing` list already surfaces.

## Section 2.2, Pulse

The threshold fires where it says it does: `needsAttention` is
`effectivePct <= -0.05` and `isBigPulseMove` is `Math.abs(pct) >= 0.05`,
both on the effective move, which includes pre-market and after-hours
rather than only the regular session.

## Section 2.3, Lab

- Allocation sums to 1 by construction. `allocationBySector` and
  `allocationByTicker` divide by their own positive-only total and
  `allocationByTicker` carries the remainder in an explicit "Other" slice,
  so nothing is silently dropped. `pctOfTotal` on a holding divides by
  equity plus cash, so the rows sum to under 100% with cash as the
  remainder, which is the documented cash drag.
- Trend indicators checked line by line against their standard
  definitions: the rolling `sma` window, `ema` seeded off the first SMA,
  Wilder smoothing in `rsi`, and a `macd` signal line seeded off the
  defined slice and padded back. `relativeStrength` is a difference of
  returns. No changes needed.
- Correlation was the gap, and is fixed above.

## Section 2.4, Compound

Fixed above, and now covered by tests against the closed form for every
frequency, deposits against an ordinary annuity, the lump and the annuity
together, an annual raise, the effective rate, time to double, and the
shapes a person can type (a negative rate, withdrawals larger than the
balance, a zero-length plan, junk).

## Section 3, Margus

- **Margus cannot write.** Every tool in `src/lib/ai/cc-advisor.ts` returns
  a proposal and touches no database. The write goes through
  `/api/holdings`, which re-checks `requirePortfolioOwner` independently,
  so a hallucinated tool call cannot reach another account's data and a bad
  one is a normal edit the reader can undo.
- Rate limited per user in its own durable bucket, now by weight as well as
  by count.
- The portfolio context is supplied by the client, which is worth knowing
  and is not a cross-account risk: the only book a client can lie about is
  its own.

## Section 8, import

- CSV parses per row and reports what it skipped, with the reason and the
  line number, rather than failing the file or dropping rows quietly.
  Dialect detection covers comma, semicolon and tab, and the European
  decimal convention.
- Re-importing the same file is safe. The import is a set operation:
  existing rows are updated in place and new ones upserted on
  `(portfolio_id, ticker)`, so shares are replaced rather than added.
- Screenshot import was the gap, and is fixed above.

## What this pass could not reach

Anything needing a real account or real market data: the screenshot parse
against a spread of real broker apps, a two-account test of a shared
portfolio, and the split path end to end against a name that has actually
split. The arithmetic behind each of those is unit tested; what is untested
is the round trip.
