// Phase 5: Creator Studio routes, mounted at /studio (see app.js).
// Every route except GET /studio/playlists/:id is authed; the playlist
// read is public with visibility rules (public/unlisted readable,
// private 404s for non-owners) so the /playlist/:id watch page works
// without signing in.
import express from "express";
import auth, { optionalAuth } from "../middleware/auth.js";
import imageUpload from "../Helper/imageFilehelper.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validate.js";
import {
  createPlaylistSchema,
  handleAvailabilityQuerySchema,
  libraryEntryParamSchema,
  libraryEntrySchema,
  paginationQuerySchema,
  playlistIdParamSchema,
  studioAnalyticsQuerySchema,
  studioCommentsQuerySchema,
  studioSettingsSchema,
  studioVideosQuerySchema,
  updatePlaylistSchema,
  videoIdParamSchema,
} from "@acube/shared";
import {
  addLibraryEntry,
  checkHandleAvailable,
  createPlaylist,
  deletePlaylist,
  getAnalytics,
  getLibrary,
  getOverview,
  getPlaylist,
  getSettings,
  getStudioComments,
  getStudioVideos,
  getVideoAnalytics,
  listPlaylists,
  removeAvatar,
  removeBanner,
  removeLibraryEntry,
  updatePlaylist,
  updateSettings,
  uploadAvatar,
  uploadBanner,
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
// Content "View analytics" target: per-video daily series (owner only).
router.get(
  "/videos/:id/analytics",
  auth,
  validateParams(videoIdParamSchema),
  validateQuery(studioAnalyticsQuerySchema),
  getVideoAnalytics,
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
// Settings polish: live handle check — same format rule as the save
// handler (handleAvailabilityQuerySchema), owner-exempt + 200
// { available, reason? } in the controller.
router.get(
  "/handle/available",
  auth,
  validateQuery(handleAvailabilityQuerySchema),
  checkHandleAvailable,
);
// Settings polish: banner / avatar image uploads (multipart, field
// name "file", JPG/PNG only, 5 MB cap — see Helper/imageFilehelper.js)
// and removal (POST .../remove resets the URL to null; the client
// renders its gradient-banner / initials-avatar default then).
// Removal is a POST, not DELETE, so it stays a plain JSON call with
// no multipart body. Uploads are owner-only by construction: the
// caller uploads for their own channel (req.userid), never another's.
router.post("/banner", auth, imageUpload.single("file"), uploadBanner);
router.post("/banner/remove", auth, removeBanner);
router.post("/avatar", auth, imageUpload.single("file"), uploadAvatar);
router.post("/avatar/remove", auth, removeAvatar);
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
