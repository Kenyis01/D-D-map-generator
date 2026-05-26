/**
 * Sprite URL library built from public/assets/ via scripts/build-sprite-manifest.mjs.
 *
 * Assets sourced from the Forgotten Adventures Core Mapmaking Pack
 * (personal-use license, hosted from /public for use in this personal app).
 *
 * To regenerate after adding files: `npm run build:manifest`
 */
import manifest from "./sprite-manifest.json";
import type { Sprite, SpriteLibrary } from "./sprites";
import type {
  BackgroundTile,
  ObjectType,
  SpecialTileType
} from "./types";

type ManifestShape = {
  terrain: Record<string, Sprite[]>;
  objects: Record<string, Sprite[]>;
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
  forest: "forest"
};

function get(category: Record<string, Sprite[]>, key: string): Sprite[] {
  return category[key] ?? [];
}

function objectSprites(type: ObjectType): Sprite[] {
  const direct = get(M.objects, type);
  const aliasSprites: Sprite[] = [];
  for (const alias of OBJECT_ALIASES[type] ?? []) {
    for (const s of get(M.objects, alias)) aliasSprites.push(s);
  }
  return [...direct, ...aliasSprites];
}

function terrainSprites(name: BackgroundTile | string): Sprite[] {
  return get(M.terrain, name);
}

function specialSprites(type: SpecialTileType): Sprite[] {
  if (type === "wall") {
    // FA walls are modular (Corner/Straight/Joint/Connector). Random mixing
    // looks chaotic. Filter to only Straight 1x1 pieces for a clean uniform
    // wall look. Falls back to all walls if the filter is too restrictive.
    const all = get(M.objects, "wall");
    const straights = all.filter((s) =>
      /Straight_[A-Z]?_?1x1\./i.test(s.url) ||
      /Straight_.*_1x1\./i.test(s.url)
    );
    return straights.length > 0 ? straights : all;
  }
  const terrainKey = SPECIAL_FROM_TERRAIN[type];
  if (terrainKey) {
    const fromTerrain = get(M.terrain, terrainKey);
    if (fromTerrain.length) return fromTerrain;
  }
  switch (type) {
    case "forest":
      return get(M.objects, "tree");
    case "road":
      return get(M.terrain, "dirt");
    case "void":
      return [];
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
