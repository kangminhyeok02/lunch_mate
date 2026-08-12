"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MESSAGES } from "@/lib/messages";
import { readSession, writeSession } from "@/lib/session";
import { playSound } from "@/lib/sound";
import { EATING_SPEEDS, SPEED_LABEL, type EatingSpeed } from "@/lib/types";

export default function SpeedPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<EatingSpeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const session = readSession();
    if (!session?.userId) {
      router.replace("/name");
      return;
    }
    if (!session.menuChoice) {
      router.replace("/menu");
      return;
    }
    if (session.eatingSpeed) setSelected(session.eatingSpeed as EatingSpeed);
  }, [router]);

  async function handleSubmit() {
    if (!selected) {
      playSound("error");
      setError(MESSAGES.speedRequired);
      return;
    }

    const session = readSession();
    if (!session?.userId || !session.menuChoice) {
      router.replace("/name");
      return;
    }

    setSubmitting(true);
    setError(null);
    writeSession({ eatingSpeed: selected });

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.userId,
          menuChoice: session.menuChoice,
          eatingSpeed: selected,
        }),
      });

      // A duplicate is not a failure for the user — they are simply already in.
      if (response.ok || response.status === 409) {
        playSound("submit");
        router.push("/waiting");
        return;
      }

      playSound("error");
      const data = (await response.json()) as { error?: string };
      setError(
        data.error === "MENU_REQUIRED"
          ? MESSAGES.menuRequired
          : data.error === "NAME_REQUIRED"
            ? MESSAGES.nameRequired
            : MESSAGES.serverError,
      );
    } catch {
      setError(MESSAGES.serverError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="lm-shell">
      <header>
        <p className="lm-label">STEP 3 / 3</p>
        <h1 className="mt-2 text-2xl font-extrabold">⏱️ 나는 밥을 얼마나 빨리 먹나요?</h1>
        <p className="mt-1 text-slate-500">비슷한 속도의 메이트와 매칭해드려요.</p>
      </header>

      <div className="mt-6 flex-1 space-y-3">
        {EATING_SPEEDS.map((speed) => {
          const label = SPEED_LABEL[speed];
          const isSelected = selected === speed;
          return (
            <button
              key={speed}
              type="button"
              onClick={() => {
                playSound("tap");
                setSelected(speed);
                setError(null);
              }}
              className={`lm-choice flex items-center gap-4 ${isSelected ? "lm-choice-selected" : ""}`}
            >
              <span className="text-4xl">{label.emoji}</span>
              <span>
                <span className="block text-lg font-bold">{label.title}</span>
                <span className="mt-0.5 block text-sm text-slate-500">{label.detail}</span>
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mb-3 whitespace-pre-line text-center text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!selected || submitting}
        className="lm-button"
      >
        {submitting ? "제출 중..." : "제출하기 →"}
      </button>
    </main>
  );
}
