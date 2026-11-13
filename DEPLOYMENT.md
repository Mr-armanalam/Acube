# Acube — Deployment Guide

Branch: `feat/acube-professional-rebuild` (Phase 3 complete, commit `7cafc9a`
+ uncommitted Phase 4 test-hang fix files).
**Status: NOT deployed. The PR for this branch has not been opened or merged
yet — nothing below is live. Deployment happens only AFTER Arman reviews and
merges the PR.**

The currently live site, https://accube.vercel.app/, serves the **old**
pre-rebuild build (CRA client + Express 4 API). This guide covers replacing
it with the rebuild.

## 1. Architecture recap

```
apps/web  (Vite 7 + React 19 + TS)  ── static build ──► Vercel
apps/api  (Express 5 + Mongoose 9)  ── Node service ──► Render / Railway / Fly.io / VPS
MongoDB Atlas ── DB_URL ──► apps/api
Cloudinary / Stripe / Twilio / Gmail SMTP ──► apps/api
```

- API listens on `PORT` (default `5000`); it connects to MongoDB **before**
  listening and refuses to boot without `DB_URL`
  (`apps/api/index.js:12,41,48`).
- Web is a static SPA: `apps/web/dist` after `vite build`. All API calls go
  through absolute `VITE_BACKEND_URL` (no proxy, no relative `/api` calls).
- Node `>= 22`, pnpm `12.18.0` (pinned in root `package.json`
  `packageManager`).

## 2. Recommended hosting

| Service | Host | Why |
|---|---|---|
| `apps/web` | **Vercel** (existing project already serves https://accube.vercel.app/) | Static Vite build; the project already exists, so this is a redeploy/repoint, not a new setup. See §3. |
| `apps/api` | **Render** (Web Service), **Railway**, **Fly.io**, or a **VPS** | Long-running Node process; needs a persistent port and env vars. Any of these works — no repo config exists for any of them yet (no `render.yaml`, `Procfile`, or `Dockerfile` in the repo; hosting config is dashboard-side — **to confirm** which host Arman prefers). |
| Database | **MongoDB Atlas** | `DB_URL` is a standard `mongodb+srv://` connection string. |

### 3. Vercel (web) — redeploy / repoint

The existing Vercel project serves the **old** build. To serve the rebuild:

1. Merge the PR into `main` first (see §9 — do not deploy the branch
   directly unless Arman explicitly wants a preview deployment).
2. In the Vercel project settings, point the deployment at the rebuilt code:
   - **Root Directory:** `apps/web` — **to confirm** (current project
     settings are not in this repo; there is no `vercel.json`).
   - **Framework preset:** Vite.
   - **Install command:** `pnpm install --frozen-lockfile`
   - **Build command:** `pnpm --filter @acube/web build`
     (`apps/web/dist` is the output). This works because
     `packages/shared/dist/` is committed, so the web build does not need a
     prior shared build. The fully verified build from the repo root is
     `pnpm build` (Turbo: shared → API syntax check → web).
   - **Node version:** 22.x; **package manager:** pnpm 12.18.0.
3. Set the web env vars from §5 in the Vercel project settings
   (Production). `VITE_*` vars are baked into the JS bundle at build time —
   changing one requires a **rebuild + redeploy**, not just a restart.
4. Redeploy. Verify with §7.

**Preview deployments:** Vercel can also build the PR branch as a preview
URL — useful for Arman to click through before merging. A preview URL is a
*different origin* from `https://accube.vercel.app`, so the API's CORS
allowlist must include it (set `FRONTEND_URL` to the preview origin, §6) or
API calls from the preview will 403.

## 4. API host (Render / Railway / Fly.io / VPS)

Generic setup — adapt to the chosen host's dashboard:

- **Build command:** `pnpm install --frozen-lockfile`
  (optionally `pnpm build` first — the API's own `build` script is only a
  syntax check; the full verified build is `pnpm build` from the repo root).
- **Start command:** `pnpm --filter @acube/api start`
  (runs `node index.js`). Do **not** use `pnpm dev` (nodemon) in production.
- **Port:** the host injects `PORT`; the API honours it (`process.env.PORT
  || 5000`). Expose whatever the host assigns.
- **Health-check path:** `/health` (see §7). Point the host's health check
  at it if supported.
- **Root directory:** repo root (the API is `apps/api` inside the monorepo;
  the host must install from the root so workspace deps resolve).
- **Node version:** 22.x; **package manager:** pnpm 12.18.0.
- Set the API env vars from §5 in the host's dashboard (never in a
  committed file).

**VPS alternative:** same commands on the server (`pnpm install
--frozen-lockfile`, `pnpm --filter @acube/api start`), behind a process
manager (e.g. `systemd` / `pm2` — **to confirm** which, if any, Arman
uses) and a reverse proxy. The reverse proxy must **not** parse or
re-serialise request bodies for `POST /download/webhook` — Stripe's
signature verification needs the exact raw body (the app registers
`express.raw()` before `express.json()` for this route; a proxy that
buffers/re-encodes JSON would break verification).

**Local `uploads/` note:** `apps/api/app.js` still serves `/uploads`
statically, but Phase 3b stores uploaded video filepaths as Cloudinary
`secure_url`s, so uploads should not depend on the local disk. On
ephemeral hosts (e.g. Render free tier) local disk does not persist
between deploys — verify no flow still writes to local `uploads/` before
relying on it (**to confirm**).

## 5. Environment variables

Never commit a real `.env`. Placeholders only live in
`apps/api/.env.example` (17 vars) and `apps/web/.env.example` (3 vars).

### 5a. API — set on the API host (Render / Railway / Fly.io / VPS)

| Variable | Required? | Notes |
|---|---|---|
| `DB_URL` | **Required** | MongoDB Atlas `mongodb+srv://…` string. Server refuses to boot without it. |
| `JWT_SECRET` | **Required** | Any long random string; signs/verifies JWTs. |
| `GOOGLE_CLIENT_ID` | **Required for login** | Google Cloud Console OAuth client ID. `POST /user/login` verifies the Google ID token against it — without a real value, Google login always returns 401. Must match the web's `VITE_CLIENT_ID`. |
| `STRIPE_SK` | **Required for payments** | Stripe secret key, server-side only (`sk_test_…` for testing, `sk_live_…` for real payments). |
| `STRIPE_WEBHOOK_SECRET` | **Required for premium** | Signing secret for the webhook endpoint (§6). Without it the webhook answers 500 and premium is never granted. |
| `FRONTEND_URL` | **Required on deploy** | Public frontend origin for the CORS allowlist, e.g. `https://accube.vercel.app` (see §6). |
| `PORT` | Optional (default `5000`) | Hosts usually inject this themselves. |
| `PREMIUM_PRICE_INR` | Optional (default `1000`) | Server-side price catalogue. **Arman has NOT confirmed 1000 INR is the intended price** — confirm before taking real payments. Change the price here, never in client code. |
| `CLOUDINARY_CLOUD_NAME` | Required for uploads | Cloudinary cloud name. |
| `CLOUDINARY_API_KEY` | Required for uploads | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | Required for uploads | Cloudinary API secret. |
| `ACCOUNT_SID` | Required for SMS OTP | Twilio account SID. |
| `ACCOUNT_TOKEN` | Required for SMS OTP | Twilio auth token. |
| `TWILIO_NUMBER` | Required for SMS OTP | Twilio phone number that sends SMS OTPs. |
| `STP_USER` | Required for email OTP | Gmail address used to send OTP emails. |
| `STP_PASSWORD` | Required for email OTP | Gmail **app password** for `STP_USER` — never the real Gmail password (see §6). |

### 5b. Web — set in Vercel (Production)

| Variable | Required? | Notes |
|---|---|---|
| `VITE_BACKEND_URL` | **Required** | Public API base URL, e.g. `https://<api-host>/` — no trailing path. All API calls use it. |
| `VITE_CLIENT_ID` | **Required for login** | Same Google OAuth client ID as the API's `GOOGLE_CLIENT_ID`. |
| `VITE_ENCRYPTED_KEY` | Required | Client-side AES key used to obfuscate room IDs in URLs. It ships in the JS bundle, so it is obfuscation only, not security — do not put a real secret here. |

### 5c. ⚠️ JWT_SECRET rename — breaking change

Phase 3a renamed the JWT secret **`JWT_SECERT` → `JWT_SECRET`**
(`apps/api/PHASE3A_NOTES.md`, `PHASE3_REPORT.md` §1). There is **no
fallback** to the old spelling: a deployment still setting `JWT_SECERT`
will sign/verify with `undefined` and fail.

- Set `JWT_SECRET` (new name) on the API host. Delete any `JWT_SECERT`
  entry so the mistake cannot recur.
- Tokens issued before the rename keep verifying **as long as the secret
  value itself is unchanged** — keep the same value, just under the new
  name, to avoid logging every user out.

## 6. Service setup notes

### Stripe webhook

1. In the Stripe Dashboard → Developers → Webhooks, create an endpoint:
   - **URL:** `<api-base-url>/download/webhook`
     (e.g. `https://<api-host>/download/webhook`). The route is registered
     in `apps/api/app.js` as `POST /download/webhook` with
     `express.raw({ type: "application/json" })` before `express.json()`.
   - **Events to send:** `checkout.session.completed` only. The handler
     ignores every other event type and only grants premium when
     `payment_status === "paid"`.
2. Copy the endpoint's **Signing secret** (`whsec_…`) into the API env var
   `STRIPE_WEBHOOK_SECRET`.
3. The handler is idempotent (event id claimed by atomic upsert before
   granting; duplicate deliveries answer `200 { duplicate: true }`), so
   Stripe retries are safe.
4. **Test mode first:** use `sk_test_…` + a test-mode webhook endpoint and
   run a test Checkout before switching to live keys. Live keys and the
   live webhook secret are separate values — do not mix test/live.
5. If the webhook 500s, premium is never granted by webhook. The
   client-side `handle-payment-status` fallback (verified session
   retrieval, ownership-checked) can still grant it when the user returns
   from Checkout — but the webhook is the primary grant path, so fix it
   rather than relying on the fallback.

### Cloudinary

Create (or reuse) a Cloudinary account and set `CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` on the API host. Uploads use
`resource_type: "video"`, 10 MB limit (`MAX_UPLOAD_BYTES`), sanitised
filenames. **To confirm:** whether the existing (pre-rebuild) Cloudinary
account/cloud already holds the old videos, and whether the same cloud
should be reused or a fresh one created.

### Twilio (SMS OTP)

Set `ACCOUNT_SID`, `ACCOUNT_TOKEN`, `TWILIO_NUMBER` on the API host from
the Twilio Console. **To confirm:** whether the existing Twilio number is
still active/verified for the sender number, and whether the account is
in trial mode (trial accounts can only SMS verified numbers).

### Gmail SMTP (email OTP)

- `STP_USER` is the Gmail address; `STP_PASSWORD` must be a **Gmail app
  password**, never the account password.
- App passwords require 2-Step Verification on the Google account; create
  one at Google Account → Security → App passwords (16-character code,
  no spaces when pasted). **To confirm:** which Gmail account Arman wants
  OTP mail sent from.
- OTP senders now **throw** on failure instead of swallowing the error:
  a real send failure answers `500 OTP_SEND_FAILED` and stores nothing.

### CORS / FRONTEND_URL

The API allowlist (`apps/api/app.js:25-52`) is:

```
process.env.FRONTEND_URL,
"https://accube.vercel.app",        // hardcoded default
"http://localhost:3000", "http://localhost:5173",
"http://127.0.0.1:3000", "http://127.0.0.1:5173"
```

- Set `FRONTEND_URL` to the deployed Vercel URL. `https://accube.vercel.app`
  is already in the default list, so if that stays the production domain
  the deploy works even without `FRONTEND_URL` — set it anyway so the
  deployed origin is explicit, not accidental.
- Any **other** frontend origin (Vercel preview URL, custom domain) must
  be added via `FRONTEND_URL` or API calls from it get `403
  FORBIDDEN_ORIGIN`. Requests with no `Origin` header (curl,
  server-to-server) are allowed.
- Note: the stale comment at `apps/api/app.js:26` ("CRA on 3000, Vite on
  5173 in Phase 2") is wrong about the current dev port (web dev is
  `:3000`) — cosmetic only, left untouched.

### Google OAuth

The same client ID is used as `GOOGLE_CLIENT_ID` (API) and
`VITE_CLIENT_ID` (web). In Google Cloud Console → Credentials, the OAuth
client's **Authorised JavaScript origins** must include the deployed
frontend origin (e.g. `https://accube.vercel.app`), and **Authorised
redirect URIs** must include whatever the `@react-oauth/google` flow
needs — **to confirm** the exact entries, as they are not recorded in
the repo. Without them, the Google button cannot initialise / login
fails even with correct env vars.

## 7. Verification after deploy

Run these against the **deployed** URLs (replace `<api>` / `<web>`):

```bash
# API is up and connected to MongoDB
curl -s <api>/health
# expect: {"status":"ok","db":"connected","uptime":<seconds>}  (HTTP 200)

# API root
curl -s <api>/
# expect: Your tube is working

# Public catalogue (paginated envelope — the Phase 3b response shape)
curl -s "<api>/video/getvideos?page=1&limit=10"
# expect: HTTP 200, {"items":[…],"page":1,"limit":10,"total":N,"totalPages":M}

# Web serves the SPA
curl -s -o /dev/null -w "%{http_code}\n" <web>/
# expect: 200
```

Then click through in a browser (logged-out, then signed in with a real
Google account): Home feed renders → search → video page plays →
`/Library` redirects to Home when logged out → sign in → upload a video →
premium upgrade via Stripe test Checkout → webhook grants premium
(check `isPremium` / download works).
The full live-browser click-through has **not** been done yet for the
rebuild (Phase 3 verified headlessly with Playwright 6/6 against local
servers only) — do it on the preview/staging deploy before calling the
production deploy done.

Smoke checks for the webhook specifically: in Stripe Dashboard →
Developers → Webhooks → the endpoint, confirm deliveries of
`checkout.session.completed` return `200`. A `500` means
`STRIPE_WEBHOOK_SECRET` is missing/wrong.

## 8. Rollback

- **Nothing is deployed yet** — the first deploy is the merge of this
  branch. Rollback therefore means reverting to the **old** build:
  - **Web (Vercel):** redeploy the previous production deployment from
    the Vercel dashboard (Deployments → previous deployment → Promote to
    Production), or redeploy `main` at the pre-merge commit.
  - **API:** redeploy the previous release from the host's dashboard /
    previous commit. There is no separate API deployment to roll back to
    yet — the old API's hosting is **to confirm** (it is not recorded in
    this repo).
  - **Database:** this phase makes **no schema/data migrations** — the
    only DB change is new unique indexes, which build automatically on
    first boot (see §9 dedupe warning). Rolling back the code does not
    require rolling back data. If the indexes fail to build (duplicate
    production rows), the app keeps running but the index is absent —
    dedupe first (§9).
- Keep the old deployment available until the new one is verified (§7);
  do not delete the old Vercel deployment or API service on day one.

## 9. Outstanding items that affect deployment (from PHASE3_REPORT.md §9)

These are known limitations of the branch being deployed — not blockers,
but deploy with eyes open:

1. **Unique-index build against production data — DEDUPE FIRST.**
   Phase 3b added unique indexes: `User.email`, and `(videoid, viewer)`
   on history / liked-video / watch-later. If the production collections
   already hold duplicates, the index builds **fail** (Mongoose logs the
   error; the app keeps running but the index is absent). Before the
   first production boot against real data, check and dedupe:
   ```js
   // duplicate emails
   db.users.aggregate([
     { $group: { _id: "$email", n: { $sum: 1 } } },
     { $match: { n: { $gt: 1 } } }
   ])
   ```
   Merge or rename duplicate accounts; for history/liked/watch-later
   keep the earliest row per `(videoid, viewer)` pair, then let the
   indexes build. **No data is dropped by the rebuild itself.**
   (Deliberate non-do: `User.username` is NOT unique — two Google users
   can share a display name.)
2. **Infinite scroll is page-1-only.** The web client fetches only the
   first page of 50 for every list — lists longer than 50 rows are
   truncated to the first page until true infinite scroll / "load more"
   is built. Visible on long feeds, history, and liked lists.
3. **Daily download reset happens on login only**, not at midnight
   (pre-existing behaviour, unchanged). A user who stays logged in past
   midnight keeps yesterday's download count until their next login.
4. **Watch-complete concurrency race (minor):** two concurrent
   completions can race the cap check by one 5-point award. The cap is a
   fairness limit, not a billing boundary — no action needed for deploy.
5. **CI is not verified live and does not deploy.** `.github/workflows/ci.yml`
   runs lint → typecheck → test → build on PRs and pushes to
   `feat/acube-professional-rebuild`. Its first live run is the PR for
   this branch. It performs **no deployment** — deploys are the manual
   steps in §3–§4.
6. **After merge, widen the CI push trigger.** The workflow currently
   triggers on `push` only to `feat/acube-professional-rebuild`. Once the
   PR merges, pushes to `main` will no longer trigger CI. Recommendation
   (not done here): add `main` to the push branches after merge.
   ```yaml
   on:
     pull_request:
     push:
       branches: [main, feat/acube-professional-rebuild]
   ```
7. **1000 INR premium price is unconfirmed** (see §5a). Confirm with
   Arman before taking real payments.
8. **Known non-blockers:** 9 web lint warnings in untouched legacy
   files; remaining unconverted `.jsx` files in the web app
   (`LoadingCard`, `Drawersliderbar`, `Leftsidebar`,
   `Showvideo`, `ProgressRing`, `Searchlist`, utils);
   `apps/api/package.json` licence still says `ISC` vs repo MIT.

## 10. Pre-deploy checklist

- [ ] PR reviewed and merged by Arman (Muse does not merge).
- [ ] `JWT_SECRET` set on the API host (new name); no `JWT_SECERT` anywhere.
- [ ] Production data deduped for the unique indexes (§9.1) — or
      accepted that the indexes will be absent on first boot.
- [ ] `GOOGLE_CLIENT_ID` / `VITE_CLIENT_ID` real values; Google Console
      origins updated (§6).
- [ ] `STRIPE_SK` + `STRIPE_WEBHOOK_SECRET` set; webhook endpoint
      created in Stripe Dashboard; test-mode Checkout verified first.
- [ ] `PREMIUM_PRICE_INR` confirmed with Arman (default 1000).
- [ ] `FRONTEND_URL` = deployed Vercel URL; `VITE_BACKEND_URL` = deployed
      API URL.
- [ ] `DB_URL` (Atlas), Cloudinary, Twilio, Gmail app password set.
- [ ] CI trigger widened to `main` after merge (§9.6).
- [ ] §7 verification run against the deployed URLs + live-browser
      click-through done.
- [ ] Old deployment kept available for rollback (§8).

## 11. Sources (all verified from the repo)

- `README.md` (setup, env tables, scripts), `PHASE3_REPORT.md` §1–§9,
  `apps/api/PHASE3A_NOTES.md`, `apps/api/PHASE3B_NOTES.md` §5 (indexes +
  migration note), `apps/api/.env.example`, `apps/web/.env.example`,
  `apps/api/app.js` (CORS allowlist, webhook registration),
  `apps/api/Controllers/downloadVideo/webhook.js`,
  `apps/api/index.js` (boot order, `PORT`), `.github/workflows/ci.yml`.
- Anything marked **to confirm** above could not be verified from the
  repo — no URL, price, or service tier has been invented.
