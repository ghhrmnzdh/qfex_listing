"""Produce a lightweight, static-hostable results payload for GitHub Pages.

Reads the full backend/data/index.json and writes frontend/public/site-data.json:
  - keeps every result NUMBER (returns, alpha, summary, event study) at full accuracy
  - DOWN-SAMPLES each listing's daily path to <= MAX_POINTS for the charts
  - drops raw OHLC / volume / benchmark-only bookkeeping

This is "the results", not the raw market data — small enough to commit and serve
statically (no backend, no price cache).
"""
from __future__ import annotations
import json
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE / "data" / "index.json"
OUT = HERE.parent / "frontend" / "public" / "site-data.json"

MAX_POINTS = 44  # per-listing sparkline / detail path resolution


def downsample(series: list[dict], n: int = MAX_POINTS) -> list[dict]:
    if not series:
        return []
    def slim(p):
        out = {"date": p["date"], "ret": round(p["ret"], 5)}
        if p.get("bench_ret") is not None:
            out["bench_ret"] = round(p["bench_ret"], 5)
        return out
    if len(series) <= n:
        return [slim(p) for p in series]
    step = (len(series) - 1) / (n - 1)
    idx = sorted({round(i * step) for i in range(n)} | {0, len(series) - 1})
    return [slim(series[i]) for i in idx]


def main():
    d = json.loads(SRC.read_text())
    d.pop("event_study_all", None)  # unused by the UI

    for L in d["listings"]:
        L["price_series"] = downsample(L["price_series"])
        L.pop("underlier_price", None)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(d, separators=(",", ":")))
    kb = OUT.stat().st_size / 1024
    print(f"Wrote {OUT.relative_to(HERE.parent)} — {kb:.0f} KB "
          f"({d['counts']['markets']} markets, series capped at {MAX_POINTS} pts).")


if __name__ == "__main__":
    main()
