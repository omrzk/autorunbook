import { NextResponse } from "next/server";
import { listRunbooks } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ runbooks: listRunbooks() });
}
