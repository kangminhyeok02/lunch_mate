"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SoundToggle } from "@/components/sound-toggle";
import { MESSAGES } from "@/lib/messages";
import { readSession } from "@/lib/session";
import { playSound } from "@/lib/sound";

interface ResultPayload {
  ready: boolean;
  groupNumber?: number;
  question?: string | null;
  mission?: string | null;
}

export default function QuestionPage() {
  const router = useRouter();
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = readSession();
    if (!session?.userId) {
      router.replace("/name");
      return;
    }

    fetch(`/api/result?userId=${encodeURIComponent(session.userId)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: ResultPayload) => {
        // 아직 배정 전이라면 결과 화면이 대기 안내를 담당한다.
        if (!data.ready) {
          router.replace("/result");
          return;
        }
        setResult(data);
      })
      .catch(() => setError(MESSAGES.serverError));
  }, [router]);

  if (error) {
    return (
      <main className="lm-shell items-center justify-center text-center">
        <p className="whitespace-pre-line text-slate-600">{error}</p>
      </main>
    );
  }

  if (!result) {
    return (
      <main className="lm-shell items-center justify-center text-center">
        <div className="animate-pulse text-5xl">💬</div>
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
            router.push("/result");
          }}
          className="flex h-9 items-center rounded-full border border-slate-200 bg-white px-3
                     text-sm font-medium text-slate-600 shadow-sm active:scale-95"
        >
          ← 내 점심조
        </button>
        <SoundToggle />
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <p className="animate-fade-up text-center text-sm font-bold tracking-widest text-brand-600">
          TABLE {String(result.groupNumber).padStart(2, "0")}
        </p>

        {result.question && (
          <section className="mt-6 animate-fade-up rounded-3xl border border-brand-100 bg-white p-6 shadow-sm">
            <p className="lm-label">💬 오늘의 질문</p>
            <p className="mt-3 text-2xl font-extrabold leading-snug text-slate-900">
              {result.question}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              돌아가면서 한 명씩 이야기해보세요.
            </p>
          </section>
        )}

        {result.mission && (
          <section
            className="mt-4 animate-pop-in rounded-3xl bg-slate-900 p-6 text-white shadow-lg"
            style={{ animationDelay: "0.15s" }}
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-300">
              🎯 TODAY&apos;S MISSION
            </p>
            <p className="mt-3 text-2xl font-extrabold leading-snug">{result.mission}</p>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              식사가 끝나기 전에 함께 해결해보세요.
            </p>
          </section>
        )}

        <p className="mt-8 text-center text-sm text-slate-400">
          맛있게 드세요! 🍚
        </p>
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
