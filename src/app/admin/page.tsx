"use client";

import { useCallback, useEffect, useState } from "react";
import { MESSAGES } from "@/lib/messages";
import { SPEED_LABEL, type EatingSpeed, type MenuOption } from "@/lib/types";

interface Summary {
  date: string;
  storeKind: "file" | "supabase";
  supabaseConfigured: boolean;
  status: string;
  menus: MenuOption[];
  submittedCount: number;
  totalCount: number;
  pending: string[];
  menuCounts: { id: string; name: string; emoji: string; count: number }[];
  speedCounts: { speed: EatingSpeed; count: number }[];
  groups: {
    groupNumber: number;
    members: string[];
    question: string | null;
    mission: string | null;
  }[];
}

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "시작 전",
  COLLECTING: "수집 중",
  READY_TO_ASSIGN: "배정 준비 완료",
  ASSIGNING: "배정 중",
  ASSIGNED: "배정 완료",
};

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuDraft, setMenuDraft] = useState<{ name: string; description: string; emoji: string }[]>([]);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/summary", { cache: "no-store" });
    if (response.status === 401) {
      setAuthed(false);
      return;
    }
    if (!response.ok) {
      setError(MESSAGES.serverError);
      return;
    }
    const data = (await response.json()) as Summary;
    setSummary(data);
    setAuthed(true);
    setMenuDraft(
      data.menus.map((m) => ({ name: m.name, description: m.description, emoji: m.emoji })),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the dashboard live during the event.
  useEffect(() => {
    if (!authed) return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [authed, load]);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      setError(response.status === 503 ? "ADMIN_PASSWORD가 설정되지 않았습니다." : "비밀번호가 올바르지 않습니다.");
      return;
    }
    setPassword("");
    await load();
  }

  async function handleAssign(regenerate: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? MESSAGES.serverError);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveMenus() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/menus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menus: menuDraft.map((m, i) => ({ ...m, id: i === 0 ? "menu-a" : "menu-b" })),
        }),
      });
      if (!response.ok) {
        setError("메뉴 저장에 실패했어요. 두 메뉴 모두 이름이 필요합니다.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!authed) {
    return (
      <main className="lm-shell justify-center">
        <h1 className="text-center text-2xl font-extrabold">LUNCH MATE ADMIN</h1>
        <form onSubmit={handleLogin} className="mt-8 space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="관리자 비밀번호"
            aria-label="관리자 비밀번호"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 outline-none
                       focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <button type="submit" className="lm-button">
            로그인
          </button>
        </form>
        {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
      </main>
    );
  }

  if (!summary) {
    return (
      <main className="lm-shell justify-center text-center text-slate-400">불러오는 중...</main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold">LUNCH MATE ADMIN</h1>
        <span className="text-xs text-slate-400">{summary.date}</span>
      </header>

      <p className="mt-1 text-xs text-slate-400">
        저장소: {summary.storeKind === "supabase" ? "Supabase" : "로컬 파일"}
        {summary.storeKind === "file" && " · 배포 환경에서는 Supabase 설정이 필요합니다"}
      </p>

      <section className="mt-6 grid grid-cols-2 gap-3">
        <div className="lm-card">
          <p className="lm-label">참여 인원</p>
          <p className="mt-1 text-3xl font-black">
            {summary.submittedCount}
            <span className="text-lg text-slate-400"> / {summary.totalCount}</span>
          </p>
        </div>
        <div className="lm-card">
          <p className="lm-label">배정 상태</p>
          <p className="mt-1 text-xl font-bold">{STATUS_LABEL[summary.status] ?? summary.status}</p>
        </div>
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3">
        <div className="lm-card">
          <p className="lm-label">메뉴 선호</p>
          <ul className="mt-2 space-y-1 text-sm">
            {summary.menuCounts.map((m) => (
              <li key={m.id} className="flex justify-between">
                <span>
                  {m.emoji} {m.name}
                </span>
                <span className="font-bold">{m.count}명</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="lm-card">
          <p className="lm-label">식사 속도</p>
          <ul className="mt-2 space-y-1 text-sm">
            {summary.speedCounts.map((s) => (
              <li key={s.speed} className="flex justify-between">
                <span>
                  {SPEED_LABEL[s.speed].emoji} {SPEED_LABEL[s.speed].title}
                </span>
                <span className="font-bold">{s.count}명</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-3 lm-card">
        <p className="lm-label">오늘의 메뉴 설정</p>
        <div className="mt-3 space-y-3">
          {menuDraft.map((menu, index) => (
            <div key={index} className="grid grid-cols-[3rem_1fr] gap-2">
              <input
                value={menu.emoji}
                onChange={(e) =>
                  setMenuDraft((d) => d.map((m, i) => (i === index ? { ...m, emoji: e.target.value } : m)))
                }
                aria-label={`메뉴 ${index + 1} 이모지`}
                className="rounded-xl border border-slate-200 px-2 py-2 text-center"
              />
              <div className="space-y-2">
                <input
                  value={menu.name}
                  onChange={(e) =>
                    setMenuDraft((d) => d.map((m, i) => (i === index ? { ...m, name: e.target.value } : m)))
                  }
                  placeholder={`MENU ${index === 0 ? "A" : "B"} 이름`}
                  aria-label={`메뉴 ${index + 1} 이름`}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
                <input
                  value={menu.description}
                  onChange={(e) =>
                    setMenuDraft((d) =>
                      d.map((m, i) => (i === index ? { ...m, description: e.target.value } : m)),
                    )
                  }
                  placeholder="설명"
                  aria-label={`메뉴 ${index + 1} 설명`}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={handleSaveMenus} disabled={busy} className="lm-button-ghost mt-3">
          메뉴 저장
        </button>
      </section>

      {summary.pending.length > 0 && (
        <section className="mt-3 lm-card">
          <p className="lm-label">미제출 ({summary.pending.length}명)</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{summary.pending.join(", ")}</p>
        </section>
      )}

      {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}

      <div className="mt-4 space-y-2">
        <button type="button" onClick={() => handleAssign(false)} disabled={busy} className="lm-button">
          {busy ? "처리 중..." : "점심조 배정 시작"}
        </button>
        {summary.groups.length > 0 && (
          <button type="button" onClick={() => handleAssign(true)} disabled={busy} className="lm-button-ghost">
            배정 결과 재생성
          </button>
        )}
      </div>

      {summary.groups.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold">배정 결과</h2>
          <div className="mt-3 space-y-3">
            {summary.groups.map((group) => (
              <div key={group.groupNumber} className="lm-card">
                <p className="font-black text-brand-600">
                  TABLE {String(group.groupNumber).padStart(2, "0")}
                </p>
                <p className="mt-1 font-semibold">{group.members.join(" · ")}</p>
                {group.question && (
                  <p className="mt-2 text-sm text-slate-600">💬 {group.question}</p>
                )}
                {group.mission && <p className="mt-1 text-sm text-slate-600">🎯 {group.mission}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
