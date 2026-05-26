# Map Style References

The user provided 4 reference images of professional D&D battle maps. These are
our north star for visual quality and structural conventions. Each image is
described below along with the patterns we should replicate.

The renderer and LLM prompt should be tuned to produce maps that approximate
these references.

---

## Reference 1 — Bloody Crypt (top-down stone dungeon)

**Visual character:** Grim dungeon with stone walls and floor; dark red blood
splatter overlays in some rooms (boss chamber, sacrificial areas). Sparse but
purposeful object placement.

**Key patterns:**
- **Uniform stone floor per room** — every floor tile in a room is the same
  cracked stone texture; the visual identity comes from blood overlays and
  furniture, not from texture variation per tile.
- **Walls are SOLID and continuous** — thick dark stone, no random
  "+" / "L" junctions floating around. Continuous outline.
- **Outside of rooms = solid darkness** (carved-in-rock look). No floating
  rooms with negative space gaps between them.
- **Objects against walls** — beds in corners, chests against walls. Center of
  rooms is mostly empty (movement space).
- **One key feature per room** — a single beast skeleton in the center of one
  room; a pool of blood in another; doesn't overcrowd.
- **A blue rug for accent** — a single colored rug stands out in an otherwise
  monochrome stone room.

---

## Reference 2 — Wizard tower interiors (Tom Cartos)

**Visual character:** Cozy wooden-floor wizard study with red carpeted rooms
upstairs. Multi-level building (stairs visible).

**Key patterns:**
- **Different floor material per ROOM purpose** — main floor is wooden
  planks; bedrooms have red carpets/rugs; some rooms have stone. NOT random
  per tile — the floor is the room's identity.
- **Bookshelves line the walls** — they form the perimeter of the library,
  not scattered randomly. The "wall" of the room is bookshelves.
- **Beds against walls in corners** — never centered. 1x2 beds aligned to
  the room corner with the headboard against the wall.
- **Tables in centers, chairs around them** — a clear "dining" or "study"
  arrangement.
- **Stairs are dedicated tiles** with their own art (railings, treads).
- **Fireplaces along walls** with carpeted seating in front.

---

## Reference 3 — The Book Wyrm's Treasure (cozy tavern/library)

**Visual character:** Inviting, cluttered library/tavern with cracked stone
floor, green leather furniture (couches, beds), built-in bookshelves lining
walls.

**Key patterns:**
- **One uniform stone floor texture across the whole building** — cracked
  diagonal stone everywhere. Variations come from rugs and objects, not
  floor swaps.
- **Bookshelves form the WALL of the room** — not as objects floating in
  free tiles. They are the architecture.
- **Furniture palette consistency** — all the couches, beds, chairs are
  green wool. The wood (tables, shelves) is all the same warm brown.
  No mixed materials.
- **Object clustering** — couches grouped around a coffee table.
  Beds grouped in one half. Reading desks against the wall.
- **Title at the bottom** — labeled professionally with location info.

---

## Reference 4 — Archive of St. Sigmund (outdoor library)

**Visual character:** Large rectangular stone building on a grassy field. Inside
is a wooden floor full of bookshelves arranged in library stacks.

**Key patterns:**
- **Outdoor terrain wraps the building** — grass extends past the walls. Trees
  scattered around the perimeter. Path leading in.
- **Inside is uniform wooden floor** — single texture for the whole interior.
- **Library stacks in rows** — bookshelves placed in repeating columns like
  a real library, not scattered. This is the room's geometry.
- **Tables at the ends of stacks** — workstation arrangement.
- **Rugs as feature accents** — central position in some rooms.
- **Walls are thick stone visible from outside** — frame the building like a
  cartographer's outline.
- **Compass + scale legend** — added on the map for cartographer feel.

---

## Style principles to encode

Distilled rules the renderer + LLM prompt must enforce:

1. **One floor texture per ROOM, not per tile.** Variants exist for visual
   variety BETWEEN rooms, not within them.

2. **Floor material follows room purpose**:
   - Throne room / chapel / treasury → polished tile (Herringbone, Rectangular_Tiles, Marble)
   - Crypt / dungeon / corridor → cracked stone, dirt-stained
   - Library / study / bedroom → wooden floor (warm tone)
   - Tavern / kitchen / common area → wood or rustic stone
   - Basement / cellar → cracked dirt or rough cave floor

3. **Walls are thick, solid, continuous.** Treat the non-room area as solid
   carved rock for dungeons or natural terrain (grass/dirt) for outdoor.

4. **Furniture palette per room is internally consistent.** All wood in a
   tavern's main hall should be the same color (Ashen or Walnut, not mixed).
   The LLM should pick ONE wood color per room.

5. **Objects against walls, not floating in centers.** Bookshelves, beds,
   weapon racks, tables-of-state should be anchored to walls. The center of
   the room is mostly open (movement space) with maybe a single feature
   (rug, altar, fountain, fire pit).

6. **Multi-tile objects respected**: a 2x2 round table covers 4 tiles, a 1x2
   bed covers 2 tiles. The renderer must use FA's `_WxH` suffix.

7. **Empty negative space is filled**: outdoors = continuous terrain; dungeons
   = continuous carved stone. Never bare canvas between rooms.

8. **One signature feature per room** — an altar, a sarcophagus, a forge, a
   gold pile. Don't overcrowd 3x3 rooms with 10 different objects.
