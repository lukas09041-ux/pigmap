"use client";

import { PIG_ITEMS, PIG_LEVELS, type PigItemId } from "@/lib/pig-avatar";
import UserPigAvatar, { PigItemIcon } from "./UserPigAvatar";

const CONFETTI_COLORS = ["#FF6B8A", "#FFC93C", "#5B8DEF", "#7ED957", "#FF9F45"];

// 인증으로 레벨업했을 때 풀스크린 축하 연출.
// 이전 단계 돼지 → 새 단계 돼지 크로스페이드 + CSS 콘페티 (framer-motion 미사용).
export default function LevelUpModal({
  fromLevel,
  toLevel,
  onClose,
}: {
  fromLevel: number;
  toLevel: number;
  onClose: () => void;
}) {
  const levelMeta = PIG_LEVELS[toLevel] ?? PIG_LEVELS[PIG_LEVELS.length - 1];
  // 한 번에 여러 레벨을 건너뛴 경우까지 커버 — 그 사이 해금된 아이템 전부
  const unlockedItems: PigItemId[] = PIG_LEVELS.filter(
    (l) => l.level > fromLevel && l.level <= toLevel,
  ).flatMap((l) => l.unlocks);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-white/95 px-6">
      {/* 콘페티 */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            className="animate-confetti-fall absolute top-[-24px] block h-2.5 w-2.5 rounded-[2px]"
            style={{
              left: `${(i * 53) % 100}%`,
              backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              animationDelay: `${(i % 6) * 0.25}s`,
              animationDuration: `${2.2 + (i % 4) * 0.4}s`,
            }}
          />
        ))}
      </div>

      {/* 이전 단계 → 새 단계 크로스페이드 */}
      <div className="relative h-40 w-40">
        <div className="animate-levelup-out absolute inset-0 flex items-center justify-center">
          <UserPigAvatar level={fromLevel} size={128} />
        </div>
        <div className="animate-levelup-in absolute inset-0 flex items-center justify-center">
          <UserPigAvatar level={toLevel} size={160} />
        </div>
      </div>

      <div className="animate-levelup-text mt-6 flex flex-col items-center text-center">
        <p className="text-sm font-bold text-orange-500">LEVEL UP!</p>
        <p className="mt-1 text-2xl font-extrabold text-gray-900">
          {levelMeta.emoji} {levelMeta.name}로 성장했어요!
        </p>

        {unlockedItems.length > 0 && (
          <div className="mt-5 flex flex-col items-center gap-2 rounded-2xl bg-orange-50 px-5 py-3">
            <p className="text-xs text-gray-500">새 아이템 해금!</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {unlockedItems.map((item) => (
                <div key={item} className="flex flex-col items-center gap-0.5">
                  <PigItemIcon item={item} size={40} />
                  <p className="text-[10px] font-bold text-gray-700">
                    {PIG_ITEMS[item].name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-8 w-full max-w-xs rounded-full bg-orange-500 py-3.5 text-base font-bold text-white"
        >
          꿀꿀! 좋았어
        </button>
      </div>
    </div>
  );
}
