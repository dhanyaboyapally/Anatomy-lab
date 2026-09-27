import { z } from "zod";
import { authenticateRequest } from "../../../../lib/api-auth";

const updateConversationSchema = z.object({
  targetOrganId: z.string().trim().min(1).max(200),
  targetOrganName: z.string().trim().max(200).nullable().optional(),
});

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(request: Request, routeContext: RouteContext) {
  const context = await authenticateRequest(request, "chat history");
  if (context instanceof Response) return context;

  const { conversationId } = await routeContext.params;
  if (!conversationId) {
    return Response.json({ error: "A conversation id is required." }, { status: 400 });
  }

  try {
    const { data: conversation, error: conversationError } = await context.client
      .from("chat_conversations")
      .select("id,user_id,title,target_organ_id,target_organ_name,selected_structure_id,selected_structure_name,mode,created_at,updated_at")
      .eq("id", conversationId)
      .eq("user_id", context.user.id)
      .maybeSingle();

    if (conversationError) throw conversationError;
    if (!conversation) {
      return Response.json({ error: "Chat conversation not found." }, { status: 404 });
    }

    const { data: messages, error: messagesError } = await context.client
      .from("chat_messages")
      .select("id,conversation_id,role,content,parts,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (messagesError) throw messagesError;
    return Response.json({ conversation, messages: messages ?? [] });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load chat conversation." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid chat conversation update." }, { status: 400 });
  }

  const parsed = updateConversationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "A target organ is required." }, { status: 400 });
  }

  const context = await authenticateRequest(request, "chat history");
  if (context instanceof Response) return context;

  const { conversationId } = await routeContext.params;
  if (!conversationId) {
    return Response.json({ error: "A conversation id is required." }, { status: 400 });
  }

  try {
    const { data, error } = await context.client
      .from("chat_conversations")
      .update({
        target_organ_id: parsed.data.targetOrganId,
        target_organ_name: parsed.data.targetOrganName ?? null,
      })
      .eq("id", conversationId)
      .eq("user_id", context.user.id)
      .select("id,user_id,title,target_organ_id,target_organ_name,selected_structure_id,selected_structure_name,mode,created_at,updated_at")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return Response.json({ error: "Chat conversation not found." }, { status: 404 });
    }
    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to update chat conversation." },
      { status: 500 },
    );
  }
}
