import express from "express";
import { getMessage, sendMessage } from "../Controllers/message.controller.js";
import { getChatUser } from "../Controllers/chat_user.controller.js";
import auth from "../middleware/auth.js";
const routes=express.Router();

routes.post('/chat_user',auth, getChatUser);
routes.get('/message/:id',auth,getMessage)
routes.post('/send',auth,sendMessage)

export default routes;