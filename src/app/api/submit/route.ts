import { NextResponse } from "next/server";
import { todayInSeoul } from "@/lib/date";
import { getStore } from "@/lib/store";
import { EATING_SPEEDS, type EatingSpeed } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Body {
  userId?: unknown;
  menuChoice?: unknown;
  eatingSpeed?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const userId = typeof body.userId === "string" ? body.userId : "";
    const menuChoice = typeof body.menuChoice === "string" ? body.menuChoice : "";
    const eatingSpeed = body.eatingSpeed as EatingSpeed;

    if (!userId) {
      return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
    }
    if (!menuChoice) {
      return NextResponse.json({ error: "MENU_REQUIRED" }, { status: 400 });
    }
    if (!EATING_SPEEDS.includes(eatingSpeed)) {
      return NextResponse.json({ error: "SPEED_REQUIRED" }, { status: 400 });
    }

    const result = await getStore().submitPreference({
      userId,
      menuChoice,
      eatingSpeed,
      date: todayInSeoul(),
    });

    if (!result.ok) {
      const status = result.reason === "DUPLICATE" ? 409 : 400;
      return NextResponse.json({ error: result.reason }, { status });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("submit failed", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
