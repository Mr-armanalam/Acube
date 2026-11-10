import users from "../Models/Auth.js";
import jwt from "jsonwebtoken";
import Otp from "../Models/Otp.js";
import Videofile from "../Models/videofile.js";
import PointsAward from "../Models/PointsAward.js";
import {
  MAX_POINTS_PER_VIDEO_PER_DAY,
  POINTS_PER_WATCH_COMPLETE,
} from "@acube/shared";
import { verifyGoogleIdToken } from "../utils/googleAuth.js";
import { recordWatchComplete } from "../utils/analytics.js";

// Phase 3a: login no longer trusts body email/name/picture. It succeeds
// with EITHER a Google ID token verified server-side against
// GOOGLE_CLIENT_ID (identity comes only from the verified token) OR an
// email with a verified-OTP record (created by POST /auth/verify-otp,
// unexpired, single-use — consumed here). Anything else is 401
// {error:{code:"UNAUTHORIZED"}}. There is no bypass flag.
export const login = async (req, res) => {
  const { email, username, picture, idToken } = req.body;
  try {
    let loginEmail;
    let loginUsername = username;
    let loginPicture = picture;

    if (idToken) {
      let verified;
      try {
        verified = await verifyGoogleIdToken(idToken);
      } catch (error) {
        return res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Invalid Google token" },
        });
      }
      loginEmail = verified.email;
      loginUsername = verified.name;
      loginPicture = verified.picture;
    } else if (email) {
      // OTP login: the verified flag must exist, be unexpired, and is
      // consumed (deleted) by this login — a second use is 401.
      const record = await Otp.findOne({
        identifier: email,
        verified: true,
        verifiedUntil: { $gt: new Date() },
      });
      if (!record) {
        return res.status(401).json({
          error: {
            code: "UNAUTHORIZED",
            message: "Login requires a verified Google token or a verified OTP",
          },
        });
      }
      await Otp.deleteOne({ _id: record._id });
      loginEmail = email;
    } else {
      return res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Login requires a verified Google token or a verified OTP",
        },
      });
    }

    const existinguser = await users.findOne({ email: loginEmail });
    if (!existinguser) {
      try {
        const newuser = await users.create({
          email: loginEmail,
          username: loginUsername,
          picture: loginPicture,
          downloads: [],
          downloadsToday: 0,
          lastReset: new Date(),
        });
        const token = jwt.sign({email: newuser.email,id: newuser._id,},
            process.env.JWT_SECRET,{expiresIn: "6h",}
        );

        res.status(200).json({ result: newuser, token });
      } catch (error) {
        res.status(500).json({ mess: "something went wrong..." });
        return;
      }
    } else {

      const now = new Date();
      const lastReset = new Date(existinguser.lastReset || now);

      if (now.getDate() !== lastReset.getDate()) {
        existinguser.downloads = [];
        existinguser.downloadsToday = 0;
        existinguser.lastReset = now;
        await existinguser.save();
      }

      const token = jwt.sign(
        { email: existinguser.email, id: existinguser._id, },
        process.env.JWT_SECRET,
        {expiresIn: "6h",}
      );

      res.status(200).json({ result: existinguser, token });
    }
  } catch (error) {
    res.status(500).json({ mess: "something went wrong..." });
    return;
  }
};

// Phase 3b: session refresh. GET /user/me returns the current user
// from the JWT — the channel editor used to re-login with an email-only
// body to refresh the session, which 401s since Phase 3a. The token
// itself is NOT re-issued here; the existing JWT stays valid until it
// expires (6h). The client keeps its stored token and swaps in the
// fresh user record.
export const getMe = async (req, res) => {
  try {
    const user = await users.findById(req.userid).lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.status(200).json({ result: user });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

// GET /user/history-paused — the caller's own history-pause flag.
// The client reads `paused` (historyPaused is the same value under
// the model field name). See Models/Auth.js historyPaused.
export const getHistoryPaused = async (req, res) => {
  try {
    const user = await users.findById(req.userid).select("historyPaused").lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const paused = user.historyPaused ?? false;
    return res.status(200).json({ paused, historyPaused: paused });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

// PATCH /user/history-paused { paused: boolean } — the caller's own
// flag only (req.userid is the only user this can ever touch).
export const setHistoryPaused = async (req, res) => {
  try {
    const { paused } = req.body;
    const updated = await users.findByIdAndUpdate(
      req.userid,
      { $set: { historyPaused: paused } },
      { returnDocument: "after" },
    );
    if (!updated) {
      return res.status(404).json({ error: "User not found" });
    }
    const value = updated.historyPaused ?? false;
    return res.status(200).json({ paused: value, historyPaused: value });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Phase 3b: watch-complete points — REPLACES updatePoints (deleted).
// The old endpoint trusted a client-supplied `points` number, so any
// caller could mint arbitrary reputation. This endpoint takes only a
// video id and the server decides the award:
//
//   * the video must exist (else 404 — no points for phantom watches);
//   * POINTS_PER_WATCH_COMPLETE (5) per completed watch;
//   * capped at MAX_POINTS_PER_VIDEO_PER_DAY (10) per video per day
//     (UTC date), enforced by summing the PointsAward audit rows;
//   * reputation is incremented with $inc, never set from the client.
//
// The route POST /user/update-points is gone; POST /user/watch-complete
// is its replacement. Known limitation: two concurrent completions can
// race the cap check by one award — the cap is a fairness limit, not a
// billing boundary, so a single extra 5-point award is accepted.
export const watchComplete = async (req, res) => {
  try {
    const { videoid } = req.body;
    const userId = req.userid;

    const video = await Videofile.findById(videoid).lean();
    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    // Phase 5: every completed watch writes the analytics event
    // (completions +1, watchMinutes += min(duration, 600)/60) — even
    // when the points cap below is already reached, the watch happened.
    // See utils/analytics.js.
    await recordWatchComplete({ viewer: userId, video });

    const day = new Date().toISOString().slice(0, 10);
    const alreadyAwarded = await PointsAward.aggregate([
      { $match: { userId: String(userId), videoid: String(videoid), day } },
      { $group: { _id: null, total: { $sum: "$points" } } },
    ]);
    const totalToday = alreadyAwarded[0]?.total ?? 0;
    const remaining = MAX_POINTS_PER_VIDEO_PER_DAY - totalToday;
    if (remaining <= 0) {
      const user = await users.findById(userId).lean();
      return res.status(200).json({
        message: "Daily points cap reached for this video",
        awarded: 0,
        points: user?.reputation ?? 0,
      });
    }

    const awarded = Math.min(POINTS_PER_WATCH_COMPLETE, remaining);
    await PointsAward.create({
      userId: String(userId),
      videoid: String(videoid),
      day,
      points: awarded,
    });
    const updated = await users.findByIdAndUpdate(
      userId,
      { $inc: { reputation: awarded } },
      { returnDocument: "after" },
    );
    if (!updated) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({
      message: "Points awarded",
      awarded,
      points: updated.reputation,
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
};
