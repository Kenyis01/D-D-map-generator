/**
 * Deterministic object placer.
 *
 * For each room produced by lib/layout.ts:
 *   1. Compute geometry (perimeter ring, corners, interior, walls by cardinal,
 *      door tiles to avoid).
 *   2. Look up the rulebook for the room's purpose (lib/purposeRules.ts).
 *   3. Apply each required + optional feature using its declared
 *      PlacementStrategy. Track placed objects and reserved tiles to avoid
 *      overlap.
 *   4. Add lights along the perimeter at the rate the rulebook specifies.
 *   5. Add corridor decorations (sconces, the occasional cobweb) from the
 *      corridorTiles list.
 *
 * The LLM never touches coordinates. It only gives the room's purpose +
 * material; this module fills in the rest.
 */

import type { LayoutResult } from "./layout";
import type { MapData, MapObject, MapRoom, ObjectType, RoomPurpose } from "./types";
import {
  type FeatureRule,
  type PlacementStrategy,
  resolveCount,
  rulesFor
} from "./purposeRules";

interface Geometry {
  /** Tiles inside the room (excluding walls). */
  interior: Set<string>;
  /** Tiles inside the room adjacent to a wall (the perimeter ring). */
  perimeter: { x: number; y: number; side: "N" | "E" | "S" | "W" }[];
  /** Group perimeter by which wall they hug. */
  byCardinal: Record<"N" | "E" | "S" | "W", { x: number; y: number }[]>;
  /** The 4 inner-corner tiles (clockwise from top-left). */
  corners: { x: number; y: number }[];
  /** Tiles deep inside (≥2 from any wall) — for D&D combat lane interior placement. */
  deepInterior: { x: number; y: number }[];
  /** Centroid (integer). */
  centroid: { x: number; y: number };
  /** Door entry tiles to avoid (door + 1-tile clearance). */
  blocked: Set<string>;
  /** Whether the wider span is horizontal (E-W). */
  isWide: boolean;
}

export function placeObjectsForMap(
  mapData: MapData,
  layout: LayoutResult
): MapObject[] {
  const placed: MapObject[] = [];
  /** Reserved tile keys, shared across rooms, so corridor lights don't land
   * on the same tile as a room-adjacent door. */
  const reserved = new Set<string>();

  for (const room of mapData.rooms) {
    const geom = computeGeometry(room, layout, mapData.width);
    const rules = rulesFor(room.type as RoomPurpose);

    // 1) Required features.
    for (const rule of rules.required) {
      applyRule(rule, room, geom, placed, reserved, mapData.width);
    }
    // 2) Optional features with probability roll (seeded by room id).
    let probCounter = 0;
    for (const rule of rules.optional) {
      const seed = hash(room.id + ":" + (rule.type as string) + ":" + probCounter++);
      const roll = (seed % 1000) / 1000;
      if (roll > (rule.prob ?? 1)) continue;
      applyRule(rule, room, geom, placed, reserved, mapData.width);
    }
    // 3) Lights along perimeter.
    addLights(rules, room, geom, placed, reserved, mapData.width);
  }

  // 4) Corridor decoration: sconces every 4-6 tiles + occasional cobweb at
  //    bends.
  addCorridorDecoration(layout, placed, reserved, mapData.width);

  return placed;
}

// ============================================================
// Placement strategies
// ============================================================

function applyRule(
  rule: FeatureRule,
  room: MapRoom,
  geom: Geometry,
  out: MapObject[],
  reserved: Set<string>,
  W: number
) {
  const area = room.w * room.h;
  const count = resolveCount(rule, area);

  switch (rule.placement) {
    case "corner_long_wall":
      placeCornerLongWall(rule, geom, out, reserved, W, count);
      break;
    case "wall":
      placeAlongPerimeter(rule, geom, out, reserved, W, count);
      break;
    case "wall_continuous":
      placeWallContinuous(rule, room, geom, out, reserved, W);
      break;
    case "foot_of_bed":
      placeAtAnchor(rule, "bed", out, reserved, W, +1, 0);
      break;
    case "beside_bed":
      placeAtAnchor(rule, "bed", out, reserved, W, -1, 0);
      break;
    case "wall_opposite":
      placeOpposite(rule, room, geom, out, reserved, W, count);
      break;
    case "center":
      placeCenter(rule, geom, out, reserved, W);
      break;
    case "interior_open":
      placeInteriorOpen(rule, geom, out, reserved, W, count);
      break;
    case "around":
      placeAround(rule, geom, out, reserved, W, count);
      break;
    case "cluster_far_corner":
      placeClusterFarCorner(rule, room, geom, out, reserved, W, count);
      break;
    case "corners":
      placeCorners(rule, geom, out, reserved, W, Math.min(count, 4));
      break;
  }
}

function placeCornerLongWall(
  rule: FeatureRule,
  geom: Geometry,
  out: MapObject[],
  reserved: Set<string>,
  W: number,
  count: number
) {
  // Place against the longer wall. For a bed (1×2): head against long wall.
  // Picks the first valid corner.
  const longSide = geom.isWide ? "N" : "W";
  const candidates = geom.byCardinal[longSide];
  let placedN = 0;
  for (const c of candidates) {
    if (placedN >= count) break;
    if (tryPlace(rule.type, c.x, c.y, out, reserved, W, rule.contents)) placedN++;
  }
}

function placeAlongPerimeter(
  rule: FeatureRule,
  geom: Geometry,
  out: MapObject[],
  reserved: Set<string>,
  W: number,
  count: number
) {
  const seed = hash(rule.type + ":" + (geom.centroid.x + geom.centroid.y));
  const ordered = shuffle(geom.perimeter.map((p) => ({ x: p.x, y: p.y })), seed);
  const spacing = rule.spacing ?? 0;
  let placedN = 0;
  for (const tile of ordered) {
    if (placedN >= count) break;
    if (spacing > 0 && nearAnyPlaced(tile.x, tile.y, rule.type, out, spacing)) continue;
    if (tryPlace(rule.type, tile.x, tile.y, out, reserved, W, rule.contents)) placedN++;
  }
}

function placeWallContinuous(
  rule: FeatureRule,
  room: MapRoom,
  geom: Geometry,
  out: MapObject[],
  reserved: Set<string>,
  W: number
) {
  // Pick the longest wall side; fill `coverage` of its length contiguously.
  const sides: ("N" | "E" | "S" | "W")[] = ["N", "S", "E", "W"];
  let bestSide: "N" | "E" | "S" | "W" = "N";
  let bestLen = 0;
  for (const s of sides) {
    if (geom.byCardinal[s].length > bestLen) {
      bestLen = geom.byCardinal[s].length;
      bestSide = s;
    }
  }
  const wall = geom.byCardinal[bestSide];
  const target = Math.max(1, Math.floor(wall.length * (rule.coverage ?? 0.6)));
  // Start near the midpoint, expand outward to keep it centered.
  const mid = Math.floor(wall.length / 2);
  const start = Math.max(0, mid - Math.floor(target / 2));
  const end = Math.min(wall.length, start + target);
  for (let i = start; i < end; i++) {
    const t = wall[i];
    tryPlace(rule.type, t.x, t.y, out, reserved, W, rule.contents);
  }
}

function placeAtAnchor(
  rule: FeatureRule,
  anchorType: ObjectType,
  out: MapObject[],
  reserved: Set<string>,
  W: number,
  dx: number,
  dy: number
) {
  const anchor = out.find((o) => o.type === anchorType);
  if (!anchor) return;
  tryPlace(rule.type, anchor.x + dx, anchor.y + dy, out, reserved, W, rule.contents);
}

function placeOpposite(
  rule: FeatureRule,
  room: MapRoom,
  geom: Geometry,
  out: MapObject[],
  reserved: Set<string>,
  W: number,
  count: number
) {
  const anchor = rule.anchor && out.find((o) => o.type === rule.anchor);
  if (!anchor) {
    // No anchor — fall back to plain wall placement.
    placeAlongPerimeter(rule, geom, out, reserved, W, count);
    return;
  }
  // "Opposite" = the wall furthest from the anchor.
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  const dx = anchor.x - cx;
  const dy = anchor.y - cy;
  const opposite: "N" | "E" | "S" | "W" =
    Math.abs(dx) >= Math.abs(dy)
      ? dx > 0 ? "W" : "E"
      : dy > 0 ? "N" : "S";
  const wall = geom.byCardinal[opposite];
  const seed = hash(rule.type + ":opp:" + anchor.x);
  const ordered = shuffle(wall.slice(), seed);
  let placedN = 0;
  for (const t of ordered) {
    if (placedN >= count) break;
    if (tryPlace(rule.type, t.x, t.y, out, reserved, W, rule.contents)) placedN++;
  }
}

function placeCenter(
  rule: FeatureRule,
  geom: Geometry,
  out: MapObject[],
  reserved: Set<string>,
  W: number
) {
  tryPlace(rule.type, geom.centroid.x, geom.centroid.y, out, reserved, W, rule.contents);
}

function placeInteriorOpen(
  rule: FeatureRule,
  geom: Geometry,
  out: MapObject[],
  reserved: Set<string>,
  W: number,
  count: number
) {
  const seed = hash(rule.type + ":" + geom.centroid.x);
  const ordered = shuffle(geom.deepInterior.slice(), seed);
  let placedN = 0;
  for (const t of ordered) {
    if (placedN >= count) break;
    // Min-distance 2 between dining tables / interior props.
    if (nearAnyPlaced(t.x, t.y, rule.type, out, 2)) continue;
    if (tryPlace(rule.type, t.x, t.y, out, reserved, W, rule.contents)) placedN++;
  }
}

function placeAround(
  rule: FeatureRule,
  geom: Geometry,
  out: MapObject[],
  reserved: Set<string>,
  W: number,
  count: number
) {
  if (!rule.anchor) return;
  // Anchors = all currently-placed objects of the requested type that live
  // in this room AND are NOT on the perimeter (we don't want chairs around a
  // wall-mounted bar — only around interior dining tables / desks).
  const anchors = out.filter((o) => {
    if (o.type !== rule.anchor) return false;
    if (!geom.interior.has(o.x + "," + o.y)) return false;
    // exclude perimeter ring
    for (const p of geom.perimeter) {
      if (p.x === o.x && p.y === o.y) return false;
    }
    return true;
  });
  if (anchors.length === 0) return;

  const offsets = [
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 }
  ];
  // Place `count` chairs around EACH dining anchor.
  for (const anchor of anchors) {
    let placedN = 0;
    for (const o of offsets) {
      if (placedN >= count) break;
      if (tryPlace(rule.type, anchor.x + o.dx, anchor.y + o.dy, out, reserved, W, rule.contents)) {
        placedN++;
      }
    }
  }
}

function placeClusterFarCorner(
  rule: FeatureRule,
  room: MapRoom,
  geom: Geometry,
  out: MapObject[],
  reserved: Set<string>,
  W: number,
  count: number
) {
  // Find the corner farthest from blocked (doors) tiles.
  const blockedPts: { x: number; y: number }[] = [];
  for (const k of geom.blocked.values()) {
    const [xs, ys] = k.split(",");
    blockedPts.push({ x: +xs, y: +ys });
  }
  let bestCorner = geom.corners[0];
  let bestDist = -1;
  for (const c of geom.corners) {
    let minD = Infinity;
    for (const b of blockedPts) {
      const d = Math.abs(c.x - b.x) + Math.abs(c.y - b.y);
      if (d < minD) minD = d;
    }
    if (minD > bestDist) {
      bestDist = minD;
      bestCorner = c;
    }
  }
  // Place count items spiraling out from that corner.
  const spiral = [
    { dx: 0, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 1, dy: 1 },
    { dx: 2, dy: 0 },
    { dx: 0, dy: 2 }
  ];
  let placedN = 0;
  // The corner might be at any extreme of the room — adjust step direction.
  const stepX = bestCorner.x < room.x + room.w / 2 ? 1 : -1;
  const stepY = bestCorner.y < room.y + room.h / 2 ? 1 : -1;
  for (const s of spiral) {
    if (placedN >= count) break;
    const x = bestCorner.x + s.dx * stepX;
    const y = bestCorner.y + s.dy * stepY;
    if (!geom.interior.has(x + "," + y)) continue;
    if (tryPlace(rule.type, x, y, out, reserved, W, rule.contents)) placedN++;
  }
}

function placeCorners(
  rule: FeatureRule,
  geom: Geometry,
  out: MapObject[],
  reserved: Set<string>,
  W: number,
  count: number
) {
  for (let i = 0; i < Math.min(count, geom.corners.length); i++) {
    const c = geom.corners[i];
    tryPlace(rule.type, c.x, c.y, out, reserved, W, rule.contents);
  }
}

// ============================================================
// Lights + corridor decoration
// ============================================================

function addLights(
  rules: ReturnType<typeof rulesFor>,
  room: MapRoom,
  geom: Geometry,
  out: MapObject[],
  reserved: Set<string>,
  W: number
) {
  const area = room.w * room.h;
  const target = Math.max(1, Math.min(4, Math.floor(area / rules.lightsPerTiles)));
  // Distribute roughly evenly along the perimeter.
  if (geom.perimeter.length === 0) return;
  const step = Math.max(1, Math.floor(geom.perimeter.length / target));
  let placedN = 0;
  for (let i = 0; i < geom.perimeter.length && placedN < target; i += step) {
    const t = geom.perimeter[i];
    if (tryPlace(rules.lightType, t.x, t.y, out, reserved, W)) placedN++;
  }
}

function addCorridorDecoration(
  layout: LayoutResult,
  out: MapObject[],
  reserved: Set<string>,
  W: number
) {
  // Sconces (torches) every ~5 tiles along the corridor path.
  if (layout.corridorTiles.length < 3) return;
  const seed = hash("corridor:" + layout.corridorTiles.length);
  const shuffled = shuffle(layout.corridorTiles.slice(), seed);
  const sconces = Math.floor(layout.corridorTiles.length / 5);
  let placedN = 0;
  for (const t of shuffled) {
    if (placedN >= sconces) break;
    // Avoid placing on a door tile.
    if (isNearDoor(t.x, t.y, layout.doorTiles, 1)) continue;
    if (tryPlace("torch", t.x, t.y, out, reserved, W)) placedN++;
  }
}

// ============================================================
// Geometry computation
// ============================================================

function computeGeometry(
  room: MapRoom,
  layout: LayoutResult,
  _W: number
): Geometry {
  const interior = new Set<string>();
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      interior.add(x + "," + y);
    }
  }

  const perimeter: { x: number; y: number; side: "N" | "E" | "S" | "W" }[] = [];
  const byCardinal: Geometry["byCardinal"] = { N: [], E: [], S: [], W: [] };
  // Top edge (N)
  for (let x = room.x; x < room.x + room.w; x++) {
    perimeter.push({ x, y: room.y, side: "N" });
    byCardinal.N.push({ x, y: room.y });
  }
  // Bottom edge (S)
  for (let x = room.x; x < room.x + room.w; x++) {
    perimeter.push({ x, y: room.y + room.h - 1, side: "S" });
    byCardinal.S.push({ x, y: room.y + room.h - 1 });
  }
  // Left edge (W) excluding corners
  for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
    perimeter.push({ x: room.x, y, side: "W" });
    byCardinal.W.push({ x: room.x, y });
  }
  // Right edge (E) excluding corners
  for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
    perimeter.push({ x: room.x + room.w - 1, y, side: "E" });
    byCardinal.E.push({ x: room.x + room.w - 1, y });
  }

  // Door tiles inside this room (where the corridor enters).
  // The layout puts door tiles ON the wall outside the room. The IN-ROOM
  // door tile is the perimeter tile adjacent to that wall position.
  const blocked = new Set<string>();
  for (const d of layout.doorTiles) {
    if (d.roomId !== room.id) continue;
    const candidates: { x: number; y: number }[] = [];
    if (d.x === room.x - 1) candidates.push({ x: room.x, y: d.y });
    if (d.x === room.x + room.w) candidates.push({ x: room.x + room.w - 1, y: d.y });
    if (d.y === room.y - 1) candidates.push({ x: d.x, y: room.y });
    if (d.y === room.y + room.h) candidates.push({ x: d.x, y: room.y + room.h - 1 });
    for (const c of candidates) {
      // Block the door tile plus 1-tile clearance in each direction.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          blocked.add(c.x + dx + "," + (c.y + dy));
        }
      }
    }
  }

  // Drop blocked tiles from perimeter / byCardinal.
  const filtered = perimeter.filter((p) => !blocked.has(p.x + "," + p.y));
  for (const side of ["N", "E", "S", "W"] as const) {
    byCardinal[side] = byCardinal[side].filter((p) => !blocked.has(p.x + "," + p.y));
  }

  const corners = [
    { x: room.x, y: room.y },
    { x: room.x + room.w - 1, y: room.y },
    { x: room.x + room.w - 1, y: room.y + room.h - 1 },
    { x: room.x, y: room.y + room.h - 1 }
  ];

  const deepInterior: { x: number; y: number }[] = [];
  for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
    for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
      if (!blocked.has(x + "," + y)) deepInterior.push({ x, y });
    }
  }

  return {
    interior,
    perimeter: filtered,
    byCardinal,
    corners,
    deepInterior,
    centroid: {
      x: Math.floor(room.x + room.w / 2),
      y: Math.floor(room.y + room.h / 2)
    },
    blocked,
    isWide: room.w >= room.h
  };
}

// ============================================================
// Low-level helpers
// ============================================================

function tryPlace(
  type: ObjectType,
  x: number,
  y: number,
  out: MapObject[],
  reserved: Set<string>,
  _W: number,
  contents?: string
): boolean {
  const k = x + "," + y;
  if (reserved.has(k)) return false;
  reserved.add(k);
  const obj: MapObject = { x, y, type };
  if (contents) obj.contents = contents;
  out.push(obj);
  return true;
}

function nearAnyPlaced(
  x: number,
  y: number,
  type: ObjectType,
  out: MapObject[],
  spacing: number
): boolean {
  for (const o of out) {
    if (o.type !== type) continue;
    if (Math.abs(o.x - x) + Math.abs(o.y - y) < spacing) return true;
  }
  return false;
}

function isNearDoor(
  x: number,
  y: number,
  doors: { x: number; y: number }[],
  range: number
): boolean {
  for (const d of doors) {
    if (Math.abs(d.x - x) + Math.abs(d.y - y) <= range) return true;
  }
  return false;
}

function shuffle<T>(arr: T[], seed: number): T[] {
  // Deterministic Fisher–Yates using a linear congruential generator.
  let s = seed || 1;
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
