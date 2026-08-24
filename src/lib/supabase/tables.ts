/**
 * Prefixed tables. Names stay `portfell_*` so existing rows, localStorage
 * locks, and RLS policies survive a move onto a dedicated Upside Lab
 * Supabase project. Isolation is env (URL + keys), not a rename.
 */
export const PORTFELL_TABLES = {
  portfolios: "portfell_portfolios",
  holdings: "portfell_holdings",
  snapshots: "portfell_book_snapshots",
  cashEvents: "portfell_cash_events",
  labState: "portfell_lab_state",
  profiles: "portfell_profiles",
  seedClaims: "portfell_seed_claims",
  communities: "portfell_communities",
  communityMembers: "portfell_community_members",
  communityInvites: "portfell_community_invites",
  communityInviteUses: "portfell_community_invite_uses",
  portfolioOwners: "portfell_portfolio_owners",
  portfolioInvites: "portfell_portfolio_invites",
  accountAliases: "portfell_account_aliases",
  accountEmails: "portfell_account_emails",
  communityPortfolios: "portfell_community_portfolios",
  communityJoinRequests: "portfell_community_join_requests",
  communityDuels: "portfell_community_duels",
  popularTickers: "portfell_popular_tickers",
  errorLog: "portfell_error_log",
  margusFund: "portfell_margus_fund",
  margusFundHoldings: "portfell_margus_fund_holdings",
  margusFundReports: "portfell_margus_fund_reports",
  margusFundWeeklyRecaps: "portfell_margus_fund_weekly_recaps",
} as const;

/** Fixed id for the seed test community (Aasad/MaryAnn/Anu/Karud/Lap circle). */
export const UPSIDE_CIRCLE_ID = "a0000000-0000-4000-8000-000000000001";

/** Live book columns. Snapshots still select * so a restore cannot drop a field. */
export const PORTFOLIO_COLUMNS =
  "id, name, slug, sort_order, cash_balance, owner_id, classroom_community_id";
export const HOLDING_COLUMNS =
  "id, portfolio_id, ticker, shares, buy_price, eoy_target, target_call_pct, stock_target_override, sort_order, updated_at";

export const MARGUS_FUND_COLUMNS =
  "id, cash, starting_capital, inception_date, updated_at, watchlist, cash_purpose";
export const MARGUS_FUND_HOLDING_COLUMNS =
  "id, ticker, shares, cost_basis, entry_date, thesis, target_timeframe, exit_plan, status, closed_at, exit_reasoning, realized_pnl";
export const MARGUS_FUND_REPORT_COLUMNS =
  "id, report_date, headline, body, actions, portfolio_value, cash, day_change_dollar, day_change_pct, total_return_pct, spy_price, x_post, created_at";
export const MARGUS_FUND_RECAP_COLUMNS =
  "id, week_ending, headline, body, week_return_pct, spy_week_return_pct, portfolio_value_start, portfolio_value_end, created_at";
export const ERROR_LOG_COLUMNS =
  "id, source, message, stack, digest, path, route_type, user_id, user_email, user_agent, context, created_at";
