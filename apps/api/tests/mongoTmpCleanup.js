// Removes stale mongodb-memory-server data dirs left behind by killed runs.
//
// Background (Phase 4 hang investigation, 10 Nov 2026): mongodb-memory-server
// stores each mongod's data dir under os.tmpdir() as `mongo-mem-*` (~200 MB
// each). A normal run deletes its dir on stop, but a killed run (SIGTERM to
// the test pipeline, Ctrl-C, OOM) leaves the dir behind. This VM's /tmp is a
// 512 MB tmpfs, so two orphaned dirs filled it to 82% and the next mongod
// failed to start with `fassert()` — which looked like a test hang (no test
// output, pipeline stuck retrying). Cleaning here, before a new mongod
// starts, keeps the suite self-healing.
//
// Safety: only directories literally named `mongo-mem-*` inside os.tmpdir()
// are touched, only when their mtime is older than STALE_AFTER_MS (a live
// run's dir is minutes old at most), and every failure is swallowed —
// cleanup must never break a test run. Concurrent runs are safe: a
// concurrently-running suite's dir is fresh, so it is never deleted.
import { readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STALE_AFTER_MS = 60 * 60 * 1000; // 1 hour

export async function cleanStaleMongoTmp() {
  const dir = tmpdir();
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let removed = 0;
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("mongo-mem-")) continue;
    const full = join(dir, entry.name);
    try {
      const info = await stat(full);
      if (now - info.mtimeMs < STALE_AFTER_MS) continue;
      await rm(full, { recursive: true, force: true });
      removed += 1;
    } catch {
      // Best effort only — never fail a run over tmp cleanup.
    }
  }
  if (removed > 0) {
    console.log(
      `[mongo-tmp-cleanup] removed ${removed} stale mongo-mem-* dir(s) from ${dir}`,
    );
  }
  return removed;
}
