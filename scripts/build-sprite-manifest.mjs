#!/usr/bin/env node
/**
 * Scans public/assets/ and writes lib/sprite-manifest.json.
 *
 * Forgotten Adventures filenames encode tile dimensions as `_WxH.<ext>`,
 * e.g. `Round_Table_C1_2x2.png`. This script parses those and emits
 * `{ url, w, h }` entries so the renderer can draw at natural size.
 *
 * Folder layout expected:
 *   public/assets/<object-type>/*.png|*.jpg
 *   public/assets/terrain/<terrain-name>/*.png|*.jpg
 *
 * Run: npm run build:manifest
 */
import { readdirSync, statSync, writeFileSync, existsSync } from "fs";
import { join, relative, sep } from "path";

const ROOT = process.cwd();
const ASSETS_DIR = join(ROOT, "public", "assets");
const OUT_FILE = join(ROOT, "lib", "sprite-manifest.json");

const IMG_EXT = /\.(png|jpe?g|webp)$/i;
const DIM_RE = /_(\d+)x(\d+)\.(?:png|jpe?g|webp)$/i;

if (!existsSync(ASSETS_DIR)) {
  console.error(`✘ ${ASSETS_DIR} does not exist`);
  process.exit(1);
}

function parseDims(filename) {
  const m = filename.match(DIM_RE);
  if (!m) return { w: 1, h: 1 };
  return { w: parseInt(m[1], 10) || 1, h: parseInt(m[2], 10) || 1 };
}

function listSprites(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => IMG_EXT.test(f) && statSync(join(dir, f)).isFile())
    .map((f) => {
      const url = "/" + relative(join(ROOT, "public"), join(dir, f)).split(sep).join("/");
      const { w, h } = parseDims(f);
      return { url, w, h };
    });
}

function listSubdirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory());
}

const objects = {};
const terrain = {};

const topDirs = listSubdirs(ASSETS_DIR);
for (const name of topDirs) {
  const full = join(ASSETS_DIR, name);
  if (name === "terrain") {
    for (const t of listSubdirs(full)) {
      const sprites = listSprites(join(full, t));
      if (sprites.length) terrain[t] = sprites;
    }
  } else {
    const sprites = listSprites(full);
    if (sprites.length) objects[name] = sprites;
  }
}

const manifest = {
  generated_at: new Date().toISOString(),
  total_files: Object.values(objects).reduce((s, a) => s + a.length, 0) +
               Object.values(terrain).reduce((s, a) => s + a.length, 0),
  terrain,
  objects
};

writeFileSync(OUT_FILE, JSON.stringify(manifest, null, 2));

const counts = (obj) =>
  Object.entries(obj)
    .map(([k, v]) => {
      const sizes = v.reduce((acc, s) => {
        const key = `${s.w}x${s.h}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      const sizeStr = Object.entries(sizes)
        .map(([k2, n]) => `${k2}:${n}`)
        .join(",");
      return `  ${k}: ${v.length} [${sizeStr}]`;
    })
    .join("\n");

console.log(`✓ wrote ${OUT_FILE}`);
console.log(`  total files: ${manifest.total_files}`);
console.log(`terrain:\n${counts(terrain)}`);
console.log(`objects:\n${counts(objects)}`);
