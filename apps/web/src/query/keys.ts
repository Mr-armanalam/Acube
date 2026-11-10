// Query keys (Phase 2b). One key per server resource so mutations can
// invalidate exactly the affected key instead of refetching everything.
export const queryKeys = {
  videos: ["videos"] as const,
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
};
