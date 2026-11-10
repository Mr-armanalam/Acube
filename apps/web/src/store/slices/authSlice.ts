// Auth session slice (RTK) — CLIENT state only.
// Replaces Reducers/auth.js, Reducers/currentuser.js and
// Reducers/authOtpReducer.js. The old auth reducer wrote to localStorage
// inside the reducer (a side effect); here reducers are pure and persistence
// lives in the thunks below plus the single bootstrap read in store/index.ts.
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import * as api from "../../Api";
import {
  isRecord,
  isSessionProfile,
  readStoredSession,
  type SessionProfile,
} from "../../types";
// Phase 3c: the login / OTP request shapes are the @acube/shared Zod
// input types — the same schemas the API validates at runtime.
import type {
  LoginInput,
  SendOtpInput,
  VerifyOtpInput,
} from "@acube/shared";

export interface OtpStatus {
  status: number | null;
  data: string | null;
}

export interface AuthState {
  /** Null when signed out. Mirrors the old `currentuserreducer` value. */
  session: SessionProfile | null;
  otpSend: OtpStatus;
  otpVerify: OtpStatus;
  loginError: string | null;
}

const initialState: AuthState = {
  session: null,
  otpSend: { status: null, data: null },
  otpVerify: { status: null, data: null },
  loginError: null,
};

export type { LoginInput };

/** Sign in (or create the channel user) and persist the session. */
export const loginThunk = createAsyncThunk(
  "auth/login",
  async (input: LoginInput, { rejectWithValue }) => {
    try {
      const { data } = await api.login(input);
      if (!isSessionProfile(data)) {
        return rejectWithValue("Login returned an unexpected response");
      }
      localStorage.setItem("Profile", JSON.stringify(data));
      return data;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Login failed",
      );
    }
  },
);

/** Clear the stored session and the slice. Side effect lives here, not in a reducer. */
export const logoutThunk = createAsyncThunk("auth/logout", () => {
  localStorage.removeItem("Profile");
  localStorage.removeItem("user");
  return null;
});

/** Phase 3b: refresh the signed-in user from GET /user/me (the JWT
 * identifies the user; no re-login, no new token). The stored token is
 * kept and the fresh user record is swapped in. A failed refresh leaves
 * the existing session untouched — the caller keeps working with the
 * last-known profile. */
export const refreshSessionThunk = createAsyncThunk(
  "auth/refreshSession",
  async (_input: void, { getState, rejectWithValue }) => {
    const state = getState() as { auth: AuthState };
    const current = state.auth.session;
    if (!current) return rejectWithValue("Not signed in");
    try {
      const { data } = await api.getMe();
      const rec = (data ?? {}) as { result?: unknown };
      if (!isSessionProfile({ result: rec.result, token: current.token })) {
        return rejectWithValue("Session refresh returned an unexpected response");
      }
      const refreshed: SessionProfile = {
        result: rec.result as SessionProfile["result"],
        token: current.token,
      };
      localStorage.setItem("Profile", JSON.stringify(refreshed));
      return refreshed;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Session refresh failed",
      );
    }
  },
);

export const sendOtpThunk = createAsyncThunk(
  "auth/sendOtp",
  async (input: SendOtpInput) => {
    const result = await api.sendOtp(input);
    return {
      status: result.status,
      data: typeof result.data === "string" ? result.data : null,
    };
  },
);

export const verifyOtpThunk = createAsyncThunk(
  "auth/verifyOtp",
  // Callers pass null for the channel not used (OTP_Auth); the shared
  // schema takes optional fields only, so nulls are normalised to
  // undefined before the request — the API never sees a null.
  async (input: {
    email?: string | null;
    phone?: string | null;
    otp: string;
  }) => {
    const body: VerifyOtpInput = {
      otp: input.otp,
      ...(input.email ? { email: input.email } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
    };
    try {
      const result = await api.verifyOtp(body);
      return {
        status: result.status,
        data: typeof result.data === "string" ? result.data : null,
      };
    } catch (error) {
      const status =
        isRecord(error) && isRecord(error.response)
          ? (error.response.status as number | undefined)
          : undefined;
      return { status: status ?? 400, data: "Invalid OTP" };
    }
  },
);

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    /** Pure session restore (bootstrap only — see store/index.ts). */
    setSession(state, action: { payload: SessionProfile | null }) {
      state.session = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginThunk.fulfilled, (state, action) => {
        state.session = action.payload;
        state.loginError = null;
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.loginError =
          typeof action.payload === "string"
            ? action.payload
            : "Login failed";
      })
      .addCase(refreshSessionThunk.fulfilled, (state, action) => {
        state.session = action.payload;
        state.loginError = null;
      })
      .addCase(refreshSessionThunk.rejected, (state) => {
        // Keep the existing session on a failed refresh.
      })
      .addCase(logoutThunk.fulfilled, (state) => {
        state.session = null;
        state.otpSend = { status: null, data: null };
        state.otpVerify = { status: null, data: null };
      })
      .addCase(sendOtpThunk.fulfilled, (state, action) => {
        state.otpSend = action.payload;
      })
      .addCase(verifyOtpThunk.fulfilled, (state, action) => {
        state.otpVerify = action.payload;
      });
  },
});

export const { setSession } = authSlice.actions;
export default authSlice.reducer;

/** Single session bootstrap: read the stored profile once at startup. */
export function loadInitialSession(): SessionProfile | null {
  return readStoredSession();
}
