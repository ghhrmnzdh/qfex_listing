import { useMemo } from "react";
import type { Listing } from "../types";
import { pct } from "../lib";
import { useStill } from "../anim";
import { IndexMark } from "./Brand";

/**
 * QFEX-signature split-flap ticker tape — an homage to the amber Solari board on
 * qfex.com. A seamless amber-on-black marquee of every listing and its
 * since-listing return, with the Q lockup and a "Trade on QFEX" pill.
 */
export default function TickerTape({ listings }: { listings: Listing[] }) {
  const still = useStill();

  const items = useMemo(() => {
    const rows = listings
      .filter((l) => l.ok && l.returns?.LIVE)
      .map((l) => ({
        t: l.display_ticker.replace(/^\$/, ""),
        r: l.returns!.LIVE!.asset_return,
      }));
    // stable, engaging order: biggest movers first, both directions interleaved
    rows.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    return rows.slice(0, 48);
  }, [listings]);

  if (!items.length) return null;
  const loop = [...items, ...items]; // duplicate for a seamless marquee

  return (
    <div className="tape" role="marquee" aria-label="QFEX listings ticker">
      <span className="tape-brand" aria-label="The Listing Index">
        <IndexMark size={18} />
        <span className="tape-brand-txt mono">LISTING&nbsp;INDEX</span>
      </span>

      <div className="tape-viewport">
        <div className={`tape-track ${still ? "static" : ""}`}>
          {loop.map((it, i) => (
            <span className="tape-cell" key={i} aria-hidden={i >= items.length}>
              <i className={`tape-arw ${it.r >= 0 ? "up" : "dn"}`}>{it.r >= 0 ? "▲" : "▼"}</i>
              <span className="tape-sym">{it.t}</span>
              <span className="tape-val">{pct(it.r)}</span>
            </span>
          ))}
        </div>
      </div>

      <a className="tape-cta" href="https://www.qfex.com" target="_blank" rel="noreferrer">
        Trade on QFEX <span aria-hidden>↗</span>
      </a>
    </div>
  );
}
