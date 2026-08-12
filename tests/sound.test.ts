import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 소리 자체는 브라우저에서만 나므로, 여기서는 음정 계산과 음소거 저장처럼
 * 순수하게 판정할 수 있는 부분을 확인한다.
 */

// localStorage 흉내. sound.ts 가 모듈 로드 시점에 window 를 보지 않도록 되어 있어야 한다.
const store = new Map<string, string>();
vi.stubGlobal("window", {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  },
});

const { noteToFrequency, SOUND_SPECS, isMuted, setMuted } = await import("@/lib/sound");

beforeEach(() => {
  store.clear();
  setMuted(false);
});

describe("음정 계산", () => {
  it("A4는 440Hz다", () => {
    expect(noteToFrequency(0)).toBeCloseTo(440, 5);
  });

  it("한 옥타브 위는 두 배, 아래는 절반이다", () => {
    expect(noteToFrequency(12)).toBeCloseTo(880, 5);
    expect(noteToFrequency(-12)).toBeCloseTo(220, 5);
  });

  it("반음 하나는 약 5.95% 차이다", () => {
    expect(noteToFrequency(1) / noteToFrequency(0)).toBeCloseTo(1.059463, 5);
  });

  it("사람이 들을 수 있는 범위 안에서만 소리를 만든다", () => {
    for (const spec of Object.values(SOUND_SPECS)) {
      for (const note of spec.notes) {
        const hz = noteToFrequency(note);
        expect(hz).toBeGreaterThan(20);
        expect(hz).toBeLessThan(20000);
      }
    }
  });
});

describe("효과음 정의", () => {
  it("모든 효과음이 조용하고 짧다", () => {
    for (const [name, spec] of Object.entries(SOUND_SPECS)) {
      // 귀에 거슬리지 않을 만큼 작고, 조작을 방해하지 않을 만큼 짧아야 한다.
      expect(spec.gain, `${name} 음량`).toBeLessThanOrEqual(0.1);
      expect(spec.duration, `${name} 길이`).toBeLessThanOrEqual(0.2);
      expect(spec.notes.length).toBeGreaterThan(0);
    }
  });

  it("다음 단계로 갈 때는 올라가고, 오류일 때는 내려간다", () => {
    expect(SOUND_SPECS.select.notes[1]).toBeGreaterThan(SOUND_SPECS.select.notes[0]);
    expect(SOUND_SPECS.submit.notes[2]).toBeGreaterThan(SOUND_SPECS.submit.notes[0]);
    expect(SOUND_SPECS.error.notes[1]).toBeLessThan(SOUND_SPECS.error.notes[0]);
  });
});

describe("음소거 설정", () => {
  it("기본은 소리가 켜진 상태다", () => {
    expect(isMuted()).toBe(false);
  });

  it("끄고 켠 상태가 저장된다", () => {
    setMuted(true);
    expect(isMuted()).toBe(true);
    expect(store.get("lunch-mate-muted")).toBe("1");

    setMuted(false);
    expect(isMuted()).toBe(false);
    expect(store.get("lunch-mate-muted")).toBe("0");
  });
});
