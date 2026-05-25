"use client";

import { useState } from "react";
import { renderToExportCanvas } from "@/lib/mapRenderer";
import type { MapData, SavedMap } from "@/lib/types";

interface Props {
  map: SavedMap;
  onDeleted: (id: string) => void;
  onUpdated: (m: SavedMap) => void;
}

export default function MapCard({ map, onDeleted, onUpdated }: Props) {
  const [modifying, setModifying] = useState(false);
  const [modifyPrompt, setModifyPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm("¿Eliminar este mapa para siempre?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/maps/${map.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Error");
      onDeleted(map.id);
    } catch (e: any) {
      setError(e?.message ?? "Error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    const canvas = await renderToExportCanvas(map.map_data, 64);
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${map.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "map"}.png`;
    a.click();
  }

  async function handleModify() {
    if (!modifyPrompt.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: modifyPrompt,
          map_type: map.map_type,
          width: map.width,
          height: map.height,
          existing_map: map.map_data
        })
      });
      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData?.error ?? "Error al modificar");
      const newMap: MapData = genData.map;

      const patchRes = await fetch(`/api/maps/${map.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          map_data: newMap,
          title: newMap.title,
          prompt: `${map.prompt}\n\n[MOD] ${modifyPrompt}`
        })
      });
      const patchData = await patchRes.json();
      if (!patchRes.ok) throw new Error(patchData?.error ?? "Error");
      onUpdated(patchData.map);
      setModifying(false);
      setModifyPrompt("");
    } catch (e: any) {
      setError(e?.message ?? "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <article className="card overflow-hidden">
        <div className="relative aspect-[4/3] bg-black/40">
          {map.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={map.thumbnail_url}
              alt={map.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted text-xs">
              Sin thumbnail
            </div>
          )}
        </div>
        <div className="space-y-2 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-serif-title text-lg text-accent line-clamp-1">
              {map.title}
            </h3>
            <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted">
              {map.map_type}
            </span>
          </div>
          <p className="line-clamp-2 text-xs text-muted">{map.prompt}</p>
          <p className="text-[10px] text-muted">
            {new Date(map.created_at).toLocaleString()}
          </p>
          <div className="flex flex-wrap gap-1 pt-2">
            <button
              onClick={handleDownload}
              disabled={busy}
              className="btn-secondary !px-2 !py-1 text-xs"
            >
              ⬇ PNG
            </button>
            <button
              onClick={() => setModifying(true)}
              disabled={busy}
              className="btn-secondary !px-2 !py-1 text-xs"
            >
              ✦ Modificar
            </button>
            <button
              onClick={handleDelete}
              disabled={busy}
              className="btn-danger !px-2 !py-1 text-xs"
            >
              ✕ Eliminar
            </button>
          </div>
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
      </article>

      {modifying && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => !busy && setModifying(false)}
        >
          <div
            className="card w-full max-w-md space-y-4 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-serif-title text-xl text-accent">
              Modificar mapa
            </h3>
            <p className="text-sm text-muted">
              Describí qué cambiar (ej: "agregá una segunda sala con un dragón",
              "convertilo en versión nevada").
            </p>
            <textarea
              className="textarea min-h-[120px]"
              value={modifyPrompt}
              onChange={(e) => setModifyPrompt(e.target.value)}
              placeholder="Cambios a aplicar..."
            />
            {error && (
              <div className="rounded-md border border-red-700/40 bg-red-900/30 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setModifying(false)}
                disabled={busy}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={handleModify}
                disabled={busy || !modifyPrompt.trim()}
                className="btn-primary disabled:opacity-50"
              >
                {busy ? "Aplicando..." : "Aplicar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
