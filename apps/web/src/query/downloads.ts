// TanStack Query hooks — premium status, downloads, payments (Phase 2b).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppSelector } from "../store";
import * as api from "../Api";
import { queryKeys } from "./keys";
import type { DownloadItem, PaymentRequestResponse } from "../types";
// Phase 3c: the payment request shape is the @acube/shared Zod input
// type (same schema the API validates). The response shape stays local
// in ../types.ts — @acube/shared has no response schemas.
import type { HandlePaymentStatusInput } from "@acube/shared";

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

// Premium status (Phase 3b + premium free window): the API returns the
// EFFECTIVE premium value plus `freeWindowActive`, so the client can
// tell a free-window grant apart from paid premium. NOTE: there is NO
// separate paid flag — during the window `isPremium` is true for
// everyone, so `isPremium && !freeWindowActive` is NOT a sound "paid"
// derivation while the window is active (it only becomes sound after
// the cutoff, when isPremium means paid). Do not derive paid status
// from these two fields; a `paidPremium` field from the API is the
// follow-up that would let the client hide the lock-in offer for
// users who already paid.
export interface PremiumStatus {
  isPremium: boolean;
  freeWindowActive: boolean;
}

export function usePremiumStatus() {
  const userId = useAppSelector((s) => s.auth.session?.result._id);
  return useQuery({
    queryKey: queryKeys.premium,
    queryFn: async (): Promise<PremiumStatus> => {
      const { data } = await api.checkPremiumStatus();
      const rec = (data ?? {}) as {
        isPremium?: unknown;
        freeWindowActive?: unknown;
      };
      return {
        isPremium: rec.isPremium === true,
        freeWindowActive: rec.freeWindowActive === true,
      };
    },
    enabled: Boolean(userId),
  });
}

export function useDownloads() {
  const userId = useAppSelector((s) => s.auth.session?.result._id);
  return useQuery({
    queryKey: queryKeys.downloads,
    queryFn: async (): Promise<DownloadItem[]> => {
      const { data } = await api.getDownloads();
      const rec = (data ?? {}) as { downloads?: unknown };
      return asArray<DownloadItem>(rec.downloads);
    },
    enabled: Boolean(userId),
  });
}

export function useDownloadVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    // Phase 2c: the download is recorded for a specific video. The server
    // records the download against the signed-in user and ignores the body
    // beyond validation, so the id is sent as an object field.
    mutationFn: async (input: { videoId: string }) => {
      const { data } = await api.downloadVideo(input);
      return data as { success?: boolean; message?: string; video?: DownloadItem };
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.downloads });
      void queryClient.invalidateQueries({ queryKey: queryKeys.premium });
    },
  });
}

export function useCreatePaymentRequest() {
  return useMutation({
    // Phase 3b: no payment data is sent — the price comes from the
    // server catalogue and the buyer is the signed-in user.
    mutationFn: async (): Promise<PaymentRequestResponse> => {
      const { data } = await api.createPaymentRequest();
      return data as PaymentRequestResponse;
    },
  });
}

export function useHandlePaymentStatus() {
  return useMutation({
    // Phase 3b: the Stripe Checkout Session id from the return URL.
    // The server verifies it with Stripe before granting premium.
    mutationFn: async (input: HandlePaymentStatusInput) => {
      const { data } = await api.handlePaymentStatus(input);
      return data as { success?: boolean; isPremium?: boolean };
    },
  });
}
