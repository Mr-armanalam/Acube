import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import User from "../Models/Auth.js";
import Otp from "../Models/Otp.js";
import { api, authHeader, createUser, createVerifiedOtp, createVideo } from "./helpers.js";

// Google verification is mocked — no test ever calls real Google.
// A token of the form "valid:<email>" verifies as that email; anything
// else is a forged/invalid token. The mock lives in this file only;
// other test files load the real verifier (they never send an idToken).
vi.mock("../utils/googleAuth.js", () => ({
  verifyGoogleIdToken: vi.fn(async (idToken) => {
    if (typeof idToken === "string" && idToken.startsWith("valid:")) {
      return {
        email: idToken.slice("valid:".length),
        name: "Google User",
        picture: "https://example.com/g.png",
        sub: "google-sub-1",
      };
    }
    throw new Error("Invalid Google ID token");
  }),
}));

describe("auth middleware (401 for missing/invalid token)", () => {
  it("returns 401 with the stable error shape when no token is sent", async () => {
    const res = await api.get("/chat/group");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 for a malformed token", async () => {
    const res = await api
      .get("/chat/group")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 for a token signed with the wrong secret", async () => {
    const bad = jwt.sign({ id: "000000000000000000000001" }, "wrong-secret");
    const res = await api.get("/chat/group").set("Authorization", `Bearer ${bad}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 when the Authorization header has no token part", async () => {
    const res = await api.get("/chat/group").set("Authorization", "Bearer");
    expect(res.status).toBe(401);
  });

  it("accepts a valid token", async () => {
    const user = await createUser();
    const res = await api.get("/chat/group").set(authHeader(user));
    expect(res.status).toBe(200);
  });
});

describe("POST /user/login — Google token", () => {
  it("creates a new user on first login and returns a token", async () => {
    const res = await api
      .post("/user/login")
      .send({ idToken: "valid:newuser@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.result.email).toBe("newuser@example.com");
    expect(res.body.result.username).toBe("Google User");
    expect(typeof res.body.token).toBe("string");
    expect(await User.countDocuments({ email: "newuser@example.com" })).toBe(1);
  });

  it("returns the existing user on repeat login (no duplicate)", async () => {
    await api.post("/user/login").send({ idToken: "valid:dup@example.com" });
    const res = await api
      .post("/user/login")
      .send({ idToken: "valid:dup@example.com" });
    expect(res.status).toBe(200);
    expect(await User.countDocuments({ email: "dup@example.com" })).toBe(1);
  });

  it("ignores body email/name/picture — identity comes from the token only", async () => {
    const res = await api.post("/user/login").send({
      idToken: "valid:real@example.com",
      email: "spoofed@example.com",
      username: "Spoofed",
      picture: "https://example.com/spoof.png",
    });
    expect(res.status).toBe(200);
    expect(res.body.result.email).toBe("real@example.com");
    expect(res.body.result.username).toBe("Google User");
    expect(await User.countDocuments({ email: "spoofed@example.com" })).toBe(0);
  });

  it("rejects a forged Google token with 401", async () => {
    const res = await api
      .post("/user/login")
      .send({ idToken: "forged-token" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a missing idToken with 401 (no verified OTP either)", async () => {
    const res = await api
      .post("/user/login")
      .send({ email: "nobody@example.com", username: "nobody" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a request with neither idToken nor email with 400", async () => {
    const res = await api.post("/user/login").send({ username: "noemail" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a malformed email with 400", async () => {
    const res = await api.post("/user/login").send({ email: "not-an-email", username: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /user/login — verified OTP", () => {
  it("succeeds once with a verified OTP, then the record is consumed", async () => {
    await createVerifiedOtp("otp-login@example.com");
    const first = await api
      .post("/user/login")
      .send({ email: "otp-login@example.com", username: "otpuser" });
    expect(first.status).toBe(200);
    expect(first.body.result.email).toBe("otp-login@example.com");
    expect(await Otp.countDocuments({ identifier: "otp-login@example.com" })).toBe(0);

    const second = await api
      .post("/user/login")
      .send({ email: "otp-login@example.com", username: "otpuser" });
    expect(second.status).toBe(401);
    expect(second.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a verified OTP whose verified window has expired", async () => {
    const record = await createVerifiedOtp("expired-otp@example.com");
    await Otp.updateOne(
      { _id: record._id },
      { verifiedUntil: new Date(Date.now() - 1000) },
    );
    const res = await api
      .post("/user/login")
      .send({ email: "expired-otp@example.com" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("GET /user/me (Phase 3b session refresh)", () => {
  it("returns the current user for a valid token", async () => {
    const user = await createUser();
    const res = await api.get("/user/me").set(authHeader(user));
    expect(res.status).toBe(200);
    expect(res.body.result._id).toBe(String(user._id));
    expect(res.body.result.email).toBe(user.email);
  });

  it("returns 401 without a token", async () => {
    const res = await api.get("/user/me");
    expect(res.status).toBe(401);
  });
});

describe("POST /user/watch-complete and PATCH /user/update/:id (Phase 3b)", () => {
  // Points rule: 5 per completed watch of a video that exists, max 10
  // per video per day. The client never supplies a points number.
  it("awards 5 points per completed watch of an existing video", async () => {
    const user = await createUser();
    const video = await createVideo();
    const res = await api
      .post("/user/watch-complete")
      .set(authHeader(user))
      .send({ videoid: String(video._id) });
    expect(res.status).toBe(200);
    expect(res.body.awarded).toBe(5);
    expect(res.body.points).toBe(5);
  });

  it("caps points at 10 per video per day", async () => {
    const user = await createUser();
    const video = await createVideo();
    const headers = authHeader(user);
    const body = { videoid: String(video._id) };
    const first = await api.post("/user/watch-complete").set(headers).send(body);
    expect(first.body.awarded).toBe(5);
    const second = await api.post("/user/watch-complete").set(headers).send(body);
    expect(second.body.awarded).toBe(5);
    expect(second.body.points).toBe(10);
    const third = await api.post("/user/watch-complete").set(headers).send(body);
    expect(third.body.awarded).toBe(0);
    expect(third.body.points).toBe(10);
    expect(third.body.message).toMatch(/cap reached/);
  });

  it("the cap is per video — a second video still earns points", async () => {
    const user = await createUser();
    const videoA = await createVideo();
    const videoB = await createVideo();
    const headers = authHeader(user);
    await api.post("/user/watch-complete").set(headers).send({ videoid: String(videoA._id) });
    await api.post("/user/watch-complete").set(headers).send({ videoid: String(videoA._id) });
    const res = await api.post("/user/watch-complete").set(headers).send({ videoid: String(videoB._id) });
    expect(res.body.awarded).toBe(5);
    expect(res.body.points).toBe(15);
  });

  it("returns 404 for a video that does not exist", async () => {
    const user = await createUser();
    const res = await api
      .post("/user/watch-complete")
      .set(authHeader(user))
      .send({ videoid: "000000000000000000000001" });
    expect(res.status).toBe(404);
  });

  it("returns 401 for watch-complete without a token", async () => {
    const video = await createVideo();
    const res = await api
      .post("/user/watch-complete")
      .send({ videoid: String(video._id) });
    expect(res.status).toBe(401);
  });

  it("POST /user/update-points is gone (404)", async () => {
    const user = await createUser();
    const res = await api
      .post("/user/update-points")
      .set(authHeader(user))
      .send({ points: 10 });
    expect(res.status).toBe(404);
  });

  it("updates channel data for a valid user id (own channel)", async () => {
    const user = await createUser();
    const res = await api
      .patch(`/user/update/${user._id}`)
      .set(authHeader(user))
      .send({ name: "Renamed", desc: "new desc" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Renamed");
  });

  it("updating another user's channel is 403", async () => {
    const owner = await createUser();
    const other = await createUser();
    const res = await api
      .patch(`/user/update/${owner._id}`)
      .set(authHeader(other))
      .send({ name: "Hijacked", desc: "x" });
    expect(res.status).toBe(403);
  });

  it("PATCH /user/update/:id returns 401 without a token", async () => {
    const user = await createUser();
    const res = await api.patch(`/user/update/${user._id}`).send({ name: "x" });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid channel id with 400", async () => {
    const user = await createUser();
    const res = await api
      .patch("/user/update/not-an-objectid")
      .set(authHeader(user))
      .send({ name: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /user/getallchannel lists users (paginated)", async () => {
    const user = await createUser();
    const res = await api.get("/user/getallchannel");
    expect(res.status).toBe(200);
    expect(res.body.items.some((c) => c._id === String(user._id))).toBe(true);
  });
});
