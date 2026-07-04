import { NextRequest, NextResponse } from "next/server";
import {
  deleteRunbook,
  getRunbook,
  getVersion,
  listApprovals,
  listVersions,
  saveNewVersion,
} from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  const rb = getRunbook(id);
  if (!rb) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const vParam = url.searchParams.get("version");
  const version = vParam ? Number(vParam) : rb.current_version;
  const v = getVersion(id, version);
  if (!v) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  return NextResponse.json({
    runbook: rb,
    version: {
      ...v,
      content: JSON.parse(v.content),
      sources_used: JSON.parse(v.sources_used),
    },
    versions: listVersions(id),
    approvals: listApprovals(id),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  const rb = getRunbook(id);
  if (!rb) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { content, note, author } = (await req.json()) || {};
  if (!content?.title) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  const actor = author?.trim() || process.env.AUTORUNBOOK_ACTOR || "operator";
  const version = saveNewVersion(id, content, actor, note?.trim() || "Edited");
  return NextResponse.json({ version });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  deleteRunbook(id);
  return NextResponse.json({ ok: true });
}
