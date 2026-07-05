"""CNBC daily-bar fetcher with on-disk cache (gitignored).

Endpoint: https://ts-api.cnbc.com/harmony/app/charts/{RANGE}.json?symbol={SYM}&interval=86400
Returns daily OHLC bars going back ~2 years, universal across US/intl equities,
Korean equities (CODE-KR), ETFs, indices (.SPX/.TWII/...), and commodities (@CL.1 ...).
"""
from __future__ import annotations
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path
from datetime import datetime, date, timezone

PRICES_DIR = Path(__file__).parent / "prices"   # gitignored raw cache
PRICES_DIR.mkdir(exist_ok=True)

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36")

BASE = "https://ts-api.cnbc.com/harmony/app/charts/{range}.json"


def _cache_path(symbol: str) -> Path:
    safe = symbol.replace("/", "_").replace("@", "at_").replace(".", "-").replace("=", "eq")
    return PRICES_DIR / f"{safe}.json"


# NOTE: CNBC's range param is quirky — "6M" with interval=86400 returns ~3 years
# of DAILY bars (median gap 1 day), which fully covers all 2026 listings plus
# benchmark lookback. Larger ranges auto-aggregate to weekly, so keep "6M".
def fetch_bars(symbol: str, rng: str = "6M", *, force: bool = False,
               max_age_hours: float = 12.0) -> list[dict]:
    """Return list of {date: 'YYYY-MM-DD', open, high, low, close, volume} ascending.
    Cached to disk; re-fetched if cache older than max_age_hours."""
    cp = _cache_path(symbol)
    if cp.exists() and not force:
        age_h = (time.time() - cp.stat().st_mtime) / 3600.0
        if age_h < max_age_hours:
            try:
                return json.loads(cp.read_text())["bars"]
            except Exception:
                pass

    params = urllib.parse.urlencode({"symbol": symbol, "interval": 86400})
    url = f"{BASE.format(range=rng)}?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    last_err = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                raw = json.loads(r.read().decode())
            price_bars = (raw.get("barData") or {}).get("priceBars") or []
            bars = []
            for b in price_bars:
                tt = b.get("tradeTime", "")  # YYYYMMDDHHMMSS
                if len(tt) < 8:
                    continue
                d = f"{tt[0:4]}-{tt[4:6]}-{tt[6:8]}"
                try:
                    close = float(b["close"])
                except (KeyError, ValueError, TypeError):
                    continue
                bars.append({
                    "date": d,
                    "open": float(b.get("open") or close),
                    "high": float(b.get("high") or close),
                    "low": float(b.get("low") or close),
                    "close": close,
                    "volume": int(float(b.get("volume") or 0)),
                })
            bars.sort(key=lambda x: x["date"])
            # de-dup by date (keep last)
            dedup = {b["date"]: b for b in bars}
            bars = [dedup[d] for d in sorted(dedup)]
            cp.write_text(json.dumps({"symbol": symbol,
                                      "fetched": datetime.now(timezone.utc).isoformat(),
                                      "bars": bars}))
            return bars
        except Exception as e:  # noqa
            last_err = e
            time.sleep(1.2 * (attempt + 1))
    raise RuntimeError(f"CNBC fetch failed for {symbol}: {last_err}")


if __name__ == "__main__":
    import sys
    sym = sys.argv[1] if len(sys.argv) > 1 else "AAPL"
    bars = fetch_bars(sym, force=True)
    print(f"{sym}: {len(bars)} bars, {bars[0]['date']} -> {bars[-1]['date']}, "
          f"last close {bars[-1]['close']}")
