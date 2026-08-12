import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="lm-shell justify-between">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="animate-pop-in text-7xl">🍚</div>

        <h1 className="mt-6 animate-fade-up text-4xl font-extrabold tracking-tight text-brand-700">
          LUNCH MATE
        </h1>

        <p className="mt-6 animate-fade-up text-xl font-bold leading-relaxed text-slate-800">
          오늘의 점심을 함께할
          <br />
          메이트를 찾아보세요!
        </p>

        <p className="mt-4 animate-fade-up text-base leading-relaxed text-slate-500">
          36명의 신입사원이
          <br />
          더 편하게 친해지는 방법
        </p>

        <p className="mt-10 animate-fade-up rounded-full bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700">
          오늘 메뉴부터 식사 속도까지
        </p>
      </div>

      <Link href="/name" className="lm-button animate-fade-up">
        시작하기 →
      </Link>
    </main>
  );
}
