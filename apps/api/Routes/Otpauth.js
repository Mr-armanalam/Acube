import { Router } from "express";
import { SendOtp, VerifyOtp } from "../Controllers/OtpAuth.js";
import { demoLogin } from "../Controllers/Auth.js";
import { validateBody } from "../middleware/validate.js";
import { demoLoginSchema, sendOtpSchema, verifyOtpSchema } from "@acube/shared";

const routes = Router();

routes.post("/send-otp", validateBody(sendOtpSchema), SendOtp);
routes.post("/verify-otp", validateBody(verifyOtpSchema), VerifyOtp);
// Phase 5 match-preview: env-gated demo sign-in for the seeded demo
// users (DEMO_LOGIN_ENABLED=1, never in production — see
// Controllers/Auth.js demoLogin). 404s unless the flag is set.
routes.post("/demo-login", validateBody(demoLoginSchema), demoLogin);

export default routes;
