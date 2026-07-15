export type PigStage = {
  label: string;
  emoji: string;
  minTemp: number;
  emojiSizeClass: string;
  detailSizeClass: string;
};

// 신규 가게는 pig_temperature 36.5(돼지)에서 시작해 리뷰가 쌓일수록 온도가 오른다.
const STAGES: PigStage[] = [
  { label: "아기돼지", emoji: "🐽", minTemp: 0, emojiSizeClass: "text-sm", detailSizeClass: "text-4xl" },
  { label: "돼지", emoji: "🐷", minTemp: 36.5, emojiSizeClass: "text-base", detailSizeClass: "text-5xl" },
  { label: "통통돼지", emoji: "🐖", minTemp: 37.5, emojiSizeClass: "text-lg", detailSizeClass: "text-6xl" },
  { label: "리본돼지", emoji: "🎀🐷", minTemp: 38.5, emojiSizeClass: "text-xl", detailSizeClass: "text-7xl" },
  { label: "꽃돼지", emoji: "🌸🐷", minTemp: 39.5, emojiSizeClass: "text-2xl", detailSizeClass: "text-8xl" },
  { label: "황금돼지", emoji: "✨🐷", minTemp: 40.5, emojiSizeClass: "text-3xl", detailSizeClass: "text-9xl" },
];

export function getPigStage(temperature: number): PigStage {
  let current = STAGES[0];
  for (const stage of STAGES) {
    if (temperature >= stage.minTemp) current = stage;
  }
  return current;
}

// "리본돼지"(예전 이름: 토실토실) 이상부터 광고 자동 생성 기능이 해금된다.
export const AD_UNLOCK_TEMP = STAGES[3].minTemp;
