"use client";

import { getSpriteSync, loadSprite, prefetch } from "./spriteLoader";
import { allSpriteUrls, pickVariant, SPRITES } from "./sprites";
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
// Fallback color palette (used when a sprite is unavailable).
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
  entrance: "rgba(120,120,160,0.20)",
  corridor: "rgba(60,60,90,0.18)",
  chamber: "rgba(110,100,150,0.18)",
  boss: "rgba(180,70,70,0.30)",
  treasure: "rgba(220,180,80,0.30)",
  shop: "rgba(140,120,70,0.28)",
  tavern: "rgba(180,140,80,0.30)",
  open: "rgba(140,110,70,0.22)"
};

const ROOM_EDGE: Record<RoomType, string> = {
  entrance: "#a8a8c0",
  corridor: "#666688",
  chamber: "#8c8cb0",
  boss: "#c25555",
  treasure: "#e0b860",
  shop: "#b5965c",
  tavern: "#c89e60",
  open: "#b59067"
};

// ============================================================
// Public API
// ============================================================

interface RenderOptions {
  pixelRatio?: number;
  tileSize?: number;
  showGrid?: boolean;
  showLabels?: boolean;
}

export function computeTileSize(
  canvasWidth: number,
  canvasHeight: number,
  mapWidth: number,
  mapHeight: number
): number {
  return Math.floor(Math.min(canvasWidth / mapWidth, canvasHeight / mapHeight));
}

/** Eagerly load all sprite URLs into the browser cache. Safe to call repeatedly. */
export function warmSpriteCache() {
  prefetch(allSpriteUrls());
}

/**
 * Render the map to a visible canvas. Sprites are loaded asynchronously; the
 * function returns after the first synchronous pass (with whatever sprites are
 * already cached) and triggers a repaint when all images finish loading.
 */
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

  paint(ctx, map, tileSize, opts.showGrid ?? true, opts.showLabels ?? true);

  // re-paint once all needed sprites have loaded
  Promise.all(allSpriteUrls().map(loadSprite)).then(() => {
    const ctx2 = canvas.getContext("2d");
    if (!ctx2) return;
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(ctx2, map, tileSize, opts.showGrid ?? true, opts.showLabels ?? true);
  });
}

/**
 * Build a high-resolution offscreen canvas suitable for PNG export.
 * Async — waits for all sprites to load before painting.
 */
export async function renderToExportCanvas(
  map: MapData,
  tileSize = 64
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = map.width * tileSize;
  canvas.height = map.height * tileSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  await Promise.all(allSpriteUrls().map(loadSprite));
  paint(ctx, map, tileSize, true, true);
  return canvas;
}

// ============================================================
// Paint pipeline
// ============================================================

function paint(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  ts: number,
  showGrid: boolean,
  showLabels: boolean
) {
  drawBackground(ctx, map, ts);
  drawRoomFloors(ctx, map, ts);
  drawSpecialTiles(ctx, map, ts);
  drawWalls(ctx, map, ts);
  drawConnections(ctx, map, ts);
  drawObjects(ctx, map, ts);
  if (showGrid) drawGrid(ctx, map, ts);
  drawVignette(ctx, map, ts);
  if (showLabels) drawLabels(ctx, map, ts);
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  ts: number
) {
  const variants = SPRITES.terrain[map.background_tile];
  if (variants && variants.length > 0) {
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const url = pickVariant(variants, x, y);
        const sprite = url ? getCachedSprite(url) : null;
        if (sprite) {
          ctx.drawImage(sprite, x * ts, y * ts, ts, ts);
        } else {
          ctx.fillStyle = TILE_COLORS[map.background_tile];
          ctx.fillRect(x * ts, y * ts, ts, ts);
        }
      }
    }
  } else {
    ctx.fillStyle = TILE_COLORS[map.background_tile] ?? "#3a3a4a";
    ctx.fillRect(0, 0, ts * map.width, ts * map.height);
    proceduralNoise(ctx, map.width, map.height, ts);
  }
}

function drawRoomFloors(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  ts: number
) {
  for (const r of map.rooms) {
    const floorVariants = SPRITES.roomFloor[r.type];
    if (floorVariants && floorVariants.length > 0) {
      for (let y = 0; y < r.h; y++) {
        for (let x = 0; x < r.w; x++) {
          const url = pickVariant(floorVariants, r.x + x, r.y + y);
          const sprite = url ? getCachedSprite(url) : null;
          if (sprite) {
            ctx.drawImage(sprite, (r.x + x) * ts, (r.y + y) * ts, ts, ts);
          }
        }
      }
    }
    // Tint overlay (works on top of sprite or fallback color)
    ctx.fillStyle = ROOM_TINT[r.type] ?? "rgba(0,0,0,0)";
    ctx.fillRect(r.x * ts, r.y * ts, r.w * ts, r.h * ts);
  }
}

function drawSpecialTiles(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  ts: number
) {
  for (const s of map.special_tiles) {
    const variants = SPRITES.special[s.type];
    const url = variants ? pickVariant(variants, s.x, s.y) : undefined;
    const sprite = url ? getCachedSprite(url) : null;
    if (sprite) {
      ctx.drawImage(sprite, s.x * ts, s.y * ts, ts, ts);
    } else {
      proceduralSpecial(ctx, s.x, s.y, s.type, ts);
    }
  }
}

function drawWalls(ctx: CanvasRenderingContext2D, map: MapData, ts: number) {
  ctx.save();
  const t = Math.max(2, ts * 0.10);
  for (const r of map.rooms) {
    ctx.strokeStyle = ROOM_EDGE[r.type] ?? "#888";
    ctx.lineWidth = t;
    ctx.lineJoin = "round";
    // outer shadow
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = ts * 0.25;
    ctx.shadowOffsetY = ts * 0.05;
    ctx.strokeRect(
      r.x * ts + t / 2,
      r.y * ts + t / 2,
      r.w * ts - t,
      r.h * ts - t
    );
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    // inner thin dark line for "carved" feel
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      r.x * ts + t + 0.5,
      r.y * ts + t + 0.5,
      r.w * ts - 2 * t - 1,
      r.h * ts - 2 * t - 1
    );
  }
  ctx.restore();
}

function drawConnections(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  ts: number
) {
  const byId = new Map<string, MapRoom>();
  for (const r of map.rooms) byId.set(r.id, r);

  for (const c of map.connections) {
    const a = byId.get(c.from);
    const b = byId.get(c.to);
    if (!a || !b) continue;
    const ax = (a.x + a.w / 2) * ts;
    const ay = (a.y + a.h / 2) * ts;
    const bx = (b.x + b.w / 2) * ts;
    const by = (b.y + b.h / 2) * ts;

    ctx.save();
    ctx.lineCap = "round";
    // shadow under path
    ctx.strokeStyle = "rgba(40,25,10,0.7)";
    ctx.lineWidth = ts * 0.32;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    // path body
    switch (c.type) {
      case "door":
        ctx.strokeStyle = "#7a5a35";
        break;
      case "arch":
        ctx.strokeStyle = "#a08a55";
        break;
      case "stairs":
        ctx.strokeStyle = "#aa9050";
        ctx.setLineDash([ts * 0.3, ts * 0.2]);
        break;
      case "path":
        ctx.strokeStyle = "#c4a882";
        break;
    }
    ctx.lineWidth = ts * 0.22;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    // highlight
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,230,170,0.35)";
    ctx.lineWidth = ts * 0.08;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();
  }
}

function drawObjects(ctx: CanvasRenderingContext2D, map: MapData, ts: number) {
  for (const o of map.objects) {
    const variants = SPRITES.objects[o.type];
    const url = variants ? pickVariant(variants, o.x, o.y) : undefined;
    const sprite = url ? getCachedSprite(url) : null;

    // shadow underneath (always — works for both sprite and fallback)
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(
      o.x * ts + ts / 2,
      o.y * ts + ts * 0.78,
      ts * 0.35,
      ts * 0.13,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();

    if (sprite) {
      // slight per-tile rotation for variation
      const rot = ((((o.x * 31 + o.y * 17) >>> 0) % 21) - 10) * (Math.PI / 180);
      const scale = 0.9 + (((o.x * 7 + o.y * 13) >>> 0) % 20) * 0.005;
      ctx.save();
      ctx.translate(o.x * ts + ts / 2, o.y * ts + ts / 2);
      ctx.rotate(rot);
      const sz = ts * scale;
      ctx.drawImage(sprite, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    } else {
      proceduralObject(ctx, o, ts);
    }
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, map: MapData, ts: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.32)";
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
    w / 2,
    h / 2,
    Math.min(w, h) * 0.35,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.75
  );
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // warm tint
  ctx.fillStyle = "rgba(60,40,15,0.08)";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawLabels(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  ts: number
) {
  ctx.save();
  const fontSize = Math.max(12, Math.min(ts * 0.45, 22));
  ctx.font = `700 ${fontSize}px Cinzel, Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const r of map.rooms) {
    if (!r.label) continue;
    const cx = (r.x + r.w / 2) * ts;
    const cy = (r.y + r.h / 2) * ts;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(r.label, cx, cy);
    ctx.fillStyle = "#f5dfa0";
    ctx.fillText(r.label, cx, cy);
  }
  ctx.restore();
}

// ============================================================
// Procedural fallbacks (used when sprite is missing)
// ============================================================

function proceduralNoise(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ts: number
) {
  ctx.save();
  ctx.globalAlpha = 0.08;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const seed = (x * 928371 + y * 12831) % 11;
      if (seed === 0) ctx.fillStyle = "#ffffff";
      else if (seed === 3) ctx.fillStyle = "#000000";
      else continue;
      ctx.fillRect(x * ts, y * ts, ts, ts);
    }
  }
  ctx.restore();
}

function proceduralSpecial(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: SpecialTileType,
  ts: number
) {
  ctx.fillStyle = TILE_COLORS[type] ?? "#000";
  ctx.fillRect(x * ts, y * ts, ts, ts);
  if (type === "wall") {
    ctx.strokeStyle = "#2a2a3a";
    ctx.lineWidth = 1;
    ctx.strokeRect(x * ts + 0.5, y * ts + 0.5, ts - 1, ts - 1);
  } else if (type === "water") {
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(x * ts + ts * 0.2, y * ts + ts * 0.55);
    ctx.quadraticCurveTo(
      x * ts + ts * 0.5,
      y * ts + ts * 0.4,
      x * ts + ts * 0.8,
      y * ts + ts * 0.55
    );
    ctx.stroke();
  } else if (type === "lava") {
    ctx.fillStyle = "rgba(255,210,80,0.4)";
    ctx.beginPath();
    ctx.arc(
      x * ts + ts * 0.5,
      y * ts + ts * 0.5,
      ts * 0.15,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
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
  const pad = ts * 0.18;
  ctx.save();
  switch (o.type as ObjectType) {
    case "chest": {
      ctx.fillStyle = "#6b4a25";
      ctx.fillRect(px + pad, py + ts * 0.4, ts - pad * 2, ts * 0.45);
      ctx.fillStyle = "#caa84a";
      ctx.fillRect(px + pad, py + ts * 0.55, ts - pad * 2, ts * 0.06);
      ctx.strokeStyle = "#2a1a05";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        px + pad + 0.5,
        py + ts * 0.4 + 0.5,
        ts - pad * 2 - 1,
        ts * 0.45 - 1
      );
      break;
    }
    case "door": {
      ctx.fillStyle = "#5a3a1a";
      ctx.fillRect(px + pad, py + pad, ts - pad * 2, ts - pad * 1.4);
      ctx.fillStyle = "#caa84a";
      ctx.beginPath();
      ctx.arc(px + ts * 0.72, cy, ts * 0.05, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "pillar": {
      ctx.fillStyle = "#a0a0b0";
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#5a5a70";
      ctx.stroke();
      break;
    }
    case "trap": {
      ctx.strokeStyle = "#cc4400";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px + pad, py + pad);
      ctx.lineTo(px + ts - pad, py + ts - pad);
      ctx.moveTo(px + ts - pad, py + pad);
      ctx.lineTo(px + pad, py + ts - pad);
      ctx.stroke();
      break;
    }
    case "altar": {
      ctx.fillStyle = "#b0a070";
      ctx.fillRect(px + pad, py + ts * 0.45, ts - pad * 2, ts * 0.4);
      ctx.fillStyle = "#e8d68a";
      ctx.fillRect(px + pad, py + ts * 0.4, ts - pad * 2, ts * 0.08);
      break;
    }
    case "table": {
      ctx.fillStyle = "#7a5a35";
      ctx.fillRect(px + pad * 0.5, py + ts * 0.4, ts - pad, ts * 0.2);
      ctx.fillRect(px + pad, py + ts * 0.6, ts * 0.1, ts * 0.25);
      ctx.fillRect(
        px + ts - pad - ts * 0.1,
        py + ts * 0.6,
        ts * 0.1,
        ts * 0.25
      );
      break;
    }
    case "barrel": {
      ctx.fillStyle = "#6b4a25";
      ctx.beginPath();
      ctx.ellipse(cx, cy, ts * 0.25, ts * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "tree": {
      ctx.fillStyle = "#5a3a1a";
      ctx.fillRect(cx - ts * 0.06, cy + ts * 0.05, ts * 0.12, ts * 0.3);
      ctx.fillStyle = "#2d5a27";
      ctx.beginPath();
      ctx.arc(cx, cy - ts * 0.05, ts * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3d7034";
      ctx.beginPath();
      ctx.arc(cx - ts * 0.1, cy - ts * 0.15, ts * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "house": {
      ctx.fillStyle = "#8b6c42";
      ctx.fillRect(px + pad, py + ts * 0.45, ts - pad * 2, ts * 0.4);
      ctx.fillStyle = "#5a3a1a";
      ctx.beginPath();
      ctx.moveTo(px + pad * 0.5, py + ts * 0.45);
      ctx.lineTo(cx, py + pad);
      ctx.lineTo(px + ts - pad * 0.5, py + ts * 0.45);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "well": {
      ctx.fillStyle = "#5a5a70";
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a2a40";
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    default: {
      ctx.fillStyle = "#aaaaaa";
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ============================================================
// Helpers
// ============================================================

function getCachedSprite(url: string): HTMLImageElement | null {
  // Touch loader so caching has started even if this is the first time we see the url.
  loadSprite(url);
  return getSpriteSync(url);
}
