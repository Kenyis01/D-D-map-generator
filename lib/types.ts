export type MapType = "dungeon" | "overworld" | "town" | "interior";

export type BackgroundTile = "stone_floor" | "grass" | "dirt" | "wood_floor";

export type RoomType =
  | "entrance"
  | "corridor"
  | "chamber"
  | "boss"
  | "treasure"
  | "shop"
  | "tavern"
  | "open";

export type ConnectionType = "door" | "arch" | "stairs" | "path";

export type ObjectType =
  | "chest"
  | "door"
  | "pillar"
  | "trap"
  | "altar"
  | "table"
  | "barrel"
  | "tree"
  | "house"
  | "well"
  | "skull"
  | "bones"
  | "candle"
  | "statue"
  | "bookshelf"
  | "bed"
  | "weapon_rack"
  | "web"
  | "crate"
  | "debris"
  | "campfire"
  | "rug"
  | "fountain"
  // Extra types backed by FA sprites:
  | "torch"
  | "brazier"
  | "lantern"
  | "fireplace"
  | "treasure"
  | "tombstone"
  | "coffin"
  | "seating"
  | "rock"
  | "bush"
  | "flower"
  | "mushroom"
  | "stairs"
  | "cobweb"
  | "weapon_sword"
  | "weapon_axe"
  | "armor_stand"
  | "beast_bones";

export type SpecialTileType =
  | "wall"
  | "water"
  | "lava"
  | "void"
  | "road"
  | "forest";

export interface MapRoom {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: RoomType;
  label?: string;
}

export interface MapConnection {
  from: string;
  to: string;
  type: ConnectionType;
}

export interface MapObject {
  x: number;
  y: number;
  type: ObjectType;
}

export interface MapSpecialTile {
  x: number;
  y: number;
  type: SpecialTileType;
}

export interface MapData {
  title: string;
  map_type: MapType;
  width: number;
  height: number;
  theme: string;
  background_tile: BackgroundTile;
  rooms: MapRoom[];
  connections: MapConnection[];
  objects: MapObject[];
  special_tiles: MapSpecialTile[];
}

export interface SavedMap {
  id: string;
  title: string;
  prompt: string;
  map_data: MapData;
  thumbnail_url: string | null;
  map_type: MapType;
  width: number;
  height: number;
  created_at: string;
}

export interface GenerateRequest {
  prompt: string;
  map_type?: MapType;
  width?: number;
  height?: number;
  existing_map?: MapData;
}

export interface AspectRatioOption {
  label: string;
  width: number;
  height: number;
}
