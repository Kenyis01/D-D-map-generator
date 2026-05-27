import { NextResponse } from "next/server";
import { generateMapIntent } from "@/lib/gemini";
import { assembleMapData, layoutMap } from "@/lib/layout";
import { placeObjectsForMap } from "@/lib/objectPlacer";
import type { GenerateRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GenerateRequest;
    if (!body?.prompt || typeof body.prompt !== "string") {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }
    const width = body.width ?? 30;
    const height = body.height ?? 20;

    // 1) LLM picks intent only (rooms by purpose+size, materials, connections).
    const intent = await generateMapIntent({ prompt: body.prompt, width, height });

    // 2) Deterministic layout: BSP partition + MST corridors + doors.
    const layout = layoutMap(intent);

    // 3) Assemble base MapData (rooms have coords; objects + special_tiles
    //    are empty placeholders).
    const map = assembleMapData(intent, layout);

    // 4) Rulebook-driven object placement (one rule set per room purpose).
    map.objects = placeObjectsForMap(map, layout);

    return NextResponse.json({ map });
  } catch (err: any) {
    console.error("/api/generate", err);
    return NextResponse.json(
      { error: err?.message ?? "Generation failed" },
      { status: 500 }
    );
  }
}
