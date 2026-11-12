// Vercel SPA fallback (12 Nov 2026): the repo-root vercel.json must
// rewrite every path to /index.html so direct loads / refreshes of
// client-side routes (/watch/:id, /search/:query) serve the SPA instead
// of Vercel 404ing. Vercel serves real files in the output dir before
// applying rewrites, so this single catch-all rule does not shadow
// static assets.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Same candidate-path trick as watchDetails.test.tsx /
// watchComments.test.tsx: Vitest runs with cwd apps/web under turbo,
// but the file lives at the repo root.
function readVercelJson(): string {
  for (const candidate of [
    join(process.cwd(), "vercel.json"),
    join(process.cwd(), "../../vercel.json"),
  ]) {
    try {
      return readFileSync(candidate, "utf8");
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("vercel.json not found at the repo root");
}

describe("vercel.json SPA fallback", () => {
  it("rewrites every path to /index.html", () => {
    const parsed: unknown = JSON.parse(readVercelJson());
    expect(parsed).toEqual({
      rewrites: [{ source: "/(.*)", destination: "/index.html" }],
    });
  });
});
