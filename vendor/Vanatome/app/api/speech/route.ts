import { z } from "zod";

const speechRequestSchema = z.object({
  text: z.string().trim().min(1).max(4096),
});

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ELEVENLABS_API_KEY is not configured." }, { status: 503 });
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
    const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?model_id=eleven_flash_v2_5&output_format=mp3_22050_32`,
      {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: parsed.data.text,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.2,
          use_speaker_boost: true,
          speed: 1,
        },
      }),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      return Response.json(
        { error: detail || "Unable to generate speech." },
        { status: response.status },
      );
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "audio/mpeg",
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
