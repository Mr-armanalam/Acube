// TanStack Query hooks — videos, channels, comments, history, liked,
// watch-later, upload, points (Phase 2b).
// Every mutation invalidates ONLY its own key (or optimistically patches
// one entity); nothing refetches the whole app after a mutation.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppDispatch, useAppSelector } from "../store";
import {
  setUploadError,
  setUploadProgress,
  setUploadStatus,
} from "../store/slices/uploadSlice";
import * as api from "../Api";
import { queryKeys } from "./keys";
import type {
  Channel,
  CommentItem,
  LibraryData,
  PagedResult,
  Playlist,
  StudioAnalytics,
  StudioOverview,
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
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.videos });
      const previous = queryClient.getQueryData<Video[]>(queryKeys.videos);
      const delta = input.action === "like" ? 1 : -1;
      queryClient.setQueryData<Video[]>(queryKeys.videos, (old) =>
        (old ?? []).map((v) =>
          v._id === input.id
            ? { ...v, Like: Math.max(0, (v.Like ?? 0) + delta) }
            : v,
        ),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.videos, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.videos });
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
      dispatch(
        setUploadError(
          error instanceof Error ? error.message : "Upload failed",
        ),
      );
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
export function useComments() {
  return useQuery({
    queryKey: queryKeys.comments,
    queryFn: async (): Promise<CommentItem[]> => {
      const { data } = await api.getallcomment();
      return unwrapPage<CommentItem>(data);
    },
  });
}

export function useCommentsForVideo(
  videoid: string | undefined,
): CommentItem[] | undefined {
  const { data } = useComments();
  return useMemo(() => {
    if (!data) return undefined;
    // Copy before reversing — never mutate the cached array.
    return data
      .filter((c) => c.videoid === videoid)
      .slice()
      .reverse();
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
      /** Phase 5: reply target; omitted/null = top-level comment. */
      parentId?: string | null;
    }) => {
      await api.postcomment(input);
      return input;
    },
    // Optimistic: append the comment to the cached list at once.
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.comments });
      const previous = queryClient.getQueryData<CommentItem[]>(
        queryKeys.comments,
      );
      const optimistic: CommentItem = {
        _id: `temp-${Date.now()}`,
        videoid: input.videoid,
        userid: input.userid,
        commentbody: input.commentbody,
        usercommented: input.usercommented,
        parentId: input.parentId ?? null,
      };
      queryClient.setQueryData<CommentItem[]>(queryKeys.comments, (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.comments, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments });
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
    },
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
    }) => {
      await api.patchVideo(input.id, {
        title: input.title,
        visibility: input.visibility,
        description: input.description,
        tags: input.tags,
        thumbnailUrl: input.thumbnailUrl,
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
