"""QFEX Listings Index — API.

Serves the precomputed index (backend/data/index.json) and a live streaming sync
endpoint that re-fetches from the QFEX exchange with per-market progress (SSE).

Build once:  python pipeline.py
Serve:       uvicorn app:app --reload --port 8000
"""
from __future__ import annotations
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

import pipeline

HERE = Path(__file__).parent
INDEX_PATH = HERE / "data" / "index.json"

app = FastAPI(title="QFEX Listings Index", version="2.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


def _load() -> dict:
    if not INDEX_PATH.exists():
        raise HTTPException(503, "index.json not built yet — run pipeline.py or POST /api/sync")
    return json.loads(INDEX_PATH.read_text())


@app.get("/api/health")
def health():
    built = INDEX_PATH.exists()
    meta = {}
    if built:
        d = _load()
        meta = {"generated": d.get("generated"), "counts": d.get("counts")}
    return {"ok": True, "built": built, **meta}


@app.get("/api/index")
def full_index():
    return JSONResponse(_load())


@app.get("/api/summary")
def summary():
    d = _load()
    return {k: d[k] for k in ("generated", "benchmark", "horizons", "horizon_offsets",
                              "summary", "counts") if k in d}


@app.get("/api/listings")
def listings():
    d = _load()
    rows = [{k: v for k, v in L.items() if k != "price_series"} for L in d["listings"]]
    return {"benchmark": d["benchmark"], "horizons": d["horizons"], "listings": rows}


@app.get("/api/listing/{ticker}")
def listing(ticker: str):
    d = _load()
    t = ticker.upper().lstrip("$")
    for L in d["listings"]:
        if L["display_ticker"].lstrip("$").upper() == t or L.get("qfex_symbol", "").upper() == t:
            return L
    raise HTTPException(404, f"listing {ticker} not found")


@app.get("/api/sync/stream")
def sync_stream(force: bool = False):
    """Server-Sent Events: build from QFEX, emitting per-market progress.
    Data is fetched ONCE — symbols already cached on disk are reused (so an
    interrupted download resumes, fetching only what's missing). `force=true`
    re-downloads every market's candles to refresh prices."""
    def gen():
        try:
            for ev in pipeline.build_events(force=force):
                yield f"data: {json.dumps(ev)}\n\n"
        except Exception as e:  # noqa
            yield f"data: {json.dumps({'phase': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
