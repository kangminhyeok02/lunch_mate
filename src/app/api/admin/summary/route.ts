import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-guard";
import { todayInSeoul } from "@/lib/date";
import { findMission, findQuestion } from "@/lib/prompts";
import { getRoster } from "@/lib/roster";
import { getStore, isSupabaseConfigured } from "@/lib/store";
import { EATING_SPEEDS, type EatingSpeed } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const date = todayInSeoul();
    const store = getStore();
    const [day, preferences, groups] = await Promise.all([
      store.getDayState(date),
      store.listPreferences(date),
      store.getGroups(date),
    ]);

    const roster = getRoster();
    const nameById = new Map(roster.map((u) => [u.id, u.name]));

    const menuCounts = day.menus.map((menu) => ({
      id: menu.id,
      name: menu.name,
      emoji: menu.emoji,
      count: preferences.filter((p) => p.menuChoice === menu.id).length,
    }));

    const speedCounts = EATING_SPEEDS.map((speed: EatingSpeed) => ({
      speed,
      count: preferences.filter((p) => p.eatingSpeed === speed).length,
    }));

    return NextResponse.json({
      date,
      storeKind: store.kind,
      supabaseConfigured: isSupabaseConfigured(),
      status: day.status,
      missionsUnlocked: day.missionsUnlocked,
      menus: day.menus,
      submittedCount: preferences.length,
      totalCount: roster.length,
      pending: roster.filter((u) => !preferences.some((p) => p.userId === u.id)).map((u) => u.name),
      menuCounts,
      speedCounts,
      groups: groups.map((g) => ({
        groupNumber: g.groupNumber,
        members: g.memberIds.map((id) => nameById.get(id) ?? id),
        question: findQuestion(g.questionId)?.content ?? null,
        mission: findMission(g.missionId)?.content ?? null,
        matchingPoints: g.matchingPoints,
      })),
    });
  } catch (error) {
    console.error("admin summary failed", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
