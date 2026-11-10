import { Router } from "express";
import { SendOtp, VerifyOtp } from "../Controllers/OtpAuth.js";
import { validateBody } from "../middleware/validate.js";
import { sendOtpSchema, verifyOtpSchema } from "@acube/shared";

const routes = Router();

routes.post("/send-otp", validateBody(sendOtpSchema), SendOtp);
routes.post("/verify-otp", validateBody(verifyOtpSchema), VerifyOtp);

export default routes;
