import express from "express";
import { getGroupMessages, getMessage, sendGroupMessage, sendMessage } from "../Controllers/message.controller.js";
import { deleteMessage, getChatUser, getGroupUser } from "../Controllers/chat_user.controller.js";
import auth from "../middleware/auth.js";
import { send_Groupusers } from "../Controllers/send_Groupusers.controller.js";
import { validateBody, validateParams, validateQuery } from "../middleware/validate.js";
import {
  chatUserSchema,
  createGroupSchema,
  deleteChatMessageSchema,
  groupIdParamSchema,
  messageIdParamSchema,
  paginationQuerySchema,
  sendGroupMessageSchema,
  sendMessageSchema,
} from "@acube/shared";

const routes = express.Router();

routes.post("/chat_user", auth, validateBody(chatUserSchema), validateQuery(paginationQuerySchema), getChatUser);
routes.get("/message/:id", auth, validateParams(messageIdParamSchema), validateQuery(paginationQuerySchema), getMessage);
// Phase 3b: deleting a chat message is authed now, and only the sender
// may delete it (see Controllers/chat_user.controller.js).
routes.put("/chat_message", auth, validateBody(deleteChatMessageSchema), deleteMessage);
routes.post("/send", auth, validateBody(sendMessageSchema), sendMessage);
routes.post("/group_user", auth, validateBody(createGroupSchema), send_Groupusers);
routes.get("/group", auth, validateQuery(paginationQuerySchema), getGroupUser);
// Phase 3b: group messages are authed + members-only (see
// Controllers/message.controller.js).
routes.get("/group/:groupId/messages", auth, validateParams(groupIdParamSchema), validateQuery(paginationQuerySchema), getGroupMessages);
routes.post("/group/messages", auth, validateBody(sendGroupMessageSchema), sendGroupMessage);

export default routes;
