import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import type { MapData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("maps")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ maps: data ?? [] });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const map_data: MapData = body.map_data;
    if (!map_data) {
      return NextResponse.json({ error: "map_data required" }, { status: 400 });
    }
    const row = {
      title: body.title || map_data.title || "Untitled",
      prompt: body.prompt || "",
      map_data,
      thumbnail_url: body.thumbnail_url ?? null,
      map_type: body.map_type || map_data.map_type,
      width: body.width || map_data.width,
      height: body.height || map_data.height
    };
    const { data, error } = await supabase
      .from("maps")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ map: data });
  } catch (err: any) {
    console.error("/api/maps POST", err);
    return NextResponse.json(
      { error: err?.message ?? "Save failed" },
      { status: 500 }
    );
  }
}
