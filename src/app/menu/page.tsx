"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MESSAGES } from "@/lib/messages";
import { readSession, writeSession } from "@/lib/session";
import { playSound } from "@/lib/sound";
import type { MenuOption } from "@/lib/types";

export default function MenuPage() {
  const router = useRouter();
  const [menus, setMenus] = useState<MenuOption[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = readSession();
    if (!session?.userId) {
      router.replace("/name");
      return;
    }
    if (session.menuChoice) setSelected(session.menuChoice);

    fetch("/api/status")
      .then((res) => res.json())
      .then((data) => setMenus(data.menus ?? []))
      .catch(() => setError(MESSAGES.serverError))
      .finally(() => setLoading(false));
  }, [router]);

  function handleNext() {
    if (!selected) {
      playSound("error");
      setError(MESSAGES.menuRequired);
      return;
    }
    playSound("select");
    writeSession({ menuChoice: selected });
    router.push("/speed");
  }

  return (
    <main className="lm-shell">
      <header>
        <p className="lm-label">STEP 2 / 3</p>
        <h1 className="mt-2 text-2xl font-extrabold">오늘의 메뉴 🍱</h1>
        <p className="mt-1 text-slate-500">먹고 싶은 메뉴를 골라주세요.</p>
      </header>

      <div className="mt-6 flex-1 space-y-3">
        {loading ? (
          <p className="py-10 text-center text-slate-400">불러오는 중...</p>
        ) : (
          menus.map((menu, index) => {
            const isSelected = selected === menu.id;
            return (
              <button
                key={menu.id}
                type="button"
                onClick={() => {
                  playSound("tap");
                  setSelected(menu.id);
                  setError(null);
                }}
                className={`lm-choice ${isSelected ? "lm-choice-selected" : ""}`}
              >
                <span className="lm-label">MENU {index === 0 ? "A" : "B"}</span>

                {menu.imageUrl && (
                  // 업로드 도메인이 런타임에 정해져 next/image 의 허용 도메인 설정과 맞지 않는다.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={menu.imageUrl}
                    alt={menu.name}
                    className="mt-2 aspect-[4/3] w-full rounded-xl object-cover"
                  />
                )}

                <div className="mt-2 flex items-center gap-3">
                  {!menu.imageUrl && <span className="text-4xl">{menu.emoji}</span>}
                  <div>
                    <p className="text-xl font-bold">
                      {menu.imageUrl && <span className="mr-1.5">{menu.emoji}</span>}
                      {menu.name}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500">{menu.description}</p>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {error && (
        <p role="alert" className="mb-3 text-center text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <button type="button" onClick={handleNext} disabled={!selected} className="lm-button">
        다음 →
      </button>
    </main>
  );
}
