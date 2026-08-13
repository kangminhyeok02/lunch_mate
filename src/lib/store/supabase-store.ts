/**
 * Supabase adapter. Selected automatically when the project URL and key are
 * configured; see `getStore`.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AssignmentStatus,
  DayState,
  EatingSpeed,
  HistoryEntry,
  LunchGroup,
  LunchPreference,
  MatchingPointKind,
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

/** Postgres unique_violation — how a duplicate submission surfaces. */
const UNIQUE_VIOLATION = "23505";

interface MenuRow {
  id: string;
  date: string;
  name: string;
  description: string | null;
  emoji: string | null;
  image_url: string | null;
  active: boolean;
}

interface PreferenceRow {
  id: string;
  user_id: string;
  menu_choice: string;
  eating_speed: EatingSpeed;
  date: string;
  created_at: string;
}

interface GroupRow {
  id: string;
  date: string;
  group_number: number;
  question_id: string | null;
  mission_id: string | null;
  matching_points: MatchingPointKind[] | null;
  created_at: string;
  lunch_group_members: { user_id: string }[] | null;
}

function toMenu(row: MenuRow): MenuOption {
  return {
    id: row.id,
    date: row.date,
    name: row.name,
    description: row.description ?? "",
    emoji: row.emoji ?? "🍽️",
    imageUrl: row.image_url,
    active: row.active,
  };
}

function toPreference(row: PreferenceRow): LunchPreference {
  return {
    id: row.id,
    userId: row.user_id,
    menuChoice: row.menu_choice,
    eatingSpeed: row.eating_speed,
    date: row.date,
    createdAt: row.created_at,
  };
}

interface AnswerRow {
  id: string;
  date: string;
  group_id: string;
  user_id: string;
  question_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

function toAnswer(row: AnswerRow): QuestionAnswer {
  return {
    id: row.id,
    date: row.date,
    groupId: row.group_id,
    userId: row.user_id,
    questionId: row.question_id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toGroup(row: GroupRow): LunchGroup {
  return {
    id: row.id,
    date: row.date,
    groupNumber: row.group_number,
    memberIds: (row.lunch_group_members ?? []).map((m) => m.user_id),
    questionId: row.question_id,
    missionId: row.mission_id,
    matchingPoints: row.matching_points ?? [],
    createdAt: row.created_at,
  };
}

export class SupabaseLunchStore implements LunchStore {
  readonly kind = "supabase" as const;

  constructor(private readonly client: SupabaseClient) {}

  static fromEnv(): SupabaseLunchStore | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // Prefer the service role on the server so admin writes work under RLS.
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return new SupabaseLunchStore(
      createClient(url, key, { auth: { persistSession: false } }),
    );
  }

  async getDayState(date: string): Promise<DayState> {
    const [{ data: dayRow }, { data: menuRows }] = await Promise.all([
      // `*` rather than naming missions_unlocked: a database that has not run
      // the latest migration yet simply omits the field instead of erroring,
      // so deploy order does not matter.
      this.client.from("lunch_days").select("*").eq("date", date).maybeSingle(),
      this.client.from("menu_options").select("*").eq("date", date).eq("active", true),
    ]);

    const menus = (menuRows as MenuRow[] | null)?.length
      ? (menuRows as MenuRow[]).map(toMenu)
      : defaultMenusFor(date);

    const day = dayRow as {
      status?: AssignmentStatus;
      missions_unlocked?: boolean;
    } | null;

    return {
      date,
      status: (day?.status ?? "NOT_STARTED") as AssignmentStatus,
      menus,
      missionsUnlocked: day?.missions_unlocked ?? false,
    };
  }

  async setMissionsUnlocked(date: string, unlocked: boolean): Promise<void> {
    const { error } = await this.client
      .from("lunch_days")
      .upsert({ date, missions_unlocked: unlocked }, { onConflict: "date" });
    if (error) throw new Error(`setMissionsUnlocked failed: ${error.message}`);
  }

  async setMenus(date: string, menus: MenuOption[]): Promise<void> {
    await this.client.from("menu_options").delete().eq("date", date);
    const { error } = await this.client.from("menu_options").insert(
      menus.map((m) => ({
        id: m.id,
        date,
        name: m.name,
        description: m.description,
        emoji: m.emoji,
        image_url: m.imageUrl,
        active: m.active,
      })),
    );
    if (error) throw new Error(`setMenus failed: ${error.message}`);
  }

  async setStatus(date: string, status: AssignmentStatus): Promise<void> {
    const { error } = await this.client
      .from("lunch_days")
      .upsert({ date, status }, { onConflict: "date" });
    if (error) throw new Error(`setStatus failed: ${error.message}`);
  }

  async listPreferences(date: string): Promise<LunchPreference[]> {
    const { data, error } = await this.client
      .from("lunch_preferences")
      .select("*")
      .eq("date", date);
    if (error) throw new Error(`listPreferences failed: ${error.message}`);
    return (data as PreferenceRow[]).map(toPreference);
  }

  async getPreference(date: string, userId: string): Promise<LunchPreference | null> {
    const { data, error } = await this.client
      .from("lunch_preferences")
      .select("*")
      .eq("date", date)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(`getPreference failed: ${error.message}`);
    return data ? toPreference(data as PreferenceRow) : null;
  }

  async submitPreference(input: SubmitPreferenceInput): Promise<SubmitResult> {
    const roster = getRoster();
    const user = roster.find((u) => u.id === input.userId);
    if (!user) return { ok: false, reason: "UNKNOWN_USER" };

    const day = await this.getDayState(input.date);
    if (!day.menus.some((m) => m.id === input.menuChoice && m.active)) {
      return { ok: false, reason: "UNKNOWN_MENU" };
    }

    // The roster is the source of truth for people; mirror it into users so the
    // foreign key from preferences resolves.
    await this.client
      .from("users")
      .upsert({ id: user.id, name: user.name }, { onConflict: "id" });

    const { data, error } = await this.client
      .from("lunch_preferences")
      .insert({
        user_id: input.userId,
        menu_choice: input.menuChoice,
        eating_speed: input.eatingSpeed,
        date: input.date,
      })
      .select()
      .single();

    if (error) {
      // The (user_id, date) unique index is what actually enforces this.
      if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: "DUPLICATE" };
      throw new Error(`submitPreference failed: ${error.message}`);
    }

    await this.refreshCollectionStatus(input.date);
    return { ok: true, preference: toPreference(data as PreferenceRow) };
  }

  /** Advance NOT_STARTED → COLLECTING → READY_TO_ASSIGN as submissions land. */
  private async refreshCollectionStatus(date: string): Promise<void> {
    const [{ status }, preferences] = await Promise.all([
      this.getDayState(date),
      this.listPreferences(date),
    ]);
    if (status === "ASSIGNING" || status === "ASSIGNED") return;

    const next: AssignmentStatus =
      preferences.length >= getRoster().length ? "READY_TO_ASSIGN" : "COLLECTING";
    if (next !== status) await this.setStatus(date, next);
  }

  async getGroups(date: string): Promise<LunchGroup[]> {
    const { data, error } = await this.client
      .from("lunch_groups")
      .select("*, lunch_group_members(user_id)")
      .eq("date", date)
      .order("group_number");
    if (error) throw new Error(`getGroups failed: ${error.message}`);
    return (data as GroupRow[]).map(toGroup);
  }

  async saveGroups(date: string, groups: LunchGroup[]): Promise<void> {
    // Replace wholesale so re-running assignment is idempotent.
    await this.client.from("lunch_groups").delete().eq("date", date);

    if (groups.length > 0) {
      const { error: groupError } = await this.client.from("lunch_groups").insert(
        groups.map((g) => ({
          id: g.id,
          date,
          group_number: g.groupNumber,
          question_id: g.questionId,
          mission_id: g.missionId,
          matching_points: g.matchingPoints,
        })),
      );
      if (groupError) throw new Error(`saveGroups failed: ${groupError.message}`);

      const members = groups.flatMap((g) =>
        g.memberIds.map((userId) => ({ group_id: g.id, user_id: userId })),
      );
      const { error: memberError } = await this.client
        .from("lunch_group_members")
        .insert(members);
      if (memberError) throw new Error(`saveGroups members failed: ${memberError.message}`);
    }

    await this.setStatus(date, "ASSIGNED");
  }

  async listAnswers(date: string, groupId: string): Promise<QuestionAnswer[]> {
    const { data, error } = await this.client
      .from("question_answers")
      .select("*")
      .eq("date", date)
      .eq("group_id", groupId)
      .order("created_at");
    if (error) throw new Error(`listAnswers failed: ${error.message}`);
    return (data as AnswerRow[]).map(toAnswer);
  }

  async saveAnswer(input: SaveAnswerInput): Promise<QuestionAnswer> {
    // The (user_id, date) unique index makes this an edit when one already exists.
    const { data, error } = await this.client
      .from("question_answers")
      .upsert(
        {
          date: input.date,
          group_id: input.groupId,
          user_id: input.userId,
          question_id: input.questionId,
          content: input.content,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,date" },
      )
      .select()
      .single();
    if (error) throw new Error(`saveAnswer failed: ${error.message}`);
    return toAnswer(data as AnswerRow);
  }

  async getHistory(beforeDate: string): Promise<HistoryEntry[]> {
    const { data, error } = await this.client
      .from("lunch_groups")
      .select("date, group_number, lunch_group_members(user_id)")
      .lt("date", beforeDate);
    if (error) throw new Error(`getHistory failed: ${error.message}`);

    const byDate = new Map<string, string[][]>();
    for (const row of data as GroupRow[]) {
      const list = byDate.get(row.date) ?? [];
      list.push((row.lunch_group_members ?? []).map((m) => m.user_id));
      byDate.set(row.date, list);
    }
    return Array.from(byDate.entries()).map(([date, groups]) => ({ date, groups }));
  }

  async resetDay(date: string): Promise<void> {
    // Explicit even though the group FK cascades, so the order stays obvious.
    await this.client.from("question_answers").delete().eq("date", date);
    await this.client.from("lunch_groups").delete().eq("date", date);
    await this.client.from("lunch_preferences").delete().eq("date", date);
    await this.setMissionsUnlocked(date, false);
    await this.setStatus(date, "NOT_STARTED");
  }
}
