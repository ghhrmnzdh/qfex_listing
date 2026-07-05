import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { HorizonKey, Listing } from "../types";
import { ASSET_CLASS_LABEL, alpha, fmtDate, pct, ret, signColor, HORIZON_LABELS } from "../lib";
import { enter, useStill } from "../anim";
import Sparkline from "./Sparkline";
import DetailChart from "./DetailChart";

interface Props {
  listings: Listing[];
  horizon: HorizonKey;
  benchName: string;
}

type SortKey = "date" | "ret" | "alpha" | "ticker";

export default function IndexTable({ listings, horizon, benchName }: Props) {
  const [open, setOpen] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const t = new URLSearchParams(window.location.search).get("listing");
    return t ? t.toUpperCase() : null;
  });
  const [sort, setSort] = useState<SortKey>("ret");
  const [dir, setDir] = useState<-1 | 1>(-1);
  const still = useStill();

  const priced = listings.filter((l) => l.ok);

  const sorted = [...priced].sort((a, b) => {
    let av: number | string = 0;
    let bv: number | string = 0;
    if (sort === "date") { av = a.listing_date ?? ""; bv = b.listing_date ?? ""; }
    else if (sort === "ticker") { av = a.display_ticker; bv = b.display_ticker; }
    else if (sort === "ret") { av = ret(a, horizon) ?? -Infinity; bv = ret(b, horizon) ?? -Infinity; }
    else { av = alpha(a, horizon) ?? -Infinity; bv = alpha(b, horizon) ?? -Infinity; }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  const setSortKey = (k: SortKey) => {
    if (k === sort) setDir((d) => (d === -1 ? 1 : -1));
    else { setSort(k); setDir(k === "ticker" ? 1 : -1); }
  };

  const arrow = (k: SortKey) => (sort === k ? (dir === -1 ? "↓" : "↑") : "");

  return (
    <div className="table">
      <div className="thead">
        <button className="th th-tick" onClick={() => setSortKey("ticker")}>Listing {arrow("ticker")}</button>
        <button className="th th-date" onClick={() => setSortKey("date")}>Listed {arrow("date")}</button>
        <div className="th th-spark">Since listing</div>
        <button className="th th-num" onClick={() => setSortKey("ret")}>{HORIZON_LABELS[horizon]} {arrow("ret")}</button>
        <button className="th th-num" onClick={() => setSortKey("alpha")}>Alpha {arrow("alpha")}</button>
        <div className="th th-src">Source</div>
      </div>

      <div className="tbody">
        {sorted.map((l, i) => {
          const rv = ret(l, horizon);
          const av = alpha(l, horizon);
          const norm = l.display_ticker.replace(/^\$/, "").toUpperCase();
          const isOpen = open === l.display_ticker || open === norm;
          return (
            <div key={l.display_ticker} className={`row-wrap ${isOpen ? "open" : ""}`}>
              <motion.button
                className="row"
                onClick={() => setOpen(isOpen ? null : l.display_ticker)}
                initial={enter({ opacity: 0, y: 8 }, still)}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.018, 0.5), duration: 0.4 }}
                aria-expanded={isOpen}
              >
                <div className="td td-tick">
                  <span className="tick mono">{l.display_ticker.replace(/^\$/, "")}</span>
                  <span className="tname">{l.name}</span>
                  <span className="tclass">{ASSET_CLASS_LABEL[l.asset_class] ?? l.asset_class}</span>
                  {l.max_leverage ? <span className="tlev mono">{l.max_leverage}×</span> : null}
                </div>
                <div className="td td-date mono">{fmtDate(l.listing_date)}</div>
                <div className="td td-spark">
                  <Sparkline series={l.price_series} animateDraw={!still} />
                </div>
                <div className="td td-num td-ret mono">
                  {rv !== null ? (
                    <span style={{ color: signColor(rv) }}>{pct(rv)}</span>
                  ) : (
                    <span className="partial" title={`Only ${l.days_live}d on QFEX — a full ${HORIZON_LABELS[horizon]} hasn't elapsed. Showing return since listing.`}>
                      {pct(ret(l, "LIVE"))}<em>{l.days_live}d</em>
                    </span>
                  )}
                </div>
                <div className="td td-num td-alpha mono">
                  {rv !== null ? (
                    <span style={{ color: signColor(av) }}>{pct(av)}</span>
                  ) : (
                    <span className="partial" title="Alpha since listing (full horizon not yet elapsed)">
                      {pct(alpha(l, "LIVE"))}
                    </span>
                  )}
                </div>
                <div className="td td-src">
                  {l.source.announce_url ? (
                    <a href={l.source.announce_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="src-link">
                      tweet ↗
                    </a>
                  ) : (
                    <span className="src-qfex" title="Listed on QFEX; no announcing tweet in dataset">QFEX</span>
                  )}
                </div>
              </motion.button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    className="detail"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="detail-inner">
                      <div className="detail-left">
                        <DetailChart series={l.price_series} benchName={benchName} />
                      </div>
                      <div className="detail-right">
                        <DetailStat label="Since listing" v={ret(l, "LIVE")} />
                        <DetailStat label="1 week" v={ret(l, "1W")} />
                        <DetailStat label="1 month" v={ret(l, "1M")} />
                        <DetailStat label={`Alpha (${HORIZON_LABELS[horizon]})`} v={av} accent />
                        <div className="detail-meta mono">
                          <div>listed {fmtDate(l.listing_date)} @ {l.entry_close?.toLocaleString()} {l.quote_asset}</div>
                          <div>{l.days_live}d live · {l.qfex_symbol} · up to {l.max_leverage}× · {ASSET_CLASS_LABEL[l.asset_class] ?? l.asset_class}</div>
                          {l.source.announce_url ? (
                            <div><a href={l.source.announce_url} target="_blank" rel="noreferrer" className="src-link">announcing tweet ↗</a></div>
                          ) : (
                            <div className="detail-note">No announcing tweet in the dataset — sourced directly from QFEX refdata.</div>
                          )}
                          {l.source.note && <div className="detail-note">{l.source.note}</div>}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailStat({ label, v, accent }: { label: string; v: number | null; accent?: boolean }) {
  return (
    <div className={`dstat ${accent ? "accent" : ""}`}>
      <span className="dstat-label">{label}</span>
      <span className="dstat-val mono" style={{ color: accent ? "var(--gold)" : signColor(v) }}>
        {pct(v)}
      </span>
    </div>
  );
}
