# Phase 1 Report — Acube Professional Rebuild

Branch: `feat/acube-professional-rebuild` (from Phase 0 `5ebdef5`, on top of `main` @ `ec16620`).
Date: 10 Nov 2026. Node on this VM: v24.22.1 (target pinned to 22 via `.nvmrc`; see §6).
No push, no PR, no merge. Phase 2 (Vite/React 19 client migration) not started.

## 1. What changed

### 1.1 Monorepo scaffold (commit `fc1fd21`)

- `client/` → `apps/web/` and `Server/` → `apps/api/`, moved as-is (git history
  preserved via rename detection; no code changed in this commit).
- Root `package.json` (scripts: `dev` / `build` / `test` / `lint` / `typecheck` /
  `format`), `turbo.json` pipelines, `pnpm-workspace.yaml` (`apps/*`,
  `packages/*`), one `pnpm-lock.yaml` replacing the two npm lockfiles.
- `packages/shared/` (`@acube/shared`): constants actually used by the API
  (`FREE_DAILY_DOWNLOADS = 1`, `OTP_LENGTH = 6`, `SUPPORTED_VIDEO_MIMETYPES`)
  plus the Zod schemas for every route input. Wired into the API; the web
  client adopts it in Phase 2.
- `packages/config/` (`@acube/config`): shared ESLint flat config (ESLint 10),
  Prettier config, and a base `tsconfig` for later phases.
- `.npmrc` sets `node-linker=hoisted`: react-scripts (CRA) needs a flat
  `node_modules` tree and does not work with pnpm's default isolated layout.
  Phase 2 (Vite) can drop this.
- `.gitignore` updated for the new layout (including a fix: a bare `uploads/`
  rule silently ignored the whole directory, so the `!.gitkeep` negation could
  never apply — the rule is now scoped to `apps/api/uploads/*`).

### 1.2 Server upgrade (commit `ee06090`)

- `index.js` split into `app.js` (Express app, importable by tests — no listen,
  no DB connect) and `index.js` (entry point: MongoDB connect **before**
  `listen`, graceful shutdown on SIGTERM/SIGINT closing server + mongoose).
- `start` is now plain `node index.js`; `dev` keeps nodemon;
  `--experimental-json-modules` dropped; `engines: Node >= 22`.
- Deleted: `body-parser` (replaced by built-in `express.json()`),
  `express-fileupload` (never imported), `fs` placeholder dep (the code imports
  Node's built-in `fs`), plus unused `axios` and `bcryptjs` (zero imports).
  `nodemon` moved to `devDependencies`.
- Stripe is now constructed lazily inside the payment-request handler: the old
  top-level `new Stripe(process.env.STRIPE_SK)` threw at import time, so the
  server could not boot at all without a Stripe key even though only one route
  uses Stripe. The route still returns 500 when Stripe is unusable.
- Express 5 fixes: no wildcard routes existed, so no path-to-regexp v8 rewrite
  was needed. The two-arg `res.json(body, status)` calls in `like.js` /
  `views.js` (second arg was silently dropped) now forward to the central error
  handler; `send_Groupusers` used to reply **HTTP 200 with `{status: 500}` in
  the body** — it now returns a real 500 via the error handler.
- Mongoose 9: `{ new: true }` → `{ returnDocument: "after" }` (channel,
  payment request); dropped the meaningless `{ new: true }` from
  `findOneAndDelete`. Also fixed: duplicate `picture` key in login user
  creation, unused `uuidv4` import in `Roomhandler`, and deleted dead
  `middleware/download_middleware.js` (nothing imported it — superseded by
  `Controllers/downloadVideo/*`).

### 1.3 Hardening (commit `ee06090`, behaviour-preserving except where noted)

- `helmet()` (security headers; the old manual COOP/COEP middleware was
  registered *after* the routes so it never ran — helmet now provides COOP;
  COEP `require-corp` intentionally not re-added, it would break cross-origin
  media embeds).
- CORS allowlist, never `*`: `FRONTEND_URL` env + `https://accube.vercel.app`
  (the deployed frontend from the README) + localhost dev origins
  (3000/5173, `localhost` + `127.0.0.1`). Requests without an `Origin` header
  (curl, server-to-server, Supertest) are allowed. Same list for Socket.IO.
  Disallowed origins get 403 `{error:{code:"FORBIDDEN_ORIGIN"}}`.
- `express-rate-limit`: global 300 req / 15 min; stricter 30 / 15 min on
  `/auth/*` and `/user/login` (override with `RATE_LIMIT_MAX` /
  `RATE_LIMIT_AUTH_MAX`). In tests (`NODE_ENV=test`) limits are 10000 so the
  suite never trips them.
- Zod validation on **every** route input via the `@acube/shared` schemas
  (body + URL params). Invalid input → 400
  `{error:{code:"VALIDATION_ERROR", message, details:[{path,message}]}}`.
  Valid requests pass through untouched (unknown body fields are stripped by
  Zod's default behaviour). Field-name quirks kept (`recieverId`, etc.) so the
  client does not change. One ordering note: on `/video/uploadvideo`, multer
  runs before body validation, so a request with no file *and* no
  title/chanel is 400, while title/chanel present with no file keeps the old
  404 ("plz upload a mp.4 video file only").
- Central error handler, stable shape `{error:{code,message}}`; 500s return a
  generic message in production (no raw `error.message` leakage), full detail
  in dev. Unknown routes → 404 `{error:{code:"NOT_FOUND"}}`.
- `GET /health` → `{status:"ok", db:"connected"|"disconnected", uptime}`.
- Structured logging via Pino (JSON in production, `pino-pretty` in dev,
  silent in tests). Controllers' existing `console.*` calls were left alone.
- **Intended behaviour change:** auth middleware returns **401** (was 400 with
  a plain `"invalid credentials.."` string) for missing/invalid/expired tokens,
  now `{error:{code:"UNAUTHORIZED", message}}`. `JWT_SECERT` spelling kept.
- **Small intended change:** `PATCH /video/view/:id` returns 404 for a valid
  id with no video (it used to throw on `files.views` of `null` and land in
  the error path).

## 2. Version table (before → after, installed versions verified)

| Package | Before | After |
|---|---|---|
| express | 4.19.2 | **5.2.1** (exact pin) |
| mongoose | 8.4.3 | **9.1.3** (exact pin) |
| multer | 1.4.5-lts.1 | **2.0.2** (exact pin) |
| nodemailer | 6.9.16 | 7.0.13 |
| cloudinary | 2.4.0 | 2.11.0 |
| twilio | 5.3.7 | 5.13.1 (6.x is a major — stayed on 5.x per patch-only rule) |
| stripe | 17.7.0 | **18.5.0** (see §3) |
| socket.io | 4.8.1 | 4.8.4 |
| helmet | — | 8.3.0 (new) |
| express-rate-limit | — | 8.7.4 (new) |
| zod | — | 4.6.7 (new) |
| pino (+ pino-pretty dev) | — | 10.4.0 / 13.2.0 (new) |
| body-parser | 1.20.2 | removed |
| express-fileupload | 1.5.0 | removed (never imported) |
| fs (placeholder) | 0.0.1-security | removed (code uses Node built-in `fs`) |
| axios / bcryptjs | 1.7.8 / 2.4.3 | removed (zero imports) |
| nodemon | 3.1.4 (deps) | 3.1.4 (devDeps) |
| vitest | — | 5.1.0 (new dev) |
| supertest | — | 7.3.2 (new dev) |
| mongodb-memory-server | — | 11.3.0 (new dev) |
| eslint | — | 10.14.0 (new dev, API) |
| turbo / prettier | — | 2.11.10 / 3.9.10 (new root dev) |
| typescript (override) | — | 5.9.3 (workspace pin, see §5) |
| pnpm | npm (two lockfiles) | **12.18.0**, one `pnpm-lock.yaml` |

Note: the three named upgrades were first installed as caret ranges, which
resolved to express 5.3.0 / mongoose 9.12.0 / multer 2.5.0. They are now
pinned exactly (`5.2.1` / `9.1.3` / `2.0.2`) and the suite re-verified green
on the pinned versions.

## 3. Stripe 18 changelog check

`stripe@18.5.0` was chosen after reading the 18.0.0 changelog
(`CHANGELOG.md` in the published tarball). The 18.0.0 breaking changes are
all in API areas Acube does not use: removed `SubscriptionItemUsageRecord` /
`Invoice.retrieveUpcoming` / `listUpcomingLines`, `invoice` on
`Charge`/`PaymentIntent`, `shipping_details` on Checkout Session, coupon /
promotion-code params, `billing_thresholds`, and similar Invoice /
Subscription / usage-record removals, plus the pinned API version moving to
`2025-03-31.basil`. Acube's only Stripe call is
`stripe.checkout.sessions.create({customer_email, line_items.price_data,
mode, success_url, cancel_url})` — none of those fields were removed or
changed. The mocked-Stripe test (`tests/download.test.js`) and the smoke test
confirm the route works on 18.5.0. Stripe 19+ was not attempted (out of the
17.x/18.x scope given for this phase).

## 4. Tests — 75 tests, 9 files, all green

Run: `pnpm test` (root; runs the API suite) or `pnpm --filter @acube/api test`.
Also `pnpm --filter @acube/api test:watch` for watch mode.
No live MongoDB, Stripe, Twilio, or Cloudinary account is needed: one
in-memory mongod for the run (`mongodb-memory-server`, binary cached in
`~/.cache/mongodb-binaries`), Stripe and Cloudinary mocked, OTP senders run
against dummy credentials (their failures are swallowed by the existing code,
exactly as in production).

| File | Tests | Covers |
|---|---|---|
| `tests/health.test.js` | 7 | `GET /`, `GET /health`, 404 shape, CORS allow + deny (403), helmet headers, rate-limit headers |
| `tests/auth.test.js` | 15 | auth 401s (missing / malformed / wrong-secret / bare `Bearer`), login create + repeat (no dup), login validation, update-points, channel update, getallchannel |
| `tests/otp.test.js` | 8 | send/verify validation 400s; send-otp 200 with no real SMTP/Twilio creds (no crash); wrong OTP → 400 |
| `tests/video.test.js` | 12 | view counter +1 per call, view 404 (missing video / bad id), like counter set + 401/400s, getvideos, upload: no-file 404, non-mp4 404, missing title 400, mocked-Cloudinary upload creates the record |
| `tests/comment.test.js` | 7 | post (incl. 401 / empty-body 400), list, edit + delete round-trip, bad-id 400 |
| `tests/chat.test.js` | 10 | send 201 (ciphertext ≠ plaintext), get decrypted, no-conversation 404, chat_user list, message delete, group create/list/send/get decrypted, unknown group 404, empty group 400 |
| `tests/download.test.js` | 9 | premium-status, free-user 1/day then 403, premium unlimited, downloads list, handle-payment-status grants premium, create-payment-request validation + mocked-Stripe checkout URL |
| `tests/history.test.js` | 5 | history / watchlater / likedvideo post + list + delete round-trips, validation 400, 401s |
| `tests/routes.smoke.test.js` | 2 | **all 38 endpoints** (36 API routes + `GET /` + `GET /health`) with expected statuses, plus a 401 check for all **22** auth-required routes |
| **Total** | **75** | **9 files, 0 failures** |

Route inventory smoke-checked (36 routes): `/auth` send-otp, verify-otp (2);
`/user` login, update/:id, getallchannel, update-points (4); `/chat` chat_user,
message/:id, chat_message, send, group_user, group, group/:groupId/messages,
group/messages (8); `/comment` post, get, delete/:id, edit/:id (4);
`/download` download-video, create-payment-request, handle-payment-status,
user/downloads, user/premium-status (5); `/video` uploadvideo, getvideos,
like/:id, view/:id, history, getallhistory, deletehistory/:userid, watchlater,
getallwatchlater, deletewatchlater/:videoid/:viewer, likevideo, getalllikevide,
deletelikevideo/:videoid/:viewer (13).

## 5. Verification (clean, from repo root)

| Check | Command | Result |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | **exit 0** |
| Build | `pnpm build` | **exit 0** — both apps. Web: 215.91 kB JS / 8.53 kB CSS / 1.77 kB chunk (gzip). API: syntax check passed for 47 files |
| Test | `pnpm test` | **75 / 75 passed, 9 files** (~15 s) |
| Lint | `pnpm lint` | **exit 0** (ESLint 10, API) |
| Typecheck | `pnpm typecheck` | exit 0, 0 tasks — no package has TS yet; placeholder for Phase 2 |

Web build notes (recorded honestly, not hidden):

- `CI=false` is **still** in the web build script, unchanged from before the
  move. The build passes with the same ESLint warnings as the Phase 0
  baseline (the `react-hooks/exhaustive-deps` / `no-unused-vars` warnings);
  fixing them is Phase 2 work.
- Web JS grew slightly vs the Phase 0 baseline (208.5 kB → 215.91 kB gzip;
  CSS 8.58 → 8.53 kB, chunk 1.77 kB unchanged). No client source file was
  changed — the drift comes from dependency versions resolved by pnpm vs the
  old npm lockfile.
- `pnpm build` prints a cosmetic Turbo warning: "no output files found for
  task @acube/api#build" (the API build is a syntax check with no artifacts).
- Two pnpm/CRA issues were found and fixed while verifying the build:
  1. The `apps/web/node_modules` carried over from the baseline `npm ci` was
     a mix of npm and pnpm files and produced a duplicate
     `eslint-config-react-app` ("Plugin react was conflicted"). Deleted the
     directory and reinstalled cleanly with pnpm.
  2. CRA 5's `@typescript-eslint` v5 + `fork-ts-checker` resolve
     `typescript@7` under pnpm, and `@typescript-eslint` v5 crashes at load
     time on TS 7, which broke the webpack ESLint pass ("Environment key
     jest/globals is unknown" — the jest plugin never loaded).
     Fixed with a workspace-wide override `typescript: ^5.9.3` in
     `pnpm-workspace.yaml`. Nothing here needs TS 7; revisit in Phase 2.
- pnpm 12 specifics: `allowBuilds` approves postinstall scripts for `core-js`,
  `core-js-pure` (banner only) and `mongodb-memory-server` (downloads the
  mongod binary); pnpm auto-added `minimumReleaseAgeExclude:
  express-rate-limit@8.7.4`. On this VM the pre-existing global pnpm was
  9.0.0, which the repo's `packageManager: pnpm@12.18.0` field rejects —
  pnpm 12.18.0 was installed with `npm install -g pnpm@12.18.0
  --prefix=$HOME/.npm-global` (under `~`, so it survives VM restarts; a
  previous global install outside `~` had disappeared).

## 6. How to run the app

```bash
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env       # fill in real values
cp apps/web/.env.example apps/web/.env       # fill in real values
pnpm dev                                      # api :5000 (nodemon) + web :3000 (CRA)
# or individually:
pnpm --filter @acube/api start                # node index.js (needs DB_URL)
pnpm --filter @acube/web start                # react-scripts start
```

Env: the API needs `DB_URL` and `JWT_SECERT` at minimum to boot (it now exits
with an error if `DB_URL` is unset instead of listening with no database).
All 14 server vars are documented in `apps/api/.env.example`, all 3 client
vars in `apps/web/.env.example` (placeholders only — no real secrets).
`GET /health` reports DB connectivity.

First-run test note: the first `pnpm test` on a fresh machine downloads the
~128 MB mongod 8.2.6 binary into `~/.cache/mongodb-binaries` (via the
`mongodb-memory-server` postinstall or on first test run). On this VM the
download was flaky — the library's downloader aborted with ECONNRESET after
retries while `curl` of the same URL worked, and `/tmp` is a 512 MB tmpfs
that was 100% full at the time (earlier scratch files; since cleaned). The
binary was pre-seeded here by downloading the tarball with `curl`, extracting
`bin/mongod`, and placing it at
`~/.cache/mongodb-binaries/mongod-x64-ubuntu-8.2.6` **plus a `<binary>.md5`
sidecar** containing the binary's md5 — mongodb-memory-server 11 treats a
cached binary without the `.md5` sidecar as corrupted and **deletes it**
(`isBinaryCorrupted` / `deleteBinary`), which is why manually placed binaries
kept vanishing until the sidecar was added. If tests ever fail with a download
error on a fresh machine, check `/tmp` space and seed the cache this way.

## 7. Known remaining issues / Phase 5 TODOs (out of scope, not fixed)

- **Google token verification** — login trusts any email (no Google token
  verification). Untouched.
- **Premium granted before payment / forged success callback** —
  `createPaymentRequest` sets `isPremium: true` before creating the Stripe
  checkout session, and `handlePaymentStatus` grants premium on a bare
  client call with no Stripe verification. Untouched (the test pins the
  current behaviour).
- **OTP Skip / in-memory OTP store** — OTPs live in a process-local object
  (`otpStore`), no expiry enforcement, no persistence. Untouched.
- **Ownership / authorisation checks** — e.g. `PUT /chat/chat_message` has no
  auth at all (kept as-is deliberately); comment/video/history deletes do not
  verify the caller owns the record. Untouched.
- **Pagination** — list endpoints (`getvideos`, `getcomment`, `getallhistory`,
  etc.) return everything. Untouched.
- **E2E chat claims** — messages are encrypted with a single shared
  server-side key (`SECRETKEY_CRYPTO`); that is not true end-to-end
  encryption. Untouched.
- **`JWT_SECERT` rename** — misspelling kept deliberately; coordinated rename
  is Phase 5.
- **Client state migration** — Redux/thunk → RTK + TanStack Query is Phase 2.
- **Web `proxy` is wrong (pre-existing)** — `apps/web/package.json` has
  `"proxy": "http://localhost:3000"`, i.e. the CRA dev server proxying to
  itself; the API is on 5000. Dead config (the client uses
  `REACT_APP_BACKEND_URL` directly). Left for Phase 2.
- **`express.static("public")`** serves a directory that does not exist in
  `apps/api` (pre-existing, harmless).
- **`pnpm test` runs only the API suite.** The web's `react-scripts test` is
  stale boilerplate (`src/App.test.js` asserts "learn react" text that does
  not exist) and is excluded until Phase 2.
- **OTP senders hit the network in tests** — `send-otp` tests attempt real
  SMTP/Twilio connections with dummy credentials and fail internally (as the
  production code does); the tests pass, but each takes ~300 ms on the
  connection attempts.
- **Node version** — verified on the VM's Node v24.22.1; `.nvmrc` pins 22 and
  `engines` require >= 22, but no run was done on Node 22 itself.
- **Rate limits in tests** are raised to 10000 (`NODE_ENV=test`); production
  defaults are 300 global / 30 auth per 15 min.

## 8. Commits (branch `feat/acube-professional-rebuild`, not pushed)

| Commit | Subject |
|---|---|
| `fc1fd21` | Phase 1: monorepo scaffold — pnpm workspaces + Turborepo |
| `ee06090` | Phase 1: server upgrade (Express 5, Mongoose 9) + hardening |
| `e96e03e` | Phase 1: API test suite (Vitest + Supertest + mongodb-memory-server) |
| _(this report)_ | Phase 1: report + README |

## 9. Blocked / not done

Nothing is blocked. All 36 routes smoke-checked, full suite green, both apps
build, frozen install works. The only deliberate non-completions are the
out-of-scope items in §7 and the Phase 2 client migration (Vite/React 19),
which this phase was told not to start.
