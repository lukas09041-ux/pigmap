"use client";

import { createClient } from "@/lib/supabase/client";

export default function LoginSheet({
  open,
  onClose,
  redirectPath = "/",
}: {
  open: boolean;
  onClose: () => void;
  redirectPath?: string;
}) {
  if (!open) return null;

  async function handleKakaoLogin() {
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      redirectPath,
    )}`;
    await supabase.auth.signInWithOAuth({
      provider: "kakao",
      // 이메일 등 사용하지 않는 동의 항목은 요청하지 않는다 (카카오 콘솔 동의항목에
      // 등록 안 한 스코프를 요청하면 KOE205 에러 발생).
      options: { redirectTo, scopes: "profile_nickname profile_image" },
    });
  }

  async function handleAnonymous() {
    const supabase = createClient();
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      alert("로그인에 실패했어요. 다시 시도해주세요.");
      return;
    }
    // 로그인 성공은 AuthProvider의 onAuthStateChange가 감지해서
    // 대기 중인 requireAuth() Promise를 resolve하고 시트를 닫아준다.
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="rounded-t-2xl bg-white px-6 pb-8 pt-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-5xl">🐷</span>
        <p className="mt-3 text-lg font-bold text-gray-900">3초면 꿀꿀 시작!</p>
        <p className="mt-1 text-sm text-gray-500">로그인하고 착한가격업소를 인증해보세요</p>

        {/* Kakao 브랜드 가이드: 배경 #FEE500, 텍스트/아이콘은 짙은 색.
            공식 카카오 로고 에셋 대신 말풍선 이모지로 근사치 표현 — 실제 배포 전
            Kakao Developers > 디자인 가이드의 공식 버튼 에셋으로 교체 권장. */}
        <button
          type="button"
          onClick={handleKakaoLogin}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] py-3.5 text-sm font-bold text-[#191919]"
        >
          <span aria-hidden>💬</span>
          카카오로 시작하기
        </button>

        <button
          type="button"
          onClick={handleAnonymous}
          className="mt-4 text-sm font-medium text-gray-400 underline"
        >
          로그인 없이 둘러보기
        </button>
      </div>
    </div>
  );
}
