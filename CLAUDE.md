# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What this is

**Education Academy** (package name `whisker-academy`) is a cat-themed learning
game for UK learners, hosted by **Mochi** the ginger cat. It covers four stages —
Key Stage 1, Key Stage 2, Key Stage 3 and Higher Education — with 15-question
quiz rounds, AI homework photo-marking, a scan-and-solve helper, AI language
lessons (8 languages), vocational exam-prep courses, a subscription paywall, and
a parent/teacher portal with cross-device sync.

The whole thing is one Vite + React frontend talking to a small Express backend.
The backend exists chiefly so the **Anthropic API key never reaches the
browser** — the browser calls `/api/...`, the server forwards to Anthropic with
the key. The same codebase produces three builds (web, Android app, single file).

## Tech stack

- **Frontend:** React 18 (function components + hooks), Vite 5, `lucide-react`
  icons. Plain CSS in `src/styles.css` (CSS variables for theming). **No** Redux,
  React Router, TypeScript, or test framework.
- **Backend:** Express 4, ES modules. Storage is a JSON file (or Postgres if
  `DATABASE_URL` is set). Auth, email and Stripe are hand-rolled (no heavy SDKs).
- **Mobile:** Capacitor 6 wraps the `app` build for Google Play.
- **AI:** Anthropic Messages API (default model `claude-sonnet-4-6`, set in
  `server/index.js`). Optional ElevenLabs for premium TTS.

## Commands

```bash
npm install          # install deps (Node 18+)

npm start            # run web app + API together (concurrently) — main dev command
npm run dev          # web frontend only (Vite on :5173, proxies /api to :8787)
npm run server       # API only (Express on :8787)

npm run build        # = build:web -> dist-web/
npm run build:web    # website build  -> dist-web/   (Stripe payments)
npm run build:app    # mobile build   -> dist-app/   (Play Billing via RevenueCat)
npm run build:onefile# single self-contained HTML -> dist-onefile/index.html
npm run preview      # preview the built web app

npm run cap:sync     # build:app + capacitor sync into android/
npm run cap:open     # open Android Studio
```

There is **no linter, formatter, or test suite** configured. Match the existing
style (see Conventions) rather than introducing tooling unless asked.

Local dev needs an `ANTHROPIC_API_KEY` in `.env` (copy from `.env.example`) for
AI features; quizzes still work offline via the fallback bank.

## Architecture

```
Browser (React)  ──POST /api/claude──►  Express server  ──x-api-key──►  Anthropic API
   src/App.jsx                          server/index.js
```

The browser **never** holds the API key. All AI calls go through the Express
proxy. In dev, Vite proxies `/api` → `localhost:8787`. In production the web
build is served by the same Express process (one-service deploy via
`render.yaml`); the mobile build points at a deployed API via `VITE_API_BASE`.

### Frontend layout (`src/`)

- `App.jsx` — the whole app shell and screen router (1200+ lines, screen state
  in `useState`, no router lib). Most UI lives here; large features are extracted
  into `components/`.
- `main.jsx` — React entry; wraps `App` in `ErrorBoundary`.
- `components/` — `Mochi` (animated mascot), `GrownUps` (parent/teacher portal),
  `Languages`, `Courses`, `Calculator`, `ErrorBoundary`.
- `data/` — static content, **not** code logic:
  - `curriculum.js` — stages (`KS_LABEL`, `KS_META`), subjects, `TOPICS`,
    `PLANS`, and `tutorBrief(ks, subject)` (the per-stage system-prompt text).
  - `bank.js` — offline fallback quiz questions.
  - `courses.js`, `languages.js` — vocational courses and language list.
- `lib/` — focused single-purpose modules. Notable ones:
  - `api.js` — **all** AI calls (`generateQuestions`, `markHomework`,
    `solveQuestion`, `askTutor`, `languageLesson`, `courseLesson`, `examQuestions`,
    `voiceCommand`, `translateBatch`, …). Every function builds a system prompt,
    calls the backend, and parses raw-JSON replies via `extractJSON`.
  - `progress.js` — localStorage state (`whisker.v1`): stars, streaks, stats,
    history, course results. The shape here is the source of truth for progress.
  - `platform.js` — `isWeb()` / `isApp()`, driven by `VITE_PLATFORM`.
  - `billing.js` — payments, routed by build: mock (dev) / Stripe (web) /
    RevenueCat+Play (app).
  - `i18n.js` — whole-UI localization. English strings in `STRINGS` are batch-
    translated by AI on first language switch, cached in localStorage. Use `t()`
    / `tf()` / the `useT()` hook for any user-facing string.
  - `cloud.js` — auth + cross-device child-state sync against the backend.
  - Others: `speech`, `recognition`, `achievements`, `mochiShop`, `celebrate`,
    `motivation`, `coach`, `review`, `reminders`, `trial`, `share`, `examCache`.

### Backend layout (`server/`)

- `index.js` — the entire API: AI proxy (`/api/claude`), TTS proxy (`/api/tts`),
  auth (`/api/auth/*`), children + state sync, goals/tasks, classes,
  leaderboard, referrals, weekly parent emails (+ cron + admin endpoints),
  Stripe checkout/portal/webhook, and serving the built web app + marketing
  pages. Route handlers use the `auth(handler)` wrapper for token-gated routes.
- `store.js` — data layer. Handlers only call `load()` / `save()`; the backend
  (JSON file at `server/data/db.json`, or Postgres via `DATABASE_URL`) is
  swappable here. Also exports `overview()` / `weakest()` for reports. Data shape:
  `{ users, children, classes, goals }`.
- `auth.js` — password hashing + signed tokens (hand-rolled with `crypto`).
- `email.js` — pluggable email (console / Resend / SendGrid via `EMAIL_PROVIDER`).

## The three builds (one codebase)

| Build | Command | Output | Payments | `VITE_PLATFORM` / `VITE_BILLING` |
|---|---|---|---|---|
| Web (website) | `build:web` | `dist-web/` | Stripe Checkout | `web` / `stripe` |
| Mobile (Play) | `build:app` | `dist-app/` | Play Billing (RevenueCat) | `app` / `revenuecat` |
| Single file | `build:onefile`| `dist-onefile/` | mock | `web` / `mock` |

Mode-specific env lives in `.env.web`, `.env.app`, `.env.onefile`. `vite.config.js`
picks the output dir from `--mode`. In dev (no `PROD`), billing defaults to
**mock** (instant unlock) so you can build UX without real payments.

## Conventions

- **ES modules everywhere** (`"type": "module"`), both frontend and backend.
- **Style:** 2-space indent, double quotes, semicolons, lots of arrow functions.
  Code is written **dense** — many one-line handlers and helpers, with a comment
  above explaining intent. Keep that density and the explanatory comments; don't
  reformat surrounding code into a more verbose style.
- **AI prompts:** request `ONLY raw JSON`, parse with `extractJSON`, and always
  provide a graceful fallback (offline bank, empty array, etc.) so the UI never
  hard-fails when the model or network misbehaves.
- **API key safety:** never call Anthropic/ElevenLabs/Stripe secret APIs from
  frontend code. Add a server route and proxy it. `VITE_*` vars are public
  (build-time, shipped to the browser); server secrets are plain `process.env`.
- **Localization:** wrap new user-facing copy with `t()`/`tf()` and add the
  English source to `STRINGS` in `src/lib/i18n.js`. Preserve `{placeholders}`,
  brand names, prices and emoji.
- **Persistence:** client progress is localStorage (`whisker.*` keys); never
  assume a server. When a child is "bound" to an account, state syncs via
  `cloud.js` (debounced push, pull on load).
- **Stages** are keyed `ks1` / `ks2` / `ks3` / `he` throughout; subjects are
  `maths` / `english` / `science`. Plans are `junior` (£3, KS1–2) and `adult`
  (£5, KS3 + HE).
- **Children's-app care:** this targets children. Minimise data collection, keep
  homework photos in memory (not stored), keep the camera-consent step, and
  treat payments/compliance as real concerns (see the docs below).

## Reference docs

Extensive markdown docs live at the repo root — consult these for deployment and
release rather than re-deriving steps:

- `README.md` — full feature overview and setup.
- `DEPLOY_WEBSITE.md` — the easy one-service website deploy (uses `render.yaml`).
- `DEPLOYMENT.md` — Google Play release, step by step.
- `PRICING.md`, `BILLING_SANDBOX_TESTING.md` — pricing and billing test setup.
- `COMPLIANCE.md`, `CHECKLIST.md`, `LAUNCH_RUNBOOK.md`, `VERIFY.md`,
  `STORE_LISTING.md`, `COMPETITORS.md` — compliance, launch and store material.
- `.env.example` — every supported environment variable, documented inline.

## Gotchas

- The `dev`/`start` proxy sends `/api` to `localhost:8787`; that backend does
  **not** exist on a phone — the app build must set `VITE_API_BASE` to a deployed
  API.
- The JSON file store lives in `server/data/` (gitignored) and is **not durable**
  on ephemeral hosts — set `DATABASE_URL` + `npm install pg` for Postgres there.
- The Stripe webhook is registered with `express.raw` **before** `express.json()`
  so signature verification can read the raw body — keep that ordering.
- Optional deps (`pg`, `@capacitor/local-notifications`) are `optionalDependencies`;
  guard their use so the app runs without them.
- `Higher Education` (a 1-byte stray file at the repo root) and `package-lock.json`
  are tracked; leave them unless asked.
