# apps/api/scripts

## seed-demo.js — demo seed (Phase 5 fix, test-only)

Seeds labelled demo data into the database named by `DB_URL`:

```sh
DB_URL=mongodb://127.0.0.1:27017/acube pnpm --filter @acube/api seed:demo
```

What it seeds (see `seedDemo.js` for the full spec): 3 demo channels +
24 demo viewers, 7 public catalogue videos (+ 1 draft, 1 unlisted,
1 private, 1 soft-deleted), 1,503 view events + daily stats across
28 days, 113 likes, nested comments incl. a pinned creator comment,
playlists incl. a Learning Path, library entries and history rows for
Today/Yesterday with `progressSec`.

- **Idempotent**: every seeded row carries `demo: true`; the script
  clears `demo: true` rows first, then re-inserts. Re-running it
  produces the same counts and never touches real data.
- **Totals are derived, not hardcoded**: per-video counters and the
  daily stats are aggregated from the generated events/likes, and the
  script asserts 1,503 views / 113 likes before returning.
- **Safety**: a `DB_URL` containing `atlas` or `prod` is refused
  unless `SEED_DEMO_ALLOW_REMOTE=1` is set.
- **E2E**: `apps/api/e2e-server.mjs` calls `seedDemoData()` in
  `PHASE5_SEED` mode (Playwright Phase 5 suite), then adds the e2e
  user's own rows on top.

## syntax-check.mjs — API build step

`pnpm --filter @acube/api build` runs a `node --check` syntax pass
over every source file (plain JS has no bundle step).
