"use client";

import type { MapType } from "@/lib/types";

const TYPES: { value: MapType; label: string; icon: string }[] = [
  { value: "dungeon", label: "Dungeon", icon: "🏰" },
  { value: "overworld", label: "Overworld", icon: "🌲" },
  { value: "town", label: "Town", icon: "🏘️" },
  { value: "interior", label: "Interior", icon: "🍺" }
];

interface Props {
  value: MapType;
  onChange: (v: MapType) => void;
}

export default function MapTypePicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {TYPES.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={
            "flex flex-col items-center gap-1 rounded-md border px-2 py-3 text-xs transition " +
            (value === t.value
              ? "border-accent bg-accent/10 text-accent"
              : "border-border bg-card text-muted hover:border-accent/60 hover:text-text")
          }
        >
          <span className="text-xl">{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
