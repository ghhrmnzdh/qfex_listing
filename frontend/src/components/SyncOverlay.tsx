import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { openSync, type SyncEvent } from "../api";
import { pct } from "../lib";

interface Props {
  onClose: () => void;
  onDone: () => void; // reload the index after a successful sync
  force?: boolean; // true = refresh all prices; false = fetch-once / resume
}

interface Line {
  symbol: string;
  name?: string;
  ok?: boolean;
  cached?: boolean;
  live?: number | null;
}

/** Full-screen overlay that streams the QFEX build market-by-market. Data is
 *  fetched once (cached symbols are reused), so a failed run can Resume and only
 *  pull what's missing. */
export default function SyncOverlay({ onClose, onDone, force = false }: Props) {
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(126);
  const [downloaded, setDownloaded] = useState(0);
  const [current, setCurrent] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([]);
  const [phase, setPhase] = useState<SyncEvent["phase"]>("start");
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<SyncEvent["counts"] | null>(null);
  const [preCached, setPreCached] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);

  const start = useCallback(() => {
    setError(null);
    setPhase("start");
    stopRef.current?.();
    stopRef.current = openSync((e) => {
      if (e.phase === "start") {
        setTotal(e.total ?? 126);
        setPreCached(e.already_cached ?? 0);
        setPhase("start");
      } else if (e.phase === "benchmark") {
        setCurrent(e.symbol ?? "");
        setPhase("benchmark");
      } else if (e.phase === "market") {
        setDone(e.done ?? 0);
        setDownloaded(e.downloaded ?? 0);
        setCurrent(e.symbol ?? "");
        setPhase("market");
        setLines((prev) =>
          [{ symbol: e.symbol!, name: e.name, ok: e.ok, cached: e.cached, live: e.live }, ...prev].slice(0, 60)
        );
      } else if (e.phase === "done") {
        setPhase("done");
        setCounts(e.counts ?? null);
        setDownloaded(e.downloaded ?? 0);
        setDone(e.total ?? 0);
        setTimeout(onDone, 700);
      } else if (e.phase === "error") {
        setError(e.message ?? "Sync failed.");
        setPhase("error");
      }
    }, force);
  }, [force, onDone]);

  useEffect(() => {
    start();
    return () => stopRef.current?.();
  }, [start]);

  const frac = total ? done / total : 0;
  const closable = phase === "done" || phase === "error";

  return (
    <motion.div className="sync-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={closable ? onClose : undefined}>
      <motion.div className="sync-card" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }} onClick={(e) => e.stopPropagation()}>
        <div className="sync-head">
          <div>
            <div className="sync-eyebrow"><span className="dot" /> {force ? "REFRESH" : "SYNC"} · api.qfex.com</div>
            <div className="sync-title">
              {phase === "done" ? "Up to date." : phase === "error" ? "Sync interrupted" : "Fetching market data"}
            </div>
          </div>
          <div className="sync-count mono">{done}<span>/{total}</span></div>
        </div>

        <div className="sync-bar">
          <motion.span className="sync-fill" animate={{ width: `${frac * 100}%` }} transition={{ ease: "easeOut", duration: 0.3 }} />
        </div>

        <div className="sync-status mono">
          {phase === "error" ? (
            <span className="neg">{error}</span>
          ) : phase === "done" ? (
            <span className="pos">
              {counts?.markets} markets · {downloaded} downloaded · {(total - downloaded)} from cache
            </span>
          ) : phase === "start" && preCached > 0 ? (
            <>resuming — {preCached} of {total} already cached, fetching the rest…</>
          ) : (
            <>
              fetching <b className="gold">{current || "…"}</b> · {(frac * 100).toFixed(0)}%
              {downloaded > 0 && <span style={{ color: "var(--text-faint)" }}> · {downloaded} new</span>}
            </>
          )}
        </div>

        <div className="sync-tape">
          <AnimatePresence initial={false}>
            {lines.map((l, i) => (
              <motion.div key={l.symbol + i} className="sync-line"
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1 - i * 0.014, x: 0 }} transition={{ duration: 0.22 }}>
                <span className="sync-sym mono">{l.symbol}</span>
                <span className="sync-name">
                  {l.name}
                  {l.cached && <span className="sync-cached">cached</span>}
                </span>
                <span className="sync-ret mono" style={{ color: (l.live ?? 0) >= 0 ? "var(--pos)" : "var(--neg)" }}>
                  {l.live == null ? "—" : pct(l.live)}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {phase === "error" && (
          <div className="sync-actions">
            <button className="sync-close primary" onClick={start}>Resume</button>
            <button className="sync-close" onClick={onClose}>Close</button>
          </div>
        )}
        {phase === "done" && <button className="sync-close" onClick={onClose}>Close</button>}
      </motion.div>
    </motion.div>
  );
}
