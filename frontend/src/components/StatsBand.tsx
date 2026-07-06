import { motion } from "framer-motion";
import type { HorizonKey } from "../types";
import { HORIZON_LABELS, pct, signColor, type Blk } from "../lib";
import { enter, useStill } from "../anim";
import AnimatedNumber from "./AnimatedNumber";

interface Props {
  ret: Blk;
  alpha: Blk; // excess return (β=1) block
  betaExcess: Blk;
  filter: string;
  horizon: HorizonKey;
  benchName: string;
}

/** The evidence band: for the selected horizon over the current filter — mean
 *  return, mean excess vs benchmark, beat-rate, and an HONEST significance read
 *  (t clustered by launch date, since same-day listings share a market shock). */
export default function StatsBand({ ret, alpha, betaExcess, filter, horizon, benchName }: Props) {
  const still = useStill();
  const isEquity = filter === "equity" || filter === "all";
  // Honest significance: cluster-robust t; fall back to naive only if <2 clusters.
  const tShown = alpha.t_cluster ?? alpha.t_stat;
  const sig = Math.abs(tShown) >= 2;
  const clusterSub = alpha.n_clusters > 1 ? `${alpha.n_clusters} launch-date clusters` : "too few clusters";

  const cards = [
    { k: "mean-ret", label: "Mean return", value: ret.mean, color: signColor(ret.mean), sub: `median ${pct(ret.median)}`, fmt: (v: number) => pct(v) },
    { k: "mean-alpha", label: `Mean excess vs ${benchName}`, value: alpha.mean, color: signColor(alpha.mean), sub: `median ${pct(alpha.median)}`, fmt: (v: number) => pct(v), accent: true },
    { k: "winrate", label: "Beat the market", value: alpha.win_rate, color: alpha.win_rate >= 0.5 ? "var(--pos)" : "var(--neg)", sub: alpha.p_sign != null ? `sign test p=${alpha.p_sign.toFixed(2)} · n=${alpha.n}` : `n=${alpha.n}`, fmt: (v: number) => `${(v * 100).toFixed(0)}%` },
    { k: "tstat", label: "Signal (clustered t)", value: tShown, color: sig ? (tShown > 0 ? "var(--pos)" : "var(--neg)") : "var(--text-dim)", sub: sig ? clusterSub : `within noise · ${clusterSub}`, fmt: (v: number) => v.toFixed(2) },
  ];

  return (
    <div className="stats-band">
      <div className="stats-head">
        <span className="eyebrow">Aggregate · {HORIZON_LABELS[horizon]}</span>
      </div>
      <div className="stats-grid">
        {cards.map((c, i) => (
          <motion.div
            key={c.k}
            className={`stat-card ${c.accent ? "accent" : ""}`}
            initial={enter({ opacity: 0, y: 10 }, still)}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.5 }}
          >
            <div className="stat-label">{c.label}</div>
            <AnimatedNumber
              key={horizon + c.k + c.value.toFixed(4)}
              className="stat-value mono"
              style={{ color: c.color }}
              value={c.value}
              format={c.fmt}
              duration={0.7}
            />
            <div className="stat-sub mono">{c.sub}</div>
          </motion.div>
        ))}
      </div>
      <div className="stats-caveat mono">
        “Excess” = return − {benchName} over the same window, <b>β assumed 1</b> — not a risk-adjusted alpha
        {isEquity && betaExcess.n > 0 && (
          <> · β-adjusted excess (concurrent β) <b style={{ color: signColor(betaExcess.mean) }}>{pct(betaExcess.mean)}</b></>
        )}
        {filter !== "equity" && " · non-equity “excess” vs the S&P is a spread, not an alpha — filter to Equities"}
        {" · t clustered by launch date (same-day listings aren’t independent)"}
      </div>
    </div>
  );
}
