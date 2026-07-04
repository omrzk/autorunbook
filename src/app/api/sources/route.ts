import { NextRequest, NextResponse } from "next/server";
import { createSource, deleteSource, listSources } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ sources: listSources() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, kind, content } = body || {};
  if (!title?.trim() || !kind || !content?.trim()) {
    return NextResponse.json(
      { error: "title, kind and content are required" },
      { status: 400 }
    );
  }
  const id = createSource(title.trim(), kind, content);
  return NextResponse.json({ id }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  deleteSource(id);
  return NextResponse.json({ ok: true });
}
