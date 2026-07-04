import { NextRequest, NextResponse } from "next/server";
import { applyApprovalAction } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  const { action, actor, note } = (await req.json()) || {};
  if (!action) {
    return NextResponse.json({ error: "action required" }, { status: 400 });
  }
  try {
    const status = applyApprovalAction(
      id,
      action,
      actor?.trim() || process.env.AUTORUNBOOK_ACTOR || "operator",
      note?.trim() || ""
    );
    return NextResponse.json({ status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
