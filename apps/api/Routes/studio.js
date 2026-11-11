// Phase 5: Creator Studio routes, mounted at /studio (see app.js).
// Every route except GET /studio/playlists/:id is authed; the playlist
// read is public with visibility rules (public/unlisted readable,
// private 404s for non-owners) so the /playlist/:id watch page works
// without signing in.
import express from "express";
import auth, { optionalAuth } from "../middleware/auth.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validate.js";
import {
  createPlaylistSchema,
  libraryEntryParamSchema,
  libraryEntrySchema,
  paginationQuerySchema,
  playlistIdParamSchema,
  studioAnalyticsQuerySchema,
  studioCommentsQuerySchema,
  studioSettingsSchema,
  studioVideosQuerySchema,
  updatePlaylistSchema,
} from "@acube/shared";
import {
  addLibraryEntry,
  createPlaylist,
  deletePlaylist,
  getAnalytics,
  getLibrary,
  getOverview,
  getPlaylist,
  getSettings,
  getStudioComments,
  getStudioVideos,
  listPlaylists,
  removeLibraryEntry,
  updatePlaylist,
  updateSettings,
} from "../Controllers/studio.js";

const router = express.Router();

router.get("/overview", auth, getOverview);
router.get(
  "/analytics",
  auth,
  validateQuery(studioAnalyticsQuerySchema),
  getAnalytics,
);
router.get(
  "/videos",
  auth,
  validateQuery(studioVideosQuerySchema),
  getStudioVideos,
);
router.get(
  "/comments",
  auth,
  validateQuery(studioCommentsQuerySchema),
  getStudioComments,
);
router.get("/settings", auth, getSettings);
router.patch(
  "/settings",
  auth,
  validateBody(studioSettingsSchema),
  updateSettings,
);
router.get(
  "/playlists",
  auth,
  validateQuery(paginationQuerySchema),
  listPlaylists,
);
router.post("/playlists", auth, validateBody(createPlaylistSchema), createPlaylist);
router.get(
  "/playlists/:id",
  optionalAuth,
  validateParams(playlistIdParamSchema),
  getPlaylist,
);
router.patch(
  "/playlists/:id",
  auth,
  validateParams(playlistIdParamSchema),
  validateBody(updatePlaylistSchema),
  updatePlaylist,
);
router.delete(
  "/playlists/:id",
  auth,
  validateParams(playlistIdParamSchema),
  deletePlaylist,
);
router.get("/library", auth, getLibrary);
router.post("/library", auth, validateBody(libraryEntrySchema), addLibraryEntry);
router.delete(
  "/library/:kind/:videoid",
  auth,
  validateParams(libraryEntryParamSchema),
  removeLibraryEntry,
);

export default router;
