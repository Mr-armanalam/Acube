import express from "express";
import { getGroupMessages, getMessage, sendGroupMessage, sendMessage } from "../Controllers/message.controller.js";
import { getChatUser, getGroupUser } from "../Controllers/chat_user.controller.js";
import auth from "../middleware/auth.js";
import { send_Groupusers } from "../Controllers/send_Groupusers.controller.js";
const routes=express.Router();

routes.post('/chat_user',auth, getChatUser);
routes.get('/message/:id',auth,getMessage)
routes.post('/send',auth,sendMessage);
routes.post('/group_user',auth,send_Groupusers);
routes.get('/group',auth, getGroupUser);
routes.get('/group/:groupId/messages', getGroupMessages);
routes.post('/group/messages',auth, sendGroupMessage);

export default routes;