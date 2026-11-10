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
| Duplicate Save/Share | Differs | Two Save + Share rows render (legacy action row and the Phase 5 pill row). |
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
2. **Nine remaining UI diffs (no decision needed, just work):**
   mobile Content table overflow (547 px), mobile Settings Links
   overflow (580 px), Content "View analytics" overlapping
   Delete/Restore, duplicate Save/Share on Watch, Draft listed in
   Top videos (Dashboard + Analytics), Comments list-not-table with
   no Unreplied filter and no pinned badge in the inbox, no
   handle-availability check, no Autoplay toggle, History missing
   per-row like/save annotations. None blocks the PR; all are visible
   in the screenshots.
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

