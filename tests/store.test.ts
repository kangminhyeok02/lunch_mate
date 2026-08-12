import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileLunchStore } from "@/lib/store/file-store";
import { defaultMenusFor } from "@/lib/store/types";
import { getRoster } from "@/lib/roster";

const DATE = "2026-08-12";

let dir: string;
let store: FileLunchStore;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "lunch-mate-"));
  store = new FileLunchStore(path.join(dir, "db.json"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

function firstUser() {
  return getRoster()[0];
}

describe("FileLunchStore", () => {
  it("starts a day as NOT_STARTED with the default menus", async () => {
    const day = await store.getDayState(DATE);
    expect(day.status).toBe("NOT_STARTED");
    expect(day.menus).toHaveLength(2);
  });

  it("accepts a submission and moves the day to COLLECTING", async () => {
    const user = firstUser();
    const result = await store.submitPreference({
      userId: user.id,
      date: DATE,
      menuChoice: "menu-a",
      eatingSpeed: "NORMAL",
    });

    expect(result.ok).toBe(true);
    expect((await store.getDayState(DATE)).status).toBe("COLLECTING");
    expect(await store.listPreferences(DATE)).toHaveLength(1);
  });

  it("rejects a second submission for the same person and date", async () => {
    const user = firstUser();
    const input = {
      userId: user.id,
      date: DATE,
      menuChoice: "menu-a",
      eatingSpeed: "FAST" as const,
    };

    expect((await store.submitPreference(input)).ok).toBe(true);

    const second = await store.submitPreference({ ...input, menuChoice: "menu-b" });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("DUPLICATE");

    // The original choice is untouched.
    const stored = await store.getPreference(DATE, user.id);
    expect(stored?.menuChoice).toBe("menu-a");
    expect(await store.listPreferences(DATE)).toHaveLength(1);
  });

  it("allows the same person to submit again on a different date", async () => {
    const user = firstUser();
    const base = { userId: user.id, menuChoice: "menu-a", eatingSpeed: "SLOW" as const };
    expect((await store.submitPreference({ ...base, date: DATE })).ok).toBe(true);
    expect((await store.submitPreference({ ...base, date: "2026-08-13" })).ok).toBe(true);
  });

  it("keeps exactly one submission when 36 people submit concurrently twice each", async () => {
    const roster = getRoster();
    const attempts = roster.flatMap((user) => [
      store.submitPreference({
        userId: user.id,
        date: DATE,
        menuChoice: "menu-a",
        eatingSpeed: "NORMAL",
      }),
      store.submitPreference({
        userId: user.id,
        date: DATE,
        menuChoice: "menu-b",
        eatingSpeed: "FAST",
      }),
    ]);

    const results = await Promise.all(attempts);
    expect(results.filter((r) => r.ok)).toHaveLength(roster.length);
    expect(await store.listPreferences(DATE)).toHaveLength(roster.length);
  });

  it("flips to READY_TO_ASSIGN once the whole roster has submitted", async () => {
    for (const user of getRoster()) {
      await store.submitPreference({
        userId: user.id,
        date: DATE,
        menuChoice: "menu-a",
        eatingSpeed: "NORMAL",
      });
    }
    expect((await store.getDayState(DATE)).status).toBe("READY_TO_ASSIGN");
  });

  it("rejects an unknown user and an unknown menu", async () => {
    const unknownUser = await store.submitPreference({
      userId: "nope",
      date: DATE,
      menuChoice: "menu-a",
      eatingSpeed: "NORMAL",
    });
    expect(unknownUser).toEqual({ ok: false, reason: "UNKNOWN_USER" });

    const unknownMenu = await store.submitPreference({
      userId: firstUser().id,
      date: DATE,
      menuChoice: "menu-z",
      eatingSpeed: "NORMAL",
    });
    expect(unknownMenu).toEqual({ ok: false, reason: "UNKNOWN_MENU" });
  });

  it("persists across store instances pointing at the same file", async () => {
    const file = path.join(dir, "persist.json");
    const a = new FileLunchStore(file);
    await a.submitPreference({
      userId: firstUser().id,
      date: DATE,
      menuChoice: "menu-a",
      eatingSpeed: "SLOW",
    });

    const b = new FileLunchStore(file);
    expect(await b.listPreferences(DATE)).toHaveLength(1);
  });

  it("returns past seating as history and excludes the current date", async () => {
    await store.saveGroups("2026-08-11", [
      {
        id: "g1",
        date: "2026-08-11",
        groupNumber: 1,
        memberIds: ["a", "b"],
        questionId: null,
        missionId: null,
        matchingPoints: [],
        createdAt: new Date().toISOString(),
      },
    ]);

    const history = await store.getHistory(DATE);
    expect(history).toHaveLength(1);
    expect(history[0].groups).toEqual([["a", "b"]]);

    expect(await store.getHistory("2026-08-11")).toHaveLength(0);
  });

  it("marks the day ASSIGNED when groups are saved", async () => {
    await store.saveGroups(DATE, []);
    expect((await store.getDayState(DATE)).status).toBe("ASSIGNED");
  });

  it("honours custom menus set by an admin", async () => {
    const menus = defaultMenusFor(DATE).map((m) => ({ ...m, name: `${m.name} 특선` }));
    await store.setMenus(DATE, menus);
    const day = await store.getDayState(DATE);
    expect(day.menus[0].name).toContain("특선");
  });
});
