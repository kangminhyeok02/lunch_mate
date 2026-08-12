/**
 * Ties the matching algorithm to storage: read the day's submissions, build
 * tables, hand each table a question and a mission, persist the result.
 */

import { assignGroups } from "./matching";
import { allocatePrompts, findMission, findQuestion } from "./prompts";
import { getRoster } from "./roster";
import { getStore } from "./store";
import type {
  LunchGroup,
  MatchingPointKind,
  Mission,
  Participant,
  Question,
  User,
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

export interface MyResult {
  group: LunchGroup;
  members: User[];
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
  const members = group.memberIds
    .map((id) => byId.get(id))
    .filter((u): u is User => Boolean(u))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const [preferences, day] = await Promise.all([
    store.listPreferences(date),
    store.getDayState(date),
  ]);

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

export const MATCHING_POINT_LABEL: Record<MatchingPointKind, string> = {
  SAME_MENU: "같은 메뉴를 선택했어요",
  SIMILAR_SPEED: "식사 속도가 비슷해요",
  ALL_NEW_FACES: "이전에 같은 조였던 적이 없어요",
};
