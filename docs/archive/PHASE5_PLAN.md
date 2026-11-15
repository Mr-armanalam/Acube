# Phase 5 Plan — Acube Premium UI + Creator Studio

## RECONCILIATION (10 Nov 2026, Arman approved the design preview)
Status: **APPROVED — implementation in progress on
`feat/acube-phase5-studio`, branched from merged `main`
(`1a455b9`, PR #1 merged via `dc56b61`).** The interactive design
preview (`acube-phase-5-design-preview`, 10 screens A–J) WINS where
it differs from the original plan below. The original §2/§6 text
(amber/violet "Studio Noir", single `VideoDailyStat`) is superseded
by the following and is kept only as history — do not implement it.

- **Design tokens: Obsidian + Acube Red.** Near-black Obsidian
  surfaces (`--bg #0D0D10`, `--surface #16161B`, `--surface-2
  #1F1F26`, `--border #2A2A32`, `--text #F5F5F2`, `--text-2
  #A1A1AA`) with **Acube Red `#E5484D`** (dark) / `#D13438`
  (light) as the single action accent; violet `#7C6CFF` only as a
  second chart series. Light theme: `--bg #FAFAF8`,
  `--surface #FFFFFF`. Inter font. Radius 16px cards / 10px
  buttons. No other accent colours.
- **Analytics model: `viewevents` + `channeldailystats`.** One
  `ViewEvent` row per view event (viewer, videoid, channel,
  day, watch seconds, completed flag); one `ChannelDailyStat` row
  per (channel, day) with atomic `$inc` aggregates
  (views, likes, watchMinutes, completions). Analytics reads the
  daily stats; the event log is the audit trail. No
  `VideoDailyStat` collection.
- **`/studio` endpoints (9):** `GET /studio/overview`,
  `GET /studio/analytics?range=7|28|90`,
  `GET /studio/videos`, `GET /studio/comments`,
  `GET /studio/settings`, `PATCH /studio/settings`,
  `GET /studio/playlists`, `POST /studio/playlists`,
  `PATCH /studio/playlists/:id` (plus item add/remove under the
  same resource). Plus `PATCH /video/:id` and
  `DELETE /video/:id` (title + visibility, owner-only).
- **Playlists + library:** new `Playlist` and `LibraryEntry`
  collections (`libraryentries`); Library tabs (Watch Later /
  Saved / Liked / Playlists) read `LibraryEntry` rows.
- **Nested comments:** `comment.parentId` (nullable, top-level
  when null); replies render threaded, max indent depth 3 in UI;
  deleting a parent hides its subtree (soft-delete, see §5).
- **Routes:** `/studio`, `/studio/content`, `/studio/analytics`,
  `/studio/comments`, `/studio/settings`, `/watch/:id` (new
  player page — the old `/videopage/:id` route redirects to it),
  `/history`, `/library`, `/playlist/:id`.
- **Player:** rebuilt seek track/slider (buffered + played bars,
  chapter ticks, draggable knob), gestures (left double-tap −10s,
  centre tap play/pause, right double-tap +10s, vertical swipe
  volume/brightness), keyboard map, speed / PiP / fullscreen.
- **Arman's local main additions preserved:** PR #1 merged
  `dc56b61`; Arman then removed the `.env.example` files and added
  logo/image assets (`f37c013`) and a `.vite` gitignore entry
  (`1a455b9`). **Do not re-add `.env.example` files** — that
  removal was his decision. `.github/workflows/ci.yml` and
  `docs/screenshots/*.png` were restored into this branch from the
  local Phase 4 branch (they never reached GitHub in Phase 4
  because the connector cannot push workflow files or binaries).

Status (original, pre-approval): **PLAN ONLY — awaiting Arman's
validation of the designs in `Acube Phase 5 — Design Preview`
(interactive mockups). No code in `apps/` is changed by this plan.
Nothing is implemented until Arman approves the look and the scope
below.** — *Approved 10 Nov 2026 22:53 IST ("ok approve it and work").*

Branch (when approved): `feat/acube-phase5-studio` from `main`
(after PR #1 is merged). `main` untouched until then.
Goal workspace: Acube professional rebuild.

---

## 1. Why this phase, and what "attention-seeking" means here

Acube Phases 0–4 made the app *correct*: verified auth, webhook-only
premium, ownership checks, pagination, 166 tests. What it still lacks
is the thing a recruiter / visitor notices in the first 10 seconds:

1. **A creator side.** The watch side (Home / video page / Library)
   exists; there is no place where a creator *manages* anything.
   YouTube's watch page is not what makes it look like a product —
   YouTube Studio is.
2. **A premium look.** The current UI is the original college UI:
   system font, flat `#131313` grey, no accent, no spacing scale,
   21rem video cards, no empty/loading states that look designed.
   It reads as "working" not "finished".

This phase fixes both, in that order of proof: **design first
(mockups, Arman validates) → backend → Studio frontend → premium
rollout → tests → deploy.** A design Arman has not approved is never
built.

Non-goals (explicitly out of Phase 5):
- No edtech pivot, no SaaS rebrand, no new product. Acube stays a
  video platform; Studio is its creator surface.
- No recommendation algorithm, no subscriptions/follow system, no
  live streaming, no transcoding pipeline, no ads.
- No change to the Phase 3 security model: no client-set counters,
  no client-granted premium, no unauthenticated writes.
- No fake numbers. Every figure in Studio comes from a server
  aggregation over real rows (see §5). Sample data exists only in
  the design mockups, labelled as such.

---

## 2. Premium UI direction — "Studio Noir" [SUPERSEDED by the
Reconciliation above: Obsidian + Acube Red tokens, not amber/violet.
Kept for history.]

One design language for the whole app, watch side and Studio alike.
Dark-first (the current app is dark by default); light theme keeps
working with the same tokens.

### Design tokens (new, in `apps/web/src/index.css`)

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#0B0B0E` | `#FAFAF8` | Page background |
| `--surface` | `#141419` | `#FFFFFF` | Cards, panels |
| `--surface-2` | `#1C1C22` | `#F1F1EC` | Hover, inputs |
| `--border` | `#26262E` | `#E4E4DC` | 1px borders |
| `--text` | `#F5F5F2` | `#141419` | Headings, body |
| `--text-2` | `#A1A1AA` | `#5B5B60` | Meta, captions |
| `--accent` | `#E8B94A` (amber) | `#9A7414` | Primary actions, active nav, chart line |
| `--accent-2` | `#7C6CFF` (violet) | `#5B4BD6` | Secondary accent, 2nd chart series |
| `--danger` | `#F87171` | `#DC2626` | Delete, errors |
| `--success` | `#34D399` | `#059669` | Positive deltas |

Rules: **one accent (amber) for actions, violet only for charts /
secondary highlights.** No red "YouTube" clone look, no gradients
on text, no new font per screen.

### Typography & spacing
- Font: **Inter** (system fallback), loaded once in `index.html`.
  Display 28/32, section 20/24, card title 15/20, meta 13/18.
- Radius: cards 16px, buttons 10px, inputs 10px. One shadow scale
  (`0 1px 2px` / `0 8px 24px`).
- Spacing scale 4/8/12/16/24/32 only. No ad-hoc margins.
- Video cards: 16:9 thumbnail, 12px gap, title 2-line clamp,
  channel avatar 36px, meta on one line (`1.2K views · 3 days ago`).
  Current cards keep their data; only the presentation changes.
- Every list gets a designed empty state and a skeleton (no blank
  page, no "No videos yet" plain text). Every error gets a retry
  button. Loading skeletons reuse the Phase 2 `LoadingCard` pattern.

### What changes on the watch side (5d, after Studio)
Home, Search, Video page, Channel, Library — tokens + typography +
card grid only. **No layout invention, no feature changes.**
Navbar keeps its place; search stays where it is; the left sidebar
gains one item: **Studio** (with a small "Creator" label), visible
only when signed in. Mobile: sidebar becomes the existing drawer;
Studio gets its own responsive shell (see §4).

---

## 3. Studio — scope

New top-level area under `/studio`, behind the existing
`RequireAuth` guard. One shell, left nav, five tabs. All tabs are
owner-scoped: a creator sees only their own channel's videos,
comments and stats. Another creator's data is 403, never an empty
list (same rule as Phase 3b).

| Tab | Route | What it does |
|---|---|---|
| Dashboard | `/studio` | Totals, 28-day views chart, top videos, latest comments, upload shortcut |
| Content | `/studio/content` | Own videos table: thumbnail, title, visibility, views, likes, comments, date; edit title, change visibility, delete |
| Analytics | `/studio/analytics` | Views / watch-time / likes over time (7 / 28 / 90 days), top videos, traffic by video, best day |
| Comments | `/studio/comments` | Comments on own videos, newest first; delete, (Phase 5: no reply — reply is a follow-up) |
| Upload | existing modal, linked | Same hardened upload from Phase 3b; Studio adds a "recent uploads" list and progress state that survives navigation |
| Customisation | `/studio/customisation` | Channel name, description, avatar initial — reuses the existing channel-edit form, restyled, no new fields in Phase 5 |

Out of scope for Phase 5: scheduled publishing, video replies,
subscriber counts (no follow/subscribe system exists yet — **no
fake subscriber number is ever shown**), revenue/monetisation tab
(premium exists, but there is no per-view payout to report),
notifications.

---

## 4. Frontend design (what the mockups show)

Files (when approved): `apps/web/src/Pages/Studio/` —
`Studio.tsx` (shell + nav), `Dashboard.tsx`, `Content.tsx`,
`Analytics.tsx`, `Comments.tsx`, `Customisation.tsx`,
`components/StatCard.tsx`, `components/StudioChart.tsx`,
`components/VideoRow.tsx`. All lazy-loaded like the other pages
(`Allroutes.tsx` + one `RequireAuth` wrapper on `/studio/*`).

- **Shell:** dark surface, 240px left nav (Dashboard, Content,
  Analytics, Comments, Customisation, back to "View channel"),
  content max-width 1120px. Mobile: nav collapses to a top tab bar.
- **Data:** TanStack Query v5, keys `studio.overview`,
  `studio.analytics(range)`, `studio.videos(page)`,
  `studio.comments(page)`. Mutations (edit title, visibility,
  delete) invalidate only their own key + the overview, with
  optimistic title/visibility patching (same pattern as the Phase 2
  like toggle). No refetch-everything.
- **Charts:** custom SVG line/area chart (no new chart dependency —
  the app already replaced a chart lib with custom SVG in Phase 2).
  One line for views, one for watch time (toggleable), bars for
  per-video comparison. All charts have text fallbacks (table of
  the same numbers) for screen readers.
- **Upload:** the existing `Videoupload` modal is reused; Studio
  adds upload progress + a "processing / ready" state driven by the
  server response, not a client guess.

---

## 5. Backend business logic

New router `apps/api/Routes/studio.js`, mounted at `/studio` in
`app.js`, behind the existing auth middleware + the existing
rate limits. Every handler resolves the caller's channel first
and scopes every query to it — there is no endpoint that lists
another creator's data.

### New endpoints

| Method & path | Auth | Behaviour |
|---|---|---|
| `GET /studio/overview` | JWT | Totals for the caller's channel: total views, total likes, total videos, total comments, watch time (see §6 — only from recorded events), top 5 videos by views, latest 5 comments. One aggregation, cached in-memory for 60s per channel (see below). |
| `GET /studio/analytics?range=7\|28\|90` | JWT | Daily series for the range: `{ date, views, watchMinutes, likes }` per day + totals + best day. `range` validated by Zod (`7/28/90`, default `28`); anything else → 400. |
| `GET /studio/videos?page&limit` | JWT | Own videos only, paginated `{ items, page, limit, total, totalPages }` (Phase 3b shape), sorted `createdAt` desc. |
| `PATCH /video/:id` | JWT + owner | Edit own video: `title` (1–100 chars) and/or `visibility` (`public \| unlisted \| private`). Non-owner → 403. No other field is writable (no client-set views/likes). |
| `DELETE /video/:id` | JWT + owner | Delete own video + its history/like/comment rows in one transaction. Non-owner → 403. |
| `GET /studio/comments?page&limit` | JWT | Comments on own videos only, newest first, with the video title attached. |
| `DELETE /comment/delete/:id` | JWT + owner-of-video | Already exists in Phase 3b; Studio reuses it (delete own video's comment). |

### Business rules (server-enforced, never client-enforced)
- **Ownership:** `videochanel` (channel id) must belong to the
  caller. The caller is identified by JWT `id` → `User` → their
  channel. A video whose channel is not theirs is 403 on read,
  edit and delete alike.
- **Visibility:** `public` = in Home/Search feeds; `unlisted` =
  reachable only by direct `/videopage/:id` link, excluded from
  feeds and search; `private` = owner only (any other viewer gets
  404 — not 403, so private ids are not enumerable). Default for
  new uploads: `public` (unchanged behaviour). The feed query in
  `getallvideos` gains `visibility: "public"` — this is the one
  behaviour change to a public endpoint, and it is covered by a
  regression test (see §7).
- **Counters:** views/likes stay server-side `$inc` (Phase 3b).
  Studio never writes them. Analytics reads the event log (§6),
  not the counters, so a view is counted once per event row.
- **Watch time:** only from completed-watch events the server
  already records for points (`POST /user/watch-complete`).
  A video's stored `duration` (Phase 3b, from Cloudinary) is the
  cap: watch minutes for a completion = `min(duration, actual)`.
  No watch time is invented for videos with no completions.
- **Caching:** `/studio/overview` and `/studio/analytics` results
  are cached per channel for 60 seconds in memory (a `Map` with
  expiry, no new dependency). Mutations (upload / edit / delete)
  invalidate that channel's cache entry. This keeps the dashboard
  fast without stale data surviving a creator's own edit.
- **Errors:** same `{ error: { code, message } }` shape as Phase 3.
  Codes: `UNAUTHORIZED` (401), `FORBIDDEN` (403),
  `VALIDATION_ERROR` (400), `NOT_FOUND` (404).

---

## 6. DB models [SUPERSEDED by the Reconciliation above:
`viewevents` (`ViewEvent`) + `channeldailystats`
(`ChannelDailyStat`) + `playlists` (`Playlist`) +
`libraryentries` (`LibraryEntry`); no `VideoDailyStat`. The
`Videofiles` extension below (visibility + status) still stands.]

Two changes only. No existing collection is renamed; no data is
dropped. A backfill script (run once, idempotent) sets the new
field on old rows.

### 6a. `Videofiles` — extend (no new collection)

```js
visibility: {
  type: String,
  enum: ["public", "unlisted", "private"],
  default: "public",
  index: true,
},
status: {
  type: String,
  enum: ["ready", "processing"],
  default: "ready",
},
```

- Backfill: `db.videofiles.updateMany(
  { visibility: { $exists: false } },
  { $set: { visibility: "public", status: "ready" } })` — every
  existing video stays public, exactly as it is today.
- New index: `{ videochanel: 1, createdAt: -1 }` (the Studio
  content list) + `{ visibility: 1, createdAt: -1 }` (the public
  feed). The existing `{ createdAt: -1 }` index stays.

### 6b. New collection `VideoDailyStat` — the analytics source of truth

One row per (video, UTC day). Written only by the server, when a
view / like / completed-watch happens. Never written from client
input. This is what makes Analytics honest: it is a log, not a
counter that can be edited.

```js
// apps/api/Models/VideoDailyStat.js
const videoDailyStatSchema = new mongoose.Schema({
  videoid:     { type: String, required: true, index: true },
  videochanel: { type: String, required: true, index: true },
  // UTC date "YYYY-MM-DD"
  day:         { type: String, required: true },
  views:       { type: Number, default: 0 },
  likes:       { type: Number, default: 0 },
  watchMinutes:{ type: Number, default: 0 },
  // a completed watch adds 1 here; watchMinutes is capped by duration
  completions: { type: Number, default: 0 },
}, { timestamps: true });

// one row per (video, day) — upserts are atomic, no duplicates
videoDailyStatSchema.index(
  { videoid: 1, day: 1 }, { unique: true });
videoDailyStatSchema.index({ videochanel: 1, day: 1 });
export default mongoose.model("VideoDailyStat", videoDailyStatSchema);
```

Writers (all server-side, atomic `$inc` upserts):
- view (`PATCH /video/view/:id`): `views +1` for today's row.
- like toggle (`PATCH /video/like/:id`): `likes +1 / -1`
  (never below 0 — clamped in the update).
- completed watch (`POST /user/watch-complete`): `completions +1`,
  `watchMinutes += min(durationSeconds, 600) / 60` — a single
  completion can add at most 10 minutes, so a forged loop cannot
  inflate watch time without limit. (The existing points cap,
  10 pts/video/day, is unchanged.)

Backfill for old videos: **none is invented.** A video with no
event rows shows 0 for days before Phase 5, and its lifetime
totals in the Dashboard still come from the existing `views` /
`Like` counters (labelled "all time"), while the Analytics chart
starts from the first event day (labelled with its start date).
The mockups show the chart with sample data; the real chart will
start empty and fill as people watch — that is stated in the UI
("Analytics start from today") so an empty chart is never a bug.

No new collection for comments or channels: comments already live
in `comment.js`; channels are the existing `User` + channel id.
Studio does not need a `Channel` collection in Phase 5.

---

## 7. Tests & verification (same bar as Phases 0–4)

- API (Vitest + Supertest + mongodb-memory-server): overview +
  analytics aggregation on seeded event rows; visibility rules
  (unlisted excluded from feed, private → 404 for others, public
  unchanged); non-owner edit/delete/comment-delete → 403;
  forged absolute-count like → 400 (already covered, re-run);
  pagination shape; range validation (400 on `range=365`).
- Web (Vitest + Testing Library + MSW): Studio shell renders
  only when signed in (`RequireAuth` redirect otherwise); Content
  table edit/delete call the right endpoints; Analytics renders
  the chart from the mocked series; empty states render.
- Playwright e2e: sign in (mocked Google in test only) → open
  `/studio` → dashboard totals match seeded data → edit a title
  → it changes on the video page.
- Manual: `pnpm test` (API + web), `pnpm build`, `pnpm lint`,
  `pnpm typecheck`, browser click-through with screenshots in
  `docs/screenshots/` (dashboard, analytics, content, premium
  Home) — same as Phase 4.
- No merge by Muse. Arman reviews the PR and merges.

---

## 8. Phasing & estimate

| Step | Work | Estimate |
|---|---|---|
| 5a | **Design validation (this plan + mockups)** — Arman approves look + scope, or asks for changes | Arman's call |
| 5b | Backend: `VideoDailyStat` model + writers, `/studio/*` endpoints, `PATCH/DELETE /video/:id`, visibility on feed, cache | 3–4 days |
| 5c | Studio frontend: shell, Dashboard, Content, Analytics, Comments, Customisation, hooks, upload wiring | 4–5 days |
| 5d | Premium UI rollout: tokens, typography, Home / Search / Video page / Channel / Library restyle (no feature changes) | 3–4 days |
| 5e | Tests (API + web + e2e), Playwright click-through, screenshots, `PHASE5_REPORT.md` | 2 days |
| 5f | PR, Arman review + merge, deploy (same `DEPLOYMENT.md` flow) | 1 day |

Total **~2–3 weeks at DSA-prep pace** (the same cadence as Phases
0–4). Order is deliberate: Studio first (it is the feature), the
premium restyle second (it is the coat of paint) — so a half-done
phase still leaves a working Studio.

## 9. Decisions for Arman to validate

1. **Amber + violet on charcoal ("Studio Noir")?** Or a different
   accent? The mockups use this palette — say the word and it changes.
2. **Studio tabs as listed?** Anything to add / cut (e.g. keep
   Customisation out of Phase 5)?
3. **Visibility default `public`?** And is `private → 404 for
   others` the right behaviour?
4. **Analytics from today onwards (no invented history)?** The
   alternative is backfilling the chart from the existing counters,
   which would be invented daily data — not recommended.
5. **Charts as custom SVG (no new dependency)?** Or is a chart
   library acceptable?

Reply with the numbers you want changed (or "approved as-is") and
5b starts. Design changes after approval go through the mockups
first, not straight into code.
