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
  Video,
  VideoListEntry,
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

/** O(1) by-id lookup for WHL lists (kills the N+1 Showvideolist filter). */
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
    onSuccess: (_data, id) => {
      if (!userId) return;
      queryClient.setQueryData<Video[]>(queryKeys.videos, (old) =>
        (old ?? []).map((v) =>
          v._id === id ? { ...v, views: (v.views ?? 0) + 1 } : v,
        ),
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
