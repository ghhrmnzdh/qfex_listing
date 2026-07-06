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
  t_stat: number; // naive i.i.d. t (overstated — ignores cross-sectional correlation)
  t_cluster: number | null; // t clustered by launch date (honest); null if <2 clusters
  n_clusters: number;
  p_sign: number | null; // two-sided binomial sign-test p-value
}

const EMPTY_BLK: Blk = { n: 0, mean: 0, median: 0, win_rate: 0, best: 0, worst: 0, stdev: 0, t_stat: 0, t_cluster: null, n_clusters: 0, p_sign: null };

/** CR1 cluster-robust SE of the mean — same-launch-day listings share a market
 *  shock and are not independent draws, so we cluster on launch date. */
function clusterSE(xs: number[], clusters: string[], mean: number): { se: number | null; G: number } {
  const groups = new Map<string, number>();
  xs.forEach((x, i) => groups.set(clusters[i], (groups.get(clusters[i]) ?? 0) + (x - mean)));
  const G = groups.size;
  const n = xs.length;
  if (G < 2 || n < 2) return { se: null, G };
  let meat = 0;
  groups.forEach((s) => (meat += s * s));
  const v = (G / (G - 1)) * meat / (n * n);
  return { se: v > 0 ? Math.sqrt(v) : null, G };
}

/** Two-sided exact binomial (sign) test — robust to the long-horizon skew. */
function signTestP(wins: number, n: number): number | null {
  if (n < 2) return null;
  let pmf = Math.pow(0.5, n);
  const probs = [pmf];
  for (let k = 1; k <= n; k++) {
    pmf = (pmf * (n - k + 1)) / k;
    probs.push(pmf);
  }
  let lower = 0;
  for (let k = 0; k <= wins; k++) lower += probs[k];
  let upper = 0;
  for (let k = wins; k <= n; k++) upper += probs[k];
  return Math.min(1, 2 * Math.min(lower, upper));
}

function block(xs: number[], clusters: string[]): Blk {
  if (!xs.length) return { ...EMPTY_BLK };
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sorted = [...xs].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const variance = n > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0; // SAMPLE var
  const stdev = Math.sqrt(variance);
  const wins = xs.filter((x) => x > 0).length;
  const t_stat = stdev > 0 && n > 1 ? mean / (stdev / Math.sqrt(n)) : 0;
  const { se, G } = clusterSE(xs, clusters, mean);
  return {
    n,
    mean,
    median,
    win_rate: wins / n,
    best: sorted[n - 1],
    worst: sorted[0],
    stdev,
    t_stat,
    t_cluster: se && se > 0 ? mean / se : null,
    n_clusters: G,
    p_sign: signTestP(wins, n),
  };
}

/** Recompute return, excess (β=1), and β-adjusted excess stats for a horizon over
 *  an arbitrary listing subset — clustered by launch date. `alpha` is kept as the
 *  key for the excess-return block (return − benchmark), which is NOT a risk-adjusted
 *  alpha; `betaExcess` is the β-adjusted version for the equity names. */
export function statsFor(listings: Listing[], h: HorizonKey): { return: Blk; alpha: Blk; betaExcess: Blk } {
  const rets: number[] = [], retCl: string[] = [];
  const excess: number[] = [], excessCl: string[] = [];
  const beta: number[] = [], betaCl: string[] = [];
  for (const l of listings) {
    if (!l.ok) continue;
    const rec = l.returns?.[h];
    if (!rec) continue;
    const g = l.listing_date ?? "";
    rets.push(rec.asset_return); retCl.push(g);
    if (rec.alpha !== null && rec.alpha !== undefined) { excess.push(rec.alpha); excessCl.push(g); }
    if (rec.beta_excess !== null && rec.beta_excess !== undefined) { beta.push(rec.beta_excess); betaCl.push(g); }
  }
  return { return: block(rets, retCl), alpha: block(excess, excessCl), betaExcess: block(beta, betaCl) };
}
