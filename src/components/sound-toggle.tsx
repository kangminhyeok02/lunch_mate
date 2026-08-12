"use client";

import { useEffect, useState } from "react";
import { isMuted, playSound, setMuted, unlockAudio } from "@/lib/sound";

/** 소리 켜기/끄기. 선택은 브라우저에 저장되어 다음 화면에도 이어진다. */
export function SoundToggle({ className = "" }: { className?: string }) {
  const [muted, setLocalMuted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLocalMuted(isMuted());
    setReady(true);
  }, []);

  function toggle() {
    const next = !muted;
    setMuted(next);
    setLocalMuted(next);
    if (!next) {
      // 켜는 순간 들려줘야 잘 켜졌는지 알 수 있다.
      unlockAudio();
      playSound("select");
    }
  }

  // 서버와 첫 렌더가 어긋나지 않도록 값을 읽은 뒤에 그린다.
  if (!ready) return <span className={`h-9 w-9 ${className}`} aria-hidden />;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={muted ? "소리 켜기" : "소리 끄기"}
      aria-pressed={!muted}
      className={`flex h-9 w-9 items-center justify-center rounded-full border border-slate-200
                  bg-white text-lg shadow-sm transition active:scale-95 ${className}`}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
