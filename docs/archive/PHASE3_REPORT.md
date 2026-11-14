# Phase 3 Report — Acube Professional Rebuild (server security + polish + CI + tests + browser verification)

Branch: `feat/acube-professional-rebuild` (from Phase 2 `78f93aa`, on top of `main` @ `ec16620`).
Date: 10 Nov 2026. Node on this VM: v24.22.1 (target pinned to 22 via `.nvmrc`).
No push, no PR, no merge. `main` untouched.

Phase 3 was done in three workstreams, each with its own notes file:

- **3a** — auth + OTP (`apps/api/PHASE3A_NOTES.md`)
- **3b** — payments + ownership + counters + uploads + pagination (`apps/api/PHASE3B_NOTES.md`)
- **3c** — polish + CI + tests + browser verification (this report, §3 onward)

Final verification (10 Nov 2026, from repo root, after all commits): `pnpm install
--frozen-lockfile`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck` — all
exit 0; Playwright `pnpm --filter @acube/web test:e2e` 6/6. Exact counts in §5.

## Version table

| Package | Version (before → after) |
|---|---|
| React / react-dom | 19.3.1 (unchanged) |
| react-router | 8.5.1 (unchanged) |
| Vite / @vitejs/plugin-react | 7.3.8 / 4.7.0 (unchanged) |
| TypeScript | 5.9.3 strict (unchanged) |
| Redux Toolkit / react-redux | 2.14.0 / 9.3.1 (unchanged) |
| TanStack Query | 5.107.1 (unchanged) |
| Express / Mongoose (API) | 5.2.1 / 9.1.3 (unchanged) |
| google-auth-library | NEW `^11.3.3` (3a, server-side Google ID-token verification) |
| Stripe | 18.5.0 (unchanged; webhook verification now used, 3b) |
| Vitest / Testing Library / MSW | 5.1.0 / 16.3.3 / 2.15.0 (unchanged) |
| @playwright/test | NEW `^1.65.0` (3c, web devDep; Chromium Headless Shell 158.0.8127.18) |
| ESLint | 10.14.0 (unchanged; web now has its own flat config, 3c) |
| eslint-plugin-react / eslint-plugin-react-hooks / typescript-eslint | NEW in `@acube/config` (3c: `^7.37.5` / `^5.2.0` / `^8.72.1`) |
| @acube/shared | plain JS → real TS build with `.d.ts` (3c) |

## 1. What changed — Phase 3a: auth + OTP (commits `5662641`, `f913325`, `6be8184`)

Full detail: `apps/api/PHASE3A_NOTES.md`.

- **JWT rename (coordinated breaking change): `JWT_SECERT` → `JWT_SECRET`.**
  Renamed in `Controllers/Auth.js`, `middleware/auth.js`, API tests, `.env.example`.
  No fallback to the old spelling — a deployment still setting `JWT_SECERT` will
  sign/verify with `undefined` and fail. **Update the server env on deploy.**
  Tokens issued before the rename keep verifying as long as the secret value
  itself is unchanged.
- **Google login: server-side ID-token verification.** New
  `apps/api/utils/googleAuth.js` (`verifyGoogleIdToken`, audience =
  `GOOGLE_CLIENT_ID`, requires `email_verified === true`, returns only
  `{ email, name, picture, sub }`). `POST /user/login` accepts a verified Google
  token OR an email with a verified-OTP record; identity comes only from the
  verified token — body email/username/picture are ignored when `idToken` is
  present (tested: spoofed body values do not leak into the created user).
  Forged / missing / expired tokens, and email-only logins with no verified OTP,
  are 401. **There is no bypass flag and no dev escape.** Web: Navbar now uses
  the `<GoogleLogin>` credential flow (`@react-oauth/google`); the old
  `useGoogleLogin` implicit flow (access_token only) plus the client-side
  Google userinfo fetch and the OTP-verifier detour are deleted.
- **OTP: Mongo collection, hashed, expiring, attempt-limited.** New
  `apps/api/Models/Otp.js`: one document per identifier, `otpHash` = SHA-256 hex
  (never plaintext), `attempts`, `expiresAt` (TTL index, 10 min — backstop only;
  every read checks dates in code), `lastSentAt`, `verified` + `verifiedUntil`.
  `generateOTP` uses `crypto.randomInt` (never `Math.random`); senders
  (`sendOTPEmail` / `sendOTPSMS`) now **throw** on failure instead of swallowing
  the error. `SendOtp`: 60 s resend cooldown → 429; a real send failure answers
  500 `OTP_SEND_FAILED` and stores nothing. `VerifyOtp`: wrong code → 400;
  expired → 400; **5th wrong attempt → 429 and the code is invalidated**
  (deleted — even the correct code then fails); correct code → 200 and sets
  `verified=true`, `verifiedUntil = now + 10 min`. An OTP login needs a verified,
  unexpired record, which login **consumes (deletes)** — second use is 401.
- **Tests:** API `auth.test.js` 20 tests (was 15), `otp.test.js` 13 tests (was 8);
  web `authSlice.test.ts` 6 tests (was 4). Full API suite at end of 3a: 84/85, 1
  fail — the smoke test's old expectations (send-otp 200 despite Gmail failure;
  email-only login 200), fixed in 3b by mocking the senders/verifier.

## 2. What changed — Phase 3b: payments + ownership + counters + uploads + pagination (commits `8d1a07b`, `3dce33e`, `11fee63`)

Full detail: `apps/api/PHASE3B_NOTES.md`.

- **Premium is granted ONLY by Stripe now.** Single price: **1000 INR**
  (`PREMIUM_PRICE_INR`, catalogue in `packages/shared`, overridable by env,
  currency INR, product "Acube Premium"). `POST /download/create-payment-request`
  (authed now) takes an **empty body** — buyer is `req.userid`, email from the
  user record, price from the catalogue; a client-supplied `amount` / `_id` /
  `emailId` is stripped by Zod and ignored (tested: sending `amount: 1` still
  creates a 1000-INR session). It **no longer grants premium** — the old
  `isPremium: true` line before the Stripe call is deleted. Already-premium
  users get 409.
- **Webhook — the grant path.** NEW `POST /download/webhook`, registered with
  `express.raw({ type: "application/json" })` **before** `express.json`
  (signature verification needs the exact raw body). Public (Stripe calls it);
  verification is the `stripe-signature` header + `STRIPE_WEBHOOK_SECRET`. Only
  `checkout.session.completed` with `payment_status === "paid"` grants premium.
  **Idempotency:** the event id is claimed with an atomic upsert (`$setOnInsert`,
  `upsertedCount`) in `ProcessedWebhookEvent` BEFORE granting; a duplicate
  delivery is answered 200 `{ duplicate: true }` without granting twice. The
  user is found from `session.metadata.userId`, falling back to
  `session.customer_email`.
- **`handle-payment-status` — verified fallback.** Requires `{ sessionId }`
  (400 without it) and verifies the session with
  `stripe.checkout.sessions.retrieve`; grants premium only when Stripe reports
  the session `paid` AND owned by the caller. A bare call, a forged "success",
  an unpaid session, or someone else's session all return `{ success: false }`
  and grant nothing. Client: `PaymentStatus` reads `?success=1&session_id=…`
  from the return URL and sends `{ sessionId }`; `DownloadVideo` sends an empty
  body on upgrade.
- **Ownership / authorisation.** Auth added to every formerly-open endpoint:
  `PATCH /user/update/:id` (owner only), `PATCH /video/view/:id` (authed),
  `GET /video/getallhistory|getallwatchlater|getalllikevide` (authed, scoped to
  `req.userid`), `GET /chat/group/:groupId/messages` (members only),
  `PUT /chat/chat_message` (sender only), `POST /download/create-payment-request`.
  Owner checks added: channel update, comment edit/delete, message delete,
  history/watch-later/liked delete. Group membership checks on group send + get.
  Mass assignment fixed everywhere: controllers take explicit DTO fields only —
  never `new Model(req.body)`; the author/viewer is always `req.userid`, never a
  body value. **Recorded public-read decisions:** `GET /comment/get` stays public
  (comment list on a video page for logged-out visitors), `GET /video/getvideos`
  stays public (catalogue), `GET /user/getallchannel` stays public (directory),
  login + OTP routes stay public. `PATCH /video/view/:id` being authed means
  **logged-out views are no longer counted** (web skips the call when signed out).
- **Atomic counters + points.** Likes: `PATCH /video/like/:id` takes
  `{ action: "like" | "unlike" }` only; counter moves by pipeline `$inc`
  (+1 / -1, floored at 0 via `$max`); a body like `{ Like: 5 }` is 400. Views:
  one atomic `$inc` (old read-then-`$set` lost increments under concurrency).
  Downloads: one atomic `findOneAndUpdate` — limit check and `$inc` are the same
  operation. **Points rule (replaces `POST /user/update-points`, route deleted):**
  `POST /user/watch-complete { videoid }` awards server-side only — **5 points
  per completed watch, max 10 points per video per day (UTC date)**; audited in
  the `PointsAward` collection, `reputation` moves by `$inc`. No client-supplied
  points value anywhere in the API any more. **Session refresh:** NEW
  `GET /user/me` (authed) returns the current user from the JWT; the channel
  editor calls it after a successful edit instead of re-logging in with an
  email-only body (which 401s since 3a).
- **Upload hardening.** Filenames sanitised — raw `originalname` is never used as
  a stored filename (`<timestamp>-<random-hex>-<sanitised-basename>.mp4`, only
  `[A-Za-z0-9._-]` survive, extension forced to `.mp4`, `path.basename` strips
  directory components). Multer limit **10 MB** (`MAX_UPLOAD_BYTES`); over-limit
  → 400. MIME + size re-checked in the controller. The uploader is the signed-in
  user's username/name/email — never `req.body.uploader`. Filepath is Cloudinary's
  `secure_url`; `duration` / `thumbnail` stored when Cloudinary returns them.
  Cloudinary `resource_type: "video"` (was `"auto"`).
- **Pagination + indexes.** Every list endpoint accepts `?page&limit`
  (`page` 1-based, default 1; `limit` default 20, **clamped to 50**). **Breaking
  response-shape change:** list endpoints now return
  `{ items, page, limit, total, totalPages }` instead of a bare array (affected:
  `getvideos`, `getcomment`, `getallchannel`, `getallhistory`,
  `getallwatchlater`, `getalllikevide`, `GET /chat/group`,
  `GET /chat/message/:id`, `GET /chat/group/:groupId/messages`;
  `POST /chat/chat_user` keeps its keys and adds the pagination fields;
  `GET /download/user/downloads` keeps `downloads` and adds the fields).
  All lists use `.lean()`, sorted by `createdAt` ascending. Messages are now
  queried from the `Message` collection (paginated, chronological) instead of
  `populate`-everything. Indexes added incl. `User.email` (unique),
  history/liked/watch-later unique compound `(videoid, viewer)`,
  `ProcessedWebhookEvent.eventId` (unique), `PointsAward.{userId, videoid, day}`.
  **Deliberate non-do:** `User.username` is NOT unique — it comes from the
  Google display name and two people can share one; a unique index would make
  the second same-name Google login fail. Adds on history/liked/watch-later are
  upserts (re-adding is a no-op).
- **Tests:** API **119/119, 9 files** (was 85); web **40/40, 12 files** (was 37).
  Smoke test now covers 40 endpoints / 31 unauthenticated (was 38 / 22) with
  mocks for the Google verifier, OTP senders and Stripe.

## 3. What changed — Phase 3c: polish + CI + tests + browser verification

### 3c-1. Root test script runs BOTH suites (commit `2297e08`)

- Root `package.json`: `"test": "turbo run test"` (was `pnpm --filter @acube/api
  test` only); added `"license": "MIT"`.
- `turbo.json`: the `test` task now has `"dependsOn": ["^build"]` so
  `@acube/shared` is built first (API + web import its `dist/`).
- `pnpm test` from root now runs API (119) + web (47) and reports both counts.

### 3c-2. Web ESLint flat config (commit `2297e08`)

- New `packages/config/eslint.web.config.mjs` (browser globals,
  `@typescript-eslint/parser`, React + React Hooks rules) exported as
  `./eslint.web`; `apps/web/eslint.config.mjs` imports it. It is NOT a copy of
  the Node-oriented base config.
- Installed into `@acube/config`: `eslint-plugin-react@^7.37.5`,
  `eslint-plugin-react-hooks@^5.2.0`, `typescript-eslint@^8.72.1` (peer warnings
  say they declare ESLint ≤9, but they load and run fine under ESLint 10.14.0).
- Added `eslint@^10.14.0` as a direct web devDep (the `pnpm --filter
  @acube/web lint` binary needs it).
- Fixes needed to reach 0 errors: `globals.vitest` for test files (Vitest
  `globals: true`); `no-undef: off` for `*.ts/*.tsx` only (tsc covers undefined
  names; ESLint's `no-undef` cannot see DOM lib types like `EventListener`
  used in type positions in `player.test.tsx`).
- Result: **`pnpm lint` covers API + web, 0 errors, 9 warnings** — all
  pre-existing legacy unused vars / `exhaustive-deps` in untouched files,
  deliberately left as warnings, not fixed.

### 3c-3. `packages/shared`: real TS build + `.d.ts`, wired into the web client (commit `2297e08`)

- `packages/shared/src/*.js` → `*.ts` (git mv); `tsconfig.json` (extends
  `@acube/config/tsconfig`, `noEmit: false`, `declaration: true`, `outDir:
  dist`, `module`/`moduleResolution: NodeNext`, keeping `./constants.js`
  import specifiers). `package.json`: `main`/`exports`/`types` now point at
  `dist/`; added `build`/`typecheck` scripts and the `@acube/config` devDep.
- Added `z.infer` input types in `schemas.ts`: `SendOtpInput`,
  `VerifyOtpInput`, `LoginInput`, `WatchCompleteInput`, `LikeVideoInput`,
  `CreatePaymentRequestInput`, `HandlePaymentStatusInput`, `UploadVideoBodyInput`,
  `PostCommentInput`, `SendMessageInput`, `CreateGroupInput`,
  `SendGroupMessageInput`, `HistoryEntryInput`.
- `dist/` is COMMITTED deliberately so direct `pnpm --filter … test` runs work
  without a prior build.
- Web wiring: `apps/web/package.json` gained `"@acube/shared": "workspace:*"`;
  `src/Api/index.ts` types `login`/`sendOtp`/`verifyOtp`/`likevideo`/
  `watchComplete`/`handlePaymentStatus`/`createPaymentRequest` from shared types;
  `authSlice.ts` re-exports shared `LoginInput` (local interface deleted) and
  types OTP thunks from shared (normalising `null` → `undefined` before the
  request, since the shared schema takes optional fields only);
  `query/downloads.ts` uses `HandlePaymentStatusInput`; `query/hooks.ts` uses
  `LikeVideoInput["action"]` / `WatchCompleteInput["videoid"]`.
- What could NOT be wired (recorded in `src/types.ts` header):
  `@acube/shared` has no response/model schemas, so `SessionUser` / `Video` /
  `Channel` / `CommentItem` / `VideoListEntry` / `Chat*` / `Group` /
  `PaymentRequestResponse` stay local. `POST /download/download-video` is
  unwired: the API validates it with `emptyBodySchema` and ignores the body,
  so there is no meaningful shared schema for the client's `{ videoId }` field.

### 3c-4. Vite manualChunks vendor split + `.tsx` conversions (commit `61fb688`, fixed in the final 3c commit — see below)

- `apps/web/vite.config.ts`: `manualChunks` splits `react-vendor`
  (react/react-dom/scheduler/react-router + `use-sync-external-store` + process
  shim + global shim), `redux-vendor`, `query-vendor`, `icons-vendor`,
  `socket-vendor`, `misc-vendor`, and `peer-polyfills`. `modulePreload: false`
  (Vite's default preload list would pull the lazy peer chunk into the initial
  load).
- **The split took three attempts — the first two were wrong, and the wrong
  intermediate numbers are corrected here, not hidden:**
  1. A catch-all bucket for "everything else" swallowed every small shared
     library (react-router's `@remix-run/route-pattern` + `cookie-es`,
     `redux-thunk`, the whole crypto-browserify tree behind crypto-js,
     `engine.io-parser`, …), so every initial vendor chunk depended on it and
     Rollup hoisted it into the entry chunk's static imports. The interim claim
     of "initial static total ≈ 558 kB" was therefore **wrong** — the real
     initial load was still ~1.1 MB (proven by a Playwright test asserting the
     peer chunk was NOT requested on Home, which failed, and by a CDP trace
     showing the entry chunk importing it).
  2. Routing the shared deps into their owning families fixed the hoist, but
     exposed a circular chunk warning (`peer-polyfills ↔ misc-vendor`):
     `readable-stream` looks lazy-only, but the crypto tree's `hash-base` /
     `browserify-sign` import it too, and `stream-browserify` (initial, via
     `cipher-base`) imports `readable-stream` + `events`. The fix routes all
     stream/buffer/util helpers to the initial family (`misc-vendor`), so the
     lazy chunk imports the initial chunk, never the reverse.
  3. That still left `misc-vendor` at 578 kB — the crypto-browserify tree
     (~400 kB: elliptic, bn.js, browserify-sign/aes/des/rsa, create-hash/hmac,
     pbkdf2, diffie-hellman, …) was dead weight: crypto-js only ever calls
     `crypto.getRandomValues` (browser) or `crypto.randomBytes` (Node fallback)
     to seed `WordArray.random()`, and in a real browser
     `globalThis.crypto.getRandomValues` always wins. Fixed with a minimal
     shim, `apps/web/src/shims/crypto-shim.ts` (forwards to the Web Crypto API;
     `randomBytes` returns a `Buffer` for the fallback path), wired through the
     plugin's own override mechanism — `nodePolyfills({ overrides: { crypto:
     <shim> } })`. (A plain `resolve.alias` did NOT work: the plugin's own
     alias map wins over a user alias.) Verified: no `elliptic` /
     `crypto-browserify` / `browserify-sign` string anywhere in `dist/`, and the
     OTP encryption round-trip tests still pass.
- Final sizes (§6): **initial load 709.3 kB / gzip 232.1 kB, down from 1,113.73
  kB / gzip 343.34 kB** — a 36% cut. `peer-polyfills` is 71.0 kB and is NOT
  imported by the entry chunk (verified in the built output and by the
  Playwright Home test). No circular-chunk warning.
- `PaymentStatus.jsx` → `.tsx` (no logic change; dropped the unused `React`
  import). `StreamRoom.jsx` → `.tsx` (no logic change; same handlers/socket
  events, same `disabled={!stream && true}` quirks). New
  `apps/web/src/types/peer-shims.d.ts`: minimal `declare module` shims for
  `simple-peer` and `recordrtc` (only members used; signal payloads `unknown`;
  zero `any`). Fixes made during conversion, all verified by typecheck:
  `useContext(RoomContext)` asserted as `{ socket: Socket }` (RoomContext is
  still untyped `.jsx`, value types as `null`; `Socket` type imported from
  `socket.io-client`); `setMe(email ?? "")` for possibly-undefined email; null
  guards in `startScreenShare`/`startRecording`/`stopRecording` (buttons are
  disabled when `!stream`, so unreachable in practice). Grep-verified zero
  `any` in the converted files and the shim.

### 3c-5. `/Likedvideo`, `/Watchhistory`, `/Watchlater` behind RequireAuth (commit `61fb688`)

- `apps/web/src/Allroutes.tsx`: all three routes now wrapped in `RequireAuth`
  (previously rendered a "Plz login" message via `WHLvideolist`), consistent
  with `/Library`, `/chat`, `/Yourvideo`, `/video-stream/*`.
- `apps/web/src/test/authGuard.test.tsx`: +6 tests (`it.each` over the three
  routes: logged-out redirects to Home showing "Python Basics Tutorial" and no
  `Your <page> Shown Here`; signed-in renders the header). Web suite went
  40 → 46 at this point.

### 3c-6. jest-dom matchers under Vitest 5 — FIXED via the `/vitest` entry point (commit `5347dc0`)

- Root cause (Phase 2): the plain `@testing-library/jest-dom` import's
  augmentation targets `Assertion` in module `vitest`, which Vitest 5 declares
  in an internal chunk. **Fix: jest-dom 6.9.1's `/vitest` entry point** — runtime
  `import "@testing-library/jest-dom/vitest"` in `src/setupTests.js` (extends
  expect) + type import in new `src/test/jest-dom.d.ts`. Probe test passed
  typecheck AND runtime first try.
- All DOM assertions migrated consistently by hand (an early regex attempt
  inverted polarity and mangled multiline expects; all test files were reverted
  with `git checkout` and redone with exact edits): `toBeInTheDocument` /
  `not.toBeInTheDocument`, `toHaveValue` (chat input-cleared), `toHaveTextContent`
  (upload alert). Non-DOM assertions (store state, captured request bodies) stay
  Vitest built-ins — no jest-dom equivalent; the 7 remaining `toBeNull()`s are
  all store-state assertions in `authSlice.test.ts` (6) and `otp.test.tsx` (1).
- New `src/test/jestDom.test.tsx` pins the fix (1 test). Web suite: **47/47, 13
  files**; typecheck clean.

### 3c-7. Chat encryption honesty (commit `68e2b1f`)

- `apps/web/src/Component/chat/No_Chat_main.tsx`: `<h4>End-to-End
  Encripted</h4>` → `<h4>TLS + server-side encryption at rest, NOT
  end-to-end</h4>` plus an explanatory comment.
- `apps/api/Controllers/message.controller.js`: header comment only (no logic
  change) stating messages are AES with one shared server-side key
  (`SECRETKEY_CRYPTO`), i.e. TLS + server-side encryption at rest, NOT
  end-to-end.
- Root `README.md` states the same in its security model and env table.
- Grep after the fix (excluding historical `PHASE*_NOTES.md` /
  `PHASE*_REPORT.md` / `PHASE0_BASELINE.md`, `.turbo`, lockfile): every
  remaining "end-to-end" mention is a negation ("NOT end-to-end") or the
  unrelated Playwright "E2E smoke tests" label. `apps/api/.env.example:42` was
  already honest. `toEncrypt.js` / `vite-env.d.ts` already describe the room-ID
  key as obfuscation only.

### 3c-8. README rewrite + LICENSE (commit `68e2b1f`)

- New root `README.md`: features, text architecture diagram (web:3000 →
  API:5000 → MongoDB/Cloudinary/Stripe/Twilio/Gmail + Socket.IO), setup, full
  env tables (**API 17 vars**, **web 3 vars** — placeholders only), scripts
  table, security model (Google verification, OTP, webhook-only premium,
  ownership, chat NOT E2E), test instructions, screenshot placeholders
  (`docs/screenshots/*.png` marked "to add", **no invented screenshots**),
  known limitations, links to all phase reports.
- `LICENSE` added: MIT, Copyright (c) 2026 Arman Alam. Root `package.json` had
  no licence field (now MIT); `packages/shared/package.json` is MIT;
  `apps/api/package.json` still carries pre-existing `ISC` (left alone).
- `apps/web/README.md`: first paragraph updated (was stale — now notes store /
  query / API / most pages + StreamRoom/PaymentStatus are TS, and lists the
  remaining `.jsx` files: `RoomContext`, `LoadingCard`, `Drawersliderbar`,
  `Leftsidebar`, `Showvideo`, `ProgressRing`, `Searchlist`, `CreateButton`,
  utils).

### 3c-9. CI (commit `68e2b1f`)

- `.github/workflows/ci.yml` (YAML parsed OK, 8 steps): on PR + push to
  `feat/acube-professional-rebuild`; `pnpm/action-setup@v4` (12.18.0) →
  `actions/setup-node@v4` (Node 22, pnpm cache) → `pnpm install
  --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm
  build`. **Not claimed verified live** — it runs on GitHub, not locally.

### 3c-10. Web proxy — verified gone (no fix needed)

- Grep: no `"proxy"` field in `apps/web/package.json`, no relative `/api`
  calls; all API calls go through absolute `VITE_BACKEND_URL` (documented in
  `vite.config.ts` and `src/Api/index.ts`).

### 3c-11. Playwright smoke tests + runtime verification (final 3c commit)

- Installed `@playwright/test@^1.65.0` (web devDep); Chromium Headless Shell
  158.0.8127.18 downloaded to `~/.cache/ms-playwright/`.
- `apps/api/e2e-server.mjs` (NEW, test infrastructure): boots the real API on
  :5000 against `mongodb-memory-server`, seeds one video (`_id
  507f1f77bcf86cd799439011`, title "E2E Smoke Video", `filepath
  /videos/e2e-smoke.mp4` — intentionally unplayable), dummy env values only;
  sets `FRONTEND_URL=http://localhost:4173` (preview origin must be
  CORS-allowed or API calls get 403). Graceful shutdown on SIGTERM/SIGINT.
- `apps/web/playwright.config.ts` (NEW): `testDir ./e2e`, 1 worker, `baseURL
  http://localhost:4173`, webServer array: `node ../api/e2e-server.mjs` (waits
  on `http://localhost:5000/health`) + `pnpm preview --port 4173 --strictPort`.
- `apps/web/e2e/smoke.spec.ts` (NEW, 6 tests): Home feed renders seeded video
  (+ asserts peer-polyfills NOT requested); search via navbar search box
  (placeholder "Search", click `.searchIcon_SearchBar`, expect URL
  `/search/E2E%20Smoke`); video page renders controls + play toggles
  (`.video-container video`, `.play-pause-btn`, `.play-icon` → `.pause-icon`,
  zero `pageerror`s); auth guard `/Library` → `/` redirect; search route loads
  lazy `Search-*.js` chunk; StreamRoom loads `peer-polyfills-*.js` on demand
  with a seeded `localStorage` "Profile" (fake session; `encryptData2`
  replicated in-test with `crypto-js` and key `e2e-test-key`).
- `apps/web/package.json`: `"test:e2e": "VITE_BACKEND_URL=http://localhost:5000
  VITE_CLIENT_ID=e2e-test.apps.googleusercontent.com
  VITE_ENCRYPTED_KEY=e2e-test-key vite build && playwright test"`.
  `playwright.config.ts` added to `tsconfig.node.json` include.
- **First run: 3 passed, 3 failed** (26.0s). The three failures drove real
  fixes (not test-only workarounds):
  1. **Home feed test** — `peer-polyfills` WAS requested on Home. Root cause:
     the catch-all manualChunks bucket (§3c-4, attempt 1). Fixed by the
     allow-list routing (§3c-4, attempt 2/3).
  2. **Video page test** — `pageErrors = ["NotSupportedError: The element has
     no supported sources."]`: `handlePlay` in `videoPlayer.tsx:79-86` called
     `videoRef.current?.play()` with no `.catch()`; the unplayable seeded src
     rejected unhandled. **Fix (minimal, justified):**
     `videoRef.current?.play()?.catch(() => undefined);` with a comment.
     Toggle behaviour unchanged — the test asserts the button flips to the
     pause icon.
  3. **StreamRoom test** — `.video_stream_container` not found; `PAGEERROR:
     InvalidTokenError: Invalid token specified: missing part #2` —
     `jwt-decode` (used in `Navbar.tsx`) throws on a bare fake token string.
     **Fix (test-only):** the seeded token is now a structurally valid
     (unsigned, dummy) JWT — header `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9`,
     payload `{"sub":"e2e","name":"E2E User","exp":9999999999}`, signature
     `e2e-fake-signature`. `jwt-decode` only decodes, it does not verify.
     The peer chunk DID load (waitForResponse resolved), so the route had
     rendered then crashed to a blank page.
- **Final run: 6/6 passed (13.2s).**
- Vitest config fix found while re-running the suites: Vitest's default include
  (`**/*.spec.ts`) picked up `e2e/smoke.spec.ts` and failed on
  `test.describe()`. Fixed in `apps/web/vitest.config.ts`:
  `include: ["src/**/*.test.{ts,tsx,js,jsx}"]` — Playwright specs run only via
  `pnpm test:e2e`.
- Scratch debug file `apps/web/e2e-debug.mjs` (CDP network tracing used to prove
  the hoist) was deleted before committing; `test-results/` +
  `playwright-report/` removed (untracked build artifacts).

## 4. Security model (all of Phase 3)

- **Auth:** Google ID tokens verified server-side (`google-auth-library`,
  audience `GOOGLE_CLIENT_ID`, `email_verified` required); no bypass flag, no
  dev escape. JWT secret renamed `JWT_SECRET` (old `JWT_SECERT` has no
  fallback). OTP codes are SHA-256-hashed in Mongo, 10-min TTL, 60 s resend
  cooldown, 5 wrong attempts → 429 + invalidation; a verified OTP record is
  consumed (deleted) by login.
- **Payments:** premium granted ONLY by the Stripe webhook
  (`checkout.session.completed` + `payment_status === "paid"`, signature
  verified with `STRIPE_WEBHOOK_SECRET`, idempotent event-claim upsert) or by
  the verified `handle-payment-status` fallback (session retrieved from Stripe
  and ownership-checked). The client never sends an amount; the price comes
  from the server catalogue (1000 INR, **not confirmed by Arman**).
- **Authorisation:** every formerly-open endpoint is authed and/or owner- or
  member-scoped (§2). Controllers take explicit DTO fields only; the
  author/viewer is always `req.userid`. Public reads are deliberate and
  recorded: video catalogue, comment list, channel directory, login/OTP routes.
- **Counters/points:** `$inc` pipeline updates (likes floored at 0); points
  awarded server-side only (5/watch, max 10/video/day); no client-supplied
  points value anywhere.
- **Uploads:** sanitised filenames, 10 MB limit, MIME + size re-checked,
  uploader from JWT, Cloudinary `resource_type: "video"`.
- **Chat:** messages are AES with **one shared server-side key**
  (`SECRETKEY_CRYPTO`) — **TLS + server-side encryption at rest, NOT
  end-to-end**. The old "End-to-End Encripted" UI claim is removed (§3c-7).
- **Pagination:** `limit` clamped to 50; list responses are
  `{ items, page, limit, total, totalPages }`.

## 5. Tests — exact counts (final verification, 10 Nov 2026)

| Suite | Command | Result |
|---|---|---|
| API unit/integration | `pnpm --filter @acube/api test` | **119 passed, 9 files** |
| Web unit | `pnpm --filter @acube/web test` | **47 passed, 13 files** |
| Root (both via Turbo) | `pnpm test` | **API 119 + web 47, all passed** |
| Playwright smoke | `pnpm --filter @acube/web test:e2e` | **6 passed (13.2s)** |
| Lint | `pnpm lint` | **0 errors, 9 warnings** (pre-existing legacy) |
| Typecheck | `pnpm typecheck` | **3 tasks successful** (API + web + shared) |
| Build | `pnpm build` | **exit 0** (no circular-chunk warning) |
| Install | `pnpm install --frozen-lockfile` | **exit 0** |

Web test files (13, 47 tests total): `search`, `home`, `otp`, `likeSave`,
`upload`, `chat`, `player`, `authGuard` (8 — 2 original + 6 for the WHL
routes), `download`, `paymentStatus`, `authSlice`, `videosQuery`, `jestDom`.
API test files (9, 119 tests total): auth (20), otp (13), download (incl.
webhook/forgery), smoke (40 endpoints), plus likes/views/upload/pagination/
ownership coverage — see `apps/api/PHASE3B_NOTES.md` §7.

## 6. Bundle — before / after

Measured from `pnpm build` output (Vite's decimal kB). "Initial load" = the
entry chunk + every chunk it statically imports.

| | Before (Phase 2) | After (Phase 3c) |
|---|---|---|
| Entry chunk (`index-*.js`) | 1,113.73 kB (everything in one chunk) | 33.9 kB |
| react-vendor | — | 262.6 kB |
| misc-vendor (axios, crypto-js, date-fns, jwt-decode, @react-oauth, stream/buffer/util helpers) | — | 279.7 kB |
| socket-vendor | — | 47.9 kB |
| query-vendor | — | 36.8 kB |
| redux-vendor | — | 24.6 kB |
| icons-vendor | — | 23.8 kB |
| **Initial load total** | **1,113.73 kB / gzip 343.34 kB** | **709.3 kB / gzip 232.1 kB** |
| peer-polyfills (lazy, StreamRoom only) | — (was inside the initial chunk) | 71.0 kB / gzip 20.7 kB, NOT in the initial load |

A 36% cut. The remaining bulk is react-vendor (262.6 kB, React + React DOM +
React Router — not reducible without a framework change) and misc-vendor
(279.7 kB, dominated by crypto-js ~110 kB, the buffer/stream shims and
readable-stream). Further cuts would need replacing crypto-js or simple-peer —
out of scope; recorded here, not attempted.

**Correction to an interim claim:** an early 3c note reported "initial static
total ≈ 558 kB". That was wrong — the catch-all chunk was being hoisted into
the entry's static imports, so the real initial load was still ~1.1 MB. The
709.3 kB figure above is verified three ways: the built entry chunk contains no
`peer-polyfills` import, the Playwright Home test asserts the peer chunk is not
requested, and the file sizes were summed from `dist/assets`.

## 7. Browser / runtime verification — what was actually run

No live browser was operated by the 3c worker (generic subagent constraint).
What ran instead, headless, against real servers:

- **Playwright 6/6** (`pnpm --filter @acube/web test:e2e`, Chromium Headless
  Shell 158.0.8127.18): the real API booted on :5000 against
  `mongodb-memory-server` with one seeded video, and the real web app served
  from `vite preview` on :4173. Covers: Home feed renders the seeded video,
  search navigation via the navbar, video-page playback controls + play toggle
  with zero `pageerror`s, auth-guard redirect for `/Library` when logged out,
  lazy Search chunk loading, StreamRoom loading the peer chunk on demand.
- **Curl / HTTP checks** (same servers, started manually): API
  `GET /health` → **200** `{"status":"ok","db":"connected","uptime":10}`; web
  `GET /` → **200**, `GET /search/E2E` → **200**, `GET
  /videopage/507f1f77bcf86cd799439011` → **200** (SPA fallback serves
  `index.html`); API `GET /video/getvideos?page=1&limit=10` → **200** with the
  seeded video in the `{ items, page, limit, total, totalPages }` envelope;
  `GET /video/getvideos?...&search=E2E` → **200**. (An early guessed path
  `/video/allvideo` returned 404 — that route does not exist; the real feed
  route is `/video/getvideos`.)
- Console noise observed during the Playwright run (not failures): 404 for
  `/videos/e2e-smoke.mp4` (expected — the seeded filepath is intentionally
  unplayable) and `net::ERR_TUNNEL_CONNECTION_FAILED` ×2 (Google GSI script +
  one other external request blocked in this sandbox — the app still works).

### What could NOT be verified without a live browser / real credentials

- Real Google sign-in (needs a real `GOOGLE_CLIENT_ID` + `VITE_CLIENT_ID` and
  a Google account; tests mock the verifier).
- Live Stripe Checkout redirect + webhook against a real Stripe account
  (tests mock Stripe; the webhook secret is a placeholder).
- Real Cloudinary upload (tests do not upload; upload hardening is
  code-reviewed + unit-tested against mocks).
- Actual video playback with sound (the seeded e2e video is an unplayable
  filepath; the test asserts controls render and the play toggle flips, not
  that frames/sound play).
- Real OTP delivery via Gmail/Twilio (tests mock the senders).
- CI running on GitHub (config is YAML-valid and mirrors the local commands,
  but no PR has run it yet).
- A live-browser click-through of the whole app (Home → search → video page →
  Library/WHL → chat → StreamRoom → upload → premium upgrade) with a real
  session. **This is the recommended next step for the parent agent to arrange
  with a browser-capable agent.**

## 8. How to run + env vars Arman must supply live

Setup (from the rewritten root `README.md`):

```bash
pnpm install --frozen-lockfile
pnpm build        # builds @acube/shared first (Turbo dependsOn)
pnpm test         # API 119 + web 47
pnpm --filter @acube/web test:e2e   # Playwright 6, needs Chromium (`playwright install chromium`)
pnpm lint         # API + web, 0 errors
pnpm typecheck    # API + web + shared
pnpm dev          # API :5000 + web :3000 (see README)
```

Env vars (placeholders only in `.env.example` files — no real secrets in the
repo):

| Var | Where | Arman must supply |
|---|---|---|
| `GOOGLE_CLIENT_ID` | API + web (`VITE_CLIENT_ID`) | Real value from Google Cloud Console. Without it, Google login always 401s (server) / the button cannot initialise (client). |
| `STRIPE_WEBHOOK_SECRET` | API | From Stripe Dashboard → Developers → Webhooks → the endpoint's signing secret. Without it the webhook 500s and premium is never granted. |
| `STRIPE_SK` | API | Real Stripe secret key (test or live). |
| `DB_URL` | API | Real MongoDB connection string. |
| `JWT_SECRET` | API | New name — the old `JWT_SECERT` no longer works. Any value; keep it secret. |
| `PREMIUM_PRICE_INR` | API (optional, default 1000) | **Confirm 1000 INR is the intended price** — it is the value the old client sent before the client amount was removed. Change the price here, never in client code. |
| `CLOUDINARY_*`, `ACCOUNT_SID`, `ACCOUNT_TOKEN`, `TWILIO_NUMBER`, `STP_USER`, `STP_PASSWORD`, `SECRETKEY_CRYPTO`, `FRONTEND_URL`, `PORT` | API | Real service credentials / deployment values (see `apps/api/.env.example`). |
| `VITE_BACKEND_URL`, `VITE_ENCRYPTED_KEY` | web | API base URL + the room-ID obfuscation key (see `apps/web/.env.example`). |

## 9. Still outstanding

Carried from 3b notes (unchanged):

- **Infinite scroll page-1-only:** the web client fetches only the first page
  of 50 for every list — lists longer than 50 rows are truncated to the first
  page until true infinite scroll / "load more" is built.
- **Watch-complete concurrency race:** two concurrent completions can race the
  cap check by one 5-point award — the cap is a fairness limit, not a billing
  boundary.
- **Daily download reset on login only**, not at midnight — pre-existing,
  unchanged.
- **Unique-index build against production data not runtime-checked:** if the
  production `users` collection holds duplicate emails, or history/liked/
  watch-later hold duplicate `(videoid, viewer)` rows, the unique-index builds
  fail (app keeps running, index absent). Dedupe first — see the migration note
  in `apps/api/PHASE3B_NOTES.md` §5.

New 3c items:

- **Stale comment in `apps/api/app.js:26`** saying "CRA on 3000, Vite on 5173"
  — left untouched deliberately (out of 3c scope; the web dev server is :3000).
- **`apps/api/package.json` licence is `ISC`** vs the repo MIT (`LICENSE` added
  at root; `packages/shared` is MIT). Left alone — a one-line change for the
  owner.
- **CI not verified live** — `.github/workflows/ci.yml` runs on GitHub, not
  locally; the first PR on this branch is the first live run.
- **Remaining `.jsx` files in the web app** (unconverted, working):
  `RoomContext`, `LoadingCard`, `Drawersliderbar`, `Leftsidebar`, `Showvideo`,
  `ProgressRing`, `Searchlist`, `CreateButton`, utils. Converting them is
  optional polish, not required.
- **Web lint: 9 warnings** in untouched legacy files (unused vars,
  `exhaustive-deps`). Warnings, not errors; fixing them is optional.
- **What could NOT be wired from `@acube/shared`** (§3c-3): response/model
  schemas don't exist in shared, so `SessionUser` / `Video` / `Channel` /
  `CommentItem` / `VideoListEntry` / `Chat*` / `Group` /
  `PaymentRequestResponse` stay local in `src/types.ts`; `POST
  /download/download-video` has no meaningful shared schema (API ignores the
  body).
- **Live-browser click-through still to do** (§7) — the recommended next step.
