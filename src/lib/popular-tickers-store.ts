import { fetchMonthlyPopularTickers } from "@/lib/market/popular-tickers-fetch";
import {
  currentPopularMonth,
  type PopularTickersPayload,
} from "@/lib/popular-tickers";
import type { AppSupabaseClient } from "@/lib/supabase/client-types";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";

export { readPopularTickers } from "@/lib/popular-tickers-read";

export async function writePopularTickers(
  supabase: AppSupabaseClient,
  month: string,
  tickers: string[]
): Promise<void> {
  const { error } = await supabase.from(PORTFELL_TABLES.popularTickers).upsert(
    {
      month,
      tickers,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "month" }
  );
  if (error) throw error;
}

export async function refreshPopularTickers(
  supabase: AppSupabaseClient
): Promise<PopularTickersPayload> {
  const month = currentPopularMonth();
  const tickers = await fetchMonthlyPopularTickers();
  await writePopularTickers(supabase, month, tickers);
  return { month, tickers, source: "live" };
}
