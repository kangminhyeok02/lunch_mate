"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MESSAGES } from "@/lib/messages";
import { readSession } from "@/lib/session";
import { useAssignmentWatch } from "@/lib/use-assignment-watch";

const CHECKLIST = [
  { emoji: "🍚", label: "메뉴 확인" },
  { emoji: "⏱️", label: "식사 속도 확인" },
  { emoji: "👥", label: "새로운 메이트 고려" },
];

export default function WaitingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    const session = readSession();
    if (!session?.userId) {
      router.replace("/name");
      return;
    }
    setUserId(session.userId);
  }, [router]);

  // Progressive checklist, purely cosmetic.
  useEffect(() => {
    if (revealed >= CHECKLIST.length) return;
    const timer = setTimeout(() => setRevealed((n) => n + 1), 700);
    return () => clearTimeout(timer);
  }, [revealed]);

  const state = useAssignmentWatch(userId);

  useEffect(() => {
    if (state?.mine?.grouped) router.replace("/result");
  }, [state, router]);

  return (
    <main className="lm-shell justify-center text-center">
      <div className="animate-pop-in text-6xl">🤖</div>

      <h1 className="mt-6 text-2xl font-extrabold leading-relaxed">
        LUNCH MATE가
        <br />
        최적의 점심조를 만들고 있어요!
      </h1>

      <ul className="mt-10 space-y-3 text-left">
        {CHECKLIST.map((item, index) => (
          <li
            key={item.label}
            className={`lm-card flex items-center justify-between transition-opacity duration-500 ${
              index < revealed ? "opacity-100" : "opacity-30"
            }`}
          >
            <span className="flex items-center gap-3 font-semibold">
              <span className="text-2xl">{item.emoji}</span>
              {item.label}
            </span>
            <span className={index < revealed ? "text-brand-600" : "text-slate-300"}>✓</span>
          </li>
        ))}
      </ul>

      <p className="mt-8 animate-pulse text-lg font-bold text-brand-700">
        ✨ 최적의 조합 계산 중...
      </p>

      {state?.mine?.submitted && (
        <p className="mt-8 whitespace-pre-line rounded-2xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-800">
          {MESSAGES.duplicateDetail}
        </p>
      )}

      {state && (
        <p className="mt-6 text-sm text-slate-500">
          현재 {state.submittedCount} / {state.totalCount}명 참여
        </p>
      )}

      <p className="mt-2 text-xs text-slate-400">
        관리자가 배정을 시작하면 결과가 자동으로 표시돼요.
      </p>
    </main>
  );
}
