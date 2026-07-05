import { motion } from "framer-motion";
import type { IndexData } from "../types";
import { enter, useStill } from "../anim";

/** A compact, standalone-readable statement of how the study is constructed —
 *  what turns the page from a dashboard into a quant study. */
export default function Methodology({ data }: { data: IndexData }) {
  const still = useStill();
  const rows: [string, React.ReactNode][] = [
    ["Universe", `${data.counts?.markets ?? data.listings.length} markets QFEX has listed — equities, indices & ETFs, commodities, FX.`],
    ["Prices", "Each market's own QFEX perpetual daily candle (api.qfex.com). Entry = the first candle, i.e. its launch on QFEX."],
    ["Horizons", "Calendar days — QFEX trades 24/7, so the series is continuous. 1D / 1W / 1M / 3M and since-listing."],
    ["Benchmark", `${data.benchmark.name} (${data.benchmark.symbol}), extended with index history so pre-benchmark launches still get an alpha. Alpha = listing return − benchmark over the identical window.`],
    ["Event study", "Equal-weight cumulative-average return of every equity listing, aligned to its own launch day (the hero chart)."],
    ["Source", "95 of the markets are matched to their announcing tweet; the rest are taken straight from QFEX reference data."],
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
        aggregate stats only count markets that have actually reached it. The 3-month tail
        has few names and is dominated by a handful of outliers, so read it as directional,
        not precise. Prices are point-in-time perp marks. This is a study, not investment advice.
      </motion.p>
    </section>
  );
}
