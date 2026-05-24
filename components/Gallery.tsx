"use client";

import { useCallback, useEffect, useState } from "react";
import MapCard from "./MapCard";
import type { SavedMap } from "@/lib/types";

export default function Gallery() {
  const [maps, setMaps] = useState<SavedMap[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/maps", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Error");
      setMaps(data.maps as SavedMap[]);
    } catch (e: any) {
      setError(e?.message ?? "Error");
      setMaps([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onDeleted = (id: string) => {
    setMaps((cur) => (cur ? cur.filter((m) => m.id !== id) : cur));
  };
  const onUpdated = (m: SavedMap) => {
    setMaps((cur) => (cur ? cur.map((x) => (x.id === m.id ? m : x)) : cur));
  };

  if (error && (!maps || maps.length === 0)) {
    return (
      <div className="rounded-md border border-red-700/40 bg-red-900/30 px-4 py-3 text-sm text-red-200">
        {error}
      </div>
    );
  }

  if (maps === null) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="card overflow-hidden">
            <div className="skeleton aspect-[4/3]" />
            <div className="space-y-2 p-3">
              <div className="skeleton h-4 w-2/3 rounded" />
              <div className="skeleton h-3 w-full rounded" />
              <div className="skeleton h-3 w-1/2 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (maps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center text-muted">
        <p className="font-serif-title text-2xl text-accent">
          Tu galería está vacía
        </p>
        <p className="text-sm">Generá tu primer mapa para empezar.</p>
        <a href="/generate" className="btn-primary mt-2">
          Crear nuevo mapa
        </a>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {maps.map((m) => (
        <MapCard key={m.id} map={m} onDeleted={onDeleted} onUpdated={onUpdated} />
      ))}
    </div>
  );
}
