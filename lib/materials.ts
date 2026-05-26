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
floor_material tokens (pick by room purpose):
  herringbone, rectangular_tiles, marble  → noble halls, throne, treasury, temple
  flat_stones                              → generic dungeon, crypt, corridor
  wood_plain                               → bedroom, library, parlor, study
  wood_scratched                           → busy tavern, inn, ship
  wood_aged                                → old tavern, abandoned shack
  cracked_dirt, plain_dirt                 → cellar, basement, dirt floor
  gravel, rocky_dirt, cave_floor          → mine, cave, rugged dungeon
  grass_long, grass_medium, grassy_dirt   → outdoor

wood_palette tokens (per ROOM, applies to chest/table/bed/door/bookshelf):
  ashen → burned/gothic   dark → noble/scholarly   light → bedroom/cottage
  red → luxurious/royal   walnut → tavern/general (default)

wall_palette tokens (per MAP, applies to walls + pillars):
  earthy (default dungeon), redrock (desert/volcanic), sandstone (desert ruin),
  slate (gothic), volcanic (demon lair), marble (palace/temple)

chest.contents tokens (optional):
  empty, coins, silver, mixed, rusty
`.trim();
