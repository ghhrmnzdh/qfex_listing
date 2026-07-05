#!/usr/bin/env bash
# The QFEX Listing Index — one-command dev bootstrap.
# Fetches/refreshes data, then starts the API (:8000) and the frontend (:5173).
set -euo pipefail
cd "$(dirname "$0")"

echo "▸ backend deps"
python3 -m pip install -q -r backend/requirements.txt

if [ ! -f backend/data/index.json ] || [ "${REFRESH:-0}" = "1" ]; then
  echo "▸ building the index (fetching CNBC prices, computing returns)…"
  ( cd backend && python3 pipeline.py )
fi

echo "▸ frontend deps"
( cd frontend && npm install --silent --no-audit --no-fund )

echo "▸ starting API on :8000 and frontend on :5173"
( cd backend && python3 -m uvicorn app:app --port 8000 --log-level warning ) &
API_PID=$!
trap 'kill $API_PID 2>/dev/null' EXIT
( cd frontend && npm run dev )
