import { describe, expect, it } from "vitest";
import { allMissions, allQuestions, allocatePrompts } from "@/lib/prompts";

describe("prompt allocation", () => {
  it("has enough questions and missions for nine tables", () => {
    expect(allQuestions().length).toBeGreaterThanOrEqual(14);
    expect(allMissions().length).toBeGreaterThanOrEqual(9);
  });

  it("gives all nine groups a distinct question and mission", () => {
    const { questionIds, missionIds } = allocatePrompts(9, "2026-08-12");
    expect(questionIds).toHaveLength(9);
    expect(missionIds).toHaveLength(9);
    expect(new Set(questionIds).size).toBe(9);
    expect(new Set(missionIds).size).toBe(9);
  });

  it("spreads questions across categories rather than exhausting one", () => {
    const { questionIds } = allocatePrompts(9, "2026-08-12");
    const categories = new Set(
      questionIds.map((id) => allQuestions().find((q) => q.id === id)!.category),
    );
    expect(categories.size).toBeGreaterThanOrEqual(3);
  });

  it("is deterministic for a given seed and varies across seeds", () => {
    const a = allocatePrompts(9, "day-1");
    const b = allocatePrompts(9, "day-1");
    const c = allocatePrompts(9, "day-2");
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("reuses prompts only once supply is exhausted", () => {
    const questionCount = allQuestions().length;
    const { questionIds } = allocatePrompts(questionCount + 3, "many");

    // Every question appears before any repeats.
    expect(new Set(questionIds.slice(0, questionCount)).size).toBe(questionCount);
    expect(questionIds).toHaveLength(questionCount + 3);
  });

  it("returns nothing to allocate for zero groups", () => {
    expect(allocatePrompts(0, "seed")).toEqual({ questionIds: [], missionIds: [] });
  });
});
