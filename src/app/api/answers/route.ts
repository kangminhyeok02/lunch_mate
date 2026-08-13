import { NextResponse } from "next/server";
import { getAnswerBoard, getResultForUser } from "@/lib/assignment";
import { todayInSeoul } from "@/lib/date";
import { getStore } from "@/lib/store";
import { ANSWER_MAX_LENGTH } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The question board: my answer, and the table's once I have written mine. */
export async function GET(request: Request) {
  try {
    const userId = new URL(request.url).searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
    }

    const board = await getAnswerBoard(todayInSeoul(), userId);
    if (!board) {
      return NextResponse.json({ ready: false });
    }

    return NextResponse.json({ ready: true, ...board });
  } catch (error) {
    console.error("answers failed", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}

interface Body {
  userId?: unknown;
  content?: unknown;
}

/** Write or edit my answer. Re-posting replaces the earlier one. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const userId = typeof body.userId === "string" ? body.userId : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!userId) {
      return NextResponse.json({ error: "NAME_REQUIRED" }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: "ANSWER_REQUIRED" }, { status: 400 });
    }
    if (content.length > ANSWER_MAX_LENGTH) {
      return NextResponse.json({ error: "ANSWER_TOO_LONG" }, { status: 400 });
    }

    const date = todayInSeoul();
    // The group is the authority on who may answer: no table, no answer.
    const result = await getResultForUser(date, userId);
    if (!result) {
      return NextResponse.json({ error: "NOT_ASSIGNED" }, { status: 409 });
    }

    await getStore().saveAnswer({
      userId,
      date,
      groupId: result.group.id,
      questionId: result.group.questionId,
      content,
    });

    const board = await getAnswerBoard(date, userId);
    return NextResponse.json({ ok: true, ...board });
  } catch (error) {
    console.error("answer submit failed", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
