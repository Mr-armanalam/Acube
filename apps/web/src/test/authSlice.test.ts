import { describe, it, expect, afterEach } from "vitest";
// Auth slice thunks (underpin the OTP flow): login stores the session,
// a wrong OTP surfaces a 400 without signing in.
import { createTestStore } from "./testUtils";
import { captured, resetCaptured } from "../mocks/handlers";
import {
  loginThunk,
  refreshSessionThunk,
  sendOtpThunk,
  verifyOtpThunk,
} from "../store/slices/authSlice";

afterEach(() => {
  localStorage.clear();
  resetCaptured();
});

describe("auth slice", () => {
  it("stores the session on a successful login", async () => {
    const store = createTestStore();
    await store.dispatch(
      loginThunk({ email: "test@example.com", username: "Test User" }),
    );
    expect(store.getState().auth.session?.result.email).toBe(
      "test@example.com",
    );
    expect(store.getState().auth.session?.token).toBe("test-token");
    expect(store.getState().auth.loginError).toBeNull();
  });

  it("sends the Google id_token (not a client-claimed email) on Google login", async () => {
    const store = createTestStore();
    await store.dispatch(loginThunk({ idToken: "google-id-token-123" }));
    expect(store.getState().auth.session?.result.email).toBe(
      "test@example.com",
    );
    expect(store.getState().auth.loginError).toBeNull();
    expect(captured.loginBodies).toEqual([{ idToken: "google-id-token-123" }]);
  });

  it("records a login error when login has neither idToken nor email", async () => {
    const store = createTestStore();
    await store.dispatch(loginThunk({}));
    expect(store.getState().auth.session).toBeNull();
    expect(store.getState().auth.loginError).not.toBeNull();
    expect(captured.loginBodies).toEqual([{}]);
  });

  it("records a 200 send-OTP status", async () => {
    const store = createTestStore();
    await store.dispatch(sendOtpThunk({ email: "test@example.com" }));
    expect(store.getState().auth.otpSend.status).toBe(200);
  });

  it("records a 400 verify status for a wrong OTP and stays signed out", async () => {
    const store = createTestStore();
    await store.dispatch(
      verifyOtpThunk({ otp: "000000", email: "test@example.com", phone: null }),
    );
    expect(store.getState().auth.otpVerify.status).toBe(400);
    expect(store.getState().auth.session).toBeNull();
  });

  it("records a 200 verify status for the correct OTP", async () => {
    const store = createTestStore();
    await store.dispatch(
      verifyOtpThunk({ otp: "123456", email: "test@example.com", phone: null }),
    );
    expect(store.getState().auth.otpVerify.status).toBe(200);
  });

  it("refreshes the session from /user/me without re-logging in", async () => {
    const store = createTestStore();
    await store.dispatch(
      loginThunk({ email: "test@example.com", username: "Test User" }),
    );
    expect(store.getState().auth.session?.result.email).toBe(
      "test@example.com",
    );
    await store.dispatch(refreshSessionThunk());
    expect(store.getState().auth.session?.result.email).toBe(
      "test@example.com",
    );
    // The token is kept and no login request was made for the refresh.
    expect(store.getState().auth.session?.token).toBe("test-token");
    expect(store.getState().auth.loginError).toBeNull();
    expect(captured.loginBodies).toHaveLength(1);
  });
});
