"use client";

import { useRef, useState } from "react";
import MapCanvas, { MapCanvasHandle } from "./MapCanvas";
import MapTypePicker from "./MapTypePicker";
import AspectRatioPicker, { ASPECT_OPTIONS } from "./AspectRatioPicker";
import RoomLegend from "./RoomLegend";
import { supabase, THUMBNAIL_BUCKET } from "@/lib/supabase";
import type { AspectRatioOption, MapData, MapType } from "@/lib/types";

export default function GeneratorForm() {
  const [prompt, setPrompt] = useState("");
  const [mapType, setMapType] = useState<MapType>("dungeon");
  const [aspect, setAspect] = useState<AspectRatioOption>(ASPECT_OPTIONS[0]);
  const [map, setMap] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const canvasRef = useRef<MapCanvasHandle>(null);

  async function generate(useExisting = false) {
    if (!prompt.trim()) {
      setError("Escribí un prompt primero.");
      return;
    }
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          map_type: mapType,
          width: aspect.width,
          height: aspect.height,
          existing_map: useExisting && map ? map : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Error al generar");
      setMap(data.map as MapData);
    } catch (e: any) {
      setError(e?.message ?? "Error al generar");
    } finally {
      setLoading(false);
    }
  }

  async function downloadPng() {
    if (!map) return;
    const canvas = await canvasRef.current?.exportHiRes(64);
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(map.title) || "map"}.png`;
    a.click();
  }

  async function saveToGallery() {
    if (!map) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const exportCanvas = await canvasRef.current?.exportHiRes(48);
      let thumbnail_url: string | null = null;
      if (exportCanvas) {
        const blob: Blob | null = await new Promise((r) =>
          exportCanvas.toBlob((b) => r(b), "image/png")
        );
        if (blob) {
          const fileName = `${crypto.randomUUID()}.png`;
          const { error: upErr } = await supabase.storage
            .from(THUMBNAIL_BUCKET)
            .upload(fileName, blob, {
              cacheControl: "3600",
              upsert: true,
              contentType: "image/png"
            });
          if (upErr) throw upErr;
          const { data } = supabase.storage
            .from(THUMBNAIL_BUCKET)
            .getPublicUrl(fileName);
          thumbnail_url = data.publicUrl;
        }
      }
      const res = await fetch("/api/maps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: map.title,
          prompt,
          map_data: map,
          thumbnail_url,
          map_type: map.map_type,
          width: map.width,
          height: map.height
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Error al guardar");
      setStatus("Guardado en la galería ✓");
    } catch (e: any) {
      setError(e?.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
      <aside className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium text-text">Prompt</label>
          <textarea
            className="textarea min-h-[140px] resize-y"
            placeholder="Una mazmorra antigua con sala del trono y trampas..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text">Tipo de mapa</label>
          <MapTypePicker value={mapType} onChange={setMapType} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text">Tamaño</label>
          <AspectRatioPicker value={aspect} onChange={setAspect} />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => generate(false)}
            disabled={loading}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {loading ? "Generando..." : "Generar"}
          </button>
          <button
            onClick={() => generate(false)}
            disabled={loading || !prompt}
            className="btn-secondary"
            title="Volver a generar con el mismo prompt"
          >
            Regenerar
          </button>
        </div>

        {map && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <button onClick={saveToGallery} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar en galería"}
            </button>
            <button onClick={downloadPng} className="btn-secondary">
              Descargar PNG
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-700/40 bg-red-900/30 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}
        {status && (
          <div className="rounded-md border border-green-700/40 bg-green-900/30 px-3 py-2 text-sm text-green-200">
            {status}
          </div>
        )}
      </aside>

      <section className="relative min-h-[400px]">
        {map ? (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif-title text-2xl text-accent">{map.title}</h2>
              <span className="text-xs uppercase tracking-wider text-muted">
                {map.map_type} · {map.width}×{map.height}
              </span>
            </div>
            {map.theme && (
              <p className="text-sm text-muted">Tema: {map.theme}</p>
            )}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_220px]">
              <div className="h-[640px]">
                <MapCanvas ref={canvasRef} map={map} />
              </div>
              <RoomLegend map={map} />
            </div>
          </div>
        ) : (
          <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed border-border text-muted">
            El mapa aparecerá acá una vez generado.
          </div>
        )}

        {loading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-bg/70 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <div className="h-12 w-12 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="font-serif-title text-accent">Generando mapa...</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}
