# @acube/web — Acube client

Vite 7 + React 19 + React Router 8. TypeScript is strict and incremental
(`src/tsconfig.json`, `allowJs` / `checkJs: false`): the store, query
hooks, API layer, most pages/components, and (Phase 3c)
`PaymentStatus` are `.ts`/`.tsx`. A few legacy files are still plain
JS/JSX (`LoadingCard`, `Showvideo`, `internetStatusContext`,
`reportWebVitals`, `setupTests`, and some `utils`); converting them is
separate work. (Phase 5 match-preview: the
legacy Navbar / Leftsidebar / Searchbar / ProgressRing / WHL /
Showvideolist components and the Likedvideo / Watchlater /
Watchhistory / Yourvideo / Videoupload pages are deleted; the watch
side renders the premium `TopBar`, Studio is its own shell, and
liked / history / watch-later live in `/library` + `/history`.) The
web ESLint flat config lives in
`packages/config/eslint.web.config.mjs` (imported by `eslint.config.mjs`).

## Scripts

- `pnpm dev` — Vite dev server on http://localhost:3000
- `pnpm build` — production build to `dist/` (no `CI=false`)
- `pnpm preview` — serve the production build locally
- `pnpm typecheck` — `tsc --noEmit` (app + node config)

## Env

Create a local `.env` — there is no `.env.example` in the repo. The
client calls the API through an absolute base URL (`VITE_BACKEND_URL`,
default http://localhost:5000), so there is no dev-server proxy.
`VITE_*` vars are bundled into the JS sent to the browser — never put
server secrets here. See the repo-root `README.md` for the full list of
variables (names only); values are set in the deployment dashboard or
supplied by Arman.

## Notes

- `crypto-js` (OTP/location payloads in `src/utils/toEncrypt.js`)
  needs Node built-ins (`buffer`, `stream`, `process`);
  `vite-plugin-node-polyfills` provides them — see `vite.config.ts`.
- The upload progress bar is rendered by the Studio UploadWizard
  (the old custom-SVG `ProgressRing` component was deleted in the
  Phase 5 match-preview pass).
