// Public channel-page routes, mounted at /channel (see app.js).
// GET /channel/:id/playlists is the Channel page's Playlists tab —
// the client calls it via getChannelPlaylists (see
// apps/web/src/Api/index.ts) and reads the paginated `items` through
// useChannelPlaylists. It is public (a channel page is public) and
// returns only that owner's `public` playlists; :id is the channel
// owner's user id. The handler lives with the other channel handlers
// in Controllers/channel.js.
import express from "express";
import { getChannelPlaylists } from "../Controllers/channel.js";
import { validateParams, validateQuery } from "../middleware/validate.js";
import {
  channelIdParamSchema,
  paginationQuerySchema,
} from "@acube/shared";

const routes = express.Router();

routes.get(
  "/:id/playlists",
  validateParams(channelIdParamSchema),
  validateQuery(paginationQuerySchema),
  getChannelPlaylists,
);

export default routes;
