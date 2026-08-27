export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      portfell_account_aliases: {
        Row: {
          alias_email: string
          created_at: string
          primary_email: string
        }
        Insert: {
          alias_email: string
          created_at?: string
          primary_email: string
        }
        Update: {
          alias_email?: string
          created_at?: string
          primary_email?: string
        }
        Relationships: []
      }
      portfell_account_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          token_expires_at: string | null
          token_hash: string | null
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token_expires_at?: string | null
          token_hash?: string | null
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token_expires_at?: string | null
          token_hash?: string | null
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      portfell_book_snapshots: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string
          payload: Json
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          label?: string
          payload: Json
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string
          payload?: Json
        }
        Relationships: []
      }
      portfell_cash_events: {
        Row: {
          balance_after: number
          created_at: string
          delta: number
          id: string
          portfolio_id: string
          user_id: string | null
        }
        Insert: {
          balance_after: number
          created_at?: string
          delta: number
          id?: string
          portfolio_id: string
          user_id?: string | null
        }
        Update: {
          balance_after?: number
          created_at?: string
          delta?: number
          id?: string
          portfolio_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfell_cash_events_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfell_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfell_cash_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portfell_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portfell_communities: {
        Row: {
          class_plan: Json
          created_at: string
          created_by: string | null
          house_note: string | null
          id: string
          kind: string
          name: string
          starting_cash: number
          updated_at: string
          visibility: string
        }
        Insert: {
          class_plan?: Json
          created_at?: string
          created_by?: string | null
          house_note?: string | null
          id?: string
          kind?: string
          name: string
          starting_cash?: number
          updated_at?: string
          visibility?: string
        }
        Update: {
          class_plan?: Json
          created_at?: string
          created_by?: string | null
          house_note?: string | null
          id?: string
          kind?: string
          name?: string
          starting_cash?: number
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfell_communities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portfell_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portfell_community_duels: {
        Row: {
          community_id: string
          created_at: string
          day_key: string
          id: string
          pick: string
          ticker_a: string
          ticker_b: string
          user_id: string
        }
        Insert: {
          community_id: string
          created_at?: string
          day_key: string
          id?: string
          pick: string
          ticker_a: string
          ticker_b: string
          user_id: string
        }
        Update: {
          community_id?: string
          created_at?: string
          day_key?: string
          id?: string
          pick?: string
          ticker_a?: string
          ticker_b?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfell_community_duels_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "portfell_communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfell_community_duels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portfell_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portfell_community_invites: {
        Row: {
          accepted_at: string | null
          community_id: string
          created_at: string
          created_by: string | null
          email: string | null
          expires_at: string | null
          id: string
          revoked_at: string | null
          role: string
          token: string | null
          token_hash: string
          token_hint: string | null
        }
        Insert: {
          accepted_at?: string | null
          community_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          revoked_at?: string | null
          role?: string
          token?: string | null
          token_hash: string
          token_hint?: string | null
        }
        Update: {
          accepted_at?: string | null
          community_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          revoked_at?: string | null
          role?: string
          token?: string | null
          token_hash?: string
          token_hint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfell_community_invites_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "portfell_communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfell_community_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portfell_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portfell_community_invite_uses: {
        Row: {
          invite_id: string
          used_at: string
          user_id: string
        }
        Insert: {
          invite_id: string
          used_at?: string
          user_id: string
        }
        Update: {
          invite_id?: string
          used_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfell_community_invite_uses_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "portfell_community_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfell_community_invite_uses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portfell_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portfell_community_join_requests: {
        Row: {
          community_id: string
          decided_at: string | null
          decided_by: string | null
          id: string
          message: string | null
          requested_at: string
          share_portfolio_ids: string[] | null
          status: string
          user_id: string
        }
        Insert: {
          community_id: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          message?: string | null
          requested_at?: string
          share_portfolio_ids?: string[] | null
          status?: string
          user_id: string
        }
        Update: {
          community_id?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          message?: string | null
          requested_at?: string
          share_portfolio_ids?: string[] | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfell_community_join_requests_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "portfell_communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfell_community_join_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "portfell_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfell_community_join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portfell_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portfell_community_members: {
        Row: {
          community_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          community_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          community_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfell_community_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "portfell_communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfell_community_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portfell_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portfell_community_portfolios: {
        Row: {
          community_id: string
          created_at: string
          label: string | null
          portfolio_id: string
        }
        Insert: {
          community_id: string
          created_at?: string
          label?: string | null
          portfolio_id: string
        }
        Update: {
          community_id?: string
          created_at?: string
          label?: string | null
          portfolio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfell_community_portfolios_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "portfell_communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfell_community_portfolios_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfell_portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfell_email_logins: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          next_path: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          next_path?: string
          token_hash: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          next_path?: string
          token_hash?: string
        }
        Relationships: []
      }
      portfell_error_log: {
        Row: {
          context: Json | null
          created_at: string
          digest: string | null
          id: string
          message: string
          path: string | null
          route_type: string | null
          source: string
          stack: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          digest?: string | null
          id?: string
          message: string
          path?: string | null
          route_type?: string | null
          source: string
          stack?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          digest?: string | null
          id?: string
          message?: string
          path?: string | null
          route_type?: string | null
          source?: string
          stack?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      portfell_holdings: {
        Row: {
          buy_price: number
          created_at: string
          eoy_target: number | null
          id: string
          portfolio_id: string
          shares: number
          sort_order: number
          stock_target_override: number | null
          target_call_pct: number | null
          ticker: string
          updated_at: string
        }
        Insert: {
          buy_price?: number
          created_at?: string
          eoy_target?: number | null
          id?: string
          portfolio_id: string
          shares?: number
          sort_order?: number
          stock_target_override?: number | null
          target_call_pct?: number | null
          ticker: string
          updated_at?: string
        }
        Update: {
          buy_price?: number
          created_at?: string
          eoy_target?: number | null
          id?: string
          portfolio_id?: string
          shares?: number
          sort_order?: number
          stock_target_override?: number | null
          target_call_pct?: number | null
          ticker?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfell_holdings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfell_portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfell_household_groups: {
        Row: {
          email: string
          group_key: string
        }
        Insert: {
          email: string
          group_key: string
        }
        Update: {
          email?: string
          group_key?: string
        }
        Relationships: []
      }
      portfell_lab_state: {
        Row: {
          conviction: Json
          id: string
          owner_id: string | null
          updated_at: string
          watchlist: Json
        }
        Insert: {
          conviction?: Json
          id?: string
          owner_id?: string | null
          updated_at?: string
          watchlist?: Json
        }
        Update: {
          conviction?: Json
          id?: string
          owner_id?: string | null
          updated_at?: string
          watchlist?: Json
        }
        Relationships: [
          {
            foreignKeyName: "portfell_lab_state_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "portfell_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portfell_margus_fund: {
        Row: {
          cash: number
          cash_purpose: string | null
          id: string
          inception_date: string
          starting_capital: number
          updated_at: string
          watchlist: Json
        }
        Insert: {
          cash?: number
          cash_purpose?: string | null
          id?: string
          inception_date?: string
          starting_capital?: number
          updated_at?: string
          watchlist?: Json
        }
        Update: {
          cash?: number
          cash_purpose?: string | null
          id?: string
          inception_date?: string
          starting_capital?: number
          updated_at?: string
          watchlist?: Json
        }
        Relationships: []
      }
      portfell_margus_fund_holdings: {
        Row: {
          closed_at: string | null
          cost_basis: number
          created_at: string
          entry_date: string
          exit_plan: string | null
          exit_reasoning: string | null
          id: string
          realized_pnl: number | null
          shares: number
          status: string
          target_timeframe: string | null
          thesis: string
          ticker: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          cost_basis: number
          created_at?: string
          entry_date?: string
          exit_plan?: string | null
          exit_reasoning?: string | null
          id?: string
          realized_pnl?: number | null
          shares: number
          status?: string
          target_timeframe?: string | null
          thesis: string
          ticker: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          cost_basis?: number
          created_at?: string
          entry_date?: string
          exit_plan?: string | null
          exit_reasoning?: string | null
          id?: string
          realized_pnl?: number | null
          shares?: number
          status?: string
          target_timeframe?: string | null
          thesis?: string
          ticker?: string
          updated_at?: string
        }
        Relationships: []
      }
      portfell_margus_fund_reports: {
        Row: {
          actions: Json
          body: string
          cash: number
          created_at: string
          day_change_dollar: number | null
          day_change_pct: number | null
          headline: string
          id: string
          portfolio_value: number
          report_date: string
          spy_price: number | null
          x_post: string | null
          total_return_pct: number | null
        }
        Insert: {
          actions?: Json
          body: string
          cash: number
          created_at?: string
          day_change_dollar?: number | null
          day_change_pct?: number | null
          headline: string
          id?: string
          portfolio_value: number
          report_date: string
          spy_price?: number | null
          x_post?: string | null
          total_return_pct?: number | null
        }
        Update: {
          actions?: Json
          body?: string
          cash?: number
          created_at?: string
          day_change_dollar?: number | null
          day_change_pct?: number | null
          headline?: string
          id?: string
          portfolio_value?: number
          report_date?: string
          spy_price?: number | null
          x_post?: string | null
          total_return_pct?: number | null
        }
        Relationships: []
      }
      portfell_margus_fund_weekly_recaps: {
        Row: {
          body: string
          created_at: string
          headline: string
          id: string
          portfolio_value_end: number | null
          portfolio_value_start: number | null
          spy_week_return_pct: number | null
          week_ending: string
          week_return_pct: number | null
        }
        Insert: {
          body: string
          created_at?: string
          headline: string
          id?: string
          portfolio_value_end?: number | null
          portfolio_value_start?: number | null
          spy_week_return_pct?: number | null
          week_ending: string
          week_return_pct?: number | null
        }
        Update: {
          body?: string
          created_at?: string
          headline?: string
          id?: string
          portfolio_value_end?: number | null
          portfolio_value_start?: number | null
          spy_week_return_pct?: number | null
          week_ending?: string
          week_return_pct?: number | null
        }
        Relationships: []
      }
      portfell_share_splits: {
        Row: {
          ticker: string
          effective_on: string
          numerator: number
          denominator: number
          holdings_adjusted: number
          applied_at: string
        }
        Insert: {
          ticker: string
          effective_on: string
          numerator: number
          denominator: number
          holdings_adjusted?: number
          applied_at?: string
        }
        Update: {
          ticker?: string
          effective_on?: string
          numerator?: number
          denominator?: number
          holdings_adjusted?: number
          applied_at?: string
        }
        Relationships: []
      }
      portfell_split_checks: {
        Row: {
          day: string
          claimed_at: string
        }
        Insert: {
          day: string
          claimed_at?: string
        }
        Update: {
          day?: string
          claimed_at?: string
        }
        Relationships: []
      }
      portfell_popular_tickers: {
        Row: {
          month: string
          tickers: Json
          updated_at: string
        }
        Insert: {
          month: string
          tickers: Json
          updated_at?: string
        }
        Update: {
          month?: string
          tickers?: Json
          updated_at?: string
        }
        Relationships: []
      }
      portfell_portfolio_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          email: string | null
          expires_at: string | null
          id: string
          portfolio_id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          portfolio_id: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          portfolio_id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfell_portfolio_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "portfell_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfell_portfolio_invites_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfell_portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfell_portfolio_owners: {
        Row: {
          created_at: string
          portfolio_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          portfolio_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          portfolio_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfell_portfolio_owners_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfell_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfell_portfolio_owners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "portfell_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portfell_portfolios: {
        Row: {
          cash_balance: number
          classroom_community_id: string | null
          created_at: string
          id: string
          name: string
          owner_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          cash_balance?: number
          classroom_community_id?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          cash_balance?: number
          classroom_community_id?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfell_portfolios_classroom_community_id_fkey"
            columns: ["classroom_community_id"]
            isOneToOne: false
            referencedRelation: "portfell_communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfell_portfolios_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "portfell_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portfell_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          current_period_end: string | null
          display_name: string | null
          email: string | null
          empty_book_nudge_sent_at: string | null
          experience_tier: string | null
          id: string
          knows_options: boolean | null
          last_advisor_at: string | null
          morning_note: boolean
          note_morning: boolean
          note_sunday: boolean
          note_sunday_sent_at: string | null
          plan: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          updated_at: string
          welcome_tour_version: number
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          current_period_end?: string | null
          display_name?: string | null
          email?: string | null
          empty_book_nudge_sent_at?: string | null
          experience_tier?: string | null
          id: string
          knows_options?: boolean | null
          last_advisor_at?: string | null
          morning_note?: boolean
          note_morning?: boolean
          note_sunday?: boolean
          note_sunday_sent_at?: string | null
          plan?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
          welcome_tour_version?: number
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          current_period_end?: string | null
          display_name?: string | null
          email?: string | null
          empty_book_nudge_sent_at?: string | null
          experience_tier?: string | null
          id?: string
          knows_options?: boolean | null
          last_advisor_at?: string | null
          morning_note?: boolean
          note_morning?: boolean
          note_sunday?: boolean
          note_sunday_sent_at?: string | null
          plan?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
          welcome_tour_version?: number
        }
        Relationships: []
      }
      portfell_quote_cache: {
        Row: {
          quote: Json
          quoted_at: string
          ticker: string
          updated_at: string
        }
        Insert: {
          quote: Json
          quoted_at: string
          ticker: string
          updated_at?: string
        }
        Update: {
          quote?: Json
          quoted_at?: string
          ticker?: string
          updated_at?: string
        }
        Relationships: []
      }
      portfell_seed_claims: {
        Row: {
          email: string
          portfolio_slug: string
        }
        Insert: {
          email: string
          portfolio_slug: string
        }
        Update: {
          email?: string
          portfolio_slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      portfell_account_for_login_email: {
        Args: { p_email: string }
        Returns: string
      }
      portfell_account_never_used: { Args: { p_user: string }; Returns: boolean }
      portfell_apply_cash_delta: {
        Args: { p_delta: number; p_portfolio_id: string }
        Returns: number
      }
      portfell_can_read_portfolio: { Args: { pid: string }; Returns: boolean }
      portfell_claim_split_check: { Args: { p_day: string }; Returns: boolean }
      portfell_tickers_held: { Args: never; Returns: { ticker: string }[] }
      portfell_apply_split: {
        Args: {
          p_ticker: string
          p_effective_on: string
          p_numerator: number
          p_denominator: number
        }
        Returns: {
          ticker: string
          effective_on: string
          numerator: number
          denominator: number
          holdings_adjusted: number
          applied_at: string
        }
      }
      portfell_claim_seed_for_me: { Args: never; Returns: Json }
      portfell_create_portfolio_for_me: {
        Args: { p_name: string }
        Returns: Json
      }
      portfell_delete_my_account: { Args: never; Returns: Json }
      portfell_is_community_admin: { Args: { cid: string }; Returns: boolean }
      portfell_is_community_member: { Args: { cid: string }; Returns: boolean }
      portfell_is_portfolio_co_owner: {
        Args: { pid: string }
        Returns: boolean
      }
      portfell_is_superadmin: { Args: never; Returns: boolean }
      portfell_lookup_profile_id_by_email: {
        Args: { p_email: string }
        Returns: string
      }
      portfell_primary_email: { Args: { em: string }; Returns: string }
      portfell_rate_take: {
        Args: { p_key: string; p_limit: number; p_window_ms: number }
        Returns: Json
      }
      portfell_rate_take_weighted: {
        Args: {
          p_key: string
          p_limit: number
          p_window_ms: number
          p_cost: number
        }
        Returns: Json
      }
      portfell_redeem_community_invite: {
        Args: { p_token_hash: string }
        Returns: Json
      }
      portfell_redeem_portfolio_invite: {
        Args: { p_token_hash: string }
        Returns: Json
      }
      portfell_shares_community_with: {
        Args: { target_owner: string }
        Returns: boolean
      }
      portfell_superadmin_overview: { Args: never; Returns: Json }
      portfell_sync_household_community_memberships: {
        Args: { p_user_id?: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
