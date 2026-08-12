/**
 * Score-based lunch group assignment.
 *
 * Lower score is better. The four terms mirror the priorities in the spec:
 *   1. don't put people together who already sat together
 *   2. keep eating speeds within a group close
 *   3. keep a group on one menu where possible
 *   4. keep group sizes even
 *
 * Strategy: a deterministic menu/speed-clustered initial partition, then
 * best-improvement pairwise swap local search. At 36 people the search space is
 * small enough that this converges in milliseconds and beats simulated
 * annealing on predictability, which matters because the spec requires the same
 * seed to always produce the same tables.
 */

import type {
  EatingSpeed,
  HistoryEntry,
  MatchingPointKind,
  Participant,
} from "./types";
import { SPEED_ORDER } from "./types";
import { hashSeed } from "./rng";

/** Tunable weights. Exported so they can be adjusted without touching logic. */
export const WEIGHTS = {
  previousGroup: 100,
  speedDifference: 30,
  menuDifference: 10,
  groupSize: 100,
} as const;

export const TARGET_GROUP_SIZE = 4;

/** Local search stops here even if improvements remain, to bound worst case. */
const MAX_SWAP_PASSES = 200;

export interface AssignedGroup {
  groupNumber: number;
  members: Participant[];
  matchingPoints: MatchingPointKind[];
}

export interface AssignOptions {
  /** Any string; the same seed and input always yield the same tables. */
  seed?: string;
  targetGroupSize?: number;
}

export interface AssignResult {
  groups: AssignedGroup[];
  /** Total cost of the final partition. Internal — never shown to users. */
  score: number;
}

/** Stable key for an unordered pair of user ids. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * How many times each pair has already sat together, weighted so that a repeat
 * from yesterday hurts more than one from three weeks ago.
 */
export function buildHistoryWeights(history: readonly HistoryEntry[]): Map<string, number> {
  const weights = new Map<string, number>();
  const ordered = history.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  ordered.forEach((entry, index) => {
    // Most recent entry weighs 1.0, each older one decays but never to zero.
    const recency = 1 / (1 + index * 0.5);
    for (const group of entry.groups) {
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          const key = pairKey(group[i], group[j]);
          weights.set(key, (weights.get(key) ?? 0) + recency);
        }
      }
    }
  });

  return weights;
}

function repeatPenalty(members: readonly Participant[], weights: Map<string, number>): number {
  let total = 0;
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      total += weights.get(pairKey(members[i].userId, members[j].userId)) ?? 0;
    }
  }
  return total;
}

/** Sum of pairwise speed distance. SLOW+FAST costs 2, SLOW+NORMAL costs 1. */
function speedPenalty(members: readonly Participant[]): number {
  let total = 0;
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      total += Math.abs(
        SPEED_ORDER[members[i].eatingSpeed] - SPEED_ORDER[members[j].eatingSpeed],
      );
    }
  }
  return total;
}

/** Members who differ from the group's most common menu. */
function menuPenalty(members: readonly Participant[]): number {
  if (members.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const m of members) {
    counts.set(m.menuChoice, (counts.get(m.menuChoice) ?? 0) + 1);
  }
  let majority = 0;
  for (const count of counts.values()) {
    if (count > majority) majority = count;
  }
  return members.length - majority;
}

function sizePenalty(members: readonly Participant[], target: number): number {
  return Math.abs(members.length - target);
}

/** Cost of a single group. */
export function scoreGroup(
  members: readonly Participant[],
  weights: Map<string, number>,
  targetSize: number,
): number {
  return (
    repeatPenalty(members, weights) * WEIGHTS.previousGroup +
    speedPenalty(members) * WEIGHTS.speedDifference +
    menuPenalty(members) * WEIGHTS.menuDifference +
    sizePenalty(members, targetSize) * WEIGHTS.groupSize
  );
}

/**
 * Number of groups to build. Keeps sizes as close to `targetSize` as possible
 * while never letting two groups differ by more than one person.
 */
export function groupCountFor(total: number, targetSize: number = TARGET_GROUP_SIZE): number {
  if (total <= 0) return 0;
  return Math.max(1, Math.round(total / targetSize));
}

/** Sizes for each group, largest first, differing by at most one. */
function groupSizes(total: number, count: number): number[] {
  if (count === 0) return [];
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Initial partition: cluster by menu then by speed so the starting point is
 * already good on priorities 2 and 3, leaving local search to fix history
 * repeats (priority 1) without wrecking the rest.
 *
 * Ties break on a per-person key derived from the seed, so a new seed reshuffles
 * interchangeable people while the order submissions arrived in never matters.
 */
function initialPartition(
  participants: readonly Participant[],
  sizes: readonly number[],
  seed: string,
): Participant[][] {
  const tiebreak = new Map(
    participants.map((p) => [p.userId, hashSeed(`${seed}:${p.userId}`)] as const),
  );

  const ordered = participants.slice().sort((a, b) => {
    if (a.menuChoice !== b.menuChoice) return a.menuChoice < b.menuChoice ? -1 : 1;
    const speedDelta = SPEED_ORDER[a.eatingSpeed] - SPEED_ORDER[b.eatingSpeed];
    if (speedDelta !== 0) return speedDelta;
    const keyDelta = tiebreak.get(a.userId)! - tiebreak.get(b.userId)!;
    if (keyDelta !== 0) return keyDelta;
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });

  const groups: Participant[][] = [];
  let cursor = 0;
  for (const size of sizes) {
    groups.push(ordered.slice(cursor, cursor + size));
    cursor += size;
  }
  return groups;
}

/**
 * Best-improvement pairwise swap. Deterministic: candidates are visited in a
 * fixed order and ties always resolve to the first pair found.
 */
function optimize(
  groups: Participant[][],
  weights: Map<string, number>,
  targetSize: number,
): void {
  const scores = groups.map((g) => scoreGroup(g, weights, targetSize));

  for (let pass = 0; pass < MAX_SWAP_PASSES; pass += 1) {
    let bestDelta = -1e-9;
    let bestMove: [number, number, number, number] | null = null;

    for (let gi = 0; gi < groups.length; gi += 1) {
      for (let gj = gi + 1; gj < groups.length; gj += 1) {
        for (let mi = 0; mi < groups[gi].length; mi += 1) {
          for (let mj = 0; mj < groups[gj].length; mj += 1) {
            const left = groups[gi].slice();
            const right = groups[gj].slice();
            [left[mi], right[mj]] = [right[mj], left[mi]];

            const delta =
              scores[gi] +
              scores[gj] -
              (scoreGroup(left, weights, targetSize) + scoreGroup(right, weights, targetSize));

            if (delta > bestDelta) {
              bestDelta = delta;
              bestMove = [gi, gj, mi, mj];
            }
          }
        }
      }
    }

    if (!bestMove) return;

    const [gi, gj, mi, mj] = bestMove;
    const tmp = groups[gi][mi];
    groups[gi][mi] = groups[gj][mj];
    groups[gj][mj] = tmp;
    scores[gi] = scoreGroup(groups[gi], weights, targetSize);
    scores[gj] = scoreGroup(groups[gj], weights, targetSize);
  }
}

/**
 * Reasons this specific group makes sense, computed from the finished group so
 * that what users read always matches what actually happened.
 */
export function matchingPointsFor(
  members: readonly Participant[],
  weights: Map<string, number>,
): MatchingPointKind[] {
  const points: MatchingPointKind[] = [];
  if (members.length === 0) return points;

  const menus = new Set(members.map((m) => m.menuChoice));
  if (menus.size === 1) points.push("SAME_MENU");

  const orders = members.map((m) => SPEED_ORDER[m.eatingSpeed]);
  if (Math.max(...orders) - Math.min(...orders) <= 1) points.push("SIMILAR_SPEED");

  if (repeatPenalty(members, weights) === 0) points.push("ALL_NEW_FACES");

  return points;
}

/** Count pairs in the result that have sat together before. Used by tests. */
export function countRepeatPairs(
  groups: readonly { members: readonly Participant[] }[],
  history: readonly HistoryEntry[],
): number {
  const weights = buildHistoryWeights(history);
  let repeats = 0;
  for (const group of groups) {
    const members = group.members;
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        if (weights.has(pairKey(members[i].userId, members[j].userId))) repeats += 1;
      }
    }
  }
  return repeats;
}

export function assignGroups(
  participants: readonly Participant[],
  history: readonly HistoryEntry[] = [],
  options: AssignOptions = {},
): AssignResult {
  const targetSize = options.targetGroupSize ?? TARGET_GROUP_SIZE;
  const seed = options.seed ?? "lunch-mate";
  const weights = buildHistoryWeights(history);

  if (participants.length === 0) {
    return { groups: [], score: 0 };
  }

  const count = groupCountFor(participants.length, targetSize);
  const sizes = groupSizes(participants.length, count);
  const groups = initialPartition(participants, sizes, seed);

  optimize(groups, weights, targetSize);

  const assigned: AssignedGroup[] = groups.map((members, index) => ({
    groupNumber: index + 1,
    // Stable member order so repeated runs render identically.
    members: members.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    matchingPoints: matchingPointsFor(members, weights),
  }));

  const score = groups.reduce((sum, g) => sum + scoreGroup(g, weights, targetSize), 0);
  return { groups: assigned, score };
}

/** Re-exported for callers that need the same speed vocabulary. */
export type { EatingSpeed };
