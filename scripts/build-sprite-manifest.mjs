#!/usr/bin/env node
/**
 * Scans public/assets/ and writes lib/sprite-manifest.json.
 *
 * Folder layout expected:
 *   public/assets/<object-type>/*.png|*.jpg
 *   public/assets/terrain/<terrain-name>/*.png|*.jpg
 *
 * Manifest format:
 *   {
 *     "objects": { "chest": ["/assets/chest/Chest_01.png", ...], ... },
 *     "terrain": { "stone_floor": [...], ... },
 *     "generated_at": "ISO timestamp",
 *     "total_files": 1056
 *   }
 *
 * Run: node scripts/build-sprite-manifest.mjs
 */
import { readdirSync, statSync, writeFileSync, existsSync } from "fs";
import { join, relative, sep } from "path";

const ROOT = process.cwd();
const ASSETS_DIR = join(ROOT, "public", "assets");
const OUT_FILE = join(ROOT, "lib", "sprite-manifest.json");

const IMG_EXT = /\.(png|jpe?g|webp)$/i;

if (!existsSync(ASSETS_DIR)) {
  console.error(`✘ ${ASSETS_DIR} does not exist`);
  process.exit(1);
}

function listImages(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => IMG_EXT.test(f) && statSync(join(dir, f)).isFile())
    .map((f) => "/" + relative(join(ROOT, "public"), join(dir, f)).split(sep).join("/"));
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
      const files = listImages(join(full, t));
      if (files.length) terrain[t] = files;
    }
  } else {
    const files = listImages(full);
    if (files.length) objects[name] = files;
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
    .map(([k, v]) => `  ${k}: ${v.length}`)
    .join("\n");

console.log(`✓ wrote ${OUT_FILE}`);
console.log(`  total files: ${manifest.total_files}`);
console.log(`terrain:\n${counts(terrain)}`);
console.log(`objects:\n${counts(objects)}`);
