// Watch page: subscription routes, mounted at /subscriptions (see
// app.js). POST /subscriptions/:channelId/toggle is the idempotent
// subscribe / unsubscribe toggle (auth required; 404 unknown
// channel; 400 own channel). GET /subscriptions/:channelId is the
// public read (subscribed=false when anonymous). Both answer
// { subscribed, subscriberCount } — see Controllers/subscriptions.js.
// No validateParams here on purpose: the contract is 404 for an
// unknown OR malformed channel id, and the controller returns that
// (validateParams would 400 a malformed id).
import express from "express";
import {
  getSubscriptionStatus,
  toggleSubscription,
} from "../Controllers/subscriptions.js";
import auth, { optionalAuth } from "../middleware/auth.js";

const router = express.Router();

router.post("/:channelId/toggle", auth, toggleSubscription);
router.get("/:channelId", optionalAuth, getSubscriptionStatus);

export default router;
