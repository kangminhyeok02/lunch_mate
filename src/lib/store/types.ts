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
} from "../types";

export interface SubmitPreferenceInput {
  userId: string;
  date: string;
  menuChoice: string;
  eatingSpeed: EatingSpeed;
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

  /** Past days' seating, oldest excluded automatically by the caller's cutoff. */
  getHistory(beforeDate: string): Promise<HistoryEntry[]>;

  /** Test/admin affordance: wipe a single day. */
  resetDay(date: string): Promise<void>;
}

export const DEFAULT_MENUS: Omit<MenuOption, "date">[] = [
  {
    id: "menu-a",
    name: "제육볶음",
    description: "매콤한 제육볶음 · 밥 + 국 + 반찬",
    emoji: "🍚",
    imageUrl: null,
    active: true,
  },
  {
    id: "menu-b",
    name: "돈까스",
    description: "바삭한 왕돈까스 · 밥 + 샐러드 + 소스",
    emoji: "🥩",
    imageUrl: null,
    active: true,
  },
];

export function defaultMenusFor(date: string): MenuOption[] {
  return DEFAULT_MENUS.map((m) => ({ ...m, date }));
}
