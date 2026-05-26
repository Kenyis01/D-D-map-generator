"use client";

import type { MapData, RoomType } from "@/lib/types";

const BADGE_COLOR: Record<RoomType, string> = {
  entrance: "#a8a8c0",
  corridor: "#888",
  chamber: "#c0c0e0",
  boss: "#e26060",
  treasure: "#f0c14a",
  shop: "#c8a868",
  tavern: "#d8a060",
  open: "#c0a070"
};

interface Props {
  map: MapData;
}

export default function RoomLegend({ map }: Props) {
  if (!map.rooms.length) return null;
  return (
    <aside className="card max-h-[640px] overflow-y-auto p-3">
      <h3 className="font-serif-title text-sm uppercase tracking-wider text-accent mb-3">
        Salas
      </h3>
      <ol className="space-y-2">
        {map.rooms.map((r, i) => (
          <li key={r.id ?? i} className="flex items-start gap-2 text-sm">
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-bg"
              style={{ background: BADGE_COLOR[r.type] ?? "#c9a84c" }}
            >
              {i + 1}
            </span>
            <div className="min-w-0 leading-tight">
              <div className="font-medium text-text">
                {r.label || titleCase(r.type)}
              </div>
              <div className="text-[11px] uppercase tracking-wider text-muted">
                {r.type}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
