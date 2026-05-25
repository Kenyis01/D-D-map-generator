/**
 * Verified sprite URLs from CC0/CC-BY-SA repos.
 * Sources:
 *  - https://github.com/iwenzhou/kenney  (CC0)
 *  - https://github.com/ElizaWy/LPC      (CC-BY-SA 3.0)
 *
 * This file is auto-curated. Entries may be empty arrays — the renderer falls
 * back to procedural drawing for any missing type, so partial coverage is fine.
 */
import type { SpriteLibrary } from "./sprites";

export const SPRITE_URLS: SpriteLibrary = {
  terrain: {
    stone_floor: [],
    grass: [],
    dirt: [],
    wood_floor: []
  },
  special: {
    wall: [],
    water: [],
    lava: [],
    void: [],
    road: [],
    forest: []
  },
  objects: {
    chest: [],
    door: [],
    pillar: [],
    trap: [],
    altar: [],
    table: [],
    barrel: [],
    tree: [],
    house: [],
    well: []
  },
  roomFloor: {}
};
