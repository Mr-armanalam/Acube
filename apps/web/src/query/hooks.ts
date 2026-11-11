// TanStack Query hooks — videos, channels, comments, history, liked,
// watch-later, upload, points (Phase 2b).
// Every mutation invalidates ONLY its own key (or optimistically patches
// one entity); nothing refetches the whole app after a mutation.
import { useMemo } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useAppDispatch, useAppSelector } from "../store";
import {
  setUploadError,
  setUploadProgress,
  setUploadStatus,
} from "../store/slices/uploadSlice";
import * as api from "../Api";
import { extractApiErrorMessage } from "../utils/apiError";
import { queryKeys } from "./keys";
import type {
  Channel,
  CommentItem,
  CommentReaction,
  CommentReactionResult,
  HandleAvailability,
  LibraryData,
  PagedResult,
  Playlist,
  StudioAnalytics,
  StudioOverview,
  StudioVideoAnalytics,
  StudioSettings,
  StudioSettingsPatch,
  Video,
  VideoListEntry,
  VideoVisibility,
  WatchSuggestion,
} from "../types";
// Phase 3c: like-toggle / watch-complete request shapes are the
// @acube/shared Zod input types (same schemas the API validates).
import type { LikeVideoInput, WatchCompleteInput } from "@acube/shared";

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

// Phase 3b: list endpoints return { items, page, limit, total,
// totalPages }. Unwrap `items`, falling back to a bare array so an
// older response shape still works.
function unwrapPage<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "object" && value !== null && "items" in value) {
    return asArray<T>((value as { items?: unknown }).items);
  }
  return [];
}

// ---------------------------------------------------------------- videos
export function useVideos() {
  return useQuery({
    queryKey: queryKeys.videos,
    queryFn: async (): Promise<Video[]> => {
      const { data } = await api.getvideos();
      return unwrapPage<Video>(data);
    },
  });
}

/** Newest-first copy — never mutates the cached array. */
export function useVideosNewestFirst(): Video[] | undefined {
  const { data } = useVideos();
  return useMemo(
    () => (data ? [...data].filter(Boolean).reverse() : undefined),
    [data],
  );
}

/** O(1) by-id lookup for library lists. */
export function useVideosById(): Record<string, Video> {
  const { data } = useVideos();
  return useMemo(() => {
    const map: Record<string, Video> = {};
    for (const video of data ?? []) {
      if (video?._id) map[video._id] = video;
    }
    return map;
  }, [data]);
}

export function useVideoById(id: string | undefined): Video | undefined {
  const byId = useVideosById();
  return id ? byId[id] : undefined;
}

// Phase 5 contract fix: single-video read from GET /video/:id — the
// Watch page must NOT filter the page-1 feed (unlisted videos and
// videos past page 1 are not in it, and private videos 404 for
// non-owners server-side).
export function useVideo(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.video(id ?? ""),
    queryFn: async (): Promise<Video> => {
      const { data } = await api.getVideo(id as string);
      return data as Video;
    },
    enabled: Boolean(id),
  });
}

export function useLikeVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    // Phase 3b: a toggle, not an absolute count — the server $inc's.
    mutationFn: async (input: {
      id: string;
      action: LikeVideoInput["action"];
    }) => {
      await api.likevideo(input.id, input.action);
      return input;
    },
    // Optimistic: patch the one video's Like count in the cache.
    // BOTH caches: the feed list AND the single-video query — the
    // Watch page reads GET /video/:id now, so patching only the list
    // left the Like pill count stale (same gap useViewVideo fixed
    // for views in Phase 5).
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.videos });
      await queryClient.cancelQueries({
        queryKey: queryKeys.video(input.id),
      });
      const previous = queryClient.getQueryData<Video[]>(queryKeys.videos);
      const previousSingle = queryClient.getQueryData<Video>(
        queryKeys.video(input.id),
      );
      const delta = input.action === "like" ? 1 : -1;
      queryClient.setQueryData<Video[]>(queryKeys.videos, (old) =>
        (old ?? []).map((v) =>
          v._id === input.id
            ? { ...v, Like: Math.max(0, (v.Like ?? 0) + delta) }
            : v,
        ),
      );
      queryClient.setQueryData<Video>(queryKeys.video(input.id), (old) =>
        old ? { ...old, Like: Math.max(0, (old.Like ?? 0) + delta) } : old,
      );
      return { previous, previousSingle };
    },
    onError: (_error, input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.videos, context.previous);
      }
      if (context?.previousSingle) {
        queryClient.setQueryData(
          queryKeys.video(input.id),
          context.previousSingle,
        );
      }
    },
    onSettled: (_data, _error, input) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.videos });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.video(input.id),
      });
    },
  });
}

export function useViewVideo() {
  const queryClient = useQueryClient();
  // Phase 3b: view counting is authed server-side — logged-out views
  // are not counted, so the client skips the call when signed out
  // instead of firing a request that 401s.
  const userId = useAppSelector((s) => s.auth.session?.result._id);
  return useMutation({
    mutationFn: async (id: string) => {
      if (!userId) return;
      await api.viewsvideo(id);
    },
    // Views are fire-and-forget; only the one video's count is patched.
    // Phase 5 contract fix: patch the single-video query too — the
    // Watch page reads GET /video/:id now, not the feed list, so
    // patching only the list left its count stale at 0.
    onSuccess: (_data, id) => {
      if (!userId) return;
      queryClient.setQueryData<Video[]>(queryKeys.videos, (old) =>
        (old ?? []).map((v) =>
          v._id === id ? { ...v, views: (v.views ?? 0) + 1 } : v,
        ),
      );
      queryClient.setQueryData<Video>(queryKeys.video(id), (old) =>
        old ? { ...old, views: (old.views ?? 0) + 1 } : old,
      );
    },
  });
}

export function useUploadVideo() {
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  return useMutation({
    mutationFn: async (input: { filedata: FormData }) => {
      dispatch(setUploadStatus("uploading"));
      const { data } = await api.uploadvideo(input.filedata, {
        onUploadProgress: (progressEvent: {
          loaded: number;
          total?: number;
        }) => {
          const total = progressEvent.total ?? 0;
          const percentage =
            total > 0
              ? Math.floor((progressEvent.loaded / total) * 100)
              : 0;
          dispatch(setUploadProgress(percentage));
        },
      });
      return data;
    },
    onSuccess: () => {
      dispatch(setUploadStatus("success"));
      dispatch(setUploadProgress(100));
      void queryClient.invalidateQueries({ queryKey: queryKeys.videos });
    },
    onError: (error) => {
      // Upload-wizard fix: store the SERVER's message (e.g. "Failed to
      // upload video to cloudinary" or the VALIDATION_ERROR field
      // details), not axios's generic "Request failed with status
      // code 400".
      dispatch(setUploadError(extractApiErrorMessage(error)));
    },
  });
}

// Phase 3b: points are awarded server-side on a validated
// watch-complete (5 per watch, max 10 per video per day). The client
// sends only the video id — never a points number.
export function useWatchComplete() {
  return useMutation({
    mutationFn: async (videoid: WatchCompleteInput["videoid"]) => {
      const { data } = await api.watchComplete(videoid);
      return data as { awarded?: number; points?: number };
    },
  });
}

// -------------------------------------------------------------- channels
export function useChannels() {
  return useQuery({
    queryKey: queryKeys.channels,
    queryFn: async (): Promise<Channel[]> => {
      const { data } = await api.fetchallchannel();
      return unwrapPage<Channel>(data);
    },
  });
}

export function useChannelById(id: string | undefined): Channel | undefined {
  const { data } = useChannels();
  return useMemo(
    () => (id ? data?.find((c) => c._id === id) : undefined),
    [data, id],
  );
}

export function useUpdateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      updatedata: { name?: string; desc?: string };
    }) => {
      const { data } = await api.updatechaneldata(input.id, input.updatedata);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.channels });
    },
  });
}

// -------------------------------------------------------------- comments
// Watch fix: comments are fetched per video (?videoid= — the API
// supports it; see apps/api/tests/comment.test.js "GET /comment/get
// filters by ?videoid=") and newest-first (?sort=newest). The old
// unfiltered page-1 fetch (limit 50, oldest-first) mixed in other
// videos' comments, so on a busy video a just-posted comment could
// sit beyond page 1 and stay invisible after refetch despite a 200.
// The key carries the video id so each video has its own cache;
// callers without a video still get the old unfiltered list.
export function useComments(videoid?: string) {
  return useQuery({
    queryKey: [...queryKeys.comments, videoid ?? ""],
    queryFn: async (): Promise<CommentItem[]> => {
      // Watch page: newest-first, so a just-posted comment past #50
      // is on page 1 after refetch (server limit caps at 50). The
      // Watch page re-sorts client-side (Sort Top / Newest, pinned
      // first), so this only changes WHICH 50 arrive, not their
      // display order.
      const { data } = await api.getallcomment(1, 50, videoid, "newest");
      return unwrapPage<CommentItem>(data);
    },
  });
}

// Server order is newest-first (useComments requests ?sort=newest);
// the Watch page sorts explicitly (Sort: Top / Newest, pinned
// first), so this returns the filtered list as-is — no silent
// reverse here. A defensive client-side filter stays in case the
// server ever ignores ?videoid=.
export function useCommentsForVideo(
  videoid: string | undefined,
): CommentItem[] | undefined {
  const { data } = useComments(videoid);
  return useMemo(() => {
    if (!data) return undefined;
    if (!videoid) return data;
    return data.filter((c) => c.videoid === videoid);
  }, [data, videoid]);
}

export function usePostComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      videoid: string | undefined;
      userid: string | undefined;
      commentbody: string;
      usercommented: string | undefined;
      /** Reply target; OMITTED for top-level comments — the server
       * Zod schema rejects an explicit `parentId: null` (400
       * VALIDATION_ERROR), which used to roll the optimistic comment
       * straight back off the screen. Replies pass the real id. */
      parentId?: string;
    }) => {
      // Strip parentId entirely for top-level posts; a reply keeps it.
      const { parentId, ...rest } = input;
      await api.postcomment(parentId ? { ...rest, parentId } : rest);
      return input;
    },
    // Optimistic: append the comment to THIS video's cached list at
    // once, so it is visible immediately — even before the refetch,
    // and even if the server page would not contain it yet.
    onMutate: async (input) => {
      const videoKey = [...queryKeys.comments, input.videoid ?? ""];
      await queryClient.cancelQueries({ queryKey: queryKeys.comments });
      const previous = queryClient.getQueryData<CommentItem[]>(videoKey);
      const optimistic: CommentItem = {
        _id: `temp-${Date.now()}`,
        videoid: input.videoid,
        userid: input.userid,
        commentbody: input.commentbody,
        usercommented: input.usercommented,
        parentId: input.parentId ?? null,
        likes: 0,
        dislikes: 0,
        userReaction: null,
        // The API returns `commentedon`, not `createdAt` — carry both
        // so relative times + newest sort work before the refetch.
        commentedon: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<CommentItem[]>(videoKey, (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { previous, videoKey };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.videoKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments });
      // Studio Comments reads queryKeys.studioComments (["studio",
      // "comments", ...]), NOT ["comments"] — invalidating only the
      // latter left a posted reply invisible in the Studio inbox until
      // a manual refetch. Invalidate the studio prefix too.
      void queryClient.invalidateQueries({ queryKey: ["studio", "comments"] });
    },
  });
}

export function useEditComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; commentbody: string }) => {
      await api.editcomment(input.id, input.commentbody);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments });
    },
  });
}

export function useDeleteComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.deletecomment(id);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments });
      // Studio Comments reads queryKeys.studioComments (["studio",
      // "comments", ...]), NOT ["comments"] — invalidating only the
      // latter left a deleted row on screen (server already gone)
      // until a manual refetch. Invalidate the studio prefix too.
      void queryClient.invalidateQueries({ queryKey: ["studio", "comments"] });
    },
  });
}

// ------------------------------------------- history / liked / watch-later
function useCurrentUserId(): string | undefined {
  return useAppSelector((s) => s.auth.session?.result._id);
}

function useUserList(
  key: readonly string[],
  fetcher: () => Promise<unknown>,
) {
  const userId = useCurrentUserId();
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<VideoListEntry[]> => {
      const data = await fetcher();
      return unwrapPage<VideoListEntry>(data);
    },
    enabled: Boolean(userId),
  });
}

export function useHistory() {
  return useUserList(queryKeys.history, async () => {
    const { data } = await api.getallhistory();
    return data;
  });
}

export function useLikedVideos() {
  return useUserList(queryKeys.liked, async () => {
    const { data } = await api.getalllikedvideo();
    return data;
  });
}

export function useWatchLater() {
  return useUserList(queryKeys.watchLater, async () => {
    const { data } = await api.getallwatchlater();
    return data;
  });
}

export function useAddToHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { videoid: string; viewer: string }) => {
      await api.addtohistory(input);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.history });
    },
  });
}

export function useDeleteHistoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { videoid: string; viewer: string }) => {
      await api.deleteHistoryItem(input.videoid, input.viewer);
      return input;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.history });
      const previous = queryClient.getQueryData<VideoListEntry[]>(
        queryKeys.history,
      );
      queryClient.setQueryData<VideoListEntry[]>(
        queryKeys.history,
        (old) =>
          (old ?? []).filter(
            (e) => !(e.videoid === input.videoid && e.viewer === input.viewer),
          ),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.history, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.history });
    },
  });
}

export function useClearHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userid: string) => {
      await api.deletehistory(userid);
    },
    onSuccess: () => {
      queryClient.setQueryData<VideoListEntry[]>(queryKeys.history, []);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.history });
    },
  });
}

export function useAddLikedVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { videoid: string; viewer: string }) => {
      await api.addtolikevideo(input);
      return input;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.liked });
      const previous = queryClient.getQueryData<VideoListEntry[]>(
        queryKeys.liked,
      );
      const optimistic: VideoListEntry = {
        _id: `temp-${Date.now()}`,
        videoid: input.videoid,
        viewer: input.viewer,
      };
      queryClient.setQueryData<VideoListEntry[]>(queryKeys.liked, (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.liked, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.liked });
    },
  });
}

export function useDeleteLikedVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { videoid: string; viewer: string }) => {
      await api.deletelikedvideo(input.videoid, input.viewer);
      return input;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.liked });
      const previous = queryClient.getQueryData<VideoListEntry[]>(
        queryKeys.liked,
      );
      queryClient.setQueryData<VideoListEntry[]>(queryKeys.liked, (old) =>
        (old ?? []).filter(
          (e) => !(e.videoid === input.videoid && e.viewer === input.viewer),
        ),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.liked, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.liked });
    },
  });
}

export function useAddWatchLater() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { videoid: string; viewer: string }) => {
      await api.addtowatchlater(input);
      return input;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.watchLater });
      const previous = queryClient.getQueryData<VideoListEntry[]>(
        queryKeys.watchLater,
      );
      const optimistic: VideoListEntry = {
        _id: `temp-${Date.now()}`,
        videoid: input.videoid,
        viewer: input.viewer,
      };
      queryClient.setQueryData<VideoListEntry[]>(queryKeys.watchLater, (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.watchLater, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.watchLater });
    },
  });
}

export function useDeleteWatchLater() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { videoid: string; viewer: string }) => {
      await api.deletewatchlater(input.videoid, input.viewer);
      return input;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.watchLater });
      const previous = queryClient.getQueryData<VideoListEntry[]>(
        queryKeys.watchLater,
      );
      queryClient.setQueryData<VideoListEntry[]>(queryKeys.watchLater, (old) =>
        (old ?? []).filter(
          (e) => !(e.videoid === input.videoid && e.viewer === input.viewer),
        ),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.watchLater, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.watchLater });
    },
  });
}

// ------------------------------------------------------- Phase 5: Studio

export function useStudioOverview() {
  return useQuery({
    queryKey: queryKeys.studioOverview,
    queryFn: async (): Promise<StudioOverview> => {
      const { data } = await api.getStudioOverview();
      return data as StudioOverview;
    },
  });
}

export function useStudioAnalytics(range: 7 | 28 | 90) {
  return useQuery({
    queryKey: queryKeys.studioAnalytics(range),
    queryFn: async (): Promise<StudioAnalytics> => {
      const { data } = await api.getStudioAnalytics(range);
      return data as StudioAnalytics;
    },
  });
}

// Content "View analytics" target: per-video daily series (owner only).
// Same `useVideo` shape — no fetch until an id is present, so the
// Analytics page can call this unconditionally and stay on the channel
// endpoint while no ?video= param is set.
export function useStudioVideoAnalytics(
  id: string | null,
  range: 7 | 28 | 90,
) {
  return useQuery({
    queryKey: queryKeys.studioVideoAnalytics(id ?? "", range),
    queryFn: async (): Promise<StudioVideoAnalytics> => {
      const { data } = await api.getStudioVideoAnalytics(id as string, range);
      return data as StudioVideoAnalytics;
    },
    enabled: Boolean(id),
  });
}

export function useStudioVideos(
  page = 1,
  opts: { q?: string; visibility?: string; limit?: number } = {},
) {
  return useQuery({
    queryKey: queryKeys.studioVideos(page, opts.q ?? "", opts.visibility ?? ""),
    queryFn: async (): Promise<PagedResult<Video>> => {
      const { data } = await api.getStudioVideos(page, opts.limit ?? 50, {
        q: opts.q || undefined,
        visibility: opts.visibility || undefined,
      });
      const pageData = data as PagedResult<Video>;
      return Array.isArray(data)
        ? {
            items: data as Video[],
            page: 1,
            limit: (data as Video[]).length,
            total: (data as Video[]).length,
            totalPages: 1,
          }
        : pageData;
    },
  });
}

export function useStudioComments(
  page = 1,
  opts: { filter?: string; sort?: string; limit?: number } = {},
) {
  return useQuery({
    queryKey: queryKeys.studioComments(page, opts.filter ?? "", opts.sort ?? ""),
    queryFn: async (): Promise<PagedResult<CommentItem>> => {
      const { data } = await api.getStudioComments(page, opts.limit ?? 50, {
        filter: opts.filter || undefined,
        sort: opts.sort || undefined,
      });
      const pageData = data as PagedResult<CommentItem>;
      return Array.isArray(data)
        ? {
            items: data as CommentItem[],
            page: 1,
            limit: (data as CommentItem[]).length,
            total: (data as CommentItem[]).length,
            totalPages: 1,
          }
        : pageData;
    },
  });
}

export function useStudioSettings() {
  return useQuery({
    queryKey: queryKeys.studioSettings,
    queryFn: async (): Promise<StudioSettings> => {
      const { data } = await api.getStudioSettings();
      return data as StudioSettings;
    },
  });
}

export function useUpdateStudioSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    // Phase 5 fix contract: the server accepts the full settings shape.
    mutationFn: async (input: StudioSettingsPatch) => {
      const { data } = await api.patchStudioSettings(input);
      return data as Channel;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.studioSettings,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.channels });
      // Settings polish: the Studio identity header reads
      // GET /studio/overview, not /studio/settings — a saved name
      // change must reach it too.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.studioOverview,
      });
    },
  });
}

// ------------------------------------------- Settings polish: handle check
// Debounced as-you-type availability (the component debounces the
// input; this hook only fires when `enabled` and the handle is set).
// Save is never blocked on it — the server still enforces uniqueness
// on PATCH (409/HANDLE_TAKEN).
export function useHandleAvailable(handle: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.handleAvailable(handle),
    queryFn: async (): Promise<HandleAvailability> => {
      const { data } = await api.getHandleAvailable(handle);
      return data as HandleAvailability;
    },
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

// ----------------------------------- Settings polish: banner/avatar images
// The upload/remove responses carry the new URL either top-level
// ({ bannerUrl } / { avatarUrl }) or nested under `channel` — read
// either, so the Settings preview can update from the response
// without waiting on the refetch.
export type StudioImageKind = "banner" | "avatar";

export function imageUrlFromUploadResponse(
  data: unknown,
  kind: StudioImageKind,
): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const field = kind === "banner" ? "bannerUrl" : "avatarUrl";
  const record = data as Record<string, unknown>;
  const direct = record[field];
  if (typeof direct === "string" && direct) return direct;
  const channel = record.channel;
  if (typeof channel === "object" && channel !== null) {
    const nested = (channel as Record<string, unknown>)[field];
    if (typeof nested === "string" && nested) return nested;
    // The overview/channel shape carries the avatar as `picture`.
    if (kind === "avatar") {
      const picture = (channel as Record<string, unknown>).picture;
      if (typeof picture === "string" && picture) return picture;
    }
  }
  return undefined;
}

// A banner/avatar change must show everywhere the channel appears:
// Settings (studioSettings), the Studio identity header
// (studioOverview — it prefers channel.avatarUrl over picture), and
// the channel header (channels — Describechannel reads
// useChannelById). Invalidate all three; nothing else refetches.
function useInvalidateStudioImages() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.studioSettings,
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.studioOverview,
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.channels });
  };
}

export function useUploadStudioBanner() {
  const invalidate = useInvalidateStudioImages();
  return useMutation({
    mutationFn: async (file: File) => {
      const { data } = await api.uploadStudioBanner(file);
      return imageUrlFromUploadResponse(data, "banner");
    },
    onSettled: () => invalidate(),
  });
}

export function useUploadStudioAvatar() {
  const invalidate = useInvalidateStudioImages();
  return useMutation({
    mutationFn: async (file: File) => {
      const { data } = await api.uploadStudioAvatar(file);
      return imageUrlFromUploadResponse(data, "avatar");
    },
    onSettled: () => invalidate(),
  });
}

export function useRemoveStudioBanner() {
  const invalidate = useInvalidateStudioImages();
  return useMutation({
    mutationFn: async () => {
      await api.removeStudioBanner();
    },
    onSettled: () => invalidate(),
  });
}

export function useRemoveStudioAvatar() {
  const invalidate = useInvalidateStudioImages();
  return useMutation({
    mutationFn: async () => {
      await api.removeStudioAvatar();
    },
    onSettled: () => invalidate(),
  });
}

export function useStudioPlaylists() {
  return useQuery({
    queryKey: queryKeys.studioPlaylists,
    queryFn: async (): Promise<Playlist[]> => {
      const { data } = await api.getStudioPlaylists();
      return unwrapPage<Playlist>(data);
    },
  });
}

// Channel page Playlists tab: the channel's public playlists.
// GET /channel/:id/playlists is PROPOSED — no backend route exists
// yet (GET /studio/playlists is owner-only; GET /watch/:id/playlists
// lists the playlists containing one video). Until the backend route
// lands, the query falls back to the owner-only list when the viewer
// IS the channel owner, so the owner's own tab still shows real
// playlists; any other viewer gets an honest load error instead of a
// faked empty list. The fallback shows public playlists only — a
// private playlist never appears on the public channel page.
export function useChannelPlaylists(id: string | undefined) {
  const session = useAppSelector((s) => s.auth.session);
  const isOwner = !!id && session?.result._id === id;
  return useQuery({
    queryKey: queryKeys.channelPlaylists(id ?? ""),
    enabled: !!id,
    queryFn: async (): Promise<Playlist[]> => {
      try {
        const { data } = await api.getChannelPlaylists(id as string);
        return unwrapPage<Playlist>(data);
      } catch (error) {
        if (!isOwner) throw error;
        const { data } = await api.getStudioPlaylists();
        return unwrapPage<Playlist>(data).filter(
          (playlist) =>
            playlist.owner === id && playlist.visibility === "public",
        );
      }
    },
  });
}

// Phase 5 contract fix: the /playlist/:id page reads the PUBLIC
// endpoint (another creator's public/unlisted playlist, or a logged-out
// visitor, must not 404 just because the owner-only list is empty).
export function useStudioPlaylist(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.studioPlaylist(id ?? ""),
    queryFn: async (): Promise<Playlist> => {
      const { data } = await api.getStudioPlaylist(id as string);
      return data as Playlist;
    },
    enabled: Boolean(id),
  });
}

export function useLibrary() {
  return useQuery({
    queryKey: queryKeys.studioLibrary,
    queryFn: async (): Promise<LibraryData> => {
      const { data } = await api.getLibrary();
      return data as LibraryData;
    },
  });
}

export function useCreatePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      visibility?: VideoVisibility;
      videoIds?: string[];
    }) => {
      const { data } = await api.createStudioPlaylist(input);
      return data as Playlist;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.studioPlaylists,
      });
    },
  });
}

export function useUpdatePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      title?: string;
      description?: string;
      visibility?: VideoVisibility;
      // Contract fix: the server takes addVideoIds/removeVideoIds.
      addVideoIds?: string[];
      removeVideoIds?: string[];
    }) => {
      const { id, ...rest } = input;
      const { data } = await api.patchStudioPlaylist(id, rest);
      return data as Playlist;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.studioPlaylists,
      });
    },
  });
}

export function useDeletePlaylist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.deleteStudioPlaylist(id);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.studioPlaylists,
      });
    },
  });
}

/** Optimistic title/visibility patch; invalidates only studio + videos keys. */
export function useUpdateVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      title?: string;
      visibility?: VideoVisibility;
      description?: string;
      tags?: string[];
      thumbnailUrl?: string;
      /** Local thumbnail file — sent as the `thumbnail` multipart part. */
      thumbnail?: File;
    }) => {
      await api.patchVideo(input.id, {
        title: input.title,
        visibility: input.visibility,
        description: input.description,
        tags: input.tags,
        thumbnailUrl: input.thumbnailUrl,
        thumbnail: input.thumbnail,
      });
      return input;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["studio", "videos"] });
      const previous = queryClient.getQueryData<PagedResult<Video>>(
        queryKeys.studioVideos(1),
      );
      queryClient.setQueryData<PagedResult<Video>>(
        queryKeys.studioVideos(1),
        (old) =>
          old
            ? {
                ...old,
                items: old.items.map((v) =>
                  v._id === input.id
                    ? {
                        ...v,
                        videotitle: input.title ?? v.videotitle,
                        visibility: input.visibility ?? v.visibility,
                      }
                    : v,
                ),
              }
            : old,
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.studioVideos(1), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["studio", "videos"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.videos });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.studioOverview,
      });
    },
  });
}

export function useDeleteVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.deleteVideo(id);
      return id;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["studio", "videos"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.videos });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.studioOverview,
      });
    },
  });
}

// ------------------------------------------------------- Phase 5 fix: new hooks

/** Ranked "Up next" from GET /watch/:id/suggestions, with a reason. */
export function useWatchSuggestions(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.watchSuggestions(id ?? ""),
    queryFn: async (): Promise<WatchSuggestion[]> => {
      const { data } = await api.getWatchSuggestions(id as string);
      const d = data as { items?: WatchSuggestion[] } | WatchSuggestion[];
      return Array.isArray(d) ? d : (d.items ?? []);
    },
    enabled: Boolean(id),
  });
}

// Phase 5 fix: public playlists containing a video — the Watch page's
// playlist showcase. This replaces the owner-only useStudioPlaylists
// lookup the Watch page used before (the showcase only ever rendered
// for the channel owner); the endpoint is public, so any viewer sees
// the showcase for a public playlist.
export function useWatchPlaylists(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.watchPlaylists(id ?? ""),
    queryFn: async (): Promise<Playlist[]> => {
      const { data } = await api.getWatchPlaylists(id as string);
      const d = data as { items?: Playlist[] } | Playlist[];
      return Array.isArray(d) ? d : (d.items ?? []);
    },
    enabled: Boolean(id),
  });
}

/** Creator pins a comment on their own video (server-enforced). */
export function usePinComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.pinComment(id);
      return id;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments });
      void queryClient.invalidateQueries({ queryKey: ["studio", "comments"] });
    },
  });
}

// ------------------------------------------- Watch comments: reactions
// Contract (backend worker, parallel): POST /comment/:id/like toggles
// the like, POST /comment/:id/dislike toggles the dislike; both return
// { likes, dislikes, userReaction: "like" | "dislike" | null }. The
// counts shown are always the server's (or the optimistic toggle of
// them) — never invented. This is NOT the Studio heart: that one is
// session-local useState; Watch reactions persist server-side.

/** One cached comment list, snapshotted for rollback. */
interface CommentListSnapshot {
  key: QueryKey;
  data: CommentItem[] | undefined;
}

/** Pure toggle math: liking removes a dislike and vice versa, and
 * pressing the active reaction again removes it. */
function toggleCommentReaction(
  comment: CommentItem,
  reaction: CommentReaction,
): CommentItem {
  const likes = comment.likes ?? 0;
  const dislikes = comment.dislikes ?? 0;
  const current = comment.userReaction ?? null;
  if (current === reaction) {
    return {
      ...comment,
      likes: Math.max(0, likes - (reaction === "like" ? 1 : 0)),
      dislikes: Math.max(0, dislikes - (reaction === "dislike" ? 1 : 0)),
      userReaction: null,
    };
  }
  if (current === null) {
    return {
      ...comment,
      likes: likes + (reaction === "like" ? 1 : 0),
      dislikes: dislikes + (reaction === "dislike" ? 1 : 0),
      userReaction: reaction,
    };
  }
  // Switching sides: +1 on the new side, -1 on the old one.
  return {
    ...comment,
    likes: Math.max(0, likes + (reaction === "like" ? 1 : -1)),
    dislikes: Math.max(0, dislikes + (reaction === "dislike" ? 1 : -1)),
    userReaction: reaction,
  };
}

/** Apply a function to one comment id in every cached ["comments", …]
 * list (Watch fetches per video, so there can be several). */
function patchCachedComment(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
  patch: (comment: CommentItem) => CommentItem,
): CommentListSnapshot[] {
  const snapshots = queryClient.getQueriesData<CommentItem[]>({
    queryKey: queryKeys.comments,
  });
  const taken: CommentListSnapshot[] = [];
  for (const [key, list] of snapshots) {
    taken.push({ key, data: list });
    if (!list) continue;
    queryClient.setQueryData<CommentItem[]>(
      key,
      list.map((c) => (c._id === id ? patch(c) : c)),
    );
  }
  return taken;
}

function useCommentReaction(reaction: CommentReaction) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<CommentReactionResult> => {
      const { data } =
        reaction === "like"
          ? await api.likeComment(id)
          : await api.dislikeComment(id);
      return data as CommentReactionResult;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.comments });
      const snapshots = patchCachedComment(queryClient, id, (c) =>
        toggleCommentReaction(c, reaction),
      );
      return { snapshots };
    },
    onError: (_error, _id, context) => {
      for (const snapshot of context?.snapshots ?? []) {
        queryClient.setQueryData(snapshot.key, snapshot.data);
      }
    },
    // Authoritative server counts win over the optimistic guess.
    onSuccess: (result, id) => {
      patchCachedComment(queryClient, id, (c) => ({
        ...c,
        likes: result.likes,
        dislikes: result.dislikes,
        userReaction: result.userReaction,
      }));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments });
      void queryClient.invalidateQueries({ queryKey: ["studio", "comments"] });
    },
  });
}

/** Toggle the like on a comment (POST /comment/:id/like). */
export function useLikeComment() {
  return useCommentReaction("like");
}

/** Toggle the dislike on a comment (POST /comment/:id/dislike). */
export function useDislikeComment() {
  return useCommentReaction("dislike");
}

/** Restore a soft-deleted video (POST /video/:id/restore). */
export function useRestoreVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.restoreVideo(id);
      return id;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["studio", "videos"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.videos });
    },
  });
}

/** Add one video to a library shelf (kind "saved" | "watchlater" | "liked"). */
export function useAddLibraryEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { videoid: string; kind: string }) => {
      await api.addLibraryEntry(input.videoid, input.kind);
      return input;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.studioLibrary });
    },
  });
}

export function useRemoveLibraryEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { videoid: string; kind: string }) => {
      await api.removeLibraryEntry(input.kind, input.videoid);
      return input;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.studioLibrary });
    },
  });
}

/** Server-persisted history-pause flag (GET/PATCH /user/history-paused). */
export function useHistoryPaused() {
  return useQuery({
    queryKey: queryKeys.historyPaused,
    queryFn: async (): Promise<boolean> => {
      const { data } = await api.getHistoryPaused();
      const d = data as { paused?: boolean } | boolean;
      return typeof d === "boolean" ? d : (d.paused ?? false);
    },
  });
}

export function useSetHistoryPaused() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (paused: boolean) => {
      await api.patchHistoryPaused(paused);
      return paused;
    },
    onSuccess: (paused) => {
      queryClient.setQueryData(queryKeys.historyPaused, paused);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.historyPaused });
    },
  });
}

/** Persist watch position (PATCH /video/history/:videoid/progress).
 * Path is the single Api function patchHistoryProgress — correct it
 * there if the backend worker lands a different route. */
export function useUpdateVideoProgress() {
  return useMutation({
    mutationFn: async (input: { videoid: string; progressSec: number }) => {
      await api.patchHistoryProgress(input.videoid, input.progressSec);
      return input;
    },
  });
}
