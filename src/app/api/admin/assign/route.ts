import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-guard";
import { runAssignment } from "@/lib/assignment";
import { todayInSeoul } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { regenerate?: unknown };
    const date = todayInSeoul();

    // Re-running with a varied seed produces a genuinely different arrangement;
    // the plain run stays reproducible from the date alone.
    const seed = body.regenerate ? `${date}#${Date.now()}` : date;

    const groups = await runAssignment(date, { seed });
    return NextResponse.json({ ok: true, groupCount: groups.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SERVER_ERROR";
    console.error("assignment failed", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
