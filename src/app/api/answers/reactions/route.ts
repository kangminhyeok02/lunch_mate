import { NextResponse } from "next/server";
import { getAnswerBoard, getResultForUser } from "@/lib/assignment";
import { todayInSeoul } from "@/lib/date";
import { getStore } from "@/lib/store";
import { REACTION_KINDS, type ReactionKind } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Body {
  userId?: unknown;
  answerId?: unknown;
  kind?: unknown;
}

/** Toggles one reaction on a table-mate's answer. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const userId = typeof body.userId === "string" ? body.userId : "";
    const answerId = typeof body.answerId === "string" ? body.answerId : "";
    const kind = body.kind as ReactionKind;

    if (!userId) {
      return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
    }
    if (!answerId) {
      return NextResponse.json({ error: "ANSWER_REQUIRED" }, { status: 400 });
    }
    if (!REACTION_KINDS.includes(kind)) {
      return NextResponse.json({ error: "KIND_REQUIRED" }, { status: 400 });
    }

    const date = todayInSeoul();
    const result = await getResultForUser(date, userId);
    if (!result) {
      return NextResponse.json({ error: "NOT_ASSIGNED" }, { status: 409 });
    }

    const store = getStore();
    const answers = await store.listAnswers(date, result.group.id);

    // Reacting is only possible to answers you can actually see: same table,
    // and only after you have written your own.
    if (!answers.some((a) => a.userId === userId)) {
      return NextResponse.json({ error: "NOT_ANSWERED" }, { status: 409 });
    }
    if (!answers.some((a) => a.id === answerId)) {
      return NextResponse.json({ error: "UNKNOWN_ANSWER" }, { status: 404 });
    }

    await store.toggleReaction({ userId, date, answerId, kind });

    const board = await getAnswerBoard(date, userId);
    return NextResponse.json({ ok: true, ...board });
  } catch (error) {
    console.error("reaction failed", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
