import mongoose from "mongoose";
import User from "../Models/Auth.js";
import Subscription from "../Models/Subscription.js";

const NOT_FOUND = (message) => ({
  error: { code: "NOT_FOUND", message },
});

// Watch page: subscriptions (greenfield — no follow system existed
// before). subscriberCount is always derived here
// (countDocuments), never a stored counter, so it can never drift
// from the rows; `subscribed` is the requesting user's own state
// (false when anonymous). Both helpers are shared with the channel
// DTO (Controllers/channel.js getallchanels) and the video DTO
// (Controllers/video.js getVideoById) so every surface reports the
// same numbers from the same rows.
export async function subscriberCountFor(channelId) {
  return Subscription.countDocuments({ channelId: String(channelId) });
}

export async function isSubscribed(channelId, userId) {
  if (userId == null) return false;
  return (
    (await Subscription.exists({
      channelId: String(channelId),
      subscriberId: String(userId),
    })) != null
  );
}

async function subscriptionState(channelId, userId) {
  const [subscriberCount, subscribed] = await Promise.all([
    subscriberCountFor(channelId),
    isSubscribed(channelId, userId),
  ]);
  return { subscribed, subscriberCount };
}

// POST /subscriptions/:channelId/toggle — idempotent subscribe /
// unsubscribe for the signed-in user. 404 when the channel does not
// exist (a malformed id is 404 here too: there is no such channel);
// 400 when the owner tries to subscribe to their own channel.
// Response: { subscribed, subscriberCount }.
export const toggleSubscription = async (req, res, next) => {
  try {
    const channelId = String(req.params.channelId ?? "");
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(404).json(NOT_FOUND("Channel not found"));
    }
    const channel = await User.findById(channelId).lean();
    if (!channel) {
      return res.status(404).json(NOT_FOUND("Channel not found"));
    }
    if (channelId === String(req.userid)) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "You cannot subscribe to your own channel",
        },
      });
    }
    const subscriberId = String(req.userid);
    const existing = await Subscription.findOne({
      channelId,
      subscriberId,
    });
    if (existing) {
      await Subscription.deleteOne({ _id: existing._id });
    } else {
      try {
        await Subscription.create({ channelId, subscriberId });
      } catch (error) {
        // Lost a race with a concurrent toggle for the same pair:
        // the unique index rejected the second insert, but the row
        // exists, so the caller IS subscribed — not an error.
        if (error?.code !== 11000) {
          throw error;
        }
      }
    }
    // Re-read from the rows, so the response always matches storage
    // even on the duplicate-key path above.
    return res.status(200).json(await subscriptionState(channelId, subscriberId));
  } catch (error) {
    return next(error);
  }
};

// GET /subscriptions/:channelId — public read. 404 when the channel
// does not exist (malformed id likewise). `subscribed` is false for
// anonymous callers. Response: { subscribed, subscriberCount }.
export const getSubscriptionStatus = async (req, res, next) => {
  try {
    const channelId = String(req.params.channelId ?? "");
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(404).json(NOT_FOUND("Channel not found"));
    }
    const channel = await User.findById(channelId).lean();
    if (!channel) {
      return res.status(404).json(NOT_FOUND("Channel not found"));
    }
    return res
      .status(200)
      .json(await subscriptionState(channelId, req.userid ?? null));
  } catch (error) {
    return next(error);
  }
};
