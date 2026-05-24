import { NextResponse } from "next/server";
import { generateMapJson } from "@/lib/gemini";
import type { GenerateRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GenerateRequest;
    if (!body?.prompt || typeof body.prompt !== "string") {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }
    const map = await generateMapJson({
      prompt: body.prompt,
      mapType: body.map_type,
      width: body.width,
      height: body.height,
      existingMap: body.existing_map
    });
    return NextResponse.json({ map });
  } catch (err: any) {
    console.error("/api/generate", err);
    return NextResponse.json(
      { error: err?.message ?? "Generation failed" },
      { status: 500 }
    );
  }
}
