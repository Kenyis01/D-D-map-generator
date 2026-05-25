/**
 * Sprite library config. URLs point to CC0/CC-BY painted top-down assets
 * hosted on GitHub raw CDN.
 *
 * Multiple variants per type → renderer picks pseudo-randomly seeded by tile coord
 * for visual variation.
 *
 * NOTE: URLs are populated dynamically — see lib/spriteUrls.ts for the actual
 * sources. This file just exposes the structured config.
 */
import { SPRITE_URLS } from "./spriteUrls";
import type {
  BackgroundTile,
  ObjectType,
  RoomType,
  SpecialTileType
} from "./types";

export interface SpriteLibrary {
  terrain: Record<BackgroundTile, string[]>;
  special: Record<SpecialTileType, string[]>;
  objects: Record<ObjectType, string[]>;
  roomFloor: Partial<Record<RoomType, string[]>>;
}

export const SPRITES: SpriteLibrary = SPRITE_URLS;

/** Pick a deterministic variant for a tile based on (x,y) so re-renders are stable. */
export function pickVariant<T>(arr: readonly T[] | undefined, x: number, y: number): T | undefined {
  if (!arr || arr.length === 0) return undefined;
  const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  return arr[h % arr.length];
}

/** Flatten all URLs in the library — used to prefetch on first paint. */
export function allSpriteUrls(): string[] {
  const out: string[] = [];
  const groups: Record<string, string[]>[] = [
    SPRITES.terrain as unknown as Record<string, string[]>,
    SPRITES.special as unknown as Record<string, string[]>,
    SPRITES.objects as unknown as Record<string, string[]>,
    SPRITES.roomFloor as unknown as Record<string, string[]>
  ];
  for (const g of groups) {
    for (const arr of Object.values(g)) {
      if (Array.isArray(arr)) out.push(...arr);
    }
  }
  return Array.from(new Set(out));
}
