"use client";

/**
 * Image cache for sprite loading. Async + sync access.
 */
const promiseCache = new Map<string, Promise<HTMLImageElement | null>>();
const syncCache = new Map<string, HTMLImageElement>();

let loaded = 0;
let failed = 0;

export function loadSprite(url: string): Promise<HTMLImageElement | null> {
  if (promiseCache.has(url)) return promiseCache.get(url)!;
  const p = new Promise<HTMLImageElement | null>((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }
    const img = new Image();
    // Only set crossOrigin for absolute (cross-origin) URLs.
    // Same-origin /public assets don't need (and often break with) CORS attribute.
    if (/^https?:\/\//i.test(url)) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      syncCache.set(url, img);
      loaded++;
      resolve(img);
    };
    img.onerror = () => {
      failed++;
      if (typeof console !== "undefined" && failed <= 5) {
        console.warn("[sprite] failed:", url);
      }
      resolve(null);
    };
    img.src = url;
  });
  promiseCache.set(url, p);
  return p;
}

export function getSpriteSync(url: string): HTMLImageElement | null {
  return syncCache.get(url) ?? null;
}

export async function loadSprites(urls: string[]): Promise<(HTMLImageElement | null)[]> {
  return Promise.all(urls.map(loadSprite));
}

export function prefetch(urls: string[]) {
  urls.forEach((u) => loadSprite(u));
}

export function spriteStats() {
  return { loaded, failed, requested: promiseCache.size };
}
