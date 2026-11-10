import express from "express";
import { downloadvideo } from "../Controllers/downloadVideo/downloadVideo.js";
import { createPaymentRequest } from "../Controllers/downloadVideo/createPaymentRequest.js";
import { handlePaymentStatus } from "../Controllers/downloadVideo/paymentStatus.js";
import { getUserDownloads } from "../Controllers/downloadVideo/getUserdownloads.js";
import auth from "../middleware/auth.js";
import { checkPremiumStatus } from "../Controllers/downloadVideo/checkPremiumStatus.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import {
  createPaymentRequestSchema,
  emptyBodySchema,
  handlePaymentStatusSchema,
  paginationQuerySchema,
} from "@acube/shared";

const routes = express.Router();

routes.post("/download-video", auth, validateBody(emptyBodySchema), downloadvideo);
// Phase 3b: creating a payment request is authed now, and the price
// comes from the server catalogue — the body is empty. The Stripe
// webhook lives in app.js (it needs the raw body, before express.json).
routes.post(
  "/create-payment-request",
  auth,
  validateBody(createPaymentRequestSchema),
  createPaymentRequest,
);
// Phase 3b: the caller must name the Checkout Session to verify — a
// bare call no longer grants premium (see paymentStatus.js).
routes.post("/handle-payment-status", auth, validateBody(handlePaymentStatusSchema), handlePaymentStatus);
routes.get("/user/downloads", auth, validateQuery(paginationQuerySchema), getUserDownloads);
routes.get("/user/premium-status", auth, checkPremiumStatus);

export default routes;
