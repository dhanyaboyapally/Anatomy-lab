import { z } from "zod";
import { authenticateRequest } from "../../../lib/api-auth";
import { ensurePublicUser } from "../../../lib/notes";

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  targetOrganId: z.string().trim().max(200).nullable().optional(),
  targetOrganName: z.string().trim().max(200).nullable().optional(),
  selectedStructureId: z.string().trim().max(200).nullable().optional(),
  selectedStructureName: z.string().trim().max(200).nullable().optional(),
  mode: z.string().trim().min(1).max(50).optional(),
});

export async function GET(request: Request) {
  const context = await authenticateRequest(request, "chat history");
  if (context instanceof Response) return context;

  try {
    await ensurePublicUser(context.user, context.client);
    const { data, error } = await context.client
      .from("chat_conversations")
      .select("id,user_id,title,target_organ_id,target_organ_name,selected_structure_id,selected_structure_name,mode,created_at,updated_at")
      .eq("user_id", context.user.id)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    return Response.json(data ?? []);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load chat history." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid chat conversation request." }, { status: 400 });
  }

  const parsed = createConversationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid chat conversation details." }, { status: 400 });
  }

  const context = await authenticateRequest(request, "chat history");
  if (context instanceof Response) return context;

  try {
    await ensurePublicUser(context.user, context.client);
    const { data, error } = await context.client
      .from("chat_conversations")
      .insert({
        user_id: context.user.id,
        title: parsed.data.title ?? "New anatomy chat",
        target_organ_id: parsed.data.targetOrganId ?? null,
        target_organ_name: parsed.data.targetOrganName ?? null,
        selected_structure_id: parsed.data.selectedStructureId ?? null,
        selected_structure_name: parsed.data.selectedStructureName ?? null,
        mode: parsed.data.mode ?? "chat",
      })
      .select("id,user_id,title,target_organ_id,target_organ_name,selected_structure_id,selected_structure_name,mode,created_at,updated_at")
      .single();

    if (error) throw error;
    return Response.json(data, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to create chat conversation." },
      { status: 500 },
    );
  }
}
