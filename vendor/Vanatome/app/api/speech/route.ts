import { z } from "zod";

const speechRequestSchema = z.object({
  text: z.string().trim().min(1).max(4096),
});

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid speech request." }, { status: 400 });
  }

  const parsed = speechRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Speech text must be between 1 and 4096 characters." }, { status: 400 });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "marin",
        input: parsed.data.text,
        instructions: "Speak like a warm, calm, clear medical anatomy tutor. Use natural pacing and gentle emphasis. Do not sound robotic or theatrical.",
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return Response.json(
        { error: detail || "Unable to generate speech." },
        { status: response.status },
      );
    }

    return new Response(await response.arrayBuffer(), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to generate speech." },
      { status: 502 },
    );
  }
}
