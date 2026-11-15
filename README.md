# Acube

Acube is a media/video platform: a personalised video feed, watch pages
with chapters and playlists, channels with subscriptions, search,
library and watch history, downloads, a points system, and a Creator
Studio for managing content, analytics, comments and settings. Premium
unlocks unlimited downloads.

Live: [accube.vercel.app](https://accube.vercel.app/) · API on Render.

Rebuilt from the original CRA + Express 4 codebase into a Turborepo +
pnpm monorepo (Vite + React 19 + TypeScript client, Express 5 +
Mongoose 9 API). The rebuild is merged to `main` and deployed; the
old build it replaced is described in `docs/archive/PHASE0_BASELINE.md`.

## Features

- **Feed** — personalised ranking: tag affinity over the viewer's own
  watch history, plus freshness and popularity; already-watched videos
  are deprioritised, never excluded.
- **Watch** — custom player (play/pause, seek, speed, theatre,
  fullscreen, picture-in-picture, keyboard shortcuts), chapters,
  playlist sidebar, nested comments, likes, view counters, Subscribe.
- **Channels** — channel pages with banner/avatar, subscribe/unsubscribe.
- **Search** — full-text video search with an empty state.
- **Library** — watch history (with per-item remove and progress),
  liked videos, watch later; all behind sign-in.
- **Studio** — content management (including edit-modal thumbnail
  upload), analytics (views, likes, daily stats), comments, and
  settings (banner/avatar, channel details).
- **Upload** — MP4, max 10 MB; thumbnails are generated automatically
  from the video (ffmpeg frame extraction).
- **Downloads** — free users get 1 download per day (reset on login);
  premium users get unlimited downloads.
- **Premium** — sold through Stripe Checkout; the price is set
  server-side (`PREMIUM_PRICE_INR`, currently defaults to ₹1000 on
  `main`). ₹15 with free use until 12 Nov 2027 is decided and pending
  in open PR #12 — it is not the live price until #12 merges. Premium
  is granted only by Stripe (webhook, with a verified-session
  fallback); the client never sends an amount.
- **Points** — 5 points per completed watch, max 10 points per video
  per day (server-side rule — the client never sends a points number).
- **Auth** — Google sign-in (ID token verified server-side) or
  email/phone OTP (codes SHA-256 hashed, 10-minute expiry, 5 wrong
  attempts, 60-second resend cooldown).
- **Themes** — dark by default; the toggle cycles System → Light →
  Dark → System. System follows the OS `prefers-color-scheme`, and a
  pre-paint script applies the stored choice before first paint, so
  there is no flash of the wrong theme.

## Tech stack

| Layer | Stack |
|---|---|
| Monorepo | Turborepo 2.11.10, pnpm 12.18.0, Node ≥ 22 |
| Web | Vite 7.3.8, React 19.3.1, TypeScript 5.9.3 (strict), React Router 8.3.1, Redux Toolkit 2.14.0, TanStack Query 5.107.1 |
| API | Express 5.2.1, Mongoose 9.1.3, Zod 4.6.7, Helmet, Pino |
| Services | MongoDB Atlas, Cloudinary (video/image storage), Stripe (Checkout + webhooks), Twilio (SMS OTP), Gmail SMTP (email OTP) |
| Tests | Vitest 5.1.0 + Supertest 7.3.2 (API), Vitest + Testing Library + MSW (web), Playwright 1.65.0 (e2e) |
| CI | GitHub Actions — lint → typecheck → test → build on every PR and every push to `main` |

```text
                    +------------------+
                    |  apps/web (Vite) |  React 19 + TypeScript (strict)
                    |  :3000 (dev)     |  RTK (client state) + TanStack
                    +--------+---------+  Query (server state)
                             |  axios, absolute VITE_BACKEND_URL
                             |  (no dev-server proxy)
                    +--------v---------+
                    |  apps/api        |  Express 5 + Mongoose 9, ESM
                    |  :5000           |  Zod validation, Helmet, CORS
                    +--------+---------+  allowlist, rate limits, Pino
                             |
              +--------------+--------------+
              |              |              |
        MongoDB          Cloudinary     Stripe / Twilio / Gmail
   (videos, users,   (video storage)  (Checkout + webhooks /
    OTPs)                              SMS + email OTP)
```

## Project structure

```text
apps/web/          # client — Vite 7 + React 19 + TS, React Router 8
apps/api/          # server — Express 5 + Mongoose 9, Node ESM
packages/shared/   # @acube/shared — constants + Zod route schemas used
                   #   by BOTH the API (runtime validation) and the web
                   #   client (typed z.infer inputs). dist/ is committed
                   #   so the web build does not need a prior shared build.
packages/config/   # @acube/config — shared ESLint / Prettier / tsconfig
docs/archive/      # frozen phase reports (Phases 0–5) — history, not docs
docs/screenshots/  # Phase 5 verification screenshots
```

## Setup

Requirements: Node ≥ 22, pnpm 12 (the repo's `packageManager` field pins
`pnpm@12.18.0`; if `pnpm` is not on your PATH, install it with
`npm install -g pnpm@12.18.0`).

```bash
pnpm install --frozen-lockfile
pnpm dev                                  # api :5000 (nodemon) + web :3000 (Vite)
```

### Environment variables

Never commit a real `.env`. There are **no `.env.example` files** in
this repo: set variables in the deployment dashboards (Vercel for the
web, the API host for the server) or in a local `.env` that is never
committed. Values are supplied by Arman. Only names are listed here —
never a value.

**Server — API host**

| Variable | What it is |
|---|---|
| `DB_URL` | **Required.** MongoDB connection string. The server refuses to boot without it. |
| `JWT_SECRET` | **Required.** Secret used to sign/verify JWTs. Any long random string. |
| `GOOGLE_CLIENT_ID` | **Required for login.** Google OAuth client ID. `POST /user/login` verifies the Google ID token against it — without a real value, Google login always returns 401. Must match the web's `VITE_CLIENT_ID`. |
| `PORT` | API port, default `5000`. |
| `FRONTEND_URL` | Public frontend origin for the CORS allowlist, e.g. `https://accube.vercel.app`. |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name (video/image uploads). |
| `CLOUDINARY_API_KEY` | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret. |
| `STRIPE_SK` | **Required for payments.** Stripe secret key, server-side only (`sk_test_…` / `sk_live_…`). |
| `STRIPE_WEBHOOK_SECRET` | **Required for premium.** Signing secret from Stripe Dashboard → Developers → Webhooks → the endpoint's "Signing secret". Without it the webhook answers 500 and premium is never granted. |
| `PREMIUM_PRICE_INR` | Premium price in INR, default `1000` on `main`. ₹15 with free use until 12 Nov 2027 is decided and pending in open PR #12 — not the live price until #12 merges. Change the price here, never in client code. |
| `ACCOUNT_SID` | Twilio account SID (SMS OTP). |
| `ACCOUNT_TOKEN` | Twilio auth token (SMS OTP). |
| `TWILIO_NUMBER` | Twilio phone number that sends SMS OTPs. |
| `STP_USER` | Gmail address used to send OTP emails. |
| `STP_PASSWORD` | Gmail app password for `STP_USER` — never the real Gmail password. |
| `LOG_LEVEL` | Log level (`debug` / `info` / …), default `info` outside tests. |
| `RATE_LIMIT_MAX` | Global rate limit per 15 min, default `300`. |
| `RATE_LIMIT_AUTH_MAX` | Auth-route rate limit per 15 min, default `30`. |
| `DEMO_LOGIN_ENABLED` | Set to `1` to allow demo sign-in (local/e2e only — never in production). |
| `SEED_DEMO_ALLOW_REMOTE` | Set to `1` to allow the demo seed against a remote (`atlas`/`prod`) `DB_URL`. |
| `NODE_ENV` | `development` / `test` / `production`. Tests raise the rate limits. |

**Client — Vercel**

| Variable | What it is |
|---|---|
| `VITE_BACKEND_URL` | API base URL, e.g. `http://localhost:5000`. |
| `VITE_CLIENT_ID` | Google OAuth client ID (same value as the server's `GOOGLE_CLIENT_ID`). |
| `VITE_ENCRYPTED_KEY` | Client-side AES key used to obfuscate room IDs in URLs. It ships in the JS bundle, so it is obfuscation only, not security — do not put a real secret here. |

### Seed demo data (local)

```bash
DB_URL=mongodb://127.0.0.1:27017/acube pnpm --filter @acube/api seed:demo
```

Seeds labelled demo data (3 channels, 24 viewers, 7 public videos plus
draft/unlisted/private/soft-deleted, 1,503 view events, 113 likes,
nested comments, playlists, library entries and history). Idempotent:
every seeded row carries `demo: true` and is cleared before re-insert,
so re-running never touches real data. A `DB_URL` containing `atlas`
or `prod` is refused unless `SEED_DEMO_ALLOW_REMOTE=1`.

## Scripts (repo root)

| Command | What it does |
|---|---|
| `pnpm dev` | Run API (:5000) + web (:3000) together. |
| `pnpm build` | Build everything (shared → API syntax check → web). |
| `pnpm test` | Run BOTH test suites via Turbo: API (Vitest + Supertest, in-memory MongoDB) + web (Vitest + Testing Library + MSW). |
| `pnpm lint` | ESLint for API + web. |
| `pnpm typecheck` | `tsc --noEmit` for shared + web. |
| `pnpm format` | Prettier over `js/jsx/ts/tsx/json/md`. |

Per-app scripts: `pnpm --filter @acube/api test` /
`pnpm --filter @acube/web test` (single suite),
`pnpm --filter @acube/web test:e2e` (Playwright smoke tests),
`pnpm --filter @acube/web test:e2e:phase5` (Playwright Phase 5 suite),
`pnpm --filter @acube/api seed:demo` (demo seed),
`pnpm --filter @acube/api start` (API only, needs `DB_URL`).

## Tests

Verified on the merged branch (15 Nov 2026, uncached, `pnpm test --force`):

- **API** (`apps/api/tests/`, Vitest + Supertest +
  `mongodb-memory-server`): **326/326 passed (23 files)** — auth, OTP,
  video, comment, download/payments, history, feed, studio, routes
  smoke. No live MongoDB, Stripe, Twilio, or Cloudinary account is
  needed: one in-memory mongod for the run, Stripe and Cloudinary
  mocked, OTP senders mocked. First run on a fresh machine downloads
  the mongod binary (~128 MB) into `~/.cache/mongodb-binaries`.
- **Web** (`apps/web/src/test/`, Vitest + Testing Library + MSW):
  **312/312 passed (33 files)**. The first full run showed 311/312 —
  one timing failure in `settingsWatchPolish.test.tsx` ("has no
  Banner/Profile picture URL inputs any more":
  `findByLabelText("Channel name")` timed out while the settings page
  was still showing its loading skeleton under the full parallel run
  on this 1.5-CPU VM). Proven a flake, not a regression: the file
  re-run alone passes 12/12, exit 0; the full web suite re-run passes
  312/312, exit 0; and the full web suite on `origin/main` also
  passes 312/312 — no code changed. The API is mocked with MSW; no live
  backend needed. DOM assertions use jest-dom matchers (`toBeInTheDocument`,
  `toHaveValue`, `toHaveTextContent`); see `src/test/jest-dom.d.ts`.
- **Gates, all exit 0**: `pnpm typecheck --force` (3 tasks),
  `pnpm lint --force` (0 errors, 2 warnings — both pre-existing, in `LibraryHub` and `authSlice`),
  `pnpm build --force` (3 tasks; the API build is a syntax check, same
  "no output files" note as before).
- **E2E** (`apps/web/e2e/` + `e2e-phase5/`, Playwright, Chromium,
  headless): smoke tests against `vite preview` plus a real API backed
  by an in-memory MongoDB seeded with one video; the Phase 5 suite
  covers Home, Watch (playlist sidebar + current row), Search,
  Channel, Library, History, Studio (Content/Analytics/Comments/
  Settings), Upload and the light theme, against the production build
  + a real seeded API. E2E does NOT cover real Google sign-in, live
  Stripe Checkout/webhooks, real Cloudinary uploads, or actual video
  playback with sound — those need real credentials and a live-browser
  click-through.

## Security model

- **Google login is verified server-side.** `POST /user/login` accepts
  a Google ID token and verifies it with `google-auth-library` against
  `GOOGLE_CLIENT_ID` (audience check + `email_verified`). Identity
  comes only from the verified token; body email/username/picture are
  ignored when a token is present. Forged, missing, or expired tokens
  are 401. There is no bypass flag and no dev escape.
- **OTP is server-side.** Codes are SHA-256 hashed in MongoDB, expire
  after 10 minutes, allow 5 wrong attempts, and enforce a 60-second
  resend cooldown. A verified OTP record is consumed (deleted) by the
  login that uses it — it cannot be reused.
- **Premium is granted ONLY by Stripe.** `POST /download/webhook`
  verifies the Stripe signature (`STRIPE_WEBHOOK_SECRET`) and grants
  premium only on `checkout.session.completed` with
  `payment_status === "paid"`, idempotently (duplicate deliveries are
  acknowledged without granting twice). The client never sends an
  amount — the price comes from the server catalogue
  (`PREMIUM_PRICE_INR`). `POST /download/handle-payment-status` is a
  verified fallback: it asks Stripe for the named Checkout Session and
  grants premium only if Stripe reports it paid and owned by the
  caller. A forged "success" URL grants nothing.
- **Ownership is enforced.** Mutations and personal lists are authed
  and scoped to the caller (`req.userid`); deleting or editing someone
  else's comment, history, liked, or watch-later row is 403. All inputs
  are Zod-validated; list endpoints are paginated
  (`{ items, page, limit, total, totalPages }`, limit clamped to 50).
  Like/view counters move by atomic `$inc`; points are awarded
  server-side only (5 per completed watch, max 10 per video per day).
- **Chat and video calls removed.** The 1:1/group chat and WebRTC
  video-call features (and the `SECRETKEY_CRYPTO` chat-message
  encryption) were removed; the `conversations` / `messages` / `groups`
  collections are orphaned in existing databases — dropping them is an
  ops decision, not code.
- **Other hardening**: Helmet headers, CORS allowlist (never `*`),
  rate limits (300 req / 15 min global, 30 / 15 min on auth routes),
  central error handler (`{ error: { code, message } }`, no stack
  leakage in production), upload filenames sanitised and capped at
  10 MB, JWT auth returning 401 (not a plain string).

## Screenshots

Phase 5 verification screenshots (in `docs/screenshots/`):

- Home feed — `docs/screenshots/home.png`
- Watch page / player — `docs/screenshots/watch.png`
- Search — `docs/screenshots/search.png`
- Library (history / liked / watch later) — `docs/screenshots/library.png`
- Studio content — `docs/screenshots/studio-content.png`
- Studio analytics — `docs/screenshots/studio-analytics.png`
- Dark theme — `docs/screenshots/theme-dark.png`

## Known limitations

- The web client fetches only the first page of 50 rows per list — true
  infinite scroll / "load more" is not done yet.
- `POST /user/watch-complete` has a small cap-check race (two concurrent
  completions can award one extra 5-point award).
- The daily free-download reset happens on login, not at midnight.
- Unique-index builds (`User.email`, `(videoid, viewer)`) are not
  runtime-checked against production data — dedupe first if the
  production collections already hold duplicates (see `DEPLOYMENT.md`
  §9.1).
- No real-browser verification yet for Google sign-in, live Stripe
  Checkout/webhooks, real Cloudinary uploads, or video playback with
  sound. See `DEPLOYMENT.md` §7 for the live click-through checklist.

## Deployment

See [`DEPLOYMENT.md`](DEPLOYMENT.md): web on Vercel with Root Directory
`apps/web` (confirmed) and the SPA fallback in `apps/web/vercel.json`;
API on Render; all env vars set in the dashboards. The first deploy of
the rebuild is done — rollback means redeploying the previous
production deployment from the host dashboard.

## Reports

- `docs/archive/PHASE0_BASELINE.md` — the original code as found.
- `docs/archive/PHASE1_REPORT.md` — monorepo, Express 5 / Mongoose 9, hardening, API tests.
- `docs/archive/PHASE2_REPORT.md` — Vite 7 / React 19 client, RTK + TanStack Query, bug fixes, client tests.
- `docs/archive/PHASE3A_NOTES.md` — JWT rename, Google verification, Mongo OTP.
- `docs/archive/PHASE3B_NOTES.md` — webhook-only premium, ownership, counters, pagination.
- `docs/archive/PHASE3_REPORT.md` — Phase 3c polish: shared TS build, web lint, bundle split, TSX conversions, jest-dom fix, README/CI, Playwright smoke tests.
- `docs/archive/PHASE4_REPORT.md` — Phase 4.
- `docs/archive/PHASE5_PLAN.md` — Phase 5 plan (premium UI + Creator Studio).
- `PHASE5_REPORT.md` — Phase 5 verification + finishing pass, incl. §§8.9.1–8.9.25 (per-PR verification notes).
- `DEPLOYMENT.md` — deployment guide, env vars, verification checklist, rollback.
- `apps/api/scripts/README.md` — demo seed + API syntax-check scripts.

## Contributing

Work lands on feature branches and is merged by Arman — nothing is
pushed directly to `main`, and Muse does not merge PRs. Each feature
goes on its own branch with its own PR; keep PRs scoped and verify
locally (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`)
before opening one.

Licence: MIT (see `LICENSE`). Note: `apps/api/package.json` still
carries its pre-existing `ISC` licence field; the repo-level licence
is MIT.
