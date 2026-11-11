// Query keys (Phase 2b). One key per server resource so mutations can
// invalidate exactly the affected key instead of refetching everything.
export const queryKeys = {
  videos: ["videos"] as const,
  video: (id: string) => ["video", id] as const,
  channels: ["channels"] as const,
  comments: ["comments"] as const,
  history: ["history"] as const,
  liked: ["liked"] as const,
  watchLater: ["watchLater"] as const,
  chatUsers: (search: string) => ["chatUsers", search] as const,
  chatMessages: (userId: string) => ["chatMessages", userId] as const,
  groups: ["groups"] as const,
  groupMessages: (groupId: string) => ["groupMessages", groupId] as const,
  premium: ["premium"] as const,
  downloads: ["downloads"] as const,
  // Phase 5 — Creator Studio.
  studioOverview: ["studio", "overview"] as const,
  studioAnalytics: (range: number) => ["studio", "analytics", range] as const,
  studioVideos: (page: number, q = "", visibility = "") =>
    ["studio", "videos", page, q, visibility] as const,
  studioComments: (page: number, filter = "", sort = "") =>
    ["studio", "comments", page, filter, sort] as const,
  studioSettings: ["studio", "settings"] as const,
  studioPlaylists: ["studio", "playlists"] as const,
  studioPlaylist: (id: string) => ["studio", "playlists", id] as const,
  studioLibrary: ["studio", "library"] as const,
  // Phase 5 fix.
  watchSuggestions: (id: string) => ["watch", id, "suggestions"] as const,
  // Phase 5 fix: public playlists containing a video (Watch showcase).
  watchPlaylists: (id: string) => ["watch", id, "playlists"] as const,
  historyPaused: ["history", "paused"] as const,
};
