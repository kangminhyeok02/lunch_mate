import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-guard";
import { todayInSeoul } from "@/lib/date";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Opens today's mission without waiting for every answer. The escape hatch for
 * a table stuck on someone who stepped away.
 */
export async function POST(request: Request) {
  try {
    if (!(await isAdminRequest())) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = (await request.json()) as { unlocked?: unknown };
    if (typeof body.unlocked !== "boolean") {
      return NextResponse.json({ error: "UNLOCKED_REQUIRED" }, { status: 400 });
    }

    const date = todayInSeoul();
    await getStore().setMissionsUnlocked(date, body.unlocked);

    return NextResponse.json({ ok: true, missionsUnlocked: body.unlocked });
  } catch (error) {
    console.error("mission unlock failed", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
