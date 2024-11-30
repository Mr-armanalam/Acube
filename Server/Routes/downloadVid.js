import express from "express";
import { downloadvideo } from "../Controllers/downloadVideo/downloadVideo.js";
import { createPaymentRequest } from "../Controllers/downloadVideo/createPaymentRequest.js";
import { handlePaymentStatus } from "../Controllers/downloadVideo/paymentStatus.js";
import { getUserDownloads } from "../Controllers/downloadVideo/getUserdownloads.js";
import auth from "../middleware/auth.js";
import { checkPremiumStatus } from "../Controllers/downloadVideo/checkPremiumStatus.js";

const routes = express.Router();

routes.post("/download-video",auth, downloadvideo);
routes.post("/create-payment-request", createPaymentRequest);
routes.post("/handle-payment-status",auth, handlePaymentStatus);
routes.get("/user/downloads",auth, getUserDownloads);
routes.get('/user/premium-status', auth, checkPremiumStatus); 

export default routes;
