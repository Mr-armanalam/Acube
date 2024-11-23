import express from "express";
import { getMessage, sendMessage } from "../Controllers/message.controller.js";
import { getChatUser } from "../Controllers/chat_user.controller.js";
import protectRoute from "../middleware/protectRoute.middleware.js";
const routes=express.Router();

routes.post('/chat_user/:token',protectRoute, getChatUser);
routes.post('/message/:token',protectRoute,getMessage)
routes.post('/send/:token',protectRoute,sendMessage)

export default routes;