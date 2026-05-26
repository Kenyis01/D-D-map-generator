/**
 * Sprite library: structured map of {url, w, h} entries per type.
 *
 * Each sprite carries its natural tile dimensions (parsed from FA's _WxH
 * filename suffix at manifest-build time). The renderer respects these so a
 * 2x2 round table actually covers 2x2 tiles instead of being squished into 1.
 */
import { SPRITE_URLS } from "./spriteUrls";
import type {
  BackgroundTile,
  ObjectType,
  RoomType,
  SpecialTileType
} from "./types";

export interface Sprite {
  url: string;
  w: number; // natural width in tiles
  h: number; // natural height in tiles
}

export interface SpriteLibrary {
  terrain: Record<BackgroundTile, Sprite[]>;
  special: Record<SpecialTileType, Sprite[]>;
  objects: Record<ObjectType, Sprite[]>;
  roomFloor: Partial<Record<RoomType, Sprite[]>>;
}

export const SPRITES: SpriteLibrary = SPRITE_URLS;

/**
 * Deterministic variant picker. Seeded by (a, b) coords so repeat renders
 * produce identical layouts. Use roomIndex for cohesive per-room textures,
 * or tile (x,y) for per-tile randomness.
 */
export function pickVariant<T>(arr: readonly T[] | undefined, a: number, b: number): T | undefined {
  if (!arr || arr.length === 0) return undefined;
  const h = ((a * 73856093) ^ (b * 19349663)) >>> 0;
  return arr[h % arr.length];
}

/** Flatten all sprite URLs in the library — used to prefetch on first paint. */
export function allSpriteUrls(): string[] {
  const out: string[] = [];
  const groups = [SPRITES.terrain, SPRITES.special, SPRITES.objects, SPRITES.roomFloor];
  for (const g of groups) {
    for (const arr of Object.values(g)) {
      if (Array.isArray(arr)) {
        for (const s of arr) out.push(s.url);
      }
    }
  }
  return Array.from(new Set(out));
}
