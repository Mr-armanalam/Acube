// TanStack Query client (Phase 2b). Server state ONLY.
// Defaults: 30s stale time so navigating between pages does not refetch
// everything, 1 retry, and no refetch-on-focus storms.
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
