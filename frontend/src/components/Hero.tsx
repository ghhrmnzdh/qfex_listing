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

  const verdict = m1.alpha.mean > 0 && m1.alpha.win_rate >= 0.5;

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
        {verdict ? (
          <>
            <span className="hl">Yes — but it pays out in weeks, not on day one.</span> Buy every listing at the
            announcement and hold a month, and the basket beat the {data.benchmark.name} by an average of{" "}
            <b className="gold mono">{pct(m1.alpha.mean)}</b>, winning{" "}
            <b className="mono">{(m1.alpha.win_rate * 100).toFixed(0)}%</b> of the time. The day-one pop actually{" "}
            <b className="neg mono">{pct(d1.alpha.mean)}</b> fades first, and a handful of names carry the tail.
          </>
        ) : (
          <>
            <span className="hl">Barely.</span> Across {data.summary.n_listings} listings the post-announcement edge
            over the {data.benchmark.name} is thin and inconsistent.
          </>
        )}
      </motion.p>

      <motion.div
        className="hero-verdicts"
        initial={enter({ opacity: 0, y: 12 }, still)}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.32 }}
      >
        <Verdict label="1-month alpha" value={m1.alpha.mean} fmt={pct} color="var(--gold)" big />
        <Verdict label="Beat the market" value={m1.alpha.win_rate} fmt={(v) => `${(v * 100).toFixed(0)}%`} color="var(--text)" />
        <Verdict label="Day-1 reaction" value={d1.alpha.mean} fmt={pct} color="var(--neg)" />
        <Verdict label="Best / worst 1M" value={m1.return.best} fmt={(v) => `${pct(v)}`} color="var(--pos)"
          sub={pct(m1.return.worst)} />
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
          Each line averages the cumulative return of every listing at the same number of trading days after it was
          announced. The gold band is the excess over the {data.benchmark.name}. Sample thins past ~1 month — only the
          earliest listings are old enough to reach the right edge.
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
      {sub && <div className="verdict-sub mono">worst {sub}</div>}
    </div>
  );
}
