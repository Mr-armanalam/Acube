import { describe, expect, it } from "vitest";
import { api } from "./helpers.js";

describe("GET / and GET /health", () => {
  it("GET / returns the working message", async () => {
    const res = await api.get("/");
    expect(res.status).toBe(200);
    expect(res.text).toBe("Your tube is working");
  });

  it("GET /health returns ok with a connected DB", async () => {
    const res = await api.get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db).toBe("connected");
    expect(typeof res.body.uptime).toBe("number");
  });

  it("unknown routes return the stable 404 error shape", async () => {
    const res = await api.get("/definitely-not-a-route");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(typeof res.body.error.message).toBe("string");
  });

  it("CORS allows the configured frontend origin", async () => {
    const res = await api.get("/health").set("Origin", "http://localhost:3000");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });

  it("CORS rejects an origin outside the allowlist (403, no allow header)", async () => {
    const res = await api.get("/health").set("Origin", "https://evil.example.com");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN_ORIGIN");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("security headers are present (helmet)", async () => {
    const res = await api.get("/health");
    expect(res.headers["x-dns-prefetch-control"]).toBeDefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("rate-limit headers are emitted", async () => {
    const res = await api.get("/health");
    // express-rate-limit with standardHeaders "draft-7" sends one combined
    // `RateLimit` header (limit=…, remaining=…, reset=…) plus RateLimit-Policy.
    expect(res.headers["ratelimit"]).toMatch(/limit=10000/);
    expect(res.headers["ratelimit-policy"]).toBeDefined();
  });
});
