# Phase 4 Report — Acube Publish (verify + browser click-through + PR + portfolio + deployment)

Branch: `feat/acube-professional-rebuild` (local head `53891b9`, 30 commits ahead of
`main` @ `ec16620`). Date: 10 Nov 2026. Node on this VM: v24.22.1 (target pinned to 22).
**Status: work complete, but the Acube push + PR are BLOCKED** — see §4. Nothing was
merged anywhere. `main` untouched.

## 1. Verification — re-run by the Phase 4 coordinator, uncached

| Check | Command | Result |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Build | `pnpm build` | exit 0 (3 tasks; web entry 33.9 kB, initial load 709.3 kB) |
| Test (turbo, forced) | `pnpm test --force` | **API 119/119 (9 files) + web 47/47 (13 files) = 166, exit 0, 42.4 s** |
| API alone | `pnpm --filter @acube/api test` | 119/119, 15.5 s |
| Web alone | `pnpm --filter @acube/web test` | 47/47, 25.6 s |
| Lint (forced) | `pnpm lint --force` | exit 0, **0 errors, 9 warnings** (pre-existing legacy) |
| Typecheck (forced) | `pnpm typecheck --force` | exit 0, 3 tasks |
| Playwright e2e | `pnpm --filter @acube/web test:e2e` | **6/6 passed** (ran twice: 11.6 s and 9.4 s) |

### 1.1 Test-hang investigation (the parent's 6+ minute hang) — ROOT CAUSE FOUND AND FIXED

- **Not watch mode.** Both test scripts are `vitest run` (`apps/api/package.json`,
  `apps/web/package.json`) — nothing runs in watch mode. The hang was not a config bug.
- **Root cause: `/tmp` exhaustion.** This VM's `/tmp` is a 512 MB tmpfs.
  `mongodb-memory-server` stores each mongod's data dir under `/tmp` as
  `mongo-mem-*` (~200 MB each). A normal run deletes its dir on stop, but a killed
  run leaves it behind. At investigation time `/tmp` was 82% full with two orphaned
  201 MB dirs from earlier killed runs; the next mongod failed with `fassert()`
  and the suite produced no test output — which looked like a hang (the parent's
  run was also piped through `grep`, which buffered the little output there was).
  Reproduced with `pnpm test --force`: API suite failed in ~10 s with
  `StdoutInstanceError: Mongod internal error (fassert() failure)`.
- **Fix (commit `53891b9`):** new `apps/api/tests/mongoTmpCleanup.js` — before
  starting a mongod, best-effort removes `mongo-mem-*` dirs in `os.tmpdir()`
  older than 1 hour (a live run's dir is minutes old, so concurrent runs are
  safe; every failure is swallowed). Wired into `apps/api/tests/globalSetup.js`
  and `apps/api/e2e-server.mjs`. Verified: a fake 2-hour-old stale dir was removed
  and the API suite then passed 119/119. `e2e-server.mjs` shutdown also calls
  `server.closeAllConnections()` first so keep-alive connections cannot block
  `mongod.stop()` — that alone did NOT fix the Playwright teardown leak
  (Playwright SIGKILLs the webServer process group, so the handler never
  completes and one 201 MB dir is still left after each e2e run); the 1-hour
  cleanup guard is what covers it on the next run.
- **Residual note:** `/tmp` must be watched on this VM — any hard-killed test run
  strands ~200 MB until the next run's cleanup (or manual `rm -rf /tmp/mongo-mem-*`).

## 2. Browser click-through (real Chromium + real servers, headless)

No user-visible live browser exists in this environment; the pass used Playwright
(Chromium Headless Shell) against the real API (`apps/api/e2e-server.mjs` :5000,
in-memory Mongo, one seeded video) + real web app (`vite preview` :4173).
New spec `apps/web/e2e/clickthrough.spec.ts`, screenshots in `docs/screenshots/`
(8 PNGs, 336 KB, 1280×800). **8 passed, 1 skipped, 0 real app bugs found.**

| Step | Result |
|---|---|
| Home feed renders seeded video | PASS — `home.png` |
| Search "E2E Smoke" via navbar | PASS — `search.png` |
| Video page: play toggle, logged-out like, comments | PASS — play flips to pause icon; like click alerts "please login to like video"; comments render; 0 page errors — `videopage.png` |
| Auth guards logged out: /Library, /Likedvideo, /Watchhistory, /Watchlater, /Yourvideo, /chat | PASS — all 6 redirect to Home — `library-guard.png` |
| Chat: logged-out redirect; signed-in shell | PASS — shell renders; users list empty (seeded DB has no users, not a bug) — `chat.png` |
| StreamRoom call UI with fake session | PASS — container + buttons render, 0 page errors; no real call possible headless (no devices/peers) — `streamroom.png` |
| Upload modal + 10 MB limit | **NOT VERIFIED (skipped)** — the only Upload entry point is the owner-only button on the channel page; no channel exists for the fake user in the seeded DB, so the modal is unreachable in e2e without seeding a channel. No file uploaded (no Cloudinary credentials). |
| Premium: Upgrade must NOT grant premium | PASS — click → API 404s (fake user has no DB row) → alert; after reload the Upgrade button is still present, premium NOT granted — `premium.png` |
| Theme toggle + navbar | PASS — Dark removes `white-theme` from body, Light restores it — `theme-dark.png` |

Two first-run failures were test artefacts, fixed in the spec (not app bugs):
the unsigned dummy JWT gets 401 from `jwt.verify()` and the client's 401
interceptor redirects mid-test — the spec now mints a properly signed HS256 JWT
with the dummy e2e secret; and a screenshot path was off by one level.
What still could NOT be verified without real credentials: real Google sign-in,
live Stripe Checkout + webhook, real Cloudinary upload, actual video playback
with sound, real OTP delivery (all mocked in tests, as in Phase 3).

## 3. Phase 4 commits (local branch, not pushed)

| Commit | Subject |
|---|---|
| `53891b9` | Phase 4: /tmp mongod cleanup guard, DEPLOYMENT.md, browser click-through spec + screenshots |
| _(this report)_ | Phase 4: PHASE4_REPORT.md (to be committed after this file is written) |

## 4. Acube push + PR — BLOCKED (needs Arman, one step)

**No Acube branch exists on GitHub yet and no PR could be opened.** Two independent
push routes were tried and both fail for the same underlying reason:

1. `git push origin feat/acube-professional-rebuild` — fails: `fatal: could not
   read Username for 'https://github.com'` (terminal prompts disabled). `gh` is
   not logged in (`gh auth status`: "You are not logged into any GitHub hosts"),
   and starting a fresh auth flow is forbidden to the agent.
2. GitHub connector (`/opt/hatch/bin/github create_branch`) — the approval was
   granted, but GitHub returned **403 `Resource not accessible by integration`**.
   Read access works (remote `main` head verified as `ec16620`, branch-absence
   check returned 404 as expected), but the Muse GitHub App has no write access
   to the **Acube** repo. The same App *does* have write on
   `armanalam-portfolio` (the portfolio branch + PR below succeeded), so this is
   a per-repository installation selection, not an account problem — the same
   situation as the portfolio repo on 2 Nov 2026, fixed then by Arman granting
   the repo in the App installation.

**Unblock step (Arman, ~1 minute):** open
https://github.com/apps/meta-muse-ai/installations/new
and select the **Acube** repository for the Muse GitHub App (same step as for
the portfolio repo), then tell Muse to retry. The retry is: create branch
`feat/acube-professional-rebuild` from `main`, snapshot-push the working copy
(`git ls-files` selection, 245 UTF-8 files — the 14 binary files are excluded
by the connector: 7 pre-existing main binaries stay as-is on the branch, and
the 8 new `docs/screenshots/*.png` files are NOT in the snapshot and must be
added separately or left local), open the PR (description drafted in §4.1),
then push `PHASE4_REPORT.md` as a follow-up commit. The local branch keeps
the full 30-commit history; the snapshot push would squash it into one commit
on GitHub — the per-phase history is preserved in-file via
`PHASE0_BASELINE.md` / `PHASE1_REPORT.md` / `PHASE2_REPORT.md` /
`PHASE3_REPORT.md` / this report.

### 4.1 Draft PR description (for the Acube PR, once unblocked)

Title: `Rebuild Acube as a professional monorepo (Phases 0–4)`

Body: professional rebuild of the college media platform (video, channels, chat,
video calls, Stripe premium) into a Turborepo + pnpm monorepo — Vite 7 + React 19
+ TypeScript + Redux Toolkit + TanStack Query (web), Express 5 + Mongoose 9 (API).
Phases: 0 baseline + dead-code removal; 1 monorepo + server upgrade + hardening
(Helmet/CORS/rate-limit/Zod, DB-before-listen, /health); 2 client toolchain + state
migration + 8 bug fixes (OTP Skip removed, search casing, home reload loop,
download videoId, .reverse() mutation, player interval leak, upload message,
PaymentStatus verifies via API); 3 server security (Google ID-token verification,
Mongo OTP store, Stripe webhook-only premium, ownership/auth everywhere, atomic
$inc counters, server-only points, pagination + indexes, JWT_SECERT→JWT_SECRET,
E2E claim removed) + polish (README, LICENSE, CI, e2e 6/6, bundle 1,113→709 kB);
4 verification + browser click-through + deployment guide.
Tests: API 119/119 + web 47/47 + Playwright e2e 6/6 + click-through 8 passed
(1 skipped: upload modal needs a seeded channel); lint 0 errors / 9 warnings;
typecheck green.
Intentional behaviour changes: JWT_SECRET rename (old JWT_SECERT has no
fallback); login requires a verified Google token or verified OTP; premium only
via Stripe webhook; list endpoints return `{items,page,limit,total,totalPages}`;
like takes `{action:"like"|"unlike"}`; update-points route deleted (replaced by
watch-complete, 5 points/watch, max 10/video/day).
Env Arman must supply: GOOGLE_CLIENT_ID, STRIPE_SK, STRIPE_WEBHOOK_SECRET,
DB_URL, JWT_SECRET (new name), Cloudinary/Twilio/Gmail values; confirm the
1000 INR premium price (server catalogue default, unconfirmed).
Do not merge by the agent — Arman merges after review.

## 5. Portfolio integration — DONE, PR open

- **PR: https://github.com/Mr-armanalam/armanalam-portfolio/pull/11**
  ("Add Acube rebuild as a project entry", branch
  `feat/portfolio-acube-project`, commit `12bf881daf89c29639d484c7d2add9d25c123e99`,
  from `main` @ `e1495cd3`). Sync record saved.
- Change (3 files, old UI untouched): `raw-data/project-data.ts` (Acube entry,
  slug `acube`, no `liveUrl` — no misleading LIVE DEMO button; honest old-build
  wording in description + honestNote), `app/projects/page.tsx` (counts
  4→5 projects), `module/projects/ui/project-visual.tsx` (generic no-image panel
  for non-Needlon projects; Needlon's panel pixel-identical).
- Verified: typecheck clean, lint 0 errors (4 pre-existing warnings), production
  build 13/13 pages with `/projects/acube` generated; before/after screenshots
  in `~/workspace/portfolio-rebuild/acube-shots/` (desktop + mobile, detail
  sections). Caveat: plain `npm run build` fails in this sandbox on the Google
  Fonts fetch (TLS); it passes with
  `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1`.
- Follow-up: add `liveUrl` + the Acube PR link in `repoNote` once the rebuild is
  deployed and the Acube PR exists. Arman merges PR #11 after review.

## 6. Deployment guide + stale branches

- **DEPLOYMENT.md** (repo root, ~20 KB): Vercel for `apps/web` (existing project
  serves the old build at https://accube.vercel.app/ — merge PR first, Root
  Directory `apps/web`, redeploy/repoint), Render/Railway/Fly.io/VPS for
  `apps/api`, MongoDB Atlas; full env tables (API 17 vars, web 3 vars) incl.
  JWT_SECRET rename warning; Stripe webhook setup (`<api>/download/webhook`,
  `checkout.session.completed` only); Cloudinary/Twilio/Gmail notes;
  CORS/`FRONTEND_URL`; verification (`curl /health`, paginated `getvideos`);
  rollback; outstanding items from PHASE3_REPORT.md §9.
- **Stale branches: 29, not 31** (verified three ways). Every one is fully merged
  into `main` with **0 unique commits** vs `main` (last commits Nov 2024–Mar
  2025). All are safe to delete; **none were deleted** — deletion is destructive
  and remote, so it needs Arman's explicit approval of the exact command in
  DEPLOYMENT.md §9 / the worker's report (one `git push origin --delete …`
  listing all 29 names).
- `.gitignore` fixed: `test-results/` + `playwright-report/` now ignored.
- CI (`.github/workflows/ci.yml`) runs on PR + push to
  `feat/acube-professional-rebuild` only; recommendation: widen the push trigger
  to `main` after merge (not edited).

## 7. Still outstanding

- **Acube push + PR** — blocked on Arman granting the App access to Acube (§4).
- **Screenshots on GitHub** — the 8 `docs/screenshots/*.png` files are committed
  locally but the connector snapshot push cannot carry binaries; they need a
  separate push (by Arman via git, or a follow-up once git push works).
- **Deploy the rebuilt app** — after the PR merges; then update the portfolio
  entry with `liveUrl` + the Acube PR link.
- **Confirm the 1000 INR premium price** (server catalogue default, unconfirmed).
- **Delete the 29 stale branches** — pending Arman's approval of the delete command.
- **Upload modal click-through** — needs a seeded channel in the e2e DB (skipped).
- From PHASE3_REPORT.md §9 (unchanged): infinite scroll is page-1-only (lists
  >50 truncated); watch-complete cap can race by one 5-point award; daily
  download reset happens on login only, not midnight; unique-index build against
  production data needs a dedupe pass first; CI not verified live until the
  first PR runs it.

## 8. What Arman must do next (in order)

1. Grant the Muse GitHub App access to **Acube**: open
   https://github.com/apps/meta-muse-ai/installations/new, select Acube, save —
   then tell Muse to retry the push + PR (§4).
2. Review + merge the portfolio PR: https://github.com/Mr-armanalam/armanalam-portfolio/pull/11
3. Review + merge the Acube PR once it exists (do not let the agent merge).
4. Confirm the 1000 INR premium price (or set the real price in
   `PREMIUM_PRICE_INR`).
5. Supply live env vars (GOOGLE_CLIENT_ID, STRIPE_SK, STRIPE_WEBHOOK_SECRET,
   DB_URL, JWT_SECRET, Cloudinary/Twilio/Gmail) and deploy per DEPLOYMENT.md.
6. Approve (or decline) deleting the 29 stale branches.
