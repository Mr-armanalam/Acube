import express from "express";

import { postcomment, getcomment, deletecomment, editcomment } from "../Controllers/Comment.js";
import auth from "../middleware/auth.js";
import { validateBody, validateParams, validateQuery } from "../middleware/validate.js";
import { commentIdParamSchema, commentListQuerySchema, editCommentSchema, postCommentSchema } from "@acube/shared";

const router = express.Router();

router.post("/post", auth, validateBody(postCommentSchema), postcomment);
// Phase 3b: GET /comment/get stays PUBLIC READ BY DESIGN — the comment
// list is shown on a video page to logged-out visitors (recorded
// decision, see PHASE3B_NOTES.md). It is paginated now.
router.get("/get", validateQuery(commentListQuerySchema), getcomment);
router.delete("/delete/:id", auth, validateParams(commentIdParamSchema), deletecomment);
router.patch(
  "/edit/:id",
  auth,
  validateParams(commentIdParamSchema),
  validateBody(editCommentSchema),
  editcomment,
);

export default router;
