import { useId, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { enter, useStill } from "../anim";
import { pct } from "../lib";

export interface EventPoint {
  day: number;
  n: number;
  mean_ret: number;
  median_ret: number;
  mean_alpha: number | null;
}

interface Props {
  curve: EventPoint[];
  benchName: string;
  height?: number;
}

/** The signature: equal-weight cumulative-average return of every listing,
 *  indexed by trading day since listing, with the benchmark-adjusted alpha
 *  shaded beneath. Lines are revealed by an animated clip (no stroke-dash
 *  artifacts under the non-uniform viewBox). */
export default function EventStudyChart({ curve, benchName, height = 300 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const still = useStill();
  const clip = useId().replace(/:/g, "");
  const W = 100;

  const g = useMemo(() => {
    if (curve.length < 2) return null;
    const rets = curve.map((p) => p.mean_ret);
    const alphas = curve.map((p) => p.mean_alpha ?? 0);
    let lo = Math.min(0, ...rets, ...alphas);
    let hi = Math.max(0, ...rets, ...alphas);
    const pad = (hi - lo) * 0.12 || 0.01;
    lo -= pad; hi += pad * 1.4;
    const x = (i: number) => (i / (curve.length - 1)) * W;
    const y = (v: number) => height - ((v - lo) / (hi - lo)) * (height - 8) - 4;
    const mk = (key: "mean_ret" | "alpha") =>
      curve.map((p, i) => {
        const v = key === "mean_ret" ? p.mean_ret : (p.mean_alpha ?? 0);
        return `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
      }).join(" ");
    const retLine = mk("mean_ret");
    const alphaLine = mk("alpha");
    const alphaArea = `${alphaLine} L${x(curve.length - 1)},${y(0)} L0,${y(0)} Z`;
    return { x, y, zeroY: y(0), retLine, alphaLine, alphaArea };
  }, [curve, height]);

  if (!g) return null;
  const hp = hover !== null ? curve[hover] : curve[curve.length - 1];
  const marks = [1, 5, 21, 63].filter((d) => d <= curve[curve.length - 1].day);

  return (
    <div className="es-wrap">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height, display: "block", overflow: "visible" }}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGElement).getBoundingClientRect();
          const rel = (e.clientX - r.left) / r.width;
          setHover(Math.max(0, Math.min(curve.length - 1, Math.round(rel * (curve.length - 1)))));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`${clip}g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.20" />
            <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <line x1="0" x2={W} y1={g.zeroY} y2={g.zeroY} stroke="var(--line)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        {marks.map((d) => {
          const i = curve.findIndex((p) => p.day === d);
          if (i < 0) return null;
          return <line key={d} x1={g.x(i)} x2={g.x(i)} y1="0" y2={height} stroke="var(--line-soft)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />;
        })}

        <motion.g initial={enter({ opacity: 0 }, still)} animate={{ opacity: 1 }} transition={{ duration: 0.7, ease: "easeOut" }}>
          <path d={g.alphaArea} fill={`url(#${clip}g)`} />
          <path d={g.alphaLine} fill="none" stroke="var(--gold)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={g.retLine} fill="none" stroke="var(--text)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </motion.g>

        {hover !== null && (
          <line x1={g.x(hover)} x2={g.x(hover)} y1="0" y2={height} stroke="var(--text-faint)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      <div className="es-axis mono">
        {marks.map((d) => {
          const i = curve.findIndex((p) => p.day === d);
          return <span key={d} style={{ left: `${(i / (curve.length - 1)) * 100}%` }}>{d}d</span>;
        })}
      </div>

      <div className="es-legend">
        <span className="es-leg"><i style={{ background: "var(--text)" }} /> Mean return</span>
        <span className="es-leg"><i style={{ background: "var(--gold)" }} /> Excess vs {benchName}</span>
        <span className="es-read mono">
          day {hp.day} · ret <b style={{ color: hp.mean_ret >= 0 ? "var(--pos)" : "var(--neg)" }}>{pct(hp.mean_ret)}</b>
          {hp.mean_alpha != null && <> · excess <b style={{ color: "var(--gold)" }}>{pct(hp.mean_alpha)}</b></>}
          <span style={{ color: "var(--text-faint)" }}> · n={hp.n}</span>
        </span>
      </div>
    </div>
  );
}
