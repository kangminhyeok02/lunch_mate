import { NextResponse } from "next/server";
import { todayInSeoul } from "@/lib/date";
import { getRoster } from "@/lib/roster";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Polled by the waiting screen when Supabase Realtime isn't available. */
export async function GET(request: Request) {
  try {
    const date = todayInSeoul();
    const store = getStore();
    const userId = new URL(request.url).searchParams.get("userId");

    const [day, preferences, groups] = await Promise.all([
      store.getDayState(date),
      store.listPreferences(date),
      store.getGroups(date),
    ]);

    return NextResponse.json({
      date,
      status: day.status,
      menus: day.menus,
      submittedCount: preferences.length,
      totalCount: getRoster().length,
      assigned: groups.length > 0,
      mine: userId
        ? {
            submitted: preferences.some((p) => p.userId === userId),
            grouped: groups.some((g) => g.memberIds.includes(userId)),
          }
        : null,
    });
  } catch (error) {
    console.error("status failed", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
