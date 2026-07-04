import { NextRequest, NextResponse } from "next/server";
import { RunbookContent } from "@/lib/db";
import { ExportMeta, toHtml, toMarkdown } from "@/lib/export";
import { toPdf } from "@/lib/pdf";
import { getRunbook, getVersion, lastApprover } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const id = Number((await params).id);
  const rb = getRunbook(id);
  if (!rb) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "md";
  const vParam = url.searchParams.get("version");
  const version = vParam ? Number(vParam) : rb.current_version;
  const v = getVersion(id, version);
  if (!v) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  const content = JSON.parse(v.content) as RunbookContent;
  const meta: ExportMeta = {
    runbookId: id,
    version,
    status: rb.status,
    author: v.author,
    createdAt: v.created_at,
    approvedBy: rb.status === "approved" ? lastApprover(id) : undefined,
  };

  const slug =
    content.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "runbook";
  const filename = `${slug}-v${version}`;

  if (format === "md") {
    return new NextResponse(toMarkdown(content, meta), {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}.md"`,
      },
    });
  }
  if (format === "html") {
    const inline = url.searchParams.get("inline") === "1";
    return new NextResponse(toHtml(content, meta), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        ...(inline
          ? {}
          : { "content-disposition": `attachment; filename="${filename}.html"` }),
      },
    });
  }
  if (format === "pdf") {
    const pdf = await toPdf(content, meta);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}.pdf"`,
      },
    });
  }
  return NextResponse.json({ error: "format must be md|html|pdf" }, { status: 400 });
}
