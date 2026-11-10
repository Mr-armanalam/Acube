// Video-player UI slice (RTK) — CLIENT state only.
// Holds the cheap, shareable player UI flags. High-frequency state
// (currentTime/duration, scrub position) stays local to videoPlayer:
// putting per-frame values in Redux would re-render the whole tree.
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface PlayerState {
  isPlaying: boolean;
  isTheater: boolean;
  isMuted: boolean;
  volume: number;
  playbackRate: number;
  /** Whether the comment input is focused/active. */
  commentActive: boolean;
}

const initialState: PlayerState = {
  isPlaying: false,
  isTheater: false,
  isMuted: false,
  volume: 1,
  playbackRate: 1,
  commentActive: false,
};

const playerSlice = createSlice({
  name: "player",
  initialState,
  reducers: {
    setPlaying(state, action: PayloadAction<boolean>) {
      state.isPlaying = action.payload;
    },
    togglePlaying(state) {
      state.isPlaying = !state.isPlaying;
    },
    setTheater(state, action: PayloadAction<boolean>) {
      state.isTheater = action.payload;
    },
    toggleTheater(state) {
      state.isTheater = !state.isTheater;
    },
    setMuted(state, action: PayloadAction<boolean>) {
      state.isMuted = action.payload;
    },
    setVolume(state, action: PayloadAction<number>) {
      state.volume = action.payload;
      state.isMuted = action.payload === 0;
    },
    setPlaybackRate(state, action: PayloadAction<number>) {
      state.playbackRate = action.payload;
    },
    setCommentActive(state, action: PayloadAction<boolean>) {
      state.commentActive = action.payload;
    },
    resetPlayer() {
      return initialState;
    },
  },
});

export const {
  setPlaying,
  togglePlaying,
  setTheater,
  toggleTheater,
  setMuted,
  setVolume,
  setPlaybackRate,
  setCommentActive,
  resetPlayer,
} = playerSlice.actions;
export default playerSlice.reducer;
