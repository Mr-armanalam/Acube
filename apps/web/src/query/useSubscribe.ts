// Subscribe state + toggle (Watch page + Channel header).
// Backend contract (landed, commit 0437c5f — the MSW handlers answer
// the same shapes):
//   GET  /subscriptions/:channelId        -> { subscribed, subscriberCount }
//   POST /subscriptions/:channelId/toggle -> { subscribed, subscriberCount }
// 400 = own channel (VALIDATION_ERROR), 404 = unknown OR malformed id
// { error: { code: "NOT_FOUND" } }, unauthenticated POST = 401.
// The toggle is optimistic with rollback on error; the button hides
// for the channel owner and is disabled when logged out (never a
// faked subscription). A failed toggle (e.g. 404/500) rolls the
// button + count back to the last server-confirmed state.
// This file is separate from query/hooks.ts on purpose (another worker
// owns hooks.ts); it follows the same useMutation/useQuery patterns.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../Api";
import { queryKeys } from "./keys";

export interface SubscriptionState {
  subscribed: boolean;
  subscriberCount: number;
}

export function useSubscription(
  channelId: string | undefined,
  initial?: SubscriptionState,
) {
  return useQuery({
    queryKey: queryKeys.subscription(channelId ?? ""),
    queryFn: async (): Promise<SubscriptionState> => {
      const { data } = await api.getSubscription(channelId as string);
      return data as SubscriptionState;
    },
    enabled: Boolean(channelId),
    initialData: initial,
  });
}

export function useToggleSubscription(channelId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<SubscriptionState> => {
      const { data } = await api.toggleSubscription(channelId);
      return data as SubscriptionState;
    },
    // Optimistic: flip the button + count at once; the server's
    // response (onSettled) is the source of truth afterwards.
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.subscription(channelId),
      });
      const previous = queryClient.getQueryData<SubscriptionState>(
        queryKeys.subscription(channelId),
      );
      if (previous) {
        queryClient.setQueryData<SubscriptionState>(
          queryKeys.subscription(channelId),
          {
            subscribed: !previous.subscribed,
            subscriberCount: Math.max(
              0,
              previous.subscriberCount + (previous.subscribed ? -1 : 1),
            ),
          },
        );
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          queryKeys.subscription(channelId),
          context.previous,
        );
      }
    },
    onSettled: (data) => {
      if (data) {
        queryClient.setQueryData(
          queryKeys.subscription(channelId),
          data,
        );
      }
      void queryClient.invalidateQueries({
        queryKey: queryKeys.subscription(channelId),
      });
      // The video/channel DTOs also carry subscribed/subscriberCount.
      void queryClient.invalidateQueries({ queryKey: ["video"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.channels });
    },
  });
}
