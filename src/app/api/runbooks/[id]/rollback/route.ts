import { NextRequest, NextResponse } from "next/server";
import { rollbackToVersion } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  const { version, actor } = (await req.json()) || {};
  if (!version) {
    return NextResponse.json({ error: "version required" }, { status: 400 });
  }
  try {
    const v = rollbackToVersion(
      id,
      Number(version),
      actor?.trim() || process.env.AUTORUNBOOK_ACTOR || "operator"
    );
    return NextResponse.json({ version: v });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
