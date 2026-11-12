// Personalised feed — GET /feed, mounted at /feed (see app.js).
// optionalAuth: a valid Bearer token personalises the ranking; a
// missing/invalid token gets the cold-start feed (trending + newest),
// never a 401. ?tag= narrows the candidate pool to that tag before
// ranking (see Controllers/feed.js); the tag is validated here —
// non-empty strings up to FEED_TAG_MAX_LENGTH chars — while an unknown
// or empty tag is an empty page, never an error (handled in the
// controller, not by rejecting the request).
import express from "express";
import { z } from "zod";
import { paginationQuerySchema } from "@acube/shared";
import { optionalAuth } from "../middleware/auth.js";
import { validateQuery } from "../middleware/validate.js";
import { getFeed } from "../Controllers/feed.js";

/** Longest ?tag= value accepted (tags in the DB are short words). */
export const FEED_TAG_MAX_LENGTH = 100;

export const feedQuerySchema = paginationQuerySchema.extend({
  tag: z.string().max(FEED_TAG_MAX_LENGTH).optional(),
});

const router = express.Router();

router.get("/", optionalAuth, validateQuery(feedQuerySchema), getFeed);

export default router;
