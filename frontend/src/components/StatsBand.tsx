import { motion } from "framer-motion";
import type { HorizonKey } from "../types";
import { HORIZON_LABELS, pct, signColor, type Blk } from "../lib";
import { enter, useStill } from "../anim";
import AnimatedNumber from "./AnimatedNumber";

interface Props {
  ret: Blk;
  alpha: Blk;
  horizon: HorizonKey;
  benchName: string;
}

/** The evidence band: for the selected horizon over the current filter — mean
 *  return, mean alpha, beat-rate, and a significance read. */
export default function StatsBand({ ret, alpha, horizon, benchName }: Props) {
  const still = useStill();
  const cards = [
    { k: "mean-ret", label: "Mean return", value: ret.mean, color: signColor(ret.mean), sub: `median ${pct(ret.median)}`, fmt: (v: number) => pct(v) },
    { k: "mean-alpha", label: `Mean alpha vs ${benchName}`, value: alpha.mean, color: signColor(alpha.mean), sub: `median ${pct(alpha.median)}`, fmt: (v: number) => pct(v), accent: true },
    { k: "winrate", label: "Beat the market", value: alpha.win_rate, color: alpha.win_rate >= 0.5 ? "var(--pos)" : "var(--neg)", sub: `${alpha.n} listings priced`, fmt: (v: number) => `${(v * 100).toFixed(0)}%` },
    { k: "tstat", label: "Signal (t-stat)", value: alpha.t_stat, color: Math.abs(alpha.t_stat) >= 2 ? (alpha.t_stat > 0 ? "var(--pos)" : "var(--neg)") : "var(--text-dim)", sub: Math.abs(alpha.t_stat) >= 2 ? "distinguishable from noise" : "within noise", fmt: (v: number) => v.toFixed(2) },
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
    </div>
  );
}
