/**
 * Per-purpose composition rulebook (distilled from professional battle-map
 * artists — Czepeku, Tom Cartos, Beadle & Grimm, Forgotten Adventures style
 * guides, 2-Minute Tabletop tutorials).
 *
 * Each purpose declares:
 *   - REQUIRED features that always appear (with placement strategy)
 *   - OPTIONAL features with a probability roll
 *   - Lighting policy
 *
 * The placer (lib/objectPlacer.ts) consumes this. It never invents furniture
 * — it can only place what's listed here.
 */

import type { ObjectType, RoomPurpose } from "./types";

export type PlacementStrategy =
  /** One in each corner adjacent to the long wall. Head against long wall. */
  | "corner_long_wall"
  /** Sequentially along the perimeter (shuffled walk). */
  | "wall"
  /** Continuous run along one wall (longest by default). Coverage in [0,1]. */
  | "wall_continuous"
  /** Foot-of-bed: in front of and adjacent to a previously placed `bed`. */
  | "foot_of_bed"
  /** Beside the bed's head, against the same wall. */
  | "beside_bed"
  /** Wall opposite a named earlier feature. */
  | "wall_opposite"
  /** Single tile at the room's centroid. */
  | "center"
  /** Inside the room, but ≥2 tiles from any wall (D&D combat lane convention). */
  | "interior_open"
  /** Around a named anchor (e.g. seating around table). */
  | "around"
  /** Cluster in the corner farthest from the door. */
  | "cluster_far_corner"
  /** Each of the 4 corners. */
  | "corners";

export interface FeatureRule {
  type: ObjectType;
  /** Concrete count, or 0..N derived from room area. */
  count: number | { perTiles: number; min?: number; max?: number };
  placement: PlacementStrategy;
  /** For placeholders that reference another feature ("anchor"). */
  anchor?: ObjectType;
  /** Used by wall_continuous: how much of the wall length to fill. */
  coverage?: number;
  /** Used by chest etc to pass material modifier through to renderer. */
  contents?: string;
  /** Probability 0..1 — defaults to 1. */
  prob?: number;
  /** Minimum spacing between tiles where this is placed. */
  spacing?: number;
}

export interface PurposeRules {
  required: FeatureRule[];
  optional: FeatureRule[];
  /** One light per N tiles of room area (clamped to [1, 4]). */
  lightsPerTiles: number;
  /** Light source type to use (candle/torch/brazier/lantern). */
  lightType: ObjectType;
}

/** Default rulebook for unrecognised purposes. */
const DEFAULT_RULES: PurposeRules = {
  required: [{ type: "candle", count: 2, placement: "wall" }],
  optional: [
    { type: "barrel", count: 2, placement: "wall", prob: 0.5 },
    { type: "crate", count: 1, placement: "wall", prob: 0.4 }
  ],
  lightsPerTiles: 9,
  lightType: "candle"
};

export const PURPOSE_RULES: Record<RoomPurpose, PurposeRules> = {
  bedroom: {
    required: [
      { type: "bed", count: 1, placement: "corner_long_wall" },
      { type: "table", count: 1, placement: "beside_bed" },
      { type: "rug", count: 1, placement: "center" },
      { type: "chest", count: 1, placement: "foot_of_bed" }
    ],
    optional: [
      { type: "bookshelf", count: 1, placement: "wall_opposite", anchor: "bed", prob: 0.7 },
      { type: "candle", count: 1, placement: "beside_bed", prob: 0.9 },
      { type: "seating", count: 1, placement: "wall", prob: 0.6 },
      { type: "barrel", count: 1, placement: "wall", prob: 0.3 }
    ],
    lightsPerTiles: 8,
    lightType: "candle"
  },

  library: {
    required: [
      // Bookshelves cover ≥65% of perimeter (rulebook 5.1)
      { type: "bookshelf", count: 1, placement: "wall_continuous", coverage: 0.7 },
      { type: "table", count: 1, placement: "center" },
      { type: "seating", count: 2, placement: "around", anchor: "table" },
      { type: "rug", count: 1, placement: "center" }
    ],
    optional: [
      { type: "candle", count: 2, placement: "wall", prob: 1 },
      { type: "chest", count: 1, placement: "wall", prob: 0.5, contents: "empty" },
      { type: "statue", count: 1, placement: "wall", prob: 0.3 }
    ],
    lightsPerTiles: 6,
    lightType: "candle"
  },

  study: {
    required: [
      { type: "table", count: 1, placement: "wall" },
      { type: "bookshelf", count: 2, placement: "wall" }
    ],
    optional: [
      { type: "seating", count: 1, placement: "around", anchor: "table", prob: 1 },
      { type: "candle", count: 1, placement: "wall", prob: 0.9 },
      { type: "rug", count: 1, placement: "center", prob: 0.5 }
    ],
    lightsPerTiles: 10,
    lightType: "candle"
  },

  tavern_main: {
    required: [
      // Bar: continuous "table" along one long wall covering 40%.
      { type: "table", count: 1, placement: "wall_continuous", coverage: 0.4 },
      // Storage barrels piled in the far corner from the entrance (rulebook 6.6)
      { type: "barrel", count: 4, placement: "cluster_far_corner" },
      // Dining tables: 1 per ~12 interior tiles, NEVER touching walls
      { type: "table", count: { perTiles: 12, min: 2, max: 5 }, placement: "interior_open" },
      // Hearth opposite the bar (rulebook 6.5)
      { type: "fireplace", count: 1, placement: "wall_opposite", anchor: "table" },
      { type: "rug", count: 1, placement: "center" }
    ],
    optional: [
      // Seating around each dining table (the placer hooks into "around" anchor)
      { type: "seating", count: 4, placement: "around", anchor: "table", prob: 1 },
      { type: "crate", count: 2, placement: "wall", prob: 0.8 },
      { type: "bookshelf", count: 1, placement: "wall", prob: 0.4 },
      { type: "lantern", count: 2, placement: "wall", prob: 0.7 }
    ],
    lightsPerTiles: 6,
    lightType: "lantern"
  },

  kitchen: {
    required: [
      // Counter along one wall covering 60%.
      { type: "table", count: 1, placement: "wall_continuous", coverage: 0.6 },
      { type: "fireplace", count: 1, placement: "wall" },
      { type: "barrel", count: 3, placement: "wall" },
      { type: "table", count: 1, placement: "interior_open" } // prep table
    ],
    optional: [
      { type: "crate", count: 2, placement: "wall", prob: 0.8 },
      { type: "bookshelf", count: 1, placement: "wall", prob: 0.4 },
      { type: "candle", count: 2, placement: "wall", prob: 0.8 },
      { type: "seating", count: 1, placement: "around", anchor: "table", prob: 0.5 }
    ],
    lightsPerTiles: 6,
    lightType: "candle"
  },

  treasure: {
    required: [
      { type: "chest", count: { perTiles: 5, min: 3, max: 6 }, placement: "wall", contents: "coins", spacing: 2 },
      { type: "altar", count: 1, placement: "center" },
      { type: "rug", count: 1, placement: "center" },
      { type: "brazier", count: 2, placement: "corners" }
    ],
    optional: [
      { type: "candle", count: 2, placement: "wall", prob: 0.9 },
      { type: "treasure", count: 2, placement: "wall", prob: 0.7 },
      { type: "weapon_rack", count: 1, placement: "wall", prob: 0.6 },
      { type: "statue", count: 1, placement: "wall", prob: 0.5 }
    ],
    lightsPerTiles: 5,
    lightType: "brazier"
  },

  throne: {
    required: [
      { type: "statue", count: 1, placement: "wall" }, // throne stand-in
      { type: "rug", count: 1, placement: "center" },
      { type: "pillar", count: 4, placement: "corners" }
    ],
    optional: [
      { type: "brazier", count: 2, placement: "corners", prob: 0.9 },
      { type: "weapon_rack", count: 1, placement: "wall", prob: 0.5 },
      { type: "altar", count: 1, placement: "wall_opposite", anchor: "rug", prob: 0.4 }
    ],
    lightsPerTiles: 6,
    lightType: "brazier"
  },

  boss: {
    required: [
      { type: "altar", count: 1, placement: "center" },
      { type: "pillar", count: 4, placement: "corners" }
    ],
    optional: [
      { type: "skull", count: 3, placement: "wall", prob: 0.7 },
      { type: "bones", count: 2, placement: "wall", prob: 0.7 },
      { type: "brazier", count: 2, placement: "wall", prob: 0.8 },
      { type: "weapon_rack", count: 1, placement: "wall", prob: 0.4 },
      { type: "statue", count: 1, placement: "wall", prob: 0.4 }
    ],
    lightsPerTiles: 5,
    lightType: "brazier"
  },

  crypt: {
    required: [
      { type: "coffin", count: { perTiles: 10, min: 1, max: 4 }, placement: "wall", spacing: 1 },
      { type: "tombstone", count: 2, placement: "wall" }
    ],
    optional: [
      { type: "skull", count: 3, placement: "wall", prob: 0.7 },
      { type: "bones", count: 2, placement: "wall", prob: 0.6 },
      { type: "cobweb", count: 2, placement: "corners", prob: 0.8 },
      { type: "candle", count: 2, placement: "wall", prob: 0.6 }
    ],
    lightsPerTiles: 9,
    lightType: "candle"
  },

  shrine: {
    required: [
      { type: "altar", count: 1, placement: "center" },
      { type: "candle", count: 4, placement: "corners" }
    ],
    optional: [
      { type: "statue", count: 2, placement: "wall", prob: 0.7 },
      { type: "rug", count: 1, placement: "center", prob: 0.4 }
    ],
    lightsPerTiles: 7,
    lightType: "candle"
  },

  chamber: {
    required: [
      { type: "pillar", count: 4, placement: "corners" },
      { type: "rug", count: 1, placement: "center" }
    ],
    optional: [
      { type: "brazier", count: 2, placement: "wall", prob: 0.7 },
      { type: "candle", count: 2, placement: "wall", prob: 0.8 },
      { type: "bones", count: 1, placement: "wall", prob: 0.5 },
      { type: "statue", count: 1, placement: "wall", prob: 0.5 },
      { type: "bookshelf", count: 1, placement: "wall", prob: 0.4 },
      { type: "table", count: 1, placement: "wall", prob: 0.4 }
    ],
    lightsPerTiles: 6,
    lightType: "candle"
  },

  entrance: {
    required: [
      { type: "torch", count: 2, placement: "wall" },
      { type: "debris", count: 2, placement: "wall" }
    ],
    optional: [
      { type: "bones", count: 1, placement: "wall", prob: 0.6 },
      { type: "rock", count: 2, placement: "wall", prob: 0.5 },
      { type: "cobweb", count: 2, placement: "corners", prob: 0.7 },
      { type: "skull", count: 1, placement: "wall", prob: 0.4 },
      { type: "stairs", count: 1, placement: "wall", prob: 0.35 }
    ],
    lightsPerTiles: 8,
    lightType: "torch"
  },

  corridor: {
    required: [],
    optional: [
      { type: "debris", count: 1, placement: "wall", prob: 0.5 },
      { type: "cobweb", count: 1, placement: "corners", prob: 0.4 }
    ],
    lightsPerTiles: 5,
    lightType: "torch"
  },

  shop: {
    required: [
      { type: "table", count: 1, placement: "wall_continuous", coverage: 0.4 },
      { type: "bookshelf", count: 2, placement: "wall" },
      { type: "barrel", count: 2, placement: "wall" },
      { type: "crate", count: 2, placement: "wall" }
    ],
    optional: [
      { type: "rug", count: 1, placement: "center", prob: 0.6 },
      { type: "chest", count: 1, placement: "wall", contents: "empty", prob: 0.7 },
      { type: "lantern", count: 2, placement: "wall", prob: 0.8 },
      { type: "seating", count: 1, placement: "wall", prob: 0.6 }
    ],
    lightsPerTiles: 6,
    lightType: "lantern"
  },

  cellar: {
    required: [
      { type: "barrel", count: { perTiles: 6, min: 2, max: 6 }, placement: "wall" }
    ],
    optional: [
      { type: "crate", count: 2, placement: "wall", prob: 0.8 },
      { type: "cobweb", count: 1, placement: "corners", prob: 0.8 },
      { type: "candle", count: 1, placement: "wall", prob: 0.6 }
    ],
    lightsPerTiles: 12,
    lightType: "candle"
  },

  storage: {
    required: [
      { type: "crate", count: { perTiles: 7, min: 2, max: 6 }, placement: "wall" },
      { type: "barrel", count: 2, placement: "wall" }
    ],
    optional: [
      { type: "chest", count: 1, placement: "wall", contents: "empty", prob: 0.6 }
    ],
    lightsPerTiles: 12,
    lightType: "candle"
  },

  barracks: {
    required: [
      { type: "bed", count: { perTiles: 8, min: 2, max: 4 }, placement: "wall", spacing: 1 },
      { type: "weapon_rack", count: 1, placement: "wall" }
    ],
    optional: [
      { type: "chest", count: 2, placement: "wall", prob: 0.7 },
      { type: "table", count: 1, placement: "interior_open", prob: 0.6 }
    ],
    lightsPerTiles: 10,
    lightType: "torch"
  },

  open: {
    required: [{ type: "campfire", count: 1, placement: "center" }],
    optional: [
      { type: "barrel", count: 2, placement: "wall", prob: 0.5 },
      { type: "rock", count: 3, placement: "wall", prob: 0.6 },
      { type: "tree", count: 1, placement: "corners", prob: 0.3 }
    ],
    lightsPerTiles: 14,
    lightType: "torch"
  }
};

export function rulesFor(purpose: string): PurposeRules {
  return (PURPOSE_RULES as Record<string, PurposeRules>)[purpose] ?? DEFAULT_RULES;
}

/** Resolves a `count` value (number or per-tiles) given the room area. */
export function resolveCount(
  rule: FeatureRule,
  roomArea: number
): number {
  if (typeof rule.count === "number") return rule.count;
  const raw = Math.floor(roomArea / rule.count.perTiles);
  const min = rule.count.min ?? 1;
  const max = rule.count.max ?? Infinity;
  return Math.max(min, Math.min(max, raw));
}
