import { NextRequest, NextResponse } from "next/server";
import { generateRunbook } from "@/lib/ai";
import { retrieve } from "@/lib/rag";
import { createRunbook } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { kind, content, instructions } = (await req.json()) || {};
    if (!kind || !content?.trim()) {
      return NextResponse.json(
        { error: "kind and content are required" },
        { status: 400 }
      );
    }

    // RAG: retrieve grounding context from the knowledge base
    const query = `${content.slice(0, 2000)} ${instructions || ""}`;
    const context = retrieve(query, 6);

    const { content: runbook } = await generateRunbook(
      kind,
      content,
      context,
      instructions
    );

    const sourcesUsed = [
      ...new Map(
        context.map((c) => [c.sourceId, { id: c.sourceId, title: c.sourceTitle }])
      ).values(),
    ];

    const author = process.env.AUTORUNBOOK_ACTOR || "operator";
    const id = createRunbook(kind, content, runbook, sourcesUsed, `ai (requested by ${author})`);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
