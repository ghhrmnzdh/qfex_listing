import type { IndexData } from "./types";

export interface LoadProgress {
  received: number;
  total: number | null; // bytes, if Content-Length is known
}

/**
 * Load the index, streaming the response body so the UI can show real download
 * progress. Primary source is the FastAPI backend (/api/index, proxied by Vite);
 * falls back to the static snapshot at /index-data.json.
 */
export async function loadIndex(onProgress?: (p: LoadProgress) => void): Promise<IndexData> {
  for (const url of ["/api/index", "/index-data.json"]) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok || !res.body) continue;
      const total = Number(res.headers.get("content-length")) || null;
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          onProgress?.({ received, total });
        }
      }
      const blob = new Uint8Array(received);
      let off = 0;
      for (const c of chunks) { blob.set(c, off); off += c.length; }
      return JSON.parse(new TextDecoder().decode(blob)) as IndexData;
    } catch {
      /* try next source */
    }
  }
  throw new Error("Could not load listing data from the API or the static snapshot.");
}

export interface SyncEvent {
  phase: "start" | "benchmark" | "market" | "done" | "error";
  total?: number;
  done?: number;
  symbol?: string;
  name?: string;
  ok?: boolean;
  cached?: boolean;
  downloaded?: number;
  already_cached?: number;
  live?: number | null;
  counts?: { markets: number; priced: number; with_tweet: number };
  generated?: string;
  benchmark?: string;
  message?: string;
}

/**
 * Open the QFEX sync stream (SSE). Data is fetched once — cached symbols are
 * reused, so a re-open after failure resumes. force=true refreshes all prices.
 * Returns a stop() function.
 */
export function openSync(onEvent: (e: SyncEvent) => void, force = false): () => void {
  const es = new EventSource(`/api/sync/stream?force=${force}`);
  es.onmessage = (m) => {
    try {
      const ev = JSON.parse(m.data) as SyncEvent;
      onEvent(ev);
      if (ev.phase === "done" || ev.phase === "error") es.close();
    } catch {
      /* ignore malformed frame */
    }
  };
  es.onerror = () => {
    onEvent({ phase: "error", message: "Sync connection lost." });
    es.close();
  };
  return () => es.close();
}
