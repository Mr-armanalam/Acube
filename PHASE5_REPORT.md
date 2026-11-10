# Phase 5 Report — Acube Premium UI + Creator Studio (verify + finish)

Branch: `feat/acube-phase5-studio` (head `bb76901` + the work below).
Date: 10 Nov 2026. Node on this VM: v24.22.1 (target pinned to 22).
**Status: work complete and verified; nothing merged, nothing pushed.**
The coordinator owns the PR step.

This phase was built by two parallel workers (backend in `apps/api`,
frontend in `apps/web`) against the written contract in
`PHASE5_PLAN.md` (Reconciliation section: Obsidian + Acube Red,
`viewevents` + `channeldailystats`, 9 `/studio` endpoints, playlists +
`libraryentries`, `comments.parentId`). This report is the independent
verification + finishing pass: contract alignment was checked
field-by-field against the real backend, the history per-item remove gap
was closed, every suite was re-run uncached, and a new Playwright
click-through was run against the real API + production build.

## 1. Verification — re-run by the verification worker, uncached

| Check | Command | Result |
|---|---|---|
| Test (turbo, forced) | `pnpm test --force` | **API 154/154 (10 files) + web 65/65 (15 files) = 219, exit 0** |
| API alone | `pnpm --filter @acube/api test` | 154/154 |
| Web alone | `pnpm --filter @acube/web test` | 65/65 |
| Lint (forced) | `pnpm lint --force` | exit 0, **0 errors, 9 warnings** (same 9 pre-existing legacy warnings as Phase 4 — none in Phase 5 files) |
| Typecheck (forced) | `pnpm typecheck --force` | exit 0, 3 tasks |
| Build | `pnpm build` | exit 0 (web built in ~14 s; API build is the syntax check, same "no output files" note as Phase 4) |
| Playwright e2e (Phase 4 suite) | `pnpm --filter @acube/web test:e2e` | **14 passed, 1 skipped** (smoke 6/6 + click-through 8 passed; the skip is the same upload-modal skip as Phase 4) |
| Playwright e2e (Phase 5 suite) | `pnpm --filter @acube/web test:e2e:phase5` | **10/10 passed** (new spec, §3) |

Phase 4 baseline was API 119/119 + web 47/47 = 166. The +35 API / +18
web tests are the workers' Phase 5 suites plus the 3 tests added in
this pass (1 API history-delete test, 2 web tests).

### 1.1 One transient flake (recorded, not hidden)

The first full `pnpm test --force` run in this pass failed exactly one
web test — `watchHistoryLibrary.test.tsx > renders the rebuilt player
controls and nested comments` — while the API suite passed. The same
test then passed on every subsequent run: two standalone web runs, two
full `pnpm test --force` runs. No code changed between the failing run
and the passing runs, and no root cause was established; the most
likely cause is a timeout under parallel turbo load (API + web suites
run concurrently). It is recorded here as a flake, not claimed fixed.

### 1.2 /tmp watch (same residual as Phase 4)

Each Playwright e2e run still strands one ~201 MB `mongo-mem-*` dir
(Playwright SIGKILLs the webServer process group, so `mongod.stop()`
never runs). During this pass `/tmp` hit 82% and one e2e re-run failed
to start with `interrupted at shutdown` until the orphans were removed
by hand. `/tmp` was left at 3% at the end of this pass. The 1-hour
cleanup guard (`apps/api/tests/mongoTmpCleanup.js`) still covers the
next run.

## 2. Contract alignment — 8 mismatches found and fixed

The two workers coded against the contract in parallel with mocks, and
the mocks drifted from the real API in both directions. Every mismatch
below was found by reading the backend's actual response shapes against
the frontend's expected shapes, and fixed on whichever side was wrong.
All fixes are small and covered by tests; no redesign was needed.

| # | Mismatch | Fix |
|---|---|---|
| 1 | **Analytics `bestDay`**: backend returns `{ date, views } \| null`; frontend typed it `string \| null` and rendered it raw — the Best day card would have shown `[object Object]`. The MSW fixture encoded the wrong (string) shape, so the web tests passed anyway. | Frontend type → `{ date, views } \| null`; card renders `2026-11-10 · 7 views`; fixture + test updated. Proven live in `studio-analytics.png`. |
| 2 | **Settings**: backend GET returns `{ channel: { name, desc, … } }` and PATCH accepts only `{ name?, desc? }` (`studioSettingsSchema`); frontend typed a flat `{ name, description, handle?, links? }` and sent `description`/`handle`/`links`. Real behaviour: the form loaded empty, the description was silently stripped by Zod, and submitting with an empty name would 400. | Frontend type → `{ channel: … }`; form reads `channel.name`/`channel.desc` and sends `{ name, desc }`; the handle/links fields were removed (no such server fields — the plan says no new fields in Phase 5). MSW fixture + PATCH handler + test updated (test now asserts `desc` is sent and `description`/`handle`/`links` are not). |
| 3 | **Watch page did not use GET /video/:id**: it filtered the page-1 `getvideos` feed. An unlisted video, or any video past page 1, showed "Video not found". | New `getVideo(id)` + `useVideo(id)` hook (`queryKeys.video(id)`); Watch reads the single-video query (feed list kept only for "Up next"). MSW `GET /video/:id` handler + a test proving the page loads with an empty feed. |
| 4 | **Playlist page used the owner-only list**: it found the playlist in `GET /studio/playlists`, so another creator's public/unlisted playlist — and any logged-out visitor — got "Playlist not found", even though the backend built a public `GET /studio/playlists/:id` for exactly this page. | New `getStudioPlaylist(id)` + `useStudioPlaylist(id)`; page renders the endpoint's ordered `videos` array (feed-cache fallback kept). MSW handler added. |
| 5 | **Playlist update sent `videoIds`**: the backend takes `addVideoIds`/`removeVideoIds`; a bare `videoIds` is stripped by Zod and the PATCH 400s. (Latent — no page called the hook yet.) | `patchStudioPlaylist` / `useUpdatePlaylist` now send `addVideoIds`/`removeVideoIds`. |
| 6 | **Library "Saved" shelf missing**: `GET /studio/library` was never called; the hub showed only Watch Later / Liked / Playlists. | New `getLibrary()` + `useLibrary()`; Saved section renders the `saved` videos. MSW handler + test assertion added. |
| 7 | **History grouped by the wrong field**: the page grouped by `entry.createdAt`, but history rows carry `likedon` (the model has no `createdAt`) — every real row landed under "Unknown date". The MSW test had seeded `createdAt`, hiding it. | Group by `likedon ?? createdAt`; test fixtures now send `likedon`. Proven live: `history.png` now groups under "Today". |
| 8 | **View count went stale on Watch**: `useViewVideo` patched only the feed-list cache, so after the fix in #3 the Watch page's own count stayed at 0 after a view was recorded. | `onSuccess` now also patches the `queryKeys.video(id)` entry. |

Verified as already correct (no fix needed): `/studio/overview`
(`totals` + `allTime` fallback + `statsSince` + `topVideos` +
`latestComments` — the frontend reads the fields the backend sends);
`/studio/analytics` series/totals; `/studio/videos` + `/studio/comments`
paginated shapes; nested comments (flat list + `parentId`, client-side
tree, `?parentId=` supported server-side); visibility semantics
(private → 404 for non-owners on `GET /video/:id`, unlisted readable
by link, feed restricted to public); `PATCH /video/:id` (`title` +
`visibility`, strict schema); Studio Content edit/visibility/delete.

**Note on the "backend worker's 7 listed deviations": no such list
exists in the repo or workspace** — no file names 7 deviations, and no
handoff file was found. It could not be verified against a list; the
table above is what the code actually showed, checked field-by-field
instead.

## 3. History per-item remove — gap CLOSED

The frontend had omitted the button because no single-row endpoint
existed. It turned out to be small, so it was built end to end:

- **Backend:** `DELETE /video/deletehistory/:videoid/:viewer`
  (`Controllers/History.js` `deletehistoryitem` + `Routes/video.js`,
  reusing `videoViewerParamSchema`). Owner = viewer only: another
  viewer's id is 403, a missing row is 404, clearing-all is untouched.
- **Frontend:** `deleteHistoryItem` API fn + `useDeleteHistoryItem`
  hook (optimistic removal from the history cache) + a "Remove" button
  per row in `History.tsx`.
- **Tests:** 1 API test (403 for another viewer, 200 + row gone for
  the owner, other rows untouched, 404 on repeat) + 1 web test (click
  Remove → `DELETE /video/deletehistory/vid1/user1` captured) + MSW
  handler. All green in §1.

## 4. Browser click-through (real Chromium + real servers, headless)

New spec `apps/web/e2e-phase5/phase5.spec.ts` (run:
`pnpm --filter @acube/web test:e2e:phase5`), same approach as Phase 4
(real API with in-memory Mongo + vite preview) but with a Phase 5
seed: `apps/api/e2e-server.mjs` gained an opt-in `PHASE5_SEED=1` mode
that seeds a User row for the fake e2e user, the seeded video as THEIR
video, one `ChannelDailyStat` row for today (**7 views, 2 likes, 12.5
watch minutes, 1 completion**), one comment, one history row, one
playlist, one saved library entry. The default (unseeded) server is
unchanged, so the Phase 4 suite is unaffected. Config:
`apps/web/playwright.phase5.config.ts`. **10 passed, 0 failed, 0 page
errors in any test.**

| Step | Result |
|---|---|
| Home renders seeded video | PASS — `phase5-home.png` |
| Studio dashboard shows seeded totals (7 / 2 / 1 / 1 / 12.5) + chart + top videos + latest comments | PASS — `studio-dashboard.png` |
| Studio Content lists own video + visibility select + edit/delete | PASS — `studio-content.png` |
| Studio Analytics: range buttons, totals, best day `2026-11-10 · 7 views` | PASS — `studio-analytics.png` |
| Studio Comments lists seeded comment + Delete | PASS — `studio-comments.png` |
| Studio Settings prefilled from channel (E2E User / "E2E test channel") | PASS — `studio-settings.png` |
| Watch page: Play/Pause toggle, seek slider, volume, speed, PiP, fullscreen, nested comment, playlist showcase, Up next | PASS — `watch.png` |
| History: seeded watch under "Today" + per-item Remove | PASS — `history.png` |
| Library: Saved shelf + seeded playlist | PASS — `library.png` |
| Content title edit persists end to end (edit → Watch shows new title) | PASS |

Screenshots in `docs/screenshots/` (9 new PNGs, 1280×800); the 8
Phase 4 screenshots are kept (videopage.png + premium.png were
re-taken by the updated Phase 4 run below). All screenshots were
visually inspected: dashboard, analytics, watch, history and library
were read back and show exactly what the tests assert.

Two first-run failures were spec artefacts, fixed in the spec (not app
bugs): Playwright strict-mode violations — `getByText("E2E Smoke
Video")` matched both the top-videos link and "on E2E Smoke Video" in
a comment, and `getByRole("button", { name: "Play" })` matched both
"Play" and "Playback speed". Locators were tightened (`exact: true`,
link role); the app rendered correctly in both cases.

### 4.1 Phase 4 e2e suite needed updating (route change, not a regression)

The Phase 4 suite initially failed 3 tests after the Phase 5 work:
the smoke video-page test, click-through test 3 (video page), and
click-through test 8 (premium) all asserted the OLD `/videopage/:id`
page (`.video_title_VideoPage`, `.play-pause-btn`). Phase 5 redirects
`/videopage/:id` → `/watch/:id` per the plan, so those selectors no
longer exist. The specs were updated to the new Watch page (redirect
asserted, Play/Pause toggle via the new Player, logged-out like alert
unchanged, premium URL assertions moved to `/watch/:id`). After the
update: **14 passed, 1 skipped** (the same upload-modal skip as Phase
4). `Videopage.tsx` itself is now dead code — no route imports it
(only `Likewatchlatersavebtns` is still used, by Watch) — it was left
in place, not deleted; see §6.

What still could NOT be verified without real credentials: real Google
sign-in, live Stripe Checkout + webhook, real Cloudinary upload,
actual video playback with sound, real OTP delivery (all mocked in
tests, as in Phase 4).

## 5. Phase 5 commits (local branch, not pushed)

| Commit | Subject |
|---|---|
| `1a7fa40` | Phase 5 backend: Studio endpoints, analytics models, playlists, library, nested comments, history per-item delete |
| `3048f5a` | Phase 5 frontend: Studio pages, rebuilt Watch player, History/Library/Playlist, contract fixes |
| _(this commit — head; see the branch log)_ | Phase 5 verification: e2e specs + configs, screenshots, PHASE5_REPORT.md |

No merge, no push — the coordinator owns the PR step (same blockers as
Phase 4 §4: the Muse GitHub App still needs Arman to grant it the
Acube repo; the connector cannot push workflow files or binaries, so
`docs/screenshots/*.png` travel only via a git push).

## 6. Still outstanding / known gaps

- **No "Save" button anywhere in the UI.** The Saved shelf renders
  (and `POST /studio/library` + `DELETE /studio/library/:kind/:videoid`
  exist and are API-tested), but a user can only get a video into it
  via a direct API call — nothing in the app creates a `kind: "saved"`
  row. Follow-up: wire a Save action (e.g. in
  `Likewatchlatersavebtns`) to `POST /studio/library`.
- **`Videopage.tsx` is dead code** (unreachable since the redirect;
  see §4.1). Delete it in a follow-up, or keep it if the old page is
  wanted back — not deleted here.
- **Upload modal click-through still skipped** (Phase 4 reason
  unchanged: no Cloudinary credentials, and the modal needs a channel
  page). The Phase 5 seed now has a user row, but no upload was
  attempted.
- **One web-test flake** (§1.1): a single transient failure in the
  first full run, passing on all four later runs; no root cause
  established.
- **`/tmp` orphaned mongo dirs** (§1.2): each e2e run strands ~201 MB
  until the next run's 1-hour cleanup guard or a manual `rm -rf
  /tmp/mongo-mem-*`.
- From PHASE4_REPORT.md §7 (unchanged): Acube push + PR blocked on
  Arman granting the App access to Acube; screenshots on GitHub need a
  git push; deploy after merge; confirm the 1000 INR premium price;
  delete the 29 stale branches (pending approval); infinite scroll is
  page-1-only; watch-complete cap can race by one 5-point award; daily
  download reset happens on login only; unique-index build against
  production data needs a dedupe pass; CI not verified live until the
  first PR runs it.

## 7. What Arman must do next (in order)

Same as PHASE4_REPORT.md §8 (grant the Muse GitHub App access to
Acube, review + merge the portfolio PR #11, then review + merge the
Acube PR once it exists, confirm the 1000 INR price, supply live env
vars and deploy per DEPLOYMENT.md, approve/decline the stale-branch
deletion) — plus, for Phase 5: decide whether a Save button (§6) and
deleting `Videopage.tsx` belong in the Phase 5 PR or a follow-up.
