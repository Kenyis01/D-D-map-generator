"use client";

import type { AspectRatioOption } from "@/lib/types";

export const ASPECT_OPTIONS: AspectRatioOption[] = [
  { label: "Cuadrado · 20×20", width: 20, height: 20 },
  { label: "Horizontal · 30×15", width: 30, height: 15 },
  { label: "Vertical · 15×25", width: 15, height: 25 },
  { label: "Grande · 40×25", width: 40, height: 25 }
];

interface Props {
  value: AspectRatioOption;
  onChange: (v: AspectRatioOption) => void;
}

export default function AspectRatioPicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {ASPECT_OPTIONS.map((opt) => {
        const active = opt.width === value.width && opt.height === value.height;
        return (
          <button
            key={opt.label}
            type="button"
            onClick={() => onChange(opt)}
            className={
              "flex items-center justify-between rounded-md border px-3 py-2 text-xs transition " +
              (active
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-card text-muted hover:border-accent/60 hover:text-text")
            }
          >
            <span>{opt.label}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted">
              {opt.width}×{opt.height}
            </span>
          </button>
        );
      })}
    </div>
  );
}
