import { Router } from "express"
import { SendOtp, VerifyOtp } from "../Controllers/OtpAuth.js";

const routes = Router();

routes.post("/send-otp", SendOtp);
routes.post("/verify-otp", VerifyOtp);

export default routes;