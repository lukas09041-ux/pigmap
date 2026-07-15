// 유저 돼지 성장 시스템 "내 꿀꿀이"의 레벨/아이템 정의.
//
// 시각 언어 구분 원칙:
//   가게 돼지(pig-stage.ts) = 살집(온도). 홀쭉 ↔ 토실토실, 몸 부피가 변한다. "손님들이 찌워준 돼지."
//   내 돼지(이 파일)        = 나이와 장비(레벨). 아기 → 어른으로 자라고 아이템으로 꾸민다. 몸집은 그대로.
//
// 레벨 카운트는 "서로 다른 가게" 인증 수 기준 — 같은 가게 재인증은 온도에만 반영되고
// 레벨엔 카운트되지 않는다(도배 방지, DB 트리거에서 처리). 레벨업하려면 새 가게를 개척해야 한다.

export type PigItemId =
  | "ribbon"
  | "scarf"
  | "napkin"
  | "hat_cap"
  | "hat_beret"
  | "hat_straw"
  | "sunglasses"
  | "backpack"
  | "chef_outfit"
  | "golden_fork"
  | "crown"
  | "sparkle";

export type PigLevel = {
  level: number;
  minCerts: number;
  name: string;
  emoji: string;
  description: string;
  unlocks: PigItemId[];
};

export const PIG_LEVELS: PigLevel[] = [
  { level: 0, minCerts: 0, name: "예비 꿀꿀이", emoji: "🌱", description: "아직 잠만 자는 돼지", unlocks: [] },
  { level: 1, minCerts: 1, name: "꼬물이", emoji: "🐷", description: "눈 감은 아기돼지", unlocks: ["ribbon"] },
  { level: 2, minCerts: 3, name: "쫑긋이", emoji: "🐽", description: "귀가 쫑긋 선 꼬마돼지", unlocks: ["scarf"] },
  { level: 3, minCerts: 10, name: "동네 미식가", emoji: "🍴", description: "포크 든 청소년돼지", unlocks: ["napkin", "hat_cap", "hat_beret", "hat_straw"] },
  { level: 4, minCerts: 20, name: "골목 탐험가", emoji: "🗺", description: "지도 든 어른돼지", unlocks: ["sunglasses", "backpack"] },
  { level: 5, minCerts: 50, name: "꿀꿀 셰프", emoji: "👨‍🍳", description: "셰프 모자 돼지", unlocks: ["chef_outfit", "golden_fork"] },
  { level: 6, minCerts: 100, name: "전설의 황금돼지", emoji: "👑", description: "금빛 돼지", unlocks: ["crown", "sparkle"] },
];

export const PIG_ITEMS: Record<
  PigItemId,
  { name: string; unlockLevel: number; unlockCerts: number }
> = {
  ribbon: { name: "기본 리본", unlockLevel: 1, unlockCerts: 1 },
  scarf: { name: "알록달록 목도리", unlockLevel: 2, unlockCerts: 3 },
  napkin: { name: "냅킨 두건", unlockLevel: 3, unlockCerts: 10 },
  hat_cap: { name: "캡모자", unlockLevel: 3, unlockCerts: 10 },
  hat_beret: { name: "베레모", unlockLevel: 3, unlockCerts: 10 },
  hat_straw: { name: "밀짚모자", unlockLevel: 3, unlockCerts: 10 },
  sunglasses: { name: "선글라스", unlockLevel: 4, unlockCerts: 20 },
  backpack: { name: "배낭", unlockLevel: 4, unlockCerts: 20 },
  chef_outfit: { name: "셰프복", unlockLevel: 5, unlockCerts: 50 },
  golden_fork: { name: "황금 포크", unlockLevel: 5, unlockCerts: 50 },
  crown: { name: "왕관", unlockLevel: 6, unlockCerts: 100 },
  sparkle: { name: "반짝이 이펙트", unlockLevel: 6, unlockCerts: 100 },
};

export const PIG_ITEM_IDS = Object.keys(PIG_ITEMS) as PigItemId[];

export function getPigLevel(certCount: number): PigLevel {
  let current = PIG_LEVELS[0];
  for (const l of PIG_LEVELS) {
    if (certCount >= l.minCerts) current = l;
  }
  return current;
}

export function getNextPigLevel(certCount: number): PigLevel | null {
  return PIG_LEVELS.find((l) => l.minCerts > certCount) ?? null;
}

// ── 에셋 교체 포인트 ─────────────────────────────────────────────
// 나중에 실제 이미지 파일로 교체하려면 아래에 경로만 넣으면 된다.
// (예: "/pig/body-lv2.png") — 경로가 null이면 코드로 그린 SVG placeholder를 렌더링한다.
// 이미지는 정사각형·투명 배경 기준이며 레이어 순서는 몸통 → 아이템 순으로 겹쳐진다.
export const PIG_BODY_ASSETS: Record<number, string | null> = {
  0: null,
  1: null,
  2: null,
  3: null,
  4: null,
  5: null,
  6: null,
};

export const PIG_ITEM_ASSETS: Record<PigItemId, string | null> = {
  ribbon: null,
  scarf: null,
  napkin: null,
  hat_cap: null,
  hat_beret: null,
  hat_straw: null,
  sunglasses: null,
  backpack: null,
  chef_outfit: null,
  golden_fork: null,
  crown: null,
  sparkle: null,
};

// 유저 돼지 기본 색 — 가게 돼지(코랄핑크)와 구별되는 살구톤. 커스텀 색 지원용 파라미터.
export const USER_PIG_DEFAULT_COLOR = "#FFC98B";
