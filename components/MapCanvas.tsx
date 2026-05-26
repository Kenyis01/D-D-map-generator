"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { renderMap, renderToExportCanvas } from "@/lib/mapRenderer";
import type { MapData } from "@/lib/types";

export interface MapCanvasHandle {
  toBlob: (type?: string, quality?: number) => Promise<Blob | null>;
  toDataURL: (type?: string) => string | null;
  /** Build a fresh high-resolution canvas suitable for PNG export. */
  exportHiRes: (tileSize?: number) => Promise<HTMLCanvasElement | null>;
}

interface Props {
  map: MapData;
  showGrid?: boolean;
  showBadges?: boolean;
  className?: string;
  /** Optional fixed tile size in CSS pixels (otherwise fits container). */
  tileSize?: number;
}

const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(
  { map, showGrid = true, showBadges = true, className, tileSize },
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
      const ts =
        tileSize ?? Math.floor(Math.min(w / map.width, h / map.height));
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
      async exportHiRes(ts = 64) {
        return renderToExportCanvas(map, ts);
      }
    }),
    [map]
  );

  return (
    <div
      ref={wrapperRef}
      className={
        "relative flex h-full w-full items-center justify-center overflow-auto rounded-md border border-border bg-black/40 p-2 " +
        (className ?? "")
      }
    >
      <canvas ref={canvasRef} className="block max-w-full" />
    </div>
  );
});

export default MapCanvas;
