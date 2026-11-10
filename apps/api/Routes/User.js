import express from "express";
import { getMe, login, watchComplete } from "../Controllers/Auth.js";
import { updatechaneldata, getallchanels } from "../Controllers/channel.js";
import auth from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { validateBody, validateParams, validateQuery } from "../middleware/validate.js";
import {
  channelIdParamSchema,
  loginSchema,
  paginationQuerySchema,
  updateChannelSchema,
  watchCompleteSchema,
} from "@acube/shared";

const routes = express.Router();

routes.post("/login", authLimiter, validateBody(loginSchema), login);
// Phase 3b: session refresh — GET /user/me returns the current user
// from the JWT (replaces the old email-only re-login in
// Createeditchannel, which 401s since Phase 3a).
routes.get("/me", auth, getMe);
routes.patch(
  "/update/:id",
  auth,
  validateParams(channelIdParamSchema),
  validateBody(updateChannelSchema),
  updatechaneldata,
);
routes.get("/getallchannel", validateQuery(paginationQuerySchema), getallchanels);
// Phase 3b: POST /user/update-points is GONE (it trusted a
// client-supplied points number). POST /user/watch-complete awards
// points server-side only — see Controllers/Auth.js watchComplete.
routes.post("/watch-complete", auth, validateBody(watchCompleteSchema), watchComplete);

export default routes;
