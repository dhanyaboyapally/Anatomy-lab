import { requireSupabase } from "./supabase";

export type ChatConversation = {
  id: string;
  user_id: string;
  title: string;
  target_organ_id: string | null;
  target_organ_name: string | null;
  selected_structure_id: string | null;
  selected_structure_name: string | null;
  mode: string;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  parts: unknown[];
  created_at: string;
};

export type ChatConversationDetail = {
  conversation: ChatConversation;
  messages: ChatMessage[];
};

async function chatApiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) {
    throw new Error("Sign in before saving chat history.");
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "error" in payload && payload.error
        ? payload.error
        : "Unable to sync chat history.",
    );
  }
  return payload as T;
}

export function listChatConversations(): Promise<ChatConversation[]> {
  return chatApiRequest("/api/chat/conversations");
}

export function createChatConversation(input?: {
  title?: string;
  targetOrganId?: string | null;
  targetOrganName?: string | null;
  selectedStructureId?: string | null;
  selectedStructureName?: string | null;
  mode?: string;
}): Promise<ChatConversation> {
  return chatApiRequest("/api/chat/conversations", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export function getChatConversation(id: string): Promise<ChatConversationDetail> {
  return chatApiRequest(`/api/chat/conversations/${encodeURIComponent(id)}`);
}

export function saveChatMessage(
  conversationId: string,
  message: Pick<ChatMessage, "role" | "content" | "parts">,
): Promise<ChatMessage> {
  return chatApiRequest(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    body: JSON.stringify(message),
  });
}
