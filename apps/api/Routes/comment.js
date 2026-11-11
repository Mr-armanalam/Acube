import express from "express";

import { postcomment, getcomment, deletecomment, editcomment, pincomment, likecomment, dislikecomment } from "../Controllers/Comment.js";
import auth, { optionalAuth } from "../middleware/auth.js";
import { validateBody, validateParams, validateQuery } from "../middleware/validate.js";
import { commentIdParamSchema, commentListQuerySchema, editCommentSchema, postCommentSchema } from "@acube/shared";

const router = express.Router();

router.post("/post", auth, validateBody(postCommentSchema), postcomment);
// Phase 3b: GET /comment/get stays PUBLIC READ BY DESIGN — the comment
// list is shown on a video page to logged-out visitors (recorded
// decision, see PHASE3B_NOTES.md). It is paginated now.
// Phase 5: optionalAuth lets the route tell the video's owner from a
// stranger (a deleted parent's subtree is hidden from non-owners).
router.get("/get", optionalAuth, validateQuery(commentListQuerySchema), getcomment);
router.delete("/delete/:id", auth, validateParams(commentIdParamSchema), deletecomment);
router.patch(
  "/edit/:id",
  auth,
  validateParams(commentIdParamSchema),
  validateBody(editCommentSchema),
  editcomment,
);
// Phase 5 fix: pin a comment (creator of the video only — the
// controller enforces it; one pinned comment per video).
router.post(
  "/:id/pin",
  auth,
  validateParams(commentIdParamSchema),
  pincomment,
);
// Watch page: per-user like / dislike toggles on a comment. No
// validateParams here on purpose: the contract is 404 for an unknown
// OR malformed id, and the controller returns that (validateParams
// would 400 a malformed id). Response:
// { likes, dislikes, userReaction: "like" | "dislike" | null }.
router.post("/:id/like", auth, likecomment);
router.post("/:id/dislike", auth, dislikecomment);

export default router;
