"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SoundToggle } from "@/components/sound-toggle";
import { MESSAGES } from "@/lib/messages";
import { readSession } from "@/lib/session";
import { playReveal, playSound } from "@/lib/sound";

interface Board {
  ready: boolean;
  groupNumber?: number;
  missionUnlocked?: boolean;
  missionForced?: boolean;
}

interface ResultPayload {
  ready: boolean;
  mission?: string | null;
}

export default function MissionPage() {
  const router = useRouter();
  const [mission, setMission] = useState<string | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const session = readSession();
    if (!session?.userId) {
      router.replace("/name");
      return;
    }

    void (async () => {
      try {
        const [boardRes, resultRes] = await Promise.all([
          fetch(`/api/answers?userId=${encodeURIComponent(session.userId)}`, {
            cache: "no-store",
          }),
          fetch(`/api/result?userId=${encodeURIComponent(session.userId)}`, {
            cache: "no-store",
          }),
        ]);
        const boardData = (await boardRes.json()) as Board;
        const resultData = (await resultRes.json()) as ResultPayload;
        if (!alive) return;

        // Reaching here without the mission open means the link was guessed or
        // the table changed — send them back to where the gate lives.
        if (!boardData.ready || !boardData.missionUnlocked) {
          router.replace("/question");
          return;
        }

        setBoard(boardData);
        setMission(resultData.mission ?? null);
        playReveal();
      } catch {
        if (alive) setError(MESSAGES.serverError);
      }
    })();

    return () => {
      alive = false;
    };
  }, [router]);

  if (error) {
    return (
      <main className="lm-shell items-center justify-center text-center">
        <p className="whitespace-pre-line text-slate-600">{error}</p>
      </main>
    );
  }

  if (!board) {
    return (
      <main className="lm-shell items-center justify-center text-center">
        <div className="animate-pulse text-5xl">🎯</div>
      </main>
    );
  }

  return (
    <main className="lm-shell">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            playSound("tap");
            router.push("/question");
          }}
          className="flex h-9 items-center rounded-full border border-slate-200 bg-white px-3
                     text-sm font-medium text-slate-600 shadow-sm active:scale-95"
        >
          ← 오늘의 질문
        </button>
        <SoundToggle />
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <p className="animate-fade-up text-center text-sm font-bold tracking-widest text-brand-600">
          TABLE {String(board.groupNumber).padStart(2, "0")}
        </p>

        <section className="mt-6 animate-pop-in rounded-3xl bg-slate-900 p-7 text-white shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">
            🎯 TODAY&apos;S MISSION
          </p>
          <p className="mt-4 text-3xl font-extrabold leading-snug">
            {mission ?? "오늘은 미션이 없어요."}
          </p>
          <p className="mt-5 text-sm leading-relaxed text-slate-400">
            식사가 끝나기 전에 함께 해결해보세요.
          </p>
        </section>

        {board.missionForced && (
          <p className="mt-4 text-center text-xs text-slate-400">
            아직 답변하지 않은 분이 있지만 관리자가 미션을 열었어요.
          </p>
        )}

        <p className="mt-8 text-center text-sm text-slate-400">맛있게 드세요! 🍚</p>
      </div>

      <button
        type="button"
        onClick={() => {
          playSound("tap");
          router.push("/result");
        }}
        className="lm-button-ghost"
      >
        내 점심조 다시 보기
      </button>
    </main>
  );
}
