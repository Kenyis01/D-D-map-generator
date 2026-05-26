"use client";

import { getSpriteSync, loadSprite, prefetch, spriteStats } from "./spriteLoader";
import { allSpriteUrls, pickVariant, SPRITES, type Sprite } from "./sprites";
import {
  filterByFloorMaterial,
  filterByWoodPalette,
  filterByStonePalette,
  filterByChestContents
} from "./materials";
import type {
  BackgroundTile,
  MapData,
  MapObject,
  MapRoom,
  ObjectType,
  RoomType,
  SpecialTileType
} from "./types";

// ============================================================
// Palette (fallbacks when no sprite is available)
// ============================================================
const TILE_COLORS: Record<BackgroundTile | SpecialTileType, string> = {
  stone_floor: "#3a3a4a",
  grass: "#4a7c59",
  dirt: "#8b6c42",
  wood_floor: "#8b7355",
  wall: "#1a1a2a",
  water: "#2a5f8f",
  lava: "#cc4400",
  void: "#0a0a0a",
  road: "#c4a882",
  forest: "#2d5a27"
};

const ROOM_TINT: Record<RoomType, string> = {
  entrance: "rgba(120,120,160,0.22)",
  corridor: "rgba(60,60,90,0.18)",
  chamber: "rgba(110,100,150,0.20)",
  boss: "rgba(180,70,70,0.32)",
  treasure: "rgba(220,180,80,0.32)",
  shop: "rgba(140,120,70,0.30)",
  tavern: "rgba(180,140,80,0.32)",
  open: "rgba(140,110,70,0.24)"
};

const ROOM_BADGE_COLOR: Record<RoomType, string> = {
  entrance: "#a8a8c0",
  corridor: "#888",
  chamber: "#c0c0e0",
  boss: "#e26060",
  treasure: "#f0c14a",
  shop: "#c8a868",
  tavern: "#d8a060",
  open: "#c0a070"
};

// ============================================================
// Public API
// ============================================================

interface RenderOptions {
  pixelRatio?: number;
  tileSize?: number;
  showGrid?: boolean;
  /** Draw room number badges */
  showBadges?: boolean;
}

export function computeTileSize(
  canvasWidth: number,
  canvasHeight: number,
  mapWidth: number,
  mapHeight: number
): number {
  return Math.floor(Math.min(canvasWidth / mapWidth, canvasHeight / mapHeight));
}

export function warmSpriteCache() {
  prefetch(allSpriteUrls());
}

export function renderMap(
  canvas: HTMLCanvasElement,
  map: MapData,
  opts: RenderOptions = {}
) {
  const dpr = opts.pixelRatio ?? (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const displayW = canvas.clientWidth || canvas.width;
  const displayH = canvas.clientHeight || canvas.height;

  const tileSize =
    opts.tileSize ?? computeTileSize(displayW, displayH, map.width, map.height);
  const mapPxW = tileSize * map.width;
  const mapPxH = tileSize * map.height;

  canvas.width = Math.floor(mapPxW * dpr);
  canvas.height = Math.floor(mapPxH * dpr);
  canvas.style.width = `${mapPxW}px`;
  canvas.style.height = `${mapPxH}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const computed = computeLayers(map);
  paint(ctx, map, tileSize, computed, opts.showGrid ?? true, opts.showBadges ?? true);

  // Only load the sprites this specific map needs (not the whole library)
  const needed = spritesUsedByMap(map, computed);
  if (typeof console !== "undefined") {
    console.info(`[map] requesting ${needed.length} sprites`);
  }
  Promise.all(needed.map(loadSprite)).then(() => {
    if (typeof console !== "undefined") {
      const s = spriteStats();
      console.info(`[map] sprites loaded: ${s.loaded} ok, ${s.failed} failed, ${s.requested} requested`);
    }
    const ctx2 = canvas.getContext("2d");
    if (!ctx2) return;
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2.imageSmoothingEnabled = false;
    paint(ctx2, map, tileSize, computed, opts.showGrid ?? true, opts.showBadges ?? true);
  });
}

export async function renderToExportCanvas(
  map: MapData,
  tileSize = 64,
  opts: { showGrid?: boolean } = {}
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = map.width * tileSize;
  canvas.height = map.height * tileSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const computed = computeLayers(map);
  await Promise.all(spritesUsedByMap(map, computed).map(loadSprite));
  paint(ctx, map, tileSize, computed, opts.showGrid ?? true, false);
  return canvas;
}

/** Walks the map and returns the unique set of sprite URLs that will be drawn. */
function spritesUsedByMap(map: MapData, layers: ComputedLayers): string[] {
  const urls = new Set<string>();
  const mapSeed = hashString(map.title || "x");

  // Wall sprite (used for both dungeon background and computed walls)
  const wallPool = filterByStonePalette(SPRITES.special.wall, map.wall_palette);
  if (wallPool.length > 0) {
    urls.add(wallPool[mapSeed % wallPool.length].url);
  }

  // Outdoor background terrain (uniform)
  const isDungeon = map.map_type === "dungeon";
  const bgVariants = SPRITES.terrain[map.background_tile];
  if (!isDungeon && bgVariants && bgVariants.length > 0) {
    urls.add(bgVariants[mapSeed % bgVariants.length].url);
  }

  // Per-room floor (filtered by floor_material)
  for (let i = 0; i < map.rooms.length; i++) {
    const room = map.rooms[i];
    const baseCategory = floorCategoryFor(room.floor_material, map.background_tile);
    const baseVariants = SPRITES.terrain[baseCategory] ?? [];
    const pool = filterByFloorMaterial(baseVariants, room.floor_material);
    if (pool.length > 0) {
      urls.add(pool[(mapSeed + i * 17) % pool.length].url);
    }
  }

  // Corridor floor (map default)
  const corridorVariants = SPRITES.terrain[map.background_tile] ?? [];
  if (corridorVariants.length > 0) {
    urls.add(corridorVariants[(mapSeed + 7) % corridorVariants.length].url);
  }

  // LLM-defined special tiles (water, lava, road, forest)
  for (const s of map.special_tiles) {
    if (s.type === "wall") continue;
    const variants = SPRITES.special[s.type];
    if (variants && variants.length) {
      const v = pickVariant(variants, s.x, s.y);
      if (v) urls.add(v.url);
    }
  }

  // Objects (with same material filtering as drawObjects)
  for (const o of map.objects) {
    let pool = SPRITES.objects[o.type as ObjectType] ?? [];
    if (pool.length === 0) continue;
    if (WOOD_TYPED.has(o.type as ObjectType)) {
      const ri = layers.roomIndex[o.y * map.width + o.x];
      const room = ri >= 0 ? map.rooms[ri] : undefined;
      if (room?.wood_palette) pool = filterByWoodPalette(pool, room.wood_palette);
    }
    if (o.type === "chest" && o.contents) {
      pool = filterByChestContents(pool, o.contents);
    }
    if (o.type === "pillar" && map.wall_palette) {
      pool = filterByStonePalette(pool, map.wall_palette);
    }
    const v = pool.length > 0 ? pickVariant(pool, o.x, o.y) : undefined;
    if (v) urls.add(v.url);
  }

  return Array.from(urls);
}

// ============================================================
// Compute layers: interior tiles (rooms + corridors) + walls
// ============================================================

interface ComputedLayers {
  interior: Uint8Array;          // 1 = walkable
  corridor: Uint8Array;          // 1 = corridor tile
  roomIndex: Int16Array;         // index of room owning this tile, -1 if none
  walls: { x: number; y: number }[];
}

function computeLayers(map: MapData): ComputedLayers {
  const W = map.width, H = map.height;
  const interior = new Uint8Array(W * H);
  const corridor = new Uint8Array(W * H);
  const roomIndex = new Int16Array(W * H).fill(-1);
  const idx = (x: number, y: number) => y * W + x;
  const inBounds = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < W && y < H;

  // Mark room tiles
  map.rooms.forEach((r, i) => {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (inBounds(x, y)) {
          interior[idx(x, y)] = 1;
          roomIndex[idx(x, y)] = i;
        }
      }
    }
  });

  // Build corridor tiles between connected rooms (L-shape paths)
  const byId = new Map<string, MapRoom>();
  for (const r of map.rooms) byId.set(r.id, r);

  for (const c of map.connections) {
    const a = byId.get(c.from);
    const b = byId.get(c.to);
    if (!a || !b) continue;
    const ax = Math.floor(a.x + a.w / 2);
    const ay = Math.floor(a.y + a.h / 2);
    const bx = Math.floor(b.x + b.w / 2);
    const by = Math.floor(b.y + b.h / 2);

    // L-shape: horizontal first then vertical (deterministic)
    const horizFirst = ((c.from + c.to).length & 1) === 0;
    if (horizFirst) {
      stampLine(ax, ay, bx, ay);
      stampLine(bx, ay, bx, by);
    } else {
      stampLine(ax, ay, ax, by);
      stampLine(ax, by, bx, by);
    }
  }

  function stampLine(x1: number, y1: number, x2: number, y2: number) {
    if (x1 === x2) {
      const [a, b] = y1 < y2 ? [y1, y2] : [y2, y1];
      for (let y = a; y <= b; y++) {
        if (inBounds(x1, y)) {
          const i = idx(x1, y);
          if (!interior[i]) corridor[i] = 1;
          interior[i] = 1;
        }
      }
    } else if (y1 === y2) {
      const [a, b] = x1 < x2 ? [x1, x2] : [x2, x1];
      for (let x = a; x <= b; x++) {
        if (inBounds(x, y1)) {
          const i = idx(x, y1);
          if (!interior[i]) corridor[i] = 1;
          interior[i] = 1;
        }
      }
    }
  }

  // Compute wall tiles = any non-interior tile orthogonally adjacent to an interior tile
  const walls: { x: number; y: number }[] = [];
  const wallSet = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (interior[idx(x, y)]) continue;
      const i = idx(x, y);
      const neighborInterior =
        (x > 0 && interior[idx(x - 1, y)]) ||
        (x < W - 1 && interior[idx(x + 1, y)]) ||
        (y > 0 && interior[idx(x, y - 1)]) ||
        (y < H - 1 && interior[idx(x, y + 1)]) ||
        // include diagonals so corners get walled too
        (x > 0 && y > 0 && interior[idx(x - 1, y - 1)]) ||
        (x < W - 1 && y > 0 && interior[idx(x + 1, y - 1)]) ||
        (x > 0 && y < H - 1 && interior[idx(x - 1, y + 1)]) ||
        (x < W - 1 && y < H - 1 && interior[idx(x + 1, y + 1)]);
      if (neighborInterior) {
        wallSet[i] = 1;
        walls.push({ x, y });
      }
    }
  }

  return { interior, corridor, roomIndex, walls };
}

// ============================================================
// Paint pipeline
// ============================================================

function paint(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  ts: number,
  layers: ComputedLayers,
  showGrid: boolean,
  showBadges: boolean
) {
  // For each render, pick a SINGLE wall sprite for the whole map so the
  // "carved-in-rock" background and the wall outlines use the same look.
  // Filter by wall_palette if the LLM specified one for thematic cohesion.
  const mapSeed = hashString(map.title || "x");
  const wallPool = filterByStonePalette(SPRITES.special.wall, map.wall_palette);
  const wallSprite =
    wallPool.length > 0 ? wallPool[mapSeed % wallPool.length] : undefined;

  drawBackground(ctx, map, ts, layers, wallSprite, mapSeed);
  drawCorridorAndRoomFloors(ctx, map, ts, layers, mapSeed);
  drawScatterDecoration(ctx, map, ts, layers);
  drawRoomTint(ctx, map, ts);
  drawSpecialTiles(ctx, map, ts, layers);
  drawWalls(ctx, map, ts, layers, wallSprite);
  drawObjects(ctx, map, ts, layers);
  if (showGrid) drawGrid(ctx, map, ts);
  drawVignette(ctx, map, ts);
  if (showBadges) drawRoomBadges(ctx, map, ts);
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/**
 * Maps a semantic floor material (e.g. "marble", "wood_aged") back to the
 * BackgroundTile category that contains its sprites. Lets a single room
 * switch its terrain category independently of the map's default.
 */
function floorCategoryFor(
  material: string | undefined,
  fallback: BackgroundTile
): BackgroundTile {
  if (!material) return fallback;
  if (/wood/i.test(material)) return "wood_floor";
  if (/grass/i.test(material)) return "grass";
  if (
    /dirt|gravel|rocky|cave_floor|grassy_dirt/i.test(material)
  )
    return "dirt";
  if (/herringbone|rectangular_tiles|flat_stones|marble/i.test(material))
    return "stone_floor";
  return fallback;
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  ts: number,
  layers: ComputedLayers,
  wallSprite: Sprite | undefined,
  mapSeed: number
) {
  const isDungeon = map.map_type === "dungeon";
  if (isDungeon) {
    // "Carved into rock" look: fill ALL non-interior tiles with the wall
    // sprite. This gives the dungeon a solid stone surrounding instead of
    // floating rooms in a black void.
    ctx.fillStyle = "#0a0a14";
    ctx.fillRect(0, 0, ts * map.width, ts * map.height);
    const wallImg = wallSprite ? getCachedSprite(wallSprite.url) : null;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (layers.interior[y * map.width + x]) continue;
        if (wallImg) {
          ctx.drawImage(wallImg, x * ts, y * ts, ts, ts);
        } else {
          proceduralWallTile(ctx, x, y, ts);
        }
      }
    }
    return;
  }
  // Outdoor maps: tile a SINGLE terrain variant across the whole map.
  // (We were picking per-tile randomly which mixed dirt + grass + cracked
  // looking nothing like a real meadow / town floor.)
  const variants = SPRITES.terrain[map.background_tile];
  const bgSprite = variants && variants.length
    ? variants[mapSeed % variants.length]
    : undefined;
  const bgImg = bgSprite ? getCachedSprite(bgSprite.url) : null;
  if (bgImg) {
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        ctx.drawImage(bgImg, x * ts, y * ts, ts, ts);
      }
    }
  } else {
    ctx.fillStyle = TILE_COLORS[map.background_tile] ?? "#3a3a4a";
    ctx.fillRect(0, 0, ts * map.width, ts * map.height);
  }
}

function drawSpecialTiles(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  ts: number,
  layers: ComputedLayers
) {
  for (const s of map.special_tiles) {
    if (s.type === "wall") continue; // computed walls handled separately
    const variants = SPRITES.special[s.type];
    const v = variants ? pickVariant(variants, s.x, s.y) : undefined;
    const img = v ? getCachedSprite(v.url) : null;
    if (img) {
      ctx.drawImage(img, s.x * ts, s.y * ts, ts, ts);
    } else {
      proceduralSpecial(ctx, s.x, s.y, s.type, ts);
    }
  }
}

function drawCorridorAndRoomFloors(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  ts: number,
  layers: ComputedLayers,
  mapSeed: number
) {
  // Pick ONE terrain variant per room. The pool is FILTERED by the room's
  // declared floor_material — so a room asking for "marble" only picks marble
  // sprites, "cracked_dirt" only cracked dirt, etc.
  const fallbackColor = TILE_COLORS[map.background_tile] ?? "#3a3a4a";

  const perRoom: (Sprite | undefined)[] = [];
  for (let i = 0; i < map.rooms.length; i++) {
    const room = map.rooms[i];
    // The room can switch its base terrain via floor_material's category hint.
    // Default to the map's background_tile category.
    const baseCategory = floorCategoryFor(room.floor_material, map.background_tile);
    const baseVariants = SPRITES.terrain[baseCategory] ?? [];
    const pool = filterByFloorMaterial(baseVariants, room.floor_material);
    perRoom[i] = pool.length > 0 ? pool[(mapSeed + i * 17) % pool.length] : undefined;
  }

  // Corridors use the map's default terrain, no material filter (neutral).
  const corridorVariants = SPRITES.terrain[map.background_tile] ?? [];
  const corridorSprite: Sprite | undefined =
    corridorVariants.length > 0
      ? corridorVariants[(mapSeed + 7) % corridorVariants.length]
      : undefined;

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      if (!layers.interior[i]) continue;
      const ri = layers.roomIndex[i];
      const s = ri >= 0 ? perRoom[ri] : corridorSprite;
      const img = s ? getCachedSprite(s.url) : null;
      if (img) {
        ctx.drawImage(img, x * ts, y * ts, ts, ts);
      } else {
        ctx.fillStyle = fallbackColor;
        ctx.fillRect(x * ts, y * ts, ts, ts);
      }
    }
  }
}

function drawScatterDecoration(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  ts: number,
  layers: ComputedLayers
) {
  // Small marks on floor: cracks, moss, debris specks. Seeded by tile coord.
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      if (!layers.interior[i]) continue;
      const seed = ((x * 1597) ^ (y * 51749)) >>> 0;
      const kind = seed % 100;
      ctx.save();
      const px = x * ts, py = y * ts;
      if (kind < 8) {
        // crack
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        const sx = px + ((seed >> 4) % ts);
        const sy = py + ((seed >> 8) % ts);
        ctx.moveTo(sx, sy);
        for (let k = 0; k < 3; k++) {
          ctx.lineTo(
            sx + (((seed >> (k * 3 + 5)) & 15) - 7) * (ts / 20),
            sy + (((seed >> (k * 3 + 9)) & 15) - 7) * (ts / 20)
          );
        }
        ctx.stroke();
      } else if (kind < 14) {
        // moss
        ctx.fillStyle = "rgba(80,140,60,0.32)";
        const mx = px + ((seed >> 6) % (ts - 8)) + 4;
        const my = py + ((seed >> 10) % (ts - 8)) + 4;
        ctx.beginPath();
        ctx.arc(mx, my, ts * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(40,90,30,0.32)";
        ctx.beginPath();
        ctx.arc(mx + ts * 0.08, my + ts * 0.05, ts * 0.08, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind < 18) {
        // debris specks
        ctx.fillStyle = "rgba(40,30,20,0.55)";
        for (let k = 0; k < 4; k++) {
          const dx = px + ((seed >> (k * 2 + 5)) & 31) * (ts / 32);
          const dy = py + ((seed >> (k * 2 + 11)) & 31) * (ts / 32);
          ctx.fillRect(dx, dy, 2, 2);
        }
      } else if (kind < 21) {
        // dark stain (blood/water)
        ctx.fillStyle = "rgba(60,15,15,0.25)";
        const sx = px + ((seed >> 14) % (ts - 12)) + 6;
        const sy = py + ((seed >> 16) % (ts - 12)) + 6;
        ctx.beginPath();
        ctx.ellipse(sx, sy, ts * 0.18, ts * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

function drawRoomTint(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  ts: number
) {
  for (const r of map.rooms) {
    ctx.fillStyle = ROOM_TINT[r.type] ?? "rgba(0,0,0,0)";
    ctx.fillRect(r.x * ts, r.y * ts, r.w * ts, r.h * ts);
  }
}

function drawWalls(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  ts: number,
  layers: ComputedLayers,
  wallSprite: Sprite | undefined
) {
  const wallImg = wallSprite ? getCachedSprite(wallSprite.url) : null;
  for (const w of layers.walls) {
    if (wallImg) {
      ctx.drawImage(wallImg, w.x * ts, w.y * ts, ts, ts);
    } else {
      proceduralWallTile(ctx, w.x, w.y, ts);
    }
  }
  // Inner edge shadow on walkable tiles adjacent to walls
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      if (!layers.interior[i]) continue;
      // top wall shadow
      if (y > 0 && !layers.interior[(y - 1) * map.width + x]) {
        ctx.fillRect(x * ts, y * ts, ts, Math.max(2, ts * 0.08));
      }
      // left wall shadow
      if (x > 0 && !layers.interior[y * map.width + (x - 1)]) {
        ctx.fillRect(x * ts, y * ts, Math.max(2, ts * 0.08), ts);
      }
    }
  }
  ctx.restore();
}

function proceduralWallTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ts: number
) {
  const px = x * ts, py = y * ts;
  ctx.save();
  // dark base
  ctx.fillStyle = "#22202c";
  ctx.fillRect(px, py, ts, ts);
  // stone block pattern (offset every other row)
  ctx.fillStyle = "#3d3a4a";
  const rowOffset = (y & 1) === 0 ? 0 : ts * 0.5;
  ctx.fillRect(px + rowOffset, py + ts * 0.05, ts * 0.46, ts * 0.40);
  ctx.fillRect(px + (rowOffset === 0 ? ts * 0.5 : 0), py + ts * 0.55, ts * 0.46, ts * 0.40);
  // mortar lines
  ctx.strokeStyle = "#100c1a";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + rowOffset, py + ts * 0.05, ts * 0.46, ts * 0.40);
  ctx.strokeRect(px + (rowOffset === 0 ? ts * 0.5 : 0), py + ts * 0.55, ts * 0.46, ts * 0.40);
  // top highlight (light source from above)
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.beginPath();
  ctx.moveTo(px + 1, py + ts * 0.06);
  ctx.lineTo(px + rowOffset + ts * 0.46, py + ts * 0.06);
  ctx.stroke();
  // dark outline
  ctx.strokeStyle = "#0a0814";
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, ts - 1, ts - 1);
  ctx.restore();
}

/** Object types that should respect the room's wood palette for cohesion. */
const WOOD_TYPED: ReadonlySet<ObjectType> = new Set<ObjectType>([
  "chest", "table", "bed", "door", "bookshelf",
  "barrel", "crate", "seating", "coffin", "treasure"
]);

function drawObjects(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  ts: number,
  layers: ComputedLayers
) {
  for (const o of map.objects) {
    let variants = SPRITES.objects[o.type as ObjectType] ?? [];

    // Material filtering for thematic cohesion
    if (variants.length > 0) {
      // 1) Wood palette — look up the room this object is in
      if (WOOD_TYPED.has(o.type as ObjectType)) {
        const ri = layers.roomIndex[o.y * map.width + o.x];
        const room = ri >= 0 ? map.rooms[ri] : undefined;
        if (room?.wood_palette) {
          variants = filterByWoodPalette(variants, room.wood_palette);
        }
      }
      // 2) Chest contents
      if (o.type === "chest" && o.contents) {
        variants = filterByChestContents(variants, o.contents);
      }
      // 3) Pillar stone palette inherits the map's wall_palette
      if (o.type === "pillar" && map.wall_palette) {
        variants = filterByStonePalette(variants, map.wall_palette);
      }
    }

    const v = variants.length > 0 ? pickVariant(variants, o.x, o.y) : undefined;
    const img = v ? getCachedSprite(v.url) : null;

    if (img && v) {
      // Sprite carries natural tile dimensions. Anchor convention: (o.x, o.y)
      // is the top-left tile of the sprite's footprint. The sprite extends
      // right (v.w tiles) and down (v.h tiles) from there. This keeps small
      // 1x1 objects in their own tile and lets 2x2/5x5 sprites span properly.
      const dw = v.w * ts;
      const dh = v.h * ts;
      const dx = o.x * ts;
      const dy = o.y * ts;

      // soft drop shadow (footprint ellipse under the sprite)
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.40)";
      ctx.beginPath();
      ctx.ellipse(
        dx + dw / 2,
        dy + dh - ts * 0.18,
        dw * 0.40,
        Math.max(4, ts * 0.10),
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();

      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      // shadow + procedural fallback
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.ellipse(
        o.x * ts + ts / 2,
        o.y * ts + ts * 0.80,
        ts * 0.32,
        ts * 0.10,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
      proceduralObject(ctx, o, ts);
    }
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  ts: number
) {
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.30)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= map.width; x++) {
    ctx.beginPath();
    ctx.moveTo(x * ts + 0.5, 0);
    ctx.lineTo(x * ts + 0.5, map.height * ts);
    ctx.stroke();
  }
  for (let y = 0; y <= map.height; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * ts + 0.5);
    ctx.lineTo(map.width * ts, y * ts + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawVignette(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  ts: number
) {
  const w = map.width * ts;
  const h = map.height * ts;
  const grad = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.40,
    w / 2, h / 2, Math.max(w, h) * 0.80
  );
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.50)");
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(60,40,15,0.05)";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawRoomBadges(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  ts: number
) {
  ctx.save();
  const r = Math.max(10, Math.min(ts * 0.36, 18));
  const fontSize = Math.max(11, r * 1.0);
  ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  map.rooms.forEach((room, i) => {
    const num = i + 1;
    const bx = room.x * ts + r + 4;
    const by = room.y * ts + r + 4;
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.arc(bx + 1, by + 2, r, 0, Math.PI * 2);
    ctx.fill();
    // body
    ctx.fillStyle = ROOM_BADGE_COLOR[room.type] ?? "#e0c870";
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
    // edge
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // number
    ctx.fillStyle = "#1a1626";
    ctx.fillText(String(num), bx, by + 1);
  });
  ctx.restore();
}

// ============================================================
// Procedural object fallbacks
// ============================================================

function proceduralSpecial(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: SpecialTileType,
  ts: number
) {
  const px = x * ts, py = y * ts;
  ctx.save();
  switch (type) {
    case "water": {
      ctx.fillStyle = "#1a4e7e";
      ctx.fillRect(px, py, ts, ts);
      ctx.fillStyle = "#2a6da0";
      ctx.fillRect(px, py + ts * 0.55, ts, ts * 0.45);
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + ts * 0.15, py + ts * 0.45);
      ctx.quadraticCurveTo(px + ts * 0.5, py + ts * 0.3, px + ts * 0.85, py + ts * 0.45);
      ctx.moveTo(px + ts * 0.2, py + ts * 0.75);
      ctx.quadraticCurveTo(px + ts * 0.5, py + ts * 0.6, px + ts * 0.8, py + ts * 0.75);
      ctx.stroke();
      break;
    }
    case "lava": {
      ctx.fillStyle = "#5a1004";
      ctx.fillRect(px, py, ts, ts);
      const g = ctx.createRadialGradient(
        px + ts * 0.5, py + ts * 0.5, ts * 0.05,
        px + ts * 0.5, py + ts * 0.5, ts * 0.55
      );
      g.addColorStop(0, "#ffe066");
      g.addColorStop(0.4, "#f06820");
      g.addColorStop(1, "#5a1004");
      ctx.fillStyle = g;
      ctx.fillRect(px, py, ts, ts);
      ctx.strokeStyle = "#2a0805";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 2, py + ts * 0.2);
      ctx.lineTo(px + ts * 0.4, py + ts * 0.5);
      ctx.lineTo(px + ts - 2, py + ts * 0.3);
      ctx.stroke();
      break;
    }
    case "void": {
      ctx.fillStyle = "#000";
      ctx.fillRect(px, py, ts, ts);
      const g = ctx.createRadialGradient(
        px + ts * 0.5, py + ts * 0.5, 0,
        px + ts * 0.5, py + ts * 0.5, ts * 0.55
      );
      g.addColorStop(0, "#000");
      g.addColorStop(0.6, "#0a0a14");
      g.addColorStop(1, "#1a1a2a");
      ctx.fillStyle = g;
      ctx.fillRect(px, py, ts, ts);
      break;
    }
    case "road": {
      ctx.fillStyle = "#a89070";
      ctx.fillRect(px, py, ts, ts);
      ctx.fillStyle = "#bca080";
      const seed = ((x * 73 + y * 19) >>> 0);
      for (let i = 0; i < 4; i++) {
        const sx = px + ((seed >> (i * 3)) & 7) * (ts / 8);
        const sy = py + ((seed >> (i * 3 + 1)) & 7) * (ts / 8);
        ctx.beginPath();
        ctx.arc(sx, sy, ts * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(60,40,20,0.4)";
      ctx.strokeRect(px + 0.5, py + 0.5, ts - 1, ts - 1);
      break;
    }
    case "forest": {
      ctx.fillStyle = "#2d5a27";
      ctx.fillRect(px, py, ts, ts);
      ctx.fillStyle = "#3d7034";
      ctx.beginPath();
      ctx.arc(px + ts * 0.5, py + ts * 0.5, ts * 0.35, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "wall": {
      // shouldn't be called now (we skip wall special_tiles); kept for safety
      proceduralWallTile(ctx, x, y, ts);
      break;
    }
  }
  ctx.restore();
}

function proceduralObject(
  ctx: CanvasRenderingContext2D,
  o: MapObject,
  ts: number
) {
  const px = o.x * ts;
  const py = o.y * ts;
  const cx = px + ts / 2;
  const cy = py + ts / 2;
  const OUTLINE = "#1a1208";
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const stroke = (w = 1) => {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(1, ts * (0.03 * w));
  };
  switch (o.type as ObjectType) {
    case "chest": {
      const w = ts * 0.66, h = ts * 0.36;
      const bx = cx - w / 2, by = cy + ts * 0.04;
      ctx.fillStyle = "#7a4a1c";
      ctx.fillRect(bx, by, w, h);
      ctx.fillStyle = "#9c5d24";
      ctx.beginPath();
      ctx.ellipse(cx, by, w / 2, h * 0.45, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = "#e0b04a";
      ctx.fillRect(bx, by + h * 0.25, w, h * 0.12);
      ctx.fillStyle = "#f1c668";
      ctx.fillRect(cx - ts * 0.06, by + h * 0.4, ts * 0.12, h * 0.35);
      stroke(1.4);
      ctx.strokeRect(bx, by, w, h);
      ctx.beginPath();
      ctx.ellipse(cx, by, w / 2, h * 0.45, 0, Math.PI, 0);
      ctx.stroke();
      break;
    }
    case "door": {
      const w = ts * 0.7, h = ts * 0.66;
      const bx = cx - w / 2, by = cy - h / 2;
      ctx.fillStyle = "#6b4423";
      ctx.fillRect(bx, by, w, h);
      ctx.strokeStyle = "#3f2812";
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(bx + (w / 3) * i, by + 2);
        ctx.lineTo(bx + (w / 3) * i, by + h - 2);
        ctx.stroke();
      }
      ctx.fillStyle = "#e0b04a";
      ctx.beginPath();
      ctx.arc(bx + w * 0.82, cy, ts * 0.05, 0, Math.PI * 2);
      ctx.fill();
      stroke(1.6);
      ctx.strokeRect(bx, by, w, h);
      break;
    }
    case "pillar": {
      const r = ts * 0.30;
      ctx.fillStyle = "#6f6a82";
      ctx.beginPath();
      ctx.ellipse(cx, cy + ts * 0.18, r * 1.05, r * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#a8a3bd";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c9c4dc";
      ctx.beginPath();
      ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
      stroke(1.4);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "trap": {
      ctx.fillStyle = "#3d3024";
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.32, 0, Math.PI * 2);
      ctx.fill();
      stroke(1.4);
      ctx.stroke();
      ctx.strokeStyle = "#c43a1a";
      ctx.lineWidth = Math.max(2, ts * 0.06);
      ctx.beginPath();
      ctx.moveTo(cx - ts * 0.18, cy - ts * 0.18);
      ctx.lineTo(cx + ts * 0.18, cy + ts * 0.18);
      ctx.moveTo(cx + ts * 0.18, cy - ts * 0.18);
      ctx.lineTo(cx - ts * 0.18, cy + ts * 0.18);
      ctx.stroke();
      ctx.fillStyle = "#e8b54a";
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.06, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "altar": {
      const w = ts * 0.62, h = ts * 0.42;
      const bx = cx - w / 2, by = cy - h / 2;
      ctx.fillStyle = "#7d756a";
      ctx.fillRect(bx, by + h * 0.25, w, h * 0.75);
      ctx.fillStyle = "#bcb3a3";
      ctx.fillRect(bx - 2, by, w + 4, h * 0.3);
      // glowing rune
      const g = ctx.createRadialGradient(cx, by + h * 0.18, 0, cx, by + h * 0.18, ts * 0.22);
      g.addColorStop(0, "rgba(255,210,120,1)");
      g.addColorStop(1, "rgba(255,210,120,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, by + h * 0.18, ts * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f0c14a";
      ctx.beginPath();
      ctx.arc(cx, by + h * 0.15, ts * 0.05, 0, Math.PI * 2);
      ctx.fill();
      stroke(1.4);
      ctx.strokeRect(bx, by + h * 0.25, w, h * 0.75);
      ctx.strokeRect(bx - 2, by, w + 4, h * 0.3);
      break;
    }
    case "table": {
      const r = ts * 0.32;
      ctx.fillStyle = "#7a4a23";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#4a2a10";
      ctx.lineWidth = 1;
      for (let i = -1; i <= 1; i++) {
        const off = i * (r * 0.45);
        ctx.beginPath();
        ctx.moveTo(cx + off, cy - r * 0.9);
        ctx.lineTo(cx + off, cy + r * 0.9);
        ctx.stroke();
      }
      stroke(1.4);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#d9b46a";
      ctx.beginPath();
      ctx.arc(cx - r * 0.3, cy - r * 0.1, ts * 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#a04030";
      ctx.beginPath();
      ctx.arc(cx + r * 0.3, cy + r * 0.15, ts * 0.04, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "barrel": {
      const r = ts * 0.26;
      ctx.fillStyle = "#7a4a23";
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 1.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#4a3a2a";
      ctx.lineWidth = Math.max(2, ts * 0.04);
      ctx.beginPath();
      ctx.ellipse(cx, cy - r * 0.4, r * 0.95, r * 0.18, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.4, r * 0.95, r * 0.18, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#9c5d2c";
      ctx.beginPath();
      ctx.ellipse(cx, cy - r * 0.65, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      stroke(1.2);
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 1.05, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "tree": {
      ctx.fillStyle = "#5a3814";
      ctx.fillRect(cx - ts * 0.06, cy + ts * 0.05, ts * 0.12, ts * 0.28);
      ctx.fillStyle = "#2d5a27";
      ctx.beginPath();
      ctx.arc(cx, cy - ts * 0.05, ts * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3d7034";
      ctx.beginPath();
      ctx.arc(cx - ts * 0.1, cy - ts * 0.15, ts * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4d8a40";
      ctx.beginPath();
      ctx.arc(cx + ts * 0.08, cy - ts * 0.18, ts * 0.18, 0, Math.PI * 2);
      ctx.fill();
      stroke(1.2);
      ctx.beginPath();
      ctx.arc(cx, cy - ts * 0.05, ts * 0.32, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "house": {
      const w = ts * 0.75, h = ts * 0.42;
      const bx = cx - w / 2, by = cy - h / 2 + ts * 0.08;
      ctx.fillStyle = "#a37547";
      ctx.fillRect(bx, by, w, h);
      ctx.fillStyle = "#7c3a1e";
      ctx.beginPath();
      ctx.moveTo(bx - 4, by);
      ctx.lineTo(cx, by - ts * 0.28);
      ctx.lineTo(bx + w + 4, by);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#3f240e";
      ctx.fillRect(cx - ts * 0.08, by + h * 0.4, ts * 0.16, h * 0.6);
      ctx.fillStyle = "#f0c14a";
      ctx.fillRect(bx + w * 0.18, by + h * 0.25, ts * 0.1, ts * 0.1);
      stroke(1.6);
      ctx.strokeRect(bx, by, w, h);
      ctx.beginPath();
      ctx.moveTo(bx - 4, by);
      ctx.lineTo(cx, by - ts * 0.28);
      ctx.lineTo(bx + w + 4, by);
      ctx.stroke();
      break;
    }
    case "well": {
      ctx.fillStyle = "#7a7588";
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1f4a7a";
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy + ts * 0.04, ts * 0.14, 0.2, Math.PI - 0.2);
      ctx.stroke();
      stroke(1.2);
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.32, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        ctx.moveTo(cx + Math.cos(a) * ts * 0.22, cy + Math.sin(a) * ts * 0.22);
        ctx.lineTo(cx + Math.cos(a) * ts * 0.32, cy + Math.sin(a) * ts * 0.32);
      }
      ctx.stroke();
      break;
    }
    case "skull": {
      ctx.fillStyle = "#e8dec8";
      ctx.beginPath();
      ctx.arc(cx, cy - ts * 0.04, ts * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d4c8a8";
      ctx.fillRect(cx - ts * 0.10, cy + ts * 0.08, ts * 0.20, ts * 0.08);
      // eyes + nose
      ctx.fillStyle = "#0a0606";
      ctx.beginPath();
      ctx.arc(cx - ts * 0.06, cy - ts * 0.05, ts * 0.03, 0, Math.PI * 2);
      ctx.arc(cx + ts * 0.06, cy - ts * 0.05, ts * 0.03, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy + ts * 0.02);
      ctx.lineTo(cx - ts * 0.02, cy + ts * 0.06);
      ctx.lineTo(cx + ts * 0.02, cy + ts * 0.06);
      ctx.closePath();
      ctx.fill();
      // teeth lines
      ctx.strokeStyle = "#3a2a1a";
      ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * ts * 0.035, cy + ts * 0.08);
        ctx.lineTo(cx + i * ts * 0.035, cy + ts * 0.16);
        ctx.stroke();
      }
      stroke(1.0);
      ctx.beginPath();
      ctx.arc(cx, cy - ts * 0.04, ts * 0.18, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "bones": {
      ctx.strokeStyle = "#e8dec8";
      ctx.lineWidth = Math.max(2, ts * 0.06);
      ctx.lineCap = "round";
      // crossed bones
      ctx.beginPath();
      ctx.moveTo(cx - ts * 0.20, cy - ts * 0.16);
      ctx.lineTo(cx + ts * 0.20, cy + ts * 0.16);
      ctx.moveTo(cx + ts * 0.20, cy - ts * 0.16);
      ctx.lineTo(cx - ts * 0.20, cy + ts * 0.16);
      ctx.stroke();
      // bone knobs
      ctx.fillStyle = "#e8dec8";
      const pts = [
        [-0.20, -0.16],[0.20, 0.16],[0.20, -0.16],[-0.20, 0.16]
      ] as const;
      for (const [dx, dy] of pts) {
        ctx.beginPath();
        ctx.arc(cx + dx * ts, cy + dy * ts, ts * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "candle": {
      // base
      ctx.fillStyle = "#d8c590";
      ctx.fillRect(cx - ts * 0.05, cy - ts * 0.02, ts * 0.10, ts * 0.18);
      stroke(1.0);
      ctx.strokeRect(cx - ts * 0.05, cy - ts * 0.02, ts * 0.10, ts * 0.18);
      // wick
      ctx.strokeStyle = "#1a1208";
      ctx.beginPath();
      ctx.moveTo(cx, cy - ts * 0.02);
      ctx.lineTo(cx, cy - ts * 0.08);
      ctx.stroke();
      // flame
      ctx.fillStyle = "#ffe066";
      ctx.beginPath();
      ctx.ellipse(cx, cy - ts * 0.12, ts * 0.04, ts * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f06820";
      ctx.beginPath();
      ctx.ellipse(cx, cy - ts * 0.10, ts * 0.025, ts * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      // glow
      const g = ctx.createRadialGradient(cx, cy - ts * 0.12, 0, cx, cy - ts * 0.12, ts * 0.45);
      g.addColorStop(0, "rgba(255,220,120,0.45)");
      g.addColorStop(1, "rgba(255,220,120,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy - ts * 0.12, ts * 0.45, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "statue": {
      // base
      ctx.fillStyle = "#7a7588";
      ctx.fillRect(cx - ts * 0.18, cy + ts * 0.12, ts * 0.36, ts * 0.10);
      // figure
      ctx.fillStyle = "#a8a3bd";
      ctx.beginPath();
      ctx.arc(cx, cy - ts * 0.10, ts * 0.10, 0, Math.PI * 2);  // head
      ctx.fill();
      ctx.fillRect(cx - ts * 0.10, cy - ts * 0.02, ts * 0.20, ts * 0.16);  // body
      ctx.beginPath();
      ctx.moveTo(cx - ts * 0.10, cy + ts * 0.12);
      ctx.lineTo(cx - ts * 0.18, cy + ts * 0.14);
      ctx.lineTo(cx + ts * 0.18, cy + ts * 0.14);
      ctx.lineTo(cx + ts * 0.10, cy + ts * 0.12);
      ctx.fill();
      stroke(1.2);
      ctx.beginPath();
      ctx.arc(cx, cy - ts * 0.10, ts * 0.10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeRect(cx - ts * 0.18, cy + ts * 0.12, ts * 0.36, ts * 0.10);
      break;
    }
    case "bookshelf": {
      const w = ts * 0.70, h = ts * 0.50;
      const bx = cx - w / 2, by = cy - h / 2;
      ctx.fillStyle = "#5a3a1a";
      ctx.fillRect(bx, by, w, h);
      // books in 3 rows
      const colors = ["#7a3030", "#3a5a7a", "#7a6030", "#3a7a4a", "#5a3a7a"];
      for (let row = 0; row < 3; row++) {
        for (let c = 0; c < 6; c++) {
          ctx.fillStyle = colors[(row * 13 + c * 7) % colors.length];
          ctx.fillRect(bx + 3 + c * (w / 6.5), by + 3 + row * (h / 3.2), w / 7, h / 3.6);
        }
      }
      stroke(1.4);
      ctx.strokeRect(bx, by, w, h);
      break;
    }
    case "bed": {
      const w = ts * 0.74, h = ts * 0.52;
      const bx = cx - w / 2, by = cy - h / 2;
      // frame
      ctx.fillStyle = "#5a3a1a";
      ctx.fillRect(bx, by, w, h);
      // mattress
      ctx.fillStyle = "#d8d8e8";
      ctx.fillRect(bx + 3, by + h * 0.25, w - 6, h * 0.7);
      // pillow
      ctx.fillStyle = "#f5f0e8";
      ctx.fillRect(bx + 6, by + h * 0.10, w * 0.30, h * 0.22);
      // blanket
      ctx.fillStyle = "#a04030";
      ctx.fillRect(bx + 3, by + h * 0.55, w - 6, h * 0.4);
      stroke(1.4);
      ctx.strokeRect(bx, by, w, h);
      break;
    }
    case "weapon_rack": {
      const w = ts * 0.70, h = ts * 0.50;
      const bx = cx - w / 2, by = cy - h / 2;
      // back board
      ctx.fillStyle = "#5a3a1a";
      ctx.fillRect(bx, by + h * 0.7, w, h * 0.3);
      // 3 weapons
      ctx.strokeStyle = "#909098";
      ctx.lineWidth = 2;
      // sword
      ctx.beginPath();
      ctx.moveTo(bx + w * 0.20, by);
      ctx.lineTo(bx + w * 0.20, by + h * 0.7);
      ctx.stroke();
      ctx.fillStyle = "#909098";
      ctx.beginPath();
      ctx.moveTo(bx + w * 0.16, by);
      ctx.lineTo(bx + w * 0.24, by);
      ctx.lineTo(bx + w * 0.20, by - 2);
      ctx.closePath();
      ctx.fill();
      // axe
      ctx.beginPath();
      ctx.moveTo(bx + w * 0.50, by + 2);
      ctx.lineTo(bx + w * 0.50, by + h * 0.7);
      ctx.stroke();
      ctx.fillStyle = "#a0a0a8";
      ctx.beginPath();
      ctx.moveTo(bx + w * 0.50, by + h * 0.15);
      ctx.lineTo(bx + w * 0.66, by + h * 0.10);
      ctx.lineTo(bx + w * 0.66, by + h * 0.30);
      ctx.lineTo(bx + w * 0.50, by + h * 0.35);
      ctx.closePath();
      ctx.fill();
      // spear
      ctx.beginPath();
      ctx.moveTo(bx + w * 0.80, by);
      ctx.lineTo(bx + w * 0.80, by + h * 0.7);
      ctx.stroke();
      ctx.fillStyle = "#a0a0a8";
      ctx.beginPath();
      ctx.moveTo(bx + w * 0.76, by + 4);
      ctx.lineTo(bx + w * 0.80, by - 4);
      ctx.lineTo(bx + w * 0.84, by + 4);
      ctx.closePath();
      ctx.fill();
      stroke(1.2);
      ctx.strokeRect(bx, by + h * 0.7, w, h * 0.3);
      break;
    }
    case "web": {
      // spider web in the corner
      ctx.strokeStyle = "rgba(220,220,235,0.7)";
      ctx.lineWidth = 1;
      const radii = [ts * 0.12, ts * 0.22, ts * 0.32];
      for (const r of radii) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * 1.1 + (Math.PI * 0.8 / 5) * i;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * ts * 0.35, cy + Math.sin(a) * ts * 0.35);
        ctx.stroke();
      }
      break;
    }
    case "crate": {
      const s = ts * 0.50;
      const bx = cx - s / 2, by = cy - s / 2;
      ctx.fillStyle = "#7a4a23";
      ctx.fillRect(bx, by, s, s);
      ctx.strokeStyle = "#3f2812";
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + s * 0.1, by + s * 0.1, s * 0.8, s * 0.8);
      ctx.beginPath();
      ctx.moveTo(bx + s * 0.1, by + s * 0.1);
      ctx.lineTo(bx + s * 0.9, by + s * 0.9);
      ctx.moveTo(bx + s * 0.9, by + s * 0.1);
      ctx.lineTo(bx + s * 0.1, by + s * 0.9);
      ctx.stroke();
      stroke(1.4);
      ctx.strokeRect(bx, by, s, s);
      break;
    }
    case "debris": {
      // scattered rocks
      const seed = ((o.x * 911) ^ (o.y * 277)) >>> 0;
      for (let i = 0; i < 5; i++) {
        const dx = ((seed >> (i * 3)) & 15) / 15 - 0.5;
        const dy = ((seed >> (i * 3 + 4)) & 15) / 15 - 0.5;
        const r = ts * (0.05 + ((seed >> (i + 7)) & 3) * 0.02);
        ctx.fillStyle = i % 2 === 0 ? "#6a6072" : "#85788c";
        ctx.beginPath();
        ctx.arc(cx + dx * ts * 0.4, cy + dy * ts * 0.4, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      break;
    }
    case "campfire": {
      // fire pit ring
      ctx.fillStyle = "#3a2a1a";
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.30, 0, Math.PI * 2);
      ctx.fill();
      // stones
      ctx.fillStyle = "#7a7588";
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 / 6) * i;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * ts * 0.28, cy + Math.sin(a) * ts * 0.28, ts * 0.06, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      // logs
      ctx.fillStyle = "#5a3814";
      ctx.fillRect(cx - ts * 0.18, cy - ts * 0.03, ts * 0.36, ts * 0.06);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 3);
      ctx.fillRect(-ts * 0.18, -ts * 0.03, ts * 0.36, ts * 0.06);
      ctx.restore();
      // fire
      const g = ctx.createRadialGradient(cx, cy - ts * 0.05, 0, cx, cy - ts * 0.05, ts * 0.40);
      g.addColorStop(0, "rgba(255,230,120,1)");
      g.addColorStop(0.5, "rgba(240,104,32,0.8)");
      g.addColorStop(1, "rgba(240,104,32,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy - ts * 0.05, ts * 0.40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffe066";
      ctx.beginPath();
      ctx.ellipse(cx, cy - ts * 0.10, ts * 0.08, ts * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "rug": {
      const w = ts * 0.82, h = ts * 0.62;
      const bx = cx - w / 2, by = cy - h / 2;
      // base
      ctx.fillStyle = "#a04030";
      ctx.fillRect(bx, by, w, h);
      // pattern
      ctx.fillStyle = "#e0b04a";
      ctx.fillRect(bx + 4, by + 4, w - 8, h - 8);
      ctx.fillStyle = "#a04030";
      ctx.fillRect(bx + 10, by + 10, w - 20, h - 20);
      // center diamond
      ctx.fillStyle = "#e0b04a";
      ctx.beginPath();
      ctx.moveTo(cx, by + h * 0.25);
      ctx.lineTo(bx + w * 0.75, cy);
      ctx.lineTo(cx, by + h * 0.75);
      ctx.lineTo(bx + w * 0.25, cy);
      ctx.closePath();
      ctx.fill();
      // fringe
      ctx.strokeStyle = "#f0d090";
      ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        const fx = bx + (w / 12) * i + 2;
        ctx.beginPath();
        ctx.moveTo(fx, by);
        ctx.lineTo(fx, by - 4);
        ctx.moveTo(fx, by + h);
        ctx.lineTo(fx, by + h + 4);
        ctx.stroke();
      }
      stroke(0.8);
      ctx.strokeRect(bx, by, w, h);
      break;
    }
    case "fountain": {
      ctx.fillStyle = "#7a7588";
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1f6aa0";
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.26, 0, Math.PI * 2);
      ctx.fill();
      // center column
      ctx.fillStyle = "#a8a3bd";
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.08, 0, Math.PI * 2);
      ctx.fill();
      // water spray
      ctx.strokeStyle = "rgba(180,210,240,0.8)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 / 8) * i;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * ts * 0.18, cy + Math.sin(a) * ts * 0.18);
        ctx.stroke();
      }
      stroke(1.2);
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    default: {
      ctx.fillStyle = "#aaa";
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.18, 0, Math.PI * 2);
      ctx.fill();
      stroke(1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ============================================================
// Helpers
// ============================================================

function getCachedSprite(url: string): HTMLImageElement | null {
  loadSprite(url);
  return getSpriteSync(url);
}
