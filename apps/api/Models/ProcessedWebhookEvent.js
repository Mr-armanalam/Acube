// Phase 3b: one document per processed Stripe webhook event (and per
// Checkout Session). The webhook inserts here BEFORE granting premium;
// a duplicate delivery hits the unique index and is ignored, so premium
// is granted at most once per event / session.
import mongoose from "mongoose";

const processedWebhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true },
    sessionId: { type: String, default: null, index: true },
    userId: { type: String, default: null },
  },
  { timestamps: true },
);

export default mongoose.model(
  "ProcessedWebhookEvent",
  processedWebhookEventSchema,
);
