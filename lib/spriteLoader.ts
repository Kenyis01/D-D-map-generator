"use client";

/**
 * Image cache for sprite loading. All sprites are loaded once and reused.
 * Exposes both async (Promise) and sync lookup.
 */
const promiseCache = new Map<string, Promise<HTMLImageElement | null>>();
const syncCache = new Map<string, HTMLImageElement>();

export function loadSprite(url: string): Promise<HTMLImageElement | null> {
  if (promiseCache.has(url)) return promiseCache.get(url)!;
  const p = new Promise<HTMLImageElement | null>((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      syncCache.set(url, img);
      resolve(img);
    };
    img.onerror = () => {
      if (typeof console !== "undefined") console.warn("sprite failed", url);
      resolve(null);
    };
    img.src = url;
  });
  promiseCache.set(url, p);
  return p;
}

/** Synchronous lookup — returns the image only if already decoded, null otherwise. */
export function getSpriteSync(url: string): HTMLImageElement | null {
  return syncCache.get(url) ?? null;
}

export async function loadSprites(urls: string[]): Promise<(HTMLImageElement | null)[]> {
  return Promise.all(urls.map(loadSprite));
}

/** Pre-warm cache with a list of URLs without awaiting (fire and forget). */
export function prefetch(urls: string[]) {
  urls.forEach((u) => loadSprite(u));
}
