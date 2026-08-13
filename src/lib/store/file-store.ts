/**
 * JSON-file adapter. Used for local development and for running the whole flow
 * before Supabase credentials exist.
 *
 * Not suitable for Vercel's serverless filesystem, which is ephemeral and
 * per-instance — configure Supabase for the real event.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  AssignmentStatus,
  DayState,
  HistoryEntry,
  LunchGroup,
  LunchPreference,
  MenuOption,
  QuestionAnswer,
} from "../types";
import { getRoster } from "../roster";
import {
  defaultMenusFor,
  type LunchStore,
  type SaveAnswerInput,
  type SubmitPreferenceInput,
  type SubmitResult,
} from "./types";

interface DayRecord {
  status: AssignmentStatus;
  menus: MenuOption[];
  preferences: LunchPreference[];
  groups: LunchGroup[];
  answers: QuestionAnswer[];
}

interface FileShape {
  days: Record<string, DayRecord>;
}

/** Always a fresh object: the returned shape gets mutated in place. */
function emptyShape(): FileShape {
  return { days: {} };
}

export class FileLunchStore implements LunchStore {
  readonly kind = "file" as const;

  private readonly filePath: string;
  /** Serialises read-modify-write cycles so 36 concurrent submits can't race. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(filePath?: string) {
    this.filePath =
      filePath ??
      process.env.LUNCH_MATE_DATA_FILE ??
      path.join(process.cwd(), "data", "lunch-mate.json");
  }

  private async read(): Promise<FileShape> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as FileShape;
      return parsed.days ? parsed : emptyShape();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyShape();
      throw error;
    }
  }

  private async write(data: FileShape): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }

  /** Every mutation runs through here, one at a time. */
  private transaction<T>(fn: (data: FileShape) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const data = await this.read();
      const result = await fn(data);
      await this.write(data);
      return result;
    });
    // Keep the chain alive even if one caller rejects.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private static day(data: FileShape, date: string): DayRecord {
    if (!data.days[date]) {
      data.days[date] = {
        status: "NOT_STARTED",
        menus: defaultMenusFor(date),
        preferences: [],
        groups: [],
        answers: [],
      };
    }
    // Files written before answers existed have no such array.
    data.days[date].answers ??= [];
    return data.days[date];
  }

  async getDayState(date: string): Promise<DayState> {
    const data = await this.read();
    const day = data.days[date];
    if (!day) {
      return { date, status: "NOT_STARTED", menus: defaultMenusFor(date) };
    }
    return { date, status: day.status, menus: day.menus };
  }

  async setMenus(date: string, menus: MenuOption[]): Promise<void> {
    await this.transaction((data) => {
      FileLunchStore.day(data, date).menus = menus;
    });
  }

  async setStatus(date: string, status: AssignmentStatus): Promise<void> {
    await this.transaction((data) => {
      FileLunchStore.day(data, date).status = status;
    });
  }

  async listPreferences(date: string): Promise<LunchPreference[]> {
    const data = await this.read();
    return data.days[date]?.preferences ?? [];
  }

  async getPreference(date: string, userId: string): Promise<LunchPreference | null> {
    const prefs = await this.listPreferences(date);
    return prefs.find((p) => p.userId === userId) ?? null;
  }

  async submitPreference(input: SubmitPreferenceInput): Promise<SubmitResult> {
    return this.transaction<SubmitResult>((data) => {
      const day = FileLunchStore.day(data, input.date);

      if (!getRoster().some((u) => u.id === input.userId)) {
        return { ok: false, reason: "UNKNOWN_USER" };
      }
      if (!day.menus.some((m) => m.id === input.menuChoice && m.active)) {
        return { ok: false, reason: "UNKNOWN_MENU" };
      }
      if (day.preferences.some((p) => p.userId === input.userId)) {
        return { ok: false, reason: "DUPLICATE" };
      }

      const preference: LunchPreference = {
        id: `${input.date}:${input.userId}`,
        userId: input.userId,
        menuChoice: input.menuChoice,
        eatingSpeed: input.eatingSpeed,
        date: input.date,
        createdAt: new Date().toISOString(),
      };
      day.preferences.push(preference);

      if (day.status === "NOT_STARTED") day.status = "COLLECTING";
      if (day.status === "COLLECTING" && day.preferences.length >= getRoster().length) {
        day.status = "READY_TO_ASSIGN";
      }

      return { ok: true, preference };
    });
  }

  async getGroups(date: string): Promise<LunchGroup[]> {
    const data = await this.read();
    return data.days[date]?.groups ?? [];
  }

  async saveGroups(date: string, groups: LunchGroup[]): Promise<void> {
    await this.transaction((data) => {
      const day = FileLunchStore.day(data, date);
      day.groups = groups;
      day.status = "ASSIGNED";
    });
  }

  async listAnswers(date: string, groupId: string): Promise<QuestionAnswer[]> {
    const data = await this.read();
    return (data.days[date]?.answers ?? [])
      .filter((a) => a.groupId === groupId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  }

  async saveAnswer(input: SaveAnswerInput): Promise<QuestionAnswer> {
    return this.transaction<QuestionAnswer>((data) => {
      const day = FileLunchStore.day(data, input.date);
      const now = new Date().toISOString();
      const existing = day.answers.find((a) => a.userId === input.userId);

      if (existing) {
        existing.content = input.content;
        existing.groupId = input.groupId;
        existing.questionId = input.questionId;
        existing.updatedAt = now;
        return existing;
      }

      const answer: QuestionAnswer = {
        id: `${input.date}:${input.userId}:answer`,
        date: input.date,
        groupId: input.groupId,
        userId: input.userId,
        questionId: input.questionId,
        content: input.content,
        createdAt: now,
        updatedAt: now,
      };
      day.answers.push(answer);
      return answer;
    });
  }

  async getHistory(beforeDate: string): Promise<HistoryEntry[]> {
    const data = await this.read();
    return Object.entries(data.days)
      .filter(([date, day]) => date < beforeDate && day.groups.length > 0)
      .map(([date, day]) => ({
        date,
        groups: day.groups.map((g) => g.memberIds),
      }));
  }

  async resetDay(date: string): Promise<void> {
    await this.transaction((data) => {
      delete data.days[date];
    });
  }
}
