# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What this project is

**Education Academy** (package name `whisker-academy`) is a cat-themed learning
game for UK learners, hosted by **Mochi** the ginger cat. It covers four stages
— Key Stage 1, Key Stage 2, Key Stage 3, and Higher Education — with
15-question AI-generated quiz rounds, AI homework photo-marking, a scan-and-solve
helper, language lessons, vocational exam-prep courses, a subscription paywall,
accounts with cross-device sync, and a parent/teacher portal.

The stack is **Vite + React (frontend)** + a small **Express (backend)** that
keeps the Anthropic API key server-side and stores accounts, plus **Capacitor**
for the Android build. The same codebase builds to three targets (web, app,
single-file).

> **`reelmint/` is a completely separate, self-contained project** (an AI video
> studio) that happens to live in this repo. It has its own `package.json`,
> server, and README. Do not mix the two — changes to Education Academy never
> touch `reelmint/` and vice versa, unless explicitly asked.

## Repository layout

```
src/                  Frontend (Vite + React)
  App.jsx             Main app shell + game loop + routing (single large component, ~1260 lines)
  main.jsx            React entry point
  styles.css          All styling (CSS variables drive the per-stage theming)
  components/         Screen-level React components
    GrownUps.jsx      Parent/teacher portal (PIN-gated dashboard, goals, classes)
    Languages.jsx     Language-learning module (lessons, quiz, listening, speaking)
    Courses.jsx       Vocational exam-prep courses + mock exams
    Calculator.jsx    In-app calculator
    Mochi.jsx         The animated cat mascot (speaks with a moving mouth)
    ErrorBoundary.jsx Top-level crash guard
  data/               Static content (no network)
    curriculum.js     Stages, subjects, topics, plans, and the age-tuned tutor prompts
    bank.js           Offline fallback questions (used with no internet)
    languages.js      The 8 supported languages
    courses.js        Vocational course/module definitions
  lib/                Browser-side logic & API clients
    api.js            All Anthropic-backed calls (via the backend /api/claude proxy)
    progress.js       localStorage persistence + dashboard stats
    platform.js       isApp() / isWeb() — which build is running
    billing.js        Payments: mock (dev) / Stripe (web) / RevenueCat-Play (app)
    cloud.js          Cross-device sync against the Express backend
    i18n.js           Whole-app localisation (batched, on-device-cached translation)
    speech.js         Text-to-speech (on-device, or cloud ElevenLabs)
    recognition.js    Speech-to-text (voice commands)
    + achievements, celebrate, coach, examCache, mochiShop, motivation,
      reminders, review, share, trial

server/               Backend (Express, ES modules)
  index.js            All routes: AI proxy, TTS proxy, auth, children/sync,
                      goals, classes, leaderboard/referral, weekly emails,
                      Stripe checkout/portal/webhook, static serving
  store.js            Data store — JSON file (default) or Postgres (DATABASE_URL)
  auth.js             Password hashing + signed tokens
  email.js            Weekly parent-report email sending

marketing/            Standalone marketing/legal pages (served at /welcome, /privacy, etc.)
public/               PWA manifest, icons, favicon
resources/            App store / icon resources

vite.config.js        Build modes (web/app/onefile) + dev proxy
capacitor.config.json Android wrapper config
render.yaml           One-service Render deploy (builds dist-web + serves the API)
.env.web/.app/.onefile  Per-build-mode environment (VITE_PLATFORM, VITE_BILLING)
.env.example          Full documented list of backend env vars
```

There are many `*.md` docs at the root: `README.md` (start here), `DEPLOYMENT.md`
(Google Play), `DEPLOY_WEBSITE.md` (website + API), `PRICING.md`, `COMPLIANCE.md`,
`LAUNCH_RUNBOOK.md`, `CHECKLIST.md`, `VERIFY.md`, `BILLING_SANDBOX_TESTING.md`,
`STORE_LISTING.md`, `COMPETITORS.md`.

## How it works (data flow)

```
Browser (React)  ──POST /api/claude──►  Express server  ──x-api-key──►  Anthropic API
   src/lib/api.js                        server/index.js
```

- The **Anthropic key never reaches the browser.** Every AI feature in
  `src/lib/api.js` POSTs to the backend's `/api/claude`, which forwards to
  Anthropic with the server-side key. **Never put `ANTHROPIC_API_KEY` (or any
  secret) in frontend / `src/` code.**
- The model is set server-side in `server/index.js` (`/api/claude` default is
  `claude-sonnet-4-6`). Change it there, not in the frontend.
- `src/lib/api.js` reads `VITE_API_BASE` (falls back to `/api`). In dev, Vite
  proxies `/api` → `http://localhost:8787`. For a mobile/production build the
  app must point at a deployed backend via `VITE_API_BASE`.
- Learner progress is stored in `localStorage` (`whisker.v1`, see
  `src/lib/progress.js`). When a device is "bound" to a child profile from the
  portal, progress also syncs through the backend (`src/lib/cloud.js`).
- The backend dataset lives in `server/store.js`: a JSON file under
  `server/data/` by default, or Postgres when `DATABASE_URL` is set (the whole
  dataset is one JSON row, loaded into memory and written back on save — survives
  restarts on ephemeral hosts). Route handlers only call `load()` / `save()`;
  the backend is swappable in that one file.

## The three builds (one codebase)

The active platform is set by `VITE_PLATFORM` (via the per-mode `.env.*` files),
and `src/lib/platform.js` exposes `isApp()` / `isWeb()`. Payments are routed by
build in `src/lib/billing.js`.

| Build | Command | Output | Env file | Payments |
|---|---|---|---|---|
| **Web** (website) | `npm run build:web` | `dist-web/` | `.env.web` | Stripe Checkout |
| **App** (Google Play) | `npm run build:app` | `dist-app/` | `.env.app` | Google Play Billing via RevenueCat |
| **One-file** (single HTML) | `npm run build:onefile` | `dist-onefile/` | `.env.onefile` | mock (demo) |

`billing.js` defaults to **mock** unlock in dev and the real provider in prod;
override with `VITE_BILLING=mock|stripe|revenuecat`.

## Development workflow

Prerequisites: **Node.js 18+** and an **Anthropic API key**.

```bash
npm install
cp .env.example .env       # then add ANTHROPIC_API_KEY=sk-ant-... and PORT=8787
npm start                  # runs web (Vite :5173) + API (Express :8787) together
```

Open <http://localhost:5173>. To run the two halves separately use `npm run
server` and `npm run dev` in two terminals.

Common scripts (`package.json`):

| Script | Purpose |
|---|---|
| `npm start` | Web + API together (concurrently) |
| `npm run dev` | Vite web dev server only (`--mode web`) |
| `npm run dev:app` | Vite dev server in app mode |
| `npm run server` | Express API only |
| `npm run build` / `build:web` | Build the website (`dist-web/`) |
| `npm run build:app` | Build the mobile web assets (`dist-app/`) |
| `npm run build:onefile` | Build a single self-contained `index.html` |
| `npm run preview` | Preview the built web app |
| `npm run cap:add` / `cap:sync` / `cap:open` | Capacitor Android lifecycle |

> There is **no test runner, linter, or formatter configured** in this project —
> no `test`/`lint` npm scripts and no ESLint/Prettier config. Verify changes by
> running the app (`npm start`) and exercising the affected screen. Don't invent
> a test command or claim tests pass.

### SessionStart hook

`.claude/hooks/session-start.sh` runs `npm install` automatically in the remote
(Claude Code on the web) environment so the dev server, build, and API are ready.
It is a no-op outside that environment (`CLAUDE_CODE_REMOTE != true`).

## Backend API surface (server/index.js)

All under `/api`. Key groups:

- **AI / voice proxies:** `POST /claude` (the only path to Anthropic),
  `POST /tts` (ElevenLabs premium voice). `GET /health`.
- **Auth:** `POST /auth/signup`, `POST /auth/login`, `GET /me`, `PUT /me/prefs`,
  `DELETE /me`. Token auth via the `auth()` wrapper + `Authorization: Bearer`.
- **Children & sync:** CRUD under `/children`, plus `/children/:id/state`
  (get/put for cross-device sync) and `/children/:id/join-class`.
- **Goals & tasks:** `/children/:id/goals` and `/goals/:id*` — parents and
  teachers each have their own track; you can only edit goals on your own track.
- **Classes (teacher):** `/classes`, `/classes/:id/pupils`.
- **Social:** `/leaderboard` (weekly XP), `/referral/claim`, `/referral/qualify`.
- **Weekly emails:** `/cron/weekly-reports` (cron-secret gated) and
  `/admin/report` (admin-secret gated preview/trigger).
- **Stripe:** `/stripe/checkout`, `/stripe/portal`, and `/stripe/webhook`
  (registered with `express.raw` **before** `express.json()` so the signature
  can be verified against the raw body — keep it first).
- **Static & marketing:** clean URLs for `/privacy`, `/terms`, `/support`,
  `/welcome`, then the SPA fallback serving `dist-web/`.

## Conventions to follow

- **ES modules everywhere** (`"type": "module"`). Use `import`/`export`, not
  `require`.
- **React:** function components with hooks. `App.jsx` is one large stateful
  component holding the screen/game state; screen-level UI is split into
  `src/components/*`. Match the existing terse, comment-light-but-present style.
- **Keep secrets server-side.** Anything in `src/` ships to the browser. Secrets
  (`ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `ELEVENLABS_API_KEY`, `CRON_SECRET`,
  `ADMIN_SECRET`, `DATABASE_URL`) live only in the backend env. Frontend env vars
  must be prefixed `VITE_` and contain nothing sensitive.
- **AI calls go through `src/lib/api.js`**, which always hits the backend
  `/api/claude` proxy. Prompts request **raw JSON only**; responses are parsed
  with `extractJSON()`. When adding an AI feature, follow that pattern (system
  prompt built from `curriculum.js` helpers like `tutorBrief`, request strict
  JSON, parse defensively, and provide a sensible fallback).
- **Curriculum content** (stages, subjects, topics, prompts) belongs in
  `src/data/curriculum.js`; offline fallback questions in `src/data/bank.js`.
- **Localisation:** user-facing strings should flow through the `i18n.js`
  translation layer where the surrounding code already does; quizzes and AI
  feedback are generated directly in the chosen language.
- **Theming** is via CSS variables in `styles.css`; per-stage gradients/colours
  are defined alongside `KS_META`/`SUBJ` in `curriculum.js`.
- **Children's-app sensitivity:** this app targets children. Minimise data
  collection, don't persist homework photos, and keep the camera-consent flow
  (`ConsentCard` in `App.jsx`) intact. See `COMPLIANCE.md`.
- **The in-app checkout is real via Stripe/RevenueCat in production but mock in
  dev.** Don't assume money moves locally.

## Git workflow

- Develop on the designated feature branch; commit with clear messages; push
  with `git push -u origin <branch>`.
- **Do not create a pull request unless explicitly asked.**
- The default branch is `main`. `node_modules`, `dist*`, `.env`, and
  `server/data` are gitignored.

## Deploying

- **Website (with API + payments):** `render.yaml` defines one Render service
  that runs `npm run build:web` and serves `dist-web/` together with the Express
  API (health check `/api/health`). See `DEPLOY_WEBSITE.md`. Set the secret env
  vars in the dashboard.
- **Google Play app:** build with `build:app`, wrap with Capacitor
  (`cap:sync` → `cap:open`). See `DEPLOYMENT.md`.

## Known limitations (current prototype)

- AI features need internet (quizzes fall back to the offline bank; marking and
  solving do not).
- Progress is per-device unless an account binds it for sync.
- AI can make mistakes — the UI reminds learners a grown-up should check
  important answers.
