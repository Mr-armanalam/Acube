// Demo seed (Phase 5 fix) — TEST-ONLY demo data for Acube.
//
//   pnpm --filter @acube/api seed:demo        # needs DB_URL set
//   node apps/api/scripts/seed-demo.js         # same, from the repo root
//
// What it seeds (all rows carry demo:true, so a re-run clears them
// first and re-inserts — idempotent, and real data is never touched):
//   * 3 demo channels + 24 demo viewers (fixed ObjectIds, fixed
//     emails/handles under demo.acube.test)
//   * 7 public catalogue videos across the 3 channels, PLUS 1 draft,
//     1 unlisted, 1 private and 1 soft-deleted video (11 total)
//   * 1,503 ViewEvent rows + ChannelDailyStat rows across 28 days and
//     113 Likedvideo rows. The totals are NOT hardcoded on the videos:
//     per-video views/Like counters and the daily stats are AGGREGATED
//     from the generated events/likes, and the seed asserts the sums
//     (1,503 views / 113 likes) before returning.
//   * Nested comments incl. one pinned creator comment, playlists incl.
//     a "Learning Path" playlist, watch-later / saved / liked library
//     entries, and history rows for Today + Yesterday with progressSec.
//
// Design decisions (see the fix report for the full list):
//   * progressSec lives on the History row (per viewer+video) — the
//     seed's history rows carry it, derived from the matching
//     ViewEvent's watchSeconds. ViewEvent rows carry watchSeconds /
//     completed only.
//   * The 7 catalogue videos are demo stand-ins: the live DB's 7
//     videos (1,503 views / 113 likes, seen 10 Nov 2026) had no titles
//     recorded anywhere in the repo, so titles/tags here are labelled
//     demo content, not the real catalogue.
//   * Deterministic: a seeded PRNG (mulberry32) drives the shuffle,
//     so every run produces the same distribution and the same counts.
//
// Safety: seed-demo.js (the CLI entry) refuses a DB_URL containing
// "atlas" or "prod" unless SEED_DEMO_ALLOW_REMOTE=1 is set. This
// module itself only ever writes demo:true rows.
//
// Also used by the Playwright e2e server: apps/api/e2e-server.mjs
// calls seedDemoData() in PHASE5_SEED mode, then adds the e2e user's
// own rows on top (the default unseeded server is unchanged).
import mongoose from "mongoose";
import User from "../Models/Auth.js";
import Videofile from "../Models/videofile.js";
import Comment from "../Models/comment.js";
import History from "../Models/history.js";
import LibraryEntry from "../Models/LibraryEntry.js";
import Playlist from "../Models/Playlist.js";
import ViewEvent from "../Models/ViewEvent.js";
import ChannelDailyStat from "../Models/ChannelDailyStat.js";
import Likedvideo from "../Models/likevideo.js";

export const DEMO_TOTALS = { views: 1503, likes: 113, days: 28, videos: 7 };

/** Deterministic PRNG (mulberry32) — same seed, same distribution. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Fisher–Yates shuffle using the seeded PRNG. */
function shuffled(array, rand) {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Fixed ObjectIds: "507f1f77bcf86cd79943" (20 hex) + 4-digit index. */
function oid(n) {
  return new mongoose.Types.ObjectId(
    `507f1f77bcf86cd79943${String(n).padStart(4, "0")}`,
  );
}

/** UTC date "YYYY-MM-DD" for `daysAgo` days before today. */
function dayString(daysAgo) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

const CHANNELS = [
  {
    n: 1,
    name: "Acube Studio",
    username: "acubestudio",
    handle: "acubestudio",
    email: "demo-channel-acube@demo.acube.test",
    desc: "Demo channel — tutorials from the Acube team.",
    links: [
      { label: "Website", url: "https://example.com/acube-studio" },
      { label: "Docs", url: "https://example.com/acube-studio/docs" },
    ],
    contactEmail: "studio@demo.acube.test",
    country: "India",
    language: "English",
  },
  {
    n: 2,
    name: "Pixel Craft",
    username: "pixelcraft",
    handle: "pixelcraft",
    email: "demo-channel-pixel@demo.acube.test",
    desc: "Demo channel — design and frontend craft.",
    links: [{ label: "Portfolio", url: "https://example.com/pixel-craft" }],
    contactEmail: "hello@demo.acube.test",
    country: "India",
    language: "English",
  },
  {
    n: 3,
    name: "Code & Chai",
    username: "codeandchai",
    handle: "codeandchai",
    email: "demo-channel-code@demo.acube.test",
    desc: "Demo channel — backend and system design.",
    links: [],
    contactEmail: "chai@demo.acube.test",
    country: "India",
    language: "English",
  },
];

// The 7 public catalogue videos (channel n, title, tags, durationSec).
const CATALOGUE = [
  [1, "Getting Started with React Hooks", ["react", "javascript", "frontend"], 420],
  [1, "TypeScript Generics, Explained", ["typescript", "javascript"], 360],
  [1, "Build a REST API with Express", ["nodejs", "backend", "api"], 540],
  [2, "CSS Grid in 10 Minutes", ["css", "frontend"], 300],
  [2, "Figma to Code: A Practical Workflow", ["design", "frontend"], 480],
  [3, "MongoDB Aggregations Deep Dive", ["mongodb", "database", "backend"], 600],
  [3, "System Design: Caching Basics", ["system-design", "backend"], 420],
];

// Extra videos beyond the catalogue: one of each non-public state.
const EXTRA_VIDEOS = [
  [1, "Draft: Advanced React Patterns", ["react"], 480, "draft", null],
  [2, "Unlisted: Behind the Scenes", ["design"], 240, "unlisted", null],
  [3, "Private: Team Offsite Cut", [], 180, "private", null],
  // Soft-deleted: deletedAt set, zero views — it must stay invisible
  // in feeds/search/suggestions while remaining restorable.
  [1, "Retired: Channel Trailer 2024", [], 120, "public", "deleted"],
];

const VIEWER_COUNT = 24;

/**
 * Clear every demo:true row, then seed the demo dataset described
 * above. Safe to re-run: the clear-first step makes counts identical
 * on every run. Throws if a NON-demo user already holds one of the
 * demo emails/handles (never overwrite real accounts).
 * @returns {Promise<object>} summary with the verified totals.
 */
export async function seedDemoData() {
  // 1. Clear-first (idempotency) — demo rows only, never real data.
  await Promise.all([
    User.deleteMany({ demo: true }),
    Videofile.deleteMany({ demo: true }),
    Comment.deleteMany({ demo: true }),
    History.deleteMany({ demo: true }),
    LibraryEntry.deleteMany({ demo: true }),
    Playlist.deleteMany({ demo: true }),
    ViewEvent.deleteMany({ demo: true }),
    ChannelDailyStat.deleteMany({ demo: true }),
    Likedvideo.deleteMany({ demo: true }),
  ]);

  // 2. Never clobber a real account that happens to share an address.
  const demoEmails = [
    ...CHANNELS.map((c) => c.email),
    ...Array.from(
      { length: VIEWER_COUNT },
      (_, i) => `demo-viewer-${String(i + 1).padStart(2, "0")}@demo.acube.test`,
    ),
  ];
  const demoHandles = [
    ...CHANNELS.map((c) => c.handle),
    ...Array.from(
      { length: VIEWER_COUNT },
      (_, i) => `demo-viewer-${String(i + 1).padStart(2, "0")}`,
    ),
  ];
  const clash = await User.findOne({
    demo: { $ne: true },
    $or: [
      { email: { $in: demoEmails } },
      { handle: { $in: demoHandles } },
    ],
  })
    .select("email handle")
    .lean();
  if (clash) {
    throw new Error(
      `Demo seed refused: a real (non-demo) user already uses email ${clash.email ?? "?"} / handle ${clash.handle ?? "?"}. ` +
        "Pick different demo identities before seeding.",
    );
  }

  const rand = mulberry32(20261110);
  const days = Array.from({ length: DEMO_TOTALS.days }, (_, i) =>
    dayString(DEMO_TOTALS.days - 1 - i),
  );
  const today = dayString(0);
  const yesterday = dayString(1);

  // 3. Channels + viewers.
  const channelDocs = CHANNELS.map((c) => ({
    _id: oid(c.n),
    name: c.name,
    username: c.username,
    handle: c.handle,
    email: c.email,
    desc: c.desc,
    picture: "https://example.com/demo-avatar.png",
    links: c.links,
    contactEmail: c.contactEmail,
    country: c.country,
    language: c.language,
    bannerUrl: "https://example.com/demo-banner.png",
    avatarUrl: "https://example.com/demo-avatar.png",
    channelPublic: true,
    keepSubscriptionsPrivate: false,
    uploadDefaultVisibility: "public",
    uploadDefaultComments: true,
    watermarkEnabled: false,
    historyPaused: false,
    demo: true,
  }));
  await User.insertMany(channelDocs);
  const channelByN = new Map(CHANNELS.map((c) => [c.n, String(oid(c.n))]));

  const viewerDocs = Array.from({ length: VIEWER_COUNT }, (_, i) => {
    const n = i + 1;
    const tag = String(n).padStart(2, "0");
    return {
      _id: oid(100 + n),
      name: `Demo Viewer ${tag}`,
      username: `demoviewer${tag}`,
      handle: `demo-viewer-${tag}`,
      email: `demo-viewer-${tag}@demo.acube.test`,
      picture: "https://example.com/demo-avatar.png",
      historyPaused: false,
      demo: true,
    };
  });
  await User.insertMany(viewerDocs);
  const viewerIds = viewerDocs.map((v) => String(v._id));

  // 4. Videos: 7 public catalogue + draft/unlisted/private/deleted.
  const videoDocs = [];
  CATALOGUE.forEach(([channelN, title, tags, durationSec], i) => {
    videoDocs.push({
      _id: oid(201 + i),
      videotitle: title,
      filename: `demo-${201 + i}.mp4`,
      filetype: "video/mp4",
      filepath: `https://example.com/demo-${201 + i}.mp4`,
      filesize: "1234567",
      videochanel: channelByN.get(channelN),
      uploader: CHANNELS.find((c) => c.n === channelN).name,
      Like: 0,
      views: 0,
      duration: durationSec,
      durationSec,
      thumbnail: `https://example.com/demo-thumb-${201 + i}.jpg`,
      thumbnailUrl: `https://example.com/demo-thumb-${201 + i}.jpg`,
      visibility: "public",
      status: "ready",
      description: `Demo video — ${title}. (Seeded demo content, not real catalogue data.)`,
      tags,
      deletedAt: null,
      demo: true,
    });
  });
  EXTRA_VIDEOS.forEach(([channelN, title, tags, durationSec, visibility, state], i) => {
    videoDocs.push({
      _id: oid(211 + i),
      videotitle: title,
      filename: `demo-${211 + i}.mp4`,
      filetype: "video/mp4",
      filepath: `https://example.com/demo-${211 + i}.mp4`,
      filesize: "1234567",
      videochanel: channelByN.get(channelN),
      uploader: CHANNELS.find((c) => c.n === channelN).name,
      Like: 0,
      views: 0,
      duration: durationSec,
      durationSec,
      thumbnail: `https://example.com/demo-thumb-${211 + i}.jpg`,
      thumbnailUrl: `https://example.com/demo-thumb-${211 + i}.jpg`,
      visibility,
      status: "ready",
      description: `Demo video — ${title}. (Seeded demo content.)`,
      tags,
      deletedAt: state === "deleted" ? new Date() : null,
      demo: true,
    });
  });
  await Videofile.insertMany(videoDocs);
  const publicVideos = videoDocs.slice(0, CATALOGUE.length);
  const videoById = new Map(videoDocs.map((v) => [String(v._id), v]));

  // 5. View events: every (viewer, video, day) combo, shuffled
  // deterministically, first 1,503 taken. The unique
  // (viewer, videoid, day) index guarantees no double-count.
  // Seven combos are RESERVED first — the ones step 12 turns into
  // history rows — so Today/Yesterday history always exists.
  const combos = [];
  for (const viewer of viewerIds) {
    for (const video of publicVideos) {
      for (const day of days) {
        combos.push({ viewer, videoid: String(video._id), day });
      }
    }
  }
  const reservedCombos = [
    { viewer: viewerIds[0], videoid: String(publicVideos[0]._id), day: today },
    { viewer: viewerIds[0], videoid: String(publicVideos[1]._id), day: today },
    { viewer: viewerIds[0], videoid: String(publicVideos[2]._id), day: today },
    { viewer: viewerIds[0], videoid: String(publicVideos[3]._id), day: yesterday },
    { viewer: viewerIds[0], videoid: String(publicVideos[4]._id), day: yesterday },
    { viewer: viewerIds[1], videoid: String(publicVideos[0]._id), day: today },
    { viewer: viewerIds[1], videoid: String(publicVideos[5]._id), day: today },
  ];
  const reservedKeys = new Set(
    reservedCombos.map((c) => `${c.viewer}|${c.videoid}|${c.day}`),
  );
  const rest = shuffled(
    combos.filter(
      (c) => !reservedKeys.has(`${c.viewer}|${c.videoid}|${c.day}`),
    ),
    rand,
  ).slice(0, DEMO_TOTALS.views - reservedCombos.length);
  const pickedEvents = [...reservedCombos, ...rest];
  const viewEvents = pickedEvents.map(({ viewer, videoid, day }) => {
    const video = videoById.get(videoid);
    const duration = video.durationSec;
    const watchSeconds = 30 + Math.floor(rand() * (duration - 30));
    const completed = rand() < 0.3;
    return {
      videoid,
      videochanel: video.videochanel,
      viewer,
      day,
      watchSeconds,
      completed,
      demo: true,
    };
  });
  await ViewEvent.insertMany(viewEvents);

  // 6. Likes: every (viewer, video) pair, shuffled, first 113 taken.
  // Each like is assigned a day (its Likedvideo.likedon) so the daily
  // like stat is aggregated from the like rows, not invented.
  const pairs = [];
  for (const viewer of viewerIds) {
    for (const video of publicVideos) {
      pairs.push({ viewer, videoid: String(video._id) });
    }
  }
  const pickedLikes = shuffled(pairs, rand).slice(0, DEMO_TOTALS.likes);
  const likedDocs = pickedLikes.map(({ viewer, videoid }) => {
    const day = days[Math.floor(rand() * days.length)];
    return {
      videoid,
      viewer,
      likedon: new Date(`${day}T12:00:00.000Z`),
      demo: true,
    };
  });
  await Likedvideo.insertMany(likedDocs);
  // The same pairs in the Library "liked" tab (the library unions the
  // legacy Likedvideo rows anyway; these make the tab explicit).
  await LibraryEntry.insertMany(
    pickedLikes.map(({ viewer, videoid }) => ({
      userId: viewer,
      videoid,
      kind: "liked",
      demo: true,
    })),
  );

  // 7. ChannelDailyStat, aggregated FROM the rows above — views from
  // ViewEvents, likes from Likedvideo.likedon days, watchMinutes /
  // completions from the events' watchSeconds / completed flags.
  const statByKey = new Map();
  const statKey = (videochanel, day) => `${videochanel}|${day}`;
  for (const event of viewEvents) {
    const key = statKey(event.videochanel, event.day);
    const row = statByKey.get(key) ?? {
      videochanel: event.videochanel,
      day: event.day,
      views: 0,
      likes: 0,
      watchMinutes: 0,
      completions: 0,
    };
    row.views += 1;
    row.watchMinutes += event.watchSeconds / 60;
    if (event.completed) row.completions += 1;
    statByKey.set(key, row);
  }
  for (const like of likedDocs) {
    const video = videoById.get(like.videoid);
    const day = like.likedon.toISOString().slice(0, 10);
    const key = statKey(video.videochanel, day);
    const row = statByKey.get(key) ?? {
      videochanel: video.videochanel,
      day,
      views: 0,
      likes: 0,
      watchMinutes: 0,
      completions: 0,
    };
    row.likes += 1;
    statByKey.set(key, row);
  }
  await ChannelDailyStat.insertMany(
    [...statByKey.values()].map((row) => ({
      ...row,
      watchMinutes: round2(row.watchMinutes),
      demo: true,
    })),
  );

  // 8. Per-video counters, aggregated from the same rows.
  const viewsByVideo = new Map();
  const likesByVideo = new Map();
  for (const event of viewEvents) {
    viewsByVideo.set(event.videoid, (viewsByVideo.get(event.videoid) ?? 0) + 1);
  }
  for (const like of likedDocs) {
    likesByVideo.set(like.videoid, (likesByVideo.get(like.videoid) ?? 0) + 1);
  }
  await Videofile.bulkWrite(
    videoDocs.map((video) => ({
      updateOne: {
        filter: { _id: video._id },
        update: {
          $set: {
            views: viewsByVideo.get(String(video._id)) ?? 0,
            Like: likesByVideo.get(String(video._id)) ?? 0,
          },
        },
      },
    })),
  );

  // 9. Nested comments incl. one pinned creator comment (v1).
  const v1 = String(publicVideos[0]._id);
  const v2 = String(publicVideos[1]._id);
  const v4 = String(publicVideos[3]._id);
  const v6 = String(publicVideos[5]._id);
  const top1 = await Comment.create({
    _id: oid(301),
    videoid: v1,
    userid: viewerIds[2],
    commentbody: "This finally made hooks click for me — thank you!",
    usercommented: "demoviewer03",
    parentId: null,
    demo: true,
  });
  const reply1 = await Comment.create({
    _id: oid(302),
    videoid: v1,
    userid: viewerIds[4],
    commentbody: "Same — the useEffect part was the missing piece for me.",
    usercommented: "demoviewer05",
    parentId: String(top1._id),
    demo: true,
  });
  await Comment.create({
    _id: oid(303),
    videoid: v1,
    userid: viewerIds[2],
    commentbody: "Exactly, the cleanup example helped a lot.",
    usercommented: "demoviewer03",
    parentId: String(reply1._id),
    demo: true,
  });
  // The pinned comment: created by the channel owner, pinned by them.
  await Comment.create({
    _id: oid(304),
    videoid: v1,
    userid: channelByN.get(1),
    commentbody: "Pinned by the creator: the companion repo is linked in the description.",
    usercommented: "acubestudio",
    parentId: null,
    pinnedByCreator: channelByN.get(1),
    demo: true,
  });
  // v2: a top-level comment the creator replied to (not unreplied).
  const top2 = await Comment.create({
    _id: oid(305),
    videoid: v2,
    userid: viewerIds[6],
    commentbody: "Could you do a follow-up on conditional types?",
    usercommented: "demoviewer07",
    parentId: null,
    demo: true,
  });
  await Comment.create({
    _id: oid(306),
    videoid: v2,
    userid: channelByN.get(1),
    commentbody: "On the list for next week!",
    usercommented: "acubestudio",
    parentId: String(top2._id),
    demo: true,
  });
  // v4: an unreplied top-level comment (Studio "Unreplied" filter).
  await Comment.create({
    _id: oid(307),
    videoid: v4,
    userid: viewerIds[8],
    commentbody: "Grid finally makes sense. More CSS, please!",
    usercommented: "demoviewer09",
    parentId: null,
    demo: true,
  });
  // v6: one more top-level comment.
  await Comment.create({
    _id: oid(308),
    videoid: v6,
    userid: viewerIds[10],
    commentbody: "The $lookup example saved my afternoon.",
    usercommented: "demoviewer11",
    parentId: null,
    demo: true,
  });

  // 10. Playlists incl. a Learning Path with progress (progress lives
  // on the viewer's History rows — see step 12 — for these videos).
  const learningPath = await Playlist.create({
    _id: oid(401),
    owner: channelByN.get(1),
    title: "Learning Path: Full-Stack Foundations",
    description: "Demo learning path — React, TypeScript, Express and MongoDB, in order.",
    visibility: "public",
    videoIds: [
      String(publicVideos[0]._id),
      String(publicVideos[1]._id),
      String(publicVideos[2]._id),
      String(publicVideos[5]._id),
    ],
    demo: true,
  });
  await Playlist.create({
    _id: oid(402),
    owner: channelByN.get(2),
    title: "Design Favourites",
    description: "Demo playlist — Pixel Craft's design picks.",
    visibility: "public",
    videoIds: [String(publicVideos[3]._id), String(publicVideos[4]._id)],
    demo: true,
  });
  await Playlist.create({
    _id: oid(403),
    owner: channelByN.get(3),
    title: "Team Picks",
    description: "Demo private playlist.",
    visibility: "private",
    videoIds: [String(publicVideos[5]._id), String(publicVideos[6]._id)],
    demo: true,
  });

  // 11. Library entries: watch-later + saved for viewer-01 (liked was
  // seeded in step 6 for all 113 pairs).
  await LibraryEntry.insertMany([
    { userId: viewerIds[0], videoid: String(publicVideos[3]._id), kind: "watchlater", demo: true },
    { userId: viewerIds[0], videoid: String(publicVideos[4]._id), kind: "watchlater", demo: true },
    { userId: viewerIds[0], videoid: String(publicVideos[0]._id), kind: "saved", demo: true },
    { userId: viewerIds[0], videoid: String(publicVideos[1]._id), kind: "saved", demo: true },
  ]);

  // 12. History rows for Today + Yesterday with progressSec, taken
  // FROM the reserved view events (so the totals above do not move):
  // viewer-01 watched 3 videos today and 2 yesterday; viewer-02
  // watched 2 today. progressSec is the event's watchSeconds (or the
  // full duration when the event completed).
  const eventByKey = new Map(
    viewEvents.map((event) => [
      `${event.viewer}|${event.videoid}|${event.day}`,
      event,
    ]),
  );
  const historyRows = [];
  const addHistory = (viewer, videoid, day, n) => {
    const event = eventByKey.get(`${viewer}|${videoid}|${day}`);
    if (!event) return 0;
    const video = videoById.get(videoid);
    historyRows.push({
      _id: oid(n),
      videoid,
      viewer,
      likedon: new Date(`${day}T18:00:00.000Z`),
      progressSec: event.completed ? video.durationSec : event.watchSeconds,
      demo: true,
    });
    return 1;
  };
  const historyToday1 =
    addHistory(viewerIds[0], String(publicVideos[0]._id), today, 501) +
    addHistory(viewerIds[0], String(publicVideos[1]._id), today, 502) +
    addHistory(viewerIds[0], String(publicVideos[2]._id), today, 503);
  const historyYesterday1 =
    addHistory(viewerIds[0], String(publicVideos[3]._id), yesterday, 511) +
    addHistory(viewerIds[0], String(publicVideos[4]._id), yesterday, 512);
  const historyToday2 =
    addHistory(viewerIds[1], String(publicVideos[0]._id), today, 521) +
    addHistory(viewerIds[1], String(publicVideos[5]._id), today, 522);
  if (historyRows.length > 0) await History.insertMany(historyRows);

  // 13. Verify the totals from the rows just written — never trust
  // the generator's arithmetic alone.
  const [eventCount, likeCount, statViews, statLikes, videoViews, videoLikes] =
    await Promise.all([
      ViewEvent.countDocuments({ demo: true }),
      Likedvideo.countDocuments({ demo: true }),
      ChannelDailyStat.aggregate([
        { $match: { demo: true } },
        { $group: { _id: null, views: { $sum: "$views" } } },
      ]).then((rows) => rows[0]?.views ?? 0),
      ChannelDailyStat.aggregate([
        { $match: { demo: true } },
        { $group: { _id: null, likes: { $sum: "$likes" } } },
      ]).then((rows) => rows[0]?.likes ?? 0),
      Videofile.aggregate([
        { $match: { demo: true, deletedAt: null, visibility: "public" } },
        { $group: { _id: null, views: { $sum: "$views" } } },
      ]).then((rows) => rows[0]?.views ?? 0),
      Videofile.aggregate([
        { $match: { demo: true, deletedAt: null, visibility: "public" } },
        { $group: { _id: null, likes: { $sum: "$Like" } } },
      ]).then((rows) => rows[0]?.likes ?? 0),
    ]);
  const summary = {
    demo: true,
    channels: CHANNELS.length,
    viewers: VIEWER_COUNT,
    videos: videoDocs.length,
    publicVideos: publicVideos.length,
    viewEvents: eventCount,
    likes: likeCount,
    dailyStatViews: statViews,
    dailyStatLikes: statLikes,
    videoCounterViews: videoViews,
    videoCounterLikes: videoLikes,
    comments: await Comment.countDocuments({ demo: true }),
    playlists: await Playlist.countDocuments({ demo: true }),
    libraryEntries: await LibraryEntry.countDocuments({ demo: true }),
    historyRows: historyRows.length,
    historyTodayViewer01: historyToday1,
    historyYesterdayViewer01: historyYesterday1,
    historyTodayViewer02: historyToday2,
    learningPathPlaylistId: String(learningPath._id),
    totals: { views: DEMO_TOTALS.views, likes: DEMO_TOTALS.likes },
  };
  if (
    eventCount !== DEMO_TOTALS.views ||
    statViews !== DEMO_TOTALS.views ||
    videoViews !== DEMO_TOTALS.views ||
    likeCount !== DEMO_TOTALS.likes ||
    statLikes !== DEMO_TOTALS.likes ||
    videoLikes !== DEMO_TOTALS.likes
  ) {
    throw new Error(
      `Demo seed verification failed: expected ${DEMO_TOTALS.views} views / ${DEMO_TOTALS.likes} likes, ` +
        `got events=${eventCount} statViews=${statViews} videoViews=${videoViews} ` +
        `likes=${likeCount} statLikes=${statLikes} videoLikes=${videoLikes}`,
    );
  }
  return summary;
}

export default seedDemoData;
