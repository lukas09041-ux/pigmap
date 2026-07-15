import { NextResponse } from "next/server";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createAnthropicClient } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

type Mood = "good" | "neutral" | "bad";

// 이모지 기본값: 온도 변화량 = 이모지 기본값 × (1 + specificity)
const MOOD_BASE: Record<Mood, number> = {
  good: 0.3,
  neutral: 0,
  bad: -0.3,
};

// 돼지 온도 표시 범위를 벗어나지 않도록 잡아두는 임시 하한/상한.
const MIN_TEMPERATURE = 30;
const MAX_TEMPERATURE = 42;

const ReviewAnalysis = z.object({
  sentiment: z.number().describe("전체적인 감성. -1(매우 부정)부터 1(매우 긍정)까지"),
  specificity: z
    .number()
    .describe(
      "리뷰가 얼마나 구체적인지. 0(추상적이고 뻔한 칭찬/불평)부터 1(구체적인 디테일이 담긴 경험)까지",
    ),
  mentions: z
    .array(z.string())
    .describe("리뷰에서 언급된 구체적인 대상의 짧은 한국어 태그. 예: 서비스, 친절, 양, 청결"),
});

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export async function POST(request: Request) {
  if (!rateLimit(`temperature:${getClientIp(request)}`, 20)) {
    return rateLimitResponse();
  }

  const { reviewId, storeId, content, mood } = (await request.json()) as {
    reviewId?: string;
    storeId?: string;
    content?: string | null;
    mood?: Mood;
  };

  if (!storeId || !mood || !(mood in MOOD_BASE)) {
    return NextResponse.json({ error: "storeId와 mood는 필수입니다." }, { status: 400 });
  }

  let sentiment: number | null = null;
  let specificity = 0;
  let mentions: string[] = [];

  const trimmedContent = content?.trim();
  if (trimmedContent) {
    try {
      const anthropic = createAnthropicClient();
      const response = await anthropic.messages.parse({
        model: "claude-haiku-4-5",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `다음은 착한가격업소에 대한 짧은 방문 인증 후기야. 이 리뷰의 감성과 구체성을 분석해줘.\n\n리뷰: "${trimmedContent}"`,
          },
        ],
        output_config: { format: zodOutputFormat(ReviewAnalysis) },
      });

      if (response.parsed_output) {
        sentiment = clamp(response.parsed_output.sentiment, -1, 1);
        specificity = clamp(response.parsed_output.specificity, 0, 1);
        mentions = response.parsed_output.mentions;
      }
    } catch (err) {
      // AI 분석이 실패해도(레이트리밋, 크레딧 부족 등) 이모지 신호만으로는 온도가 반영되게 한다.
      console.error("[temperature] Claude 분석 실패, specificity=0으로 폴백:", err);
    }
  }

  const delta = MOOD_BASE[mood] * (1 + specificity);

  const supabase = createClient();

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("pig_temperature")
    .eq("id", storeId)
    .single();

  if (storeError || !store) {
    return NextResponse.json({ error: "가게를 찾을 수 없습니다." }, { status: 404 });
  }

  const newTemperature = clamp(
    Number(store.pig_temperature) + delta,
    MIN_TEMPERATURE,
    MAX_TEMPERATURE,
  );

  await supabase.from("stores").update({ pig_temperature: newTemperature }).eq("id", storeId);

  if (reviewId) {
    await supabase.from("reviews").update({ sentiment, specificity, mentions }).eq("id", reviewId);
  }

  return NextResponse.json({
    delta,
    previousTemperature: Number(store.pig_temperature),
    newTemperature,
    analysis: { sentiment, specificity, mentions },
  });
}
