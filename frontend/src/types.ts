export type HorizonKey = "1D" | "1W" | "1M" | "3M" | "LIVE";

export interface ReturnRec {
  asset_return: number;
  exit_date: string;
  bench_return: number | null;
  alpha: number | null;
}

export interface PricePoint {
  date: string;
  close: number;
  ret: number;
}

export interface Source {
  type: "tweet" | "qfex";
  announce_url: string | null;
  tweet_date: string | null;
  note: string | null;
}

export interface Listing {
  qfex_symbol: string;
  base_asset: string;
  display_ticker: string;
  name: string;
  asset_class: string;
  product_category: string;
  quote_asset: string;
  max_leverage: number | null;
  status: string;
  underlier_price?: string | null;
  source: Source;
  listing_date?: string;
  entry_close?: number;
  latest_date?: string;
  latest_close?: number;
  days_live?: number;
  ok: boolean;
  error?: string;
  returns: Partial<Record<HorizonKey, ReturnRec | null>>;
  price_series: PricePoint[];
}

export interface StatBlk {
  n: number;
  mean?: number;
  median?: number;
  win_rate?: number;
  best?: number;
  worst?: number;
  stdev?: number;
  t_stat?: number;
}

export interface HorizonStat {
  return: StatBlk;
  alpha: StatBlk;
}

export interface Summary {
  horizons: Record<HorizonKey, HorizonStat>;
  n_listings: number;
}

export interface EventPoint {
  day: number;
  n: number;
  mean_ret: number;
  median_ret: number;
  mean_alpha: number | null;
}

export interface IndexData {
  generated: string;
  source?: string;
  benchmark: { symbol: string; name: string };
  horizons: HorizonKey[];
  horizon_offsets: Record<string, number>;
  counts?: { markets: number; priced: number; with_tweet: number };
  summary: Summary;
  event_study: EventPoint[];
  event_study_all: EventPoint[];
  listings: Listing[];
}
