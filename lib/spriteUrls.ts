/**
 * Verified sprite URLs from Kenney's RPG Base pack (CC0).
 * Mirror: https://github.com/iwenzhou/kenney
 *
 * Categories without sprites here use procedural drawing as fallback
 * (see lib/mapRenderer.ts). The procedural drawings are stylized to match
 * the pixel-art look of these sprites.
 */
import type { SpriteLibrary } from "./sprites";

const BASE =
  "https://raw.githubusercontent.com/iwenzhou/kenney/master/Art%20(5190%20files)/RPG%20pack%20(230%20assets)/PNG";

const t = (n: number) => `${BASE}/rpgTile${String(n).padStart(3, "0")}.png`;

export const SPRITE_URLS: SpriteLibrary = {
  terrain: {
    stone_floor: [t(132), t(152), t(131), t(151)],
    grass: [t(22)],
    dirt: [t(27)],
    wood_floor: [t(122), t(121)]
  },
  special: {
    wall: [], // procedural — carved stone block
    water: [t(33)],
    lava: [], // procedural
    void: [], // procedural
    road: [t(50)],
    forest: [t(175), t(195), t(178), t(200)]
  },
  objects: {
    chest: [], // procedural — wooden chest with iron bands
    door: [t(207), t(209), t(211), t(217)],
    pillar: [], // procedural — round stone pillar
    trap: [], // procedural
    altar: [], // procedural
    table: [], // procedural
    barrel: [t(183), t(193)],
    tree: [t(200), t(205), t(225), t(197)],
    house: [], // procedural
    well: [] // procedural
  },
  roomFloor: {}
};
