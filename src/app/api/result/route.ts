import { NextResponse } from "next/server";
import { getResultForUser, MATCHING_POINT_LABEL } from "@/lib/assignment";
import { todayInSeoul } from "@/lib/date";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const userId = new URL(request.url).searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
    }

    const date = todayInSeoul();
    const result = await getResultForUser(date, userId);

    if (!result) {
      const day = await getStore().getDayState(date);
      return NextResponse.json({ ready: false, status: day.status });
    }

    return NextResponse.json({
      ready: true,
      groupNumber: result.group.groupNumber,
      members: result.members.map((m) => ({
        name: m.name,
        menuEmoji: m.menuEmoji,
        menuName: m.menuName,
        eatingSpeed: m.eatingSpeed,
      })),
      menuName: result.menuName,
      question: result.question?.content ?? null,
      mission: result.mission?.content ?? null,
      matchingPoints: result.matchingPoints.map((p) => MATCHING_POINT_LABEL[p]),
    });
  } catch (error) {
    console.error("result failed", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
