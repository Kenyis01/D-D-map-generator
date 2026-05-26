import type { MapData, MapType } from "./types";

const SCHEMA_DESCRIPTION = `Return ONLY a single valid JSON object (no markdown, no backticks, no commentary) with EXACTLY this shape:

{
  "title": "string (short evocative name)",
  "map_type": "dungeon" | "overworld" | "town" | "interior",
  "width": integer (tiles),
  "height": integer (tiles),
  "theme": "string (e.g. 'ancient tomb', 'forest village')",
  "background_tile": "stone_floor" | "grass" | "dirt" | "wood_floor",
  "rooms": [
    { "id": "string", "x": int, "y": int, "w": int, "h": int,
      "type": "entrance"|"corridor"|"chamber"|"boss"|"treasure"|"shop"|"tavern"|"open",
      "label": "string (optional)"
    }
  ],
  "connections": [
    { "from": "room_id", "to": "room_id", "type": "door"|"arch"|"stairs"|"path" }
  ],
  "objects": [
    { "x": int, "y": int,
      "type": "chest"|"door"|"pillar"|"trap"|"altar"|"table"|"barrel"|"tree"|"house"|"well"|"skull"|"bones"|"candle"|"statue"|"bookshelf"|"bed"|"weapon_rack"|"web"|"crate"|"debris"|"campfire"|"rug"|"fountain"|"torch"|"brazier"|"lantern"|"fireplace"|"treasure"|"tombstone"|"coffin"|"seating"|"rock"|"bush"|"flower"|"mushroom"|"stairs"|"cobweb"|"weapon_sword"|"weapon_axe"|"armor_stand"|"beast_bones"
    }
  ],
  "special_tiles": [
    { "x": int, "y": int,
      "type": "wall"|"water"|"lava"|"void"|"road"|"forest"
    }
  ]
}

Rules:
- All coordinates must be inside the grid (0 <= x < width, 0 <= y < height).
- Rooms must NOT overlap; w >= 3, h >= 3; fit inside the grid with at least 2 tile margin from the edges so corridors have room to run.
- Every connection references existing room ids.
- 4 to 7 rooms total. Mix room sizes (some small chambers 3x3, one or two big halls 6x5).
- ABSOLUTELY CRITICAL: Place AT LEAST 25 objects total, ideally 35-50. Empty rooms are a failure. Every room must contain 5-10 objects appropriate to its purpose. Scatter loose decorative objects (skulls, bones, debris, candles, webs) throughout corridors and room edges too.
- Object placement by room type — USE THE FULL VARIETY of object types, not just the basics:
  * entrance: bones, skull, debris, candle, torch, web, cobweb, rock, tombstone
  * chamber: pillar (4-6 symmetrical), candle, brazier, statue, bones, web, rug, fireplace, seating
  * boss: altar, statue, pillar, weapon_rack, weapon_sword, weapon_axe, armor_stand, brazier, bones, skull, campfire, treasure
  * treasure: chest (3-5), treasure, candle, brazier, web, statue, weapon_rack, coffin, rug
  * corridor: web, cobweb, debris, bones, candle, torch, trap, skull, rock
  * shop: table, barrel, crate, bookshelf, candle, lantern, rug, chest, seating, weapon_sword
  * tavern: table, seating, barrel, crate, candle, lantern, rug, fireplace, bookshelf
  * open: campfire, barrel, crate, debris, bones, table, rock, tree
- For dungeon: stone_floor background. DON'T add wall special_tiles — the renderer draws walls around each room automatically. Focus on filling rooms with objects.
- For overworld: grass background. Add forest clusters (special_tiles), road tiles connecting locations, a small water body. Place 8-15 trees, 4-8 bushes, 3-5 flowers, 2-4 mushrooms, 5-10 rocks, 3-5 houses, 1-2 wells, 2-3 campfires.
- For town: dirt background. Add road tiles between buildings. Place 4-8 houses, 2-3 wells, 4-6 barrels, 3-5 crates, 2-3 tables outside, 1-2 fountains, 2-3 lanterns/torches, 2-3 carts/rugs.
- For interior: wood_floor background. Place 3-5 tables, 5-10 barrels, 4-6 chests, 3-5 bookshelves, 2-3 beds, 4-8 candles, 2-3 lanterns, 1-2 fireplaces, 2-3 rugs, 2-3 weapon_racks, several seating.
- "label" should be SHORT (2-3 words max, e.g. "Throne Room", "Treasury", "Crypt"). Long labels overflow the room.
- Output ONLY the JSON object.`;

export async function generateMapJson(opts: {
  prompt: string;
  mapType?: MapType;
  width?: number;
  height?: number;
  existingMap?: MapData;
}): Promise<MapData> {
  const seed = Math.floor(Math.random() * 1_000_000);
  const widthHint = opts.width ?? 20;
  const heightHint = opts.height ?? 15;
  const mapTypeHint = opts.mapType ?? "dungeon";

  let userPrompt: string;
  if (opts.existingMap) {
    userPrompt = `Modify this existing map according to the instruction below.

Existing map JSON:
${JSON.stringify(opts.existingMap)}

User modification: ${opts.prompt}

Keep the same width and height. Preserve identity where it makes sense but apply the changes. Variation seed: ${seed}.`;
  } else {
    userPrompt = `Generate a fresh D&D tactical map.
- map_type: ${mapTypeHint}
- width: ${widthHint}
- height: ${heightHint}
- user description: ${opts.prompt}
- variation seed (only for randomness, do not include in output): ${seed}`;
  }

  const text = await callLLM(SCHEMA_DESCRIPTION, userPrompt);

  let parsed: MapData;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch (err) {
    throw new Error(`LLM did not return valid JSON: ${text.slice(0, 200)}`);
  }
  return sanitize(parsed, widthHint, heightHint, mapTypeHint);
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
      temperature: 1.0,
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
  if (typeof content !== "string") {
    throw new Error("Groq returned empty content");
  }
  return content;
}

async function callGemini(apiKey: string, system: string, user: string): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 1.0
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

function sanitize(
  m: MapData,
  width: number,
  height: number,
  mapType: MapType
): MapData {
  const w = m.width || width;
  const h = m.height || height;
  return {
    title: m.title || "Untitled Map",
    map_type: (m.map_type || mapType) as MapType,
    width: w,
    height: h,
    theme: m.theme || "",
    background_tile: m.background_tile || "stone_floor",
    rooms: Array.isArray(m.rooms) ? m.rooms.filter((r) => r && r.id) : [],
    connections: Array.isArray(m.connections) ? m.connections : [],
    objects: Array.isArray(m.objects)
      ? m.objects.filter((o) => inBounds(o.x, o.y, w, h))
      : [],
    special_tiles: Array.isArray(m.special_tiles)
      ? m.special_tiles.filter((s) => inBounds(s.x, s.y, w, h))
      : []
  };
}

function inBounds(x: number, y: number, w: number, h: number) {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x < w && y < h;
}
