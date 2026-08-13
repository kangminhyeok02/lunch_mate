import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileLunchStore } from "@/lib/store/file-store";
import { getRoster } from "@/lib/roster";
import type { LunchGroup } from "@/lib/types";

const DATE = "2026-08-12";
const GROUP_ID = `${DATE}-g01`;

let dir: string;
let store: FileLunchStore;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "lunch-mate-answers-"));
  store = new FileLunchStore(path.join(dir, "db.json"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** A table of the first four people on the roster. */
function seatFour(): LunchGroup {
  return {
    id: GROUP_ID,
    date: DATE,
    groupNumber: 1,
    memberIds: getRoster().slice(0, 4).map((u) => u.id),
    questionId: "q-1",
    missionId: "m-1",
    matchingPoints: [],
    createdAt: new Date().toISOString(),
  };
}

describe("FileLunchStore answers", () => {
  it("stores an answer and reads it back for the group", async () => {
    const group = seatFour();
    await store.saveGroups(DATE, [group]);

    await store.saveAnswer({
      userId: group.memberIds[0],
      date: DATE,
      groupId: GROUP_ID,
      questionId: "q-1",
      content: "새로운 사람들과 밥 먹는 거요",
    });

    const answers = await store.listAnswers(DATE, GROUP_ID);
    expect(answers).toHaveLength(1);
    expect(answers[0].content).toBe("새로운 사람들과 밥 먹는 거요");
    expect(answers[0].questionId).toBe("q-1");
  });

  it("replaces the earlier answer instead of adding a second one", async () => {
    const group = seatFour();
    await store.saveGroups(DATE, [group]);
    const userId = group.memberIds[0];

    const first = await store.saveAnswer({
      userId,
      date: DATE,
      groupId: GROUP_ID,
      questionId: "q-1",
      content: "처음 답변",
    });
    const second = await store.saveAnswer({
      userId,
      date: DATE,
      groupId: GROUP_ID,
      questionId: "q-1",
      content: "고친 답변",
    });

    const answers = await store.listAnswers(DATE, GROUP_ID);
    expect(answers).toHaveLength(1);
    expect(answers[0].content).toBe("고친 답변");
    // Editing keeps the original creation time so ordering does not jump.
    expect(second.createdAt).toBe(first.createdAt);
  });

  it("keeps each table's answers separate", async () => {
    const roster = getRoster();
    const groupA = seatFour();
    const groupB: LunchGroup = {
      ...groupA,
      id: `${DATE}-g02`,
      groupNumber: 2,
      memberIds: roster.slice(4, 8).map((u) => u.id),
    };
    await store.saveGroups(DATE, [groupA, groupB]);

    await store.saveAnswer({
      userId: groupA.memberIds[0],
      date: DATE,
      groupId: groupA.id,
      questionId: "q-1",
      content: "1조 답변",
    });
    await store.saveAnswer({
      userId: groupB.memberIds[0],
      date: DATE,
      groupId: groupB.id,
      questionId: "q-2",
      content: "2조 답변",
    });

    expect(await store.listAnswers(DATE, groupA.id)).toHaveLength(1);
    expect((await store.listAnswers(DATE, groupA.id))[0].content).toBe("1조 답변");
    expect((await store.listAnswers(DATE, groupB.id))[0].content).toBe("2조 답변");
  });

  it("survives 4 people answering at the same moment", async () => {
    const group = seatFour();
    await store.saveGroups(DATE, [group]);

    await Promise.all(
      group.memberIds.map((userId, index) =>
        store.saveAnswer({
          userId,
          date: DATE,
          groupId: GROUP_ID,
          questionId: "q-1",
          content: `답변 ${index}`,
        }),
      ),
    );

    expect(await store.listAnswers(DATE, GROUP_ID)).toHaveLength(4);
  });

  it("drops answers when the day is reset", async () => {
    const group = seatFour();
    await store.saveGroups(DATE, [group]);
    await store.saveAnswer({
      userId: group.memberIds[0],
      date: DATE,
      groupId: GROUP_ID,
      questionId: "q-1",
      content: "지워질 답변",
    });

    await store.resetDay(DATE);
    expect(await store.listAnswers(DATE, GROUP_ID)).toHaveLength(0);
  });

  it("reads a data file written before answers existed", async () => {
    const file = path.join(dir, "legacy.json");
    // Exactly the shape the old FileLunchStore produced: no `answers` key.
    await fs.writeFile(
      file,
      JSON.stringify({
        days: {
          [DATE]: {
            status: "ASSIGNED",
            menus: [],
            preferences: [],
            groups: [seatFour()],
          },
        },
      }),
      "utf8",
    );

    const legacy = new FileLunchStore(file);
    expect(await legacy.listAnswers(DATE, GROUP_ID)).toHaveLength(0);

    await legacy.saveAnswer({
      userId: getRoster()[0].id,
      date: DATE,
      groupId: GROUP_ID,
      questionId: "q-1",
      content: "신규 답변",
    });
    expect(await legacy.listAnswers(DATE, GROUP_ID)).toHaveLength(1);
  });
});

describe("getAnswerBoard", () => {
  /** getAnswerBoard reads the module-level store, so point it at ours. */
  async function boardFor(userId: string) {
    vi.doMock("@/lib/store", async () => {
      const actual = await vi.importActual<typeof import("@/lib/store")>("@/lib/store");
      return { ...actual, getStore: () => store };
    });
    const { getAnswerBoard } = await import("@/lib/assignment");
    return getAnswerBoard(DATE, userId);
  }

  beforeEach(() => {
    vi.resetModules();
  });

  it("hides other answers until the reader has written one", async () => {
    const group = seatFour();
    await store.saveGroups(DATE, [group]);
    const [me, other] = group.memberIds;

    await store.saveAnswer({
      userId: other,
      date: DATE,
      groupId: GROUP_ID,
      questionId: "q-1",
      content: "남의 답변",
    });

    const before = await boardFor(me);
    expect(before?.revealed).toBe(false);
    expect(before?.answers).toHaveLength(0);
    // The count is still visible, so the screen can nudge them to answer.
    expect(before?.answeredCount).toBe(1);
    expect(before?.myAnswer).toBeNull();
  });

  it("reveals the table once the reader answers", async () => {
    const group = seatFour();
    await store.saveGroups(DATE, [group]);
    const [me, other] = group.memberIds;

    await store.saveAnswer({
      userId: other,
      date: DATE,
      groupId: GROUP_ID,
      questionId: "q-1",
      content: "남의 답변",
    });
    await store.saveAnswer({
      userId: me,
      date: DATE,
      groupId: GROUP_ID,
      questionId: "q-1",
      content: "내 답변",
    });

    const after = await boardFor(me);
    expect(after?.revealed).toBe(true);
    expect(after?.answers).toHaveLength(2);
    expect(after?.myAnswer).toBe("내 답변");
    expect(after?.answers.find((a) => a.isMine)?.content).toBe("내 답변");
    expect(after?.answers.every((a) => a.name.length > 0)).toBe(true);
    expect(after?.memberCount).toBe(4);
  });

  it("returns null for someone who has no table", async () => {
    await store.saveGroups(DATE, [seatFour()]);
    expect(await boardFor(getRoster()[20].id)).toBeNull();
  });

  it("keeps the mission shut until the whole table has answered", async () => {
    const group = seatFour();
    await store.saveGroups(DATE, [group]);

    for (const [index, userId] of group.memberIds.entries()) {
      await store.saveAnswer({
        userId,
        date: DATE,
        groupId: GROUP_ID,
        questionId: "q-1",
        content: `답변 ${index}`,
      });

      const board = await boardFor(group.memberIds[0]);
      const isLast = index === group.memberIds.length - 1;
      expect(board?.missionUnlocked).toBe(isLast);
      expect(board?.missionForced).toBe(false);
    }
  });

  it("opens the mission early when an admin forces it", async () => {
    const group = seatFour();
    await store.saveGroups(DATE, [group]);
    const me = group.memberIds[0];

    await store.saveAnswer({
      userId: me,
      date: DATE,
      groupId: GROUP_ID,
      questionId: "q-1",
      content: "나만 씀",
    });
    expect((await boardFor(me))?.missionUnlocked).toBe(false);

    await store.setMissionsUnlocked(DATE, true);
    const forced = await boardFor(me);
    expect(forced?.missionUnlocked).toBe(true);
    // Flagged so the screen can explain why it opened with answers missing.
    expect(forced?.missionForced).toBe(true);

    await store.setMissionsUnlocked(DATE, false);
    expect((await boardFor(me))?.missionUnlocked).toBe(false);
  });

  it("tallies reactions and marks my own", async () => {
    const group = seatFour();
    await store.saveGroups(DATE, [group]);
    const [me, mate, third] = group.memberIds;

    for (const userId of [me, mate, third]) {
      await store.saveAnswer({
        userId,
        date: DATE,
        groupId: GROUP_ID,
        questionId: "q-1",
        content: `답변 ${userId}`,
      });
    }
    const mateAnswer = (await store.listAnswers(DATE, GROUP_ID)).find(
      (a) => a.userId === mate,
    )!;

    await store.toggleReaction({ userId: me, date: DATE, answerId: mateAnswer.id, kind: "LIKE" });
    await store.toggleReaction({ userId: third, date: DATE, answerId: mateAnswer.id, kind: "LIKE" });
    await store.toggleReaction({ userId: third, date: DATE, answerId: mateAnswer.id, kind: "HEART" });

    const board = await boardFor(me);
    const shown = board?.answers.find((a) => a.userId === mate);
    const like = shown?.reactions.find((r) => r.kind === "LIKE");
    const heart = shown?.reactions.find((r) => r.kind === "HEART");
    const laugh = shown?.reactions.find((r) => r.kind === "LAUGH");

    expect(like?.count).toBe(2);
    expect(like?.mine).toBe(true);
    // Someone else reacted, so it counts but is not mine.
    expect(heart?.count).toBe(1);
    expect(heart?.mine).toBe(false);
    expect(laugh?.count).toBe(0);
    expect(laugh?.mine).toBe(false);
  });

  it("removes the reaction when the same one is sent twice", async () => {
    const group = seatFour();
    await store.saveGroups(DATE, [group]);
    const [me, mate] = group.memberIds;

    for (const userId of [me, mate]) {
      await store.saveAnswer({
        userId,
        date: DATE,
        groupId: GROUP_ID,
        questionId: "q-1",
        content: "답변",
      });
    }
    const mateAnswer = (await store.listAnswers(DATE, GROUP_ID)).find(
      (a) => a.userId === mate,
    )!;

    const on = await store.toggleReaction({
      userId: me,
      date: DATE,
      answerId: mateAnswer.id,
      kind: "LAUGH",
    });
    expect(on.active).toBe(true);

    const off = await store.toggleReaction({
      userId: me,
      date: DATE,
      answerId: mateAnswer.id,
      kind: "LAUGH",
    });
    expect(off.active).toBe(false);

    const board = await boardFor(me);
    const shown = board?.answers.find((a) => a.userId === mate);
    expect(shown?.reactions.find((r) => r.kind === "LAUGH")?.count).toBe(0);
  });

  it("lists who has not written yet", async () => {
    const group = seatFour();
    await store.saveGroups(DATE, [group]);
    const roster = new Map(getRoster().map((u) => [u.id, u.name]));
    const [me, mate] = group.memberIds;

    await store.saveAnswer({
      userId: me,
      date: DATE,
      groupId: GROUP_ID,
      questionId: "q-1",
      content: "내 답변",
    });

    let board = await boardFor(me);
    expect(board?.pendingNames).toHaveLength(3);
    expect(board?.pendingNames).not.toContain(roster.get(me));
    expect(board?.pendingNames).toContain(roster.get(mate));

    for (const userId of group.memberIds) {
      await store.saveAnswer({
        userId,
        date: DATE,
        groupId: GROUP_ID,
        questionId: "q-1",
        content: "답변",
      });
    }
    board = await boardFor(me);
    expect(board?.pendingNames).toHaveLength(0);
  });

  it("does not mark the mission forced once everyone has answered anyway", async () => {
    const group = seatFour();
    await store.saveGroups(DATE, [group]);
    await store.setMissionsUnlocked(DATE, true);

    for (const userId of group.memberIds) {
      await store.saveAnswer({
        userId,
        date: DATE,
        groupId: GROUP_ID,
        questionId: "q-1",
        content: "답변",
      });
    }

    const board = await boardFor(group.memberIds[0]);
    expect(board?.missionUnlocked).toBe(true);
    expect(board?.missionForced).toBe(false);
  });
});
