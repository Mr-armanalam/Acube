# Phase 3a Notes — Auth + OTP (10 Nov 2026)

Branch: `feat/acube-professional-rebuild`. No push, no merge, main untouched.
Scope: JWT rename, Google ID-token verification, Mongo OTP store. Payments /
ownership / pagination / README / CI are 3b / 3c — untouched.

## 1. JWT rename: `JWT_SECERT` → `JWT_SECRET` (coordinated breaking change)

Renamed everywhere in scope: `apps/api/Controllers/Auth.js` (both `jwt.sign`
calls), `apps/api/middleware/auth.js`, `apps/api/tests/setup.js`,
`apps/api/tests/helpers.js`, `apps/api/.env.example`. No fallback to the old
spelling: any deployment still setting `JWT_SECERT` will sign/verify with
`undefined` and fail — **update the server env to `JWT_SECRET` on deploy**.
The only remaining `JWT_SECERT` string in the repo is this sentence and the
historical Phase 0/1/2 reports (not edited). Tokens issued before the rename
were signed with the same secret value under the old variable name, so they
keep verifying as long as the secret value itself is unchanged.

## 2. Google login: server-side ID-token verification

- New `apps/api/utils/googleAuth.js`: `verifyGoogleIdToken(idToken)` uses
  `google-auth-library` `^11.3.3` (`OAuth2Client.verifyIdToken`, audience =
  `GOOGLE_CLIENT_ID`), requires `email_verified === true`, and returns only
  `{ email, name, picture, sub }`.
- `POST /user/login` (`Controllers/Auth.js`, `login` only — `updatePoints`
  untouched) accepts a verified Google token OR an email with a verified-OTP
  record. Identity comes **only** from the verified token; body
  email/username/picture are ignored when `idToken` is present (tested:
  spoofed body values do not leak into the created user). Forged / missing /
  expired tokens, and email-only logins with no verified OTP, are
  **401 `{error:{code:"UNAUTHORIZED"}}`**. There is **no bypass flag and no
  dev escape**.
- New env var: `GOOGLE_CLIENT_ID` in `apps/api/.env.example` (placeholder
  only). **Arman must supply the real value from Google Cloud Console** —
  without it, Google login always 401s. The web client already had the same
  value as `VITE_CLIENT_ID` (`apps/web/.env.example`, `main.tsx`,
  `vite-env.d.ts`); no new `VITE_` var was needed and no rename was done
  (the task's `VITE_GOOGLE_CLIENT_ID` does not exist in this repo).
- `packages/shared` `loginSchema` now accepts optional `idToken` + optional
  `email` (at least one required; Zod strips unknown fields, so `idToken`
  had to be added to the schema to reach the controller).
- Tests mock the verifier (`vi.mock "../utils/googleAuth.js"` in
  `tests/auth.test.js`; a token `valid:<email>` verifies as that email).
  No test calls real Google.
- Web: `Navbar` now uses the `<GoogleLogin>` credential flow from
  `@react-oauth/google`, whose `onSuccess` carries the real ID token
  (`credential`). It dispatches `loginThunk({ idToken })` — RTK auth slice
  shape unchanged (`LoginInput` only gained optional `idToken`, `email`
  became optional). The old `useGoogleLogin` implicit flow (access_token
  only) plus the client-side Google userinfo fetch and the OTP-verifier
  detour are deleted. The sign-in UI is now Google's own button instead of
  the custom "Sign in" button. Not runtime-verified in a real browser
  (same caveat as Phase 2 §7). The `GoogleLogin` button is not covered by a
  component test; the thunk-level test asserts the id_token is what is sent
  (`src/test/authSlice.test.ts`, MSW `captured.loginBodies`).

## 3. OTP: Mongo collection, hashed, expiring, attempt-limited

- New `apps/api/Models/Otp.js`: one document per identifier (email/phone),
  `otpHash` = SHA-256 hex (never plaintext), `attempts`, `expiresAt` (TTL
  index, 10 min — TTL is only a backstop; every read checks dates in code),
  `lastSentAt`, `verified` + `verifiedUntil`.
- `utils/utility_func.js`: `generateOTP` now uses `crypto.randomInt`
  (never `Math.random`); new `hashOtp()`; `sendOTPEmail` / `sendOTPSMS`
  now **throw** on failure instead of swallowing the error.
- `SendOtp` (async now): 60 s resend cooldown → **429**
  `{error:{code:"RATE_LIMITED"}}`; delivery is awaited, and a real send
  failure answers **500 `{error:{code:"OTP_SEND_FAILED"}}` and stores
  nothing** — this is the deliberate behaviour change (see §5: it breaks
  the 3b-owned smoke test's old 200 expectation, which pinned the silent
  swallow). Both routes stay behind the existing auth rate limiter
  (30 req / 15 min production; 10000 in tests).
- `VerifyOtp`: wrong code → 400 `Invalid OTP`; expired code → 400
  `OTP expired`; **5th wrong attempt → 429 and the code is invalidated**
  (deleted — even the correct code then fails); correct code → 200
  `OTP verified` and sets `verified=true`, `verifiedUntil = now + 10 min`
  (with `expiresAt` extended to match, so TTL cannot delete it early).
- Login rule: an OTP login needs a verified, unexpired record, which the
  login **consumes (deletes)** — second use is 401 (tested in both API
  suites). Web OTP flow (`OTP_Auth.tsx` + auth slice) is unchanged apart
  from a comment: verify, then `loginThunk({ email, ... })`; no Skip
  (already removed in Phase 2).

## 4. Tests

- API: `auth.test.js` 20 tests (was 15), `otp.test.js` 13 tests (was 8).
  New coverage: forged token → 401, missing idToken → 401, valid mocked
  token creates user + repeat login no dup, body-spoof ignored, wrong OTP →
  400, expired OTP → 400, 5 wrong attempts → 429 + invalidated,
  resend before cooldown → 429, send failure → 500, verified-OTP login
  works once then consumed (second use → 401), expired verified window →
  401. OTP tests mock the senders + fix `generateOTP` to `"123456"`
  (scoped to `otp.test.js` only).
- Web: `authSlice.test.ts` 6 tests (was 4): + id_token sent on Google
  login, + neither idToken nor email → login error. `otp.test.tsx`
  unchanged (3 tests). Web suite **37 / 37 green**, typecheck clean.
- Full API suite: **84 / 85 pass, 1 fail** — see §5.

## 5. Known breakage left for 3b (NOT edited — those files are 3b-owned)

`tests/routes.smoke.test.js` ("every route responds with its expected
status") fails at its first mismatched row:

- `POST /auth/send-otp` `{ email: "smoke@example.com" }` expected 200,
  got **500 `{error:{code:"OTP_SEND_FAILED"}}`** — the smoke file loads
  the real senders (no mock), Gmail fails with the dummy test credentials,
  and §3 now surfaces that instead of swallowing it. Fix for 3b: mock
  the senders in the smoke file (as `otp.test.js` does) or expect 500.
- Latent second breakage in the same table (not reached — the test aborts
  at the first failure): `POST /user/login` `{ email, username }`
  expected 200, now **401** — email-only login with no verified OTP is
  rejected by design. Proven by `auth.test.js` ("rejects a missing
  idToken with 401"). Fix for 3b: send a mocked valid `idToken` (as
  `auth.test.js` does) or seed a verified OTP record.
- `tests/download.test.js` (3b-owned) still passes 9 / 9 — no breakage there.
- The smoke file's `verify-otp` row (never-sent email → 400) still passes.

## 6. Follow-ups / open items (not 3a scope)

- `Createditchannel.tsx` re-logs in with `{ email }` alone 5 s after a
  channel edit to refresh the session — that now 401s against the real
  server (no verified OTP). It degrades gracefully (rejected thunk sets
  `loginError` but keeps the existing session), but the refresh no longer
  works. Needs a proper session-refresh endpoint or a re-fetch — suggest
  for 3c.
- Live Google sign-in is not runtime-verified in a browser (needs a real
  `GOOGLE_CLIENT_ID` + `VITE_CLIENT_ID` and a Google account); same for
  real SMTP/Twilio OTP delivery — tests mock both.
- `pnpm build` / `pnpm lint` / web typecheck all green; API lint green.
