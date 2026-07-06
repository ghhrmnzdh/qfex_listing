"""Generate a beautiful 1200x630 social-share (Open Graph) card for the study.

Reads backend/data/index.json, computes the honest equity headline (1-month excess,
beat-rate, clustered t), draws the event-study curve, writes an HTML card, and
renders it to frontend/public/og.png via headless Chrome.
"""
from __future__ import annotations
import json
import math
import subprocess
import tempfile
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE / "data" / "index.json"
OUT = HERE.parent / "frontend" / "public" / "og.png"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def cluster_t(xs, clusters):
    n = len(xs)
    if n < 2:
        return 0.0, 0
    mean = sum(xs) / n
    groups: dict[str, float] = {}
    for x, c in zip(xs, clusters):
        groups[c] = groups.get(c, 0.0) + (x - mean)
    G = len(groups)
    if G < 2:
        return 0.0, G
    meat = sum(s * s for s in groups.values())
    v = (G / (G - 1)) * meat / (n * n)
    se = math.sqrt(v) if v > 0 else 0
    return (mean / se if se > 0 else 0.0), G


def main():
    d = json.loads(SRC.read_text())
    eq = [L for L in d["listings"] if L.get("ok") and L["asset_class"].startswith("equity")]
    xs, cl = [], []
    for L in eq:
        rec = L["returns"].get("1M")
        if rec and rec.get("alpha") is not None:
            xs.append(rec["alpha"]); cl.append(L.get("listing_date", ""))
    mean = sum(xs) / len(xs) if xs else 0
    beat = sum(1 for x in xs if x > 0) / len(xs) if xs else 0
    t, G = cluster_t(xs, cl)
    markets = d["counts"]["markets"]

    # event-study curve → svg path
    curve = d["event_study"]
    W, H = 1120, 150
    rets = [p["mean_ret"] for p in curve]
    alphas = [p.get("mean_alpha") or 0 for p in curve]
    lo = min(0, *rets, *alphas); hi = max(0, *rets, *alphas)
    pad = (hi - lo) * 0.12 or 0.01; lo -= pad; hi += pad
    def xf(i): return i / (len(curve) - 1) * W
    def yf(v): return H - (v - lo) / (hi - lo) * (H - 6) - 3
    def path(key):
        pts = []
        for i, p in enumerate(curve):
            v = p["mean_ret"] if key == "ret" else (p.get("mean_alpha") or 0)
            pts.append(f"{'M' if i == 0 else 'L'}{xf(i):.1f},{yf(v):.1f}")
        return " ".join(pts)
    ret_path = path("ret"); alpha_path = path("alpha")
    alpha_area = f"{alpha_path} L{xf(len(curve)-1):.1f},{yf(0):.1f} L0,{yf(0):.1f} Z"
    zero_y = yf(0)

    sig = "significant" if abs(t) >= 2 else "within noise"
    verdict = "Not that we can prove — yet."
    pctm = f"+{mean*100:.0f}%" if mean >= 0 else f"{mean*100:.0f}%"

    html = f"""<!doctype html><html><head><meta charset="utf-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:1200px;height:630px}}
.card{{width:1200px;height:630px;background:#0a0b0d;position:relative;overflow:hidden;
  font-family:'Inter',system-ui,sans-serif;color:#ecebe6;padding:56px 60px}}
.card::before{{content:"";position:absolute;inset:0;
  background:radial-gradient(80% 60% at 88% -8%, rgba(231,178,74,0.12), transparent 60%),
             radial-gradient(60% 50% at 6% 110%, rgba(53,209,154,0.06), transparent 60%);}}
.grid{{position:absolute;inset:0;opacity:.4;
  background-image:linear-gradient(90deg,#12161b 1px,transparent 1px);background-size:40px 40px;
  -webkit-mask-image:linear-gradient(180deg,transparent,#000 40%);mask-image:linear-gradient(180deg,transparent,#000 40%)}}
.eyebrow{{display:flex;align-items:center;gap:12px;font-family:'IBM Plex Mono',monospace;
  font-size:16px;letter-spacing:.28em;text-transform:uppercase;color:#9aa1ab;position:relative}}
.q{{color:#e3a53e}}
h1{{font-family:'Space Grotesk',sans-serif;font-weight:500;font-size:70px;line-height:1.0;
  letter-spacing:-.02em;margin:30px 0 12px;position:relative;max-width:16ch}}
.verdict{{font-family:'Instrument Serif',serif;font-style:italic;font-size:46px;color:#f5f4f0;
  position:relative;margin-bottom:26px}}
.stats{{font-family:'IBM Plex Mono',monospace;font-size:20px;color:#9aa1ab;position:relative;letter-spacing:.01em}}
.stats b{{color:#ecebe6;font-weight:600}}
.stats .g{{color:#e3a53e}}
.chart{{position:absolute;left:60px;right:60px;bottom:52px}}
.foot{{position:absolute;left:60px;bottom:22px;font-family:'IBM Plex Mono',monospace;
  font-size:14px;color:#5c636e;letter-spacing:.04em}}
</style></head><body>
<div class="card">
  <div class="grid"></div>
  <div class="eyebrow"><svg class="q" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M2.5 18.5 L7 13.5 L11 15.5 L15 9 L21.5 3.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="21.5" cy="3.5" r="2.1" fill="currentColor"/></svg> THE QFEX LISTING INDEX</div>
  <h1>Is there alpha in QFEX&rsquo;s listings?</h1>
  <div class="verdict">{verdict}</div>
  <div class="stats"><b>{markets}</b> markets &middot; <span class="g">{pctm}</span> avg 1-month excess &middot; <b>{beat*100:.0f}%</b> beat the S&amp;P &middot; t&thinsp;=&thinsp;{t:.1f} clustered ({sig})</div>
  <div class="chart">
    <svg viewBox="0 0 {W} {H}" width="100%" height="{H}" preserveAspectRatio="none">
      <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#e3a53e" stop-opacity="0.22"/><stop offset="100%" stop-color="#e3a53e" stop-opacity="0"/></linearGradient></defs>
      <line x1="0" y1="{zero_y:.1f}" x2="{W}" y2="{zero_y:.1f}" stroke="#1f242c" stroke-width="1"/>
      <path d="{alpha_area}" fill="url(#ga)"/>
      <path d="{alpha_path}" fill="none" stroke="#e3a53e" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <path d="{ret_path}" fill="none" stroke="#ecebe6" stroke-width="2.4" vector-effect="non-scaling-stroke"/>
    </svg>
  </div>
  <div class="foot">Equal-weight event study &middot; every listing aligned to its QFEX launch &middot; priced on QFEX perps</div>
</div></body></html>"""

    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
        f.write(html); tmp = f.name
    OUT.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--force-device-scale-factor=2", "--window-size=1200,630",
                    "--default-background-color=00000000", "--virtual-time-budget=4000",
                    f"--screenshot={OUT}", f"file://{tmp}"],
                   check=True, capture_output=True)
    kb = OUT.stat().st_size / 1024
    print(f"Wrote {OUT.relative_to(HERE.parent)} — {kb:.0f} KB "
          f"(1M excess {pctm}, beat {beat*100:.0f}%, clustered t={t:.2f})")


if __name__ == "__main__":
    main()
