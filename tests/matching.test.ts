import { describe, expect, it } from "vitest";
import {
  assignGroups,
  countRepeatPairs,
  groupCountFor,
  matchingPointsFor,
  buildHistoryWeights,
  WEIGHTS,
} from "@/lib/matching";
import type { EatingSpeed, HistoryEntry, Participant } from "@/lib/types";
import { createRng, shuffle } from "@/lib/rng";

const SPEEDS: EatingSpeed[] = ["SLOW", "NORMAL", "FAST"];

function makeParticipants(count: number, seed = 7): Participant[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, (_, i) => ({
    userId: `u${String(i + 1).padStart(2, "0")}`,
    name: `사원${String(i + 1).padStart(2, "0")}`,
    menuChoice: rng() < 0.55 ? "menu-a" : "menu-b",
    eatingSpeed: SPEEDS[Math.floor(rng() * SPEEDS.length)],
  }));
}

describe("group sizing", () => {
  it("splits 36 people into 9 groups of 4", () => {
    const result = assignGroups(makeParticipants(36), [], { seed: "2026-08-12" });
    expect(result.groups).toHaveLength(9);
    for (const group of result.groups) {
      expect(group.members).toHaveLength(4);
    }
  });

  it("places every participant exactly once", () => {
    const participants = makeParticipants(36);
    const result = assignGroups(participants, [], { seed: "2026-08-12" });
    const placed = result.groups.flatMap((g) => g.members.map((m) => m.userId));
    expect(placed).toHaveLength(36);
    expect(new Set(placed).size).toBe(36);
    expect(new Set(placed)).toEqual(new Set(participants.map((p) => p.userId)));
  });

  it.each([28, 30, 33, 35, 37, 41])(
    "keeps group sizes within one of each other for %i people",
    (count) => {
      const result = assignGroups(makeParticipants(count), [], { seed: "s" });
      const sizes = result.groups.map((g) => g.members.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(count);
    },
  );

  it("handles an empty roster without throwing", () => {
    expect(assignGroups([], [], { seed: "s" }).groups).toEqual([]);
  });

  it("computes group counts that round to the target size", () => {
    expect(groupCountFor(36)).toBe(9);
    expect(groupCountFor(30)).toBe(8);
    expect(groupCountFor(0)).toBe(0);
    expect(groupCountFor(2)).toBe(1);
  });
});

describe("determinism", () => {
  it("produces identical output for the same seed and input", () => {
    const participants = makeParticipants(36);
    const a = assignGroups(participants, [], { seed: "2026-08-12" });
    const b = assignGroups(participants, [], { seed: "2026-08-12" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("is insensitive to the order participants arrive in", () => {
    const participants = makeParticipants(36);
    const reordered = shuffle(participants, createRng(99));
    const a = assignGroups(participants, [], { seed: "fixed" });
    const b = assignGroups(reordered, [], { seed: "fixed" });
    const key = (r: typeof a) =>
      r.groups
        .map((g) => g.members.map((m) => m.userId).sort().join(","))
        .sort()
        .join("|");
    expect(key(a)).toBe(key(b));
  });

  it("produces different tables for different seeds", () => {
    const participants = makeParticipants(36);
    const a = assignGroups(participants, [], { seed: "day-1" });
    const b = assignGroups(participants, [], { seed: "day-2" });
    expect(JSON.stringify(a.groups)).not.toBe(JSON.stringify(b.groups));
  });
});

describe("priority 1 — avoiding repeat pairings", () => {
  it("produces fewer repeat pairs than a random baseline", () => {
    const participants = makeParticipants(36);

    // Yesterday everyone sat in sequential groups of four.
    const history: HistoryEntry[] = [
      {
        date: "2026-08-11",
        groups: Array.from({ length: 9 }, (_, g) =>
          participants.slice(g * 4, g * 4 + 4).map((p) => p.userId),
        ),
      },
    ];

    const result = assignGroups(participants, history, { seed: "2026-08-12" });
    const optimized = countRepeatPairs(result.groups, history);

    // Baseline: 200 random partitions, averaged.
    const rng = createRng(1234);
    let baselineTotal = 0;
    const trials = 200;
    for (let t = 0; t < trials; t += 1) {
      const shuffled = shuffle(participants, rng);
      const randomGroups = Array.from({ length: 9 }, (_, g) => ({
        members: shuffled.slice(g * 4, g * 4 + 4),
      }));
      baselineTotal += countRepeatPairs(randomGroups, history);
    }
    const baselineAverage = baselineTotal / trials;

    expect(optimized).toBeLessThan(baselineAverage);
  });

  it("seats nobody with a former table mate when a clean solution exists", () => {
    const participants = makeParticipants(36);
    const history: HistoryEntry[] = [
      {
        date: "2026-08-11",
        groups: Array.from({ length: 9 }, (_, g) =>
          participants.slice(g * 4, g * 4 + 4).map((p) => p.userId),
        ),
      },
    ];
    const result = assignGroups(participants, history, { seed: "2026-08-12" });
    expect(countRepeatPairs(result.groups, history)).toBe(0);
  });

  it("weights a recent repeat more heavily than an old one", () => {
    const history: HistoryEntry[] = [
      { date: "2026-08-11", groups: [["a", "b"]] },
      { date: "2026-07-01", groups: [["c", "d"]] },
    ];
    const weights = buildHistoryWeights(history);
    expect(weights.get("a|b")!).toBeGreaterThan(weights.get("c|d")!);
  });
});

describe("priority 2 & 3 — speed and menu", () => {
  it("prefers grouping similar speeds when history is empty", () => {
    // Equal menus, so speed is the only lever.
    const participants: Participant[] = Array.from({ length: 12 }, (_, i) => ({
      userId: `u${i}`,
      name: `n${i}`,
      menuChoice: "menu-a",
      eatingSpeed: (i < 4 ? "SLOW" : i < 8 ? "NORMAL" : "FAST") as EatingSpeed,
    }));

    const result = assignGroups(participants, [], { seed: "speed" });
    for (const group of result.groups) {
      const speeds = new Set(group.members.map((m) => m.eatingSpeed));
      expect(speeds.size).toBe(1);
    }
  });

  it("keeps same-menu people together when the split is clean", () => {
    const participants: Participant[] = Array.from({ length: 8 }, (_, i) => ({
      userId: `u${i}`,
      name: `n${i}`,
      menuChoice: i < 4 ? "menu-a" : "menu-b",
      eatingSpeed: "NORMAL" as EatingSpeed,
    }));
    const result = assignGroups(participants, [], { seed: "menu" });
    for (const group of result.groups) {
      expect(new Set(group.members.map((m) => m.menuChoice)).size).toBe(1);
    }
  });

  it("orders weights so history dominates speed, and speed dominates menu", () => {
    expect(WEIGHTS.previousGroup).toBeGreaterThan(WEIGHTS.speedDifference);
    expect(WEIGHTS.speedDifference).toBeGreaterThan(WEIGHTS.menuDifference);
    expect(WEIGHTS.groupSize).toBeGreaterThanOrEqual(WEIGHTS.previousGroup);
  });
});

describe("matching points", () => {
  const base = (over: Partial<Participant>, i: number): Participant => ({
    userId: `u${i}`,
    name: `n${i}`,
    menuChoice: "menu-a",
    eatingSpeed: "NORMAL",
    ...over,
  });

  it("reports same menu only when every member picked it", () => {
    const same = [0, 1, 2, 3].map((i) => base({}, i));
    expect(matchingPointsFor(same, new Map())).toContain("SAME_MENU");

    const mixed = [0, 1, 2, 3].map((i) => base({ menuChoice: i === 3 ? "menu-b" : "menu-a" }, i));
    expect(matchingPointsFor(mixed, new Map())).not.toContain("SAME_MENU");
  });

  it("reports similar speed only when the spread is at most one step", () => {
    const close = [
      base({ eatingSpeed: "NORMAL" }, 0),
      base({ eatingSpeed: "FAST" }, 1),
      base({ eatingSpeed: "NORMAL" }, 2),
      base({ eatingSpeed: "NORMAL" }, 3),
    ];
    expect(matchingPointsFor(close, new Map())).toContain("SIMILAR_SPEED");

    const wide = [
      base({ eatingSpeed: "SLOW" }, 0),
      base({ eatingSpeed: "SLOW" }, 1),
      base({ eatingSpeed: "FAST" }, 2),
      base({ eatingSpeed: "FAST" }, 3),
    ];
    expect(matchingPointsFor(wide, new Map())).not.toContain("SIMILAR_SPEED");
  });

  it("reports all-new-faces only when no pair has met", () => {
    const members = [0, 1, 2, 3].map((i) => base({}, i));
    expect(matchingPointsFor(members, new Map())).toContain("ALL_NEW_FACES");

    const met = buildHistoryWeights([{ date: "2026-08-11", groups: [["u0", "u1"]] }]);
    expect(matchingPointsFor(members, met)).not.toContain("ALL_NEW_FACES");
  });

  it("attaches points to real assignments that reflect the group", () => {
    const result = assignGroups(makeParticipants(36), [], { seed: "points" });
    for (const group of result.groups) {
      const menus = new Set(group.members.map((m) => m.menuChoice));
      expect(group.matchingPoints.includes("SAME_MENU")).toBe(menus.size === 1);
    }
  });
});
