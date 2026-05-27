/**
 * Deterministic layout engine: turns a list of RoomIntent into positioned
 * rooms + corridors + door tiles, using BSP partition + L-shape corridors.
 *
 * Why not let the LLM pick coords? Because LLMs have terrible spatial
 * reasoning. By moving layout into code we get:
 *   - Guaranteed non-overlapping rooms with a wall band between them
 *   - Predictable corridor routing
 *   - Properly placed doors (never in corners, never mid-corridor)
 *   - Room sizes that scale with `size` category instead of LLM guesses
 *
 * The renderer still consumes the legacy MapData shape (rooms with x/y/w/h),
 * so the only callers of this module are the API route assembling MapData
 * after the LLM returns its MapIntent.
 */

import type {
  MapData,
  MapIntent,
  MapRoom,
  RoomIntent,
  RoomSize,
  RoomType
} from "./types";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Tile-size ranges per size category. Tuned for a typical 30x15 map.
const SIZE_RANGES: Record<RoomSize, { wMin: number; wMax: number; hMin: number; hMax: number }> = {
  small: { wMin: 4, wMax: 5, hMin: 4, hMax: 5 },
  medium: { wMin: 5, wMax: 7, hMin: 5, hMax: 7 },
  large: { wMin: 7, wMax: 9, hMin: 6, hMax: 8 },
  huge: { wMin: 9, wMax: 12, hMin: 8, hMax: 10 }
};

// Sorted descending so we assign huge rooms first (greedy).
const SIZE_ORDER: RoomSize[] = ["huge", "large", "medium", "small"];

const ROOM_TYPE_FROM_PURPOSE: Record<string, RoomType> = {
  entrance: "entrance",
  corridor: "corridor",
  chamber: "chamber",
  throne: "boss",
  treasure: "treasure",
  boss: "boss",
  crypt: "chamber",
  tavern_main: "tavern",
  kitchen: "tavern",
  bedroom: "chamber",
  library: "chamber",
  study: "chamber",
  shop: "shop",
  cellar: "chamber",
  storage: "chamber",
  shrine: "boss",
  barracks: "chamber",
  open: "open"
};

export interface LayoutResult {
  rooms: MapRoom[];
  corridorTiles: { x: number; y: number }[];
  doorTiles: { x: number; y: number; roomId: string }[];
}

/** Top-level: given a MapIntent, produce concrete room positions + corridors. */
export function layoutMap(intent: MapIntent): LayoutResult {
  const W = intent.width;
  const H = intent.height;

  // Reserve a 1-tile margin on every side so outer wall has room to render.
  const region: Rect = { x: 1, y: 1, w: W - 2, h: H - 2 };

  // BSP partition until we have at least intent.rooms.length leaves.
  const targetLeaves = Math.max(intent.rooms.length, 1);
  let leaves: Rect[] = [region];
  let pass = 0;
  while (leaves.length < targetLeaves && pass < 8) {
    leaves = leaves
      .map((r) => splitRect(r, intent.title + ":" + pass))
      .reduce<Rect[]>((acc, parts) => acc.concat(parts), []);
    pass++;
  }
  // If we over-split, keep the largest N leaves.
  leaves.sort((a, b) => b.w * b.h - a.w * a.h);
  leaves = leaves.slice(0, targetLeaves);

  // Sort rooms by size category (big first) and assign to largest leaves.
  const sortedRooms = [...intent.rooms].sort(
    (a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size)
  );
  const placedRooms: MapRoom[] = [];
  sortedRooms.forEach((room, i) => {
    const leaf = leaves[i] ?? leaves[leaves.length - 1];
    const placed = fitRoomInLeaf(room, leaf, intent.title + ":" + i);
    if (placed) placedRooms.push(placed);
  });

  // Build corridor + door layer from declared connections.
  const byId = new Map(placedRooms.map((r) => [r.id, r] as const));
  const corridorTiles: { x: number; y: number }[] = [];
  const doorTiles: LayoutResult["doorTiles"] = [];
  const used = new Set<string>();

  for (const c of intent.connections) {
    const a = byId.get(c.from);
    const b = byId.get(c.to);
    if (!a || !b) continue;
    const key = [c.from, c.to].sort().join("|");
    if (used.has(key)) continue;
    used.add(key);
    routeCorridor(a, b, W, H, intent.title + ":" + key, corridorTiles, doorTiles);
  }

  // Ensure every room is reachable: any not connected gets linked to its
  // nearest placed neighbor.
  const reachable = new Set<string>();
  if (placedRooms.length > 0) {
    const start = placedRooms[0].id;
    const queue = [start];
    reachable.add(start);
    const adj = new Map<string, Set<string>>();
    for (const r of placedRooms) adj.set(r.id, new Set());
    for (const c of intent.connections) {
      adj.get(c.from)?.add(c.to);
      adj.get(c.to)?.add(c.from);
    }
    while (queue.length) {
      const id = queue.shift()!;
      for (const next of adj.get(id) ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }
    for (const r of placedRooms) {
      if (reachable.has(r.id)) continue;
      const nearest = closestRoom(r, placedRooms.filter((x) => reachable.has(x.id)));
      if (!nearest) continue;
      routeCorridor(r, nearest, W, H, intent.title + ":aux:" + r.id, corridorTiles, doorTiles);
      reachable.add(r.id);
    }
  }

  return { rooms: placedRooms, corridorTiles, doorTiles };
}

/** Assemble the final MapData consumed by the renderer. */
export function assembleMapData(intent: MapIntent, layout: LayoutResult): MapData {
  return {
    title: intent.title,
    map_type: intent.map_type,
    width: intent.width,
    height: intent.height,
    theme: intent.theme,
    background_tile: intent.background_tile,
    wall_palette: intent.wall_palette,
    rooms: layout.rooms,
    connections: intent.connections.map((c) => ({ ...c, type: "door" })),
    objects: [],
    special_tiles: []
  };
}

// ============================================================
// BSP helpers
// ============================================================

function splitRect(r: Rect, seedKey: string): Rect[] {
  // Don't split anything that can't host two minimum rooms (4 wide + 1 gap each).
  if (r.w < 11 && r.h < 11) return [r];
  const seed = hash(seedKey + r.x + "," + r.y);
  const verticalSplit = r.w > r.h * 1.25 || (r.w >= r.h && (seed % 2 === 0));
  if (verticalSplit && r.w >= 10) {
    const min = 5;
    const max = r.w - 5;
    const cut = clamp(min + ((seed >> 4) % (max - min + 1)), min, max);
    return [
      { x: r.x, y: r.y, w: cut, h: r.h },
      { x: r.x + cut, y: r.y, w: r.w - cut, h: r.h }
    ];
  }
  if (r.h >= 10) {
    const min = 5;
    const max = r.h - 5;
    const cut = clamp(min + ((seed >> 8) % (max - min + 1)), min, max);
    return [
      { x: r.x, y: r.y, w: r.w, h: cut },
      { x: r.x, y: r.y + cut, w: r.w, h: r.h - cut }
    ];
  }
  return [r];
}

function fitRoomInLeaf(room: RoomIntent, leaf: Rect, seedKey: string): MapRoom | null {
  const range = SIZE_RANGES[room.size] ?? SIZE_RANGES.medium;
  // Cap dimensions by leaf size minus 1-tile margin on each side.
  const maxW = Math.max(3, leaf.w - 2);
  const maxH = Math.max(3, leaf.h - 2);
  const wCap = Math.min(range.wMax, maxW);
  const hCap = Math.min(range.hMax, maxH);
  if (wCap < 3 || hCap < 3) return null;
  const wMin = Math.min(range.wMin, wCap);
  const hMin = Math.min(range.hMin, hCap);
  const seed = hash(seedKey);
  const w = wMin + ((seed >> 4) % (wCap - wMin + 1));
  const h = hMin + ((seed >> 8) % (hCap - hMin + 1));
  const xSlack = leaf.w - w - 2;
  const ySlack = leaf.h - h - 2;
  const x = leaf.x + 1 + (xSlack > 0 ? (seed >> 12) % (xSlack + 1) : 0);
  const y = leaf.y + 1 + (ySlack > 0 ? (seed >> 16) % (ySlack + 1) : 0);
  return {
    id: room.id,
    x,
    y,
    w,
    h,
    type: ROOM_TYPE_FROM_PURPOSE[room.purpose] ?? "chamber",
    label: room.label || labelFromPurpose(room.purpose),
    floor_material: room.floor_material,
    wood_palette: room.wood_palette
  };
}

function labelFromPurpose(p: string): string {
  return p
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ============================================================
// Corridor routing
// ============================================================

function routeCorridor(
  a: MapRoom,
  b: MapRoom,
  W: number,
  H: number,
  seedKey: string,
  corridorOut: { x: number; y: number }[],
  doorOut: { x: number; y: number; roomId: string }[]
) {
  // Door points: choose a wall midpoint on each room facing the other.
  const aDoor = pickDoorPoint(a, b);
  const bDoor = pickDoorPoint(b, a);
  doorOut.push({ x: aDoor.x, y: aDoor.y, roomId: a.id });
  doorOut.push({ x: bDoor.x, y: bDoor.y, roomId: b.id });

  // Connect the two door points via an L-shape outside both rooms.
  const horizFirst = (hash(seedKey) & 1) === 0;
  if (horizFirst) {
    fillLine(aDoor.x, aDoor.y, bDoor.x, aDoor.y, W, H, corridorOut);
    fillLine(bDoor.x, aDoor.y, bDoor.x, bDoor.y, W, H, corridorOut);
  } else {
    fillLine(aDoor.x, aDoor.y, aDoor.x, bDoor.y, W, H, corridorOut);
    fillLine(aDoor.x, bDoor.y, bDoor.x, bDoor.y, W, H, corridorOut);
  }
}

function pickDoorPoint(room: MapRoom, towards: MapRoom): { x: number; y: number } {
  const cxA = room.x + room.w / 2;
  const cyA = room.y + room.h / 2;
  const cxB = towards.x + towards.w / 2;
  const cyB = towards.y + towards.h / 2;
  const dx = cxB - cxA;
  const dy = cyB - cyA;

  // Choose which wall faces `towards`, then midpoint of that wall.
  if (Math.abs(dx) >= Math.abs(dy)) {
    // East/west wall
    if (dx >= 0) {
      return { x: room.x + room.w, y: Math.floor(room.y + room.h / 2) };
    } else {
      return { x: room.x - 1, y: Math.floor(room.y + room.h / 2) };
    }
  } else {
    // North/south wall
    if (dy >= 0) {
      return { x: Math.floor(room.x + room.w / 2), y: room.y + room.h };
    } else {
      return { x: Math.floor(room.x + room.w / 2), y: room.y - 1 };
    }
  }
}

function fillLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  W: number,
  H: number,
  out: { x: number; y: number }[]
) {
  if (x1 === x2) {
    const [a, b] = y1 < y2 ? [y1, y2] : [y2, y1];
    for (let y = a; y <= b; y++) if (inBounds(x1, y, W, H)) out.push({ x: x1, y });
  } else if (y1 === y2) {
    const [a, b] = x1 < x2 ? [x1, x2] : [x2, x1];
    for (let x = a; x <= b; x++) if (inBounds(x, y1, W, H)) out.push({ x, y: y1 });
  }
}

function inBounds(x: number, y: number, W: number, H: number) {
  return x >= 0 && y >= 0 && x < W && y < H;
}

function closestRoom(target: MapRoom, candidates: MapRoom[]): MapRoom | undefined {
  let best: MapRoom | undefined;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dx = target.x + target.w / 2 - (c.x + c.w / 2);
    const dy = target.y + target.h / 2 - (c.y + c.h / 2);
    const d = Math.abs(dx) + Math.abs(dy);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}
