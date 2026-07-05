import type { HorizonKey, Listing } from "./types";

export const HORIZON_LABELS: Record<HorizonKey, string> = {
  "1D": "1 Day",
  "1W": "1 Week",
  "1M": "1 Month",
  "3M": "3 Months",
  LIVE: "Since listing",
};

export const HORIZON_SHORT: Record<HorizonKey, string> = {
  "1D": "1D",
  "1W": "1W",
  "1M": "1M",
  "3M": "3M",
  LIVE: "LIVE",
};

export const ASSET_CLASS_LABEL: Record<string, string> = {
  equity_us: "US Equity",
  equity_kr: "Korea Equity",
  equity_intl: "Intl Equity",
  etf: "ETF",
  commodity: "Commodity",
  index: "Index",
  forex: "FX",
  crypto: "Crypto",
};

export function pct(x: number | null | undefined, dp = 1): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  const v = x * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(dp)}%`;
}

export function signColor(x: number | null | undefined): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "var(--text-faint)";
  if (x > 0.0000001) return "var(--pos)";
  if (x < -0.0000001) return "var(--neg)";
  return "var(--text-dim)";
}

export function fmtDate(d?: string): string {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateShort(d?: string): string {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function tweetId(url?: string): string {
  if (!url) return "";
  const m = url.match(/status\/(\d+)/);
  return m ? m[1] : "";
}

export function ret(listing: Listing, h: HorizonKey): number | null {
  const r = listing.returns?.[h];
  return r ? r.asset_return : null;
}

export function alpha(listing: Listing, h: HorizonKey): number | null {
  const r = listing.returns?.[h];
  return r && r.alpha !== undefined ? r.alpha : null;
}

export interface Blk {
  n: number;
  mean: number;
  median: number;
  win_rate: number;
  best: number;
  worst: number;
  stdev: number;
  t_stat: number;
}

function block(xs: number[]): Blk {
  if (!xs.length) return { n: 0, mean: 0, median: 0, win_rate: 0, best: 0, worst: 0, stdev: 0, t_stat: 0 };
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sorted = [...xs].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stdev = Math.sqrt(variance);
  const t_stat = stdev > 0 ? mean / (stdev / Math.sqrt(n)) : 0;
  return {
    n,
    mean,
    median,
    win_rate: xs.filter((x) => x > 0).length / n,
    best: sorted[n - 1],
    worst: sorted[0],
    stdev,
    t_stat,
  };
}

/** Recompute return + alpha stats for a horizon over an arbitrary listing subset. */
export function statsFor(listings: Listing[], h: HorizonKey): { return: Blk; alpha: Blk } {
  const rets: number[] = [];
  const alphas: number[] = [];
  for (const l of listings) {
    if (!l.ok) continue;
    const rec = l.returns?.[h];
    if (!rec) continue;
    rets.push(rec.asset_return);
    if (rec.alpha !== null && rec.alpha !== undefined) alphas.push(rec.alpha);
  }
  return { return: block(rets), alpha: block(alphas) };
}
