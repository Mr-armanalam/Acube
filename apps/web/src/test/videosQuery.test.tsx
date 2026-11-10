import { describe, it, expect } from "vitest";
// Videos query hooks (underpin Home / Search / Videopage): the list loads
// from the API, the by-id map resolves in O(1), and the newest-first
// helper returns a reversed COPY — it must never mutate the cached array.
import { renderHook, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTestStore, testSession } from "./testUtils";
import {
  useVideos,
  useVideosById,
  useVideosNewestFirst,
} from "../query/hooks";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return (
    <Provider store={createTestStore({ session: testSession })}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </Provider>
  );
}

describe("videos query hooks", () => {
  it("loads the video list", async () => {
    const { result } = renderHook(() => useVideos(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(3));
    expect(result.current.data?.map((v) => v._id)).toEqual([
      "vid1",
      "vid2",
      "vid3",
    ]);
  });

  it("resolves videos by id", async () => {
    const { result } = renderHook(() => useVideosById(), { wrapper });
    await waitFor(() =>
      expect(result.current["vid2"]?.videotitle).toBe("React Hooks Deep Dive"),
    );
  });

  it("returns newest-first as a copy without mutating the cache", async () => {
    const { result } = renderHook(
      () => ({ newest: useVideosNewestFirst(), all: useVideos().data }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.all).toHaveLength(3));
    expect(result.current.newest?.map((v) => v._id)).toEqual([
      "vid3",
      "vid2",
      "vid1",
    ]);
    // The cached array keeps API order — the reverse did not mutate it.
    expect(result.current.all?.map((v) => v._id)).toEqual([
      "vid1",
      "vid2",
      "vid3",
    ]);
  });
});
