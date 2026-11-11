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
#### 8.9.11 Content cleanup (11 Nov 2026, branch `feat/acube-content-cleanup`)

Studio Content rebuilt to the preview image-20 layout, on the
cleanup branch off the upload-wizard work; nothing merged, nothing
pushed. The per-video analytics endpoint the menu links to did not
exist before this branch — every Content row previously linked to
the same channel-level page.

**What changed vs image-19 (old UI) and image-21 (old inline edit).**
Image-19: each row had an "Edit details" button under the title, a
visibility `<select>` next to the pill, and "View analytics" +
"Delete" buttons stacked in an ACTIONS column; no thumbnails.
Image-21: clicking Edit details turned the row itself into inputs
(title / description / tags / thumbnail URL) with Save / Cancel
inside the row. Both are gone. The new table (image-20) is Video
(gradient thumb + title) / Visibility (pill only) / Date / Views /
Likes, with only a pencil ✎ and a ⋯ icon button per row; every
action lives in a popup menu — Edit details (opens a modal, never
inline editing), Change visibility (chooser), View analytics
(navigates to the per-video page), Delete (soft-delete, Restore
offered in the same menu). Draft rows show "—" for date/views/likes.
Bulk-select stays as a slim hover checkbox column with a bulk bar
that appears only while a selection exists (the preview's subtitle
already promises "bulk-select"; image-20 itself shows no checkbox
column, so this is the one deliberate deviation from the image).
The footer note now reads "(soft-delete, restorable)" — see the
restore wording below.

**Per-video analytics endpoint + wiring.** New
`GET /studio/videos/:id/analytics` (`apps/api/Controllers/studio.js`
`getVideoAnalytics`, route in `apps/api/Routes/studio.js` with
`videoIdParamSchema` + the analytics range query schema). Owner
only: a non-owner gets 403 even for a public video; a missing or
soft-deleted video is 404. The daily series comes from the
`ViewEvent` audit trail (one counted view per viewer per video per
day, the same dedup rule as `recordView`); `watchMinutes` is derived
from completions with the SAME capped formula `recordWatchComplete`
uses for the channel stat (`min(durationSec ?? duration, 600) / 60`
per completion), so it is exactly this video's contribution to the
channel total, never invented. Daily likes are DELIBERATELY ABSENT:
`ChannelDailyStat` likes are channel-level toggle deltas with no
per-video split, and `Likedvideo` rows only record current likers
(an unlike deletes the row), so no honest per-day like series exists
for one video — the all-time Like counter lives on `video.likes`
instead. Deliberately NOT cached (unlike the channel endpoint): the
aggregate is one indexed query, and a view that just happened
should show at once. Client wiring: `getStudioVideoAnalytics` in
`apps/web/src/Api/index.ts`, query key
`["studio", "videos", id, "analytics", range]`,
`useStudioVideoAnalytics` in `apps/web/src/query/hooks.ts`; the
Analytics page reads `?video=` (`useSearchParams`) and renders the
per-video view (title + pill, Views/Completions/Watch time/Best day
cards, all-time views · likes note) instead of the channel view;
without `?video=` the page is exactly the channel view it always
was. The Content menu's "View analytics" links to
`/studio/analytics?video=<id>`.

**Honest restore wording (indefinite — no 30-day enforcement).**
The preview image-20's own note says "soft-delete, 30-day
restore", but the API enforces no expiry anywhere: a soft-deleted
video stays listed in the owner-only `GET /studio/videos` (so the
owner can restore it) with no deadline, and restore is a plain
owner-checked endpoint. The UI now says what is true instead of
repeating the preview's claim: the table note reads
"(soft-delete, restorable)" and the delete confirm reads
"Soft-delete — restorable any time from this menu." The only place
that still said "30-day restore" was a stale unit-test expectation
(`studioPreview.test.tsx`), fixed in verification to match the
product. After the fix, the only "30-day" string left in
`apps/web/src` / `apps/api` is the code comment stating there is no
30-day expiry.

**Fresh counts (all exit 0, uncached, real exit codes).**

| Check | Command | Result |
|---|---|---|
| Typecheck | `pnpm typecheck --force` | exit 0 |
| API tests | `pnpm --filter @acube/api test` (vitest run) | **209/209 (15 files)** — incl. 8 new `studio-content.test.js` (Content rows incl. fields the table renders, per-video analytics series + totals + bestDay, range=7 / zero-event 0s, 400/401/403/404 incl. soft-deleted 404, non-owner 403 regression across edit/visibility/delete/restore/analytics) |
| Web tests | `pnpm --filter @acube/web test` (vitest run) | **143/143 (18 files)** — incl. 11 new `studioContent.test.tsx` (menu open/close incl. Escape + backdrop, edit modal save, visibility chooser, delete confirm → soft-delete → Restore, thumbnail fallback) |
| Lint | `pnpm lint --force` | exit 0, **0 errors, 6 warnings** (pre-existing, same as §8.9.2 — ChatSearch, SidebarAllGroups, RoomContext, ThemeProvider, authSlice; none in the touched Content/Analytics files) |
| Build | `pnpm build --force` | exit 0 |
| Playwright e2e | `playwright test -c playwright.phase5.config.ts e2e-phase5/content-cleanup.spec.ts` (new spec, run separately — it renames the seeded video, and `phase5.spec.ts` asserts the original title; each invocation restarts the servers with a fresh seed) | **6/6** — table matches image 20 (headers, no per-row controls, gradient thumb, no "30-day" text); Change visibility → Private persists and back to Public; View analytics after one real Watch-page view renders 1 view / 0 completions / 0 min / best day today / "All-time: 1 views · 0 likes"; Delete → "Deleted" badge, row stays listed, Restore brings it back; Edit modal save persists to the Watch page; mobile 390px has no document-level horizontal overflow (see defects below) |
| Playwright e2e (regression) | same config, `e2e-phase5/phase5.spec.ts e2e-phase5/upload-wizard.spec.ts` | **13/13** — Phase 5 suite 10/10, upload wizard 3/3 |

**Fresh screenshots** (`docs/screenshots/`, desktop 1280×800 +
mobile 390×844, from the new spec): `phase5-content-clean-full/
mobile.png`, `phase5-content-menu-full/mobile.png`,
`phase5-content-edit-modal-full/mobile.png`. Visually inspected:
the table shot matches image-20 (green gradient ▶ thumb + title,
Public pill, "11 Nov 2026", 0 / 0, ✎ + ⋯ only, "(soft-delete,
restorable)" note) — the seeded e2e run has 1 video where the
preview shows 7, and the slim checkbox column is the deliberate
bulk-select deviation noted above. The menu shot shows all four
items (Edit details / Change visibility / View analytics / Delete
in red), fully visible, floating below the row. The modal shot is
clean (title / description / tags / thumbnail URL, Save red +
Cancel, dimmed backdrop). Mobile: no page-level overflow, the table
scrolls inside its wrapper; the modal fits. No broken-image icons
anywhere — the seeded video has no thumbnail URL, so `VideoThumb`
renders the deterministic gradient ▶ span, never an `<img>`.

**Defects found in verification — all fixed in place, all re-tested.**

1. *Stale "30-day restore" test.* `studioPreview.test.tsx`
   asserted `/Row actions:.*soft-delete, 30-day restore/` while the
   product says "restorable". One-line test fix (regex →
   `/soft-delete, restorable/` + comment); the product wording was
   already right. First full `pnpm test` run was 1 failed / 142
   passed because of this; after the fix 143/143.
2. *Mobile 390px horizontal overflow — real, pre-existing.*
   `document.documentElement.scrollWidth` was **714** at a 390px
   viewport. Root cause, measured: `.studio-main` has
   `margin: 0 auto`, and in the ≤768px column flex layout an auto
   cross-axis margin disables stretch, so main sized to its content
   — the table's 680px `min-width` forced main to 714px
   (680 + 32 padding + 2 border). The `.studio-table-wrap`
   `overflow-x: auto` was never the problem; it could not contain a
   parent that was already 714 wide. Fix: `.studio-main { margin: 0 }`
   inside the ≤768px media query only (`Studio.css`) — stretch
   applies again, main is exactly the viewport wide, the table
   scrolls inside its wrapper. Desktop is a row flex layout and is
   unaffected. Verified by the e2e mobile test (was failing 714,
   now passes) and the mobile screenshots.
3. *Row menu clipped to a sliver — real, in the cleanup itself.*
   The menu was `position: absolute` inside the row, and the table
   wrapper's `overflow-x: auto` forces `overflow-y` to compute to
   `auto`, so the menu was clipped to the wrapper's box — with one
   seeded video only a sliver showed below the row (Playwright's
   `toBeVisible` still passed: it does not account for clipping by
   overflow ancestors, which is why the tests were green while the
   screenshots showed the defect). Fix: the menu is now
   `position: fixed`, rendered at the component root next to its
   backdrop, anchored to the clicked button's viewport rect
   (`Content.tsx`, `Studio.css`); a layout effect flips it upward
   when it would run off the viewport bottom (measured height, not
   guessed). Re-anchoring on scroll/resize (rAF-throttled, closes
   if the button unmounts) instead of closing: scroll events are
   delivered asynchronously, so the scroll-into-view that precedes
   a click can arrive *after* the menu opens — closing on scroll
   killed the menu on every mobile open (proven with an instrumented
   probe: click → menu ADDED → wrapper scroll event → menu REMOVED
   3ms later). Re-anchoring is immune to that race. No unit-test
   changes needed: all menu assertions query by role globally.
   Retaken menu screenshots (desktop + mobile) show the full
   four-item menu.

**Verification environment notes (this pass).** The first e2e runs
failed 10/10 with "No videos yet" — a harness mistake, not a
product defect: `pnpm build --force` builds `dist` without
`VITE_BACKEND_URL`, and `Api/index.ts` has no default for it, so the
bundle pointed at the preview origin instead of the API. Rebuilt
with the e2e env (`VITE_BACKEND_URL=http://localhost:5000 ...`,
as `pnpm test:e2e:phase5` does) and the suite went 10/10. `/tmp`
is a 512 MB tmpfs and each e2e run leaves a ~200 MB `mongo-mem-*`
dir behind (Playwright kills the API server before its shutdown
hook runs); a run failed once with mongod unable to start at 99%
full — clean stale `mongo-mem-*` dirs before e2e runs. Mid-task
the VM reset (`pnpm` vanished from PATH, `/tmp` wiped);
`pnpm@12.18.0` was reinstalled globally per the task instruction
and the run continued. One full-suite run showed a single flaky
failure (`studio.test.tsx` Content-edit, `findByText` timeout in
the parallel run); the file passes alone (13/13) and the full
suite passed on re-run (143/143) — recorded as a flake, not
investigated further. No `any`, no ts-ignore, no tests excluded
from typecheck; no real Cloudinary credentials used (mock only).

**Not verified / open.** The Cloudinary-configured path is still
verified only with the mocked upload (as before). The e2e seed has
1 video for the fake user, so the table's 7-row density from
image-20 is not reproduced end to end — the layout, pills, icons
and menu are, on the single seeded row. `phase5-home.png`,
`studio-content.png`, `library.png`, `watch.png` were regenerated
by the e2e runs (the suite screenshots on every run); the new
content shots are the 6 files listed above.

#### 8.9.12 Settings + Watch polish — verification + close-out (11 Nov 2026, branch `feat/acube-settings-watch-polish`)

Verification + close-out pass over the Settings polish branch
(`ba359c2` API: live handle check + banner/avatar endpoints;
`aadbb1f` web: Settings preview match, live handle check, uploads,
Watch Autoplay). History verified first with `git log`:
`f3354e9 → ba359c2 → aadbb1f`, clean tree. Three further fix
commits were needed before this branch was shippable — all found by
this pass, all verified below, none of them a redesign:
`b6477fd` (identity/channel header), `836f3ae` (media-URL
resolution), `b6db941` (cross-origin serving + e2e spec). Main moved
while this branch was in flight (PR #4 merged as `4def719`), so
main @ `4def719` was merged into this branch before push — the
connector's `create_branch` only branches from a branch head, not
an arbitrary commit, so a branch at `385d5d3d` was not creatable
and the GitHub branch sits on current main instead. Push + PR #5
pending (see end of this section).

**Per-item verification — was each item really missing?**

| Item | Was it really missing? | Evidence |
|---|---|---|
| Live handle check | No — present and correct | `GET /studio/handle/available` + debounced client check; e2e: `codestreamer` → "✗ taken", `zxqv-free-99` → "✓ available", own `e2euser` → "✓ available" |
| Banner/avatar upload endpoints | No — present and correct | `POST /studio/banner`, `/studio/avatar`, `/remove` variants; 200 + file on disk + served, in API tests and e2e |
| Settings preview match (image-22) | Yes, matches | Fresh desktop screenshot vs image-22: banner gradient, profile-picture row, 2-column grid, handle with ✓/✗, Channel URL, Contact email, Links, Country/Language — all present (see screenshots) |
| Watch Autoplay toggle | No — present and correct | Toggle renders "Autoplay ON/OFF", persists in `localStorage` key `acube:watch:autoplay`; e2e proves the behaviour (below) |
| Uploaded avatar in Studio identity header | **Yes — really missing** | Identity rendered `overview.channel.picture` (Google photo) only; the overview endpoint did not return `avatarUrl` at all. Fixed in `b6477fd` |
| Uploaded avatar/banner in channel header | **Yes — really missing** | `Describechannel` rendered only a first-letter initial; no avatar image, no banner; the channel-list projection dropped `picture`/`avatarUrl`/`bannerUrl`. Fixed in `b6477fd` |
| Uploaded banner/avatar visible in a real browser (local fallback) | **Yes — really missing, two layers** | (1) The API returns a relative `/uploads/…` path and the client used it verbatim, so it resolved against the web origin (:4173) and 404'd — fixed in `836f3ae` with `resolveApiMediaUrl()` (absolute/blob/data URLs pass through; relative URLs prefixed with `VITE_BACKEND_URL`). (2) Even absolute, Helmet's global `Cross-Origin-Resource-Policy: same-origin` made the browser refuse the cross-origin load (`ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`) — the upload returned 200 while the `<img>` never rendered. Fixed in `b6db941`: the `/uploads/` static mount now answers `Cross-Origin-Resource-Policy: cross-origin` (public, unauthenticated media, like a CDN). Both defects were invisible to unit tests (mock URLs are absolute `cdn.example` + no Helmet) and only showed in e2e — which is why this pass e2e'd them |

**What changed (the three fix commits).** `b6477fd` — API:
overview channel now carries `avatarUrl` (`avatar ?? picture`);
`getallchanels` projection adds `picture`/`avatarUrl`/`bannerUrl`.
Web: Studio identity prefers `avatarUrl` over `picture`; channel
header renders the banner strip (gradient fallback) and the avatar
image (initials fallback, broken-image guard); MSW overview reflects
the mock avatar; the unit test that asserted "identity never
changes" now asserts it does, and clears on remove. `836f3ae` —
`resolveApiMediaUrl()` in `Api/index.ts`, applied at the three
render sites (Settings banner/avatar, Studio identity, channel
header banner/avatar); the stored value stays origin-independent
(`/uploads/…`). `b6db941` — the CORP fix above + the new
Playwright spec. No `any`, no ts-ignore, no tests excluded from
typecheck. The stale "by design" comments in `Api/index.ts`,
`query/hooks.ts`, and `mocks/handlers.ts` were updated to the new
behaviour.

**Fresh counts (all exit 0, uncached — each command's output to a
file, exit code echoed separately, never piped).**

| Check | Command | Result |
|---|---|---|
| Typecheck | `pnpm typecheck --force` | exit 0, 3/3 tasks |
| API tests | `pnpm test` (turbo) | **217/217 (15 files)** |
| Web tests | `pnpm test` (turbo) | **144/144 (19 files)** — up from 141: +3 new `resolveApiMediaUrl.test.ts` (absolute/blob/data passthrough, relative → API origin) |
| Lint | `pnpm lint` | exit 0, **0 errors, 6 warnings** (pre-existing, same as §8.9.2/§8.9.10) |
| Build | `pnpm build` | exit 0 |
| Playwright e2e (new spec) | `playwright test -c playwright.phase5.config.ts settings-watch-polish.spec.ts` | **4/4** (see below) |
| Playwright e2e (full Phase 5 suite, pre-merge tree) | `pnpm test:e2e:phase5` | **17/17** — 10 phase5 + 4 new polish + 3 upload-wizard, no regressions |

**Post-merge re-verification (main @ `4def719` merged in — see the
merge note in the intro).** Fresh uncached counts on the merged
tree, same method: typecheck exit 0 (3/3 tasks); API tests
**225/225 (16 files)** — +8 from PR #4's `studio-content.test.js`;
web tests **158/158 (20 files)** — +14 from PR #4's content tests;
lint exit 0, 0 errors, 6 warnings (pre-existing); build exit 0.
E2E on the merged tree, each spec alone (fresh servers per run):
polish **4/4**, phase5 **10/10**, content-cleanup **6/6**,
upload-wizard **3/3**. Run all four together in one invocation the
suite is 20/23: phase5 tests 2 (dashboard totals: 8 views, not 7),
4 (analytics: same +1 view), and 8 (history Remove button not
found) fail — that is the documented cross-spec interference, not
a merge breakage: `content-cleanup.spec.ts` says in its own header
to run separately, because it visits `/watch/<seeded video>` (each
visit records a view event, 7 → 8) and renames the seeded video to
"E2E Smoke Video (Cleanup Edit)" (the history test looks for a
"Remove E2E Smoke Video from history" button, which no longer
exists under that name). The polish spec was also changed in the
merge pass to read the e2e JWT secret from `e2e-server.mjs` at
runtime (same pattern as `content-cleanup.spec.ts`) instead of
carrying a copied value — the redaction trap from §8.9.10, fixed
properly this time; spec still 4/4 alone after the change.

**E2E results** (`apps/web/e2e-phase5/settings-watch-polish.spec.ts`,
real API on in-memory MongoDB, `PHASE5_SEED=1`, production build,
Cloudinary unconfigured — the local `/uploads/` fallback is what is
exercised; the Cloudinary-configured path is verified only via the
mocked API tests, as before). (1) Handle check: own handle
`e2euser` → "✓ available", `codestreamer` → "✗ taken",
`zxqv-free-99` → "✓ available". (2) Banner/avatar upload: banner
preview updates without reload and the image behind it really loads
(`fetch` of the resolved URL → 200 `image/*`); avatar preview img
loads (`naturalWidth > 0`); the Studio identity header shows the
uploaded avatar without reload; the channel header
(`/channel/<id>`) shows the same banner + avatar; Remove restores
the gradient banner, initials avatar, and initials identity. (3)
Autoplay: on the first Learning Path video ("Getting Started with
React Hooks"), dispatching `ended` with Autoplay ON navigates to
the next playlist video ("TypeScript Generics, Explained"); with
Autoplay OFF the URL stays and "Up next" stays visible; the
preference survives reload in both directions
(`localStorage acube:watch:autoplay` "false" then "true"). Video
end is simulated by dispatching `ended` on the `<video>` element —
the seeded video files do not exist, so real playback to the end
is not verified (same caveat as the Phase 5 specs). No page errors
in any test.

**Fresh screenshots** (`docs/screenshots/`, desktop 1280×800 +
mobile 390×844; local-only — PNGs are binary and the snapshot push
carries UTF-8 files only, so they are NOT in PR #5):
`settings-polish-settings-desktop.png`,
`settings-polish-handle-available.png` (✓ available),
`settings-polish-handle-taken.png` (✗ taken),
`settings-polish-settings-uploaded.png` (uploaded banner gradient
+ teal avatar in Settings AND in the Studio identity header),
`settings-polish-watch-autoplay-on.png` (Learning Path showcase,
"1 / 4 watched · Playing 1 of 4", Autoplay ON),
`settings-polish-settings-mobile.png`,
`settings-polish-watch-mobile.png`. Visually inspected against
image-22: the Settings page matches field for field. Remaining
deviations, all expected: Channel URL shows the local origin
(`http://localhost:4173/@…` vs the preview's `acube.app/@…`); the
player area is black at 0:00/0:00 (no playable file in e2e); the
uploaded banner/avatar in the shots are synthetic test gradients,
not real photos; the mobile Settings shot caught the handle field
mid-debounce ("Checking…"). Note: the suite re-took
`studio-settings.png` and `watch.png` in the same runs (they are
regenerated every e2e run); those files are left modified locally,
not committed.

**Environment notes (this pass).** (a) The first e2e runs failed
with 401s for the same reason as §8.9.10: tool output redacts the
e2e JWT secret, and the spec had copied the displayed placeholder.
Recovered the same way — SHA-256 hash comparison showed the
server's secret and the spec's secret match each other but not the
assumed value; the correct literal was copied programmatically
from `phase5.spec.ts` into the new spec without ever displaying it.
(b) `/tmp` is a 512 MB tmpfs and each e2e run leaves a ~201 MB
`mongo-mem-*` dir behind when the run ends; two stale runs filled
it and mongod failed to start with `ENOSPC`. Cleaned the stale
dirs and ran e2e with `TMPDIR=$HOME/workspace/.tmp-mongo` (as the
cloudinary script already does) from then on.

**Not verified / open.** Real Cloudinary credentials were never
available, so the Cloudinary-configured image path is verified
only with the mocked upload — the local fallback is what is proven
end to end. The channel header's banner/avatar were fixed and
e2e-verified for the owner's channel page; other surfaces that
render channel pictures (video cards, comments, search) still use
their existing rendering and were not part of this task.

**PR #5 state.** Branch `feat/acube-settings-watch-polish` pushed
via the GitHub connector snapshot push (see §8.9.9 for the
procedure) from main @ `4def719` (PR #4 merged while this branch
was in flight; see the merge note in the intro above); PR #5
created with base `main`, title "Settings: live handle check,
working banner/avatar upload, preview match; Watch: Autoplay
toggle" — https://github.com/Mr-armanalam/Acube/pull/5, head
`03f090709a1aa0dd51277a4f14f90b6ecb6be59b` (snapshot commit; local
head `24da88c`). Screenshots are not in the PR (binaries are
excluded from snapshot pushes).

#### 8.9.13 Home + Channel + Account (PR #6)

Branch `feat/acube-home-channel-account` (base `8683c23`, PR #5 head), PR #6 vs `main`.
Reference images: Home preview image-24, current image-25; Channel preview
image-26, current image-27; History preview image-28; Library preview
image-29.

**Home (image-25 → image-24).** Verified first: the chips row had a second
`+ Upload` link (`Home.tsx:58-60`) and a background + border
(`.navigation_Home`); categories were a hardcoded `TOPICS` list
(All/Motivation/Nature/Learning/Music/Coding) matched by keyword over
title/desc/tags/uploader, so chips could match zero videos; cards used the
shared `Showvideo` raw `<video>` element with no gradient/▶ fallback and a
`views • less than a minute ago` line. Fixed: Upload link removed (TopBar
keeps its own); chips-row background/border removed; chips are now derived
from distinct tags in the loaded videos ("All" first, deduped
case-insensitively, never a chip matching zero videos), clicking a chip
filters client-side to that tag; new Home-local card `HomeVideoCard.tsx`
(`VideoThumb` real thumbnail or deterministic-gradient + ▶ fallback,
duration badge bottom-right from `durationSec ?? duration`, channel avatar
left, title, `Channel name · N views` with views pushed right, no upload
time). `Showvideogrid`/`Showvideo` untouched — Channel/Search still use the
old card. Search untouched (lives in TopBar → `/search/:query`).

**Home pagination (added at Arman's word, same branch).** The Home page must
not fetch a bulk 100–1000+ videos in one query. Verified: the API already
paginates — `GET /video/getvideos?page&limit`, `{items,page,limit,total,
totalPages}`, limit clamped to 50, default 20. Page size chosen: **20** (the
server default, inside the 12–24 range). New `usePagedVideos.ts`
(`useInfiniteQuery`, own key `["videos","paged",20]`): exactly **1** video-list
request on initial load (`page=1&limit=20`, proven in unit test and Playwright
network assertion); IntersectionObserver sentinel (rootMargin 200px) + "Load
more" fallback append pages; dedupe by `_id`; tag change resets to page 1
with zero new requests (cached page 1 truncated, no refetch); "Loading more
videos…" indicator; "You've reached the end." state. E2E stubs the feed with
a 45-video paginated feed (seed has 1 video); scroll container is
`.container2_Pages_App`, not `window`. Invalidation note (verified
empirically): `invalidateQueries({queryKey:["videos"]})` DOES invalidate the
paged key via TanStack v5 prefix matching, so upload/like/delete refresh Home;
only `useViewVideo` never invalidates (view counts lag while Home stays
mounted; staleTime 0 refetches on remount) — no change made.

**Channel (image-27 → image-26).** Verified first: old centred layout with
baked-in banner text, `⬇ {downloadsToday}` counter, `Points:`/`Premium:`
pills, blue `Edit Channel` (modal) / `Upload Video` buttons; no tabs, no
subscribe UI, no `@handle` (the `Channel` type had no `handle` field and
`GET /user/getallchannel` did not project it). Rebuilt: banner (real
bannerUrl / gradient fallback), avatar overlapping the banner edge, name,
`@handle · N videos` (real filtered count), description with `…more`
expansion at 140 chars, tabs Home / Videos / Playlists / Posts + search icon
(title filter). Owner gets `Customize channel` → `/studio/settings` and
`Manage videos` → `/studio/analytics`; counter/pills/blue buttons removed.
Playlists tab shows real playlists from new public `GET
/channel/:id/playlists` (see API below), honest empty state; Posts tab honest
empty state (no posts system). Home and Videos both show the video grid (no
curation system invented).

**Subscribe — decision (ii), disabled "coming soon", no fake count.** Verified
no follow system exists anywhere (no endpoint, no subscriber field;
`Watch.tsx` and `phase5fix.test.tsx` carry the same explicit cut). The header
renders a white `Subscribe` pill, `disabled`, `title="Subscriptions aren't
available yet"`, plus a visible `Coming soon` caption, only to non-owners. No
subscriber number is rendered anywhere — stats line is `@handle · N videos`
only.

**Create channel — target is the modal, NOT /studio/settings.** Verified:
creation lives in the global `Createeditchannel` modal (`App.tsx:23-30`,
opened by TopBar `seteditcreatechanelbtn(true)`), which PATCHes
`/user/update/:id` — the "channel" IS the user record, created at signup;
there is no separate creation endpoint or route, and Studio Settings is
edit-only. The Account worker initially routed the menu entry to
`/studio/settings` (fallback); the coordinator restored the modal opening and
fixed its test to assert `seteditcreatechanelbtn(true)` is called.

**Account menu + History + Library (images 28–29).** Verified first: menu
had only Your channel / Create channel / Sign out; no pill nav existed;
History was wired but plain rows, grey progress strip, separate Resume
button, no footer note; Library was a plain stacked list with no header
avatar, card grid, Play-all/Sort, or create-playlist card. Now: "Your
account" above "Your channel" in the avatar menu → `/library`; shared
`AccountNavPills` (Home, Subscriptions, History, Library, Watch Later,
Liked — active pill white; Watch Later / Liked are anchors into the hub, no
separate routes exist); Subscriptions is an honest empty state (no follow
system). History: day groups (TODAY/YESTERDAY), gradient/real thumb with
duration + red progress bar, `Channel · Watched 1:24 of 2:14 · Watched today,
11:20 AM · Resume from 1:24 ▶`, `✕ Remove`, Pause/Clear all wired to the real
endpoints, footer note verbatim. Library: avatar + "Your library" header,
Watch Later · Saved (Play all + Sort), Liked videos (privacy note card), Your
playlists & Saved playlists (+ New playlist / + Create playlist), create /
add-to-playlist (Save menu, already worked) / remove / Play all — all wired to
the real endpoints; Saved cards show `uploader · N views` (the library
endpoint returns no saved-at field — never invented). Watch Later and Saved
stay separate sections (not the preview's combined heading) to preserve the
existing contract test. Verification found and fixed three genuine defects:
broken-image glyphs on History/Library thumbs (seed `example.com` URLs) —
now `thumbBroken` state falls back to gradient + initial; Library "Play all"
overlapped the first card (`display:inline` anchor — now `inline-block` +
margin); ▶ overlay sat on top of the fallback initial (now rendered only
when the photo displays).

**API (new).** `GET /channel/:id/playlists` (public, no auth; new
`Routes/channel.js` mounted at `/channel` in `app.js`; handler
`getChannelPlaylists` in `Controllers/channel.js`): returns only that owner's
`visibility: "public"` lists, newest first, in the `listPlaylists` shape
(`{items,page,limit,total,totalPages}` + `videoCount`); invalid ObjectId →
400 `VALIDATION_ERROR` (standard shape); non-existent owner → 404
`NOT_FOUND` (matches the playlist-endpoint convention); owner with no public
lists → 200 empty. `GET /user/getallchannel` now projects `handle` (string
or `null`; model field verified in `Models/Auth.js:34`).

**Verification (uncached, real exit codes).** `pnpm typecheck --force` exit 0
(3/3); `pnpm lint --force` exit 0, 0 errors, 7 warnings (1 new benign
`LibraryHub.tsx:209` useMemo dep false positive; 6 pre-existing); `pnpm test
--force` exit 0 — web **192/192** (23 files), API **230/230** (17 files);
`pnpm build --force` exit 0. Playwright Phase 5 suite: **21 passed / 3
failed** — the 3 failures are pre-existing cross-spec interference proven by
clean-tree stash comparison (content-cleanup spec adds a real view, so
Dashboard/Analytics totals are off by one; it renames the seeded video, so
the History spec's row is not found); new `home-pagination.spec.ts` passed.
Two `studio.test.tsx`/`studioPreview.test.tsx` 1s-timeout flakes under
full-suite load were hardened to 5s (precedent in `settingsWatchPolish`).
Screenshots (desktop 1280×850 + mobile 390×844, seeded demo, no page
errors): `phase5-home-clean-*`, `phase5-channel-clean-*`,
`phase5-account-menu-clean-*`, `phase5-history-clean-*`,
`phase5-library-clean-*` in `docs/screenshots/` — visually inspected; Home
matches image-24 (chips are real tags, not the preview's topic words —
deliberate); Channel matches image-26 (no subscriber count — deliberate cut);
menu order correct; History matches image-28 ("Clear all watch history" vs
preview "Clear all" — trivial wording delta, left alone); Library matches
image-29 (Watch Later 0 videos — seed has none for viewer01, data not a
defect). Channel video grid still uses legacy `Showvideogrid`/`Showvideo`
(dark empty box for the dead-mp4 seed video) — preview image-26 shows no
grid, left as-is. Screenshots are not in the PR (binaries excluded from
snapshot pushes).

**PR #6 state.** Branch `feat/acube-home-channel-account` pushed via the
GitHub connector snapshot push from main @ `804c0571` (PR #5 merge); PR #6
created with base `main`, title "Home: real tag categories + preview cards;
Channel: preview page; Account: Library/History tabs" —
https://github.com/Mr-armanalam/Acube/pull/6, head
`602d1e229cf7c3a0d254cc623d592e96db1f6369` (snapshot commit; local head
`30c7bde`). Screenshots are not in the PR (binaries are excluded from
snapshot pushes).

#### 8.9.14 Auto-thumbnails + thumbnail field + hover preview (PR #7)

Branch `feat/acube-auto-thumbnails` (base `52e6afe`, PR #6 head), PR #7 vs
`main`. Reference screenshots (desktop 1280×850, seeded demo, no page
errors): `phase5-upload-thumbnail-step2.png`,
`phase5-home-thumbnail-grid.png`,
`phase5-home-hover-preview-playing.png` in `docs/screenshots/`.

**Auto-thumbnails (API).** Verified first: uploads stored no thumbnail at
all — Home/Content fell back to gradients and the wizard had no thumbnail
input beyond the legacy `thumbnail_url` string. Fixed: every video upload
now produces three 1280×720 JPG stills at 5% / 50% / 90% of duration.
Cloudinary path: `VIDEO_THUMBNAIL_EAGER_TRANSFORMATIONS` in
`cloudinary.js:72-80` builds three eager transforms `{width: 1280, height:
720, crop: "fill", format: "jpg", start_offset: "5%" | "50%" | "90%"}` from
`AUTO_THUMBNAIL_FRACTIONS` (the `start_offset: "5%"` form serializes to
`so_5p`, verified against the installed SDK typings + runtime
`build_eager`); `extractEagerThumbnailUrls` (`cloudinary.js:82-89`) reads
the `eager` array's `secure_url`s in order. Local path (no Cloudinary
configured): `Helper/thumbnails.js` probes duration with `ffprobe-static`
(`:135-142`) and extracts the same three frames with `ffmpeg-static`
(`:161-230`, padded to exactly 1280×720) to
`/uploads/<videoId>-thumb-<n>.jpg`; both packages are bundled binaries
(`ffmpeg-static` 5.3.0, `ffprobe-static` 3.1.0 in `apps/api/package.json`),
no system ffmpeg needed. Precedence (`Controllers/video.js:251`): uploaded
file > pasted URL > middle auto frame (index 1, 50%) > first auto > legacy
`thumbnail_url` > null; `autoThumbnails` is a string array on the video
model (`Models/videofile.js:92`). Upload never fails on thumbnail failure:
an eager failure retries the Cloudinary upload once without eager, a local
extraction failure logs a warning and the upload still succeeds with no
thumbnails (`Controllers/video.js:59-60`). Backfill:
`pnpm --filter @acube/api seed:thumbnails`
(`scripts/backfill-thumbnails.mjs`, `Helper/thumbnailBackfill.js`) backfills
videos lacking `thumbnailUrl` — derived Cloudinary transformation URLs for
hosted videos, real ffmpeg frames for local files; idempotent, `--dry-run`
and `--limit` supported.

**Thumbnail field fix (wizard + API).** Verified first: Step 2 had only the
paste-a-URL field and the server stored the string unchecked. Fixed: the
URL field is kept and a JPG/PNG file picker (5 MB, the Settings rule shared
via `utils/thumbnail.ts`) is added; the upload endpoint now accepts an
optional second multipart part `"thumbnail"` via `upload.fields()` (not
`.single("file")`, `Routes/video.js:36-37`). A file wins over a URL, which
is then ignored entirely (not validated). A pasted URL is validated
server-side in `Helper/thumbnails.js:54,78-92` — HEAD with 5s timeout, a
ranged-GET fallback for a single byte when the host rejects HEAD (405/501),
`image/*` required, body never downloaded — and rejected with 400
`VALIDATION_ERROR` "Thumbnail URL must point to a reachable image"
(verbatim, asserted in the API tests); the same check runs on PATCH
`/video/:id`. The client surfaces the server message verbatim.

**Frame picker design (client-side extraction in Step 2).** The picker is
client-side because the upload itself happens at Publish: the picked video
is seeked to 5% / 50% / 90% and drawn to canvas in `utils/thumbnail.ts:53+`
(middle frame marked Suggested), so the user sees the exact frames the
server will generate. The default auto choice sends nothing extra; a
clicked frame is sent as a JPEG `File` in the `thumbnail` part
(`UploadWizard.tsx:269`), an uploaded file as `thumbnail`
(`UploadWizard.tsx:258`), a URL as `thumbnailUrl`
(`UploadWizard.tsx:272`). Review shows the effective choice; the done
screen shows the server-stored thumbnail (`thumbnailUrl`, else first
`autoThumbnails`).

**Hover preview (Home).** New `HomeVideoCard.tsx` behaviour, grid-owned
single preview via `previewId` (`Home.tsx:65,166`): 900 ms dwell
(`HOVER_PREVIEW_DWELL_MS = 900`, `HomeVideoCard.tsx:33`), muted looping
`<video>` starting at 10% in (`HomeVideoCard.tsx:34`), `preload="none"`
(nothing fetched before the dwell), silent fallback to the thumbnail on
error, stops on mouse-leave / tab-hide / scroll-out of view, off under
`prefers-reduced-motion` (`HomeVideoCard.tsx:80`), touch unchanged. The
card observes only while previewing, so the pagination sentinel observer is
untouched (regression test pins zero card observers at rest).

**`resolveApiMediaUrl` in VideoThumb.** Verified first: local `/uploads/...`
thumbnails resolved against the web origin and 404'd in the browser. Fixed:
`VideoThumb` itself resolves `src` through `resolveApiMediaUrl`
(`Component/VideoThumb.tsx:14,47,74`) and resets its broken state when
`src` changes, so local thumbnails display on Home, Content, Library,
History and Playlist. The Content edit modal validates the thumbnail URL
the same way; file upload there is a follow-up (see below).

**Verification (uncached, real exit codes).** `pnpm typecheck --force`
exit 0 (3/3 tasks); `pnpm lint --force` exit 0, 0 errors, 7 warnings
(pre-existing); `pnpm test --force` exit 0 — API **271/271** (21 files),
web **224/224** (25 files); `pnpm build --force` exit 0. Playwright Phase
5 suite **29/29**, each spec in its own invocation (fresh seed per run):
`auto-thumbnails-hover.spec.ts` **4/4** (frame picker + 3 stored auto
frames; custom file replaces auto; pasted URL works; hover ~1s plays a
real preview, leaving stops it), `upload-wizard.spec.ts` **3/3** +
`home-pagination.spec.ts` **1/1**, `phase5.spec.ts` **10/10** +
`settings-watch-polish.spec.ts` **4/4**, `content-cleanup.spec.ts`
**6/6**, `upload-wizard-cloudinary.spec.ts` **1/1** (mock-SDK Cloudinary
config). Verification found and fixed an environment defect, not a code
one: the first `content-cleanup` run failed before any test — the e2e API
server crashed seeding (`MongoBulkWriteError: read ECONNRESET` in
`seedDemoData`) because `/tmp` (512 MB tmpfs) was 82% full with orphaned
`mongo-mem-*` dirs (~201 MB each) from earlier e2e runs; freed ~402 MB of
stale dirs (no mongod running) and the retry passed 6/6. The
`upload-wizard-cloudinary` spec needs its own config
(`playwright.phase5-cloudinary.config.ts`); running it under the plain
Phase 5 config finds no tests. One self-inflicted false alarm while
verifying: `pnpm --filter @acube/web test --force` fails because `--force`
is passed through to vitest (unknown flag) — the root `pnpm test --force`
(turbo) is the correct invocation and passed. Screenshots
`phase5-upload-thumbnail-step2.png` (frame picker + URL + file field),
`phase5-home-thumbnail-grid.png`, `phase5-home-hover-preview-playing.png`
are desktop 1280×850 with no page errors; the hover screenshot shows a
pre-existing sticky-header chips overlap when scrolled (not introduced
here). Screenshots are not in the PR (binaries excluded from snapshot
pushes).

**Deferred / follow-ups.** Feed personalization stays deferred. Content
edit modal file upload is a follow-up: PATCH `/video/:id` is JSON-only and
needs backend multipart support. Pasted-URL server fetch has no SSRF
allow/blocklist (known limitation). No `any`, no ts-ignore, no test
excluded from typecheck.

**PR #7 state.** PR #6 was merged before this push (merge commit
`72a9d186434128ca6130ac58da12629e7092a885`, 2026-11-11T12:19:41Z), so the
branch was created from current main @ `72a9d18` and this PR is based on
merged PR #6, not stacked. Branch `feat/acube-auto-thumbnails` pushed via
the GitHub connector snapshot push (39 UTF-8 files; 3 PNG screenshots
excluded as binaries); PR #7 created with base `main`, title
"Auto-thumbnails on upload + thumbnail file/URL field; Home: hover video
preview" — https://github.com/Mr-armanalam/Acube/pull/7, head
`6b47c518c38fcc3e042b153f5a25f998948acead` (snapshot commit; local head
`7f6f089`). Git-state note: the two implementation workers disagreed — the
backend worker reported commit `36eeb5b` while the frontend worker claimed
the backend changes were still uncommitted. Verification found `36eeb5b`
does exist and the tree was clean: `52e6afe → 36eeb5b → 34c2c3f →
7f6f089`, nothing uncommitted, no duplication or conflict; the frontend
worker's claim was stale and no commit was needed.

#### 8.9.15 Account-menu hover overflow (11 Nov 2026, branch `feat/acube-account-menu-hover-fix`)

Arman's screenshot showed the account dropdown's hovered item ("Your
account") painting its hover background outside the menu container on
the right. Root cause, measured in Chromium, not guessed: the app has
no global `box-sizing: border-box` reset (nothing in `index.css` /
`App.css`), so `.topbar-menu a` in `TopBar.css:104-115` used the
default `content-box`: `width: 100%` (= the menu's 180px content
width, from `.topbar-menu` `min-width: 180px` + `padding: 6px`) plus
the 24px horizontal item padding (`10px 12px`) made each link 204px
wide — 17px past the menu's 194px outer right edge (item starts 7px
in: 1px border + 6px padding). Measured pre-fix: desktop 1280px,
"Your account" right 1280 vs menu right 1264 (hover), 1281 (focus);
mobile 390px, right 390 vs 378 (hover), 395 (focus). The two
`<button>` items ("Create channel", "Sign out") never overflowed —
Chromium's UA stylesheet already gives `<button>` `border-box`
(180px, right edge 7px inside) — which is why only the links showed
it. Fix (`TopBar.css`, one rule, no look/layout/behaviour change):
`box-sizing: border-box` on `.topbar-menu a, .topbar-menu button`, so
`width: 100%` now includes the padding and every item sits 6px inside
the container; the hover rule additionally covers `:focus-visible`
with the same background, so keyboard focus gets the same contained
highlight. No other TopBar dropdown exists — `.topbar-menu` is used
only in `TopBar.tsx:146` — and the nearest sibling menu, Studio
Content's `.studio-menu-item` (`Studio.css:288-291`), already has
`box-sizing: border-box`, so no same defect there and nothing else
was touched. Verification (real exit codes, unpiped): new Playwright
spec `apps/web/e2e-phase5/account-menu-hover.spec.ts` asserts every
item's border box stays inside the menu's for all four items, hover
and keyboard focus, at 1280px and 390px — **4/4 pass** post-fix, and
the same spec **fails 4/4 pre-fix** (stash-reverted CSS, rebuilt,
same numbers as above), so the fix, not the harness, is what changed
the result. Screenshot `docs/screenshots/phase5-account-menu-hover-fixed.png`
(desktop, "Your account" hovered, background contained) verified by
eye. Web checks: targeted vitest (TopBar-touching files
`home` / `phase5fix` / `studioPreview` /
`accountHistoryLibrary`) **61/61**, exit 0; `pnpm typecheck` exit 0;
`pnpm lint` exit 0, 0 errors, 7 warnings (pre-existing); `pnpm
build` exit 0. No `any`, no ts-ignore, nothing committed — changes
left uncommitted for the coordinator's push/PR. Verification note:
ports 4173/5000 were held by the parallel pagination-branch worker's
dev + e2e-API servers, so this run served the fixed production build
on :5173 (a CORS-allowed origin for the shared seeded `:5000` API)
via a throwaway `/tmp` Playwright config reusing those servers; the
other worker's servers were not touched.

#### 8.9.16 Studio pagination + Comments actions + Edit-modal thumbnail upload (11 Nov 2026, branch `feat/acube-studio-pagination`)

Numbering note: this section was §8.9.14 on the branch (PR #7's
record already holds that number on main) and was renumbered to
§8.9.16 when the branch was rebased onto main @ 6ce219ad (PR #7 + PR #8 merges).
This branch was cut from `feat/acube-home-channel-account @ 52e6afe`
(local `main` was stale at `ec16620` and was not used). It also
carries the parallel backend worker's commits on this branch:
`1173bd0` (seed 11 demo comments + `/studio/comments` pagination
tests), `6563723` (`POST /video/:id/thumbnail`), `7b4dc05`
(multipart `PATCH /video/:id`).

**Scout verdict — stale build, no pagination bug.** A browser probe
on a fresh build before this work (`/tmp/pagination-probe.log`)
showed pagination working end to end in current code: Content page 1
= 10 rows / "Page 1 of 2", Next → 1 row / "Page 2 of 2", Previous
back to 10; Comments = 8 rows, 1 page, Next correctly disabled;
search resets to page 1. Arman's symptom matches a build predating
`4fb2a93` (which added the pager and the heart). No pagination code
was changed in Content — the work below is the real remaining work:
the three Comments actions, the Actions restyle, and the thumbnail
upload in the Edit details modal.

**Diagnosis (live seeded run, API `PHASE5_SEED=1` +
`DEMO_LOGIN_ENABLED=1` on :5000, web dev on :4173, demo-login as
`demo-channel-codestreamer@demo.acube.test`).**

- DELETE — BROKEN, root cause confirmed in code and live:
  `useDeleteComment` (`apps/web/src/query/hooks.ts:334`) invalidated
  only `queryKeys.comments` (`["comments"]`), while the Studio page
  reads `queryKeys.studioComments(page, filter, sort)`
  (`["studio","comments",…]`). Live: `DELETE
  /comment/delete/507f1f77bcf86cd799430308` → 200, server total 11 →
  10, comment gone from the API list — but the row stayed on screen
  after 1.5 s with a stale "Page 1 of 2" and no `/studio/comments`
  refetch. The endpoint + ownership were fine (author or video owner
  may delete; a parent with children soft-deletes to `"[deleted]"`,
  a leaf is hard-deleted — `apps/api/Controllers/Comment.js`).
- REPLY — BROKEN, same cache-key bug: `usePostComment`
  (`hooks.ts:277`) optimistic-updates/invalidates only
  `["comments"]`. Live: `POST /comment/post` → 200 "posted the
  comment", the reply is on the server with the correct `parentId`
  (`507f1f77bcf86cd799430307`), total 10 → 11 — but it never appeared
  in the Studio list (no refetch, still absent after 2 s). The
  composer itself opened/closed correctly; the endpoint accepts
  `parentId` and validates it (live parent, same video).
- HEART — WORKED in current code, no fix needed. Live: click toggles
  `aria-pressed` false → true → false and text "♡ Heart" → "♥
  Hearted", and the state survives a Next → Previous round-trip
  (still pressed). Arman seeing it not work is the stale-build
  explanation (heart arrived with the pager in `4fb2a93`). Session-
  local by design — no backend, no persisted count (explicit open
  cut).

**Fixes (frontend only).**

- `hooks.ts`: `usePostComment` and `useDeleteComment` `onSettled`
  now also invalidate the `["studio", "comments"]` prefix, so the
  Studio list refetches. (`useEditComment` has the same one-key
  pattern but is not used by the Comments page — left alone, flagged
  here.)
- `Comments.tsx`: replies thread under their parent (depth-first,
  within the loaded page; a reply whose parent is not on the page
  renders as its own row); soft-deleted comments are hidden from the
  inbox (a deleted parent's row disappears instead of lingering as
  `"[deleted]"`); a page clamp (`useEffect` on `totalPages` + visible
  rows) means deleting the last row of a page falls back to the
  previous page — never an empty page while rows remain. Reply now
  closes the composer only on success; on failure it stays open with
  the text intact and the server's message verbatim
  (`extractApiErrorMessage`); delete failures surface the same way.
  No confirmation flow existed, so none was added.
- Restyle: Actions are plain text on one row — "Reply · ♡ · Delete"
  (underlined text buttons, dot separators, no pill backgrounds, no
  red outline). Heart is the ♡/♥ glyph only, keeping `aria-pressed`
  and its label. Table design unchanged (columns, rows, Pinned
  badge). Desktop + mobile verified (mobile table scrolls
  horizontally as before; the actions stay on one row in their
  column).

**Edit-modal thumbnail upload (follow-up scope).** The modal kept
its URL input and gained a local file upload in the existing dark
compact style: "Choose file" / "Change file" button + live preview
thumbnail + Remove. Precedence local file > pasted URL > existing
thumbnail (a chosen file means the URL is never sent). Validation
JPG/PNG, 5 MB cap, same messages as Settings. Contract used (backend
commits `6563723` + `7b4dc05`, built to this client's shape):
`PATCH /video/:id` multipart, file part `thumbnail`, other fields as
form fields, `tags` JSON-encoded (the server JSON-parses it before
Zod); without a file the request stays JSON, unchanged. The backend
also added a separate `POST /video/:id/thumbnail` (file or pasted
URL, URL validated server-side as a reachable image); the modal uses
the single-call `PATCH` so title + thumbnail save atomically. Server
errors surface verbatim in the modal and the modal stays open; the
modal now closes on success only. After save the row's thumbnail
updates from the page-query refetch (no reload). Two supporting fixes
the acceptance criterion required: (1) `VideoThumb`
(`Component/VideoThumb.tsx`) never reset its `broken` flag when `src`
changed, so a row whose thumbnail went from a broken placeholder URL
to a fresh upload kept showing ▶ forever — it now resets on `src`
change (same fix makes the modal preview work after picking a file);
(2) the Content row and modal preview now resolve API-relative
`/uploads/…` URLs via `resolveApiMediaUrl` (bare `/uploads/…` would
404 against the web origin). Live API probe: multipart PATCH →
thumbnailUrl `/uploads/2026-11-11T13-52-40.768Z-…-test-thumb.png`,
served 200; JSON PATCH still works; unreachable pasted URL → 400
`VALIDATION_ERROR` "Thumbnail URL could not be reached".

**Seed / test counts.** Seed is now 11 demo comments (backend
`1173bd0`: 3 more, oid 309–311) and 11 videos, so Comments
pagination is exercised on the real seed (10 + 1), no fixture
needed. Web unit: **16 new tests** (`studioCommentsActions.test.tsx`
8: restyle, heart incl. page change, delete, last-row fallback,
parent-with-replies delete, threaded reply, failed reply, pagination
regression; `studioContentThumbnail.test.tsx` 8: modal picker +
preview, URL preview, multipart save incl. precedence, Remove →
JSON fallback, invalid/oversize rejection, verbatim server error,
JSON unchanged, VideoThumb broken-state reset). Playwright e2e (Phase
5 config, fresh build + fresh seed): **10/10** —
`studio-comments-actions.spec.ts` 7 (Comments pagination 10 → 1 →
10; Content pagination 10 → 1 → 10; heart incl. page change; delete
of an API-created row; reply threaded under parent + cleanup;
last-row-of-page-2 fallback; mobile actions) and
`studio-content-thumbnail.spec.ts` 3 (modal UI + preview; upload →
save → row shows `/uploads/` thumbnail; mobile modal). Existing
suites re-run separately (fresh servers each): `phase5.spec.ts`
10/10, `content-cleanup.spec.ts` 6/6.

**Verification (uncached, real exit codes).** `pnpm typecheck
--force` exit 0 (3/3 tasks); `pnpm lint --force` exit 0, **0 errors,
7 warnings** (pre-existing baseline — two new warnings found in the
first run were fixed: a `use*`-named test helper renamed, an unused
destructure replaced by an explicit JSON allowlist);
`pnpm test --force` exit 0 — web **208/208** (25 files), API
**254/254** (18 files); `pnpm build --force` exit 0 (web ~14 s; API
"no output files" note is pre-existing). One environment incident:
a `phase5.spec.ts` run failed to start its API server with mongod
`ECONNREFUSED` because orphaned `mongo-mem-*` dirs had filled the
512 MB tmpfs (84% used, no mongod running) — cleared only the stale
dirs, re-ran 10/10. One earlier full-suite flake (a 5 s timeout in
`studioPreview.test.tsx` under 25-worker load) did not recur in the
final run.

**Screenshots** (desktop 1280×850 + mobile 390×844, seeded demo, no
page errors) in `docs/screenshots/`, visually inspected:
`phase5-comments-actions-desktop.png` (text actions + threaded
replies visible), `phase5-comments-actions-mobile.png`,
`phase5-studio-pagination-comments-p1.png` /
`-p2.png`, `phase5-studio-pagination-content-p1.png` / `-p2.png`,
`phase5-content-thumbnail-modal-desktop.png` (file chosen, live
preview, "Using test-thumbnail.png — the URL above is ignored."),
`phase5-content-thumbnail-modal-mobile.png`.

**Open / flagged.** (1) The server total still counts soft-deleted
comments in "all" mode, so after deleting a parent with replies the
pager total does not drop by one even though the row is hidden —
frontend hides the row; the count is backend-owned. (2) The
`POST /video/:id/thumbnail` endpoint is unused by the modal (the
single-call PATCH covers the flow); if Arman prefers the separate
endpoint, the modal call is one function (`patchVideo` in
`Api/index.ts`). (3) `useEditComment` still invalidates only
`["comments"]` — same bug class, no caller on the Comments page.
