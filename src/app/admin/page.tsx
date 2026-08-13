"use client";

import { useCallback, useEffect, useState } from "react";
import { MESSAGES } from "@/lib/messages";
import { SPEED_LABEL, type EatingSpeed, type MenuOption } from "@/lib/types";

interface Summary {
  date: string;
  storeKind: "file" | "supabase";
  supabaseConfigured: boolean;
  status: string;
  missionsUnlocked: boolean;
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

/** 업로드 실패 코드를 사람이 읽을 문장으로. 서버의 storage.ts 와 짝을 이룬다. */
const UPLOAD_ERRORS: Record<string, string> = {
  STORAGE_NOT_CONFIGURED: "이미지 저장소가 아직 준비되지 않았어요. supabase/storage.sql 을 실행해주세요.",
  FILE_REQUIRED: "사진을 선택해주세요.",
  FILE_TOO_LARGE: "사진 용량은 5MB까지 올릴 수 있어요.",
  UNSUPPORTED_TYPE: "JPG, PNG, WEBP, GIF 형식만 올릴 수 있어요.",
  UPLOAD_FAILED: "사진 업로드에 실패했어요. 잠시 후 다시 시도해주세요.",
  UNAUTHORIZED: "로그인이 만료되었어요. 새로고침 후 다시 로그인해주세요.",
};

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
  const [menuDraft, setMenuDraft] = useState<
    { name: string; description: string; emoji: string; imageUrl: string | null }[]
  >([]);
  /** 업로드 중인 메뉴 칸의 인덱스. 버튼을 잠그는 데 쓴다. */
  const [uploading, setUploading] = useState<number | null>(null);

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
    setMenuDraft((current) =>
      // 편집 중인 값을 주기적 새로고침이 덮어쓰지 않도록 최초 1회만 채운다.
      current.length > 0
        ? current
        : data.menus.map((m) => ({
            name: m.name,
            description: m.description,
            emoji: m.emoji,
            imageUrl: m.imageUrl,
          })),
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

  async function handleMissionUnlock(unlocked: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unlocked }),
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

  async function handleImageUpload(index: number, file: File) {
    setUploading(index);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("menuId", index === 0 ? "menu-a" : "menu-b");

      const response = await fetch("/api/admin/menu-image", { method: "POST", body: form });
      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !data.url) {
        setError(UPLOAD_ERRORS[data.error ?? ""] ?? MESSAGES.serverError);
        return;
      }

      // 화면에만 반영된 상태다. "메뉴 저장"을 눌러야 참가자에게 나간다.
      setMenuDraft((d) => d.map((m, i) => (i === index ? { ...m, imageUrl: data.url! } : m)));
    } catch {
      setError(MESSAGES.serverError);
    } finally {
      setUploading(null);
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
            <div key={index} className="rounded-2xl border border-slate-200 p-3">
              <p className="lm-label mb-2">MENU {index === 0 ? "A" : "B"}</p>

              <div className="grid grid-cols-[3rem_1fr] gap-2">
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
                    placeholder="메뉴 이름"
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

              <div className="mt-3 flex items-center gap-3">
                {menu.imageUrl ? (
                  // 저장된 사진. next/image 대신 img 를 쓰는 이유는 업로드 도메인이
                  // 런타임에 정해져서 빌드 시점에 허용 도메인을 못 박기 때문이다.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={menu.imageUrl}
                    alt={`${menu.name} 사진`}
                    className="h-20 w-20 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-100 text-3xl">
                    {menu.emoji}
                  </div>
                )}

                <div className="flex-1 space-y-1.5">
                  <label className="lm-button-ghost cursor-pointer py-2 text-sm">
                    {uploading === index ? "올리는 중..." : menu.imageUrl ? "사진 변경" : "사진 선택"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      disabled={uploading !== null}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        // 같은 파일을 다시 골라도 change 가 걸리도록 값을 비운다.
                        e.target.value = "";
                        if (file) void handleImageUpload(index, file);
                      }}
                    />
                  </label>

                  {menu.imageUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setMenuDraft((d) => d.map((m, i) => (i === index ? { ...m, imageUrl: null } : m)))
                      }
                      className="w-full rounded-xl px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                    >
                      사진 지우기 (이모지로 표시)
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={handleSaveMenus}
          disabled={busy || uploading !== null}
          className="lm-button-ghost mt-3"
        >
          메뉴 저장
        </button>
        <p className="mt-2 text-center text-xs text-slate-400">
          사진을 올린 뒤 <strong>메뉴 저장</strong>을 눌러야 참가자 화면에 반영됩니다.
        </p>
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
        <section className="mt-4 lm-card">
          <p className="lm-label">🎯 오늘의 미션 공개</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {summary.missionsUnlocked
              ? "모든 조에 미션이 열려 있습니다. 답변을 다 쓰지 않은 조도 볼 수 있어요."
              : "기본값은 조원 전원이 답변을 올린 조부터 자동으로 열립니다. 한 명이 자리를 비워 조가 멈췄다면 아래로 강제로 열 수 있어요."}
          </p>
          <button
            type="button"
            onClick={() => handleMissionUnlock(!summary.missionsUnlocked)}
            disabled={busy}
            className={summary.missionsUnlocked ? "lm-button-ghost mt-3" : "lm-button mt-3"}
          >
            {busy
              ? "처리 중..."
              : summary.missionsUnlocked
                ? "자동 조건으로 되돌리기"
                : "모든 조에 미션 강제 공개"}
          </button>
        </section>
      )}

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
