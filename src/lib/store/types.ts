/**
 * Persistence contract. Everything above this line (pages, actions, algorithm)
 * is unaware of whether the data lives in Supabase or in a local JSON file.
 */

import type {
  AssignmentStatus,
  DayState,
  EatingSpeed,
  HistoryEntry,
  LunchGroup,
  LunchPreference,
  MenuOption,
  QuestionAnswer,
} from "../types";

export interface SubmitPreferenceInput {
  userId: string;
  date: string;
  menuChoice: string;
  eatingSpeed: EatingSpeed;
}

export interface SaveAnswerInput {
  userId: string;
  date: string;
  groupId: string;
  questionId: string | null;
  content: string;
}

export type SubmitFailureReason = "DUPLICATE" | "UNKNOWN_USER" | "UNKNOWN_MENU";

export type SubmitResult =
  | { ok: true; preference: LunchPreference }
  | { ok: false; reason: SubmitFailureReason };

export interface LunchStore {
  /** Which adapter is active. Surfaced on the admin page. */
  readonly kind: "file" | "supabase";

  getDayState(date: string): Promise<DayState>;
  setMenus(date: string, menus: MenuOption[]): Promise<void>;
  setStatus(date: string, status: AssignmentStatus): Promise<void>;

  listPreferences(date: string): Promise<LunchPreference[]>;
  getPreference(date: string, userId: string): Promise<LunchPreference | null>;
  /** Rejects a second submission for the same (userId, date). */
  submitPreference(input: SubmitPreferenceInput): Promise<SubmitResult>;

  getGroups(date: string): Promise<LunchGroup[]>;
  saveGroups(date: string, groups: LunchGroup[]): Promise<void>;

  /** Every answer written by one table, oldest first. */
  listAnswers(date: string, groupId: string): Promise<QuestionAnswer[]>;
  /** Writes this user's answer for the day, replacing an earlier one. */
  saveAnswer(input: SaveAnswerInput): Promise<QuestionAnswer>;

  /** Past days' seating, oldest excluded automatically by the caller's cutoff. */
  getHistory(beforeDate: string): Promise<HistoryEntry[]>;

  /** Test/admin affordance: wipe a single day. */
  resetDay(date: string): Promise<void>;
}

export const DEFAULT_MENUS: Omit<MenuOption, "date">[] = [
  {
    id: "menu-a",
    name: "황태콩나물해장국",
    description: "소담상 · 잡곡밥 + 오징어까스 + 어묵볶음 외",
    emoji: "🍲",
    imageUrl: "/menu/menu-a.png",
    active: true,
  },
  {
    id: "menu-b",
    name: "돈육카레라이스",
    description: "인터고메 · 계란후라이 + 우동국물 + 오징어까스 외",
    emoji: "🍛",
    imageUrl: "/menu/menu-b.png",
    active: true,
  },
];

export function defaultMenusFor(date: string): MenuOption[] {
  return DEFAULT_MENUS.map((m) => ({ ...m, date }));
}
