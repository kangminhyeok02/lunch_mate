/**
 * Ties the matching algorithm to storage: read the day's submissions, build
 * tables, hand each table a question and a mission, persist the result.
 */

import { assignGroups } from "./matching";
import { allocatePrompts, findMission, findQuestion } from "./prompts";
import { getRoster } from "./roster";
import { getStore } from "./store";
import {
  REACTION_KINDS,
  type AnswerReaction,
  type EatingSpeed,
  type LunchGroup,
  type MatchingPointKind,
  type Mission,
  type Participant,
  type Question,
  type ReactionKind,
  type User,
} from "./types";

export interface RunAssignmentOptions {
  /** Defaults to the date, so a re-run produces the same tables unless varied. */
  seed?: string;
}

export async function buildParticipants(date: string): Promise<Participant[]> {
  const store = getStore();
  const [preferences, roster] = await Promise.all([
    store.listPreferences(date),
    Promise.resolve(getRoster()),
  ]);
  const byId = new Map(roster.map((u) => [u.id, u]));

  return preferences
    .filter((p) => byId.has(p.userId))
    .map((p) => ({
      userId: p.userId,
      name: byId.get(p.userId)!.name,
      menuChoice: p.menuChoice,
      eatingSpeed: p.eatingSpeed,
    }));
}

export async function runAssignment(
  date: string,
  options: RunAssignmentOptions = {},
): Promise<LunchGroup[]> {
  const store = getStore();
  const seed = options.seed ?? date;

  const participants = await buildParticipants(date);
  if (participants.length === 0) {
    throw new Error("아직 제출된 참여 정보가 없어요.");
  }

  await store.setStatus(date, "ASSIGNING");

  const history = await store.getHistory(date);
  const { groups } = assignGroups(participants, history, { seed });
  const prompts = allocatePrompts(groups.length, seed);

  const records: LunchGroup[] = groups.map((group, index) => ({
    id: `${date}-g${String(group.groupNumber).padStart(2, "0")}`,
    date,
    groupNumber: group.groupNumber,
    memberIds: group.members.map((m) => m.userId),
    questionId: prompts.questionIds[index] || null,
    missionId: prompts.missionIds[index] || null,
    matchingPoints: group.matchingPoints,
    createdAt: new Date().toISOString(),
  }));

  await store.saveGroups(date, records);
  return records;
}

/** A table-mate plus what they chose, so the result screen can show why. */
export interface ResultMember {
  userId: string;
  name: string;
  menuEmoji: string | null;
  menuName: string | null;
  eatingSpeed: EatingSpeed | null;
}

export interface MyResult {
  group: LunchGroup;
  members: ResultMember[];
  question: Question | null;
  mission: Mission | null;
  menuName: string | null;
  matchingPoints: MatchingPointKind[];
}

export async function getResultForUser(
  date: string,
  userId: string,
): Promise<MyResult | null> {
  const store = getStore();
  const groups = await store.getGroups(date);
  const group = groups.find((g) => g.memberIds.includes(userId));
  if (!group) return null;

  const roster = getRoster();
  const byId = new Map(roster.map((u) => [u.id, u]));

  const [preferences, day] = await Promise.all([
    store.listPreferences(date),
    store.getDayState(date),
  ]);

  const members: ResultMember[] = group.memberIds
    .map((id) => byId.get(id))
    .filter((u): u is User => Boolean(u))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((user) => {
      const preference = preferences.find((p) => p.userId === user.id);
      const menu = day.menus.find((m) => m.id === preference?.menuChoice);
      return {
        userId: user.id,
        name: user.name,
        menuEmoji: menu?.emoji ?? null,
        menuName: menu?.name ?? null,
        eatingSpeed: preference?.eatingSpeed ?? null,
      };
    });

  // Show the table's menu only when everyone actually chose the same one.
  const menuIds = new Set(
    group.memberIds
      .map((id) => preferences.find((p) => p.userId === id)?.menuChoice)
      .filter((id): id is string => Boolean(id)),
  );
  const menuName =
    menuIds.size === 1
      ? day.menus.find((m) => m.id === [...menuIds][0])?.name ?? null
      : null;

  return {
    group,
    members,
    question: findQuestion(group.questionId),
    mission: findMission(group.missionId),
    menuName,
    matchingPoints: group.matchingPoints,
  };
}

export interface ReactionTally {
  kind: ReactionKind;
  count: number;
  /** True when the reader is one of the people who reacted. */
  mine: boolean;
}

export interface SharedAnswer {
  id: string;
  userId: string;
  name: string;
  content: string;
  updatedAt: string;
  isMine: boolean;
  reactions: ReactionTally[];
}

export interface AnswerBoard {
  question: string | null;
  groupNumber: number;
  /** How many of the table have answered, shown before the reveal too. */
  answeredCount: number;
  memberCount: number;
  /** Table-mates who have not written yet, so the table can nudge them. */
  pendingNames: string[];
  myAnswer: string | null;
  /** False until the reader has answered — the others stay hidden. */
  revealed: boolean;
  answers: SharedAnswer[];
  /** The mission opens once the table is done, or when an admin forces it. */
  missionUnlocked: boolean;
  /** True when the admin opened it early, so the screen can say so. */
  missionForced: boolean;
}

/**
 * The question board for one person. Answers stay hidden until they have
 * written their own, so nobody is anchored by what the table already said.
 */
export async function getAnswerBoard(
  date: string,
  userId: string,
): Promise<AnswerBoard | null> {
  const result = await getResultForUser(date, userId);
  if (!result) return null;

  const store = getStore();
  const [answers, day] = await Promise.all([
    store.listAnswers(date, result.group.id),
    store.getDayState(date),
  ]);
  const byId = new Map(getRoster().map((u) => [u.id, u]));
  const mine = answers.find((a) => a.userId === userId) ?? null;

  // Only count answers from people actually seated at this table.
  const seated = answers.filter((a) => result.group.memberIds.includes(a.userId));

  const everyoneAnswered =
    result.members.length > 0 && seated.length >= result.members.length;
  const forced = day.missionsUnlocked && !everyoneAnswered;

  const answered = new Set(seated.map((a) => a.userId));
  const pendingNames = result.members
    .filter((m) => !answered.has(m.userId))
    .map((m) => m.name);

  // Reactions only matter once the answers are visible, so skip the read.
  // A database that has not run the latest migration yet must not take the
  // whole question screen down with it: fall back to "no reactions".
  let reactions: AnswerReaction[] = [];
  if (mine) {
    try {
      reactions = await store.listReactions(
        date,
        seated.map((a) => a.id),
      );
    } catch (error) {
      console.error("listReactions failed, showing none", error);
    }
  }

  return {
    missionUnlocked: everyoneAnswered || day.missionsUnlocked,
    missionForced: forced,
    question: result.question?.content ?? null,
    groupNumber: result.group.groupNumber,
    answeredCount: seated.length,
    memberCount: result.members.length,
    pendingNames,
    myAnswer: mine?.content ?? null,
    revealed: Boolean(mine),
    answers: mine
      ? seated.map((a) => {
          const forAnswer = reactions.filter((r) => r.answerId === a.id);
          return {
            id: a.id,
            userId: a.userId,
            name: byId.get(a.userId)?.name ?? "알 수 없음",
            content: a.content,
            updatedAt: a.updatedAt,
            isMine: a.userId === userId,
            reactions: REACTION_KINDS.map((kind) => {
              const of = forAnswer.filter((r) => r.kind === kind);
              return {
                kind,
                count: of.length,
                mine: of.some((r) => r.userId === userId),
              };
            }),
          };
        })
      : [],
  };
}

export const MATCHING_POINT_LABEL: Record<MatchingPointKind, string> = {
  SAME_MENU: "같은 메뉴를 선택했어요",
  SIMILAR_SPEED: "식사 속도가 비슷해요",
  ALL_NEW_FACES: "이전에 같은 조였던 적이 없어요",
};
