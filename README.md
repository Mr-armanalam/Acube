# Acube

A YouTube-style media platform: video feed, player and uploads, channels,
comments, likes / watch history / watch later, downloads (free daily limit, premium
unlimited), and a points system for completed watches.

Live demo: [accube.vercel.app](https://accube.vercel.app/) (deployed from
the original project; this rebuild has not been deployed yet).

> Status: professional rebuild in progress on branch
> `feat/acube-professional-rebuild` (Phases 0–3 done, see `PHASE1_REPORT.md`,
> `PHASE2_REPORT.md`, `PHASE3_REPORT.md`). Nothing here has been pushed or
> merged to `main` yet.

## Features

- **Video**: upload (MP4, max 10 MB), feed, search, channel pages, custom
  player (play/pause, seek, speed, theatre, fullscreen, picture-in-picture,
  keyboard shortcuts), view and like counters.
- **Library**: watch history, liked videos, watch later (all behind sign-in).
- **Downloads**: free users get 1 download per day; premium users get
  unlimited downloads. Premium is sold through Stripe Checkout.
- **Points**: 5 points per completed watch, max 10 points per video per day
  (server-side rule — the client never sends a points number).
- **Auth**: Google sign-in (verified server-side) or email/phone OTP.
- **Themes**: light/dark, including an automatic theme by time of day.

## Architecture

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

packages/shared   @acube/shared — Zod route schemas + constants used by
                  BOTH the API (runtime validation) and the web client
                  (typed z.infer inputs). Built to dist/ (JS + .d.ts).
packages/config   @acube/config — shared ESLint / Prettier / tsconfig.
```

Layout:

```text
apps/web/          # client — Vite 7 + React 19 + TS, React Router 8
apps/api/          # server — Express 5 + Mongoose 9, Node ESM
packages/shared/   # @acube/shared — constants + Zod route schemas
packages/config/   # @acube/config — shared eslint / prettier / tsconfig
```

## Setup

Requirements: Node >= 22, pnpm 12 (the repo's `packageManager` field pins
`pnpm@12.18.0`; if `pnpm` is not on your PATH, install it with
`npm install -g pnpm@12.18.0 --prefix=$HOME/.npm-global`).

```bash
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env   # fill in real values
cp apps/web/.env.example apps/web/.env   # fill in real values
pnpm dev                                  # api :5000 (nodemon) + web :3000 (Vite)
```

### Environment variables

Never commit a real `.env`. The `.env.example` files contain placeholders
only. The values Arman must supply from real accounts before a live run
are marked **required live** below.

**Server — `apps/api/.env`**

| Variable | What it is |
|---|---|
| `DB_URL` | **Required live.** MongoDB connection string. The server refuses to boot without it. |
| `JWT_SECRET` | **Required live.** Secret used to sign/verify JWTs. Any long random string. (The old misspelling `JWT_SECERT` is gone — deployments must set the new name.) |
| `GOOGLE_CLIENT_ID` | **Required live.** Google OAuth client ID from Google Cloud Console. `POST /user/login` verifies the Google ID token against it — without a real value, Google login always returns 401. The same ID is the web client's `VITE_CLIENT_ID`. |
| `PORT` | API port, default `5000`. |
| `FRONTEND_URL` | Public frontend origin for the CORS allowlist, e.g. `http://localhost:3000`. |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name (video/image uploads). |
| `CLOUDINARY_API_KEY` | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret. |
| `STRIPE_SK` | **Required live for payments.** Stripe secret key (server-side only, `sk_test_...` / `sk_live_...`). |
| `STRIPE_WEBHOOK_SECRET` | **Required live for premium.** Signing secret from Stripe Dashboard → Developers → Webhooks → the endpoint's "Signing secret". Without it the webhook answers 500 and premium is never granted. |
| `PREMIUM_PRICE_INR` | Premium price in INR, default `1000`. Change the price here, never in client code. Arman must confirm 1000 INR is the intended price. |
| `ACCOUNT_SID` | Twilio account SID (SMS OTP). |
| `ACCOUNT_TOKEN` | Twilio auth token (SMS OTP). |
| `TWILIO_NUMBER` | Twilio phone number that sends SMS OTPs. |
| `STP_USER` | Gmail address used to send OTP emails (use an app password, never the real password). |
| `STP_PASSWORD` | Gmail app password for `STP_USER`. |

**Client — `apps/web/.env`**

| Variable | What it is |
|---|---|
| `VITE_BACKEND_URL` | API base URL, e.g. `http://localhost:5000`. |
| `VITE_CLIENT_ID` | Google OAuth client ID (same value as the server's `GOOGLE_CLIENT_ID`). |
| `VITE_ENCRYPTED_KEY` | Client-side AES key used to obfuscate room IDs in URLs. It ships in the JS bundle, so it is obfuscation only, not security — do not put a real secret here. |

## Scripts (repo root)

| Command | What it does |
|---|---|
| `pnpm dev` | Run API (:5000) + web (:3000) together. |
| `pnpm build` | Build everything (shared → API syntax check → web). |
| `pnpm test` | Run BOTH test suites via Turbo: API (Vitest + Supertest, in-memory MongoDB) + web (Vitest + Testing Library + MSW). |
| `pnpm lint` | ESLint for API + web (web: 0 errors; 10 pre-existing warnings in untouched legacy files). |
| `pnpm typecheck` | `tsc --noEmit` for shared + web. |
| `pnpm format` | Prettier over `js/jsx/ts/tsx/json/md`. |

Per-app scripts: `pnpm --filter @acube/api test` / `pnpm --filter @acube/web test`
(single suite), `pnpm --filter @acube/web test:e2e` (Playwright smoke tests,
see below), `pnpm --filter @acube/api start` (API only, needs `DB_URL`).

## Tests

```bash
pnpm test        # both suites (API 119 + web 47, all green)
pnpm build && pnpm typecheck && pnpm lint   # gates, all exit 0
```

- **API** (`apps/api/tests/`, Vitest + Supertest + `mongodb-memory-server`):
  auth, OTP, video, comment, download/payments, history, routes
  smoke. No live MongoDB, Stripe, Twilio, or Cloudinary account is needed:
  one in-memory mongod for the run, Stripe and Cloudinary mocked, OTP
  senders mocked. First run on a fresh machine downloads the mongod
  binary (~128 MB) into `~/.cache/mongodb-binaries`.
- **Web** (`apps/web/src/test/`, Vitest + Testing Library + MSW): search,
  home, OTP, likes/save, upload, player, auth guards, downloads,
  payment status, slices, queries. The API is mocked with MSW; no live
  backend needed. DOM assertions use jest-dom matchers (`toBeInTheDocument`,
  `toHaveValue`, `toHaveTextContent`); see `src/test/jest-dom.d.ts`.
- **E2E smoke** (`apps/web/e2e/`, Playwright, Chromium, headless):
  `pnpm --filter @acube/web test:e2e` runs against `vite preview` plus a
  real API backed by an in-memory MongoDB seeded with one video. Covers
  Home feed rendering, search navigation, video-page playback controls,
  the logged-out auth-guard redirect, and lazy-chunk navigation. It does
  NOT cover real Google sign-in, live Stripe Checkout/webhooks, real
  Cloudinary uploads, or actual video playback with sound — those need
  real credentials and a live-browser click-through (see `PHASE3_REPORT.md`).

## Security model

- **Google login is verified server-side.** `POST /user/login` accepts a
  Google ID token and verifies it with `google-auth-library` against
  `GOOGLE_CLIENT_ID` (audience check + `email_verified`). Identity comes
  only from the verified token; body email/username/picture are ignored
  when a token is present. Forged, missing, or expired tokens are 401.
  There is no bypass flag and no dev escape.
- **OTP is server-side.** Codes are SHA-256 hashed in MongoDB, expire
  after 10 minutes, allow 5 wrong attempts, and enforce a 60-second
  resend cooldown. A verified OTP record is consumed (deleted) by the
  login that uses it — it cannot be reused.
- **Premium is granted ONLY by Stripe.** `POST /download/webhook`
  verifies the Stripe signature (`STRIPE_WEBHOOK_SECRET`) and grants
  premium only on `checkout.session.completed` with
  `payment_status === "paid"`, idempotently (duplicate deliveries are
  acknowledged without granting twice). The client never sends an
  amount — the price comes from the server catalogue (`PREMIUM_PRICE_INR`,
  default 1000 INR). `POST /download/handle-payment-status` is a
  verified fallback: it asks Stripe for the named Checkout Session and
  grants premium only if Stripe reports it paid and owned by the caller.
  A forged "success" URL grants nothing.
- **Ownership is enforced.** Mutations and personal lists are authed and
  scoped to the caller (`req.userid`); deleting or editing someone else's
  comment, message, history, liked, or watch-later row is 403. All
  inputs are Zod-validated; list endpoints are paginated
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

<!-- Screenshots go here once the app is deployed from this branch.
     Add real screenshots under docs/screenshots/ and link them here.
     Do NOT use placeholder images or screenshots from the old build. -->

- Home feed: _to add — `docs/screenshots/home.png`_
- Video page / player: _to add — `docs/screenshots/video-page.png`_
- Library (history / liked / watch later): _to add — `docs/screenshots/library.png`_

## Known limitations

- The web client fetches only the first page of 50 rows per list — true
  infinite scroll / "load more" is not done yet.
- `POST /user/watch-complete` has a small cap-check race (two concurrent
  completions can award one extra 5-point award).
- The daily free-download reset happens on login, not at midnight.
- Unique-index builds (`User.email`, `(videoid, viewer)`) are not
  runtime-checked against production data — dedupe first if the
  production collections already hold duplicates (see `PHASE3B_NOTES.md`).
- No real-browser verification yet for Google sign-in, live Stripe
  Checkout/webhooks, real Cloudinary uploads, or video playback with
  sound. See `PHASE3_REPORT.md` for the full list.
- Licence: MIT (see `LICENSE`). Note: `apps/api/package.json` still
  carries its pre-existing `ISC` licence field; the repo-level licence
  is MIT.

## Reports

- `PHASE0_BASELINE.md` — the original code as found.
- `PHASE1_REPORT.md` — monorepo, Express 5 / Mongoose 9, hardening, API tests.
- `PHASE2_REPORT.md` — Vite 7 / React 19 client, RTK + TanStack Query, bug fixes, client tests.
- `apps/api/PHASE3A_NOTES.md` — JWT rename, Google verification, Mongo OTP.
- `apps/api/PHASE3B_NOTES.md` — webhook-only premium, ownership, counters, pagination.
- `PHASE3_REPORT.md` — Phase 3c polish (this phase): shared TS build, web lint, bundle split, TSX conversions, jest-dom fix, README/CI, Playwright smoke tests.
