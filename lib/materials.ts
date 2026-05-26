/**
 * Semantic material catalog extracted from the Forgotten Adventures filenames.
 *
 * The LLM picks a material per room (e.g. `floor_material: "herringbone"`,
 * `wood_palette: "walnut"`) and the renderer FILTERS the sprite variants by
 * regex on the URL. This makes each room thematically cohesive — a throne
 * room's chest, table, and bookshelf all share the same wood color.
 */

import type { Sprite } from "./sprites";

// ============================================================
// Floor material catalog
// ============================================================
export type FloorMaterial =
  // stone variants
  | "herringbone"
  | "rectangular_tiles"
  | "flat_stones"
  | "marble"
  // wood variants
  | "wood_aged"
  | "wood_scratched"
  | "wood_plain"
  // dirt/cave variants
  | "cracked_dirt"
  | "gravel"
  | "rocky_dirt"
  | "cave_floor"
  | "plain_dirt"
  | "grassy_dirt"
  // grass variants
  | "grass_long"
  | "grass_medium";

const FLOOR_PATTERNS: Record<FloorMaterial, RegExp> = {
  herringbone: /Herringbone/i,
  rectangular_tiles: /Rectangular_Tiles/i,
  flat_stones: /Flat_Stones/i,
  marble: /Marble/i,
  wood_aged: /Wood_Damage|Wood_Aged/i,
  wood_scratched: /Wood_(Floor_)?Scratches/i,
  wood_plain: /Wood_Floor(?!_Scratches|_Damage)/i,
  cracked_dirt: /Cracked_Dirt/i,
  gravel: /Gravel/i,
  rocky_dirt: /Rocky_Dirt/i,
  cave_floor: /Cave_Floor/i,
  plain_dirt: /Dirt_[A-D]_/i,
  grassy_dirt: /Grassy_Dirt/i,
  grass_long: /Grass_Long|Grass.*Long/i,
  grass_medium: /Grass_Medium|Grass.*Medium/i
};

// ============================================================
// Wood palette (for furniture: chests, tables, beds, doors, bookshelves)
// ============================================================
export type WoodPalette =
  | "ashen" // burnt / charred
  | "dark" // deep walnut
  | "light" // oak / pine
  | "red" // cherry / redwood
  | "walnut"; // medium brown

const WOOD_PATTERNS: Record<WoodPalette, RegExp> = {
  ashen: /Ashen/i,
  dark: /Dark/i,
  light: /Light/i,
  red: /_Red_|_Red\.|Redwood/i,
  walnut: /Walnut/i
};

// ============================================================
// Stone palette (for walls and pillars)
// ============================================================
export type StonePalette =
  | "earthy"
  | "redrock"
  | "sandstone"
  | "slate"
  | "volcanic"
  | "marble";

const STONE_PATTERNS: Record<StonePalette, RegExp> = {
  earthy: /Earthy/i,
  redrock: /Redrock|Red_?Rock/i,
  sandstone: /Sandstone/i,
  slate: /Slate/i,
  volcanic: /Volcanic/i,
  marble: /Marble/i
};

// ============================================================
// Chest variants (loot context)
// ============================================================
export type ChestContents = "empty" | "coins" | "silver" | "mixed" | "rusty";

const CHEST_PATTERNS: Record<ChestContents, RegExp> = {
  empty: /Empty/i,
  coins: /Coins_Gold|Treasure.*Coins(?!.*Silver)/i,
  silver: /Coins_Silver|Treasure.*Silver/i,
  mixed: /Mixed/i,
  rusty: /Rusty/i
};

// ============================================================
// Filter helpers
// ============================================================

/** Filter sprites by regex match on URL. Returns full pool if filter yields nothing. */
export function filterByPattern(
  sprites: Sprite[],
  pattern: RegExp | undefined
): Sprite[] {
  if (!sprites.length || !pattern) return sprites;
  const filtered = sprites.filter((s) => pattern.test(s.url));
  return filtered.length > 0 ? filtered : sprites;
}

export function filterByFloorMaterial(
  sprites: Sprite[],
  material: FloorMaterial | string | undefined
): Sprite[] {
  if (!material) return sprites;
  const pat = FLOOR_PATTERNS[material as FloorMaterial];
  return filterByPattern(sprites, pat);
}

export function filterByWoodPalette(
  sprites: Sprite[],
  palette: WoodPalette | string | undefined
): Sprite[] {
  if (!palette) return sprites;
  const pat = WOOD_PATTERNS[palette as WoodPalette];
  return filterByPattern(sprites, pat);
}

export function filterByStonePalette(
  sprites: Sprite[],
  palette: StonePalette | string | undefined
): Sprite[] {
  if (!palette) return sprites;
  const pat = STONE_PATTERNS[palette as StonePalette];
  return filterByPattern(sprites, pat);
}

export function filterByChestContents(
  sprites: Sprite[],
  contents: ChestContents | string | undefined
): Sprite[] {
  if (!contents) return sprites;
  const pat = CHEST_PATTERNS[contents as ChestContents];
  return filterByPattern(sprites, pat);
}

// ============================================================
// Catalog exposed to LLM prompt (kept compact for context budget)
// ============================================================
export const MATERIAL_CATALOG_FOR_LLM = `
FLOOR_MATERIALS by use case:
  - "herringbone"        — polished diagonal stone pattern. Use for: noble halls, throne rooms, temples
  - "rectangular_tiles"  — large cut stone slabs. Use for: castles, formal interiors, banks, government
  - "flat_stones"        — irregular cobbled stone. Use for: crypts, generic dungeons, old corridors
  - "marble"             — luxurious polished marble. Use for: palaces, treasuries, royal chambers
  - "wood_aged"          — worn wooden planks with damage. Use for: old taverns, abandoned shacks
  - "wood_scratched"     — scuffed wooden planks. Use for: working taverns, busy inns, ship interiors
  - "wood_plain"         — clean wooden planks. Use for: bedrooms, parlors, libraries, studies
  - "cracked_dirt"       — cracked dry earth. Use for: cellars, ruins, exposed cave passages
  - "gravel"             — loose gravel/pebbles. Use for: mines, courtyards, ruins
  - "rocky_dirt"         — rocky uneven terrain. Use for: mountain caves, rugged dungeons
  - "cave_floor"         — natural cave floor. Use for: underground caverns, natural caves
  - "plain_dirt"         — plain earth. Use for: stables, basements, dirt cellars
  - "grassy_dirt"        — patchy grass on dirt. Use for: outdoor edges, garden paths
  - "grass_long"         — tall grass. Use for: wilderness, fields
  - "grass_medium"       — short grass. Use for: lawns, courtyards

WOOD_PALETTES (apply per ROOM to chests/tables/beds/doors/bookshelves so they match):
  - "ashen"   — charred dark gray wood. Use for: burned ruins, gothic crypts, sinister rooms
  - "dark"    — deep walnut. Use for: noble libraries, scholarly studies, formal dining
  - "light"   — pale oak/pine. Use for: bedrooms, kitchens, modest cottages
  - "red"     — cherry / redwood. Use for: luxurious manors, royal chambers
  - "walnut"  — medium brown. Use for: taverns, inns, general purpose (DEFAULT)

STONE_PALETTES (apply per MAP for walls and pillars):
  - "earthy"     — brown weathered stone. Use for: typical dungeons (DEFAULT)
  - "redrock"    — red sandstone. Use for: desert temples, volcanic regions
  - "sandstone"  — pale yellow stone. Use for: desert cities, ancient ruins
  - "slate"      — dark gray. Use for: gothic strongholds, mountain fortresses
  - "volcanic"   — black volcanic rock. Use for: demon lairs, fire temples
  - "marble"     — white polished. Use for: palaces, divine temples

CHEST_CONTENTS (optional per chest):
  - "empty"  — open empty chest. Use for: looted rooms, mimics
  - "coins"  — full of gold coins. Use for: treasure rooms, vaults
  - "silver" — silver coins. Use for: minor stashes
  - "mixed"  — gems + coins. Use for: pirate hoards, dragon nests
  - "rusty"  — old corroded chest. Use for: abandoned dungeons, sunken ships
`.trim();
