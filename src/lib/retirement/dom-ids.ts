/**
 * The one id the results table is found by. `NumberPanel`'s skip button
 * and `GridPanel`'s anchor both read this constant rather than typing the
 * string twice, because a control and the thing it scrolls to disagreeing
 * is a silent failure: the button would still render and simply do
 * nothing.
 */
export const RETIREMENT_RESULTS_ID = "retirement-results-table";
