export const meta = {
  name: 'qfex-listing-extract',
  description: 'Classify QFEX listing tweets and resolve each ticker to a verified CNBC price symbol',
  phases: [
    { title: 'Extract', detail: 'parallel agents classify tweets + resolve/verify CNBC symbols' },
    { title: 'Reconcile', detail: 'dedupe to earliest listing date, resolve symbol conflicts, coverage check' },
  ],
}

const candidates = args // slim array: [{date,url,text}]

const RULES = `
You are analyzing tweets from QFEX (@qfex), a perpetual-futures exchange, to build an index of every ASSET they have LISTED for trading.

WHAT COUNTS AS A LISTING OCCURRENCE (emit an event):
- A tweet that announces one or more tradeable assets on QFEX. Emit ONE event per distinct asset/ticker mentioned as tradeable on QFEX in that tweet — including tickers presented as "joining the rest of the basket" (they were listed at or before this date; the reconcile step keeps the earliest date).
- Assets can be: US equities, Korean equities (by 6-digit code), other intl equities (Taiwan/Japan/HK/China ADRs), ETFs, commodities (Crude, NatGas, Gold, Silver, Uranium), indices (S&P/US500, TAIEX, HSI, NIKKEI), forex (EUR/USD), crypto.

WHAT DOES NOT COUNT (do NOT emit):
- Product/feature announcements ("added partial close", liquidity upgrade, growth updates).
- "$IBM getting listed soon" / "what should we list next" — future/uncommitted, not a live listing.
- A ticker that only appears in an earnings comment or generic market commentary with NO indication it is tradeable on QFEX.
- Off-topic tweets (e.g. an essay about quantum computing) — even if it says "we list them", read carefully: if it genuinely lists specific tickers on QFEX, DO emit those.
- Pure marketing/meme follow-ups that link qfex.com/trade/XXX for an asset already covered by another tweet — SKIP these to avoid noise (reconcile handles first-date). BUT if a /trade/ link is the ONLY evidence for an asset (e.g. BOT, TE via /trade/TE-USD), DO emit it using the ticker from the URL.

For each emitted event set framed_as_new=true only if THIS tweet explicitly presents the ticker as a brand-new listing ("new listing", "now live", "just landed", "is live", "listed today"); false if it's listed as part of an existing basket ("joining the rest", "the full favorites").

CNBC SYMBOL RESOLUTION — resolve each asset to a CNBC symbol and VERIFY it returns real daily bars.
Symbol conventions:
- US equity / ETF: the plain ticker (AAPL, PLUG, SOXL, IGV). For share classes use a dot: "BRK.B".
- Korean equity by 6-digit code: "CODE-KR" e.g. Samsung 005930 -> "005930-KR", SK Hynix 000660 -> "000660-KR". $SIVE listed as SIVE-KRW is a Korean/Swedish stock — look it up.
- Commodity front-month futures: Crude "@CL.1", NatGas "@NG.1", Gold "@GC.1", Silver "@SI.1". Uranium: try the URA ETF "URA" or a uranium proxy.
- Index: S&P500 / US500 -> ".SPX". TAIEX -> ".TWII". HSI -> ".HSI". NIKKEI -> ".N225".
- Forex EUR/USD -> "EUR=" (verify; alt "EURUSD=").
- International ADR/equity: BABA -> "BABA". TSMC -> "TSM".
Some tickers are obscure recent IPOs/small-caps (SHAZ SharonAI, SUIG SUI Group, WYFI, DGXX, KEEL, PENG, CBRS, TE, CCXI, ALAB Astera, STRC Strategy preferred). Use WebSearch to confirm the correct primary listing/exchange ticker, then map to the CNBC symbol.

VERIFY every cnbc_symbol with:
  curl -s -m 15 -H "User-Agent: Mozilla/5.0" "https://ts-api.cnbc.com/harmony/app/charts/5Y.json?symbol=SYMBOL&interval=86400"
Parse JSON barData.priceBars: if it has >20 bars and a sane last close, set cnbc_verified=true and last_close=<last close>. If it fails, try alternative symbol forms and web-lookup the real ticker. If nothing works, set cnbc_verified=false and explain in notes. URL-encode "@" as %40 and "." stays literal; test in a shell.
`

const EVENT_SCHEMA = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ticker: { type: 'string' },
          display_ticker: { type: 'string' },
          name: { type: 'string' },
          asset_class: { type: 'string', enum: ['equity_us','equity_kr','equity_intl','etf','commodity','index','forex','crypto'] },
          tweet_date: { type: 'string' },
          tweet_url: { type: 'string' },
          framed_as_new: { type: 'boolean' },
          cnbc_symbol: { type: 'string' },
          cnbc_verified: { type: 'boolean' },
          last_close: { type: ['number','null'] },
          confidence: { type: 'number' },
          notes: { type: 'string' },
        },
        required: ['ticker','display_ticker','name','asset_class','tweet_date','tweet_url','framed_as_new','cnbc_symbol','cnbc_verified','confidence','notes'],
      },
    },
  },
  required: ['events'],
}

// ---- Phase 1: extract in parallel batches ----
phase('Extract')
const BATCHES = 8
const size = Math.ceil(candidates.length / BATCHES)
const batches = []
for (let i = 0; i < candidates.length; i += size) batches.push(candidates.slice(i, i + size))

const batchResults = await parallel(batches.map((batch, bi) => () =>
  agent(
    `${RULES}\n\nTweets to analyze (batch ${bi + 1}/${batches.length}). Emit listing events per the rules. VERIFY every CNBC symbol via the curl command before returning.\n\n${JSON.stringify(batch, null, 1)}`,
    { label: `extract:batch${bi + 1}`, phase: 'Extract', agentType: 'general-purpose', schema: EVENT_SCHEMA, effort: 'high' }
  )
))

const allEvents = batchResults.filter(Boolean).flatMap(r => r.events || [])
log(`extracted ${allEvents.length} raw listing occurrences across ${batches.length} batches`)

// ---- Phase 2: reconcile ----
phase('Reconcile')
const FINAL_SCHEMA = {
  type: 'object',
  properties: {
    listings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          display_ticker: { type: 'string' },
          name: { type: 'string' },
          asset_class: { type: 'string' },
          listing_date: { type: 'string' },
          announce_url: { type: 'string' },
          all_tweet_urls: { type: 'array', items: { type: 'string' } },
          cnbc_symbol: { type: 'string' },
          cnbc_verified: { type: 'boolean' },
          last_close: { type: ['number','null'] },
          confidence: { type: 'number' },
          notes: { type: 'string' },
        },
        required: ['display_ticker','name','asset_class','listing_date','announce_url','cnbc_symbol','cnbc_verified','confidence','notes'],
      },
    },
    excluded: { type: 'array', items: { type: 'object', properties: { ticker: {type:'string'}, reason: {type:'string'} }, required: ['ticker','reason'] } },
    summary: { type: 'string' },
  },
  required: ['listings','excluded','summary'],
}

const reconciled = await agent(
  `You are reconciling raw listing occurrences extracted from QFEX tweets into a canonical listings index.

RAW OCCURRENCES (may contain duplicates across tweets and minor conflicts):
${JSON.stringify(allEvents, null, 1)}

FULL TWEET SET for cross-checking (dates/urls/text):
${JSON.stringify(candidates, null, 1)}

TASKS:
1. Deduplicate by asset. One canonical listing per distinct asset (by cnbc_symbol / display_ticker).
2. listing_date = the EARLIEST tweet_date across that asset's occurrences (best proxy for when QFEX listed it). announce_url = the tweet url of that earliest occurrence. Include all_tweet_urls.
3. Resolve any cnbc_symbol conflicts; prefer a VERIFIED symbol. If an asset is unverified, try once more to resolve it (you may run the curl verify command and WebSearch). Set cnbc_verified and last_close accordingly.
4. Drop anything that is not a genuine tradeable listing (features, "getting listed soon", off-topic) into "excluded" with a reason.
5. Coverage check: scan the full tweet set for any listed asset the raw occurrences missed; add it.

Verify command (URL-encode @ as %40):
  curl -s -m 15 -H "User-Agent: Mozilla/5.0" "https://ts-api.cnbc.com/harmony/app/charts/5Y.json?symbol=SYM&interval=86400"

Return the canonical listings array (sorted by listing_date ascending), the excluded list, and a one-paragraph summary of how many listings, date range, and asset-class breakdown.`,
  { label: 'reconcile', phase: 'Reconcile', agentType: 'general-purpose', schema: FINAL_SCHEMA, effort: 'high' }
)

return reconciled
