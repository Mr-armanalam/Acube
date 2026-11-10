# Phase 2 Report — Acube Professional Rebuild (client toolchain + state migration)

Branch: `feat/acube-professional-rebuild` (from Phase 1 `89c9733`, on top of `main` @ `ec16620`).
Date: 10 Nov 2026. Node on this VM: v24.22.1 (target pinned to 22 via `.nvmrc`; web `engines` now `>=22.22.0` — React Router 8 requires it).
No push, no PR, no merge. Phase 3+ (server security fixes) not started.
Coordinator verification (independent re-run, 10 Nov 2026 ~17:00 IST): install / build / API tests / web tests / typecheck / lint all re-run from repo root — see §6.

## 1. What changed — Phase 2a: toolchain (commits `7afc36d`, `5a70b6f`, `b9af197`)

- **CRA → Vite 7.3.8** (`@vitejs/plugin-react` 4.7.0). `react-scripts` removed, `index.html` moved from `public/` to `apps/web/` root (`%PUBLIC_URL%` → `/`, module script `/src/main.tsx`), `src/index.js` → `src/main.tsx`. 4 JSX-in-`.js` files renamed to `.jsx` (`App`, `RoomContext`, `deta`, `internetStatusContext`): @vitejs/plugin-react 4 drops its Babel transform in production builds and esbuild only applies JSX to `.jsx`/`.tsx`. Extensionless imports resolve unchanged.
- **React 18.3.1 → 19.3.1** (react + react-dom), **react-router-dom 6.23.1 → react-router 8.5.1** (package renamed; imports changed in 15 files, Routes/Route/BrowserRouter API unchanged, no breaking changes found).
- **TypeScript 5.9.3 strict, incremental**: `tsconfig.json` + `tsconfig.node.json` extending `packages/config` base, `allowJs: true`, `checkJs: false`. Converted in 2a: entry (`main.tsx`, `vite-env.d.ts`) + `src/Api/index.ts` (typed axios instance, no `any`). Workspace TS override `^5.9.3` kept.
- **Env renamed `REACT_APP_*` → `VITE_*`** in code (`Api/index.ts`, `RoomContext.jsx`, `main.tsx`, `toEncrypt.js`) + `apps/web/.env.example`; `dotenv` + `process` polyfill dropped. No dev proxy — grep confirmed zero relative `/api` calls; all API calls go through the absolute `VITE_BACKEND_URL` axios baseURL (documented in `vite.config.ts`). The old wrong `"proxy": "http://localhost:3000"` is gone.
- **Build without `CI=false`**: web build script is now `vite build`; the `CI=false` suppression is removed.
- **Dep cleanup**: `moment` → `date-fns` 4.4.0 (only 3 call sites, all `.fromNow()` → `formatDistanceToNow(date, { addSuffix: true })` with a `?? Date.now()` guard; wording differs slightly — "less than a minute ago" vs "a few seconds ago", "about 1 hour ago" vs "an hour ago"). `peerjs` dropped (grep-verified: imported nowhere); `simple-peer` 9.11.1 kept (used in `StreamRoom`) — it needs Node built-ins, so `vite-plugin-node-polyfills` 0.28.0 is in the Vite config. `recordrtc` 5.6.2 kept (no React peer dep, builds fine under React 19). `react-circular-progressbar` dropped (peer range stops at React 18) and replaced with a small custom SVG ring `src/Component/ProgressRing/ProgressRing.jsx` + `.css` (same props the upload page used). `react-icon` typo dep, `uuid`, `dotenv`, `process` dropped (unused under Vite). `web-vitals` → 5.3.0 (`reportWebVitals.js` updated to the v5 `on*` API, `getFID` → `onINP`).
- **`.npmrc` removed**: clean reinstall with pnpm's default isolated linker — build, typecheck, API tests, dev boot all green; lockfile unchanged by the switch.

## 2. What changed — Phase 2b: state migration (commits `3f4178c`, `39ee29e`, `edc8950`, `5001a66`)

- **Redux Toolkit 2.14.0** (satisfies ^2.12.0) for **client state only**, in `apps/web/src/store/`: `auth` (session + OTP status; reducers pure — localStorage writes moved to thunks, session hydrated once at store bootstrap, Navbar re-dispatch loop removed), `theme` (persisted by a store subscriber), `player` (play/theater/mute/volume/rate; per-frame time stays local), `chatUi` (selected conversation, debounced search text, sidebar flag), `upload` (progress/status). Typed `useAppDispatch`/`useAppSelector`. **No RTK Query adopted.**
- **TanStack Query 5.107.1** (+ devtools 5.107.1, dev only) for **all server state**, in `apps/web/src/query/`: videos, channels, comments, history/liked/watch-later, chat users/messages, groups/group messages, premium/downloads. Mutations invalidate only their own key; **optimistic updates** for like count, watch-later toggle, liked add/remove, comment post. No refetch-everything anywhere — App's old global dispatch-everything effect is gone; pages fetch their own data.
- **Deleted**: `src/Reducers/` (17 files) + `src/action/` (16 files) — zero imports remained before deletion (verified by grep). `redux` + `redux-thunk` removed; `react-redux` 9.3.1 kept (RTK Provider/hooks).
- **Normalisation**: `useVideosById()` map; `Showvideolist` is now an O(1) lookup (was a per-row full-array filter). All in-render `.reverse()` mutations removed — `Showvideogrid` renders the order given; callers pass reversed copies where the old displayed order was reversed (verified order preserved per route: Home/Channel/Yourvideo/Videopage = API order, Search = reversed).
- **Axios**: 401 response interceptor in `src/Api/index.ts` clears the session and redirects home, guarded to fire only when a token was present (cannot loop). Bearer attach kept, now via safe session parse.
- **Routing** (`Allroutes.tsx`): `RequireAuth` guards on `/Library`, `/chat`, `/Yourvideo`, `/video-stream/*` — redirect to `/` (there is no `/login` route; Google sign-in lives in the Navbar; noted in code). `/Likedvideo`, `/Watchhistory`, `/Watchlater` were not in the guard list, so they keep their "Plz login" messages. All routes except Home are `React.lazy` + `Suspense`; `*` 404 route added.
- **TS conversion**: store + Api + all query hooks + every touched page/component converted to strict TS, zero `any`. Two deliberate exceptions: `StreamRoom.jsx` stays `.jsx` (only its selector was swapped — `simple-peer`/`recordrtc` have no bundled types, and a shim would be scope creep) and `PaymentStatus.jsx` stays `.jsx` (no Redux, only lazy-loaded).
- **`@acube/shared` Zod schemas: unused.** The package is plain JS with no type declarations, so `z.infer` isn't importable from TS without a hand-written declaration; payload types are defined locally in `src/types.ts` from the Mongoose models, with the API's own Zod validation as the backstop. (Follow-up: give `packages/shared` a TS build / `.d.ts` so the client can share the schemas — see §7.)

## 3. What changed — Phase 2c: bug fixes + client tests (commits `3cd31ed`, `e3e807c`, `844066f`)

All 8 client bugs from the audit are fixed, each with a regression test:

| # | Bug | Fix (file) |
|---|---|---|
| 1 | OTP Skip button bypassed OTP (`OTP_Auth.jsx:89`) | Skip button, `status` state, and the `\|\| status === 200` shortcut removed — `apps/web/src/Pages/Auth/OTP_Auth.tsx`. Auth completes only when the server verifies the OTP (`verifyOTPStatus.status === 200`). |
| 2 | Search casing — route `:Searchquery` vs `{searchquery}` | `apps/web/src/Pages/Search/Search.tsx` reads `useParams()` as `{ Searchquery }`; filter fallback is now `""` instead of the literal `"undefined"`. |
| 3 | Home reload loop — `setTimeout(location.reload(), 5000)` on empty feed | Removed entirely — `apps/web/src/Pages/Home/Home.tsx`. Empty list renders "No videos yet. Be the first to upload one!". |
| 4 | DownloadVideo: no `videoId` + guard `user === null \|\| undefined` always falsy | Both guards fixed to `!user` (logged-out click `preventDefault()`s the anchor so no file is served); mutation takes `{ videoId }` and `videoId={vv?._id}` is threaded from the video page — `DownloadVideo.tsx`, `src/query/downloads.ts`, `Likewatchlatersavebtns.tsx`. Note: the server's `z.object({})` strips the extra field, so validation still passes. |
| 5 | `.reverse()` mutating store arrays in render | Verified by grep: no stragglers. Remaining calls all copy first (`WHLvideolist` `.filter().slice().reverse()`, `Search` `[...data].filter().reverse()`, `useVideosNewestFirst`, `useCommentsForVideo`). No code change needed. |
| 6 | Player `setInterval` leak on every `timeupdate` + anonymous listener cleanup that never removed | `setInterval` in `handleTimeUpdate` removed — current time is driven by the `timeupdate` event itself. Fullscreen/PiP listeners are now named stable `useCallback` handlers used for both add and remove; the video element is captured for cleanup — `apps/web/src/Component/videoPlayer/videoPlayer.tsx`. |
| 7 | Upload limit message "less than 1 kb" for a 10 MB limit | Corrected to "less than 10 MB", shown inline (`role="alert"`) instead of `alert()` — `apps/web/src/Pages/Videoupload/Videoupload.tsx`. Close-on-success verified and kept — plus two real defects found while verifying it: (a) a reopened modal closed at once on the stale `success` status — fixed by resetting the upload slice on mount and skipping the close on first render; (b) a trailing upload-progress event fired after success flipped status back to `uploading`, silently un-closing the modal — fixed in `src/store/slices/uploadSlice.ts` (`setUploadProgress` no longer clobbers a terminal success/error status). |
| 8 | PaymentStatus trusted the URL string (`includes("success")`) | Now calls `useHandlePaymentStatus` (`POST /download/handle-payment-status`, `{}` body — the server expects an empty body) before showing success; shows "Verifying…" while pending and failure if verification fails or returns `success: false`. A plain visit to `/paymentstatus` never calls the API. `PaymentStatus.jsx` stays `.jsx`. **No server-side premium logic touched** — `handlePaymentStatus` still grants premium unconditionally server-side; the client now only gates the success screen on a server round-trip. |

## 4. Tests — client suite new: 35/35 green, 12 files

Run: `pnpm --filter @acube/web test` (Vitest 5.1.0 + Testing Library 16.3.3 + user-event 14.6.9 + jsdom 31 + MSW 2.15.0). Stale `src/App.test.js` (CRA "learn react" placeholder) deleted. `src/mocks/` (MSW handlers with in-memory fixtures + request capture, node server), `src/test/testUtils.tsx` (fresh Redux store + QueryClient per test), `src/setupTests.js` (MSW lifecycle, `onUnhandledRequest: 'error'`, `window.alert` stub).

| File | Tests | Covers |
|---|---|---|
| `search.test.tsx` | 3 | filters videos by the `:Searchquery` route param |
| `home.test.tsx` | 2 | empty state, no reload timer |
| `otp.test.tsx` | 3 | no-Skip assertion, full verify-to-home flow, wrong OTP |
| `likeSave.test.tsx` | 4 | like/save toggles |
| `upload.test.tsx` | 4 | oversize 10 MB rejected, valid upload closes, reopen, trailing-progress slice regression |
| `chat.test.tsx` | 1 | chat send (RoomContext opens a real socket.io connection at import time, so the test mocks `socket.io-client`) |
| `player.test.tsx` | 4 | play/pause, timeupdate with zero `setInterval`, keyboard seek, listener cleanup by reference |
| `authGuard.test.tsx` | 2 | logged-out redirect from `/Library` to Home, signed-in render |
| `download.test.tsx` | 2 | logged-out blocked, no download recorded |
| `paymentStatus.test.jsx` | 3 | verification call, verifying state, failure state |
| `authSlice.test.ts` | 4 | auth slice |
| `videosQuery.test.tsx` | 3 | videos query |
| **Total** | **35** | **12 files, 0 failures** |

Test-environment quirks (documented in code): jest-dom 6.9.1's Vitest augmentation targets `Assertion` in module `vitest`, but Vitest 5 declares it in an internal chunk, so the augmentation doesn't merge and matchers fail typecheck — tests use Vitest built-ins (`toBeNull`/`toMatch`/`.textContent`/`.value`) instead; a comment in `setupTests.js` records this. MSW handlers must not call `request.formData()` (jsdom File isn't a Node File — undici's multipart parser throws; the upload handler parses the raw multipart text instead), and jsdom XHR serialises the uploaded file's name as `"blob"`.

## 5. Version table (before → after, installed versions verified)

| Package | Before (Phase 1) | After (Phase 2) |
|---|---|---|
| vite / @vitejs/plugin-react | — (CRA 5.0.1) | **7.3.8 / 4.7.0** (new) |
| react / react-dom | 18.3.1 | **19.3.1** |
| react-router-dom → react-router | 6.23.1 | **8.5.1** (range `^8.3.1` resolved up) |
| typescript | override ^5.9.3 only | **5.9.3** (installed, strict) |
| @reduxjs/toolkit | — (redux 5.0.1 + redux-thunk 3.1.0) | **2.14.0** (new; redux/redux-thunk removed) |
| @tanstack/react-query (+ devtools) | — | **5.107.1** (new) |
| react-redux | 9.1.2 | 9.3.1 (kept) |
| axios | 1.7.2 | 1.7.2 (kept; 401 interceptor added) |
| moment | 2.30.1 | removed → **date-fns 4.4.0** |
| peerjs / simple-peer | 1.5.4 / 9.11.1 | peerjs **removed** / simple-peer 9.11.1 kept |
| recordrtc | 5.6.2 | 5.6.2 (kept) |
| react-circular-progressbar | 2.1.0 | removed → custom `ProgressRing` |
| react-icon (typo) / uuid / dotenv / process | present | removed (unused under Vite) |
| web-vitals | 2.1.4 | **5.3.0** |
| vitest / jsdom | — | **5.1.0 / 31.0.0** (new, web) |
| @testing-library/react / jest-dom / user-event | 13.4.0 / 5.17.0 / 13.5.0 | **16.3.3 / 6.9.1 / 14.6.9** |
| msw | — | **2.15.0** (new, dev) |
| vite-plugin-node-polyfills | — | **0.28.0** (new, for simple-peer) |
| .npmrc `node-linker=hoisted` | present (CRA needed it) | **removed** |

## 6. Verification (coordinator re-run, clean, from repo root)

| Check | Command | Result |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | **exit 0** |
| Build | `pnpm build` | **exit 0** — 2 tasks successful. Web: initial `index-DXpe_oBH.js` 1,113.18 kB (gzip 343.31 kB) + lazy chunks (StreamRoom 85.28 kB / gzip 25.99 kB, Videopage 15.92 kB, Chat 12.33 kB, Library 1.97 kB, Channel/OTP_Auth 1.93 kB each, rest < 1.1 kB). Only warning: chunk >500 kB (pre-existing single-bundle shape). API: syntax check, no outputs (pre-existing Turbo warning). |
| Test (API) | `pnpm test` (root — runs API suite only, see §7) | **75 / 75 passed, 9 files** |
| Test (web) | `pnpm --filter @acube/web test` | **35 / 35 passed, 12 files** |
| Typecheck | `pnpm typecheck` | **exit 0** (web `tsc --noEmit` both tsconfigs) |
| Lint | `pnpm lint` | **exit 0** — only the API ESLint task runs; **no web lint config exists** (see §7) |
| Dev/preview | `vite dev` / `vite preview` (workers) | `/` → 200, `/src/main.tsx` → 200, title "Acube", `/Library` SPA fallback → 200 |

Bundle size before/after: Phase 2a single chunk 1,169.12 kB (gzip 357.33 kB) → after lazy routes 1,113.18 kB (gzip 343.31 kB) initial + lazy chunks. Initial chunk shrank only ~56 kB / ~14 kB gzip — most of the 1.1 MB is vendor/polyfill weight still in the entry chunk, so a `manualChunks` split is a possible follow-up, not done here.

Scope: 10 commits in Phase 2 (`7afc36d`, `5a70b6f`, `b9af197`, `3f4178c`, `39ee29e`, `edc8950`, `5001a66`, `3cd31ed`, `e3e807c`, `844066f`), 163 files changed vs Phase 1 (`+9,752 / −16,134`, mostly lockfile + deletions of legacy Redux). Working tree clean. `apps/api` untouched (0 diff lines vs Phase 2a). `main` untouched, nothing pushed.

## 7. Known remaining issues / next-phase TODOs (not fixed in Phase 2)

- **Server security (Phase 3+)**: Google token verification, premium-before-payment server logic, OTP server store, ownership/authorisation, pagination, E2E chat claims, `JWT_SECERT` rename. Untouched.
- **No runtime browser verification**: build + typecheck + preview smoke cover all routes structurally; guards redirect logged-out users; Home/Search/Channel/Videopage render from Query data with loading/error states. **Not runtime-verified in a real browser**: actual video playback, Google sign-in flow, chat send/receive against a live backend, lazy-chunk loading on navigation — a browser agent should click through those before the portfolio demo.
- **Root `pnpm test` runs only the API suite** (`"test": "pnpm --filter @acube/api test"`). Web tests need `pnpm --filter @acube/web test`. Follow-up: make the root test script run both suites (e.g. via Turbo).
- **No web ESLint config**: the CRA `eslintConfig` block is gone; `@acube/config` eslint is Node-oriented. `pnpm lint` exit 0 only covers the API. Follow-up: add a web flat config.
- **`@acube/shared` unused by the web**: plain JS, no type declarations — give it a TS build / `.d.ts` so the client can share the Zod schemas instead of local `src/types.ts`.
- **Bundle**: initial chunk still 1,113 kB (gzip 343 kB) — `manualChunks` vendor split is a possible follow-up.
- **jest-dom matchers unusable under Vitest 5** (see §4) — tests use Vitest built-ins; revisit if Vitest/jest-dom augmentation is fixed upstream.
- **StreamRoom.jsx + PaymentStatus.jsx stay `.jsx`** (untyped simple-peer/recordrtc; PaymentStatus has no Redux). Full TS conversion of those two files is a small follow-up.
- **`/Likedvideo`, `/Watchhistory`, `/Watchlater` are not behind `RequireAuth`** (not in the guard list) — they keep their "Plz login" messages. Decide whether to guard them too.
- **Node version**: verified on the VM's Node v24.22.1; `.nvmrc` pins 22 and web `engines` require >= 22.22, but no run was done on Node 22 itself.

## 8. How to run the app

```bash
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env       # fill in real values
cp apps/web/.env.example apps/web/.env       # fill in real values (VITE_* names now)
pnpm dev                                      # api :5000 (nodemon) + web :3000 (Vite)
pnpm test                                     # API suite (75 tests)
pnpm --filter @acube/web test                 # web suite (35 tests)
pnpm build && pnpm typecheck && pnpm lint
```

## 9. Commits (branch `feat/acube-professional-rebuild`, not pushed)

| Commit | Subject |
|---|---|
| `7afc36d` | Phase 2a: Vite 7 + React 19 + React Router 8 + TS scaffolding |
| `5a70b6f` | Phase 2a: dep cleanup — date-fns, drop peerjs/moment/uuid, custom ProgressRing |
| `b9af197` | Phase 2a: drop node-linker=hoisted (.npmrc removed) |
| `3f4178c` | Phase 2b: RTK store + Query client |
| `39ee29e` | Phase 2b: videos/channels/comments on Query |
| `edc8950` | Phase 2b: chat/history/liked/downloads on Query |
| `5001a66` | Phase 2b: delete legacy Redux + route guards + lazy routes |
| `3cd31ed` | Phase 2c: fix OTP/search/home/download bugs |
| `e3e807c` | Phase 2c: fix player interval leak + upload message + PaymentStatus |
| `844066f` | Phase 2c: client test suite (MSW + Testing Library) |
| _(this report)_ | Phase 2: report |

## 10. Blocked / not done

Nothing is blocked. All 8 bugs fixed, both test suites green, both apps build, frozen install works, typecheck + lint exit 0. The only deliberate non-completions are the out-of-scope items in §7 and the Phase 3+ server security work, which this phase was told not to start.
