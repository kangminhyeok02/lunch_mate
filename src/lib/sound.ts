"use client";

/**
 * 효과음. 음원 파일 없이 Web Audio API 로 합성한다.
 * 파일이 없으니 로딩 지연도, 저작권 문제도 없다.
 *
 * 모바일 브라우저는 사용자가 화면을 만지기 전에는 소리를 내지 못하게 막는다.
 * 그래서 첫 탭에서 unlockAudio() 로 오디오를 깨워 두고, 결과 공개처럼
 * 자동으로 일어나는 순간에도 소리가 나도록 한다.
 */

const MUTE_KEY = "lunch-mate-muted";

/** 12음계 기준 주파수. A4 = 440Hz. */
export function noteToFrequency(semitonesFromA4: number): number {
  return 440 * Math.pow(2, semitonesFromA4 / 12);
}

/** 화면 동작별 소리. 값은 A4 기준 반음 거리. */
export const SOUND_SPECS = {
  /** 선택지를 고를 때 — 짧고 가볍게 */
  tap: { notes: [3], duration: 0.05, gain: 0.05, type: "sine" as const },
  /** 다음 단계로 넘어갈 때 — 두 음 상승 */
  select: { notes: [7, 12], duration: 0.08, gain: 0.06, type: "sine" as const },
  /** 제출 완료 — 세 음 상승 */
  submit: { notes: [4, 9, 16], duration: 0.1, gain: 0.07, type: "triangle" as const },
  /** 오류 — 두 음 하강 */
  error: { notes: [1, -4], duration: 0.12, gain: 0.06, type: "sine" as const },
} as const;

export type SoundName = keyof typeof SOUND_SPECS;

let context: AudioContext | null = null;
let muted = false;
let initialised = false;

function ensureMuteLoaded(): void {
  if (initialised || typeof window === "undefined") return;
  initialised = true;
  muted = window.localStorage.getItem(MUTE_KEY) === "1";
}

export function isMuted(): boolean {
  ensureMuteLoaded();
  return muted;
}

export function setMuted(next: boolean): void {
  ensureMuteLoaded();
  muted = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  }
}

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context) return context;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

/**
 * 첫 사용자 조작에서 호출한다. 모바일 브라우저의 자동재생 차단을 풀어
 * 이후 자동으로 발생하는 소리도 재생되게 만든다.
 */
export function unlockAudio(): void {
  const ctx = audioContext();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

/** 한 음을 특정 시각에 울린다. */
function scheduleTone(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  duration: number,
  peakGain: number,
  type: OscillatorType,
): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.value = frequency;

  // 딱딱 끊기지 않도록 짧게 올렸다 지수적으로 감쇠시킨다.
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

export function playSound(name: SoundName): void {
  if (isMuted()) return;
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  const spec = SOUND_SPECS[name];
  const now = ctx.currentTime;

  spec.notes.forEach((note, index) => {
    scheduleTone(
      ctx,
      noteToFrequency(note),
      now + index * spec.duration * 0.8,
      spec.duration,
      spec.gain,
      spec.type,
    );
  });
}

/**
 * 결과 공개. 두구두구(빠른 저음 연타) 뒤에 밝은 화음으로 마무리한다.
 * 전체 길이는 1초 남짓 — 화면 전환을 기다리게 만들지 않는 선.
 */
export function playReveal(): void {
  if (isMuted()) return;
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  const now = ctx.currentTime;
  const rollNotes = 14;
  const rollStep = 0.045;

  for (let i = 0; i < rollNotes; i += 1) {
    // 뒤로 갈수록 살짝 높아지며 긴장감을 만든다.
    const drift = (i / rollNotes) * 3;
    scheduleTone(ctx, noteToFrequency(-24 + drift), now + i * rollStep, 0.05, 0.05, "square");
  }

  // 짠! — 메이저 코드 (루트, 장3도, 5도, 옥타브)
  const chordAt = now + rollNotes * rollStep + 0.06;
  for (const [index, note] of [4, 8, 11, 16].entries()) {
    scheduleTone(ctx, noteToFrequency(note), chordAt + index * 0.02, 0.9, 0.09, "triangle");
  }

  // 진동은 지원하는 기기에서만. 소리를 끈 상태면 여기까지 오지 않는다.
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate([25, 45, 25, 45, 120]);
  }
}
