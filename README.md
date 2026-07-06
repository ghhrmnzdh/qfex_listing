# The QFEX Listing Index

> *"Somebody should make an index of QFEX's previous listings and their performance…"*

Here it is. Every asset [QFEX](https://x.com/qfex) has listed, priced on **its own QFEX perp
candles**, matched to the announcing tweet where one exists, and measured for **excess return
vs the S&P** — does buying the listing at its QFEX launch beat the market?

![hero](docs/hero.png)

## The answer

Priced on **QFEX's own perp candles** across **126 markets** (launches Dec 2025 – Jul 2026),
the honest read is: **the point estimates lean positive by a month, but nothing is
statistically significant once you do the study properly.** "Properly" means three things the
first pass got wrong — restrict to the **104 actual stock-picks** (excess-vs-S&P is a spread,
not an alpha, for a commodity or FX pair), **cluster the t-stats by launch date** (up to 12
markets went live the same day and share one market shock, so they aren't independent draws),
and **β-adjust** rather than silently assuming β = 1.

**Equities only, clustered by launch date:**

| Horizon | Mean return | Excess vs S&P | β-adj excess | Beat-rate | t (naïve) | **t (clustered)** | n (cohorts) |
|---------|------------|---------------|--------------|-----------|-----------|-------------------|-------------|
| 1 day   | −1.1%      | −0.9%         | −1.0%        | 44%       | −1.73     | **−1.37**         | 104 (34) |
| 1 week  | +3.4%      | +2.6%         | +2.6%        | 51%       | +1.73     | **+1.45**         | 97 (31)  |
| 1 month | +10.0%     | +6.1%         | +5.7%        | 56%       | +1.73     | **+1.35**         | 61 (19)  |
| 3 month | +23.3% *(med −3.9%)* | +15.9% *(med −10.6%)* | +15.1% | 36% | +1.10 | **+0.88** | 22 (6) |

*(Equity listings only; excess = listing return − S&P perp return over the same window.
"β-adj" uses a Vasicek-shrunk concurrent β. "Cohorts" = distinct launch dates = the effective
number of independent observations.)*

**Reading it honestly:**
- The day-one "sell the news" is **−0.9%** but at **t ≈ −1.4 (clustered)** it is *not*
  significant. The eye-catching **t ≈ −2.2** from the first pass came from pooling in 22
  non-equity markets and using naïve i.i.d. standard errors — both overstate the signal.
- The edge builds to **+6.1% excess by one month**, and β-adjustment barely dents it (**+5.7%**),
  so it isn't just high-beta names in a rising tape. But at **t ≈ 1.3** it's inside the noise,
  and only ~19 independent launch-date cohorts back it.
- By three months the **mean is +15.9% but the median is −10.6%** and the beat-rate is **36%** —
  a handful of monster winners carry a basket in which the *typical* listing lags. The t-test
  is unreliable here anyway (heavy right skew); the sign test (p ≈ 0.29) says "coin flip."

**Bottom line: a right-skewed tilt that leans positive over a month, but not a statistically
established edge on this sample.** Because QFEX perps trade 24/7 and settle in USD, the returns
are the actual P&L a QFEX trader would book — but the sample is young (median listing ~44 days
old) and the honest verdict is "not proven," not "printing press."

## Architecture

```
qfex_listing/
├── qfex_xposts_*.csv          # 154 QFEX tweets (announcement source)
├── backend/
│   ├── qfex.py                # QFEX API client: refdata (126 markets) + daily candles
│   ├── extract_workflow.js    # dynamic multi-agent workflow that classified the tweets
│   ├── listings.json          # curated tweet→ticker map (used for source provenance)
│   ├── pipeline.py            # build index from QFEX prices; also a streaming generator
│   ├── app.py                 # FastAPI: /api/index, /api/listing/{t}, /api/sync/stream (SSE)
│   ├── cnbc.py                # (legacy) CNBC fetcher from the first pass
│   ├── qfex_cache/            # cached refdata + candles (gitignored)
│   └── data/index.json        # computed index (gitignored — regenerable)
└── frontend/                  # Vite + React + TS + framer-motion
    └── src/                    #   quant-tearsheet UI; hand-rolled SVG charts; live sync
```

### Data source — QFEX itself
The authoritative source is the **QFEX exchange API** (`api.qfex.com`, public, no auth):
- `GET /refdata` → every listed market (126: 104 equities, 13 indices/ETFs, 6 commodities, 3 FX).
- `GET /candles/{symbol}?resolution=1DAY&fromISO=…&toISO=…` → the market's own perp OHLCV.
  The **first candle is the true launch date** — more precise than the tweet.

Each market is matched back to its announcing tweet (from the workflow's `listings.json`)
where one exists — 95 of 126 have one; the rest (e.g. AAPL, NVDA, listed before the tweet
window) are sourced directly from QFEX and badged `QFEX`. Benchmark is QFEX's own S&P 500
perp, `US500-USD`, so it's an apples-to-apples 24/7 comparison.

### Live sync with download progress (fetch-once + resumable)
`GET /api/sync/stream` (SSE) builds from QFEX, emitting per-market progress. **Data is
fetched once**: each symbol's candles are cached to its own file, so symbols already on
disk are reused and only missing ones hit the network. An interrupted download therefore
**resumes** — re-running fetches only what's left. `?force=true` re-downloads everything to
refresh prices.

The frontend **Sync from QFEX** button opens a progress overlay — a bar, a `N / 126`
counter, the current symbol, a live tape (with `cached` tags), and a **Resume** button if
the stream drops. The initial page load streams `/api/index` with a real byte-progress bar.

### Benchmark coverage
The benchmark is QFEX's own `US500-USD` perp, extended backward with the real S&P 500 index
(chained at the join date) so that markets listed before `US500-USD` launched (Dec 2025 –
Feb 2026) still get a benchmark. Markets too young for a horizon show their **return so far**
(muted, with a `Nd` days-live marker) rather than a blank — the aggregate stats still only
count markets that have actually reached the horizon.

### How listings were extracted
The tweets mix real listings with feature announcements, marketing follow-ups, basket
re-lists, and off-topic posts. A **dynamic workflow** (`extract_workflow.js`) fans out 8
parallel agents to classify each tweet and resolve every ticker to a **CNBC price symbol
verified live** (each agent curls the CNBC endpoint and confirms real bars come back),
then a reconcile pass dedupes to each asset's earliest listing date. Result: 95 listings,
all price-verified; 2 correctly excluded ("$IBM getting listed soon", a partial-close
feature announcement).

### Data source
[CNBC](https://www.cnbc.com) daily OHLC bars — universal across US & Korean equities,
ETFs, indices (`.SPX`, `.TWII`, `.HSI`, `.N225`), and commodity futures (`@CL.1`, `@NG.1`,
`@SI.1`). Raw bars are cached under `backend/prices/` (gitignored). *(Yahoo Finance was
rate-limited and Stooq now serves a JS challenge, so CNBC is the backbone.)*

### Methodology
- **Entry** = the first QFEX candle close (the market's launch price on QFEX). Note this is
  the *launch*, which can differ from the announcing tweet by days or weeks — so the study
  measures **launch-to-hold**, not announcement-to-hold.
- **Horizons** in *calendar days* (1 / 7 / 30 / 90) plus "since listing" — QFEX perps trade
  24/7, so the daily series is continuous with no trading-day gaps to reconcile. The sample
  **shrinks with horizon** (1D n=104 → 3M n=22 equities), and each horizon is a *different,
  older cohort* — not one basket followed through time — so cross-horizon comparisons mix a
  horizon effect with a composition effect.
- **Excess return** = listing return − `US500-USD` return over the *identical* window. This
  assumes **β = 1**, so it is **not** a risk-adjusted alpha; for non-equity markets it's a
  spread, not an alpha, which is why the headline is equities-only.
- **β-adjusted excess** = listing return − β · benchmark return, where β is estimated from the
  listing's own concurrent daily returns (no pre-launch history exists) and **Vasicek-shrunk
  toward 1** — short/noisy windows collapse to the market instead of printing β ≈ 9 from a
  couple of outliers.
- **Significance**: t-stats are **clustered by launch date** (CR1), because same-day listings
  share one market shock and aren't independent — the effective N is the number of distinct
  launch dates (~37), not 126. A two-sided **binomial sign test** is also reported, since the
  long-horizon distribution is heavily right-skewed and violates the t-test's normality
  assumption. Population→**sample** stdev is used throughout. No multiple-testing adjustment is
  applied across the four horizons; read the day-1 result as the only a-priori hypothesis.
- **Event study** = equal-weight cumulative-average return of every equity listing aligned
  to its own launch day (the hero chart). Sample thins past ~1 month — only the earliest
  listings are old enough to reach the right edge, so the tail is a smaller, different cohort.
- **Known limitations**: the universe is *current* reference data, so any fully delisted market
  is invisible (survivorship); β is in-sample and mildly event-contaminated; and pre-benchmark
  (Dec 2025–Feb 2026) windows benchmark against the weekday-only S&P index carried across
  weekends, injecting minor noise before the `US500-USD` perp existed.

## Running it

```bash
./run.sh            # installs deps, builds the index, starts API + frontend
# then open http://localhost:5173
REFRESH=1 ./run.sh  # re-fetch prices and rebuild
```

Or manually:
```bash
cd backend && pip install -r requirements.txt && python3 pipeline.py
python3 -m uvicorn app:app --port 8000
cd ../frontend && npm install && npm run dev
```

The full app (with the live **Sync from QFEX** button) needs the backend. The frontend
alone falls back to the committed static snapshot.

## Static build & GitHub Pages

The site can run with **no backend at all** — it reads a slim, results-only snapshot
(`frontend/public/site-data.json`, ~370 KB: every return/excess/β number plus down-sampled
chart paths, no raw price history). On a backend-less host it hides the sync button and
shows a `static snapshot` badge.

**Publish it (one-time setup):**
1. Push this repo to GitHub.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) builds `frontend/` and deploys on
   every push to `main` (or run it manually from the **Actions** tab). Your study goes live
   at `https://<user>.github.io/<repo>/`.

The build uses a **relative base**, so it works at any repo path without configuration.

**Preview the static build locally:**
```bash
cd frontend && npm run build && npx vite preview   # serves dist/ with no backend
```

## Refreshing the data yourself

The snapshot is regenerable — it is **not** raw data, so re-running is cheap and cached:
```bash
cd backend
python3 pipeline.py            # fetch-once from QFEX (cached), recompute, rewrite site-data.json
REFRESH=1 python3 pipeline.py  # force a fresh download of every market
```
`pipeline.py` writes both the full `data/index.json` (gitignored) and the committed
`frontend/public/site-data.json`. Commit the updated snapshot and push — Pages redeploys.

### Regenerating the listing→tweet extraction
`backend/listings.json` is committed. To rebuild it from the tweets, re-run the workflow
(`extract_workflow.js`) via the Claude Code Workflow tool, then `python3 pipeline.py`.

## Notes
- URL deep-links: `?listing=AMD` opens a listing's detail; `?still=1` disables entrance
  animations (used for static capture / honored automatically under reduced-motion).
- Not investment advice. Past performance ≠ future results. Data is point-in-time.
