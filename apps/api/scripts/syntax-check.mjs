// `pnpm build` for the API: plain JS has no bundle step, so the build is a
// syntax check of every source file (equivalent to `node --check` per file).
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const skipDirs = new Set(["node_modules", "tests", "uploads", "coverage"]);

function collectJsFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (!skipDirs.has(entry)) collectJsFiles(full, out);
    } else if (entry.endsWith(".js") || entry.endsWith(".mjs")) {
      out.push(full);
    }
  }
  return out;
}

const files = collectJsFiles(root);
const failures = [];
for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (error) {
    failures.push(file);
    process.stderr.write(error.stderr?.toString() || `${file}: syntax error\n`);
  }
}

if (failures.length > 0) {
  console.error(`syntax check failed for ${failures.length} file(s)`);
  process.exit(1);
}
console.log(`syntax check passed for ${files.length} file(s)`);
