// Upload progress slice (RTK) — CLIENT state only.
// Progress + status for the video upload modal. The upload itself is a
// TanStack Query mutation (see query/hooks.ts `useUploadVideo`); this slice
// only carries the progress bar state the modal renders.
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type UploadStatus = "idle" | "uploading" | "success" | "error";

export interface UploadState {
  progress: number;
  status: UploadStatus;
  error: string | null;
}

const initialState: UploadState = {
  progress: 0,
  status: "idle",
  error: null,
};

const uploadSlice = createSlice({
  name: "upload",
  initialState,
  reducers: {
    setUploadProgress(state, action: PayloadAction<number>) {
      state.progress = Math.min(100, Math.max(0, action.payload));
      // Phase 2c: a trailing upload-progress event can arrive AFTER the
      // mutation already succeeded (jsdom fires one after the response;
      // browsers may too on a retry). Progress must never drag a terminal
      // status back to "uploading" — that silently un-closed the modal.
      if (state.status !== "success" && state.status !== "error") {
        state.status = "uploading";
      }
    },
    setUploadStatus(state, action: PayloadAction<UploadStatus>) {
      state.status = action.payload;
    },
    setUploadError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      if (action.payload) state.status = "error";
    },
    resetUpload() {
      return initialState;
    },
  },
});

export const {
  setUploadProgress,
  setUploadStatus,
  setUploadError,
  resetUpload,
} = uploadSlice.actions;
export default uploadSlice.reducer;
