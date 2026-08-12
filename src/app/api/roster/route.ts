import { NextResponse } from "next/server";
import { todayInSeoul } from "@/lib/date";
import { getRoster } from "@/lib/roster";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Names to choose from, flagged so the UI can disable people already done. */
export async function GET() {
  try {
    const date = todayInSeoul();
    const preferences = await getStore().listPreferences(date);
    const submitted = new Set(preferences.map((p) => p.userId));

    return NextResponse.json({
      date,
      users: getRoster().map((u) => ({
        id: u.id,
        name: u.name,
        submitted: submitted.has(u.id),
      })),
    });
  } catch (error) {
    console.error("roster failed", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
