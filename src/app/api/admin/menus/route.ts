import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-guard";
import { todayInSeoul } from "@/lib/date";
import { getStore } from "@/lib/store";
import type { MenuOption } from "@/lib/types";

export const dynamic = "force-dynamic";

interface MenuInput {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  emoji?: unknown;
  imageUrl?: unknown;
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { menus?: MenuInput[] };
    const input = Array.isArray(body.menus) ? body.menus : [];

    if (input.length !== 2) {
      return NextResponse.json({ error: "TWO_MENUS_REQUIRED" }, { status: 400 });
    }

    const date = todayInSeoul();
    const menus: MenuOption[] = input.map((m, index) => ({
      id: typeof m.id === "string" && m.id ? m.id : index === 0 ? "menu-a" : "menu-b",
      date,
      name: typeof m.name === "string" ? m.name.trim() : "",
      description: typeof m.description === "string" ? m.description.trim() : "",
      emoji: typeof m.emoji === "string" && m.emoji ? m.emoji : "🍽️",
      imageUrl: typeof m.imageUrl === "string" && m.imageUrl ? m.imageUrl : null,
      active: true,
    }));

    if (menus.some((m) => !m.name)) {
      return NextResponse.json({ error: "MENU_NAME_REQUIRED" }, { status: 400 });
    }

    await getStore().setMenus(date, menus);
    return NextResponse.json({ ok: true, menus });
  } catch (error) {
    console.error("set menus failed", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
