import express from "express";
import { getMessage, sendMessage } from "../Controllers/message.controller.js";
import { getChatUser } from "../Controllers/chat_user.controller.js";
import auth from "../middleware/auth.js";
import { send_Groupusers } from "../Controllers/send_Groupusers.controller.js";
const routes=express.Router();

routes.post('/chat_user',auth, getChatUser);
routes.get('/message/:id',auth,getMessage)
routes.post('/send',auth,sendMessage);
routes.post('/group_user',auth,send_Groupusers)

export default routes;