# DnD Map Generator

A web app that turns natural-language prompts into tactical D&D maps. Built with **Next.js 14 (App Router)**, **Tailwind CSS**, **Supabase**, and **Google Gemini Flash**. Maps are rendered tile-by-tile on an HTML5 canvas and saved to a shared, no-auth gallery where anyone can download, modify, or delete any map.

---

## Stack
- Next.js 14 (App Router, RSC + client components)
- Tailwind CSS (custom dark fantasy palette)
- Supabase Postgres + Storage (public bucket `map-thumbnails`)
- Google Gemini Flash via `@google/generative-ai`
- HTML5 Canvas 2D rendering (no external libs)

---

## Local setup

```bash
git clone <repo-url>
cd D-D-map-generator
npm install
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, GEMINI_API_KEY
npm run dev
```

App runs on http://localhost:3000.

### Environment variables

| Variable | Where |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project settings → API (anon/public) |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |

---

## Supabase setup

1. Create a free project at https://supabase.com.
2. Open **SQL Editor** → paste the contents of [`supabase/schema.sql`](supabase/schema.sql) → run.
3. This creates the `maps` table, enables RLS with public policies, creates the `map-thumbnails` storage bucket (public), and adds public read/insert/delete policies on storage.
4. Copy your project URL + anon key into `.env.local`.

> The app intentionally uses public RLS policies — there is no auth. Anyone hitting your deployed URL can modify or delete maps.

---

## Get a Gemini API key

1. Go to https://aistudio.google.com/apikey.
2. Click **Create API key** (free tier).
3. Paste it as `GEMINI_API_KEY` in `.env.local`.

The app uses the `gemini-1.5-flash` model with `responseMimeType: application/json` so the model returns strict JSON. Each request also injects a random seed for variation.

---

## Deploy on Vercel

1. Push this repo to GitHub.
2. Import the project on https://vercel.com.
3. In **Project Settings → Environment Variables**, add all three vars from above.
4. Deploy. The Edge isn't required — API routes run on the Node runtime.

---

## How it works

- **`/generate`** — Prompt + type + aspect picker. POSTs to `/api/generate`, which calls Gemini Flash with a strict schema prompt. The returned JSON is rendered on canvas. From there you can **Regenerar**, **Descargar PNG**, or **Guardar en galería** (uploads a 48px-per-tile PNG to Supabase Storage and inserts into `maps`).
- **`/`** — Loads all maps via `/api/maps`. Each card has **Descargar PNG** (re-renders at 64px/tile), **Modificar** (modal → calls `/api/generate` with `existing_map` → PATCH), **Eliminar** (deletes row + thumbnail).
- **Map JSON schema** — See `lib/types.ts`. Gemini is constrained via a single system prompt in `lib/gemini.ts`.
- **Rendering** — `lib/mapRenderer.ts` paints background tiles, special tiles, rooms with type-tinted floors, connection lines (door/arch/stairs/path), and 10 hand-drawn Canvas 2D object icons. Grid + labels are overlaid last. `pixelRatio` is respected for retina; export uses a fresh offscreen canvas at 64px per tile.

---

## Project layout

```
app/
  page.tsx              # gallery
  generate/page.tsx     # generator
  api/generate/route.ts # POST → Gemini → MapData
  api/maps/route.ts     # GET / POST
  api/maps/[id]/route.ts# DELETE / PATCH
components/
  MapCanvas.tsx
  MapCard.tsx
  Gallery.tsx
  GeneratorForm.tsx
  AspectRatioPicker.tsx
  MapTypePicker.tsx
lib/
  supabase.ts
  gemini.ts
  mapRenderer.ts
  types.ts
supabase/
  schema.sql
```

---

## Notes

- All API routes use `runtime: nodejs` and `dynamic: force-dynamic` because Gemini + Supabase clients need Node.
- The free tiers of Supabase and Gemini are enough to host this end-to-end.
- No UI libraries — only Tailwind utilities and `@/components/*`.
