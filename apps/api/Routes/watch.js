// Phase 5 fix: watch-page routes, mounted at /watch (see app.js).
// GET /watch/:id/suggestions is the ranked "Up next" list for the
// watch page — it lives here, not under /video, because the client
// calls /watch/:id/suggestions (see apps/web/src/Api/index.ts
// getWatchSuggestions). The handler itself lives with the other video
// handlers in Controllers/video.js.
// GET /watch/:id/playlists is the Watch page's playlist showcase:
// the public playlists containing this video. (The Watch page used to
// read the owner-only /studio/playlists list, so the showcase only
// rendered for the channel owner.) Its handler lives with the other
// playlist handlers in Controllers/studio.js.
import express from "express";
import { optionalAuth } from "../middleware/auth.js";
import { validateParams } from "../middleware/validate.js";
import { watchSuggestionsParamSchema } from "@acube/shared";
import { getSuggestions } from "../Controllers/video.js";
import { getPlaylistsForVideo } from "../Controllers/studio.js";

const router = express.Router();

router.get(
  "/:id/suggestions",
  optionalAuth,
  validateParams(watchSuggestionsParamSchema),
  getSuggestions,
);

router.get(
  "/:id/playlists",
  optionalAuth,
  validateParams(watchSuggestionsParamSchema),
  getPlaylistsForVideo,
);

export default router;
