import express from "express";
import { getMessage, sendMessage } from "../Controllers/message.controller.js";
import { getChatUser } from "../Controllers/chat_user.controller.js";
import protectRoute from "../middleware/protectRoute.middleware.js";
const routes=express.Router();

routes.get('/chat_user/:token',protectRoute, getChatUser);
// routes.get('/chat_user',protectRoute, getChatUser);
// routes.get('/:id',getMessage)
// routes.post('/send/:id',sendMessage)

export default routes;