import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import atlasRegistry from "../../../public/models/z-anatomy-1.4.0-registry.json";
import { searchLearningResources } from "../../lib/learning-resources";

const structureSchema = z.object({
  id: z.string(),
  name: z.string(),
  system: z.string(),
  layer: z.string(),
  parentId: z.string().nullable().optional(),
  summary: z.string().optional(),
  function: z.string().optional(),
  fact: z.string().optional(),
});

const requestSchema = z.object({
  messages: z.array(z.unknown()).max(40),
  selectedStructure: structureSchema.nullable(),
  visibleSystems: z.array(z.string()),
  mode: z.string(),
  structureCatalog: z.array(structureSchema).max(2500),
});

type ChatStructure = z.infer<typeof structureSchema>;

const atlasLookupCatalog: ChatStructure[] = atlasRegistry.structures
  .filter((structure) => structure.selectable !== false)
  .map((structure) => ({
    id: structure.id,
    name: structure.name,
    system: structure.system,
    layer: structure.system,
    parentId: structure.parentId,
  }));

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findStructure(query: string, catalog: ChatStructure[]) {
  const needle = normalize(query);
  if (!needle) return undefined;

  const exact = catalog.find((structure) =>
    normalize(structure.id) === needle || normalize(structure.name) === needle,
  );
  if (exact) return exact;

  const words = needle.split(" ").filter(Boolean);
  return catalog
    .map((structure) => {
      const haystack = `${normalize(structure.name)} ${normalize(structure.id)}`;
      const score = words.reduce(
        (total, word) => total + (haystack.includes(word) ? 1 : 0),
        0,
      );
      return { structure, score };
    })
    .filter(({ score }) => score === words.length)
    .sort((a, b) => a.structure.name.length - b.structure.name.length)[0]
    ?.structure;
}

function cleanMermaidCode(code: string) {
  return code
    .trim()
    .replace(/^```(?:mermaid)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function validateMermaidCode(code: string) {
  const cleaned = cleanMermaidCode(code);
  const startsWithDiagramType = /^(flowchart|graph|sequenceDiagram|stateDiagram(?:-v2)?|erDiagram|mindmap|timeline)\b/i.test(cleaned);
  if (!startsWithDiagramType || cleaned.length > 6000 || /<\/?script\b/i.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function buildInstructions({
  selectedStructure,
  visibleSystems,
  mode,
  structureCatalog,
}: {
  selectedStructure: ChatStructure | null;
  visibleSystems: string[];
  mode: string;
  structureCatalog: ChatStructure[];
}) {
  const catalog = structureCatalog
    .map(({ id, name, system, layer, parentId }) =>
      JSON.stringify({ id, name, system, layer, parentId }),
    )
    .join("\n");

  return `You are AnatomyAI, a patient anatomy teacher connected to a 3D human atlas.

Teaching rules:
- Explain in short, student-friendly paragraphs.
- Use the current selected structure when the student says "this", "it", or asks a follow-up question.
- For "teach me" requests, teach in a clear sequence: location, main function, important relationships, and one useful clinical or study note.
- Ground structure names and navigation targets in the supplied atlas catalog. Do not invent atlas IDs.
- If the requested structure is found, call focusStructure before explaining it.
- If it is not found, say so and ask the student to choose a visible structure or clarify the name.
- If the student explicitly asks for a diagram, flowchart, pathway, cycle, or visual map, you must call createDiagram. Never substitute a searched image or Markdown image for an explicitly requested diagram.
- Use createDiagram for processes, pathways, cycles, or relationships that benefit from a visual explanation. Return one concise diagram, not a full lecture.
- Never print Mermaid source code or a \`\`\`mermaid code block in your answer; the diagram tool result is rendered in the chat UI.
- Use findLearningResource only when an anatomy image or video would materially improve the explanation. Search for only one resource type per response and never use it for a simple factual answer.
- Keep resource queries specific, educational, and grounded in the selected anatomy structure. Mention the source when you show a resource.
- The current mode is: ${mode}.
- Visible systems: ${visibleSystems.join(", ") || "none provided"}.

Currently selected structure:
${selectedStructure ? JSON.stringify(selectedStructure) : "None"}

Atlas structures available for lookup:
${catalog}`;
}

export const maxDuration = 30;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY is not configured." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid anatomy chat request." }, { status: 400 });
  }

  const {
    messages,
    selectedStructure,
    visibleSystems,
    mode,
    structureCatalog,
  } = parsed.data;
  const lookupCatalog = [
    ...structureCatalog,
    ...atlasLookupCatalog.filter(
      (atlasStructure) => !structureCatalog.some(({ id }) => id === atlasStructure.id),
    ),
  ];
  const google = createGoogleGenerativeAI({ apiKey });

  const result = streamText({
    model: google(process.env.GEMINI_MODEL ?? "gemini-2.5-flash"),
    system: buildInstructions({
      selectedStructure,
      visibleSystems,
      mode,
      structureCatalog: lookupCatalog,
    }),
    messages: await convertToModelMessages(messages as UIMessage[]),
    stopWhen: stepCountIs(4),
    tools: {
      focusStructure: tool({
        description:
          "Find an anatomy structure in the atlas, select it, and focus the 3D viewer on it.",
        inputSchema: z.object({
          query: z.string().describe("The structure name requested by the student"),
        }),
        execute: async ({ query }) => {
          const structure = findStructure(query, lookupCatalog);
          if (!structure) {
            return { found: false, query };
          }
          return {
            found: true,
            action: "focus",
            structureId: structure.id,
            structureName: structure.name,
            layer: structure.layer,
            structure,
          };
        },
      }),
      createDiagram: tool({
        description:
          "Create one concise Mermaid diagram for an anatomy process, pathway, cycle, or relationship. Use only when a diagram improves the teaching explanation.",
        inputSchema: z.object({
          title: z.string().trim().min(1).max(120),
          code: z.string().trim().min(1).max(7000),
        }),
        execute: async ({ title, code }) => {
          const validCode = validateMermaidCode(code);
          if (!validCode) {
            return {
              type: "diagram" as const,
              valid: false,
              title,
              message: "The diagram could not be safely rendered.",
            };
          }
          return {
            type: "diagram" as const,
            valid: true,
            title,
            code: validCode,
          };
        },
      }),
      findLearningResource: tool({
        description:
          "Find up to three educational anatomy images or YouTube videos when visual material would improve the explanation. Use only one type per response and do not call this for simple factual questions.",
        inputSchema: z.object({
          type: z.enum(["image", "video"]),
          query: z.string().trim().min(3).max(160),
        }),
        execute: async ({ type, query }) => {
          try {
            return {
              type: "learning-resources" as const,
              resourceType: type,
              query,
              ...(await searchLearningResources(type, query)),
            };
          } catch (error) {
            return {
              type: "learning-resources" as const,
              resourceType: type,
              query,
              available: false,
              items: [],
              message: error instanceof Error ? error.message : "Resource search failed.",
            };
          }
        },
      }),
    },
  });

  return createUIMessageStreamResponse({
    stream: result.toUIMessageStream(),
  });
}
