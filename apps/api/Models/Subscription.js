import mongoose from "mongoose";

// Watch page: subscriptions (greenfield — no follow system existed
// before). One row per (channel, subscriber) pair: channelId is the
// channel owner's user id, subscriberId is the follower's user id.
// The unique compound index makes a double-subscribe impossible at
// the storage layer (a second insert is a duplicate-key error, not a
// second row); the toggle controller deletes / creates exactly one
// row, so subscriberCount is always an honest derived count
// (Subscription.countDocuments({ channelId })), never a stored
// counter that can drift. Ids are Strings, like every other
// per-user row in this codebase (see Models/likevideo.js).
const subscriptionSchema = mongoose.Schema(
  {
    channelId: { type: String, required: true },
    subscriberId: { type: String, required: true },
    // Phase 5 fix: demo seed marker (see Models/Auth.js).
    demo: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  },
);

// One subscription per (channel, subscriber) — enforced here, not
// just in the controller.
subscriptionSchema.index({ channelId: 1, subscriberId: 1 }, { unique: true });
// A user's own subscription list (their "Subscriptions" tab).
subscriptionSchema.index({ subscriberId: 1 });

export default mongoose.model("Subscription", subscriptionSchema);
