"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { renderMap, renderToExportCanvas } from "@/lib/mapRenderer";
import type { MapData } from "@/lib/types";

const MIN_TILE_SIZE = 32; // never render tiles smaller than this on screen
const MAX_TILE_SIZE = 56; // cap so a 24-tile map doesn't get cartoonishly huge on big screens

export interface MapCanvasHandle {
  toBlob: (type?: string, quality?: number) => Promise<Blob | null>;
  toDataURL: (type?: string) => string | null;
  /** Build a fresh high-resolution canvas suitable for PNG export. */
  exportHiRes: (
    tileSize?: number,
    opts?: { showGrid?: boolean }
  ) => Promise<HTMLCanvasElement | null>;
}

interface Props {
  map: MapData;
  showGrid?: boolean;
  showBadges?: boolean;
  className?: string;
  /** Optional fixed tile size in CSS pixels (otherwise auto). */
  tileSize?: number;
}

const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(
  { map, showGrid = true, showBadges = false, className, tileSize },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapperRef.current;
    if (!canvas || !wrap) return;

    function draw() {
      if (!canvas || !wrap) return;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      // Try to fit, but never go below MIN_TILE_SIZE (the wrapper just
      // scrolls if the map doesn't fit on screen) and never above MAX.
      const fitTs = Math.floor(Math.min(w / map.width, h / map.height));
      const ts = tileSize ?? Math.max(MIN_TILE_SIZE, Math.min(MAX_TILE_SIZE, fitTs));
      canvas.style.width = `${ts * map.width}px`;
      canvas.style.height = `${ts * map.height}px`;
      renderMap(canvas, map, { tileSize: ts, showGrid, showBadges });
    }

    draw();
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [map, showGrid, showBadges, tileSize]);

  useImperativeHandle(
    ref,
    () => ({
      toBlob(type = "image/png", quality) {
        return new Promise((resolve) => {
          const c = canvasRef.current;
          if (!c) return resolve(null);
          c.toBlob((b) => resolve(b), type, quality);
        });
      },
      toDataURL(type = "image/png") {
        return canvasRef.current?.toDataURL(type) ?? null;
      },
      async exportHiRes(ts = 64, opts) {
        return renderToExportCanvas(map, ts, { showGrid: opts?.showGrid ?? true });
      }
    }),
    [map]
  );

  // Wrapper's aspect ratio matches the map's so there's no big black space
  // top/bottom (or left/right) when the map shape differs from the viewport.
  const aspect = `${map.width} / ${map.height}`;

  return (
    <div
      ref={wrapperRef}
      style={{ aspectRatio: aspect }}
      className={
        "relative flex w-full items-start justify-start overflow-auto rounded-md border border-border bg-black/40 p-2 " +
        (className ?? "")
      }
    >
      <canvas ref={canvasRef} className="block" />
    </div>
  );
});

export default MapCanvas;
