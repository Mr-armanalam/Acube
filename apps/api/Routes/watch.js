// Phase 5 fix: watch-page routes, mounted at /watch (see app.js).
// GET /watch/:id/suggestions is the ranked "Up next" list for the
// watch page — it lives here, not under /video, because the client
// calls /watch/:id/suggestions (see apps/web/src/Api/index.ts
// getWatchSuggestions). The handler itself lives with the other video
// handlers in Controllers/video.js.
import express from "express";
import { optionalAuth } from "../middleware/auth.js";
import { validateParams } from "../middleware/validate.js";
import { watchSuggestionsParamSchema } from "@acube/shared";
import { getSuggestions } from "../Controllers/video.js";

const router = express.Router();

router.get(
  "/:id/suggestions",
  optionalAuth,
  validateParams(watchSuggestionsParamSchema),
  getSuggestions,
);

export default router;
