import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { PricePoint } from "../types";
import { useStill } from "../anim";
import { pct, fmtDateShort } from "../lib";

interface Props {
  series: (PricePoint & { bench_ret?: number | null })[];
  benchName: string;
  height?: number;
}

/** Asset cumulative-return line vs benchmark since listing, with hover readout. */
export default function DetailChart({ series, benchName, height = 210 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const still = useStill();
  const W = 100; // viewBox units (responsive via width:100%)

  const g = useMemo(() => {
    if (series.length < 2) return null;
    const a = series.map((p) => p.ret);
    const b = series.map((p) => (p.bench_ret ?? null)).filter((v) => v !== null) as number[];
    let lo = Math.min(0, ...a, ...(b.length ? b : [0]));
    let hi = Math.max(0, ...a, ...(b.length ? b : [0]));
    if (hi - lo < 1e-6) hi = lo + 1e-6;
    const pad = (hi - lo) * 0.1;
    lo -= pad; hi += pad;
    const x = (i: number) => (i / (series.length - 1)) * W;
    const y = (v: number) => height - ((v - lo) / (hi - lo)) * (height - 6) - 3;
    const path = (key: "ret" | "bench_ret") =>
      series
        .map((p, i) => {
          const v = key === "ret" ? p.ret : p.bench_ret;
          if (v === null || v === undefined) return "";
          return `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
        })
        .filter(Boolean)
        .join(" ");
    const assetLine = path("ret");
    const assetArea = `${assetLine} L${x(series.length - 1)},${height} L0,${height} Z`;
    return { x, y, zeroY: y(0), assetLine, assetArea, benchLine: path("bench_ret") };
  }, [series, height]);

  if (!g) return null;
  const last = series[series.length - 1];
  const up = last.ret >= 0;
  const col = up ? "var(--pos)" : "var(--neg)";
  const hp = hover !== null ? series[hover] : null;

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height, display: "block" }}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGElement).getBoundingClientRect();
          const rel = (e.clientX - r.left) / r.width;
          setHover(Math.max(0, Math.min(series.length - 1, Math.round(rel * (series.length - 1)))));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="detailFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity="0.16" />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={g.zeroY} y2={g.zeroY} stroke="var(--line)" strokeWidth="0.4" strokeDasharray="0.8 1.2" vectorEffect="non-scaling-stroke" />
        <motion.path d={g.assetArea} fill="url(#detailFill)" initial={still ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} />
        {g.benchLine && (
          <motion.path
            d={g.benchLine}
            fill="none"
            stroke="var(--text-faint)"
            strokeWidth="1"
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
            initial={still ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
        <motion.path
          d={g.assetLine}
          fill="none"
          stroke={col}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={still ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
        {hover !== null && (
          <line x1={g.x(hover)} x2={g.x(hover)} y1="0" y2={height} stroke="var(--line)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      {/* legend + hover readout */}
      <div style={{ display: "flex", gap: 18, marginTop: 10, fontSize: 12, color: "var(--text-dim)", alignItems: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <i style={{ width: 14, height: 2, background: col, display: "inline-block" }} /> Listing
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <i style={{ width: 14, height: 0, borderTop: "1.5px dashed var(--text-faint)", display: "inline-block" }} /> {benchName}
        </span>
        <span style={{ marginLeft: "auto" }} className="mono">
          {hp ? (
            <>
              {fmtDateShort(hp.date)} · <b style={{ color: hp.ret >= 0 ? "var(--pos)" : "var(--neg)" }}>{pct(hp.ret)}</b>
              {hp.bench_ret != null && <span style={{ color: "var(--text-faint)" }}> · {benchName} {pct(hp.bench_ret)}</span>}
            </>
          ) : (
            <span style={{ color: "var(--text-faint)" }}>hover to inspect</span>
          )}
        </span>
      </div>
    </div>
  );
}
