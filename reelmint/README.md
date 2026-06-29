# ◉ Reelmint

**Mint videos, images & copy from a single prompt.**

Reelmint is a self-contained AI content studio. Type or **speak** an idea and it
writes the script, designs every frame, voices it, and exports a ready-to-post
video — short or long. Keep editing just by telling it what to change.

It's a single Node service (Express API + static web app) with **zero build
step**, so it deploys to Render in minutes.

---

## Features

| | |
|---|---|
| 🎬 **Prompt → video** | One idea → a fully storyboarded, voiced video (short or long-form). Exports a real `.webm` in the browser. |
| 🪄 **Voice & text AI editor** | Say or type "make scene 2 funnier" — the storyboard rewrites live. Voice input via the Web Speech API. |
| 🖼 **Instant images** | Mint posters, quote cards and thumbnails as downloadable PNGs ("Smart Slides"). Plug in any image API to swap in photoreal generation. |
| 📷 **Scan & repurpose** | Upload a screenshot, photo or doc — Claude vision reads it and turns it into content. |
| ✂️ **Long-form → clips** | Paste a transcript, get the most clip-worthy viral moments. |
| 💸 **Revenue-ready** | Free / Creator / Studio tiers, credit limits, and a free-tier watermark — the levers competitors monetise with. Stripe hook is stubbed (`reelmintCheckout`). |

## How the AI works

All generation runs through the **Anthropic API** (`claude-opus-4-8` by default).
If `ANTHROPIC_API_KEY` is **not** set, Reelmint runs in **demo mode** — every
screen is still clickable end-to-end with placeholder output, so you can deploy
first and add the key later.

Video and image *rendering* happen entirely client-side (Canvas + MediaRecorder),
so there's no heavy server cost — it runs comfortably on Render's free tier.

---

## Run locally

```bash
cd reelmint
npm install
cp .env.example .env        # then paste your ANTHROPIC_API_KEY (optional)
npm start                   # http://localhost:3000
```

## Deploy to Render

**Option A — Blueprint (recommended).** This repo ships `reelmint/render.yaml`.

1. Push to GitHub.
2. Render → **New → Blueprint** → pick this repo.
3. Render reads `reelmint/render.yaml` and creates the service.
4. Add `ANTHROPIC_API_KEY` in the dashboard (marked secret).

**Option B — Manual web service.**

- New → **Web Service** → connect the repo.
- **Root Directory:** `reelmint`
- **Build:** `npm install`
- **Start:** `npm start`
- **Health check path:** `/api/health`
- Add env var `ANTHROPIC_API_KEY`.

The server binds to `process.env.PORT` (Render sets it automatically).

---

## Environment variables

| Var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Unlocks real AI. Blank → demo mode. |
| `AI_MODEL` | Model id (default `claude-opus-4-8`). |
| `PORT` | Port (Render sets this). |
| `REELMINT_NO_WATERMARK` | `1` removes the free-tier watermark globally. |
| `IMAGE_API_URL` / `IMAGE_API_KEY` | Optional external image generator (`{prompt,width,height}` → `{url}`/`{b64}`). |

## API

| Endpoint | Body | Returns |
|---|---|---|
| `GET /api/health` | — | `{ ok, enabled, model }` |
| `GET /api/config` | — | status + plans + watermark flag |
| `POST /api/script` | `{topic, platform, tone, durationSec, format}` | storyboard |
| `POST /api/assistant` | `{instruction, storyboard}` | `{reply, storyboard}` |
| `POST /api/image` | `{prompt, style}` | `{type:"design", design}` or `{type:"image", url}` |
| `POST /api/scan` | `{base64, mediaType, instruction}` | `{text}` |
| `POST /api/repurpose` | `{transcript, count}` | `{clips:[…]}` |
| `POST /api/captions` | `{topic, platform, count}` | `{text}` |

---

## Project layout

```
reelmint/
├── server/
│   ├── index.js     # Express app + API routes
│   └── ai.js        # Anthropic integration (+ demo fallback)
├── public/
│   ├── index.html   # landing + studio
│   ├── styles.css
│   └── app.js       # studio logic, canvas render, video export
├── render.yaml      # Render Blueprint
├── package.json
└── .env.example
```

## Notes & next steps

- **Video export** uses `MediaRecorder` (`.webm`) — best in Chromium/Edge/Firefox.
- **Voice input/output** uses the Web Speech API (best in Chrome/Edge).
- To go fully production: wire `reelmintCheckout` to Stripe Checkout, add user
  accounts + persistent credit tracking, and (optionally) set `IMAGE_API_URL`
  for photoreal image generation.
