// Personalised feed — GET /feed (see Routes/feed.js).
//
// Ranking is tag-affinity over the caller's OWN watch history only.
// There is no ML, no embeddings and no co-occurrence: no other user's
// data is ever read here (no "viewers also watched"), and the only
// inputs are the caller's ViewEvents, their History rows (watched set
// only), and public video metadata (tags, views, createdAt).
//
// ── SCORING (exact formula, weights in the constants below) ──────────
//   ageDays(t)    = max(0, (now - t) / 86_400_000)
//   decay(t)      = exp(-ageDays(t) / 7)
//                   1.00 for a watch today, ~0.37 at 7 days, ~0.014 at
//                   30 days — recent watches dominate, old ones fade out
//                   instead of being cut off by a hard window.
//   affinity[tag] = SUM over the caller's own ViewEvents of decay(event
//                   .createdAt), once per tag of the video that event
//                   watched. A repeat watch on another day is another
//                   event row, so it adds again, decayed by ITS date.
//   tagScore      = SUM over the candidate's tags that appear in
//                   affinity of affinity[tag]
//   freshness     = 10 * exp(-ageDays(candidate.createdAt) / 30)
//   popularity    = 5 * log10(1 + candidate.views)
//   score         = 100 * tagScore + freshness + popularity
//   watched       → score *= 0.25 (WATCHED_SCORE_FACTOR)
//
//   The weights are chosen so one tag watched today (≈100 points) beats
//   any freshness (≤10) or popularity (≈15 at 1,159 views, ≈25 at
//   100,000 views) term: a tag match beats a newer unrelated video,
//   while freshness + popularity still order the cold-start feed and
//   break ties between equal-affinity videos.
//
// ── Watch-time source ───────────────────────────────────────────────
//   Affinity uses ViewEvent.createdAt. History.likedon was NOT used: a
//   History row is one row per (viewer, video) whose likedon is only
//   set on insert / progress update, so it cannot represent several
//   watches on different days; ViewEvent has one row per (viewer,
//   video, day) with its own createdAt, so repeat watches each
//   contribute decayed by their own date. ViewEvent.watchSeconds is
//   ALWAYS 0 (recordView never updates it) and is never used here.
//   History IS used for the watched set (deprioritisation), because a
//   video can be in history without a ViewEvent row (e.g. history
//   added while the view call failed) and vice versa.
//
// ── Watched videos ──────────────────────────────────────────────────
//   Deprioritised, never excluded: score *= 0.25. A watched video can
//   still surface (e.g. the user re-watches a favourite), but an
//   unwatched video with the same affinity outranks it. A re-surfaced
//   watched video never gets a reason claiming it is new: its reason
//   is either "Because you watched <other video>" (affinity genuinely
//   came from a DIFFERENT watched video — the candidate itself is
//   never its own reason) or "Trending now" / "Newest".
//
// ── Reasons (real, never invented) ───────────────────────────────────
//   Each item carries `reason: { type, label }`:
//     { type: "watched",  label: "Because you watched <title>" }
//       — only when the candidate's tagScore is > 0 AND at least one
//       OTHER watched video contributed to it; <title> is the strongest
//       contributing watched video (highest decaySum × shared-tag
//       count, ties broken by most recent watch). A video whose score
//       came mostly from freshness/popularity never gets this label.
//     { type: "trending", label: "Trending now" }
//       — no affinity contributor; popularity term > freshness term.
//     { type: "newest",   label: "Newest" }
//       — no affinity contributor; freshness term >= popularity term.
//   Cold start (logged-out, or signed-in with zero ViewEvents) has no
//   affinity at all, so every reason is "Trending now" / "Newest" —
//   never "Because you watched".
//
// ── Diversity ───────────────────────────────────────────────────────
//   Cap: at most ceil(limit / 2) items per page window (10 of a 20-item
//   page) may share the same capTag. capTag is the affinity-driving tag
//   (the candidate's highest-affinity shared tag) for "watched" items,
//   otherwise the candidate's first tag (lowercased); tagless items
//   have no capTag and are never capped. Pages are built greedily from
//   the ranked list: an item whose tag already hit the cap in the
//   current page spills to the next page. The cap is NEVER violated to
//   fill a page — when the pool has too few other-tag videos a page
//   comes back short (fewer than `limit` items) and the spilled videos
//   land on later pages. totalPages therefore counts diversity pages
//   and can exceed ceil(total / limit) when the cap forces short
//   pages; `total` is always the full candidate-pool size, so totals
//   stay consistent across pages.
//
// ── Candidate pool ──────────────────────────────────────────────────
//   Same public-feed filter as GET /video/getvideos (public visibility
//   or missing, deletedAt null). The pool fetch is bounded at
//   FEED_MAX_CANDIDATES newest public videos — a catalogue larger than
//   that ranks only its newest slice (documented limitation, named
//   constant, not silent). An optional ?tag= narrows the pool BEFORE
//   ranking (case-insensitive match on the video's tags; an unknown or
//   empty tag matches nothing → an empty page, never an error).
//
// ── Response shape ──────────────────────────────────────────────────
//   { items, page, limit, total, totalPages } — the same envelope as
//   GET /video/getvideos, except each item is a video document with an
//   added `reason` object (the getSuggestions { video, reason } shape,
//   flattened onto the video so Home clients that render plain video
//   items keep working). paginate()/paginateArray() cannot express
//   diversity-paged boundaries, so the envelope is built here by hand
//   with the identical field names and semantics (see buildPages).
import History from "../Models/history.js";
import ViewEvent from "../Models/ViewEvent.js";
import videofile from "../Models/videofile.js";
import { PUBLIC_FEED_FILTER } from "./video.js";
import { paginationOf } from "../utils/pagination.js";

/** One tag watched today contributes this many points (see header). */
export const FEED_AFFINITY_WEIGHT = 100;
/** Freshness term weight (max, for a video created right now). */
export const FEED_FRESHNESS_WEIGHT = 10;
/** Freshness decay divisor in days: exp(-ageDays / 30). */
export const FEED_FRESHNESS_DECAY_DAYS = 30;
/** Popularity term weight: 5 * log10(1 + views). */
export const FEED_POPULARITY_WEIGHT = 5;
/** Recency decay divisor in days: exp(-ageDays / 7). */
export const FEED_RECENCY_DECAY_DAYS = 7;
/** Watched videos keep this fraction of their score (never excluded). */
export const WATCHED_SCORE_FACTOR = 0.25;
/** Newest public videos fetched as the ranking pool (see header). */
export const FEED_MAX_CANDIDATES = 2000;

const MS_PER_DAY = 86_400_000;

/**
 * @typedef {object} FeedReason
 * @property {"watched" | "trending" | "newest"} type
 * @property {string} label Human-readable reason, e.g. "Because you watched <title>".
 */

/**
 * @typedef {object} FeedItem
 * @property {object} video Lean video document.
 * @property {FeedReason} reason
 * @property {number} score
 * @property {string | null} capTag Tag counted against the diversity cap.
 */

function ageDays(date, nowMs) {
  return Math.max(0, (nowMs - new Date(date).getTime()) / MS_PER_DAY);
}

/** Recency weight of a watch: 1.0 today, ~0.37 at 7 days, ~0.014 at 30 days. */
function recencyWeight(date, nowMs) {
  return Math.exp(-ageDays(date, nowMs) / FEED_RECENCY_DECAY_DAYS);
}

function normaliseTag(tag) {
  return String(tag).trim().toLowerCase();
}

/**
 * Build diversity-capped pages from the ranked list.
 * Each page holds at most `limit` items and at most ceil(limit / 2)
 * items sharing one capTag; items that would break the cap spill to
 * the next page. A page may come back short when the pool has too few
 * other-tag videos — the cap is never violated to fill it. Every
 * input item lands on exactly one page, so `total` stays consistent.
 * @param {FeedItem[]} ranked Score-descending items.
 * @param {number} limit Page size.
 * @returns {FeedItem[][]}
 */
export function buildFeedPages(ranked, limit) {
  const capPerPage = Math.max(1, Math.ceil(limit / 2));
  const pages = [];
  let remaining = ranked;
  // Progress guarantee: the first item of `remaining` always fits an
  // empty page (counts start empty), so every page is non-empty and
  // this loop terminates.
  while (remaining.length > 0) {
    const page = [];
    const counts = new Map();
    const rest = [];
    for (const item of remaining) {
      const tag = item.capTag;
      const used = tag == null ? 0 : (counts.get(tag) ?? 0);
      if (page.length < limit && (tag == null || used < capPerPage)) {
        page.push(item);
        if (tag != null) counts.set(tag, used + 1);
      } else {
        rest.push(item);
      }
    }
    pages.push(page);
    remaining = rest;
  }
  return pages;
}

export const getFeed = async (req, res, next) => {
  try {
    const { page, limit } = paginationOf(req);
    const tagParam = req.pagination?.tag;
    const nowMs = Date.now();
    const viewerId = req.userid != null ? String(req.userid) : null;

    let candidates = await videofile
      .find(PUBLIC_FEED_FILTER)
      .sort({ createdAt: -1, _id: -1 })
      .limit(FEED_MAX_CANDIDATES)
      .lean();

    // ?tag= narrows the pool BEFORE ranking (case-insensitive). An
    // unknown or empty tag matches nothing → empty page, never an error.
    if (tagParam !== undefined) {
      const wanted = normaliseTag(tagParam);
      candidates =
        wanted === ""
          ? []
          : candidates.filter((video) =>
              (video.tags ?? []).some(
                (tag) => normaliseTag(tag) === wanted,
              ),
            );
    }

    // Tag affinity from the caller's OWN ViewEvents only. The watched
    // set is the union of ViewEvents + History (either source proves
    // the caller watched the video).
    const affinity = new Map();
    const watchedIds = new Set();
    // videoId -> { video, decaySum, latest } for reason attribution.
    const watchedById = new Map();
    if (viewerId != null) {
      const [events, historyRows] = await Promise.all([
        ViewEvent.find({ viewer: viewerId }).lean(),
        History.find({ viewer: viewerId }).lean(),
      ]);
      for (const row of historyRows) watchedIds.add(String(row.videoid));
      for (const event of events) watchedIds.add(String(event.videoid));
      const watchedVideoIds = [
        ...new Set(events.map((event) => String(event.videoid))),
      ];
      const watchedVideos =
        watchedVideoIds.length > 0
          ? await videofile.find({ _id: { $in: watchedVideoIds } }).lean()
          : [];
      const watchedDocs = new Map(
        watchedVideos.map((video) => [String(video._id), video]),
      );
      for (const event of events) {
        const video = watchedDocs.get(String(event.videoid));
        if (!video) continue;
        const weight = recencyWeight(event.createdAt, nowMs);
        const entry = watchedById.get(String(event.videoid)) ?? {
          video,
          decaySum: 0,
          latest: 0,
        };
        entry.decaySum += weight;
        entry.latest = Math.max(
          entry.latest,
          new Date(event.createdAt).getTime(),
        );
        watchedById.set(String(event.videoid), entry);
        for (const tag of video.tags ?? []) {
          const key = normaliseTag(tag);
          if (!key) continue;
          affinity.set(key, (affinity.get(key) ?? 0) + weight);
        }
      }
    }

    const scored = candidates.map((candidate) => {
      const candidateId = String(candidate._id);
      const tags = (candidate.tags ?? [])
        .map((tag) => normaliseTag(tag))
        .filter((tag) => tag !== "");
      const tagSet = new Set(tags);
      let tagScore = 0;
      let topTag = null;
      let topAffinity = 0;
      for (const tag of tagSet) {
        const weight = affinity.get(tag) ?? 0;
        if (weight > 0) {
          tagScore += weight;
          if (weight > topAffinity) {
            topAffinity = weight;
            topTag = tag;
          }
        }
      }
      const freshness =
        FEED_FRESHNESS_WEIGHT *
        Math.exp(-ageDays(candidate.createdAt, nowMs) / FEED_FRESHNESS_DECAY_DAYS);
      const popularity =
        FEED_POPULARITY_WEIGHT * Math.log10(1 + (candidate.views ?? 0));
      let score =
        FEED_AFFINITY_WEIGHT * tagScore + freshness + popularity;
      const watched = watchedIds.has(candidateId);
      if (watched) score *= WATCHED_SCORE_FACTOR;

      // Reason: "Because you watched X" only when a DIFFERENT watched
      // video actually contributed affinity (strongest contributor:
      // decaySum × shared-tag count, ties → most recent watch). The
      // candidate itself is never its own reason, so a re-surfaced
      // watched video with no other contributor falls through to
      // "Trending now" / "Newest" — never a fake watched-based label.
      let reason;
      let capTag;
      let bestContributor = null;
      let bestContribution = 0;
      let bestLatest = 0;
      if (tagScore > 0) {
        for (const [watchedId, entry] of watchedById) {
          if (watchedId === candidateId) continue;
          const shared = (entry.video.tags ?? []).filter((tag) =>
            tagSet.has(normaliseTag(tag)),
          ).length;
          if (shared === 0) continue;
          const contribution = entry.decaySum * shared;
          if (
            contribution > bestContribution ||
            (contribution === bestContribution && entry.latest > bestLatest)
          ) {
            bestContribution = contribution;
            bestContributor = entry.video;
            bestLatest = entry.latest;
          }
        }
      }
      if (bestContributor != null) {
        reason = {
          type: "watched",
          label: `Because you watched ${bestContributor.videotitle}`,
        };
        capTag = topTag;
      } else if (popularity > freshness) {
        reason = { type: "trending", label: "Trending now" };
        capTag = tags[0] ?? null;
      } else {
        reason = { type: "newest", label: "Newest" };
        capTag = tags[0] ?? null;
      }
      return {
        video: candidate,
        reason,
        score,
        capTag,
        views: candidate.views ?? 0,
        createdAt: candidate.createdAt,
      };
    });

    scored.sort(
      (a, b) =>
        b.score - a.score ||
        b.views - a.views ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
        String(a.video._id).localeCompare(String(b.video._id)),
    );

    const pages = buildFeedPages(scored, limit);
    const total = candidates.length;
    const items = (pages[page - 1] ?? []).map(({ video, reason }) => ({
      ...video,
      reason,
    }));
    return res.status(200).json({
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, pages.length),
    });
  } catch (error) {
    return next(error);
  }
};
