"use client";

// 전역 에러 바운더리 — 어떤 페이지에서 예외가 나도 흰 화면 대신 재시도 UI를 보여준다.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-3 bg-white px-6 text-center">
      <span className="text-4xl">🐽</span>
      <p className="text-base font-bold text-gray-800">꿀꿀... 문제가 생겼어요</p>
      <p className="text-sm text-gray-500">잠시 후 다시 시도해주세요</p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-full bg-orange-500 px-6 py-2.5 text-sm font-bold text-white"
      >
        다시 시도
      </button>
    </main>
  );
}
