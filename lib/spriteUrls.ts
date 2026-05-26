/**
 * Sprite URL library built from public/assets/ via scripts/build-sprite-manifest.mjs.
 *
 * Assets sourced from the Forgotten Adventures Core Mapmaking Pack
 * (personal-use license, hosted from /public for use in this personal app).
 *
 * To regenerate after adding files: `npm run build:manifest`
 */
import manifest from "./sprite-manifest.json";
import type { SpriteLibrary } from "./sprites";
import type {
  BackgroundTile,
  ObjectType,
  SpecialTileType
} from "./types";

type ManifestShape = {
  terrain: Record<string, string[]>;
  objects: Record<string, string[]>;
};

const M = manifest as unknown as ManifestShape;

// Aliases — when a logical type has no direct folder, fall back to another.
const OBJECT_ALIASES: Partial<Record<ObjectType, ObjectType[]>> = {
  weapon_rack: ["weapon_sword", "weapon_axe", "armor_stand"],
  cobweb: ["web"],
  beast_bones: ["bones"]
};

const SPECIAL_FROM_TERRAIN: Partial<Record<SpecialTileType, string>> = {
  water: "water",
  lava: "lava",
  forest: "forest" // optional terrain/forest; otherwise we use tree sprites below
};

function objectSprites(type: ObjectType): string[] {
  const direct = M.objects[type] ?? [];
  const aliasUrls: string[] = [];
  for (const alias of OBJECT_ALIASES[type] ?? []) {
    for (const u of M.objects[alias] ?? []) aliasUrls.push(u);
  }
  return [...direct, ...aliasUrls];
}

function terrainSprites(name: BackgroundTile | string): string[] {
  return M.terrain[name] ?? [];
}

function specialSprites(type: SpecialTileType): string[] {
  // Prefer dedicated terrain entry if present
  const terrainKey = SPECIAL_FROM_TERRAIN[type];
  if (terrainKey) {
    const fromTerrain = M.terrain[terrainKey] ?? [];
    if (fromTerrain.length) return fromTerrain;
  }
  switch (type) {
    case "wall":
      return M.objects.wall ?? [];
    case "forest":
      // Use tree sprites as forest tiles if no dedicated forest tile texture
      return M.objects.tree ?? [];
    case "road":
      return M.terrain.dirt ?? []; // fallback approximation
    case "void":
      return []; // always procedural
    default:
      return [];
  }
}

const OBJECT_TYPES: ObjectType[] = [
  "chest","door","pillar","trap","altar","table","barrel","tree","house","well",
  "skull","bones","candle","statue","bookshelf","bed","weapon_rack","web","crate",
  "debris","campfire","rug","fountain",
  "torch","brazier","lantern","fireplace","treasure","tombstone","coffin","seating",
  "rock","bush","flower","mushroom","stairs","cobweb","weapon_sword","weapon_axe",
  "armor_stand","beast_bones"
];

const SPECIAL_TYPES: SpecialTileType[] = [
  "wall","water","lava","void","road","forest"
];

const TERRAIN_TYPES: BackgroundTile[] = [
  "stone_floor","grass","dirt","wood_floor"
];

export const SPRITE_URLS: SpriteLibrary = {
  terrain: Object.fromEntries(
    TERRAIN_TYPES.map((t) => [t, terrainSprites(t)])
  ) as SpriteLibrary["terrain"],
  special: Object.fromEntries(
    SPECIAL_TYPES.map((t) => [t, specialSprites(t)])
  ) as SpriteLibrary["special"],
  objects: Object.fromEntries(
    OBJECT_TYPES.map((t) => [t, objectSprites(t)])
  ) as SpriteLibrary["objects"],
  roomFloor: {}
};
