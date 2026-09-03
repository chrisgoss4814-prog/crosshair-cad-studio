import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const StepSchema = z.object({
  op: z.enum(["place", "cut"]),
  kind: z.string(),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  sx: z.number(),
  sy: z.number(),
  sz: z.number(),
  rx: z.number(),
  ry: z.number(),
  rz: z.number(),
  extrude: z.number(),
  sides: z.number(),
  color: z.string(),
  note: z.string(),
});

export type BuildStep = z.infer<typeof StepSchema>;

const ResultSchema = z.object({
  summary: z.string(),
  steps: z.array(StepSchema),
});

export type BuildResult = z.infer<typeof ResultSchema>;

const Input = z.object({
  prompt: z.string().min(1),
  /** Remembered style preferences, rendered into the system prompt. */
  preferences: z.string().default(""),
  /** Past accepted/rejected builds used as few-shot context. */
  examples: z.string().default(""),
  /** Current scene summary so the AI can build around what exists. */
  scene: z.string().default(""),
});

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "steps"],
  properties: {
    summary: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "op",
          "kind",
          "x",
          "y",
          "z",
          "sx",
          "sy",
          "sz",
          "rx",
          "ry",
          "rz",
          "extrude",
          "sides",
          "color",
          "note",
        ],
        properties: {
          op: { type: "string", enum: ["place", "cut"] },
          kind: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          z: { type: "number" },
          sx: { type: "number" },
          sy: { type: "number" },
          sz: { type: "number" },
          rx: { type: "number" },
          ry: { type: "number" },
          rz: { type: "number" },
          extrude: { type: "number" },
          sides: { type: "number" },
          color: { type: "string" },
          note: { type: "string" },
        },
      },
    },
  },
} as const;

const SYSTEM = `You are the build engine inside Vector Bay, a first-person CAD app.
You construct things by emitting a JSON list of tool steps that the app replays with its own tools.

Coordinate system: metres, Y is up, ground plane is y = 0.
An object's position is its CENTER, so a 2m tall box sitting on the ground has y = 1.

Available "kind" values:
3D solids: box, sphere, cylinder, cone, pyramid, wedge, torus, capsule, tube, tetra, octa, icosa, dodeca
2D profiles: rect, circle, ellipse, triangle, polygon, star, slot, arc
A 2D profile with extrude > 0 becomes a solid of that height (extrusion happens along Y).

Step fields:
- op: "place" adds a shape; "cut" subtracts that shape from any solids it overlaps (use for holes, windows, doorways, slots).
- sx/sy/sz: size in metres on each axis (stretch).
- rx/ry/rz: rotation in RADIANS.
- sides: for polygon/star/cylinder facet count (default 6).
- color: hex string.
- note: 4-8 word description of that step.

Rules: keep parts flush and aligned (walls butt, courses stack), snap sizes to tidy numbers,
keep total steps under 80, and cut AFTER the solid it cuts into exists.
Respond with the JSON object only.`;

export const aiBuild = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<BuildResult> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const context = [
      data.preferences ? `Builder preferences:\n${data.preferences}` : "",
      data.examples ? `Past builds by this user (learn their style):\n${data.examples}` : "",
      data.scene ? `Current scene:\n${data.scene}` : "Current scene: empty.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `${context}\n\nBuild request: ${data.prompt}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "build_plan", strict: true, schema: JSON_SCHEMA },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) throw new Error("AI is rate limited — try again shortly.");
      if (res.status === 402)
        throw new Error("AI credits exhausted — add credits in Lovable to keep building.");
      throw new Error(`AI build failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const payload = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = payload.choices?.[0]?.message?.content ?? "";
    try {
      return ResultSchema.parse(JSON.parse(text));
    } catch {
      throw new Error("AI returned an unreadable build plan. Try rephrasing.");
    }
  });
