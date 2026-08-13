"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SoundToggle } from "@/components/sound-toggle";
import { MESSAGES } from "@/lib/messages";
import { readSession } from "@/lib/session";
import { playSound } from "@/lib/sound";
import { ANSWER_MAX_LENGTH, REACTION_EMOJI, type ReactionKind } from "@/lib/types";

interface ReactionTally {
  kind: ReactionKind;
  count: number;
  mine: boolean;
}

interface SharedAnswer {
  id: string;
  userId: string;
  name: string;
  content: string;
  updatedAt: string;
  isMine: boolean;
  reactions: ReactionTally[];
}

interface Board {
  ready: boolean;
  question?: string | null;
  groupNumber?: number;
  answeredCount?: number;
  memberCount?: number;
  myAnswer?: string | null;
  revealed?: boolean;
  answers?: SharedAnswer[];
  missionUnlocked?: boolean;
  pendingNames?: string[];
}

/** Answers land while people are eating, so keep the board fresh. */
const POLL_INTERVAL_MS = 5000;

export default function QuestionPage() {
  const router = useRouter();
  const [board, setBoard] = useState<Board | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) return;
    try {
      const response = await fetch(`/api/answers?userId=${encodeURIComponent(userId)}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = (await response.json()) as Board;
      if (alive.current) setBoard(data);
    } catch {
      // Transient network failure — the next tick retries.
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    const session = readSession();
    if (!session?.userId) {
      router.replace("/name");
      return;
    }
    userIdRef.current = session.userId;

    void (async () => {
      try {
        const response = await fetch(
          `/api/answers?userId=${encodeURIComponent(session.userId)}`,
          { cache: "no-store" },
        );
        const boardData = (await response.json()) as Board;

        // Before assignment the result screen owns the waiting copy.
        if (!boardData.ready) {
          router.replace("/result");
          return;
        }
        if (!alive.current) return;
        setBoard(boardData);
      } catch {
        if (alive.current) setError(MESSAGES.serverError);
      }
    })();

    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [router, refresh]);

  async function handleSubmit() {
    const userId = userIdRef.current;
    const content = draft.trim();
    if (!userId || busy) return;

    if (!content) {
      playSound("error");
      setNotice(MESSAGES.answerRequired);
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, content }),
      });
      const data = (await response.json()) as Board & { error?: string };

      if (!response.ok) {
        playSound("error");
        setNotice(
          data.error === "ANSWER_TOO_LONG"
            ? `${ANSWER_MAX_LENGTH}자까지 쓸 수 있어요.`
            : MESSAGES.serverError,
        );
        return;
      }

      playSound("submit");
      setBoard(data);
      setEditing(false);
      setDraft("");
    } catch {
      playSound("error");
      setNotice(MESSAGES.serverError);
    } finally {
      setBusy(false);
    }
  }

  async function handleReaction(answerId: string, kind: ReactionKind) {
    const userId = userIdRef.current;
    if (!userId) return;

    playSound("tap");
    setReactionError(null);
    try {
      const response = await fetch("/api/answers/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, answerId, kind }),
      });

      if (!response.ok) {
        // Saying nothing here reads as "the tap did not register", which sends
        // people tapping again. Tell them it failed.
        playSound("error");
        if (alive.current) setReactionError("반응을 저장하지 못했어요. 잠시 후 다시 눌러주세요.");
        return;
      }

      const data = (await response.json()) as Board;
      if (alive.current) setBoard(data);
    } catch {
      playSound("error");
      if (alive.current) setReactionError("연결이 불안정해요. 잠시 후 다시 눌러주세요.");
    }
  }

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
        <div className="animate-pulse text-5xl">💬</div>
      </main>
    );
  }

  const answers = board.answers ?? [];
  const answeredCount = board.answeredCount ?? 0;
  const memberCount = board.memberCount ?? 0;
  const showComposer = !board.revealed || editing;
  // The mission is the last step, on its own screen. The server decides when it
  // opens: the whole table has answered, or an admin forced it.
  const missionUnlocked = Boolean(board.revealed && board.missionUnlocked);
  const remaining = Math.max(memberCount - answeredCount, 0);
  const pendingNames = board.pendingNames ?? [];

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

      <div className="flex flex-1 flex-col">
        <p className="mt-2 animate-fade-up text-center text-sm font-bold tracking-widest text-brand-600">
          TABLE {String(board.groupNumber).padStart(2, "0")}
        </p>

        {board.question && (
          <section className="mt-4 animate-fade-up rounded-3xl border border-brand-100 bg-white p-6 shadow-sm">
            <p className="lm-label">💬 오늘의 질문</p>
            <p className="mt-3 text-2xl font-extrabold leading-snug text-slate-900">
              {board.question}
            </p>
          </section>
        )}

        {showComposer && (
          <section className="mt-4 animate-fade-up rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <label htmlFor="answer" className="lm-label">
              ✏️ 내 답변
            </label>
            <textarea
              id="answer"
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, ANSWER_MAX_LENGTH))}
              rows={4}
              placeholder="편하게 적어주세요. 조원들에게 공유돼요."
              className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4
                         text-base leading-relaxed text-slate-900 outline-none
                         focus:border-brand-300 focus:bg-white"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
              <span>{notice && <span className="text-rose-500">{notice}</span>}</span>
              <span>
                {draft.length}/{ANSWER_MAX_LENGTH}
              </span>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy}
              className="lm-button mt-3"
            >
              {busy ? "올리는 중…" : board.revealed ? "수정하기" : "올리기"}
            </button>

            {editing && (
              <button
                type="button"
                onClick={() => {
                  playSound("tap");
                  setEditing(false);
                  setDraft("");
                  setNotice(null);
                }}
                className="lm-button-ghost mt-2"
              >
                취소
              </button>
            )}
          </section>
        )}

        {!board.revealed && (
          <p className="mt-4 animate-fade-up text-center text-sm leading-relaxed text-slate-500">
            🔒 조원 {answeredCount}명이 이미 답했어요.
            <br />
            내 답변을 올리면 함께 볼 수 있어요.
          </p>
        )}

        {board.revealed && pendingNames.length > 0 && (
          <p className="mt-3 text-center text-sm text-slate-400">
            아직 안 쓴 사람: {pendingNames.join(", ")}
          </p>
        )}

        {board.revealed && (
          <section className="mt-5">
            <div className="flex items-baseline justify-between">
              <p className="lm-label">🗣️ 우리 조의 답변</p>
              <p className="text-xs text-slate-400">
                {answeredCount}/{memberCount}명
              </p>
            </div>

            <ul className="mt-3 space-y-3">
              {answers.map((answer, index) => (
                <li
                  key={answer.userId}
                  className={`animate-fade-up rounded-2xl border p-4 shadow-sm ${
                    answer.isMine
                      ? "border-brand-200 bg-brand-50"
                      : "border-slate-200 bg-white"
                  }`}
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <p className="text-sm font-bold text-slate-900">
                    {answer.name}
                    {answer.isMine && (
                      <span className="ml-2 text-xs font-medium text-brand-600">나</span>
                    )}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-slate-700">
                    {answer.content}
                  </p>

                  <div className="mt-3 flex gap-2">
                    {(answer.reactions ?? []).map((reaction) => (
                      <button
                        key={reaction.kind}
                        type="button"
                        onClick={() => handleReaction(answer.id, reaction.kind)}
                        aria-pressed={reaction.mine}
                        className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm
                                    transition active:scale-95 ${
                                      reaction.mine
                                        ? "border-brand-300 bg-brand-100 font-bold text-brand-800"
                                        : "border-slate-200 bg-white text-slate-500"
                                    }`}
                      >
                        <span>{REACTION_EMOJI[reaction.kind]}</span>
                        {reaction.count > 0 && <span>{reaction.count}</span>}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>

            {reactionError && (
              <p className="mt-3 text-center text-sm text-rose-500">{reactionError}</p>
            )}

            {!editing && (
              <button
                type="button"
                onClick={() => {
                  playSound("tap");
                  setDraft(board.myAnswer ?? "");
                  setEditing(true);
                }}
                className="lm-button-ghost mt-4"
              >
                내 답변 수정하기
              </button>
            )}
          </section>
        )}

        {board.revealed && !missionUnlocked && (
          <p className="mt-6 animate-fade-up text-center text-sm leading-relaxed text-slate-500">
            ⏳ {remaining}명이 더 쓰면
            <br />
            오늘의 미션이 열려요.
          </p>
        )}

        {missionUnlocked && (
          <button
            type="button"
            onClick={() => {
              playSound("select");
              router.push("/mission");
            }}
            className="lm-button mt-6 animate-pop-in"
          >
            🎯 오늘의 미션 보기
          </button>
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
