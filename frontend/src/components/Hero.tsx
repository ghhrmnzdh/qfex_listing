import { motion } from "framer-motion";
import type { IndexData } from "../types";
import { pct, statsFor, fmtDate } from "../lib";
import { enter, useStill } from "../anim";
import AnimatedNumber from "./AnimatedNumber";
import EventStudyChart from "./EventStudyChart";

export default function Hero({ data }: { data: IndexData }) {
  const still = useStill();
  const equity = data.listings.filter((l) => l.ok && !["index", "commodity", "forex"].includes(l.asset_class));
  const m1 = statsFor(equity, "1M");
  const d1 = statsFor(equity, "1D");
  const dates = data.listings.filter((l) => l.listing_date).map((l) => l.listing_date!);
  const first = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : "";
  const last = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : "";

  // Honest read: is the 1-month excess distinguishable from noise once we cluster
  // same-day launches? (t_cluster ~1.3 here → no.) Point estimate can be positive
  // while being statistically indistinguishable from zero.
  const t1 = m1.alpha.t_cluster ?? m1.alpha.t_stat;
  const significant = Math.abs(t1) >= 2;
  const leansPositive = m1.alpha.mean > 0 && m1.alpha.win_rate >= 0.5;

  return (
    <header className="hero">
      <motion.div
        className="hero-eyebrow"
        initial={enter({ opacity: 0, y: -8 }, still)}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <span className="dot" /> THE QFEX LISTING INDEX
        <span className="hero-eyebrow-meta mono">
          {data.counts?.markets ?? data.summary.n_listings} markets · priced on QFEX perps · {fmtDate(first)} — {fmtDate(last)}
        </span>
      </motion.div>

      <motion.h1
        className="hero-title"
        initial={enter({ opacity: 0, y: 14 }, still)}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.08 }}
      >
        Is there alpha in QFEX's listings?
      </motion.h1>

      <motion.p
        className="hero-answer"
        initial={enter({ opacity: 0 }, still)}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.2 }}
      >
        <span className="hl">
          {significant ? "Yes." : leansPositive ? "Not that we can prove." : "No clear edge."}
        </span>{" "}
        Buy every equity listing at its QFEX launch and hold a month and the basket's excess over the{" "}
        {data.benchmark.name} averages <b className="gold mono">{pct(m1.alpha.mean)}</b> (median{" "}
        <b className="mono">{pct(m1.alpha.median)}</b>, winning{" "}
        <b className="mono">{(m1.alpha.win_rate * 100).toFixed(0)}%</b>) — but clustering same-day launches that's{" "}
        <b className="mono">t={t1.toFixed(1)}</b>, {significant ? "clear of" : "inside"} the noise. β-adjusting trims it
        to <b className="gold mono">{pct(m1.betaExcess.mean)}</b>. Day one is{" "}
        <b className="neg mono">{pct(d1.alpha.mean)}</b> (t={(d1.alpha.t_cluster ?? d1.alpha.t_stat).toFixed(1)}), and a
        few monster names carry the tail while the median listing roughly matches the market.
      </motion.p>

      <motion.div
        className="hero-verdicts"
        initial={enter({ opacity: 0, y: 12 }, still)}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.32 }}
      >
        <Verdict label="1-month excess" value={m1.alpha.mean} fmt={pct} color="var(--gold)" big
          sub={`clustered t=${t1.toFixed(1)} · ${significant ? "significant" : "within noise"}`} />
        <Verdict label="Beat the market" value={m1.alpha.win_rate} fmt={(v) => `${(v * 100).toFixed(0)}%`} color="var(--text)"
          sub={m1.alpha.p_sign != null ? `sign test p=${m1.alpha.p_sign.toFixed(2)}` : `n=${m1.alpha.n}`} />
        <Verdict label="Day-1 reaction" value={d1.alpha.mean} fmt={pct} color="var(--neg)"
          sub={`clustered t=${(d1.alpha.t_cluster ?? d1.alpha.t_stat).toFixed(1)}`} />
        <Verdict label="β-adjusted 1M" value={m1.betaExcess.mean} fmt={pct} color="var(--gold)"
          sub={`vs +${(m1.alpha.mean * 100).toFixed(1)}% raw excess`} />
      </motion.div>

      <motion.div
        className="hero-chart"
        initial={enter({ opacity: 0, y: 20 }, still)}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.4 }}
      >
        <div className="hero-chart-head">
          <span className="eyebrow">Equal-weight event study · every listing, aligned to its listing day</span>
          <span className="eyebrow-dim mono">excl. index · commodity · FX</span>
        </div>
        <EventStudyChart curve={data.event_study} benchName={data.benchmark.name} />
        <p className="hero-chart-note">
          Each line averages the cumulative return of every equity listing at the same number of calendar days after it
          listed on QFEX (perps trade 24/7). The gold band is the excess over the {data.benchmark.name} (β=1). Sample
          thins past ~1 month — only the earliest listings are old enough to reach the right edge, so the tail is a
          different, smaller cohort, not the full basket.
        </p>
      </motion.div>
    </header>
  );
}

function Verdict({ label, value, fmt, color, sub, big }: {
  label: string; value: number; fmt: (v: number) => string; color: string; sub?: string; big?: boolean;
}) {
  return (
    <div className={`verdict ${big ? "big" : ""}`}>
      <div className="verdict-label">{label}</div>
      <AnimatedNumber className="verdict-value mono" style={{ color }} value={value} format={fmt} duration={1.1} />
      {sub && <div className="verdict-sub mono">{sub}</div>}
    </div>
  );
}
