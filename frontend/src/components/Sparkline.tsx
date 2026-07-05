import { useMemo } from "react";
import { motion } from "framer-motion";
import type { PricePoint } from "../types";
import { useStill } from "../anim";

interface Props {
  series: PricePoint[];
  width?: number;
  height?: number;
  /** index in the series to draw up to (for horizon-aware ribbons); default all */
  upto?: number;
  animateDraw?: boolean;
  strokeWidth?: number;
}

/**
 * A cumulative-return ribbon. Baseline at 0% is a hairline; the line is colored
 * by the final value. Used both inline (table) and enlarged (detail).
 */
export default function Sparkline({
  series,
  width = 132,
  height = 34,
  upto,
  animateDraw = true,
  strokeWidth = 1.5,
}: Props) {
  const still = useStill();
  const draw = animateDraw && !still;
  const pts = useMemo(() => (upto ? series.slice(0, upto + 1) : series), [series, upto]);

  const geom = useMemo(() => {
    if (pts.length < 2) return null;
    const vals = pts.map((p) => p.ret);
    let lo = Math.min(0, ...vals);
    let hi = Math.max(0, ...vals);
    if (hi - lo < 1e-6) hi = lo + 1e-6;
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
    const x = (i: number) => (i / (pts.length - 1)) * (width - 2) + 1;
    const y = (v: number) => height - ((v - lo) / (hi - lo)) * (height - 2) - 1;
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.ret).toFixed(2)}`).join(" ");
    const area = `${line} L${x(pts.length - 1).toFixed(2)},${height} L${x(0).toFixed(2)},${height} Z`;
    const zeroY = y(0);
    const last = vals[vals.length - 1];
    return { line, area, zeroY, last, xEnd: x(pts.length - 1), yEnd: y(last) };
  }, [pts, width, height]);

  if (!geom) return <div style={{ width, height }} />;

  const up = geom.last >= 0;
  const col = up ? "var(--pos)" : "var(--neg)";
  const gid = useMemo(() => "g" + Math.random().toString(36).slice(2, 8), []);

  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.22" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* zero baseline */}
      <line x1="0" x2={width} y1={geom.zeroY} y2={geom.zeroY} stroke="var(--line)" strokeWidth="1" strokeDasharray="2 3" />
      <motion.path
        d={geom.area}
        fill={`url(#${gid})`}
        initial={draw ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.15 }}
      />
      <motion.path
        d={geom.line}
        fill="none"
        stroke={col}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={draw ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.circle
        cx={geom.xEnd}
        cy={geom.yEnd}
        r={2.2}
        fill={col}
        initial={draw ? { scale: 0 } : false}
        animate={{ scale: 1 }}
        transition={{ delay: 0.7, type: "spring", stiffness: 400, damping: 20 }}
      />
    </svg>
  );
}
