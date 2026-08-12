/**
 * Allocation of the per-group conversation starters: one question and one
 * mission per table. Distinct where supply allows, deterministic per seed.
 */

import questionsData from "@/data/questions.json";
import missionsData from "@/data/missions.json";
import type { Mission, Question } from "./types";
import { createRng, hashSeed, shuffle } from "./rng";

export function allQuestions(): Question[] {
  return (questionsData as Question[]).filter((q) => q.active);
}

export function allMissions(): Mission[] {
  return (missionsData as Mission[]).filter((m) => m.active);
}

export interface PromptAllocation {
  questionIds: string[];
  missionIds: string[];
}

/**
 * Deal `count` items out of `pool` without repeating until the pool is
 * exhausted, then wrap around — the spec allows reuse only once supply runs out.
 */
function deal<T extends { id: string }>(pool: readonly T[], count: number, rng: () => number): string[] {
  if (pool.length === 0) return Array.from({ length: count }, () => "");

  const out: string[] = [];
  let bag: T[] = [];
  for (let i = 0; i < count; i += 1) {
    if (bag.length === 0) bag = shuffle(pool, rng);
    out.push(bag.pop()!.id);
  }
  return out;
}

/**
 * Spread questions across categories first so nine adjacent tables don't all
 * get ice-breakers, then fill the remainder at random.
 */
function dealQuestions(pool: readonly Question[], count: number, rng: () => number): string[] {
  if (pool.length === 0) return Array.from({ length: count }, () => "");

  const byCategory = new Map<string, Question[]>();
  for (const q of pool) {
    const list = byCategory.get(q.category) ?? [];
    list.push(q);
    byCategory.set(q.category, list);
  }

  const rotations = Array.from(byCategory.keys())
    .sort()
    .map((category) => shuffle(byCategory.get(category)!, rng));

  const out: string[] = [];
  const used = new Set<string>();
  let cursor = 0;

  while (out.length < count) {
    let placed = false;
    for (let i = 0; i < rotations.length && out.length < count; i += 1) {
      const list = rotations[(cursor + i) % rotations.length];
      const next = list.find((q) => !used.has(q.id));
      if (next) {
        used.add(next.id);
        out.push(next.id);
        placed = true;
        cursor = (cursor + i + 1) % rotations.length;
        break;
      }
    }
    if (!placed) break; // every question used at least once
  }

  // Supply exhausted — reuse is explicitly permitted by the spec.
  if (out.length < count) {
    out.push(...deal(pool, count - out.length, rng));
  }

  return out;
}

export function allocatePrompts(groupCount: number, seed: string): PromptAllocation {
  const rng = createRng(hashSeed(`prompts:${seed}`));
  return {
    questionIds: dealQuestions(allQuestions(), groupCount, rng),
    missionIds: deal(allMissions(), groupCount, rng),
  };
}

export function findQuestion(id: string | null): Question | null {
  if (!id) return null;
  return allQuestions().find((q) => q.id === id) ?? null;
}

export function findMission(id: string | null): Mission | null {
  if (!id) return null;
  return allMissions().find((m) => m.id === id) ?? null;
}
