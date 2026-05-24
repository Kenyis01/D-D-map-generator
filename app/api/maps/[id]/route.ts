import { NextResponse } from "next/server";
import { supabase, THUMBNAIL_BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteCtx {
  params: { id: string };
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const id = ctx.params.id;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Try to remove the thumbnail file (uses {id}.png convention)
  await supabase.storage.from(THUMBNAIL_BUCKET).remove([`${id}.png`]).catch(() => undefined);

  const { error } = await supabase.from("maps").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  const id = ctx.params.id;
  try {
    const body = await req.json();
    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.prompt !== undefined) patch.prompt = body.prompt;
    if (body.map_data !== undefined) {
      patch.map_data = body.map_data;
      patch.map_type = body.map_data.map_type;
      patch.width = body.map_data.width;
      patch.height = body.map_data.height;
    }
    if (body.thumbnail_url !== undefined) patch.thumbnail_url = body.thumbnail_url;

    const { data, error } = await supabase
      .from("maps")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ map: data });
  } catch (err: any) {
    console.error("/api/maps/[id] PATCH", err);
    return NextResponse.json(
      { error: err?.message ?? "Update failed" },
      { status: 500 }
    );
  }
}
