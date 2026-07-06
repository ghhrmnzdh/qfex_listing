import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { HorizonKey, IndexData } from "./types";
import { loadIndex, apiAvailable, type LoadProgress } from "./api";
import { statsFor } from "./lib";
import { enter, useStill } from "./anim";
import Hero from "./components/Hero";
import HorizonScrubber from "./components/HorizonScrubber";
import StatsBand from "./components/StatsBand";
import IndexTable from "./components/IndexTable";
import LoadingScreen from "./components/LoadingScreen";
import SyncOverlay from "./components/SyncOverlay";
import Methodology from "./components/Methodology";
import TickerTape from "./components/TickerTape";
import Outro from "./components/Outro";

const FILTERS: { key: string; label: string; test: (c: string) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "equity", label: "Equities", test: (c) => c.startsWith("equity") },
  { key: "index", label: "Indices & ETFs", test: (c) => c === "index" },
  { key: "macro", label: "Commodity & FX", test: (c) => ["commodity", "forex"].includes(c) },
];

export default function App() {
  const [data, setData] = useState<IndexData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loadProg, setLoadProg] = useState<LoadProgress | null>(null);
  const [horizon, setHorizon] = useState<HorizonKey>("1M");
  const [filter, setFilter] = useState("all");
  const [hasApi, setHasApi] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const still = useStill();

  const load = () =>
    loadIndex(setLoadProg).then((d) => { setData(d); setErr(null); }).catch((e) => setErr(String(e)));

  useEffect(() => {
    load();
    apiAvailable().then((ok) => {
      setHasApi(ok);
      if (ok && new URLSearchParams(window.location.search).has("sync")) setSyncing(true);
    });
  }, []); // eslint-disable-line

  const filtered = useMemo(() => {
    if (!data) return [];
    const f = FILTERS.find((x) => x.key === filter)!;
    return data.listings.filter((l) => l.ok && f.test(l.asset_class));
  }, [data, filter]);

  const stats = useMemo(() => statsFor(filtered, horizon), [filtered, horizon]);

  if (err && !data) return (
    <div className="loading">
      <div style={{ textAlign: "center" }}>
        <div style={{ marginBottom: 12 }}>{err}</div>
        <button className="chip active" onClick={() => setSyncing(true)}>Sync from QFEX</button>
      </div>
      <AnimatePresence>
        {syncing && <SyncOverlay onClose={() => setSyncing(false)} onDone={() => { setSyncing(false); load(); }} />}
      </AnimatePresence>
    </div>
  );
  if (!data) return <LoadingScreen progress={loadProg} />;

  return (
    <div className="app">
      <div className="shell">
        <TickerTape listings={data.listings} />
        <Hero data={data} />

        <section className="index-section">
          <div className="section-head">
            <div>
              <h2 className="section-title">The index</h2>
              <p className="section-sub">
                Every market on QFEX — priced from its own perp candles, returns and excess return vs
                the {data.benchmark.name} perp, matched to the announcing tweet where one exists. Click any
                row for the full path. Filter to <b>Equities</b> for the stock-pick study (excess vs the
                S&P is only an alpha proxy for equities).
              </p>
            </div>
            <div className="section-controls">
              {hasApi ? (
                <button className="sync-btn" onClick={() => setSyncing(true)} title="Fetch any missing markets live from api.qfex.com (cached, resumable)">
                  <span className="sync-btn-dot" /> Sync from QFEX
                </button>
              ) : (
                <span className="static-badge mono" title="Static snapshot — run the backend locally to sync live from QFEX">
                  static snapshot
                </span>
              )}
              <HorizonScrubber horizons={data.horizons} value={horizon} onChange={setHorizon} />
            </div>
          </div>

          <div className="controls">
            <div className="filters">
              {FILTERS.map((f) => {
                const n = data.listings.filter((l) => l.ok && f.test(l.asset_class)).length;
                return (
                  <button
                    key={f.key}
                    className={`chip ${filter === f.key ? "active" : ""}`}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label} <span className="chip-n mono">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={filter + horizon}
              initial={enter({ opacity: 0, y: 8 }, still)}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <StatsBand ret={stats.return} alpha={stats.alpha} betaExcess={stats.betaExcess} filter={filter} horizon={horizon} benchName={data.benchmark.name} />
            </motion.div>
          </AnimatePresence>

          <IndexTable listings={filtered} horizon={horizon} benchName={data.benchmark.name} />
        </section>

        <Methodology data={data} />

        <Outro />

        <footer className="footer">
          <div className="mono">
            Source: QFEX exchange (api.qfex.com) perp candles · benchmark {data.benchmark.name} ({data.benchmark.symbol}) ·{" "}
            {data.counts?.markets} markets · generated {new Date(data.generated).toLocaleString()}
          </div>
          <div className="foot-note">
            Each market is priced from its own QFEX perpetual, entered at the first candle (its launch on QFEX).
            Excess return = listing return minus the {data.benchmark.name} perp over the identical window (β assumed 1,
            so it is not a risk-adjusted alpha; for non-equities it is a spread, not an alpha). t-stats are clustered
            by launch date. Horizons are calendar days (QFEX trades 24/7). Not investment advice.
          </div>
        </footer>
      </div>

      <AnimatePresence>
        {syncing && <SyncOverlay onClose={() => setSyncing(false)} onDone={() => { setSyncing(false); load(); }} />}
      </AnimatePresence>
    </div>
  );
}
