"""QFEX Listings Index — data pipeline (QFEX-native).

Source of truth is the QFEX exchange itself:
  - refdata → every listed market (the authoritative listing universe)
  - candles → the actual QFEX perp price history; first candle = true launch date

For each market we compute forward returns and benchmark-adjusted alpha (vs QFEX's
own S&P 500 perp, US500-USD) at 1D/1W/1M/3M/since-listing, plus an equal-weight
event-study curve. Each market is matched to its announcing tweet where one exists.

Horizons are in CALENDAR days — QFEX perps trade 24/7 so the daily candle series is
continuous (no trading-day gaps to reconcile).

Run:  python pipeline.py        (uses cache)
      REFRESH=1 python pipeline.py   (force re-fetch)
"""
from __future__ import annotations
import json
import os
import statistics
import math
from datetime import date, datetime, timezone, timedelta
from pathlib import Path

import qfex

HERE = Path(__file__).parent
DATA_DIR = HERE / "data"
DATA_DIR.mkdir(exist_ok=True)

BENCHMARK_SYMBOL = "US500-USD"
BENCHMARK_NAME = "S&P 500"

HORIZONS = {"1D": 1, "1W": 7, "1M": 30, "3M": 90}  # calendar days

# Markets excluded from the equity event-study (not stock-picks)
NON_EQUITY = {"INDEX", "COMMODITY", "FX"}

# Curated display names for markets QFEX lists that we don't have a tweet for.
NAME_MAP = {
    "AAPL": "Apple Inc", "NVDA": "NVIDIA Corp", "GOOGL": "Alphabet Inc",
    "MSFT": "Microsoft Corp", "ARM": "Arm Holdings", "CAT": "Caterpillar Inc",
    "CRM": "Salesforce Inc", "GS": "Goldman Sachs Group", "QCOM": "Qualcomm Inc",
    "ZM": "Zoom Communications", "NOK": "Nokia Corp", "SPCE": "Virgin Galactic",
    "BFLY": "Butterfly Network", "BMNR": "Bitmine Immersion", "ADEA": "Adeia Inc",
    "CHYM": "Chime Financial", "MITK": "Mitek Systems", "PL": "Planet Labs",
    "RDCM": "RADCOM Ltd", "SKM": "SK Telecom", "SPCX": "SpaceX (pre-IPO proxy)",
    "COHR": "Coherent Corp", "GLW": "Corning Inc",
    "KOSPI": "KOSPI Index", "US100": "Nasdaq 100", "XLE": "Energy Select SPDR",
    "XLF": "Financials Select SPDR", "ASHR": "China A-Shares ETF", "QSOL": "Quantum/Solar Basket",
    "GOLD": "Gold", "COPPER": "Copper", "SILVER": "Silver", "URANIUM": "Uranium",
    "CL": "Crude Oil", "NATGAS": "Natural Gas",
    "EUR": "Euro / US Dollar", "GBP": "British Pound / USD", "USD": "US Dollar / Yen",
    "SAMSUNG": "Samsung Electronics", "HYUNDAI": "Hyundai Motor", "KIA": "Kia Corp",
    "SKHYNIX": "SK Hynix",
    "US500": "S&P 500", "HSI": "Hang Seng Index", "NIKKEI": "Nikkei 225",
    "TAIEX": "TAIEX Index", "DRAM": "Roundhill Memory ETF", "IGV": "iShares Software ETF",
    "SOXL": "Direxion Semi Bull 3X",
}

# tweet-ticker (as in listings.json) -> QFEX base_asset, for source matching
TWEET_ALIAS = {
    "005930": "SAMSUNG", "005380": "HYUNDAI", "000270": "KIA", "000660": "SKHYNIX",
    "CRUDE OIL": "CL", "SILVER": "SILVER", "URANIUM": "URANIUM", "NATGAS": "NATGAS",
    "EUR/USD": "EUR", "US500": "US500",
}


def norm_ticker(t: str) -> str:
    return t.replace("$", "").strip().upper()


def build_tweet_index() -> dict[str, dict]:
    """Map QFEX base_asset -> announcing-tweet info from the extraction."""
    p = HERE / "listings.json"
    if not p.exists():
        return {}
    raw = json.loads(p.read_text())
    listings = raw["listings"] if isinstance(raw, dict) else raw
    idx = {}
    for L in listings:
        key = norm_ticker(L["display_ticker"])
        key = TWEET_ALIAS.get(key, key)
        idx[key] = {
            "announce_url": L.get("announce_url"),
            "tweet_date": L.get("listing_date"),
            "name": L.get("name"),
            "note": L.get("notes"),
            "all_tweet_urls": L.get("all_tweet_urls"),
        }
    return idx


def asset_class(m: dict) -> str:
    cat = m.get("product_category")
    if cat == "COMMODITY":
        return "commodity"
    if cat == "INDEX":
        return "index"
    if cat == "FX":
        return "forex"
    # EQUITY — split by quote currency
    q = (m.get("quote_asset") or "").upper()
    if q == "KRW":
        return "equity_kr"
    if q in ("SEK", "EUR", "GBP", "JPY"):
        return "equity_intl"
    return "equity_us"


def build_benchmark(force: bool) -> list[dict]:
    """Continuous S&P 500 benchmark for the full listing period.

    QFEX's own US500-USD perp only starts at its launch (~2026-03-03), but many
    markets were listed earlier. We chain the real S&P 500 index (CNBC .SPX) onto
    the QFEX series at the join date so the level is continuous: QFEX perp levels
    from launch onward, real-index returns before that. Return-based alpha is
    identical either way; this just extends coverage back in time."""
    qbars = qfex.fetch_candles(BENCHMARK_SYMBOL, force=force)
    if not qbars:
        return qbars
    try:
        import cnbc
        sbars = cnbc.fetch_bars(".SPX")
    except Exception:  # noqa
        sbars = []
    if not sbars:
        return qbars

    join = qbars[0]["date"]
    s_at_join = _last_close_on_or_before(sbars, join)
    if not s_at_join:
        return qbars
    factor = qbars[0]["close"] / s_at_join  # scale index to the perp's level at the join
    combined = {b["date"]: b["close"] * factor for b in sbars if b["date"] < join}
    for b in qbars:
        combined[b["date"]] = b["close"]
    return [{"date": d, "close": combined[d]} for d in sorted(combined)]


def _last_close_on_or_before(bars: list[dict], d: str) -> float | None:
    prev = None
    for b in bars:
        if b["date"] <= d:
            prev = b["close"]
        else:
            break
    return prev


def _bar_at_or_before(bars: list[dict], d: str):
    prev = None
    for b in bars:
        if b["date"] <= d:
            prev = b
        else:
            break
    return prev


def compute(market: dict, bench_bars: list[dict], tweet_idx: dict, force: bool) -> dict:
    sym = market["symbol"]
    base = market.get("base_asset", sym.split("-")[0])
    out = {
        "qfex_symbol": sym,
        "base_asset": base,
        "display_ticker": base,
        "asset_class": asset_class(market),
        "product_category": market.get("product_category"),
        "quote_asset": market.get("quote_asset"),
        "max_leverage": market.get("default_max_leverage"),
        "status": market.get("status"),
        "underlier_price": market.get("underlier_price"),
        "ok": False,
        "returns": {},
        "price_series": [],
    }
    tw = tweet_idx.get(norm_ticker(base))
    out["name"] = (tw["name"] if tw and tw.get("name") else NAME_MAP.get(base, base))
    out["source"] = {
        "type": "tweet" if tw and tw.get("announce_url") else "qfex",
        "announce_url": tw["announce_url"] if tw else None,
        "tweet_date": tw["tweet_date"] if tw else None,
        "note": tw["note"] if tw else None,
    }

    try:
        bars = qfex.fetch_candles(sym, force=force)
    except Exception as e:  # noqa
        out["error"] = f"fetch_failed: {e}"
        return out
    if len(bars) < 2:
        out["error"] = "insufficient_history"
        return out

    entry = bars[0]
    entry_close = entry["close"]
    out["listing_date"] = entry["date"]
    out["entry_close"] = entry_close
    out["latest_date"] = bars[-1]["date"]
    out["latest_close"] = bars[-1]["close"]
    out["days_live"] = (date.fromisoformat(bars[-1]["date"]) - date.fromisoformat(entry["date"])).days
    bench_entry = _last_close_on_or_before(bench_bars, entry["date"])
    latest_data = bars[-1]["date"]

    def window(exit_bar) -> dict:
        r = exit_bar["close"] / entry_close - 1.0
        rec = {"asset_return": round(r, 6), "exit_date": exit_bar["date"]}
        be = _last_close_on_or_before(bench_bars, exit_bar["date"])
        if bench_entry and be:
            br = be / bench_entry - 1.0
            rec["bench_return"] = round(br, 6)
            rec["alpha"] = round(r - br, 6)
        else:
            rec["bench_return"] = None
            rec["alpha"] = None
        return rec

    entry_d = date.fromisoformat(entry["date"])
    for label, days in HORIZONS.items():
        target = (entry_d + timedelta(days=days)).isoformat()
        if latest_data >= target:
            bar = _bar_at_or_before(bars, target)
            out["returns"][label] = window(bar) if bar else None
        else:
            out["returns"][label] = None  # horizon not elapsed yet
    out["returns"]["LIVE"] = window(bars[-1])

    series = []
    for b in bars:
        pt = {"date": b["date"], "close": b["close"],
              "ret": round(b["close"] / entry_close - 1.0, 6)}
        if bench_entry:
            be = _last_close_on_or_before(bench_bars, b["date"])
            pt["bench_ret"] = round(be / bench_entry - 1.0, 6) if be else None
        series.append(pt)
    out["price_series"] = series
    out["ok"] = True
    return out


def event_study(listings: list[dict], max_days: int = 90) -> list[dict]:
    curve = []
    for t in range(0, max_days + 1):
        rets, alphas = [], []
        for L in listings:
            if not L.get("ok"):
                continue
            ps = L["price_series"]
            if t < len(ps):
                pt = ps[t]
                rets.append(pt["ret"])
                if pt.get("bench_ret") is not None:
                    alphas.append(pt["ret"] - pt["bench_ret"])
        if not rets:
            break
        curve.append({
            "day": t, "n": len(rets),
            "mean_ret": round(statistics.mean(rets), 6),
            "median_ret": round(statistics.median(rets), 6),
            "mean_alpha": round(statistics.mean(alphas), 6) if alphas else None,
        })
    return curve


def _blk(xs: list[float]) -> dict:
    if not xs:
        return {"n": 0}
    n = len(xs)
    mean = statistics.mean(xs)
    sd = statistics.pstdev(xs) if n > 1 else 0.0
    out = {"n": n, "mean": round(mean, 6), "median": round(statistics.median(xs), 6),
           "win_rate": round(sum(1 for x in xs if x > 0) / n, 4),
           "best": round(max(xs), 6), "worst": round(min(xs), 6), "stdev": round(sd, 6)}
    if n > 1 and sd > 0:
        out["t_stat"] = round(mean / (sd / math.sqrt(n)), 3)
    return out


def summarize(listings: list[dict]) -> dict:
    labels = list(HORIZONS.keys()) + ["LIVE"]
    per = {}
    for label in labels:
        rets, alphas = [], []
        for L in listings:
            if not L.get("ok"):
                continue
            rec = L["returns"].get(label)
            if not rec:
                continue
            rets.append(rec["asset_return"])
            if rec.get("alpha") is not None:
                alphas.append(rec["alpha"])
        per[label] = {"return": _blk(rets), "alpha": _blk(alphas)}
    return {"horizons": per, "n_listings": sum(1 for L in listings if L.get("ok"))}


def build(progress=None) -> dict:
    """Build the full index. `progress(done, total, label)` is called as markets fetch."""
    force = os.environ.get("REFRESH") == "1"
    markets = qfex.fetch_refdata(force=force)
    tweet_idx = build_tweet_index()

    # benchmark first
    if progress:
        progress(0, len(markets) + 1, f"benchmark {BENCHMARK_SYMBOL}")
    bench_bars = build_benchmark(force)

    computed = []
    total = len(markets)
    for i, m in enumerate(markets, 1):
        r = compute(m, bench_bars, tweet_idx, force)
        computed.append(r)
        if progress:
            progress(i, total, m["symbol"])

    # sort by listing date then ticker
    computed.sort(key=lambda x: (x.get("listing_date", "9999"), x["display_ticker"]))
    summary = summarize(computed)
    equity = [L for L in computed if L.get("ok") and L["product_category"] not in NON_EQUITY]
    out = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "source": "QFEX exchange API (api.qfex.com) — perp prices, refdata",
        "benchmark": {"symbol": BENCHMARK_SYMBOL, "name": BENCHMARK_NAME},
        "horizons": list(HORIZONS.keys()) + ["LIVE"],
        "horizon_offsets": HORIZONS,
        "counts": {
            "markets": len(markets),
            "priced": summary["n_listings"],
            "with_tweet": sum(1 for L in computed if L["source"]["type"] == "tweet"),
        },
        "summary": summary,
        "event_study": event_study(equity),
        "event_study_all": event_study([L for L in computed if L.get("ok")]),
        "listings": computed,
    }
    return out


def build_events(force: bool = False):
    """Generator that yields progress dicts while building from QFEX, then writes
    index.json and yields a final {'phase':'done', ...}. Powers the SSE sync.

    Data is fetched ONCE: with force=False every symbol already on disk is served
    from cache (emitted as cached=True), so an interrupted download resumes by only
    fetching the symbols still missing. force=True re-downloads everything."""
    markets = qfex.fetch_refdata(force=force)
    tweet_idx = build_tweet_index()
    total = len(markets)
    n_cached = sum(1 for m in markets if qfex.candles_cached(m["symbol"]))
    yield {"phase": "start", "total": total, "benchmark": BENCHMARK_SYMBOL,
           "already_cached": 0 if force else n_cached}

    bench_bars = build_benchmark(force)
    yield {"phase": "benchmark", "done": 0, "total": total, "symbol": BENCHMARK_SYMBOL}

    computed = []
    downloaded = 0
    for i, m in enumerate(markets, 1):
        was_cached = (not force) and qfex.candles_cached(m["symbol"])
        r = compute(m, bench_bars, tweet_idx, force)
        computed.append(r)
        if not was_cached:
            downloaded += 1
        yield {"phase": "market", "done": i, "total": total, "symbol": m["symbol"],
               "name": r.get("name"), "ok": r["ok"], "cached": was_cached,
               "downloaded": downloaded,
               "live": (r["returns"].get("LIVE") or {}).get("asset_return")}

    computed.sort(key=lambda x: (x.get("listing_date", "9999"), x["display_ticker"]))
    summary = summarize(computed)
    equity = [L for L in computed if L.get("ok") and L["product_category"] not in NON_EQUITY]
    out = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "source": "QFEX exchange API (api.qfex.com) — perp prices, refdata",
        "benchmark": {"symbol": BENCHMARK_SYMBOL, "name": BENCHMARK_NAME},
        "horizons": list(HORIZONS.keys()) + ["LIVE"],
        "horizon_offsets": HORIZONS,
        "counts": {"markets": len(markets), "priced": summary["n_listings"],
                   "with_tweet": sum(1 for L in computed if L["source"]["type"] == "tweet")},
        "summary": summary,
        "event_study": event_study(equity),
        "event_study_all": event_study([L for L in computed if L.get("ok")]),
        "listings": computed,
    }
    (DATA_DIR / "index.json").write_text(json.dumps(out, indent=1))
    pub = HERE.parent / "frontend" / "public"
    pub.mkdir(parents=True, exist_ok=True)
    (pub / "index-data.json").write_text(json.dumps(out))
    yield {"phase": "done", "total": total, "counts": out["counts"],
           "downloaded": downloaded, "cached": total - downloaded,
           "generated": out["generated"]}


def main():
    def prog(done, total, label):
        bar = int(done / total * 30)
        print(f"\r[{'█'*bar}{'·'*(30-bar)}] {done:3}/{total}  {label:16}", end="", flush=True)

    out = build(progress=prog)
    print()
    (DATA_DIR / "index.json").write_text(json.dumps(out, indent=1))
    pub = HERE.parent / "frontend" / "public"
    pub.mkdir(parents=True, exist_ok=True)
    (pub / "index-data.json").write_text(json.dumps(out))
    c = out["counts"]
    print(f"Wrote index.json — {c['priced']}/{c['markets']} markets priced, "
          f"{c['with_tweet']} matched to a tweet.")
    for label in ["1W", "1M"]:
        a = out["summary"]["horizons"][label]["alpha"]
        if a.get("n"):
            print(f"  {label}: mean alpha {a['mean']*100:+.2f}% "
                  f"(win {a['win_rate']*100:.0f}%, n={a['n']}, t={a.get('t_stat','?')})")


if __name__ == "__main__":
    main()
