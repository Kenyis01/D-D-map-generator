import type { MapIntent, MapType } from "./types";

const SCHEMA_DESCRIPTION = `You generate JSON describing a top-down D&D battle map.

Return ONLY a single valid JSON object (no markdown, no backticks, no commentary) with EXACTLY this shape:

{
  "title": "string (≤40 chars)",
  "theme": "string (e.g. 'ancient tomb', 'pirate tavern')",
  "map_kind": "dungeon" | "building" | "outdoor",
  "map_type": "dungeon" | "overworld" | "town" | "interior",   // legacy field for the renderer
  "background_tile": "stone_floor" | "grass" | "dirt" | "wood_floor",
  "wall_palette": "earthy" | "redrock" | "sandstone" | "slate" | "volcanic" | "marble",
  "rooms": [
    {
      "id": "string (unique, e.g. 'main_hall')",
      "purpose": "entrance" | "corridor" | "chamber" | "throne" | "treasure" | "boss" | "crypt" |
                 "tavern_main" | "kitchen" | "bedroom" | "library" | "study" | "shop" |
                 "cellar" | "storage" | "shrine" | "barracks" | "open",
      "size": "small" | "medium" | "large" | "huge",
      "label": "Short Display Name (≤3 words)",
      "floor_material": "<material token>",
      "wood_palette": "ashen" | "dark" | "light" | "red" | "walnut"
    }
  ],
  "connections": [{ "from": "room_id", "to": "room_id" }]
}

== KEY RULE ==
You do NOT pick coordinates. You do NOT pick objects. The placement algorithm uses your room purpose + size + materials and fills in the geometry itself.

== HOW TO CHOOSE ==

1. Infer map_kind + map_type from the prompt:
     tavern/inn/library/house → "building" + "interior"
     dungeon/crypt/temple → "dungeon" + "dungeon"
     forest/field/village outdoors → "outdoor" + "overworld"
     town square / market → "outdoor" + "town"

2. Pick 4 to 7 rooms. Each gets a clear purpose. Avoid duplicates of the same purpose unless the prompt asks for it (e.g. "barracks with 3 bedrooms").

3. Pick room SIZE based on importance + prompt language:
     "small / closet / cell" → small
     "modest / typical" → medium
     "great / main / grand" → large
     "huge / vast / cathedral" → huge

4. Pick floor_material per room from the catalog below. Same-purpose rooms share material. Adjacent rooms with different functions contrast.

5. Pick wood_palette per room — internal consistency: one wood color per room. Match the room's vibe (noble=dark/red, gothic=ashen, tavern=walnut, cottage=light).

6. Pick wall_palette ONCE for the whole map.

7. Connections: each room must connect to at least one other. Aim for a tree (≥rooms-1 edges) plus one optional loop.

== MATERIAL CATALOG ==

floor_material tokens:
  herringbone, rectangular_tiles, marble → noble halls, throne, treasury, temple
  flat_stones                              → generic dungeon, crypt, corridor
  wood_plain                               → bedroom, library, parlor, study
  wood_scratched                           → busy tavern, inn
  wood_aged                                → old tavern, abandoned
  cracked_dirt, plain_dirt                → cellar, basement
  gravel, rocky_dirt, cave_floor          → mine, cave, rugged dungeon
  grass_long, grass_medium, grassy_dirt   → outdoor

wood_palette: ashen (burned/gothic), dark (noble/scholarly), light (cottage), red (luxurious), walnut (tavern default)

wall_palette: earthy (default dungeon), redrock (desert/volcanic), sandstone (desert ruin), slate (gothic), volcanic (demon lair), marble (palace/temple)

Output ONLY the JSON object.`;

export async function generateMapIntent(opts: {
  prompt: string;
  width: number;
  height: number;
}): Promise<MapIntent> {
  const seed = Math.floor(Math.random() * 1_000_000);
  const userPrompt = `Generate a D&D battle map intent.
- target width: ${opts.width} tiles
- target height: ${opts.height} tiles
- user description: ${opts.prompt}
- variation seed (do not include in output): ${seed}`;
  const text = await callLLM(SCHEMA_DESCRIPTION, userPrompt);

  let parsed: MapIntent;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    throw new Error(`LLM did not return valid JSON: ${text.slice(0, 200)}`);
  }
  return sanitizeIntent(parsed, opts.width, opts.height);
}

async function callLLM(system: string, user: string): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (groqKey) return callGroq(groqKey, system, user);
  if (geminiKey) return callGemini(geminiKey, system, user);
  throw new Error("No LLM API key configured. Set GROQ_API_KEY (recommended) or GEMINI_API_KEY.");
}

async function callGroq(apiKey: string, system: string, user: string): Promise<string> {
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq error ${res.status}: ${errText.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Groq returned empty content");
  return content;
}

async function callGemini(apiKey: string, system: string, user: string): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.9
    }
  });
  const result = await model.generateContent(`${system}\n\n${user}`);
  return result.response.text().trim();
}

function stripFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first > 0 || last < t.length - 1) {
    if (first >= 0 && last > first) t = t.slice(first, last + 1);
  }
  return t;
}

function sanitizeIntent(m: MapIntent, width: number, height: number): MapIntent {
  return {
    title: m.title || "Untitled Map",
    theme: m.theme || "",
    map_kind: m.map_kind || "dungeon",
    map_type: (m.map_type || "dungeon") as MapType,
    width,
    height,
    background_tile: m.background_tile || "stone_floor",
    wall_palette: m.wall_palette || "earthy",
    rooms: Array.isArray(m.rooms)
      ? m.rooms
          .filter((r) => r && r.id && r.purpose)
          .slice(0, 8)
      : [],
    connections: Array.isArray(m.connections)
      ? m.connections.filter((c) => c && c.from && c.to)
      : []
  };
}
