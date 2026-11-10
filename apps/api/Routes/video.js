import express from "express";
import { likevideocontroller } from "../Controllers/like.js";
import { viewscontroller } from "../Controllers/views.js";
import { uploadvideo, getallvideos } from "../Controllers/video.js";
import { historycontroller, deletehistory, getallhistorycontroller } from "../Controllers/History.js";
import { watchlatercontroller, getallwatchlatervontroller, deletewatchlater } from "../Controllers/watchlater.js";
import { likedvideocontroller, getalllikedvideo, deletelikedvideo } from "../Controllers/likedvideo.js";
import upload from "../Helper/filehelper.js";
import auth from "../middleware/auth.js";
import { validateBody, validateParams, validateQuery } from "../middleware/validate.js";
import {
  deleteHistoryParamSchema,
  historyEntrySchema,
  likeVideoSchema,
  paginationQuerySchema,
  uploadVideoBodySchema,
  videoIdParamSchema,
  videoViewerParamSchema,
} from "@acube/shared";

const routes = express.Router();

// Multer runs before body validation: the file filter decides whether a
// file was accepted, and the body schema then validates title/chanel.
routes.post("/uploadvideo", auth, upload.single("file"), validateBody(uploadVideoBodySchema), uploadvideo);

routes.get("/getvideos", validateQuery(paginationQuerySchema), getallvideos);
routes.patch(
  "/like/:id",
  auth,
  validateParams(videoIdParamSchema),
  validateBody(likeVideoSchema),
  likevideocontroller,
);
// Phase 3b: view counting is authed now (see Controllers/views.js) —
// logged-out views are not counted.
routes.patch("/view/:id", auth, validateParams(videoIdParamSchema), viewscontroller);

routes.post("/history", auth, validateBody(historyEntrySchema), historycontroller);
// Phase 3b: history / watch-later / liked lists are authed and scoped
// to the caller (see the controllers).
routes.get("/getallhistory", auth, validateQuery(paginationQuerySchema), getallhistorycontroller);
routes.delete(
  "/deletehistory/:userid",
  auth,
  validateParams(deleteHistoryParamSchema),
  deletehistory,
);

routes.post("/watchlater", auth, validateBody(historyEntrySchema), watchlatercontroller);
routes.get("/getallwatchlater", auth, validateQuery(paginationQuerySchema), getallwatchlatervontroller);
routes.delete(
  "/deletewatchlater/:videoid/:viewer",
  auth,
  validateParams(videoViewerParamSchema),
  deletewatchlater,
);

routes.post("/likevideo", auth, validateBody(historyEntrySchema), likedvideocontroller);
routes.get("/getalllikevide", auth, validateQuery(paginationQuerySchema), getalllikedvideo);
routes.delete(
  "/deletelikevideo/:videoid/:viewer",
  auth,
  validateParams(videoViewerParamSchema),
  deletelikedvideo,
);

export default routes;
