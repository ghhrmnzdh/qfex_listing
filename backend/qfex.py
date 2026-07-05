"""QFEX exchange data — the authoritative source.

Public REST API (no auth):
  - refdata:  GET https://api.qfex.com/refdata            → every listed market
  - candles:  GET https://api.qfex.com/candles/{symbol}   → daily OHLCV (perp price)
              ?resolution=1DAY&fromISO=...&toISO=...

QFEX perps trade 24/7, so candles are continuous calendar days (incl. weekends).
The FIRST candle for a symbol is its true launch/listing date on QFEX.

Raw responses are cached under backend/qfex_cache/ (gitignored, regenerable).
"""
from __future__ import annotations
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://api.qfex.com"
CACHE = Path(__file__).parent / "qfex_cache"
CACHE.mkdir(exist_ok=True)
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36")

# QFEX launched in 2025; query from well before any listing to capture full history.
HISTORY_START = "2025-06-01T00:00:00Z"


def _get(url: str, retries: int = 4) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    last = None
    for i in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read().decode())
        except Exception as e:  # noqa
            last = e
            time.sleep(1.0 * (i + 1))
    raise RuntimeError(f"QFEX GET failed {url}: {last}")


def _fresh(cp: Path, max_age_hours: float | None) -> bool:
    """True if the cache file exists and (when max_age_hours is set) is recent enough.
    With max_age_hours=None the data is fetched once and reused indefinitely — the
    caller must pass `force=True` (or an age) to refresh it."""
    if not cp.exists():
        return False
    if max_age_hours is None:
        return True
    return (time.time() - cp.stat().st_mtime) / 3600 < max_age_hours


def fetch_refdata(*, force: bool = False, max_age_hours: float | None = None) -> list[dict]:
    cp = CACHE / "refdata.json"
    if not force and _fresh(cp, max_age_hours):
        return json.loads(cp.read_text())["data"]
    d = _get(f"{BASE}/refdata")
    data = d.get("data", [])
    cp.write_text(json.dumps({"fetched": datetime.now(timezone.utc).isoformat(), "data": data}))
    return data


def _candle_path(symbol: str) -> Path:
    return CACHE / ("candles_" + symbol.replace("/", "_") + ".json")


def candles_cached(symbol: str, *, max_age_hours: float | None = None) -> bool:
    """Whether this symbol's candles are already on disk (for resume/skip logic)."""
    return _fresh(_candle_path(symbol), max_age_hours)


def fetch_candles(symbol: str, *, resolution: str = "1DAY", force: bool = False,
                  max_age_hours: float | None = None,
                  to_iso: str | None = None) -> list[dict]:
    """Return ascending daily bars: {date, open, high, low, close, volume, trades, oi}.
    Fetched once and cached to disk; reused unless force=True or a max age is given.
    Because each symbol is its own file, an interrupted bulk download resumes simply
    by skipping the symbols already present."""
    cp = _candle_path(symbol)
    if not force and _fresh(cp, max_age_hours):
        return json.loads(cp.read_text())["bars"]

    to_iso = to_iso or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    q = urllib.parse.urlencode({"resolution": resolution, "fromISO": HISTORY_START, "toISO": to_iso})
    d = _get(f"{BASE}/candles/{urllib.parse.quote(symbol)}?{q}")
    raw = d.get("candles", [])
    bars = []
    for c in raw:
        started = c.get("startedAt", "")
        if len(started) < 10:
            continue
        try:
            close = float(c["close"])
        except (KeyError, ValueError, TypeError):
            continue
        bars.append({
            "date": started[:10],
            "open": float(c.get("open") or close),
            "high": float(c.get("high") or close),
            "low": float(c.get("low") or close),
            "close": close,
            "volume": float(c.get("usdVolume") or 0),
            "trades": int(c.get("trades") or 0),
            "oi": float(c.get("startingOpenInterest") or 0),
        })
    # de-dup + sort ascending
    dedup = {b["date"]: b for b in bars}
    bars = [dedup[d] for d in sorted(dedup)]
    cp.write_text(json.dumps({"symbol": symbol, "resolution": resolution,
                              "fetched": datetime.now(timezone.utc).isoformat(),
                              "bars": bars}))
    return bars


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        b = fetch_candles(sys.argv[1], force=True)
        print(f"{sys.argv[1]}: {len(b)} bars {b[0]['date']}→{b[-1]['date']} "
              f"first={b[0]['close']} last={b[-1]['close']}")
    else:
        rd = fetch_refdata(force=True)
        print(f"{len(rd)} markets")
