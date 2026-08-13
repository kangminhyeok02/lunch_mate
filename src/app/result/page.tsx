"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SoundToggle } from "@/components/sound-toggle";
import { MESSAGES } from "@/lib/messages";
import { readSession } from "@/lib/session";
import { playReveal, playSound } from "@/lib/sound";
import { useAssignmentWatch } from "@/lib/use-assignment-watch";
import { SPEED_LABEL, type EatingSpeed } from "@/lib/types";

interface ResultMember {
  name: string;
  menuEmoji: string | null;
  menuName: string | null;
  eatingSpeed: EatingSpeed | null;
}

interface ResultPayload {
  ready: boolean;
  groupNumber?: number;
  members?: ResultMember[];
  menuName?: string | null;
  question?: string | null;
  mission?: string | null;
  matchingPoints?: string[];
}

export default function ResultPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 결과가 처음 뜰 때만 울린다. 새로고침이나 재조회로 다시 울리지 않도록. */
  const revealed = useRef(false);

  useEffect(() => {
    const session = readSession();
    if (!session?.userId) {
      router.replace("/name");
      return;
    }
    setUserId(session.userId);
  }, [router]);

  const watch = useAssignmentWatch(userId);

  // Re-fetch whenever the watcher says our group now exists.
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/result?userId=${encodeURIComponent(userId)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: ResultPayload) => setResult(data))
      .catch(() => setError(MESSAGES.serverError));
  }, [userId, watch?.assigned]);

  useEffect(() => {
    if (!result?.ready || revealed.current) return;
    revealed.current = true;
    playReveal();
  }, [result?.ready]);

  if (error) {
    return (
      <main className="lm-shell items-center justify-center text-center">
        <p className="whitespace-pre-line text-slate-600">{error}</p>
      </main>
    );
  }

  if (!result?.ready) {
    return (
      <main className="lm-shell items-center justify-center text-center">
        <div className="animate-pulse text-6xl">🍚</div>
        <p className="mt-6 whitespace-pre-line text-lg font-semibold leading-relaxed text-slate-700">
          {MESSAGES.waitingForAssignment}
        </p>
        <Link href="/waiting" className="lm-button-ghost mt-8 w-auto px-6">
          대기 화면으로
        </Link>
      </main>
    );
  }

  return (
    <main className="lm-shell">
      <div className="flex justify-end">
        <SoundToggle />
      </div>

      <div className="flex-1">
        <div className="text-center">
          <div className="animate-pop-in text-5xl">🎉</div>
          <h1 className="mt-4 text-2xl font-extrabold">점심 메이트가 정해졌어요!</h1>
          <p className="mt-6 animate-fade-up text-5xl font-black tracking-tight text-brand-600">
            TABLE {String(result.groupNumber).padStart(2, "0")}
          </p>
        </div>

        <ul className="mt-8 space-y-2">
          {result.members?.map((member) => (
            <li
              key={member.name}
              className="lm-card flex items-center justify-between gap-3 animate-fade-up"
            >
              <span className="flex items-center gap-3">
                <span className="text-2xl">👤</span>
                <span className="text-lg font-semibold">{member.name}</span>
              </span>
              <span className="flex items-center gap-2 text-xl">
                {member.menuEmoji && <span title={member.menuName ?? ""}>{member.menuEmoji}</span>}
                {member.eatingSpeed && (
                  <span title={SPEED_LABEL[member.eatingSpeed].title}>
                    {SPEED_LABEL[member.eatingSpeed].emoji}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-2 text-center text-xs text-slate-400">
          이름 옆은 각자 고른 메뉴와 식사 속도예요.
        </p>

        <div className="mt-6 lm-card space-y-4">
          <div>
            <p className="lm-label">🍱 오늘의 메뉴</p>
            <p className="mt-1 text-lg font-bold">
              {result.menuName ?? "조원별로 메뉴가 달라요"}
            </p>
          </div>
          <div className="border-t border-slate-100 pt-4">
            <p className="lm-label">⏱️ 식사 속도</p>
            <p className="mt-1 text-lg font-bold">비슷한 속도의 메이트와 매칭</p>
          </div>
        </div>

        {result.matchingPoints && result.matchingPoints.length > 0 && (
          <div className="mt-6 rounded-2xl border border-brand-100 bg-brand-50 p-4">
            <p className="lm-label">💡 MATCHING POINT</p>
            <ul className="mt-3 space-y-2">
              {result.matchingPoints.map((point) => (
                <li key={point} className="flex items-start gap-2 text-sm font-medium text-brand-900">
                  <span className="text-brand-600">✓</span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>

      <button
        type="button"
        onClick={() => {
          playSound("select");
          router.push("/question");
        }}
        className="lm-button mt-6"
      >
        오늘의 질문 보기 →
      </button>
    </main>
  );
}
