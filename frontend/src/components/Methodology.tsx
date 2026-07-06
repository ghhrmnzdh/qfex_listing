import { motion } from "framer-motion";
import type { IndexData } from "../types";
import { enter, useStill } from "../anim";

/** A compact, standalone-readable statement of how the study is constructed —
 *  what turns the page from a dashboard into a quant study. */
export default function Methodology({ data }: { data: IndexData }) {
  const still = useStill();
  const rows: [string, React.ReactNode][] = [
    ["Universe", `${data.counts?.markets ?? data.listings.length} markets QFEX has listed — ${data.summary.n_equity ?? "104"} equities plus indices/ETFs, commodities & FX. The stock-pick study is the equities only; “excess vs the S&P” for a commodity or FX pair is a spread, not an alpha.`],
    ["Entry", "The first QFEX perpetual candle (api.qfex.com) — the market's launch on QFEX. Note this is the launch, which can differ from the announcing tweet by days or weeks, so the study measures launch-to-hold, not announcement-to-hold."],
    ["Horizons", "Calendar days — QFEX trades 24/7, so the series is continuous. 1D / 1W / 1M / 3M and since-listing. Sample shrinks with horizon (only older cohorts reach 3M), so each horizon is a different set of names — not one basket followed through time."],
    ["Benchmark & excess", `${data.benchmark.name} (${data.benchmark.symbol}), extended with index history so pre-benchmark launches still get a comparison. “Excess” = listing return − benchmark over the identical window, β assumed 1 — so it is not a risk-adjusted alpha. A β-adjusted excess is also reported for the equities: β is estimated from the listing's own concurrent daily returns (no pre-launch history exists) and Vasicek-shrunk toward 1, so noisy short-window estimates collapse to the market and don't manufacture excess.`],
    ["Significance", "t-stats are clustered by launch date: listings that go live the same day (up to 12 at once here) share one market shock and are not independent draws, which naive i.i.d. t-stats ignore. A two-sided binomial sign test is also shown, since the long-horizon return distribution is heavily right-skewed and fails the t-test's normality assumption."],
    ["Event study", "Equal-weight cumulative-average return of every equity listing, aligned to its own launch day (the hero chart)."],
    ["Source", "95 of the markets are matched to their announcing tweet; the rest are taken straight from QFEX reference data. Universe is current reference data, so any fully delisted market is invisible (survivorship)."],
  ];

  return (
    <section className="method">
      <motion.span className="eyebrow" initial={enter({ opacity: 0, y: 8 }, still)}
        whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5 }}>
        Methodology
      </motion.span>
      <div className="method-grid">
        {rows.map(([k, v], i) => (
          <motion.div key={k} className="method-row"
            initial={enter({ opacity: 0, y: 12 }, still)}
            whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, delay: i * 0.04 }}>
            <div className="method-k">{k}</div>
            <div className="method-v">{v}</div>
          </motion.div>
        ))}
      </div>
      <motion.p className="method-caveat"
        initial={enter({ opacity: 0 }, still)} whileInView={{ opacity: 1 }}
        viewport={{ once: true }} transition={{ duration: 0.6 }}>
        Caveats: markets too young for a horizon show their return <em>so far</em>, and the
        aggregate stats only count markets that have actually reached it. Once restricted to
        equities and clustered by launch date, none of the horizon excess returns are
        statistically significant at conventional levels — the point estimates lean positive
        by a month, but the honest read is “not distinguishable from noise.” The 3-month tail
        has few names and is dominated by a handful of outliers, so read it as directional,
        not precise. Prices are point-in-time perp marks. This is a study, not investment advice.
      </motion.p>
    </section>
  );
}
