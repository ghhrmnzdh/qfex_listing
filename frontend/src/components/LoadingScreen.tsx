import { motion } from "framer-motion";
import type { LoadProgress } from "../api";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** Initial data-load screen with a real byte-progress bar. */
export default function LoadingScreen({ progress }: { progress: LoadProgress | null }) {
  const pct = progress?.total ? Math.min(1, progress.received / progress.total) : null;
  return (
    <div className="boot">
      <motion.div className="boot-inner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        <div className="boot-eyebrow"><span className="dot" /> THE QFEX LISTING INDEX</div>
        <div className="boot-title">Loading the index…</div>
        <div className="boot-sub mono">market data · returns · alpha</div>

        <div className="boot-bar">
          {pct !== null ? (
            <motion.span className="boot-fill" style={{ width: `${pct * 100}%` }} transition={{ ease: "linear" }} />
          ) : (
            <motion.span
              className="boot-fill indeterminate"
              animate={{ x: ["-40%", "260%"] }}
              transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
            />
          )}
        </div>
        <div className="boot-meta mono">
          {progress ? (
            <>
              {fmtBytes(progress.received)}
              {progress.total ? ` / ${fmtBytes(progress.total)}` : ""}
              {pct !== null ? ` · ${(pct * 100).toFixed(0)}%` : ""}
            </>
          ) : (
            "connecting…"
          )}
        </div>
      </motion.div>
    </div>
  );
}
