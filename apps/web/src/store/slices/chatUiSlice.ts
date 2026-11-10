// Chat UI slice (RTK) — CLIENT state only.
// Which conversation is open, the debounced sidebar search text, and the
// mobile sidebar navigation flag. Messages, users and groups themselves are
// server state and live in TanStack Query (see query/chat.ts).
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ChatUser, Group } from "../../types";

export type SelectedChat =
  | { kind: "user"; user: ChatUser }
  | { kind: "group"; group: Group };

export interface ChatUiState {
  selected: SelectedChat | null;
  /** Debounced search text for the chat-user list. */
  searchQuery: string;
  /** Mobile: sidebar open ("navigate") vs main view. */
  sidebarOpen: boolean;
  /** True right after a conversation is picked (triggers a refetch). */
  loadingSelection: boolean;
}

const initialState: ChatUiState = {
  selected: null,
  searchQuery: "",
  sidebarOpen: false,
  loadingSelection: false,
};

const chatUiSlice = createSlice({
  name: "chatUi",
  initialState,
  reducers: {
    selectChat(state, action: PayloadAction<SelectedChat>) {
      state.selected = action.payload;
      state.loadingSelection = true;
      state.sidebarOpen = true;
    },
    clearChatSelection(state) {
      state.selected = null;
      state.loadingSelection = false;
    },
    setChatSearchQuery(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    setSidebarOpen(state, action: PayloadAction<boolean>) {
      state.sidebarOpen = action.payload;
    },
    setLoadingSelection(state, action: PayloadAction<boolean>) {
      state.loadingSelection = action.payload;
    },
  },
});

export const {
  selectChat,
  clearChatSelection,
  setChatSearchQuery,
  setSidebarOpen,
  setLoadingSelection,
} = chatUiSlice.actions;
export default chatUiSlice.reducer;
