"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MESSAGES } from "@/lib/messages";
import { readSession, writeSession } from "@/lib/session";
import { playSound } from "@/lib/sound";

interface RosterUser {
  id: string;
  name: string;
  submitted: boolean;
}

export default function NamePage() {
  const router = useRouter();
  const [users, setUsers] = useState<RosterUser[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const existing = readSession();
    if (existing?.userId) setSelected(existing.userId);

    fetch("/api/roster")
      .then((res) => res.json())
      .then((data) => setUsers(data.users ?? []))
      .catch(() => setError(MESSAGES.serverError))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim();
    if (!needle) return users;
    return users.filter((u) => u.name.includes(needle));
  }, [users, query]);

  const selectedUser = users.find((u) => u.id === selected) ?? null;

  function handleNext() {
    if (!selectedUser) {
      playSound("error");
      setError(MESSAGES.nameRequired);
      return;
    }
    playSound("select");
    writeSession({ userId: selectedUser.id, name: selectedUser.name });
    router.push(selectedUser.submitted ? "/waiting" : "/menu");
  }

  return (
    <main className="lm-shell">
      <header>
        <p className="lm-label">STEP 1 / 3</p>
        <h1 className="mt-2 text-2xl font-extrabold">반가워요! 👋</h1>
        <p className="mt-1 text-slate-500">이름을 선택해주세요.</p>
      </header>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="이름 검색"
        aria-label="이름 검색"
        className="mt-5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5
                   text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />

      <div className="mt-4 flex-1 overflow-y-auto">
        {loading ? (
          <p className="py-10 text-center text-slate-400">불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-slate-400">검색 결과가 없어요.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 pb-4">
            {filtered.map((user) => {
              const isSelected = selected === user.id;
              return (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => {
                      playSound("tap");
                      setSelected(user.id);
                      setError(null);
                    }}
                    className={`lm-choice px-3 py-3.5 text-center ${
                      isSelected ? "lm-choice-selected" : ""
                    }`}
                  >
                    <span className="text-base font-semibold">{user.name}</span>
                    {user.submitted && (
                      <span className="mt-0.5 block text-xs text-slate-400">제출 완료</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-3 whitespace-pre-line text-center text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      {selectedUser?.submitted && (
        <p className="mb-3 text-center text-sm font-medium text-brand-700">
          {MESSAGES.alreadySubmitted}
        </p>
      )}

      <button type="button" onClick={handleNext} disabled={!selected} className="lm-button">
        {selectedUser?.submitted ? "내 점심조 확인하기 →" : "다음 →"}
      </button>
    </main>
  );
}
