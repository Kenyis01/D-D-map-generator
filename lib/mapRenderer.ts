import type {
  BackgroundTile,
  MapData,
  MapObject,
  MapRoom,
  ObjectType,
  RoomType,
  SpecialTileType
} from "./types";

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

const ROOM_TILE: Record<RoomType, BackgroundTile> = {
  entrance: "stone_floor",
  corridor: "stone_floor",
  chamber: "stone_floor",
  boss: "stone_floor",
  treasure: "wood_floor",
  shop: "wood_floor",
  tavern: "wood_floor",
  open: "dirt"
};

const ROOM_ACCENT: Record<RoomType, string> = {
  entrance: "#4a4a6a",
  corridor: "#33334a",
  chamber: "#3f3f55",
  boss: "#5c2c2c",
  treasure: "#8b6e2c",
  shop: "#6b5a35",
  tavern: "#7a5a35",
  open: "#7a6244"
};

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

  drawBackground(ctx, map, tileSize);
  drawSpecialTiles(ctx, map, tileSize);
  drawRooms(ctx, map, tileSize);
  drawConnections(ctx, map, tileSize);
  drawObjects(ctx, map, tileSize);

  if (opts.showGrid ?? true) drawGrid(ctx, map, tileSize);
  if (opts.showLabels ?? true) drawLabels(ctx, map, tileSize);
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  ts: number
) {
  ctx.fillStyle = TILE_COLORS[map.background_tile] ?? "#3a3a4a";
  ctx.fillRect(0, 0, ts * map.width, ts * map.height);

  // subtle texture noise
  ctx.save();
  ctx.globalAlpha = 0.06;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (((x * 928371 + y * 12831) % 7) === 0) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x * ts, y * ts, ts, ts);
      } else if (((x * 12 + y * 31) % 11) === 0) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(x * ts, y * ts, ts, ts);
      }
    }
  }
  ctx.restore();
}

function drawRooms(ctx: CanvasRenderingContext2D, map: MapData, ts: number) {
  for (const r of map.rooms) {
    const tile = ROOM_TILE[r.type] ?? "stone_floor";
    ctx.fillStyle = TILE_COLORS[tile];
    ctx.fillRect(r.x * ts, r.y * ts, r.w * ts, r.h * ts);

    ctx.strokeStyle = ROOM_ACCENT[r.type] ?? "#000";
    ctx.lineWidth = Math.max(1, ts * 0.08);
    ctx.strokeRect(
      r.x * ts + ctx.lineWidth / 2,
      r.y * ts + ctx.lineWidth / 2,
      r.w * ts - ctx.lineWidth,
      r.h * ts - ctx.lineWidth
    );
  }
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
    ctx.lineWidth = ts * 0.18;
    ctx.lineCap = "round";
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
        ctx.setLineDash([ts * 0.4, ts * 0.3]);
        break;
    }
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSpecialTiles(
  ctx: CanvasRenderingContext2D,
  map: MapData,
  ts: number
) {
  for (const s of map.special_tiles) {
    ctx.fillStyle = TILE_COLORS[s.type] ?? "#000";
    ctx.fillRect(s.x * ts, s.y * ts, ts, ts);

    if (s.type === "wall") {
      ctx.strokeStyle = "#2a2a3a";
      ctx.lineWidth = 1;
      ctx.strokeRect(s.x * ts + 0.5, s.y * ts + 0.5, ts - 1, ts - 1);
    } else if (s.type === "water") {
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s.x * ts + ts * 0.2, s.y * ts + ts * 0.55);
      ctx.quadraticCurveTo(
        s.x * ts + ts * 0.5,
        s.y * ts + ts * 0.4,
        s.x * ts + ts * 0.8,
        s.y * ts + ts * 0.55
      );
      ctx.stroke();
    } else if (s.type === "lava") {
      ctx.fillStyle = "rgba(255,210,80,0.4)";
      ctx.beginPath();
      ctx.arc(
        s.x * ts + ts * 0.5,
        s.y * ts + ts * 0.5,
        ts * 0.15,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }
}

function drawObjects(ctx: CanvasRenderingContext2D, map: MapData, ts: number) {
  for (const o of map.objects) {
    drawObject(ctx, o, ts);
  }
}

function drawObject(
  ctx: CanvasRenderingContext2D,
  o: MapObject,
  ts: number
) {
  const px = o.x * ts;
  const py = o.y * ts;
  const cx = px + ts / 2;
  const cy = py + ts / 2;
  const pad = ts * 0.15;
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
      ctx.strokeStyle = "#caa84a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, py + pad + (ts - pad * 1.4) / 2, (ts - pad * 2) / 2, Math.PI, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "pillar": {
      ctx.fillStyle = "#a0a0b0";
      ctx.beginPath();
      ctx.arc(cx, cy, ts * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#5a5a70";
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    }
    case "trap": {
      ctx.strokeStyle = "#cc4400";
      ctx.lineWidth = 2;
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
      ctx.fillRect(px + ts - pad - ts * 0.1, py + ts * 0.6, ts * 0.1, ts * 0.25);
      break;
    }
    case "barrel": {
      ctx.fillStyle = "#6b4a25";
      ctx.beginPath();
      ctx.ellipse(cx, cy, ts * 0.25, ts * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#2a1a05";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + ts * 0.25, cy - ts * 0.05);
      ctx.lineTo(px + ts * 0.75, cy - ts * 0.05);
      ctx.moveTo(px + ts * 0.25, cy + ts * 0.08);
      ctx.lineTo(px + ts * 0.75, cy + ts * 0.08);
      ctx.stroke();
      break;
    }
    case "tree": {
      ctx.fillStyle = "#5a3a1a";
      ctx.fillRect(cx - ts * 0.06, cy + ts * 0.05, ts * 0.12, ts * 0.3);
      ctx.fillStyle = "#2d5a27";
      ctx.beginPath();
      ctx.moveTo(cx, py + pad * 0.5);
      ctx.lineTo(px + ts - pad, cy + ts * 0.05);
      ctx.lineTo(px + pad, cy + ts * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#3d7034";
      ctx.beginPath();
      ctx.moveTo(cx, py + pad);
      ctx.lineTo(px + ts - pad * 1.5, cy - ts * 0.05);
      ctx.lineTo(px + pad * 1.5, cy - ts * 0.05);
      ctx.closePath();
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
      ctx.fillStyle = "#3a2a1a";
      ctx.fillRect(cx - ts * 0.06, py + ts * 0.6, ts * 0.12, ts * 0.25);
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

function drawGrid(ctx: CanvasRenderingContext2D, map: MapData, ts: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
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

function drawLabels(ctx: CanvasRenderingContext2D, map: MapData, ts: number) {
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 3;
  const fontSize = Math.max(10, Math.min(ts * 0.45, 18));
  ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const r of map.rooms) {
    if (!r.label) continue;
    const cx = (r.x + r.w / 2) * ts;
    const cy = (r.y + r.h / 2) * ts;
    ctx.strokeText(r.label, cx, cy);
    ctx.fillText(r.label, cx, cy);
  }
  ctx.restore();
}

/** Render to an offscreen canvas at high resolution for export. */
export function renderToExportCanvas(map: MapData, tileSize = 64): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = map.width * tileSize;
  canvas.height = map.height * tileSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  drawBackground(ctx, map, tileSize);
  drawSpecialTiles(ctx, map, tileSize);
  drawRooms(ctx, map, tileSize);
  drawConnections(ctx, map, tileSize);
  drawObjects(ctx, map, tileSize);
  drawGrid(ctx, map, tileSize);
  drawLabels(ctx, map, tileSize);
  return canvas;
}
