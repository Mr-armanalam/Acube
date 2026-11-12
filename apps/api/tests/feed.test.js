// Personalised feed — GET /feed (see Controllers/feed.js).
// Fixtures seed ViewEvents / History directly (the same rows
// recordView() writes server-side), with explicit createdAt values so
// recency is deterministic. Nothing here touches apps/web.
import { describe, expect, it } from "vitest";
import { api, authHeader, createUser, createVideo } from "./helpers.js";
import ViewEvent from "../Models/ViewEvent.js";
import History from "../Models/history.js";

const DAY_MS = 86_400_000;

function daysAgo(days) {
  return new Date(Date.now() - days * DAY_MS);
}

function dayString(date) {
  return date.toISOString().slice(0, 10);
}

async function watchVideo(user, video, watchedAt = new Date()) {
  await ViewEvent.create({
    videoid: String(video._id),
    videochanel: String(video.videochanel),
    viewer: String(user._id),
    day: dayString(watchedAt),
    watchSeconds: 0,
    completed: false,
    createdAt: watchedAt,
    updatedAt: watchedAt,
  });
}

function titles(res) {
  return res.body.items.map((item) => item.videotitle);
}

describe("GET /feed — tag affinity beats freshness", () => {
  it("a video sharing tags with a recently-watched video outranks a newer unrelated video", async () => {
    const user = await createUser();
    const watched = await createVideo({
      videotitle: "Watched React Intro",
      tags: ["react"],
      views: 0,
      createdAt: daysAgo(1),
    });
    await watchVideo(user, watched, new Date());
    const affinityMatch = await createVideo({
      videotitle: "React Hooks Deep Dive",
      tags: ["react"],
      views: 0,
      createdAt: daysAgo(30),
    });
    const newerUnrelated = await createVideo({
      videotitle: "Cooking Basics Today",
      tags: ["cooking"],
      views: 0,
      createdAt: new Date(),
    });

    const res = await api.get("/feed").set(authHeader(user));
    expect(res.status).toBe(200);
    const order = titles(res);
    expect(order.indexOf(affinityMatch.videotitle)).toBeGreaterThan(-1);
    expect(order.indexOf(newerUnrelated.videotitle)).toBeGreaterThan(-1);
    expect(order.indexOf(affinityMatch.videotitle)).toBeLessThan(
      order.indexOf(newerUnrelated.videotitle),
    );
  });
});

describe("GET /feed — recency beats old watches", () => {
  it("same tag, recent watch outranks old watch", async () => {
    const user = await createUser();
    const oldWatched = await createVideo({
      videotitle: "Old React Watch",
      tags: ["react"],
      views: 0,
      createdAt: daysAgo(40),
    });
    const recentWatched = await createVideo({
      videotitle: "Recent Vue Watch",
      tags: ["vue"],
      views: 0,
      createdAt: daysAgo(40),
    });
    await watchVideo(user, oldWatched, daysAgo(30));
    await watchVideo(user, recentWatched, new Date());
    const oldTagMatch = await createVideo({
      videotitle: "React Candidate Old Tag",
      tags: ["react"],
      views: 0,
      createdAt: daysAgo(30),
    });
    const recentTagMatch = await createVideo({
      videotitle: "Vue Candidate Recent Tag",
      tags: ["vue"],
      views: 0,
      createdAt: daysAgo(30),
    });

    const res = await api.get("/feed").set(authHeader(user));
    expect(res.status).toBe(200);
    const order = titles(res);
    expect(order.indexOf(recentTagMatch.videotitle)).toBeLessThan(
      order.indexOf(oldTagMatch.videotitle),
    );
  });
});

describe("GET /feed — cold start", () => {
  it("logged-out returns trending/newest with no 'Because you watched' labels", async () => {
    const trending = await createVideo({
      videotitle: "Huge Views Video",
      tags: ["music"],
      views: 100000,
      createdAt: daysAgo(30),
    });
    const newest = await createVideo({
      videotitle: "Brand New Video",
      tags: ["music"],
      views: 0,
      createdAt: new Date(),
    });
    const res = await api.get("/feed");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    for (const item of res.body.items) {
      expect(["trending", "newest"]).toContain(item.reason.type);
      expect(item.reason.label).not.toMatch(/^Because you watched/);
    }
    // Most-viewed first: popularity beats freshness here.
    expect(res.body.items[0].videotitle).toBe(trending.videotitle);
    expect(res.body.items[1].videotitle).toBe(newest.videotitle);
  });

  it("signed-in with zero ViewEvents is the same cold start", async () => {
    const user = await createUser();
    await createVideo({ videotitle: "Cold Start Video", tags: ["news"] });
    const res = await api.get("/feed").set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(["trending", "newest"]).toContain(res.body.items[0].reason.type);
    expect(res.body.items[0].reason.label).not.toMatch(
      /^Because you watched/,
    );
  });
});

describe("GET /feed — diversity cap", () => {
  it("no more than 10 of the first 20 items share one top reason tag", async () => {
    const base = Date.now();
    // 20 high-view "react" videos would fill page 1 on their own; 5
    // "vue" videos are the only other-tag filler.
    for (let i = 0; i < 20; i += 1) {
      await createVideo({
        videotitle: `React Video ${i + 1}`,
        tags: ["react"],
        views: 1000 + i,
        createdAt: new Date(base - i * 1000),
      });
    }
    for (let i = 0; i < 5; i += 1) {
      await createVideo({
        videotitle: `Vue Video ${i + 1}`,
        tags: ["vue"],
        views: 10,
        createdAt: new Date(base - i * 1000),
      });
    }
    const res = await api.get("/feed");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(25);
    expect(res.body.totalPages).toBe(2);
    // Page 1 is short (15) rather than breaking the cap: 10 react +
    // all 5 vue; the remaining 10 react spill to page 2.
    expect(res.body.items).toHaveLength(15);
    const reactCount = res.body.items.filter((item) =>
      (item.tags ?? []).includes("react"),
    ).length;
    expect(reactCount).toBeLessThanOrEqual(10);
    expect(
      res.body.items.filter((item) => (item.tags ?? []).includes("vue")),
    ).toHaveLength(5);
    const page2 = await api.get("/feed?page=2");
    expect(page2.status).toBe(200);
    expect(page2.body.items).toHaveLength(10);
    expect(
      page2.body.items.filter((item) =>
        (item.tags ?? []).includes("react"),
      ),
    ).toHaveLength(10);
  });
});

describe("GET /feed — pagination and logged-out shape", () => {
  it("page 2 differs from page 1, totals stay consistent", async () => {
    const base = Date.now();
    for (let i = 0; i < 25; i += 1) {
      await createVideo({
        videotitle: `Topic Video ${i + 1}`,
        tags: [`topic-${i % 5}`],
        views: i,
        createdAt: new Date(base - i * 1000),
      });
    }
    const page1 = await api.get("/feed?page=1&limit=20");
    const page2 = await api.get("/feed?page=2&limit=20");
    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);
    expect(page1.body).toMatchObject({ page: 1, limit: 20, total: 25, totalPages: 2 });
    expect(page2.body).toMatchObject({ page: 2, limit: 20, total: 25, totalPages: 2 });
    expect(page1.body.items).toHaveLength(20);
    expect(page2.body.items).toHaveLength(5);
    const ids1 = new Set(page1.body.items.map((item) => String(item._id)));
    for (const item of page2.body.items) {
      expect(ids1.has(String(item._id))).toBe(false);
    }
  });

  it("logged-out works and every item carries a { type, label } reason", async () => {
    await createVideo({ videotitle: "Public Video", tags: ["general"] });
    const res = await api.get("/feed");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].reason).toEqual({
      type: expect.any(String),
      label: expect.any(String),
    });
  });
});

describe("GET /feed — watched videos are deprioritised, not excluded", () => {
  it("a watched video still appears but ranks below an unwatched video with the same affinity", async () => {
    const user = await createUser();
    const watched = await createVideo({
      videotitle: "Watched React Video",
      tags: ["react"],
      views: 0,
      createdAt: new Date(),
    });
    await watchVideo(user, watched, new Date());
    const unwatched = await createVideo({
      videotitle: "Unwatched React Video",
      tags: ["react"],
      views: 0,
      createdAt: new Date(),
    });

    const res = await api.get("/feed").set(authHeader(user));
    expect(res.status).toBe(200);
    const order = titles(res);
    expect(order).toContain(watched.videotitle);
    expect(order.indexOf(unwatched.videotitle)).toBeLessThan(
      order.indexOf(watched.videotitle),
    );
    // The re-surfaced watched video never claims itself as its reason.
    const watchedItem = res.body.items.find(
      (item) => item.videotitle === watched.videotitle,
    );
    expect(watchedItem.reason.label).not.toBe(
      `Because you watched ${watched.videotitle}`,
    );
  });

  it("a History row alone (no ViewEvent) also deprioritises the video", async () => {
    const user = await createUser();
    const watched = await createVideo({
      videotitle: "History Only Video",
      tags: ["react"],
      views: 0,
      createdAt: new Date(),
    });
    await History.create({
      videoid: String(watched._id),
      viewer: String(user._id),
      likedon: new Date(),
      progressSec: 0,
    });
    const unwatched = await createVideo({
      videotitle: "Unwatched Sibling Video",
      tags: ["react"],
      views: 0,
      createdAt: new Date(),
    });
    // No ViewEvents at all → cold start, so both score on
    // freshness/popularity only; the History-only video is still
    // deprioritised (×0.25) and must rank below its unwatched twin.
    const res = await api.get("/feed").set(authHeader(user));
    expect(res.status).toBe(200);
    const order = titles(res);
    expect(order).toContain(watched.videotitle);
    expect(order.indexOf(unwatched.videotitle)).toBeLessThan(
      order.indexOf(watched.videotitle),
    );
  });
});

describe("GET /feed — reasons are real", () => {
  it("every 'Because you watched X' names a video that user actually watched", async () => {
    const user = await createUser();
    const otherUser = await createUser();
    const watchedReact = await createVideo({
      videotitle: "Actually Watched React",
      tags: ["react"],
      views: 0,
      createdAt: daysAgo(1),
    });
    const watchedVue = await createVideo({
      videotitle: "Actually Watched Vue",
      tags: ["vue"],
      views: 0,
      createdAt: daysAgo(1),
    });
    const someoneElsesWatch = await createVideo({
      videotitle: "Someone Else Watched Go",
      tags: ["go"],
      views: 0,
      createdAt: daysAgo(1),
    });
    await watchVideo(user, watchedReact, new Date());
    await watchVideo(user, watchedVue, new Date());
    await watchVideo(otherUser, someoneElsesWatch, new Date());
    await createVideo({
      videotitle: "React Follow Up",
      tags: ["react"],
      views: 0,
      createdAt: daysAgo(2),
    });
    await createVideo({
      videotitle: "Vue Follow Up",
      tags: ["vue"],
      views: 0,
      createdAt: daysAgo(2),
    });
    await createVideo({
      videotitle: "Go Follow Up",
      tags: ["go"],
      views: 0,
      createdAt: daysAgo(2),
    });

    const res = await api.get("/feed").set(authHeader(user));
    expect(res.status).toBe(200);
    const watchedTitles = new Set([
      watchedReact.videotitle,
      watchedVue.videotitle,
    ]);
    const watchedReasons = res.body.items.filter(
      (item) => item.reason.type === "watched",
    );
    expect(watchedReasons.length).toBeGreaterThan(0);
    for (const item of watchedReasons) {
      const named = item.reason.label.replace(/^Because you watched /, "");
      expect(watchedTitles.has(named)).toBe(true);
    }
    // The other user's "go" watch must never leak into this feed:
    // no item may cite it, and the go video gets no watched reason.
    const goItem = res.body.items.find(
      (item) => item.videotitle === "Go Follow Up",
    );
    expect(goItem.reason.type).not.toBe("watched");
  });
});

describe("GET /feed — ?tag= narrows the pool before ranking", () => {
  it("returns only videos with that tag, case-insensitively", async () => {
    await createVideo({ videotitle: "Vue One", tags: ["vue"], views: 5 });
    await createVideo({ videotitle: "Vue Two", tags: ["Vue"], views: 4 });
    await createVideo({ videotitle: "React One", tags: ["react"], views: 100 });
    await createVideo({ videotitle: "Cooking One", tags: ["cooking"], views: 50 });

    const res = await api.get("/feed?tag=vue");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(titles(res).sort()).toEqual(["Vue One", "Vue Two"]);
    for (const item of res.body.items) {
      expect(
        item.tags.map((tag) => String(tag).toLowerCase()),
      ).toContain("vue");
    }

    const upper = await api.get("/feed?tag=VUE");
    expect(upper.status).toBe(200);
    expect(upper.body.total).toBe(2);
  });

  it("unknown or empty tag returns an empty page, never an error", async () => {
    await createVideo({ videotitle: "Vue One", tags: ["vue"], views: 5 });
    const unknown = await api.get("/feed?tag=definitely-not-a-tag");
    expect(unknown.status).toBe(200);
    expect(unknown.body).toMatchObject({ items: [], total: 0, totalPages: 1 });
    const empty = await api.get("/feed?tag=");
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ items: [], total: 0, totalPages: 1 });
  });
});
