/** Core domain types for LUNCH MATE. */

export type EatingSpeed = "SLOW" | "NORMAL" | "FAST";

export const EATING_SPEEDS: EatingSpeed[] = ["SLOW", "NORMAL", "FAST"];

/** Ordinal position of each speed, used to measure how far apart two eaters are. */
export const SPEED_ORDER: Record<EatingSpeed, number> = {
  SLOW: 0,
  NORMAL: 1,
  FAST: 2,
};

export const SPEED_LABEL: Record<EatingSpeed, { emoji: string; title: string; detail: string }> = {
  SLOW: { emoji: "🐢", title: "천천히 먹는 편", detail: "20~30분 이상" },
  NORMAL: { emoji: "🙂", title: "보통", detail: "15~20분" },
  FAST: { emoji: "⚡", title: "빠르게 먹는 편", detail: "10~15분" },
};

/**
 * Lifecycle of a single day's lunch event.
 * NOT_STARTED → COLLECTING → READY_TO_ASSIGN → ASSIGNING → ASSIGNED
 */
export type AssignmentStatus =
  | "NOT_STARTED"
  | "COLLECTING"
  | "READY_TO_ASSIGN"
  | "ASSIGNING"
  | "ASSIGNED";

export type QuestionCategory = "ICE_BREAKING" | "CAREER" | "FUTURE";

export interface User {
  id: string;
  name: string;
}

export interface MenuOption {
  id: string;
  date: string;
  name: string;
  description: string;
  emoji: string;
  imageUrl: string | null;
  active: boolean;
}

export interface LunchPreference {
  id: string;
  userId: string;
  /** Id of the chosen MenuOption. */
  menuChoice: string;
  eatingSpeed: EatingSpeed;
  /** ISO date, YYYY-MM-DD. Unique together with userId. */
  date: string;
  createdAt: string;
}

export interface Question {
  id: string;
  category: QuestionCategory;
  content: string;
  active: boolean;
}

export interface Mission {
  id: string;
  content: string;
  active: boolean;
}

/**
 * Reasons surfaced to users on the result screen. Derived from the actual
 * composition of their group — never from internal matching scores.
 */
export type MatchingPointKind = "SAME_MENU" | "SIMILAR_SPEED" | "ALL_NEW_FACES";

export interface LunchGroup {
  id: string;
  date: string;
  groupNumber: number;
  memberIds: string[];
  questionId: string | null;
  missionId: string | null;
  matchingPoints: MatchingPointKind[];
  createdAt: string;
}

/**
 * One person's answer to their table's question of the day. Visible to the rest
 * of the table only once the reader has answered themselves.
 */
export interface QuestionAnswer {
  id: string;
  date: string;
  groupId: string;
  userId: string;
  /** The question this answers, kept so a re-assignment cannot orphan the text. */
  questionId: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/** Longest answer we accept, enforced on the server as well as in the textarea. */
export const ANSWER_MAX_LENGTH = 300;

/** One day's record of who sat together, used to avoid repeat pairings. */
export interface HistoryEntry {
  date: string;
  /** Each inner array is one group's member ids. */
  groups: string[][];
}

/** A person ready to be placed into a group. */
export interface Participant {
  userId: string;
  name: string;
  menuChoice: string;
  eatingSpeed: EatingSpeed;
}

export interface DayState {
  date: string;
  status: AssignmentStatus;
  menus: MenuOption[];
  /** Admin override: opens the mission without waiting for every answer. */
  missionsUnlocked: boolean;
}
