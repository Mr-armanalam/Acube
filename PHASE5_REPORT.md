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

## 8. Fix pass — preview validation against the design preview

This section is the fix pass (11 Nov 2026, after the audit found
Phase 5 was never validated section-by-section against
`acube-phase-5-design-preview`, screens A–J). It supersedes the
stale numbers in §1/§5 (see §8.4). Commits: `25a5b3f` (backend),
`d51c492` (frontend). Nothing merged, nothing pushed.

### 8.1 Method

- **Demo seed as the test bed.** `pnpm --filter @acube/api
  seed:demo` against a local mongod, run twice (identical summary,
  idempotent) and re-run once more after a VM reboot (§8.5): 3
  channels, 24 viewers, 11 videos (7 public), 1503 view events, 113
  likes, 8 comments, 3 playlists, 117 library entries, 7 history
  rows. Demo channels: Acube Studio (`507f1f77bcf86cd799430001`),
  Pixel Craft, Code & Chai. `PHASE5_SEED` e2e mode calls the same
  `seedDemoData()` plus e2e user rows — confirmed in
  `apps/api/e2e-server.mjs`.
- **Screenshots.** `apps/web/e2e-phase5/screenshots.mjs` (new in
  `d51c492`): 22 shots — 10 screens × desktop 1280×800 + mobile
  390×844, `fullPage`, plus upload steps 2–3 desktop — against the
  production build + real seeded API. All 22 taken fresh 10 Nov
  19:22–19:23 UTC with zero localhost page errors (see §8.5 for the
  two cold-start runs that did not). `phase5-home.png` sha256
  `05e7715231cd24024b144f5623d3a22f89bb45316e97bd693624b7c5660adbb4`
  ≠ `home.png`
  `e8f13d4d6accc975fd7995dbf15825ba365ebb558eb94910878fdc4fdec005c7`
  — not a copy. Library's below-fold playlists section is captured
  separately in `phase5-library-scrolled.png` (the `fullPage` shot
  cuts off inside the page's inner scroll container).
- **Final verification (uncached, this pass).**

  | Check | Result |
  |---|---|
  | `pnpm test --force` | **API 181/181 (11 files) + web 107/107 (16 files) = 288, exit 0** |
  | `pnpm lint --force` | exit 0, **0 errors, 7 warnings** (pre-existing legacy files; was 9 in §1 — the count dropped because two warned files are no longer linted the same way, not because warnings were fixed) |
  | `pnpm typecheck --force` | exit 0, 3 tasks |
  | `pnpm build` | exit 0 (web built in ~13–19 s across runs) |
  | Playwright Phase 5 e2e | **10/10 passed** |
  | Playwright Phase 4 e2e | **14 passed, 1 skipped** (same upload-modal skip as Phase 4) |

### 8.2 Fixes made in this pass

| # | Fix | Proof |
|---|---|---|
| 1 | **Upload details not persisted (loose end 1).** `uploadVideoBodySchema` stripped description/tags/visibility/thumbnailUrl; the controller returned bare text with no id. Schema extended, controller persists the fields and returns `{ message, video: { id, … } }`; wizard shows a "Watch video" link. Save-as-draft saves a real draft (hidden from feed, 404 anon, 200 owner). | 4 new API tests (video.test.js); wizard tests extended |
| 2 | **Phase 5 e2e 6/10 → 10/10 (loose end 2).** "Edit details" aria-label (preview screen C names the action "Edit details", spec said "Edit title"); "Seek slider" aria-label on the player knob; Library "Saved" heading made exact (count moved to a `<p>`). No assertion was weakened. | e2e log `/tmp/phase5-e2e-4.log` (10/10, 20.8 s); re-run after the route fix: 10/10 again |
| A | **Content soft-delete.** `isDeleted` only checked in-session deletes, so the seeded soft-deleted trailer (`deletedAt` set) rendered as a live row. Now `deletedAt != null` also marks Deleted + Restore. MSW handler aligned (it had filtered `deletedAt` rows out, diverging from the real API). | Unit test in studio.test.tsx (server override with a deleted row) |
| B | **Watch resume-from-end.** Finished videos showed "Resumed from 7:00" (`progressSec == duration`). Clamped to 0 at duration; partial progress still resumes ("Resumed from 1:00"). | 2 web tests; discrimination checked by stashing the fix (new test failed without it) |
| C | **Playlist showcase owner-only.** Watch read the owner-only `/studio/playlists` list, so the showcase never rendered for other viewers. New public `GET /watch/:id/playlists` (private/unlisted hidden, member videos visibility-filtered); frontend uses it. | 3 API tests (studio.test.js); live curl as anonymous viewer returned "Learning Path: Full-Stack Foundations"; `phase5-watch-full.png` shows the panel |
| D | **History order + resume label.** API sorted oldest-first (Yesterday above Today); finished rows offered "Resume from 7:00". Sort is now newest-first; finished rows show "Watch again" with no `?t=`. | 1 API test (history.test.js) + 2 web tests |
| E | **`/Library` auth-guard regression (found by the Phase 4 e2e re-run).** Phase 5 rewrote the route as lowercase `/library` with `caseSensitive`, so the pre-Phase-5 capital-L URL `/Library` fell through to the 404 page instead of `RequireAuth`. The sidebar links lowercase, so in-app navigation never hit it — only old bookmarks/external links and the Phase 4 e2e tests. `caseSensitive` removed (React Router matches case-insensitively by default); both casings hit the guard. | 2 new tests in authGuard.test.tsx — both failed before the fix, pass after; Phase 4 e2e back to 14 passed / 1 skipped |
| F | **Web-test flake, root cause found + fixed (§1.1 superseded).** The failing test (`renders the rebuilt player controls and nested comments`) uses Testing Library's default 1 s async timeout for a `findAllByText` that needs the suggestions + playlist queries; it timed out twice under full-suite parallel load and passed standalone twice. Timeout raised to 5 s, assertion unchanged (still requires exactly 2 matches). | Full suite green after the fix (107/107) |

### 8.3 Preview-diff table (screens A–J, fresh screenshots vs preview)

Status: **Matched** · **Fixed in this pass** · **Differs** (real,
listed plainly) · **Explicit cut** (needs Arman's decision).
"Demo data" rows are seed artefacts, not app bugs: every number is a
real aggregate from the seed, labelled demo test data in the UI
("Seeded demo content, not real catalogue data" on Watch).

**A · Home** — `phase5-home-full.png` / `phase5-home-mobile.png`

| Preview field/control | Status | Note |
|---|---|---|
| Topic chips All/Motivation/Nature/Learning/Music/Coding, filtering | Matched | Client-side keyword filter over title/tags/uploader |
| + Upload pill → Studio | Matched | |
| 16:9 thumbnails + duration badges + channel avatars | Matched | Thumbnails render blank dark — seed thumb URLs are `example.com` placeholders (404 in this sandbox, no external internet). Real thumbnails load normally. |
| Titles / channel / views / "less than a minute ago" | Demo data | Seed titles ("Getting Started with React Hooks"…) replace the preview's illustrative titles ("Whole life is Learning", "Code Streamer"); all timestamps read "less than a minute ago" because the seed creates everything at seed time. |

**B · Studio Dashboard** — `phase5-dashboard-full.png`

| Preview field/control | Status | Note |
|---|---|---|
| "Channel dashboard", "Last 28 days", "Stats since 2026-10-14" | Matched | |
| Total views / Likes / Videos cards | Matched | Values are real per-channel aggregates for Acube Studio: 613 views / 49 likes / 4 videos. Preview's 1503 / 113 / 7 is its sample channel owning all 7 seed videos; the seed splits them across 3 channels. The copy is explicit about this ("All-time totals … 615 views · 49 likes" — 615 is the video-counter total, 613 the 28-day daily-stat total; the 2-view gap is pre-analytics traffic). |
| Watch time | Matched (more) | Preview shows "— hrs" ("needs view events"); implementation has real watch minutes (2412.89) + Completions (186). |
| Top performing videos / Latest comments | Differs (minor) | The Draft ("Advanced React Patterns", 0 views) appears in Top videos; preview lists only public videos. Latest comments have no Reply button on the dashboard (reply lives in the Comments inbox; preview B shows Reply). |
| "1 channel" switcher label | Differs (minor) | Only the session's own channel is shown; multi-channel switching was not exercised (seed has 3 channels, session owns 1). |

**C · Studio Content** — `phase5-content-full.png` / `phase5-content-mobile.png`

| Preview field/control | Status | Note |
|---|---|---|
| Table Video/Visibility/Date/Views/Likes; search + visibility filter + bulk-select | Matched | |
| Row action "Edit details" | Fixed in this pass | Was "Edit title" in the spec; preview names it "Edit details" (§8.2 #2). |
| Change visibility (dropdown) / View analytics / Delete (soft, restore) | Matched | Soft-delete now honours server `deletedAt` (§8.2 A): trailer row shows "Deleted" + Restore. |
| "View analytics" link | Differs (layout) | At desktop width the link overlaps the Delete/Restore button — the Actions column is too narrow for link + button. |
| Mobile layout | Differs | The table does not collapse: `phase5-content-mobile.png` is 547 px wide vs the 390 px viewport (horizontal scroll required); rows wrap awkwardly. |
| Counts / dates | Demo data | 5 rows for this channel (incl. deleted + draft) vs preview's 7; draft date is the seed date. |

**D · Studio Analytics** — `phase5-analytics-full.png`

| Preview field/control | Status | Note |
|---|---|---|
| Range 7/28/90 days, metric selector, chart + 28-day table | Matched | |
| Views (28d) / Avg views / video / Like rate | Matched | Real per-channel: 613 / 153 / 8.0% (preview sample: 1503 / 215 / 7.5%). Implementation also adds Best day (2026-10-30 · 32 views) and Watch minutes cards — extra, not in preview D. |
| Top source | Explicit cut | Honest empty state ("Traffic source not tracked yet — view events do not record a referrer"). Needs Arman's decision to record referrer. |
| Top videos bars | Differs (minor) | Draft at 0 views listed (same as B). |

**E · Studio Upload** — `phase5-upload-full.png`, `phase5-upload-step2-full.png`, `phase5-upload-step3-full.png`

| Preview field/control | Status | Note |
|---|---|---|
| 3-step wizard; step 2 Title/Description/Tags/Visibility (Public/Private/Draft); Publish + Save as draft | Matched | |
| Details persisted + draft saves a draft + video id returned | Fixed in this pass | §8.2 #1. |
| Preview's "84 MB" file / "68% · 57 MB of 84 MB" | Differs (preview wrong) | The preview's 84 MB file contradicts the Phase 3 10 MB upload hardening; the implementation correctly enforces 10 MB. Preview is wrong here, not the code. |
| Live end-to-end upload | Not verified | No Cloudinary credentials in this environment: the wizard was exercised to step 3 (file picked, not submitted). Persistence is covered by API + MSW tests, not a live upload. |

**F · Studio Comments** — `phase5-comments-full.png`

| Preview field/control | Status | Note |
|---|---|---|
| Inbox of all comments on your videos; Reply / Heart / Delete | Matched | |
| Table layout (Comment/Video/When/Actions) | Differs | Implementation uses a list, not the preview's table. |
| Filter "Unreplied" | Differs | Implementation has "All comments" + "Newest first" only; no Unreplied filter. |
| Heart | Explicit cut | Session-local only — no backend endpoint for comment hearts. Needs Arman's decision to add one. |
| Pinned comment badge | Differs | The pinned comment is badged on Watch ("Pinned by creator") but not in the inbox. |
| Timestamps | Demo data | All read "7 minutes ago" (seed time). |

**G · Channel Settings** — `phase5-settings-full.png` / `phase5-settings-mobile.png`

| Preview field/control | Status | Note |
|---|---|---|
| Banner (2560×1440) + profile picture, name, handle, description, channel URL, contact email, links, country/language, visibility & defaults, watermark, Save/Discard, "changes preview live, save once" | Matched | |
| Banner/avatar file upload | Explicit cut | File inputs are labelled "preview only — no image upload endpoint yet". URL fields work; file upload needs an image-upload endpoint (Arman's decision). Banner/avatar preview images are broken icons — seed `example.com` URLs. |
| Handle availability ("✓ available") | Differs | No live handle-availability check in the implementation. |
| Mobile layout | Differs | `phase5-settings-mobile.png` is 580 px wide vs 390 px: the Links rows (label + URL + Remove) do not wrap and the URL input truncates. The rest of the page fits. |

**H · Video Page / Watch** — `phase5-watch-full.png` / `phase5-watch-mobile.png`

| Preview field/control | Status | Note |
|---|---|---|
| Rebuilt player: Play/Mute/volume/speed/PiP/fullscreen, draggable seek knob ("Seek slider"), 0:00/0:00 | Matched | Player shows 0:00/0:00 — the seed video file does not exist, so real playback with sound is NOT verified (same caveat as Phase 3/4). |
| Seek slider label / playlist showcase for non-owners / resume-from-end | Fixed in this pass | §8.2 #2 (label), #C (showcase), #B (resume clamp). Showcase now renders for viewer01: "Playlist · Learning Path: Full-Stack Foundations", "3 / 4 watched · Playing 1 of 4", Play all / Shuffle / Loop / Save a copy. |
| Title/channel/views/date/tags, description + Show more, Download · Premium / Upgrade | Matched | |
| Nested comments to depth 3, pinned badge, reply/collapse | Matched | Pinned comment badged on Watch; depth-3 reply visible. |
| Up next with "Because:" reason per item | Matched | Same channel / Same topic / Viewers also watched. |
| Subscribe button | Explicit cut | No follow system exists. Needs Arman's decision. |
| CC / HD buttons | Explicit cut | No captions or renditions exist. Needs Arman's decision. |
| Chapters (list, ticks, gesture map, keyboard J/L/CC) | Explicit cut | No chapter data exists; chapter ticks were removed rather than faked. Player has no chapter list, gesture hints, or chapter shortcuts. Needs Arman's decision if chapters are wanted. |
| Autoplay toggle in showcase | Differs | Preview shows "Autoplay ON"; implementation has Play all / Shuffle off / Loop off / Save a copy — no Autoplay control. |
| Duplicate Save/Share | Fixed in verification close-out | Legacy bar's Watch-Later Save and dead Share icon removed; Watch Later moved into the Save menu (same legacy endpoint, covered by the moved likeSave test). One Save menu + one working Share button now render. `watch.png` re-taken by the Phase 5 e2e run after the fix. |
| Counts | Demo data | Comments 6 on this video (preview: 24); playlist 3/4 watched (preview: 4/6). |

**I · History** — `phase5-history-full.png`

| Preview field/control | Status | Note |
|---|---|---|
| Grouped by day (Today above Yesterday), newest-first | Fixed in this pass | §8.2 #D (sort was oldest-first). |
| Progress bars; "Resume from 3:19" for partial; "Watch again" for finished | Fixed in this pass | §8.2 #D (finished rows said "Resume from 7:00"). |
| Per-item Remove; Pause history / Clear all | Matched | |
| Per-row annotations ("You liked this", "Saved to Watch Later", "Watched today, 11:20 AM") | Differs | Implementation shows only progress + Finished/Resume; no like/save annotations and no clock time per row. |

**J · Library** — `phase5-library-full.png`, `phase5-library-scrolled.png`

| Preview field/control | Status | Note |
|---|---|---|
| "Your library", Watch Later (Play all, Sort: Recently saved), Saved (exact heading + count), Liked videos (private by default), "Your playlists & Saved playlists" + Create playlist | Matched | Scrolled capture shows the playlists section: "No playlists yet. Create your first one below." + title input + "Create playlist" + "+ Create playlist — also from any video's Save menu." |
| Playlists populated | Demo data | Viewer01 owns no playlists and saved none (the seed's 3 playlists belong to channels; no playlist library entries are seeded), so the section is an empty state for this viewer. The populated case is covered by Phase 5 e2e test 9 (e2e user owns a playlist). |
| `fullPage` capture | Differs (tooling) | `phase5-library-full.png` is 1280×882 — it cuts off mid-Liked-list because the page scrolls inside an inner container; the scrolled capture above closes the gap. |

### 8.4 Report corrections (earlier sections)

- **Head commit.** The §0 header says head `bb76901`. `bb76901`
  is the Phase 5 **base** commit, not the head: the report was
  written at `fbe516e`, and the branch has since advanced through
  `4fb2a93` → `ed76b2e` → `25a5b3f` → `d51c492` (this pass).
- **Endpoint count.** The intro says "9 `/studio` endpoints"
  (repeated from PHASE5_PLAN.md). The implemented surface is **14
  routes under `/studio`** (overview, analytics, videos, comments,
  settings GET+PATCH, playlists GET/POST/GET-by-id/PATCH/DELETE,
  library GET/POST/DELETE) **+ 2 under `/watch`**
  (`/:id/suggestions`, `/:id/playlists`) = 16 Phase 5 routes.
- **Test counts.** §1's "API 154/154 + web 65/65 = 219" is the
  pre-fix-pass verification. Current (uncached, this pass): **API
  181/181 + web 107/107 = 288** (§8.1). Phase 4 e2e 14/1 skipped
  and Phase 5 e2e 10/10 still stand.
- **Lint warnings.** §1 says 9 warnings; the current forced run
  reports 7 (same pre-existing legacy files — two previously warned
  files are no longer linted the same way; no warning was fixed in
  this pass).
- **Flake (§1.1/§6).** Root cause established and fixed in this
  pass (§8.2 F) — it is no longer "no root cause established".

### 8.5 Environment notes (this pass — why two runs looked red)

- **VM reboot 10 Nov ~19:13 UTC.** `/tmp` (512 MB tmpfs) was wiped
  and every background server died; `pnpm` (installed globally via
  npm) was gone and had to be reinstalled (`pnpm@12.18.0`). The
  workspace, node_modules, seed DB and all work survived. The seed
  was re-verified after the reboot with identical counts.
- **Screenshot cold-start transient.** Two screenshot runs started
  immediately after a server restart lost their first screens to
  15 s wait timeouts (14, then 7) while later screens passed; a
  direct probe showed the API returning the feed data fine. Once the
  stack was warm the same script passed **22/22 in 44 s**. The
  script now also distinguishes fatal localhost failures from
  informational external ones (Google Fonts / GSI / ipapi.co /
  `example.com` demo assets fail in this sandbox — no external
  internet — and do not affect the app).
- **`/tmp` pressure (same residual as §1.2, worse).** Each e2e or
  vitest run strands a ~201 MB `mongo-mem-*` dir. At 82% full, one
  Phase 4 e2e run failed 11/15 (in-memory mongod could not seed)
  and one API vitest run crashed with a mongod `fassert()` error.
  Cleaning the orphans and re-running gave green both times
  (Phase 4 e2e 14/1, API 181/181). `/tmp` was left at 3%.
- **Leftover servers.** Playwright's webServer processes sometimes
  survive a run (ports 5000/4173 stayed listening after the Phase 4
  e2e run, breaking the next run's startup with "port already
  used"). Killed by port/PID before re-running; green after.

### 8.6 Verdict

**Not "no single difference".** The implementation matches the
preview's structure and behaviour on every screen, and the two known
loose ends plus four further real diffs found during validation are
fixed and tested. What still differs, plainly:

1. **Six explicit cuts needing Arman's decision:** Subscribe (no
   follow system), CC/HD (no captions/renditions), traffic source
   (no referrer stored), comment heart backend (session-local only),
   banner/avatar file upload (preview-only, no endpoint), chapters
   (no chapter data).
2. **Eight remaining UI diffs (no decision needed, just work):**
   mobile Content table overflow (547 px), mobile Settings Links
   overflow (580 px), Content "View analytics" overlapping
   Delete/Restore, Draft listed in
   Top videos (Dashboard + Analytics), Comments list-not-table with
   no Unreplied filter and no pinned badge in the inbox, no
   handle-availability check, no Autoplay toggle, History missing
   per-row like/save annotations. (The ninth, duplicate Save/Share
   on Watch, was fixed in the verification close-out — see §8.7.)
   None blocks the PR; all are visible in the screenshots.
3. **Demo-data differences:** per-channel totals (613 vs preview's
   1503), illustrative titles/names, all-"less than a minute ago" /
   "7 minutes ago" timestamps, blank/broken `example.com` media.
   Labelled demo data, not defects.
4. **Not verified in this pass:** live end-to-end upload (no
   Cloudinary credentials), playback with sound (seed file does not
   exist).

**Recommendation: do not merge PR #2 yet.** The audit's condition
(close schema gaps, then frontend fixes, then re-validate per screen)
is now met for the items in §8.2, but the §8.6(2) UI diffs and the
§8.6(1) decisions are still open. Arman should decide the six cuts
and say whether the nine UI diffs ride in this PR or a follow-up;
the screenshots in `docs/screenshots/phase5-*.png` are the evidence
for that call. `ci.yml` + screenshots still need Arman's local push
(connector cannot push binaries/workflow files) — noted in the PR
body when updating PR #2.


### 8.7 Verification close-out (coordinator, after §8)

- **Duplicate Save/Share on Watch — FIXED.** The legacy action bar
  (`Likewatchlatersavebtns`) rendered a Watch-Later "Save" toggle and
  a Share icon with no handler, next to the Phase 5 Save menu
  ("Save to library" + playlists) and the working Share button.
  Watch Later moved into the Save menu (same legacy
  `POST /video/watchlater` endpoint, same viewer-scoped toggle, with
  a local override so the label does not flip back after refetch);
  the legacy bar keeps Like / Dislike / Thanks / Download only. The
  likeSave test moved with the toggle (Save menu, "Watch later" /
  "✓ Watch later") — 4/4 pass. `watch.png` re-taken by the Phase 5
  e2e run after the fix.
- **Final uncached re-run after the fix:** `pnpm test --force`
  API 181/181 (11 files) + web 107/107 (16 files) = 288, exit 0;
  lint 0 errors / 7 warnings (pre-existing); typecheck 3/3; build
  exit 0; Playwright Phase 5 e2e 10/10; Phase 4 e2e 14 passed,
  1 skipped. No flakes in this run. `/tmp` cleaned of orphaned
  `mongo-mem-*` dirs before the e2e runs.
- **§8.6(2) is now eight remaining UI diffs** (duplicate Save/Share
  removed from the list); §8.6(1) six explicit cuts are unchanged
  and still need Arman's decision. The verdict stands: **not "no
  single difference"** — the remaining diffs are listed in §8.3/§8.6,
  none hidden.


### 8.8 Match-the-preview pass, backend (11 Nov 2026)

Backend worker, branch `feat/acube-phase5-studio`. No frontend files
touched; no merge. API suite **190/190 (12 files)** after this pass
(was 181/181), ESLint 0 errors, shared typecheck clean.

- **Seed is now ONE channel.** `apps/api/scripts/seedDemo.js` seeds a
  single demo channel, **Code Streamer (@codestreamer,
  demo-channel-codestreamer@demo.acube.test)**, owning ALL 7 public
  catalogue videos plus the draft / unlisted / private / soft-deleted
  extras (11 videos). View events total exactly **1,503 views** and
  **113 likes**, aggregated from the seeded events/likes and asserted
  by the seed before it returns — never hardcoded totals. The old
  3-channel seed split the totals (a per-channel dashboard showed
  613/49/4). Idempotent (clear-first, demo-flagged), still refuses
  remote/prod DBs unless `SEED_DEMO_ALLOW_REMOTE=1`. The seed summary
  now carries `channel: { name, handle, email }`. The channel's
  avatar/banner reuse the seeded video thumbnail URLs (same
  `example.com` placeholder family as every other seeded media URL —
  the preview's real images are not available as files, so no new
  host is invented). `e2e-server.mjs` PHASE5_SEED comment updated to
  match (1 channel).
- **Demo login (local-only, test-only).** `POST /auth/demo-login`
  with body `{ "email": "<seeded demo email>" }` issues the NORMAL
  JWT (same shape/expiry as login, 6h) for that demo user. It is
  refused with **404** unless **both** `DEMO_LOGIN_ENABLED=1` is set
  **and** `NODE_ENV` is not `"production"`. Lookup is by
  `{ email, demo: true }`, so a real account can never sign in through
  it; unknown / non-demo emails get the same 404 (no existence leak).
  Local use: `DEMO_LOGIN_ENABLED=1` + seed, then demo-login as
  `demo-channel-codestreamer@demo.acube.test` (or any
  `demo-viewer-NN@demo.acube.test`) — no Google sign-in needed to view
  seeded data locally. If a later verification step genuinely needs
  Arman's real account, that goes to the coordinator — it is not
  worked around here, and no credentials are asked for in chat.
  There is no `.env.example` in the repo (removed from main in
  f37c013 — not re-added); this section is the documentation.
  Tests: 7 in `apps/api/tests/demo-login.test.js` (flag off → 404,
  production + flag → 404, channel + viewer success, real account →
  404, unknown email → 404, malformed body → 400).
- **Settings backend — already complete, now seeded + tested.**
  `GET/PATCH /studio/settings` already supported every preview field
  (handle unique with 409 HANDLE_TAKEN, links [{label,url}], contactEmail, country, language, bannerUrl, avatarUrl, toggles
  channelPublic / keepSubscriptionsPrivate /
  uploadDefaultVisibility / uploadDefaultComments / watermarkEnabled,
  name, desc). The seed now provides banner/avatar URLs for Code
  Streamer, and a test asserts the full seeded settings shape.
  `keepSubscriptionsPrivate` stays a stored preference only — there
  is NO subscribe/follow system, and no backend behaviour is faked
  for it.
- **Dashboard "videos" card is live videos now.** `GET
  /studio/overview` `totals.totalVideos` used to count every
  non-deleted owned video (10 for the seeded channel: 7 public +
  draft + unlisted + private). The preview dashboard shows 7, and the
  web Dashboard labels the card "live videos", so the count and the
  `topVideos` list are now live (public, or legacy rows with no
  visibility field) only. A draft in Top videos is therefore also
  closed from the backend side (was §8.6(2) UI diff). `allTime`
  still sums all non-deleted videos' counters, unchanged.
- **Derived Analytics cards — real aggregates only.** `GET
  /studio/analytics` `totals` now also returns `avgViewsPerVideo`
  (range views / live videos; 214.71 for the seed), `likeRate`
  (likes / views as a 0–1 fraction; 0.08 for the seed) and
  `watchHours` (watchMinutes / 60). `GET /studio/overview`
  `totals` now also returns `watchHours` (> 0 for the seed, 0 when
  there are no events — never "— hrs"). All computed from the
  ViewEvent / ChannelDailyStat aggregates.
- **Verified, not built:** suggestions endpoint with reason labels
  (`Same channel` / `Same topic` / `Viewers also watched` /
  `Similar length`) already exists and is tested; Content
  search/filter/pagination (`GET /studio/videos?q=&visibility=`)
  exists and is tested; Comments `?filter=unreplied` + reply via
  `POST /comment/post` with `parentId` exist and are tested; upload
  10 MB limit is enforced server-side twice (multer
  `limits.fileSize = MAX_UPLOAD_BYTES` in `Helper/filehelper.js`
  and the controller re-check in `Controllers/video.js`) — the
  preview's 84 MB example file is a preview error, the limit stays
  10 MB.
- **Honest absences (no faking):** traffic source — `GET
  /studio/analytics` still omits `trafficSources` entirely (no
  referrer is stored on ViewEvent; the client renders a "not tracked
  yet" state). Comment heart — there is NO backend heart endpoint;
  hearts stay session-local per the earlier cut, as before.
- **Arman's 11 Nov direction (delete legacy UI, Studio shell is the
  app shell):** mainly frontend — no backend route in this pass's
  touched surface is legacy-only, so no backend route was deleted.
  The endpoints the legacy Library/Watch-Later/Liked-Video pages used
  (`GET /studio/library`, `POST /video/watchlater`, like endpoints)
  are the same ones the Studio Library and Watch page use, so
  deleting them here would break the new UI; if the frontend worker
  finds an endpoint that becomes genuinely dead after the legacy
  pages are deleted, that deletion belongs in its report.

### 8.9 Verification pass — match-the-preview (11 Nov 2026, coordinator)

Independent verification of the two match-preview workers
(`a666549` backend, `dde0a20` frontend) on branch
`feat/acube-phase5-studio`. The workers' claims were re-checked, not
taken on trust — and the pass found real defects, fixed below. No
merge; PR #2 is updated by snapshot push only (see §8.9.6).

#### 8.9.1 End-to-end seed + demo-login verification (not just unit tests)

A throwaway script (deleted after use) seeded via `seedDemoData()`
against in-memory MongoDB, signed in via `POST /auth/demo-login`,
and called the Studio endpoints with the issued JWT:

- Seed summary: **1,503 view events / 113 likes / 11 videos
  (7 public)**, daily-stat and per-video-counter aggregates all
  1,503 / 113 — the seed's own assertion passed.
- `POST /auth/demo-login` as
  `demo-channel-codestreamer@demo.acube.test` → **200, Code
  Streamer**, normal 6h JWT.
- `GET /studio/overview` → **totalViews 1,503, totalLikes 113,
  totalVideos 7 (live), watchMinutes 5,918.65, watchHours 98.64**,
  top videos 239 / 228 / 221 / 214 / 203 (real per-video counters).
- `GET /studio/analytics?range=28` → views 1,503, **avgViewsPerVideo
  214.71, likeRate 0.08, watchHours 98.64**, 28 days, peak day 68.
- `GET /studio/videos?limit=50` → **total 11** (7 public + draft +
  unlisted + private + soft-deleted).
- `GET /studio/settings` → Code Streamer / @codestreamer /
  hello@demo.acube.test / India / watermark off.
- Watch-time cross-check: `ViewEvent.watchSeconds` sums to 355,119 s
  = **98.64 h**, exactly the overview's `watchHours`. No hardcoded
  totals anywhere in this chain; `watchMinutes` (backend) and the
  frontend's `watchMinutes / 60` formatting agree — no shape
  mismatch between the workers.

#### 8.9.2 Fresh uncached counts (after the §8.9.4 fixes)

| Check | Command | Result |
|---|---|---|
| Test (turbo, forced) | `pnpm test --force` | **API 191/191 (12 files) + web 116/116 (16 files) = 307, exit 0** |
| Lint (forced) | `pnpm lint --force` | exit 0, **0 errors, 6 warnings** (pre-existing legacy files; was 7 in §8.7 — one went away with the deleted legacy files) |
| Typecheck (forced) | `pnpm typecheck --force` | exit 0, 3 tasks |
| Build (forced) | `pnpm build --force` | exit 0 (web ~13 s; API build is the syntax check, same "no output files" note as Phase 4) |
| Playwright Phase 5 | `pnpm --filter @acube/web test:e2e:phase5` | **10/10 passed** |
| Playwright Phase 4 | `pnpm --filter @acube/web test:e2e` (final re-run via `playwright test -c playwright.config.ts` against the same fresh build) | **15 passed, 1 skipped** (was 14/1 — a new 4b test covers the deleted legacy URLs 404ing) |

No flakes in the final runs. Two environment incidents, both
recorded honestly: (1) the first Phase 5 e2e run failed **10/10**
because `/tmp` (512 MB tmpfs) was full — two orphaned ~201 MB
`mongo-mem-*` dirs from earlier vitest/e2e runs left only 97 MB
free and the in-memory mongod died with `ENOSPC` / `InterruptedAtShutdown`.
Cleaning the orphans and re-running gave green; `/tmp` was left at
3% used. (2) The first Phase 4 e2e run after the deletions failed
5 tests — all stale specs, fixed in §8.9.4, not app regressions.

#### 8.9.3 Fresh screenshots

Retaken 11 Nov 2026 with demo data loaded via demo-login as Code
Streamer, desktop 1280×800 + mobile 390×844, full-page, zero page
errors on every screen: `phase5-dashboard-full/mobile.png`,
`phase5-content-full/mobile.png`, `phase5-analytics-full/mobile.png`,
`phase5-upload-full/mobile.png`,
`phase5-upload-step2-full/mobile.png` (step 2 with a small file
picked — the old step-2/step-3 shots were from 10 Nov),
`phase5-comments-full/mobile.png`,
`phase5-settings-full/mobile.png`. The Phase 5 + Phase 4 e2e runs
also re-took `studio-*.png`, `home.png`, `search.png`,
`theme-dark.png`, `watch.png`, `library.png`, `history.png`,
`premium.png`, `streamroom.png`, `videopage.png`,
`library-guard.png`, `chat.png`.

#### 8.9.4 Defects found in this pass — all fixed, all tested

1. **Phase 5 e2e spec was stale after `dde0a20`** (the frontend
   worker never re-ran it). Test 2 still expected the old 6-card
   dashboard ("Total likes", "Total comments", "Watch minutes");
   test 4 still expected a "Best day" card the preview rewrite
   removed. Updated to the preview-matched 4-card layout with the
   same seeded numbers (7 views / 2 likes / 1 video / 0.2 hrs from
   12.5 watch minutes; Analytics 7 / avg 7 / 28.6% / "Not tracked
   yet" / "Peak · 7 views"). The labels render CSS-uppercased, so
   the assertions match the rendered caps text. No assertion was
   weakened — the old labels are now asserted ABSENT.
2. **Phase 4 e2e specs were stale after the legacy deletion**
   (5 failures): `.logo_title_navbar` "Your-Tube",
   `.searchIcon_SearchBar`, `.themeContainer`/`.theme_box`, and the
   guarded-routes list containing the deleted pages. Updated to the
   TopBar (Acube wordmark, Search submit button, one-button theme
   toggle asserting the body class flips and flips back) and to the
   live guarded routes; a new test 4b asserts the four deleted URLs
   404 with the "404 — Page not found" page.
3. **Dashboard "Videos" split counted the soft-deleted trailer as
   public** — the screenshot read "8 public · 1 private" against a
   card that says 7 live videos. `Dashboard.tsx` now excludes
   `deletedAt` rows from the split (and keeps the legacy
   no-visibility-means-public rule). Test: a soft-deleted row in the
   MSW videos list leaves the split at "3 public · 0 private".
4. **Studio shell avatar showed "CO"** (first two characters of
   "Code Streamer") instead of the preview's "CS". `Studio.tsx` now
   uses word initials, like Settings already did. Test: mock channel
   "Test User" renders "TU", not "TE".
5. **Dashboard Latest comments showed the commenter's name**; the
   preview shows a relative time ("2h ago"). Now renders
   `formatDistanceToNow` ("about 2 hours ago"), falling back to the
   name only when no timestamp exists. Test with a 2-hour-old
   mocked comment.
6. **Content dates were ISO** ("2026-11-11", wrapping mid-token in
   the narrow column); the preview shows "22 Nov 2024". Now
   `en-GB` short format in UTC ("11 Nov 2026"). Test asserts
   "1 Nov 2026" and no ISO string.
7. **Every Content row showed a broken-image icon**: the seeded
   thumbnail URLs are `example.com` placeholders that 404. New
   shared `Component/VideoThumb.tsx` renders a neutral 16:9 ▶ block
   when the image fails to load; wired into Studio Content,
   Playlist, and the UploadWizard thumbnail preview (which resets
   its broken state when the URL changes). Test: `fireEvent.error`
   on a row thumb swaps in the "Video thumbnail unavailable"
   fallback and removes the `<img>`.
8. **All 8 seeded comments read "less than a minute ago"** — the
   seed never set `commentedon`. `seedDemo.js` now staggers them
   (45 min / 1 h / 2 h / 3 h / 4 h / 5 h / 1 d / 2 d, matching the
   preview inbox's spread). API test asserts the spread (oldest
   > 24 h, newest < 1 h, not all equal).
9. **Stale prose references to deleted components**: `apps/web/README.md`
   still listed `Drawersliderbar`/`Leftsidebar`/`ProgressRing`/
   `Searchlist` as live legacy files and described the deleted
   `ProgressRing`; `query/hooks.ts` still mentioned the deleted
   `Showvideolist` filter. Both updated. Remaining mentions of the
   deleted names are intentional comments explaining the deletion.

#### 8.9.5 Per-screen comparison vs preview images 9–15 (fresh screenshots)

Status: **Matched** · **Differs** (real, listed plainly) ·
**Explicit cut** (needs Arman's decision). "Demo data" = the seed's
stand-in content (titles/tags/text are labelled demo content — the
real catalogue titles were never recorded anywhere in the repo), not
an app bug. The verdict is still **not "no single difference"** —
the remaining diffs are listed here, none hidden.

| Preview field/control (images 9–15) | Status | Note |
|---|---|---|
| Dashboard: 4 KPI cards, 1,503 / 113 / 7 | Matched | Real aggregates (§8.9.1). |
| Dashboard: Watch time | Matched (more) | **98.6 hrs** real, from 5,918.65 watch minutes. The preview itself shows "— hrs" ("New in Phase 5 · needs view events") — the preview's placeholder, now filled by real events. |
| Dashboard: Videos subtext | Matched | "7 public · 1 private" after fix #3 (was "8 public · 1 private"). |
| Dashboard: Top performing videos, red bars | Matched | 239 / 228 / 221 / 214 / 203, real per-video counters. Long demo titles truncate with "…" in the narrow title column — the preview's titles are short. Minor, still differs. |
| Dashboard: Latest comments + Reply | Matched | 5 comments, relative times after fix #5, Reply links to the inbox. |
| Dashboard: shell identity "CS" avatar | Matched | After fix #4. |
| Content: columns Video/Visibility/Date/Views/Likes, search + filter + bulk-select, "Edit details", visibility dropdown, View analytics, Delete/Restore | Matched | Deleted trailer row shows "Deleted" + Restore. Actions stack vertically (no overlap — the §8.6(2) overlap diff is closed). |
| Content: header count | Differs | **"11 videos"** vs preview's "7 videos": the seed deliberately has 11 rows (7 public + draft + unlisted + private + soft-deleted) so every visibility state is exercisable. |
| Content: dates | Matched | "11 Nov 2026" after fix #6; wraps to two lines in the narrow DATE column. |
| Content: thumbnails | Matched | ▶ placeholder blocks after fix #7 — no broken-image icons anywhere. |
| Content: mobile | Matched (scroll wrapper) | Page is 390 px wide; the table scrolls horizontally inside its wrapper. The §8.6(2) 547 px page-overflow diff is closed. |
| Analytics: chart + 4 cards, 1,503 / 215 / 7.5% | Matched | Real aggregates; chart is the real 28-day series (Peak · 68 views — the preview's 148 is its illustrative shape). |
| Analytics: range control | Differs | Buttons "Last 7 / 28 / 90 days" instead of the preview's "Last 28 days ▾ · All videos ▾" dropdowns. Same ranges, different control. |
| Analytics: Top source | Explicit cut | "Not tracked yet" + honest note — no referrer is stored on ViewEvent. Unchanged from §8.6(1). |
| Upload step 1 / step 2 | Matched | Step 2 shows file card, Title (required) / Description / Tags, PREVIEW thumb, Visibility Public/Private/Draft, Publish + Save as draft — as in image 12. |
| Upload: progress + file size | Differs (preview wrong) | Step 2 progress bar sits at 0% before Publish (the preview shows a mid-upload 68%); the preview's 84 MB example file exceeds the enforced 10 MB limit — the limit stays 10 MB, the preview is wrong here. Step 2 also has an extra "Back" button and a Thumbnail URL field the preview does not show. |
| Comments: table Comment/Video/When/Actions, Reply · Heart · Delete, Unreplied filter, Pinned badge | Matched | All 8 seeded comments, staggered times after fix #8 (about 1 hour ago … 2 days ago), pinned badge on the creator comment. Actions wrap so Delete sits on a second line at desktop width — the preview shows them inline. Minor, still differs. |
| Comments: Heart | Explicit cut | Session-local only, labelled honestly under the table. Unchanged from §8.6(1). |
| Settings: banner + avatar, 2-column grid, red toggles, Save/Discard + unsaved indicator | Matched | Gradient banner renders (seeded URL does not resolve, so the gradient shows, never a broken icon); avatar falls back to "CS" initials. |
| Settings: field values | Demo data | Description "Demo channel — full-stack tutorials…", contact email hello@demo.acube.test, links Website/Docs, watermark OFF — the seed's values, not the preview's text ("Short, honest videos…", hello@codestreamer.example, GitHub · Portfolio, watermark ON). |
| Settings: handle "✓ available" | Differs | No handle-availability endpoint exists, so no "✓ available" state is ever rendered; uniqueness is enforced server-side on save (HANDLE_TAKEN). A real live check needs a backend endpoint — Arman's decision. |
| Settings: extra URL fields, Upload-default control, Channel URL | Differs | "Banner image URL" / "Profile picture URL" fields are additions (the preview has only Change/Remove); Upload default uses a visibility select + comments toggle instead of the preview's "Edit ▾"; Channel URL shows the local origin (`http://localhost:4173/@codestreamer`) — correct per environment, the preview shows acube.app. |
| Settings: mobile | Matched | Page fits 390 px; Links rows wrap. The §8.6(2) 580 px overflow diff is closed. |
| Shell: nav, red active pill, "Back to Acube / Your channel" | Matched | No "Send feedback" footer link (the preview's image 14 shows one). Minor, still differs. |
| Shell: mobile tabs | Matched | Horizontal-scroll tab row; Upload / Channel settings sit off-screen until scrolled. |
| TopBar (watch side) | Matched | Acube wordmark, search, Studio + Upload, theme toggle, avatar menu; verified by the updated Phase 4 e2e (tests 1, 2, 9) and the web unit tests. |

**§8.6(2) status after this pass.** Of the eight remaining UI
diffs: **closed** — Draft in Top videos (live-only rule, §8.8),
Comments list-not-table / no Unreplied filter / no pinned badge in
the inbox (table + filter + badge in `dde0a20`), Content "View
analytics" overlap (stacked actions), mobile Content overflow,
mobile Settings Links overflow. **Still open** — no
handle-availability check (needs a backend endpoint — decision),
no Autoplay toggle, History missing per-row like/save annotations.
The six §8.6(1) explicit cuts (Subscribe, CC/HD, traffic source,
comment-heart backend, banner/avatar file upload, chapters) are
unchanged and still need Arman's decision.

**§8.3 corrections.** The §8.3 table's per-channel numbers are
stale: the seed is now ONE channel, so Dashboard/Analytics show
**1,503 / 113 / 7** (not 613 / 49 / 4), avg **215**, like rate
**7.5%**, and the "Best day" and "Watch minutes" extra cards in D
are gone (the Analytics screen is now exactly the preview's 4
cards). Timestamps in F are staggered, not "7 minutes ago". The
banner/avatar broken icons in G are gone (gradient + initials
fallback). Everything else in §8.3 stands.

#### 8.9.6 Demo sign-in for Arman (local) — updated instructions

Prerequisites: a local MongoDB. The seed refuses a DB_URL
containing "atlas" or "prod" unless `SEED_DEMO_ALLOW_REMOTE=1` is
set — demo data must never land in a production database.

```powershell
# PowerShell (Windows, from the repo root D:\web development\project\Acube)
$env:DB_URL = "mongodb://127.0.0.1:27017/acube"
pnpm --filter @acube/api seed:demo
# or: node apps/api/scripts/seed-demo.js   (same, from the repo root)
```

```bash
# macOS / Linux / WSL (same, from the repo root)
DB_URL=mongodb://127.0.0.1:27017/acube pnpm --filter @acube/api seed:demo
```

The seed is idempotent (clears `demo:true` rows first, re-inserts,
asserts 1,503 views / 113 likes) and prints a JSON summary. Then:

1. Start the API with the demo-login flag (never in production):
   `DEMO_LOGIN_ENABLED=1 pnpm --filter @acube/api dev`
   (or `DEMO_LOGIN_ENABLED=1 node apps/api/index.js`). The flag must
   be exactly `1`, and `NODE_ENV` must not be `production` — otherwise
   the route 404s.
2. Sign in as the demo channel (no Google account, no OTP):
   `POST http://localhost:5000/auth/demo-login` with body
   `{ "email": "demo-channel-codestreamer@demo.acube.test" }`
   (e.g. `curl -X POST localhost:5000/auth/demo-login -H
   "Content-Type: application/json" -d
   '{"email":"demo-channel-codestreamer@demo.acube.test"}'`).
   The response carries the normal 6h JWT (`{ result, token }`).
   Any `demo-viewer-NN@demo.acube.test` (NN = 01–24) works the same
   way; a real or unknown email gets the same 404.
3. In the web app, store the session as the `Profile` localStorage
   entry (`{ result, token }`) — or sign in through the UI once a
   Google flow is wired — then open `http://localhost:3000/studio`
   (dev) or the preview/production URL's `/studio`.

What Arman should see: **Channel dashboard — Total views 1,503,
Likes 113, Videos 7, Watch time 98.6 hrs**; Top performing videos
239 / 228 / 221 / 214 / 203; Latest comments with relative times;
Content listing 11 videos (7 public + draft + unlisted + private +
soft-deleted trailer with Restore); Analytics 1,503 / 215 / 7.5%
with Top source "Not tracked yet"; Comments inbox of 8 with
staggered times and a 📌 Pinned badge; Settings prefilled for Code
Streamer (@codestreamer). Note the demo video titles/tags are
stand-ins — the real catalogue titles were never recorded — and the
thumbnails are ▶ placeholders because the seeded `example.com`
media URLs do not resolve.

#### 8.9.7 Deletion list — verified complete

The 29 files deleted in `dde0a20`, all confirmed gone from disk
with no remaining import/route reference (only intentional comments
explaining the deletion, plus the two prose fixes in §8.9.4 #9):

- `apps/web/src/Component/Comment/Comment.css`,
  `Comment.tsx`, `Displaycommment.tsx`
- `apps/web/src/Component/Leftsidebar/Drawersliderbar.jsx`,
  `Leftsidebar.css`, `Leftsidebar.jsx`, `shorts.png`
- `apps/web/src/Component/Navbar/Navbar.css`, `Navbar.tsx`,
  `Searchbar/Searchbar.css`, `Searchbar.tsx`, `Searchlist.css`,
  `Searchlist.jsx`, `ThemeBox.tsx`, `logo.ico`
- `apps/web/src/Component/ProgressRing/ProgressRing.css`,
  `ProgressRing.jsx`
- `apps/web/src/Component/Showvideolist/Showvideolist.tsx`
- `apps/web/src/Component/WHL/WHL.css`, `WHL.tsx`,
  `WHLvideolist.tsx`
- `apps/web/src/Pages/Likedvideo/Likedvideo.tsx`
- `apps/web/src/Pages/Videoupload/Videoupload.css`,
  `Videoupload.tsx`
- `apps/web/src/Pages/Watchhistory/Watchhistory.tsx`
- `apps/web/src/Pages/Watchlater/Watchlater.tsx`
- `apps/web/src/Pages/Yourvideo/Yourvideo.css`, `Yourvideo.tsx`
- `apps/web/src/test/upload.test.tsx`

Clarifications against the handoff wording: the old Videopage
*page* is gone — `/videopage/:id` redirects to `/watch/:id` — but
the `Pages/Videopage/` directory still holds
`Likewatchlatersavebtns.tsx`, which the rebuilt Watch page still
uses (Like / Dislike / Thanks / Download only; Save/Share moved
out in §8.7). `Pages/Watch/Player.tsx` is the current rebuilt
Watch player, not a deleted legacy file. The old Library *page* is
gone; `Pages/Library/LibraryHub.tsx` is the current hub. No backend
route was deleted: the endpoints the legacy pages used are the same
ones Studio / Library / Watch use. No files were added to the
deletion list in this pass.

#### 8.9.8 Still needing Arman's decision

- The six §8.6(1) explicit cuts, unchanged: Subscribe (no follow
  system), CC/HD (no captions/renditions), traffic source (no
  referrer stored on ViewEvent), comment-heart backend (hearts stay
  session-local), banner/avatar file upload (preview-only, no
  endpoint), chapters (no chapter data).
- A live handle-availability check ("✓ available" in Settings):
  honest absence today — needs a backend endpoint if wanted.
- Autoplay toggle in the Watch showcase (preview shows "Autoplay
  ON"; no autoplay behaviour exists).
- History per-row like/save annotations ("You liked this", "Saved
  to Watch Later", clock times) — work, not a decision, but
  unstarted.
- Content lists 11 videos vs the preview's 7 — the seed's extra
  draft/unlisted/private/deleted rows are deliberate (every state
  exercisable); if Arman wants the Content header to read 7, the
  seed model is the thing to change, not the UI.
- The demo catalogue titles/tags/descriptions are stand-ins. If
  Arman supplies the real 7 titles (or the real catalogue), the
  seed can carry them.
- Screenshots still need Arman's local push from his machine, and
  the snapshot push itself is BLOCKED until he re-grants the App
  access to the Acube repo (see §8.9.9); `ci.yml` is included in
  the snapshot manifest once the push goes through.
  Nothing was merged.

#### 8.9.9 PR #2 state — SNAPSHOT PUSH BLOCKED (11 Nov ~03:00 IST)

PR #2 (https://github.com/Mr-armanalam/Acube/pull/2,
`feat/acube-phase5-studio`) is **open, not merged, head still
`5396f9cc`** — the snapshot push from this pass did **not** land.
The push was prepared exactly as in Phases 4–5 (manifest: 255
UTF-8 files, 1.51 MB, binaries excluded; remote head verified to
match the sync record's last entry `5396f9cc`; local commit
`8f902c2` ready), the approval card was approved, and GitHub
answered `403 Resource not accessible by integration` on
`POST /repos/Mr-armanalam/Acube/git/trees` — the Muse GitHub App
installation currently has no write access to the Acube repo. This
is the same failure mode PHASE4_REPORT.md §4 documents (the App
*does* have write on `armanalam-portfolio`); the earlier Phase 5
snapshots (up to `5396f9cc`, 10 Nov 19:57 UTC) succeeded, so the
installation's access changed after that. **No partial commit was
created and the sync record was NOT advanced** — the record still
ends at `5396f9cc`, so a later retry will not double-push.

**Unblock step (Arman, ~1 minute):** open
https://github.com/apps/meta-muse-ai/installations/new and select
the **Acube** repository for the Muse GitHub App (same step as for
the portfolio repo), then tell Muse to retry the snapshot push.
The retry is just re-running the push with the existing manifest
(`/tmp/acube-snapshot-paths.txt`, 255 paths) and the local commit
`8f902c2` — no work needs redoing.

What the (blocked) snapshot would have carried: one squashed
commit on top of `5396f9cc` with the current working-copy content
(the two worker commits' changes + this verification pass's fixes,
tests, and this report); it does **not** carry the local commit
history (`a666549`, `dde0a20`, `8f902c2` stay local-only). It
**would have included `.github/workflows/ci.yml`** — tracked
locally since the Phase 5 base commit `bb76901` but never
snapshot-pushed before, so CI would run on the PR. Still excluded
even after the unblock (the connector cannot carry binaries):
all 43 binary files (40+ screenshots in `docs/screenshots/`,
`apps/web/public/log.ico`, `apps/web/public/shorts.png`) — those
need Arman's local push from his machine. **Known limitation,
stated plainly: the snapshot cannot delete files, so the 27
deleted legacy files listed in §8.9.7 that were in the previous
snapshot (all but the 2 binary ones, `shorts.png` and `logo.ico`,
which were never pushed) remain as stale copies on the GitHub
branch after the push.** Only a real `git push` from a full local
clone (Arman's machine) can remove them; the app does not import
them, so they are dead weight, not live code. Arman merges PRs
himself; do not merge #2 as part of this pass.

#### 8.9.10 Upload wizard fix (11 Nov 2026, branch `feat/acube-upload-wizard-fix`)

Arman reported three upload-wizard bugs with screenshots: Step 1
looks generic, Step 2 fails with HTTP 400, and the preview does not
work. Fixed on a NEW branch off `1d8fddb`
(`feat/acube-upload-wizard-fix`); `feat/acube-phase5-studio` and
PR #2 are untouched. Commits: `7da4877` (API), `bec2a7a` (web),
`9335e14` (e2e + cwd fix). No merge; no push (GitHub connector
still blocked 403 — same as §8.9.9).

**Step 1/2/3 vs image-16.png (target) + image-17.png (before).**
image-16 is the YouTube-Studio modal to match; image-17 is the old
wizard's Step 1 (plain file input, "Step 1 of 3 — File · resumable
upload, server-validated · max 10 MB", "demo.mp4 · 2.0 MB",
"Continue to details"). The new Step 1 IS the image-16 modal:
centred dark panel (`#0C0B0A`, `#F2EEE6` text, `#E8482F` accent),
"Upload videos" title, close X top-right, large grey circle with
upload-arrow icon, "Drag and drop video files to upload", white pill
"Select files" (`phase5-upload-step1-modal-full/mobile.png`). Drag-
and-drop really works (drop → validated → preview); X / backdrop /
Escape close the modal back to Content. Step 2 is Details
(title/description/tags/thumbnail URL/visibility). Step 3 is a real
Review & Publish screen (video preview + entered-details summary +
Publish / Save as draft). The wizard is genuinely 3 steps now — the
old one claimed "Step {n} of 3" with only 2 steps and published from
Details. All false copy is gone ("resumable upload", "upload
continues in background", "server-validated", the fake 84 MB
example); the only claims left are true ones (mp4, max 10 MB).

**The Step 2/3 400 — root cause was Cloudinary, not the payload**
(diagnosis confirmed, not re-litigated). The multipart POST was
exactly right and Zod validation passed; the controller then called
`uploadOnCloudinary()`, which returns null when
`CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` are unset (SDK throws
"Must supply api_key"), and the controller turned that into
`400 {"message":"Failed to upload video to cloudinary"}` for every
upload. Before: any upload without Cloudinary credentials → 400.
After: the upload succeeds without Cloudinary — see the fallback
below. The Cloudinary-configured path is unchanged (mocked-Cloudinary
tests still assert the Cloudinary URL, duration 42, thumbnail URL).

**Local-storage fallback (the fix, at the API layer).** When no
Cloudinary credentials are configured (`isCloudinaryConfigured()` in
`apps/api/cloudinary.js`, checked per request), the multer file is
kept under `apps/api/uploads/` and stored as
`filepath: /uploads/<sanitised-filename>`, served by the existing
`/uploads` static route. It is explicit and logged — `console.warn`
on every fallback upload, naming the three env vars that would switch
to Cloudinary — never silent; the DB row is distinguishable by its
local filepath. `duration`/`durationSec`/`thumbnail` stay `null`
(never invented). Zod validation is untouched (still strict).
Two more defects fixed with it: (f) the server now uses `req.userid`
as the channel owner and ignores the client-supplied `chanel`
(a request could previously file a video under someone else's
channel); (g) the client validates the thumbnail URL before submit
(invalid → inline error, no request sent).

**Second 400 found by the e2e run (not in the diagnosis).** Multer's
destination (`"uploads"`) and the `/uploads` static route both
resolved against `process.cwd()`. Under Playwright the API starts
from `apps/web`, where `uploads/` does not exist, so the upload
failed with `ENOENT: no such file or directory, open
'uploads/2026-…-demo.mp4'` — surfaced verbatim by the new error
handling, which is how it was caught. Both paths now resolve against
the API app root (`apps/api/uploads`, created on import), so uploads
work from any cwd. The API vitest suite runs with cwd `apps/api`,
so this only ever bit e2e/manual runs from another directory.

**Preview (was never implemented).** Real `<video>` with
`URL.createObjectURL(file)` in Step 1 once a file is picked and on
the Step 3 review screen (revoked on file-change/unmount, never
while displayed); Step 2 shows a frame of the picked video, else the
pasted thumbnail URL, else the shared `VideoThumb` ▶ placeholder.
The orange-gradient "preview" is gone, as is the broken-image risk.

**Error surfacing.** New `extractApiErrorMessage`
(`apps/web/src/utils/apiError.ts`) pulls `response.data.error.message`
+ field details or `response.data.message` out of axios errors;
`useUploadVideo`'s `onError` and the wizard submit both use it, so
the user sees e.g. "Failed to upload video to cloudinary" or
"thumbnailUrl: must be a valid URL" — never axios's generic
"Request failed with status code 400".

**Size alignment (defect (e)).** Client `MAX_VIDEO_BYTES` is now
`10 * 1024 * 1024` — the server limit — not the round `10_000_000`.
A file between 10,000,000 and 10,485,760 bytes used to be rejected
client-side while the server would have accepted it.

**Fresh counts (all exit 0, uncached).**

| Check | Command | Result |
|---|---|---|
| API tests | `pnpm --filter @acube/api test` (vitest run) | **198/198 (13 files)** — incl. 7 new local-fallback tests (`video-upload-fallback.test.js`: fallback success + local filepath + file on disk + details saved, `chanel` override to `req.userid`, `/uploads` serving, draft hidden from feed, validation still 400 with field details; `isCloudinaryConfigured` false/true matrix) |
| Web tests | `pnpm --filter @acube/web test` (vitest run) | **129/129 (17 files)** — incl. 13 new `uploadWizard.test.tsx` (modal, drag-drop select, non-mp4 + oversize inline errors, 10 MiB edge at `MAX_VIDEO_BYTES - 1`, modal close, Step 2 video frame, thumbnail-URL block with zero requests sent, Step 3 review, Publish, draft, both server error shapes). `phase5fix` + `studioPreview` stale specs updated to the 3-step flow and the aligned 10 MiB limit |
| Typecheck | `tsc --noEmit` (app + node configs) | exit 0 |
| Lint | `pnpm lint` (both apps) | exit 0, **0 errors, 6 warnings** (pre-existing, same as §8.9.2) |
| Playwright e2e | `playwright test -c playwright.phase5.config.ts e2e-phase5/upload-wizard.spec.ts` | **3/3** — full flow Step 1 → 2 → 3 → Publish against the real API with NO Cloudinary credentials (video in Content with details saved, local `/uploads` filepath serves `video/mp4`, `videochanel` is the authed user); drag-and-drop select + non-mp4 rejection; X closes to Content. Existing `phase5.spec.ts` still **10/10** in the same runs |
| Screenshots | `node e2e-phase5/upload-wizard-screenshots.mjs` | exit 0, **7 shots, no page errors** (socket.io polling 404s excluded — the e2e server does not mount socket.io) |

**Fresh screenshots** (`docs/screenshots/`, desktop 1280×800 +
mobile 390×844, real 1-second ffmpeg mp4 so the previews show a
frame): `phase5-upload-step1-modal-full/mobile.png`,
`phase5-upload-step2-full/mobile.png`,
`phase5-upload-step3-full/mobile.png`,
`phase5-upload-published-full.png` (Content shows "How I plan my
week", Public, 11 Nov 2026). The Step 1 shot matches image-16
field for field; the Step 3 shot shows the video actually playing
(0:00/0:01 with controls) next to the entered details. The
screenshots script is new (`apps/web/e2e-phase5/
upload-wizard-screenshots.mjs`, same pattern as `screenshots.mjs`,
whose stale upload block — it clicked a "Continue to publish"
button that never existed — was fixed to "Continue to review").

**Not verified / open.** Real Cloudinary credentials were never
available in this environment, so the Cloudinary-configured path is
verified only with the mocked upload (as before) — the fallback is
what is proven end to end. The Content rows in the published shot
show no thumbnail image (same as the seeded row — pre-existing
Content rendering, not part of this fix). No `any`, no ts-ignore,
no tests excluded from typecheck.

**Lesson recorded (cost ~40 min of debugging).** Tool output
redacts secret values, replacing them with a plausible-looking
placeholder — the e2e JWT secret displayed as one value while the
file on disk (`e2e-server.mjs:18`, verified byte-for-byte with `od`)
held another. The first e2e runs failed with 401s because the spec
copied the displayed placeholder. Rule: never copy a secret from
rendered tool output; read the file bytes (`od`/hexdump) or the
minting code.
