// TanStack Query hooks — chat users, messages, groups (Phase 2b).
// Server state only; the open conversation lives in the chatUi RTK slice.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppSelector } from "../store";
import * as api from "../Api";
import { queryKeys } from "./keys";
import type { ChatMessage, ChatUserList, Group } from "../types";

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

// Phase 3b: message/group lists return { items, page, limit, total,
// totalPages }. Unwrap `items`, falling back to a bare array.
function unwrapPage<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "object" && value !== null && "items" in value) {
    return asArray<T>((value as { items?: unknown }).items);
  }
  return [];
}

export function useChatUsers(searchquery: string) {
  const userId = useAppSelector((s) => s.auth.session?.result._id);
  return useQuery({
    queryKey: queryKeys.chatUsers(searchquery),
    queryFn: async (): Promise<ChatUserList> => {
      const { data } = await api.all_chat_user_sidebar({ searchquery });
      const rec = (data ?? {}) as Partial<ChatUserList>;
      return {
        filteredUsers: asArray(rec.filteredUsers),
        currentMessages: asArray(rec.currentMessages),
      };
    },
    enabled: Boolean(userId),
  });
}

export function useChatMessages(selectedUserId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.chatMessages(selectedUserId ?? ""),
    queryFn: async (): Promise<ChatMessage[]> => {
      if (!selectedUserId) return [];
      const { data } = await api.get_chat_Messages(selectedUserId);
      return unwrapPage<ChatMessage>(data);
    },
    enabled: Boolean(selectedUserId),
  });
}

export function useSendChatMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { message: string; recieverId: string }) => {
      const { data } = await api.send_chat_Messages(input);
      return data;
    },
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.chatMessages(variables.recieverId),
      });
      void queryClient.invalidateQueries({ queryKey: ["chatUsers"] });
    },
  });
}

export function useDeleteChatMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; selectedUserId: string }) => {
      await api.deleteChat(input);
      return input;
    },
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.chatMessages(variables.selectedUserId),
      });
    },
  });
}

export function useGroups() {
  const userId = useAppSelector((s) => s.auth.session?.result._id);
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: async (): Promise<Group[]> => {
      const { data } = await api.get_all_Group();
      return unwrapPage<Group>(data);
    },
    enabled: Boolean(userId),
  });
}

export function useGroupMessages(groupId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.groupMessages(groupId ?? ""),
    queryFn: async (): Promise<ChatMessage[]> => {
      if (!groupId) return [];
      const { data } = await api.fetch_group_messages(groupId);
      return unwrapPage<ChatMessage>(data);
    },
    enabled: Boolean(groupId),
  });
}

export function useSendGroupMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { content: string; groupId: string }) => {
      await api.send_group_messages(input);
      return input;
    },
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.groupMessages(variables.groupId),
      });
    },
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { GroupId: string[]; GroupName: string }) => {
      await api.send_GroupUsers(input);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.groups });
    },
  });
}
