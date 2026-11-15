> **Note (13 Nov 2026): chat + video calls were removed from the app** — the
> chat endpoints, controllers, models and the Socket.IO signalling server
> described below are historical; they no longer exist. The
> `conversations` / `messages` / `groups` collections are orphaned in
> existing databases (dropping them is an ops decision, not code).

# Phase 3b Notes — Payments + Ownership + Counters + Uploads + Pagination (10 Nov 2026)

Branch: `feat/acube-professional-rebuild`. No push, no merge, main untouched.
Scope: Stripe webhook-only premium, ownership/authorisation, atomic
counters, server-ruled points, upload hardening, pagination + indexes.
Phase 3a (JWT rename, Google verification, Mongo OTP) untouched except
where this phase consumes it. Polish / CI / README are 3c — untouched.

## 1. Payments — premium is granted ONLY by Stripe now

### Price catalogue
- Single premium price: **1000 INR** (`PREMIUM_PRICE_INR` in
  `packages/shared/src/constants.js`, overridable by the
  `PREMIUM_PRICE_INR` env var, currency `INR`, product "Acube Premium").
  Arman must confirm the price — 1000 is the value the old client sent
  before this phase removed the client amount entirely.
- `POST /download/create-payment-request` (authed now) takes an **empty
  body**. The buyer is `req.userid`, the email comes from the user
  record, the price comes from the catalogue. A client-supplied
  `amount` / `_id` / `emailId` is stripped by Zod and ignored (tested:
  sending `amount: 1` still creates a 1000-INR session). It returns
  `{ success, payment_request, sessionId, amount, currency }` and
  stores the session id on the user (`stripeCheckoutSessionId`). It
  **no longer grants premium** — the old `isPremium: true` line before
  the Stripe call is deleted. Already-premium users get 409.

### Webhook — the grant path
- NEW `POST /download/webhook`, registered in `app.js` with
  `express.raw({ type: "application/json" })` **before** `express.json`
  (Stripe signature verification needs the exact raw body). It is
  public (Stripe calls it); verification is the `stripe-signature`
  header + `STRIPE_WEBHOOK_SECRET`.
- Only `checkout.session.completed` with `payment_status === "paid"`
  grants premium. Other event types are acknowledged and ignored.
- **Idempotency:** the event id is claimed with an atomic upsert
  (`$setOnInsert`, `upsertedCount`) in `ProcessedWebhookEvent` BEFORE
  granting. A duplicate delivery is answered 200 `{ duplicate: true }`
  without granting twice. The unique index on `eventId` is a backstop,
  not the mechanism (index builds are async — a duplicate arriving
  before the index exists must still be caught; the upsert does that).
- The user is found from `session.metadata.userId`, falling back to
  `session.customer_email`.
- Env: `STRIPE_WEBHOOK_SECRET` (new in `.env.example`, placeholder
  only). **Arman must supply the real value from the Stripe Dashboard
  → Developers → Webhooks → signing secret.** Without it the webhook
  answers 500 and premium is never granted by webhook.

### handle-payment-status — verified fallback
- `POST /download/handle-payment-status` now requires
  `{ sessionId }` (400 without it) and verifies the session with
  `stripe.checkout.sessions.retrieve`. It grants premium only when
  Stripe reports the session `paid` AND owned by the caller
  (`metadata.userId === req.userid` or `customer_email === user.email`).
  A bare call, a forged "success", an unpaid session, or someone
  else's session all return `{ success: false }` and grant nothing.
  The webhook remains the primary grant path; this is the fallback for
  a return from Checkout before the webhook lands.
- Client: `PaymentStatus.jsx` now reads `?success=1&session_id=…` from
  the return URL (the Checkout `success_url` embeds
  `{CHECKOUT_SESSION_ID}`) and sends `{ sessionId }`. A `?success=1`
  with no session id never calls the API. `DownloadVideo.tsx` sends an
  empty body on upgrade (no amount/id/email).

### Tests
Stripe is mocked in `tests/download.test.js` (mock class with
`checkout.sessions.create/retrieve` + `webhooks.constructEvent`;
`constructEvent` accepts only the `"valid-sig"` test signature).
No real Stripe calls anywhere in tests. Forged-payment tests:
forged handle-payment-status → no premium; bad-signature webhook →
400 / no premium; duplicate webhook event → premium granted once.

## 2. Ownership / authorisation

Auth was added to every formerly-open endpoint found by reading
`Routes/*` (the audit's 9, verified against the route files):

| Endpoint | Now |
|---|---|
| `PATCH /user/update/:id` | authed + owner only (403 otherwise) |
| `PATCH /video/view/:id` | authed (see note below) |
| `GET /video/getallhistory`, `getallwatchlater`, `getalllikevide` | authed + scoped to `req.userid` |
| `GET /comment/get` | **stays public — recorded decision, see §2.1** |
| `GET /chat/group/:groupId/messages` | REMOVED with chat (see note above) |
| `PUT /chat/chat_message` | REMOVED with chat (see note above) |
| `POST /download/create-payment-request` | authed |

Owner checks added: channel update, comment edit/delete,
history/watch-later/liked delete (`viewer`/`userid` param must equal
`req.userid`, else 403). (Chat message/group checks described here
were removed with chat — see note above.)

Mass assignment fixed everywhere: controllers take explicit DTO
fields only — never `new Model(req.body)`. The author/viewer is
always `req.userid`, never a body value (tested: posting a comment or
history row with a forged `userid`/`viewer` records the caller).
`send_Groupusers` builds a fresh deduped members array instead of
pushing onto the request-body array.

### 2.1 Public-read decisions (recorded)
- `GET /comment/get` stays **public by design**: the comment list is
  shown on a video page to logged-out visitors. It is paginated now
  and accepts an optional `?videoid=` filter.
- `GET /video/getvideos` stays public (the video catalogue).
- `GET /user/getallchannel` stays public (the channel directory).
- `POST /user/login` and the OTP routes stay public by design (3a).
- `PATCH /video/view/:id` was authed as instructed. Behaviour change:
  **logged-out views are no longer counted.** The web client skips
  the view call when signed out (`useViewVideo`) instead of firing a
  request that 401s.

## 3. Atomic counters + points

- **Likes:** `PATCH /video/like/:id` takes `{ action: "like" |
  "unlike" }` only. The counter moves by a pipeline `$inc` (+1 / -1,
  floored at 0 via `$max`). A body like `{ Like: 5 }` is **400**
  (absolute counts are rejected, not ignored). Mongoose 9 needs
  `updatePipeline: true` for pipeline updates — found by testing.
  Web: `Likewatchlatersavebtns` sends the toggle; the optimistic
  cache patch is ±1.
- **Views:** `PATCH /video/view/:id` is now one atomic `$inc`
  (the old read-then-`$set` lost increments under concurrency).
- **Downloads:** `POST /download/download-video` is one atomic
  `findOneAndUpdate` — the limit check and the `$inc` are the same
  operation, so two concurrent downloads cannot both pass the free
  limit. (The daily reset still happens on login, as before.)
- **Points rule (replaces `POST /user/update-points`, route deleted):**
  `POST /user/watch-complete { videoid }` awards points server-side
  only — **5 points per completed watch, max 10 points per video per
  day (UTC date)**. The video must exist (404 otherwise). Awards are
  audited in the new `PointsAward` collection (one row per award) and
  `reputation` moves by `$inc`. There is no client-supplied points
  value anywhere in the API any more. The web player calls it on video
  end with just the video id (`Videopage` now passes `videoid` to
  `VideoPlayer`). Known limitation: two concurrent completions can race
  the cap check by one 5-point award — the cap is a fairness limit,
  not a billing boundary.
- **Session refresh (fixes the 3a Createeditchannel issue):**
  NEW `GET /user/me` (authed) returns `{ result: <current user> }`
  from the JWT. The channel editor now calls `refreshSessionThunk()`
  after a successful edit instead of re-logging in with an email-only
  body 5 s later (which 401s since 3a). No new token is issued — the
  existing JWT stays valid until expiry; the stored token is kept and
  the fresh user record is swapped in. A failed refresh leaves the
  existing session untouched.

## 4. Upload hardening

- `Helper/filehelper.js`: filenames are sanitised — the raw
  `originalname` is never used as a stored filename. Stored name is
  `<timestamp>-<random-hex>-<sanitised-basename>.mp4` (only
  `[A-Za-z0-9._-]` survive, extension forced to `.mp4`,
  `path.basename` strips directory components — no path traversal).
  Multer limit: **10 MB** (`MAX_UPLOAD_BYTES`); over-limit files are
  rejected with a Multer `LIMIT_FILE_SIZE` error, mapped to 400 by the
  central error handler.
- `Controllers/video.js`: MIME + size are re-checked in the controller
  (defence in depth behind multer's filter/limit). The uploader is the
  signed-in user's username/name/email — **never** `req.body.uploader`.
  The stored filename is multer's sanitised name. The filepath is
  Cloudinary's `secure_url` (falling back to `url`), and `duration` /
  `thumbnail` are stored when Cloudinary returns them (new model
  fields on `Videofiles`).
- `cloudinary.js`: `resource_type: "video"` (was `"auto"`); temp-file
  cleanup no longer throws if the file is already gone.

## 5. Pagination + indexes + model hygiene

### Pagination
- Every list endpoint accepts `?page&limit` (`validateQuery` +
  `paginationQuerySchema`). `page` is 1-based (default 1), `limit`
  defaults to 20 and is **clamped** to 50 (a request for `limit=500`
  gets 50, not a 400). Parsed values land on `req.pagination` (not
  `req.query` — Express 5 exposes `req.query` through a getter).
- **Response shape change (breaking, recorded):** list endpoints now
  return `{ items, page, limit, total, totalPages }` instead of a bare
  array. Affected: `getvideos`, `getcomment`, `getallchannel`,
  `getallhistory`, `getallwatchlater`, `getalllikevide`,
  `GET /download/user/downloads` keeps the `downloads` key and adds
  the pagination fields alongside it. All lists use `.lean()` and are
  sorted by `createdAt` ascending (insertion order, as before).
- Web hooks unwrap `items` (with a bare-array fallback) and fetch the
  first page of 50. True infinite scroll is a follow-up, not done
  here: lists longer than 50 rows are truncated to the first page in
  the client until then.

### Indexes
- `videofile.createdAt`, `comment.{videoid, commentedon}`,
  `history` / `likedvideo` / `watchlater` unique compound
  `(videoid, viewer)`, `User.email` (unique),
  `ProcessedWebhookEvent.eventId`
  (unique) + `sessionId`, `PointsAward.{userId, videoid, day}`.
- Adds on history/liked/watch-later are upserts, so re-adding is a
  no-op instead of a duplicate row (enforced by the unique indexes).
- `require` → `required` fixed in the models touched (Auth, history,
  likevideo, watchlater).

### Deliberate non-do: User.username is NOT unique
The task asked for unique indexes on `User.email` **and** `username`.
Only `email` got one. `username` comes from the Google display name,
and two different people can share a display name — a unique index
would make the second same-name Google login fail at user creation.
`username` is left non-unique; identity is the email.

### Migration note — User.email unique index
If the production `users` collection already holds duplicate emails,
the unique-index build fails (Mongoose logs the error; the app keeps
running but the index is absent). Resolve by hand before relying on
it: find duplicates with
`db.users.aggregate([{ $group: { _id: "$email", n: { $sum: 1 } } },
{ $match: { n: { $gt: 1 } } }])`, merge or rename the duplicate
accounts, then let the index build. **No data is dropped by this
phase.** The same applies to the `(videoid, viewer)` unique indexes
if the production history/liked/watch-later collections already hold
duplicate rows — dedupe first (keep the earliest row per pair).

### Not done here
- No new E2E claims were added (the full honesty pass is 3c's job).
  (The chat-encryption note is obsolete — chat was removed, see note
  at the top.)
- `Controllers/Auth.js` `login` untouched (3a owns it); only
  `updatePoints` was replaced and `getMe` / `watchComplete` added.
- `middleware/auth.js`, `utils/googleAuth.js`, `Models/Otp.js`,
  `Controllers/OtpAuth.js` untouched. `packages/shared` gained only
  the new constants/schemas.

## 6. Env vars (Arman must supply)

- `STRIPE_WEBHOOK_SECRET` — from Stripe Dashboard → Developers →
  Webhooks → the endpoint's signing secret. Without it the webhook
  500s and premium is never granted by webhook.
- `PREMIUM_PRICE_INR` — optional, default 1000. Change the price here,
  never in client code. Arman must confirm 1000 INR is the intended
  price.

## 7. Tests

- API: **119 / 119 pass, 9 files** (was 85). New coverage: webhook
  grant / bad signature / duplicate event / unpaid / non-checkout
  event; forged + unpaid handle-payment-status; catalogue price beats
  client amount; like toggle + floor at 0 + absolute-count 400;
  view $inc + auth; upload stores `secure_url`/duration/thumbnail +
  uploader from JWT + sanitised filename; comment/message/channel/
  history 403s; scoped lists; watch-complete cap (10/video/day, per
  video); `GET /user/me`; pagination (page 2 ≠ page 1, limit clamped
  to 50); smoke test now covers **40 endpoints / 31 unauthenticated**
  (was 38 / 22) with mocks for the Google verifier, OTP senders and
  Stripe — this fixes the 1 failure 3a left behind.
- Web: **40 / 40 pass, 12 files** (was 37). Updated: like toggle
  (`{ action }`), payment status via `session_id`, upgrade sends an
  empty body, session refresh without re-login.
- `pnpm build`, `pnpm typecheck`, `pnpm lint` all green.

## 8. Known remaining issues / 3c TODOs (not fixed here)

- The web client fetches only the first page of 50 for every list —
  true infinite scroll / "load more" is still open.
- `POST /user/watch-complete` cap check has a small race (see §3).
- The daily download reset still happens only on login, not at
  midnight — pre-existing, unchanged.
- No real-browser verification (video playback, Google sign-in,
  Stripe Checkout redirect, webhook against a real Stripe account).
- No runtime check that the `User.email` / `(videoid, viewer)` unique
  indexes build cleanly against production data (see migration note).
