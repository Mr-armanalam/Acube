// Unit test for resolveApiMediaUrl (apps/web/src/Api/index.ts).
// The Vitest env sets VITE_BACKEND_URL=http://localhost:5000 (see
// vitest.config.ts), so a relative /uploads/… URL is prefixed with
// the API origin here — exactly the behaviour the Playwright spec
// then verifies end to end in a real browser
// (apps/web/e2e-phase5/settings-watch-polish.spec.ts).
import { describe, expect, it } from "vitest";
import { resolveApiMediaUrl } from "../Api";

describe("resolveApiMediaUrl", () => {
  it("returns undefined for undefined / empty input", () => {
    expect(resolveApiMediaUrl(undefined)).toBeUndefined();
    expect(resolveApiMediaUrl("")).toBeUndefined();
  });

  it("passes absolute, blob and data URLs through untouched", () => {
    expect(resolveApiMediaUrl("https://cdn.example/a.jpg")).toBe(
      "https://cdn.example/a.jpg",
    );
    expect(resolveApiMediaUrl("http://localhost:5000/uploads/x.png")).toBe(
      "http://localhost:5000/uploads/x.png",
    );
    expect(resolveApiMediaUrl("blob:http://localhost:4173/abc")).toBe(
      "blob:http://localhost:4173/abc",
    );
    expect(resolveApiMediaUrl("data:image/png;base64,AAA")).toBe(
      "data:image/png;base64,AAA",
    );
  });

  it("prefixes a relative /uploads/ URL with the API origin", () => {
    expect(resolveApiMediaUrl("/uploads/x.png")).toBe(
      "http://localhost:5000/uploads/x.png",
    );
  });
});
