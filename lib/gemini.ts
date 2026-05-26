import type { MapData, MapType } from "./types";
import { MATERIAL_CATALOG_FOR_LLM } from "./materials";

const SCHEMA_DESCRIPTION = `You generate JSON for a top-down D&D tactical battle map.
Return ONLY a single valid JSON object (no markdown, no backticks, no commentary) with EXACTLY this shape:

{
  "title": "short evocative name (≤40 chars)",
  "map_type": "dungeon" | "overworld" | "town" | "interior",   // INFER from the user prompt; don't ask
  "theme": "string (e.g. 'ancient tomb', 'pirate tavern', 'forest village')",
  "width": integer,
  "height": integer,
  "background_tile": "stone_floor" | "grass" | "dirt" | "wood_floor",  // base terrain category
  "wall_palette": "earthy" | "redrock" | "sandstone" | "slate" | "volcanic" | "marble",  // one for the whole map
  "rooms": [
    {
      "id": "string (unique, e.g. 'main_hall')",
      "x": int, "y": int, "w": int, "h": int,
      "type": "entrance"|"corridor"|"chamber"|"boss"|"treasure"|"shop"|"tavern"|"open",
      "label": "Short Room Name (≤3 words)",
      "floor_material": "<token from FLOOR_MATERIALS catalog below>",  // overrides background_tile per room
      "wood_palette": "ashen"|"dark"|"light"|"red"|"walnut"             // furniture wood color in this room
    }
  ],
  "connections": [
    { "from": "room_id", "to": "room_id", "type": "door"|"arch"|"stairs"|"path" }
  ],
  "objects": [
    {
      "x": int, "y": int,
      "type": "chest"|"door"|"pillar"|"trap"|"altar"|"table"|"barrel"|"tree"|"house"|"well"|"skull"|"bones"|"candle"|"statue"|"bookshelf"|"bed"|"weapon_rack"|"web"|"crate"|"debris"|"campfire"|"rug"|"fountain"|"torch"|"brazier"|"lantern"|"fireplace"|"treasure"|"tombstone"|"coffin"|"seating"|"rock"|"bush"|"flower"|"mushroom"|"stairs"|"cobweb"|"weapon_sword"|"weapon_axe"|"armor_stand"|"beast_bones",
      "contents": "empty"|"coins"|"silver"|"mixed"|"rusty"   // ONLY for chest, optional
    }
  ],
  "special_tiles": [
    { "x": int, "y": int, "type": "water"|"lava"|"void"|"road"|"forest" }
    // DO NOT emit "wall" — the renderer auto-walls non-room tiles.
  ]
}

== MATERIAL CATALOG (pick semantically per room/map) ==
${MATERIAL_CATALOG_FOR_LLM}

== STRUCTURAL RULES ==
1. INFER map_type from the prompt — if the user describes a tavern, use "interior". A forest, "overworld". A castle dungeon, "dungeon". Don't ask the user.
2. Coords are 0-indexed, must fit inside the grid with a 2-tile margin from the edges (corridors need room).
3. Rooms must NOT overlap. Sizes: small rooms 3×3 to 4×4, medium 5×5 to 6×5, big halls 7×6 to 8×7. Mix sizes.
4. 4 to 7 rooms total.
5. Every connection.from and .to must reference an existing room id. Aim for one connection per pair of adjacent rooms; no isolated rooms.

== MATERIAL & THEMATIC COHESION (CRITICAL — the main visual quality lever) ==
6. Each room gets ONE floor_material AND ONE wood_palette appropriate to its purpose. NEVER mix wood colors within a room.
7. Spaces of the SAME purpose in the same map should share materials. E.g., two bedrooms in an inn → both wood_plain floor + light wood. A noble's chambers + study → both marble + dark wood. A basement + cellar → both cracked_dirt + ashen wood.
8. CONTRAST rooms by changing material when the function changes. Throne room (marble + red wood) → corridor (flat_stones + walnut) → dungeon cells (cracked_dirt + ashen).
9. wall_palette is set ONCE for the whole map. Match it to the building/theme:
   - Dungeon/crypt: earthy or slate
   - Desert temple: sandstone or redrock
   - Volcanic lair: volcanic
   - Palace/cathedral: marble
   - Default: earthy

== OBJECT PLACEMENT — DENSITY + GEOMETRY ==
10. Place 25-45 objects total. Empty rooms are unacceptable.
11. Objects should be PLACED AGAINST WALLS (within 1 tile of room edge), with the room center mostly open for movement. Exceptions: rugs and altars sit center; campfires/fireplaces against a wall; round tables central with chairs around.
12. Density by room size:
    - 3×3 room: max 4 objects
    - 4×4 / 4×5: max 6 objects
    - 5×5 / 6×5: 6-9 objects
    - Big halls (7×6+): 8-14 objects
13. Don't put objects on the exact center of small rooms unless it's a single feature object (altar, fountain, fire pit).

== ROOM-TYPE PROFILES (use these to drive material + furnishings) ==
- entrance: flat_stones / cracked_dirt floor. Objects: rocks, debris, bones, skull, candle, web, cobweb, torch, brazier. Mood: looted, abandoned.
- chamber: flat_stones / rectangular_tiles. Objects: pillar (4-6 around perimeter), candle, statue, brazier, bones, web, rug.
- corridor: flat_stones. Objects (sparse, only along edges): web, cobweb, debris, bones, candle, torch, trap, skull, rock. DO NOT put corridor objects in the actual corridor PATH between rooms.
- boss: marble / herringbone / rectangular_tiles. Objects: altar (center), statue (corners), pillar, weapon_rack, weapon_sword, weapon_axe, armor_stand, brazier, bones, treasure. Wood: red or ashen.
- treasure: marble / herringbone. Objects: chest with contents:"coins" or "mixed" (3-5 along walls), treasure piles, candle, brazier, weapon_rack, coffin. Wood: dark or red.
- shop: wood_plain or wood_scratched floor. Objects: table (centerwall), barrel, crate, bookshelf, candle, lantern, rug, chest:empty, seating. Wood: walnut.
- tavern: wood_aged or wood_scratched. Objects: table+seating arrangements, barrel along walls, crate, candle, lantern, rug, fireplace, bookshelf, bed (if upstairs). Wood: walnut.
- open: cracked_dirt / grassy_dirt / gravel. Objects: campfire (center), barrel, crate, debris, bones, table+seating, rock, tree (rare). Wood: ashen.

== MAP_TYPE FLOOR DEFAULTS (when no per-room floor_material is needed) ==
- dungeon: background_tile=stone_floor. wall_palette default earthy.
- overworld: background_tile=grass. wall_palette unused.
- town: background_tile=dirt. wall_palette default sandstone.
- interior: background_tile=wood_floor. wall_palette default earthy.

== FINAL OUTPUT ==
Output ONLY the JSON object. No prose, no markdown.`;

const apiKey = process.env.GEMINI_API_KEY;

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

  let userPrompt: string;
  if (opts.existingMap) {
    userPrompt = `Modify this existing map according to the instruction below.

Existing map JSON:
${JSON.stringify(opts.existingMap)}

User modification: ${opts.prompt}

Keep the same width and height. Preserve identity where it makes sense but apply the changes. Variation seed: ${seed}.`;
  } else {
    const mapTypeHint = opts.mapType
      ? `- map_type (suggestion): ${opts.mapType}\n`
      : `- map_type: INFER from the user prompt\n`;
    userPrompt = `Generate a fresh D&D tactical map.
${mapTypeHint}- width: ${widthHint}
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
  return sanitize(parsed, widthHint, heightHint);
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

function sanitize(m: MapData, width: number, height: number): MapData {
  const w = m.width || width;
  const h = m.height || height;
  return {
    title: m.title || "Untitled Map",
    map_type: (m.map_type || "dungeon") as MapType,
    width: w,
    height: h,
    theme: m.theme || "",
    background_tile: m.background_tile || "stone_floor",
    wall_palette: m.wall_palette,
    rooms: Array.isArray(m.rooms) ? m.rooms.filter((r) => r && r.id) : [],
    connections: Array.isArray(m.connections) ? m.connections : [],
    objects: Array.isArray(m.objects)
      ? m.objects.filter((o) => inBounds(o.x, o.y, w, h))
      : [],
    special_tiles: Array.isArray(m.special_tiles)
      ? m.special_tiles.filter(
          (s) => s && s.type !== "wall" && inBounds(s.x, s.y, w, h)
        )
      : []
  };
}

function inBounds(x: number, y: number, w: number, h: number) {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x < w && y < h;
}
