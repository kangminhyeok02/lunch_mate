/**
 * The 36 participants. Kept out of components: names come from the
 * LUNCH_MATE_ROSTER env var, falling back to a seed file for local runs.
 */

import rosterSeed from "@/data/roster.seed.json";
import type { User } from "./types";
import { hashSeed } from "./rng";


/** Stable id for a name, so ids survive reordering the roster. */
function userIdFor(name: string, duplicateIndex: number): string {
  const suffix = duplicateIndex === 0 ? "" : `-${duplicateIndex + 1}`;
  return `u-${hashSeed(name).toString(36)}${suffix}`;
}

export function rosterNames(): string[] {
  const fromEnv = process.env.LUNCH_MATE_ROSTER;
  const names = fromEnv
    ? fromEnv.split(",").map((n) => n.trim()).filter(Boolean)
    : (rosterSeed as string[]);
  return names;
}

export function getRoster(): User[] {
  const seen = new Map<string, number>();
  return rosterNames().map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return { id: userIdFor(name, count), name };
  });
}
